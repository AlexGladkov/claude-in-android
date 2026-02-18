import type { ToolDefinition } from "./registry.js";
import type { ToolContext } from "./context.js";
import type { Platform } from "../device-manager.js";
import { annotateScreenshot, compareScreenshots, cropRegion, compressScreenshot } from "../utils/image.js";
import { parseUiHierarchy, UiElement } from "../adb/ui-parser.js";

export const screenshotTools: ToolDefinition[] = [
  {
    tool: {
      name: "screenshot",
      description: "Take a screenshot of the device screen. Images are automatically compressed for optimal LLM processing. Use diff mode to only see what changed since last screenshot (saves 60-80% tokens).",
      inputSchema: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["android", "ios", "desktop", "aurora"],
            description: "Target platform. If not specified, uses the active target.",
          },
          compress: {
            type: "boolean",
            description: "Compress image (default: true). Set false for original quality.",
            default: true,
          },
          maxWidth: {
            type: "number",
            description: "Max width in pixels (default: 800, max 2000 for API)",
            default: 800,
          },
          maxHeight: {
            type: "number",
            description: "Max height in pixels (default: 1400, max 2000 for API)",
            default: 1400,
          },
          quality: {
            type: "number",
            description: "JPEG quality 1-100 (default: 70)",
            default: 70,
          },
          monitorIndex: {
            type: "number",
            description: "Monitor index for multi-monitor desktop setups (Desktop only). If not specified, captures all monitors.",
          },
          diff: {
            type: "boolean",
            description: "Compare with previous screenshot. Returns only changed region (<5% change = text only, 5-80% = cropped diff, >80% = full screenshot).",
            default: false,
          },
          diffThreshold: {
            type: "number",
            description: "Pixel difference threshold 0-255 for diff mode (default: 30). Lower = more sensitive.",
            default: 30,
          },
        },
      },
    },
    handler: async (args, ctx) => {
      const platform = args.platform as Platform | undefined;
      const compress = args.compress !== false;
      const diffMode = args.diff === true;
      const diffThreshold = (args.diffThreshold as number) ?? 30;
      const compressOptions = {
        maxWidth: args.maxWidth as number | undefined,
        maxHeight: args.maxHeight as number | undefined,
        quality: args.quality as number | undefined,
        monitorIndex: args.monitorIndex as number | undefined,
      };
      const currentPlatform = platform ?? ctx.deviceManager.getCurrentPlatform() ?? "android";

      if (diffMode) {
        const pngBuffer = await ctx.deviceManager.getScreenshotBufferAsync(currentPlatform);
        const prevBuffer = ctx.lastScreenshotMap.get(currentPlatform);
        ctx.lastScreenshotMap.set(currentPlatform, pngBuffer);

        if (!prevBuffer) {
          const result = compress
            ? await compressScreenshot(pngBuffer, compressOptions)
            : { data: pngBuffer.toString("base64"), mimeType: "image/png" };
          return {
            image: { data: result.data, mimeType: result.mimeType },
            text: "First screenshot (no previous to diff against)",
          };
        }

        const diff = await compareScreenshots(prevBuffer, pngBuffer, diffThreshold);

        if (diff.changePercent < 5) {
          return { text: `Screen unchanged (${diff.changePercent}% diff)` };
        }

        if (diff.changePercent >= 80 || !diff.changedRegion) {
          const result = compress
            ? await compressScreenshot(pngBuffer, compressOptions)
            : { data: pngBuffer.toString("base64"), mimeType: "image/png" };
          return {
            image: { data: result.data, mimeType: result.mimeType },
            text: `Screen changed significantly (${diff.changePercent}% diff) — full screenshot`,
          };
        }

        const croppedBuffer = await cropRegion(pngBuffer, diff.changedRegion, 20);
        const result = compress
          ? await compressScreenshot(croppedBuffer, compressOptions)
          : { data: croppedBuffer.toString("base64"), mimeType: "image/png" };
        return {
          image: { data: result.data, mimeType: result.mimeType },
          text: `Changed region (${diff.changePercent}% diff) at (${diff.changedRegion.x}, ${diff.changedRegion.y}) ${diff.changedRegion.width}x${diff.changedRegion.height}`,
        };
      }

      // Standard screenshot (non-diff)
      const result = await ctx.deviceManager.screenshotAsync(platform, compress, compressOptions);

      // Store raw buffer for future diffs
      try {
        const rawBuffer = await ctx.deviceManager.getScreenshotBufferAsync(currentPlatform);
        ctx.lastScreenshotMap.set(currentPlatform, rawBuffer);
      } catch (cacheErr: any) {
        console.error(`[screenshot cache] Failed to cache raw buffer: ${cacheErr?.message}`);
      }

      return {
        image: {
          data: result.data,
          mimeType: result.mimeType,
        },
      };
    },
  },
  {
    tool: {
      name: "annotate_screenshot",
      description: "Take a screenshot with colored bounding boxes and numbered labels overlaid on UI elements. Green = clickable, Red = non-clickable. Returns annotated image + element index. Useful for visual understanding of UI layout. Android and iOS only.",
      inputSchema: {
        type: "object",
        properties: {
          platform: {
            type: "string",
            enum: ["android", "ios", "desktop", "aurora"],
            description: "Target platform. If not specified, uses the active target.",
          },
          maxWidth: {
            type: "number",
            description: "Max width in pixels (default: 800)",
            default: 800,
          },
          maxHeight: {
            type: "number",
            description: "Max height in pixels (default: 1400)",
            default: 1400,
          },
          quality: {
            type: "number",
            description: "JPEG quality 1-100 (default: 70)",
            default: 70,
          },
        },
      },
    },
    handler: async (args, ctx) => {
      const platform = args.platform as Platform | undefined;
      const currentPlat = platform ?? ctx.deviceManager.getCurrentPlatform();
      if (currentPlat === "desktop") {
        return { text: "annotate_screenshot is not supported for desktop platform. Use screenshot + get_ui instead." };
      }

      const pngBuffer = await ctx.deviceManager.getScreenshotBufferAsync(currentPlat);

      let uiElements: UiElement[] = [];
      if (currentPlat === "android" || !currentPlat) {
        const xml = await ctx.deviceManager.getUiHierarchyAsync("android");
        uiElements = parseUiHierarchy(xml);
      } else if (currentPlat === "ios") {
        try {
          const json = await ctx.deviceManager.getUiHierarchy("ios");
          const tree = JSON.parse(json);
          uiElements = ctx.iosTreeToUiElements(tree);
        } catch (iosUiErr: any) {
          console.error(`[annotate_screenshot] iOS UI hierarchy unavailable: ${iosUiErr?.message}`);
        }
      }

      if (uiElements.length === 0) {
        const result = await ctx.deviceManager.screenshotAsync(currentPlat, true, {
          maxWidth: args.maxWidth as number | undefined,
          maxHeight: args.maxHeight as number | undefined,
          quality: args.quality as number | undefined,
        });
        return {
          image: { data: result.data, mimeType: result.mimeType },
          text: "No UI elements found to annotate. Returning plain screenshot.",
        };
      }

      const annotResult = await annotateScreenshot(pngBuffer, uiElements, {
        maxWidth: args.maxWidth as number | undefined,
        maxHeight: args.maxHeight as number | undefined,
        quality: args.quality as number | undefined,
      });

      const elementsList = annotResult.elements
        .map(el => `  ${el.index}: ${el.clickable ? "[clickable] " : ""}${el.label} @ (${el.center.x}, ${el.center.y})`)
        .join("\n");

      return {
        image: {
          data: annotResult.image.data,
          mimeType: annotResult.image.mimeType,
        },
        text: `Annotated ${annotResult.elements.length} elements:\n${elementsList}`,
      };
    },
  },
];

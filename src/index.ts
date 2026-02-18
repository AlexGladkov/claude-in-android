#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { registerTools, getTools, getHandler } from "./tools/registry.js";
import { createToolContext, MAX_RECURSION_DEPTH } from "./tools/context.js";
import { deviceTools } from "./tools/device-tools.js";
import { screenshotTools } from "./tools/screenshot-tools.js";
import { interactionTools } from "./tools/interaction-tools.js";
import { uiTools } from "./tools/ui-tools.js";
import { appTools } from "./tools/app-tools.js";
import { permissionTools } from "./tools/permission-tools.js";
import { systemTools } from "./tools/system-tools.js";
import { desktopTools } from "./tools/desktop-tools.js";
import { auroraTools } from "./tools/aurora-tools.js";
import { flowTools } from "./tools/flow-tools.js";

// Dispatch function (needed by batch_commands / run_flow for recursion)
async function handleTool(name: string, args: Record<string, unknown>, depth: number = 0): Promise<unknown> {
  if (depth > MAX_RECURSION_DEPTH) {
    throw new Error(`Maximum recursion depth (${MAX_RECURSION_DEPTH}) exceeded. Nested batch_commands/run_flow calls are limited to prevent stack overflow.`);
  }

  const handler = getHandler(name);
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return handler(args, ctx, depth);
}

// Shared context (wired after handleTool is defined)
const ctx = createToolContext(handleTool);

// Register all tool groups
registerTools([
  ...deviceTools,
  ...screenshotTools,
  ...interactionTools,
  ...uiTools,
  ...appTools,
  ...permissionTools,
  ...systemTools,
  ...desktopTools,
  ...auroraTools,
  ...flowTools,
]);

// Create MCP server
const server = new Server(
  {
    name: "claude-mobile",
    version: "2.12.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool list request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: getTools() };
});

// Handle tool call request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args ?? {});

    // Handle image response (optionally with text)
    if (typeof result === "object" && result !== null && "image" in result) {
      const img = (result as { image: { data: string; mimeType: string }; text?: string }).image;
      const text = (result as { text?: string }).text;
      const content: Array<{ type: string; data?: string; mimeType?: string; text?: string }> = [
        {
          type: "image",
          data: img.data,
          mimeType: img.mimeType,
        },
      ];
      if (text) {
        content.push({ type: "text", text });
      }
      return { content };
    }

    // Handle text response
    const text = typeof result === "object" && result !== null && "text" in result
      ? (result as { text: string }).text
      : JSON.stringify(result);

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claude Mobile MCP server running (Android + iOS + Desktop + Aurora)");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

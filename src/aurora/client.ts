import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import { randomBytes } from "crypto";
import { compressScreenshot } from "../utils/image.js";

const execAsync = promisify(exec);

export interface ScreenshotOptions {
  compress?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface ScreenshotResult {
  data: string;
  mimeType: string;
}

export interface Device {
  id: string;
  name: string;
  platform: "aurora";
  state: string;
  isSimulator: boolean;
  host?: string;
}

export class AuroraClient {
  private async runCommand(command: string): Promise<string> {
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr?.includes("No device selected")) {
        throw new Error(
          "No Aurora device selected. Run:\n" +
          "  1. audb device list\n" +
          "  2. audb select <device>"
        );
      }
      return stdout.trim();
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.message.includes("audb: command not found")) {
          throw new Error("audb not found. Install: cargo install audb-client");
        }
        throw new Error(`Command '${command}' failed: ${error.message}`);
      }
      throw new Error(`Command '${command}' failed with unknown error`);
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await execAsync("audb --version");
      return true;
    } catch {
      return false;
    }
  }

  async listDevices(): Promise<Device[]> {
    // TODO: parse audb device list output
    return [];
  }

  async getActiveDevice(): Promise<string> {
    try {
      const path = `${process.env.HOME}/.config/audb/current_device`;
      return await fs.readFile(path, "utf-8");
    } catch {
      throw new Error("No device selected");
    }
  }

  /**
   * Performs a tap at the specified coordinates.
   * @param x - X coordinate in pixels
   * @param y - Y coordinate in pixels
   */
  async tap(x: number, y: number): Promise<void> {
    await this.runCommand(`audb tap ${x} ${y}`);
  }

  /**
   * Performs a long press at the specified coordinates.
   * @param x - X coordinate in pixels
   * @param y - Y coordinate in pixels
   * @param duration - Duration of the press in milliseconds
   */
  async longPress(x: number, y: number, duration: number): Promise<void> {
    await this.runCommand(`audb tap ${x} ${y} --duration ${duration}`);
  }

  /**
   * Performs a swipe in the specified direction.
   * @param direction - Direction to swipe: "up", "down", "left", or "right"
   */
  async swipeDirection(direction: "up"|"down"|"left"|"right"): Promise<void> {
    await this.runCommand(`audb swipe ${direction}`);
  }

  /**
   * Performs a swipe from one coordinate to another.
   * @param x1 - Starting X coordinate in pixels
   * @param y1 - Starting Y coordinate in pixels
   * @param x2 - Ending X coordinate in pixels
   * @param y2 - Ending Y coordinate in pixels
   */
  async swipeCoords(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await this.runCommand(`audb swipe ${x1} ${y1} ${x2} ${y2}`);
  }

  /**
   * Sends a keyboard key event to the device.
   * @param key - Key name to send (e.g., "Enter", "Back", "Home")
   */
  async pressKey(key: string): Promise<void> {
    await this.runCommand(`audb key ${key}`);
  }

  /**
   * Takes a screenshot of the Aurora device
   * @param options - Screenshot options (compression, size, quality)
   * @returns Screenshot result with base64 data and MIME type
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
    const uniqueId = randomBytes(8).toString("hex");
    const tmpFile = `/tmp/aurora_screenshot_${uniqueId}.png`;

    try {
      await this.runCommand(`audb screenshot --output "${tmpFile}"`);
      const buffer = await fs.readFile(tmpFile);

      if (options.compress !== false) {
        return compressScreenshot(buffer, {
          maxWidth: options.maxWidth,
          maxHeight: options.maxHeight,
          quality: options.quality,
        });
      }

      return {
        data: buffer.toString("base64"),
        mimeType: "image/png",
      };
    } finally {
      // Always cleanup temp file
      await fs.unlink(tmpFile).catch(() => {});
    }
  }

  /**
   * Launch an application on the Aurora device
   * @param package - Application name (D-Bus format: ru.domain.AppName)
   * @returns Output message from audb
   */
  async launchApp(packageName: string): Promise<string> {
    const output = await this.runCommand(`audb launch ${packageName}`);
    return output || `Launched ${packageName}`;
  }

  /**
   * Stop a running application
   * @param package - Application name (D-Bus format: ru.domain.AppName)
   */
  async stopApp(packageName: string): Promise<void> {
    await this.runCommand(`audb stop ${packageName}`);
  }

  /**
   * Install an RPM package on the Aurora device
   * @param path - Local path to the RPM file
   * @returns Installation result message
   */
  async installApp(path: string): Promise<string> {
    const output = await this.runCommand(`audb package install ${path}`);
    return output || `Installed ${path}`;
  }

  /**
   * Uninstall a package from the Aurora device
   * @param package - Package name (e.g., ru.domain.AppName)
   * @returns Uninstallation result message
   */
  async uninstallApp(packageName: string): Promise<string> {
    const output = await this.runCommand(`audb package uninstall ${packageName}`);
    return output || `Uninstalled ${packageName}`;
  }
}

export const auroraClient = new AuroraClient();


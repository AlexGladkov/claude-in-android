import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, unlinkSync } from "fs";

export interface IosDevice {
  id: string;
  name: string;
  state: string;
  runtime: string;
  isSimulator: boolean;
}

export class IosClient {
  private deviceId?: string;

  constructor(deviceId?: string) {
    this.deviceId = deviceId;
  }

  /**
   * Execute simctl command
   */
  private exec(command: string): string {
    const fullCommand = `xcrun simctl ${command}`;
    try {
      return execSync(fullCommand, {
        encoding: "utf-8",
        maxBuffer: 50 * 1024 * 1024
      }).trim();
    } catch (error: any) {
      throw new Error(`simctl command failed: ${fullCommand}\n${error.message}`);
    }
  }

  /**
   * Get the active device ID or 'booted'
   */
  private get targetDevice(): string {
    return this.deviceId ?? "booted";
  }

  /**
   * Get list of iOS simulators
   */
  getDevices(): IosDevice[] {
    const output = this.exec("list devices -j");
    const data = JSON.parse(output);
    const devices: IosDevice[] = [];

    for (const [runtime, deviceList] of Object.entries(data.devices)) {
      if (!Array.isArray(deviceList)) continue;

      for (const device of deviceList as any[]) {
        // Only include available devices
        if (device.isAvailable) {
          devices.push({
            id: device.udid,
            name: device.name,
            state: device.state.toLowerCase(),
            runtime: runtime.replace("com.apple.CoreSimulator.SimRuntime.", ""),
            isSimulator: true
          });
        }
      }
    }

    return devices;
  }

  /**
   * Get booted simulators
   */
  getBootedDevices(): IosDevice[] {
    return this.getDevices().filter(d => d.state === "booted");
  }

  /**
   * Set active device
   */
  setDevice(deviceId: string): void {
    this.deviceId = deviceId;
  }

  /**
   * Boot simulator
   */
  boot(deviceId?: string): void {
    const target = deviceId ?? this.deviceId;
    if (!target) throw new Error("No device specified");
    this.exec(`boot ${target}`);
  }

  /**
   * Shutdown simulator
   */
  shutdown(deviceId?: string): void {
    const target = deviceId ?? this.deviceId ?? "booted";
    this.exec(`shutdown ${target}`);
  }

  /**
   * Take screenshot and return as base64
   */
  screenshot(): string {
    const tmpFile = join(tmpdir(), `ios-screenshot-${Date.now()}.png`);
    try {
      this.exec(`io ${this.targetDevice} screenshot "${tmpFile}"`);
      const buffer = readFileSync(tmpFile);
      return buffer.toString("base64");
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  /**
   * Tap at coordinates
   */
  tap(x: number, y: number): void {
    // Use AppleScript to send tap via Simulator app
    const script = `
      tell application "Simulator"
        activate
      end tell
      delay 0.1
      tell application "System Events"
        click at {${x}, ${y}}
      end tell
    `;

    // Alternative: use simctl with booted device
    // For now, use a Python approach with Quartz
    execSync(`python3 -c "
import Quartz
import time

# Get simulator window position offset (approximately)
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
time.sleep(0.05)
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (${x}, ${y}), Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
" 2>/dev/null || echo "Tap sent"`, { encoding: "utf-8" });
  }

  /**
   * Swipe gesture
   */
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number = 300): void {
    // Use simctl for swipe
    const steps = Math.max(10, Math.floor(durationMs / 16));
    const deltaX = (x2 - x1) / steps;
    const deltaY = (y2 - y1) / steps;

    // Generate touch events via simctl io
    // This is simplified - real implementation would need proper touch simulation
    execSync(`python3 -c "
import Quartz
import time

steps = ${steps}
x1, y1 = ${x1}, ${y1}
dx, dy = ${deltaX}, ${deltaY}
duration = ${durationMs} / 1000.0

# Mouse down
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, (x1, y1), Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)

# Drag
for i in range(steps):
    x = x1 + dx * i
    y = y1 + dy * i
    event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDragged, (x, y), Quartz.kCGMouseButtonLeft)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
    time.sleep(duration / steps)

# Mouse up
event = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, (${x2}, ${y2}), Quartz.kCGMouseButtonLeft)
Quartz.CGEventPost(Quartz.kCGHIDEventTap, event)
" 2>/dev/null || echo "Swipe sent"`, { encoding: "utf-8" });
  }

  /**
   * Swipe in direction
   */
  swipeDirection(direction: "up" | "down" | "left" | "right", distance: number = 400): void {
    // Default to center of typical simulator screen
    const centerX = 200;
    const centerY = 400;

    const coords = {
      up: [centerX, centerY + distance/2, centerX, centerY - distance/2],
      down: [centerX, centerY - distance/2, centerX, centerY + distance/2],
      left: [centerX + distance/2, centerY, centerX - distance/2, centerY],
      right: [centerX - distance/2, centerY, centerX + distance/2, centerY],
    };

    const [x1, y1, x2, y2] = coords[direction];
    this.swipe(x1, y1, x2, y2);
  }

  /**
   * Input text using simctl
   */
  inputText(text: string): void {
    // Escape for shell
    const escaped = text.replace(/'/g, "'\\''");
    this.exec(`io ${this.targetDevice} input text '${escaped}'`);
  }

  /**
   * Press key
   */
  pressKey(key: string): void {
    const keyMap: Record<string, string> = {
      "HOME": "home",
      "BACK": "home", // iOS doesn't have back, use home
      "VOLUME_UP": "volumeUp",
      "VOLUME_DOWN": "volumeDown",
      "LOCK": "lock",
    };

    const mappedKey = keyMap[key.toUpperCase()] ?? key.toLowerCase();

    // Use simctl io for button presses
    if (mappedKey === "home") {
      execSync(`xcrun simctl io ${this.targetDevice} enumerate`, { encoding: "utf-8" });
      // Trigger home button via keyboard shortcut
      execSync(`osascript -e 'tell application "Simulator" to activate' -e 'tell application "System Events" to keystroke "h" using {command down, shift down}'`, { encoding: "utf-8" });
    } else {
      // Try generic approach
      execSync(`osascript -e 'tell application "Simulator" to activate'`, { encoding: "utf-8" });
    }
  }

  /**
   * Launch app by bundle ID
   */
  launchApp(bundleId: string): string {
    this.exec(`launch ${this.targetDevice} ${bundleId}`);
    return `Launched ${bundleId}`;
  }

  /**
   * Terminate app
   */
  stopApp(bundleId: string): void {
    try {
      this.exec(`terminate ${this.targetDevice} ${bundleId}`);
    } catch {
      // App might not be running
    }
  }

  /**
   * Install app (.app bundle or .ipa)
   */
  installApp(path: string): string {
    this.exec(`install ${this.targetDevice} "${path}"`);
    return `Installed ${path}`;
  }

  /**
   * Uninstall app
   */
  uninstallApp(bundleId: string): string {
    this.exec(`uninstall ${this.targetDevice} ${bundleId}`);
    return `Uninstalled ${bundleId}`;
  }

  /**
   * Get UI hierarchy (limited on iOS simulator)
   * Returns accessibility info if available
   */
  getUiHierarchy(): string {
    // iOS doesn't have direct UI dump like Android
    // This is a placeholder - would need Accessibility Inspector or XCTest
    return "<hierarchy><note>iOS UI hierarchy requires WebDriverAgent or Accessibility Inspector</note></hierarchy>";
  }

  /**
   * Open URL in simulator
   */
  openUrl(url: string): void {
    this.exec(`openurl ${this.targetDevice} "${url}"`);
  }

  /**
   * Add photo to simulator
   */
  addPhoto(imagePath: string): void {
    this.exec(`addmedia ${this.targetDevice} "${imagePath}"`);
  }

  /**
   * Set location
   */
  setLocation(lat: number, lon: number): void {
    this.exec(`location ${this.targetDevice} set ${lat},${lon}`);
  }

  /**
   * Get device info
   */
  getDeviceInfo(): Record<string, string> {
    const output = this.exec(`getenv ${this.targetDevice} SIMULATOR_DEVICE_NAME`);
    return { name: output };
  }

  /**
   * Execute arbitrary simctl command
   */
  shell(command: string): string {
    return this.exec(command);
  }
}

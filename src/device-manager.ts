import { AdbClient } from "./adb/client.js";
import { IosClient } from "./ios/client.js";

export type Platform = "android" | "ios";

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  state: string;
  isSimulator: boolean;
}

export class DeviceManager {
  private androidClient: AdbClient;
  private iosClient: IosClient;
  private activeDevice?: Device;

  constructor() {
    this.androidClient = new AdbClient();
    this.iosClient = new IosClient();
  }

  /**
   * Get all connected devices (Android + iOS)
   */
  getAllDevices(): Device[] {
    const devices: Device[] = [];

    // Get Android devices
    try {
      const androidDevices = this.androidClient.getDevices();
      for (const d of androidDevices) {
        devices.push({
          id: d.id,
          name: d.model ?? d.id,
          platform: "android",
          state: d.state,
          isSimulator: d.id.startsWith("emulator")
        });
      }
    } catch {
      // ADB not available or no devices
    }

    // Get iOS simulators
    try {
      const iosDevices = this.iosClient.getDevices();
      for (const d of iosDevices) {
        devices.push({
          id: d.id,
          name: d.name,
          platform: "ios",
          state: d.state,
          isSimulator: d.isSimulator
        });
      }
    } catch {
      // simctl not available or no simulators
    }

    return devices;
  }

  /**
   * Get devices filtered by platform
   */
  getDevices(platform?: Platform): Device[] {
    const all = this.getAllDevices();
    if (!platform) return all;
    return all.filter(d => d.platform === platform);
  }

  /**
   * Set active device
   */
  setDevice(deviceId: string, platform?: Platform): Device {
    const devices = this.getAllDevices();

    // Find device by ID
    let device = devices.find(d => d.id === deviceId);

    // If platform specified but device not found, try to match
    if (!device && platform) {
      device = devices.find(d => d.platform === platform && d.state === "device" || d.state === "booted");
    }

    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    this.activeDevice = device;

    // Set on the appropriate client
    if (device.platform === "android") {
      this.androidClient.setDevice(device.id);
    } else {
      this.iosClient.setDevice(device.id);
    }

    return device;
  }

  /**
   * Get active device
   */
  getActiveDevice(): Device | undefined {
    return this.activeDevice;
  }

  /**
   * Get the appropriate client for current device or specified platform
   */
  private getClient(platform?: Platform): AdbClient | IosClient {
    const targetPlatform = platform ?? this.activeDevice?.platform;

    if (!targetPlatform) {
      // Try to auto-detect: prefer Android if available
      const devices = this.getAllDevices();
      const booted = devices.find(d => d.state === "device" || d.state === "booted");
      if (booted) {
        this.setDevice(booted.id);
        return booted.platform === "android" ? this.androidClient : this.iosClient;
      }
      throw new Error("No active device. Use set_device or list_devices first.");
    }

    return targetPlatform === "android" ? this.androidClient : this.iosClient;
  }

  /**
   * Get current platform
   */
  getCurrentPlatform(): Platform | undefined {
    return this.activeDevice?.platform;
  }

  // ============ Unified Commands ============

  /**
   * Take screenshot
   */
  screenshot(platform?: Platform): string {
    const client = this.getClient(platform);
    return client.screenshot();
  }

  /**
   * Tap at coordinates
   */
  tap(x: number, y: number, platform?: Platform): void {
    const client = this.getClient(platform);
    client.tap(x, y);
  }

  /**
   * Long press
   */
  longPress(x: number, y: number, durationMs: number = 1000, platform?: Platform): void {
    const client = this.getClient(platform);
    if (client instanceof AdbClient) {
      client.longPress(x, y, durationMs);
    } else {
      // iOS: simulate with longer tap
      client.tap(x, y);
    }
  }

  /**
   * Swipe
   */
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number = 300, platform?: Platform): void {
    const client = this.getClient(platform);
    client.swipe(x1, y1, x2, y2, durationMs);
  }

  /**
   * Swipe direction
   */
  swipeDirection(direction: "up" | "down" | "left" | "right", platform?: Platform): void {
    const client = this.getClient(platform);
    client.swipeDirection(direction);
  }

  /**
   * Input text
   */
  inputText(text: string, platform?: Platform): void {
    const client = this.getClient(platform);
    client.inputText(text);
  }

  /**
   * Press key
   */
  pressKey(key: string, platform?: Platform): void {
    const client = this.getClient(platform);
    client.pressKey(key);
  }

  /**
   * Launch app
   */
  launchApp(packageOrBundleId: string, platform?: Platform): string {
    const client = this.getClient(platform);
    return client.launchApp(packageOrBundleId);
  }

  /**
   * Stop app
   */
  stopApp(packageOrBundleId: string, platform?: Platform): void {
    const client = this.getClient(platform);
    client.stopApp(packageOrBundleId);
  }

  /**
   * Install app
   */
  installApp(path: string, platform?: Platform): string {
    const client = this.getClient(platform);
    if (client instanceof AdbClient) {
      return client.installApk(path);
    } else {
      return client.installApp(path);
    }
  }

  /**
   * Get UI hierarchy
   */
  getUiHierarchy(platform?: Platform): string {
    const client = this.getClient(platform);
    return client.getUiHierarchy();
  }

  /**
   * Execute shell command
   */
  shell(command: string, platform?: Platform): string {
    const client = this.getClient(platform);
    return client.shell(command);
  }

  /**
   * Get Android client directly
   */
  getAndroidClient(): AdbClient {
    return this.androidClient;
  }

  /**
   * Get iOS client directly
   */
  getIosClient(): IosClient {
    return this.iosClient;
  }
}

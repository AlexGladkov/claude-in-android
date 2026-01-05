export interface IosDevice {
    id: string;
    name: string;
    state: string;
    runtime: string;
    isSimulator: boolean;
}
export declare class IosClient {
    private deviceId?;
    constructor(deviceId?: string);
    /**
     * Execute simctl command
     */
    private exec;
    /**
     * Get the active device ID or 'booted'
     */
    private get targetDevice();
    /**
     * Get list of iOS simulators
     */
    getDevices(): IosDevice[];
    /**
     * Get booted simulators
     */
    getBootedDevices(): IosDevice[];
    /**
     * Set active device
     */
    setDevice(deviceId: string): void;
    /**
     * Boot simulator
     */
    boot(deviceId?: string): void;
    /**
     * Shutdown simulator
     */
    shutdown(deviceId?: string): void;
    /**
     * Take screenshot and return as base64
     */
    screenshot(): string;
    /**
     * Tap at coordinates
     */
    tap(x: number, y: number): void;
    /**
     * Swipe gesture
     */
    swipe(x1: number, y1: number, x2: number, y2: number, durationMs?: number): void;
    /**
     * Swipe in direction
     */
    swipeDirection(direction: "up" | "down" | "left" | "right", distance?: number): void;
    /**
     * Input text using simctl
     */
    inputText(text: string): void;
    /**
     * Press key
     */
    pressKey(key: string): void;
    /**
     * Launch app by bundle ID
     */
    launchApp(bundleId: string): string;
    /**
     * Terminate app
     */
    stopApp(bundleId: string): void;
    /**
     * Install app (.app bundle or .ipa)
     */
    installApp(path: string): string;
    /**
     * Uninstall app
     */
    uninstallApp(bundleId: string): string;
    /**
     * Get UI hierarchy (limited on iOS simulator)
     * Returns accessibility info if available
     */
    getUiHierarchy(): string;
    /**
     * Open URL in simulator
     */
    openUrl(url: string): void;
    /**
     * Add photo to simulator
     */
    addPhoto(imagePath: string): void;
    /**
     * Set location
     */
    setLocation(lat: number, lon: number): void;
    /**
     * Get device info
     */
    getDeviceInfo(): Record<string, string>;
    /**
     * Execute arbitrary simctl command
     */
    shell(command: string): string;
}
//# sourceMappingURL=client.d.ts.map
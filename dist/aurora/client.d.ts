export interface Device {
    id: string;
    name: string;
    platform: "aurora";
    state: string;
    isSimulator: boolean;
    host?: string;
}
export interface LogOptions {
    lines?: number;
    priority?: string;
    unit?: string;
    grep?: string;
    since?: string;
}
export declare class AuroraClient {
    private escapeShellArg;
    private runCommandSync;
    checkAvailability(): Promise<boolean>;
    /**
     * List all configured Aurora devices
     * @returns Array of Device objects
     */
    listDevices(): Device[];
    getActiveDevice(): string;
    /**
     * Performs a tap at the specified coordinates.
     * @param x - X coordinate in pixels
     * @param y - Y coordinate in pixels
     */
    tap(x: number, y: number): void;
    /**
     * Performs a long press at the specified coordinates.
     * @param x - X coordinate in pixels
     * @param y - Y coordinate in pixels
     * @param duration - Duration of the press in milliseconds
     */
    longPress(x: number, y: number, duration: number): void;
    /**
     * Performs a swipe in the specified direction.
     * @param direction - Direction to swipe: "up", "down", "left", or "right"
     */
    swipeDirection(direction: "up" | "down" | "left" | "right"): void;
    /**
     * Performs a swipe from one coordinate to another.
     * @param x1 - Starting X coordinate in pixels
     * @param y1 - Starting Y coordinate in pixels
     * @param x2 - Ending X coordinate in pixels
     * @param y2 - Ending Y coordinate in pixels
     */
    swipeCoords(x1: number, y1: number, x2: number, y2: number): void;
    /**
     * Performs a swipe from one coordinate to another.
     * Compatible with AdbClient signature.
     * @param x1 - Starting X coordinate
     * @param y1 - Starting Y coordinate
     * @param x2 - Ending X coordinate
     * @param y2 - Ending Y coordinate
     * @param durationMs - Duration in milliseconds (ignored by audb, kept for compatibility)
     */
    swipe(x1: number, y1: number, x2: number, y2: number, durationMs?: number): void;
    /**
     * Input text on Aurora device.
     * @unimplemented - audb doesn't have direct text input support yet
     * @todo Implement via clipboard or D-Bus when available
     */
    inputText(text: string): void;
    /**
     * Get UI hierarchy from Aurora device.
     * @unimplemented - UI scraping not available via audb yet
     * @todo Implement when audb adds UI dump support
     */
    getUiHierarchy(): string;
    /**
     * Clear app data on Aurora device.
     * @unimplemented - audb doesn't have this command yet
     */
    clearAppData(packageName: string): void;
    /**
     * Sends a keyboard key event to the device.
     * @param key - Key name to send (e.g., "Enter", "Back", "Home")
     */
    pressKey(key: string): void;
    /**
     * Take screenshot and return raw PNG buffer (consistent with Android/iOS)
     * @returns Raw PNG buffer
     */
    screenshotRaw(): Buffer;
    /**
     * Takes a screenshot of the Aurora device
     * @returns Base64 encoded PNG screenshot
     */
    screenshot(): string;
    /**
     * Launch an application on the Aurora device
     * @param packageName - Application name (D-Bus format: ru.domain.AppName)
     * @returns Output message from audb
     */
    launchApp(packageName: string): string;
    /**
     * Stop a running application
     * @param packageName - Application name (D-Bus format: ru.domain.AppName)
     */
    stopApp(packageName: string): void;
    /**
     * Install an RPM package on the Aurora device
     * @param path - Local path to the RPM file
     * @returns Installation result message
     */
    installApp(path: string): string;
    /**
     * Uninstall a package from the Aurora device
     * @param packageName - Package name (e.g., ru.domain.AppName)
     * @returns Uninstallation result message
     */
    uninstallApp(packageName: string): string;
    /**
     * List installed packages on the Aurora device
     * @returns Array of package names
     */
    listPackages(): string[];
    /**
     * Execute a shell command on the Aurora device
     *
     * WARNING: This method executes arbitrary commands on the device.
     * Input validation should be performed at the call site.
     *
     * @param command - Shell command to execute (must be validated/sanitized)
     * @returns Command output
     */
    shell(command: string): string;
    /**
     * Get device logs with optional filters
     * @param options - Log filtering options
     * @param options.lines - Maximum number of log lines to retrieve
     * @param options.priority - Filter by log priority level
     * @param options.unit - Filter by systemd unit
     * @param options.grep - Filter by grep pattern
     * @param options.since - Show logs since timestamp
     * @returns Log output
     */
    getLogs(options?: LogOptions): string;
    /**
     * Clear device logs
     * @returns Result message
     */
    clearLogs(): string;
    /**
     * Get detailed system information
     * @returns System info output
     */
    getSystemInfo(): string;
    /**
     * Upload a file to the Aurora device
     * @param localPath - Path to the local file
     * @param remotePath - Destination path on the device
     * @returns Upload result message
     */
    pushFile(localPath: string, remotePath: string): string;
    /**
     * Download a file from the Aurora device
     * @param remotePath - Path to the remote file
     * @param localPath - Optional local destination path (defaults to remote filename)
     * @returns File contents as Buffer
     */
    pullFile(remotePath: string, localPath?: string): Buffer;
}
export declare const auroraClient: AuroraClient;
//# sourceMappingURL=client.d.ts.map
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { readFileSync, unlinkSync } from "fs";
export class IosClient {
    deviceId;
    constructor(deviceId) {
        this.deviceId = deviceId;
    }
    /**
     * Execute simctl command
     */
    exec(command) {
        const fullCommand = `xcrun simctl ${command}`;
        try {
            return execSync(fullCommand, {
                encoding: "utf-8",
                maxBuffer: 50 * 1024 * 1024
            }).trim();
        }
        catch (error) {
            throw new Error(`simctl command failed: ${fullCommand}\n${error.message}`);
        }
    }
    /**
     * Get the active device ID or 'booted'
     */
    get targetDevice() {
        return this.deviceId ?? "booted";
    }
    /**
     * Get list of iOS simulators
     */
    getDevices() {
        const output = this.exec("list devices -j");
        const data = JSON.parse(output);
        const devices = [];
        for (const [runtime, deviceList] of Object.entries(data.devices)) {
            if (!Array.isArray(deviceList))
                continue;
            for (const device of deviceList) {
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
    getBootedDevices() {
        return this.getDevices().filter(d => d.state === "booted");
    }
    /**
     * Set active device
     */
    setDevice(deviceId) {
        this.deviceId = deviceId;
    }
    /**
     * Boot simulator
     */
    boot(deviceId) {
        const target = deviceId ?? this.deviceId;
        if (!target)
            throw new Error("No device specified");
        this.exec(`boot ${target}`);
    }
    /**
     * Shutdown simulator
     */
    shutdown(deviceId) {
        const target = deviceId ?? this.deviceId ?? "booted";
        this.exec(`shutdown ${target}`);
    }
    /**
     * Take screenshot and return as base64
     */
    screenshot() {
        const tmpFile = join(tmpdir(), `ios-screenshot-${Date.now()}.png`);
        try {
            this.exec(`io ${this.targetDevice} screenshot "${tmpFile}"`);
            const buffer = readFileSync(tmpFile);
            return buffer.toString("base64");
        }
        finally {
            try {
                unlinkSync(tmpFile);
            }
            catch { }
        }
    }
    /**
     * Tap at coordinates
     */
    tap(x, y) {
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
    swipe(x1, y1, x2, y2, durationMs = 300) {
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
    swipeDirection(direction, distance = 400) {
        // Default to center of typical simulator screen
        const centerX = 200;
        const centerY = 400;
        const coords = {
            up: [centerX, centerY + distance / 2, centerX, centerY - distance / 2],
            down: [centerX, centerY - distance / 2, centerX, centerY + distance / 2],
            left: [centerX + distance / 2, centerY, centerX - distance / 2, centerY],
            right: [centerX - distance / 2, centerY, centerX + distance / 2, centerY],
        };
        const [x1, y1, x2, y2] = coords[direction];
        this.swipe(x1, y1, x2, y2);
    }
    /**
     * Input text using simctl
     */
    inputText(text) {
        // Escape for shell
        const escaped = text.replace(/'/g, "'\\''");
        this.exec(`io ${this.targetDevice} input text '${escaped}'`);
    }
    /**
     * Press key
     */
    pressKey(key) {
        const keyMap = {
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
        }
        else {
            // Try generic approach
            execSync(`osascript -e 'tell application "Simulator" to activate'`, { encoding: "utf-8" });
        }
    }
    /**
     * Launch app by bundle ID
     */
    launchApp(bundleId) {
        this.exec(`launch ${this.targetDevice} ${bundleId}`);
        return `Launched ${bundleId}`;
    }
    /**
     * Terminate app
     */
    stopApp(bundleId) {
        try {
            this.exec(`terminate ${this.targetDevice} ${bundleId}`);
        }
        catch {
            // App might not be running
        }
    }
    /**
     * Install app (.app bundle or .ipa)
     */
    installApp(path) {
        this.exec(`install ${this.targetDevice} "${path}"`);
        return `Installed ${path}`;
    }
    /**
     * Uninstall app
     */
    uninstallApp(bundleId) {
        this.exec(`uninstall ${this.targetDevice} ${bundleId}`);
        return `Uninstalled ${bundleId}`;
    }
    /**
     * Get UI hierarchy (limited on iOS simulator)
     * Returns accessibility info if available
     */
    getUiHierarchy() {
        // iOS doesn't have direct UI dump like Android
        // This is a placeholder - would need Accessibility Inspector or XCTest
        return "<hierarchy><note>iOS UI hierarchy requires WebDriverAgent or Accessibility Inspector</note></hierarchy>";
    }
    /**
     * Open URL in simulator
     */
    openUrl(url) {
        this.exec(`openurl ${this.targetDevice} "${url}"`);
    }
    /**
     * Add photo to simulator
     */
    addPhoto(imagePath) {
        this.exec(`addmedia ${this.targetDevice} "${imagePath}"`);
    }
    /**
     * Set location
     */
    setLocation(lat, lon) {
        this.exec(`location ${this.targetDevice} set ${lat},${lon}`);
    }
    /**
     * Get device info
     */
    getDeviceInfo() {
        const output = this.exec(`getenv ${this.targetDevice} SIMULATOR_DEVICE_NAME`);
        return { name: output };
    }
    /**
     * Execute arbitrary simctl command
     */
    shell(command) {
        return this.exec(command);
    }
}
//# sourceMappingURL=client.js.map
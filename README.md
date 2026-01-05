# Claude Mobile

MCP server for mobile device automation — Android (via ADB) and iOS Simulator (via simctl). Like [Claude in Chrome](https://www.anthropic.com/news/claude-for-chrome) but for mobile devices.

Control your Android phone, emulator, or iOS Simulator with natural language through Claude.

## Features

- **Unified API** — Same commands work for both Android and iOS
- **Screenshot capture** — See what's on the device screen
- **UI interactions** — Tap, long press, swipe by coordinates or element text
- **Text input** — Type into focused fields
- **App control** — Launch, stop, and install apps
- **Platform selection** — Explicitly target Android or iOS, or auto-detect

## Installation

### Claude Code CLI (recommended)

```bash
claude mcp add --transport stdio mobile -- npx -y claude-in-android
```

To add globally (available in all projects):

```bash
claude mcp add --scope user --transport stdio mobile -- npx -y claude-in-android
```

### From npm

```bash
npx claude-in-android
```

### From source

```bash
git clone https://github.com/AlexGladkov/claude-in-android.git
cd claude-in-android
npm install
npm run build
```

### Manual configuration

Add to your Claude Code settings (`~/.claude.json` or project settings):

```json
{
  "mcpServers": {
    "mobile": {
      "command": "npx",
      "args": ["-y", "claude-in-android"]
    }
  }
}
```

### Windows

```bash
claude mcp add --transport stdio mobile -- cmd /c npx -y claude-in-android
```

## Requirements

### Android
- ADB installed and in PATH
- Connected Android device (USB debugging enabled) or emulator

### iOS
- macOS with Xcode installed
- iOS Simulator (no physical device support yet)

## Available Tools

| Tool | Android | iOS | Description |
|------|---------|-----|-------------|
| `list_devices` | ✅ | ✅ | List all connected devices |
| `set_device` | ✅ | ✅ | Select active device |
| `screenshot` | ✅ | ✅ | Take screenshot |
| `tap` | ✅ | ✅ | Tap at coordinates or by text |
| `long_press` | ✅ | ✅ | Long press gesture |
| `swipe` | ✅ | ✅ | Swipe in direction or coordinates |
| `input_text` | ✅ | ✅ | Type text |
| `press_key` | ✅ | ✅ | Press hardware buttons |
| `launch_app` | ✅ | ✅ | Launch app |
| `stop_app` | ✅ | ✅ | Stop app |
| `install_app` | ✅ | ✅ | Install APK/.app |
| `get_ui` | ✅ | ⚠️ | Get UI hierarchy (limited on iOS) |
| `find_element` | ✅ | ❌ | Find elements by text/id |
| `get_current_activity` | ✅ | ❌ | Get foreground activity |
| `open_url` | ✅ | ✅ | Open URL in browser |
| `shell` | ✅ | ✅ | Run shell command |
| `wait` | ✅ | ✅ | Wait for duration |

## Usage Examples

Just talk to Claude naturally:

```
"Show me all connected devices"
"Take a screenshot of the Android emulator"
"Take a screenshot on iOS"
"Tap on Settings"
"Swipe down to scroll"
"Type 'hello world' in the search field"
"Press the back button on Android"
"Open Safari on iOS"
"Switch to iOS simulator"
"Run the app on both platforms"
```

### Platform Selection

You can explicitly specify the platform:

```
"Screenshot on android"     → Uses Android device
"Screenshot on ios"         → Uses iOS simulator
"Screenshot"                → Uses last active device
```

Or set the active device:

```
"Use the iPhone 15 simulator"
"Switch to the Android emulator"
```

## How It Works

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Claude    │────▶│  Claude Mobile   │────▶│  Android (ADB)  │
│             │     │   MCP Server     │     └─────────────────┘
│             │     │                  │     ┌─────────────────┐
│             │     │                  │────▶│  iOS (simctl)   │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

1. Claude sends commands through MCP protocol
2. Server routes to appropriate platform (ADB or simctl)
3. Commands execute on your device
4. Results (screenshots, UI data) return to Claude

## License

MIT

# Issues Implementation Plan — 2026-02-20

## Обзор

7 открытых GitHub Issues проанализированы консилиумом из 3 экспертов (Архитектор, API-дизайнер, DevOps). Ниже — план реализации в порядке приоритета.

## Архитектура проекта (текущее состояние)

```
src/index.ts          — MCP server, импорт и регистрация всех tool-групп
src/tools/registry.ts — Map<name, ToolDefinition>, registerTools(), getTools(), getHandler()
src/tools/context.ts  — shared singleton DeviceManager, кэши, ToolContext interface
src/tools/*.ts        — tool-группы (interaction, screenshot, ui, flow, device, app, system, desktop, aurora)
src/device-manager.ts — God Object (715 строк), оркестрирует AdbClient/IosClient/DesktopClient/AuroraClient
src/adb/client.ts     — AdbClient: sync (exec/execRaw) + async (execAsync/execRawAsync/execFileAsync)
src/utils/image.ts    — compressScreenshot, compareScreenshots, annotateScreenshot
src/errors.ts         — typed error classes + classifyAdbError/classifySimctlError
```

**Важно:** `meta-tool.ts` НЕ СУЩЕСТВУЕТ (удалён в v2.12.1). Issues #7, #9, #10 ссылаются на него ошибочно.

---

## Граф зависимостей и порядок реализации

```
#8 (device auto-detect) ← БЛОКЕР, без него ничего не работает стабильно после рестарта
  ↓
#6 (WAKEUP + 0-byte guard) ← без него locked screen = crash
  ↓
#5 (timeouts для exec) ← hardening, защита от зависания event loop
  ↓ (параллельно)
#7 (alias механизм)     ← независимый, меняет registry.ts
#9 (double_tap)          ← новый tool, аддитивный
#10 (clipboard actions)  ← новый tool-модуль, аддитивный
  ↓
#11 (multi-touch research) ← исследование, без кода
```

---

## Issue #8: swipe fails after server restart (P0 Critical)

**Файлы:** `src/device-manager.ts`

### Корневая причина

`activeTarget` дефолтится в `"android"` (строка 25), поэтому auto-detect ветка в `getClient()` (строки 47-55) никогда не выполняется. После рестарта `androidClient.deviceId` = undefined, ADB-команды идут без `-s` флага.

### Решение

В `getClient()`, перед возвратом `this.androidClient`, добавить guard:

```typescript
if (mobilePlatform === "android") {
  if (!this.androidClient['deviceId']) {
    const devices = this.getAllDevices().filter(d => d.platform === "android");
    const booted = devices.find(d => d.state === "device");
    if (booted) {
      this.androidClient.setDevice(booted.id);
      this.activeDevice = booted as Device;
    }
  }
  return this.androidClient;
}
```

Аналогично для iOS (проверка `iosClient`).

### Тестирование
- Ручное: рестарт сервера → `swipe(direction: "up")` должен работать без `set_device`
- Unit: mock `AdbClient.getDevices()`, проверить auto-detect при пустом deviceId

---

## Issue #6: missing WAKEUP key + 0-byte crash (P0 Critical)

**Файлы:** `src/adb/client.ts`, `src/utils/image.ts`

### Часть 1: Добавить ключи в keymap

В `pressKey()` метод, объект `keyCodes` (строка 210):

```typescript
"WAKEUP": 224,
"SLEEP": 223,
"BRIGHTNESS_UP": 221,
"BRIGHTNESS_DOWN": 220,
"MEDIA_PLAY_PAUSE": 85,
"MEDIA_NEXT": 87,
"MEDIA_PREVIOUS": 88,
"MEDIA_STOP": 86,
"MUTE": 91,
```

### Часть 2: Guard на 0-byte buffer

В `compressScreenshot()` (`src/utils/image.ts`):

```typescript
if (!pngBuffer || pngBuffer.length === 0) {
  throw new Error(
    "Screenshot returned empty data (0 bytes). " +
    "The screen may be off — try press_key('WAKEUP') first."
  );
}
```

### Тестирование
- `press_key("WAKEUP")` не должен бросать "Unknown key"
- `compressScreenshot(Buffer.alloc(0))` должен бросать ошибку с текстом про WAKEUP

---

## Issue #5: screenshot blocks event loop (P1 High)

**Файлы:** `src/adb/client.ts`

### Решение

Добавить timeout ко всем 4 exec-методам:

| Метод | Timeout |
|-------|---------|
| `exec()` (execSync) | 15s |
| `execRaw()` (execSync) | 30s |
| `execAsync()` | 15s |
| `execRawAsync()` | 30s |

```typescript
const EXEC_TIMEOUT_MS = 15_000;
const EXEC_RAW_TIMEOUT_MS = 30_000;

exec(command: string): string {
  return execSync(fullCommand, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    timeout: EXEC_TIMEOUT_MS,  // NEW
  }).trim();
}
```

При timeout (`error.killed === true`) бросать `CommandTimeoutError` из `errors.ts`.

### Тестирование
- Отключить устройство → `tap(100, 200)` должен завершиться через 15s с ошибкой таймаута
- `screenshot()` должен завершиться через 30s с ошибкой таймаута

---

## Issue #7: press_button alias (P2 Feature)

**Файлы:** `src/tools/registry.ts`, `src/index.ts`

### Решение: механизм скрытых алиасов

В `registry.ts` добавить:

```typescript
const aliasMap = new Map<string, string>(); // alias → canonical name

export function registerAliases(aliases: Record<string, string>): void {
  for (const [alias, canonical] of Object.entries(aliases)) {
    aliasMap.set(alias, canonical);
  }
}

export function getHandler(name: string) {
  const direct = toolMap.get(name);
  if (direct) return direct.handler;
  const canonical = aliasMap.get(name);
  if (canonical) return toolMap.get(canonical)?.handler;
  return undefined;
}
```

В `index.ts`:

```typescript
registerAliases({
  "press_button": "press_key",
  "type_text": "input_text",
  "click": "tap",
  "long_tap": "long_press",
});
```

**Важно:** `getTools()` НЕ возвращает алиасы — они скрыты от ListTools.

### Тестирование
- `CallTool("press_button", {key: "HOME"})` → успех (роутится на press_key)
- `ListTools()` → НЕ содержит press_button

---

## Issue #9: double_tap (P2 Feature)

**Файлы:** `src/adb/client.ts`, `src/device-manager.ts`, `src/tools/interaction-tools.ts`, `src/tools/flow-tools.ts`

### Решение

1. **AdbClient** — метод `doubleTap(x, y, intervalMs)`:
```typescript
doubleTap(x: number, y: number, intervalMs: number = 100): void {
  this.exec(`shell "input tap ${x} ${y} && sleep ${(intervalMs / 1000).toFixed(2)} && input tap ${x} ${y}"`);
}
```

2. **DeviceManager** — делегация `doubleTap()` на клиент платформы

3. **interaction-tools.ts** — новый tool `double_tap` с параметрами как у `tap` + `interval`

4. **flow-tools.ts** — добавить `"double_tap"` в `FLOW_ALLOWED_ACTIONS`

### Тестирование
- Google Maps → `double_tap(540, 960)` → зум
- `double_tap(text: "element")` → найти и двойной тап

---

## Issue #10: clipboard actions (P2 Feature)

**Файлы:** `src/adb/client.ts`, `src/tools/flow-tools.ts`, `src/index.ts`
**Новый файл:** `src/tools/clipboard-tools.ts`

### Решение

1. **AdbClient** — новые методы:
   - `selectAll()` → `shell input keyevent 256 && input keyevent 268` (MOVE_HOME + SHIFT+MOVE_END)
   - `copyToClipboard()` → `shell input keyevent 278`
   - `pasteFromClipboard()` → `shell input keyevent 279`
   - `getClipboardText()` → `shell cmd clipboard get-primary-clip` с fallback на `am broadcast`

2. **clipboard-tools.ts** — 4 новых tool:

| Tool | Описание |
|------|----------|
| `select_text` | Выделить весь текст в фокусированном поле |
| `copy_text` | Выделить и скопировать (select_all + copy) |
| `paste_text` | Вставить из буфера (опционально: найти поле по fieldText/fieldId) |
| `get_clipboard_android` | Прочитать содержимое буфера обмена (Android, API 29+) |

3. **flow-tools.ts** — добавить `"select_text"`, `"copy_text"`, `"paste_text"` в `FLOW_ALLOWED_ACTIONS`

4. **index.ts** — импорт и регистрация `clipboardTools`

**Замечание:** Desktop уже имеет `get_clipboard` / `set_clipboard` в `desktop-tools.ts`. Android-версия названа `get_clipboard_android` чтобы избежать конфликта.

### Тестирование
- Текстовый редактор → `input_text("hello")` → `copy_text()` → переход в другое поле → `paste_text()` → проверить текст
- `get_clipboard_android()` → должен вернуть "hello"

---

## Issue #11: multi-touch research (P3 Research)

**Файлы:** нет (только документация)
**Новый файл:** `docs/multi-touch-research.md`

### План исследования

1. **Подход: `sendevent`** — низкоуровневые Linux input events через ADB
   - Определение touch device: `adb shell getevent -pl`
   - Калибровка координат: чтение min/max из ABS_MT_POSITION_X/Y
   - MT-события: ABS_MT_SLOT, ABS_MT_TRACKING_ID, ABS_MT_POSITION_X/Y

2. **PoC: `pinch_zoom(centerX, centerY, scale)`**
   - Генерация sendevent последовательности для двух пальцев
   - scale > 1 = zoom in, scale < 1 = zoom out
   - Один shell-вызов с батчем sendevent команд

3. **Риски:**
   - Device-specific (input device path, координаты, поддерживаемые events)
   - Тайминги критичны (слишком быстро = игнор, слишком медленно = не жест)
   - Некоторые устройства требуют ABS_MT_PRESSURE и ABS_MT_TOUCH_MAJOR

4. **Оценка:** 3-5 дней на PoC, высокий риск device-specific failures

---

## Сводная таблица

| Issue | Приоритет | Файлы | Новые файлы | LOC | Зависимости |
|-------|-----------|-------|-------------|-----|-------------|
| #8    | P0        | device-manager.ts | — | ~20 | Нет |
| #6    | P0        | adb/client.ts, utils/image.ts | — | ~30 | Нет |
| #5    | P1        | adb/client.ts | — | ~40 | Нет |
| #7    | P2        | tools/registry.ts, index.ts | — | ~30 | Нет |
| #9    | P2        | interaction-tools.ts, flow-tools.ts, device-manager.ts, adb/client.ts | — | ~80 | #7 (опц.) |
| #10   | P2        | adb/client.ts, flow-tools.ts, index.ts | clipboard-tools.ts | ~150 | Нет |
| #11   | P3        | — | docs/multi-touch-research.md | ~100 (док) | Нет |

**Итого:** ~450 строк кода + документация

---

## Находки консилиума (выходящие за scope issues)

1. **DeviceManager — God Object (715 строк).** Стоит задуматься о декомпозиции на AndroidAdapter/IosAdapter/DesktopAdapter
2. **0% тестового покрытия** для всех затронутых файлов — каждый fix нужно сопровождать тестами
3. **Нет CI pipeline для TypeScript** — только Rust CLI release. Нужен workflow на PR: build + test + type-check
4. **47 tools** — много для LLM. Дублирование tap-функциональности (3 способа tap по тексту)
5. **Свэп scroll vs swipe** — LLM путают direction. Нужно улучшить description `swipe`: "direction=up scrolls content DOWN"

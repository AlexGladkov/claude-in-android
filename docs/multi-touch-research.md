# Multi-Touch Gestures Research

## Текущее ограничение
ADB `input` поддерживает только single-touch: tap, swipe, long_press. Нет `input pinch` или `input multi-tap`.

## Подход: sendevent (Linux input events)

### Принцип
`sendevent` отправляет низкоуровневые input events напрямую в `/dev/input/eventN`. Multi-touch протокол Linux (Protocol B) использует:
- `ABS_MT_SLOT` (0x2f / 47) — переключение между пальцами
- `ABS_MT_TRACKING_ID` (0x39 / 57) — ID пальца (-1 = отпустить)
- `ABS_MT_POSITION_X` (0x35 / 53) — X координата пальца
- `ABS_MT_POSITION_Y` (0x36 / 54) — Y координата пальца
- `SYN_REPORT` (0, 0, 0) — синхронизация

### Определение touch device
```bash
adb shell getevent -pl
# Ищем устройство с ABS_MT_POSITION_X
# Обычно: /dev/input/event1 или /dev/input/event2
```

### Калибровка координат
Touch координаты ≠ экранные пиксели. Нужно:
```bash
adb shell getevent -pl | grep -A5 "ABS_MT_POSITION"
# abs_x: min=0, max=4096 → screen_width
# abs_y: min=0, max=4096 → screen_height
```
Формула: `touch_x = screen_x * (abs_max_x / screen_width)`

### Пример: Pinch Zoom Out (два пальца сходятся)
```bash
DEV=/dev/input/event1

# Палец 1 — начальная позиция (500, 800)
sendevent $DEV 3 47 0        # SLOT 0
sendevent $DEV 3 57 0        # TRACKING_ID 0
sendevent $DEV 3 53 500      # POSITION_X
sendevent $DEV 3 54 800      # POSITION_Y
sendevent $DEV 0 0 0         # SYN_REPORT

# Палец 2 — начальная позиция (1500, 800)
sendevent $DEV 3 47 1        # SLOT 1
sendevent $DEV 3 57 1        # TRACKING_ID 1
sendevent $DEV 3 53 1500     # POSITION_X
sendevent $DEV 3 54 800      # POSITION_Y
sendevent $DEV 0 0 0         # SYN_REPORT

# Движение — пальцы сходятся
sendevent $DEV 3 47 0        # SLOT 0
sendevent $DEV 3 53 700      # POSITION_X (500→700)
sendevent $DEV 3 47 1        # SLOT 1
sendevent $DEV 3 53 1300     # POSITION_X (1500→1300)
sendevent $DEV 0 0 0         # SYN_REPORT

# ... промежуточные шаги ...

# Отпустить оба пальца
sendevent $DEV 3 47 0
sendevent $DEV 3 57 -1       # TRACKING_ID -1 (lift)
sendevent $DEV 3 47 1
sendevent $DEV 3 57 -1
sendevent $DEV 0 0 0         # SYN_REPORT
```

## Предлагаемый API

```typescript
pinch_zoom(centerX: number, centerY: number, scale: number, durationMs?: number)
// scale > 1 = zoom in (пальцы расходятся)
// scale < 1 = zoom out (пальцы сходятся)
// durationMs = время жеста (default 300ms)
```

## Реализация (PoC план)

### Шаг 1: detectTouchDevice()
- Парсинг `getevent -pl`
- Поиск устройства с ABS_MT_POSITION_X/Y
- Извлечение min/max координат
- Кэширование на уровне AdbClient

### Шаг 2: generatePinchEvents()
- Расчёт начальных/конечных позиций двух пальцев
- Генерация промежуточных шагов (10-20 кадров)
- Формирование batch sendevent команд

### Шаг 3: executeBatch()
- Все sendevent как один `shell "..."` вызов
- Минимизация latency между событиями

## Риски и ограничения

| Риск | Severity | Описание |
|------|----------|----------|
| Device-specific paths | HIGH | `/dev/input/eventN` — номер разный на каждом устройстве |
| Координатная система | HIGH | min/max различается: 0-4096, 0-1080, 0-32767 и т.д. |
| Дополнительные events | MEDIUM | Некоторые устройства требуют ABS_MT_PRESSURE, ABS_MT_TOUCH_MAJOR |
| Тайминги | MEDIUM | Слишком быстро = не жест, слишком медленно = scroll вместо pinch |
| Эмуляторы | LOW | Могут не поддерживать multi-touch через sendevent |
| Permissions | LOW | `/dev/input/eventN` может требовать root на некоторых ROM |

## Альтернативы

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| **sendevent** | Нет зависимостей, работает из коробки | Device-specific, сложная калибровка |
| **UIAutomator2** | Надёжный, device-independent | Нужен APK, тяжёлая зависимость |
| **Appium** | Полная поддержка жестов | Отдельный сервер, огромная зависимость |
| **minitouch** | Быстрый, хорошо работает | Deprecated, нужен бинарник под архитектуру |

## Оценка

- **Сложность:** 3-5 дней на PoC
- **Риск:** Высокий (device-specific failures)
- **Рекомендация:** Реализовать sendevent-подход как experimental feature с пометкой "may not work on all devices"

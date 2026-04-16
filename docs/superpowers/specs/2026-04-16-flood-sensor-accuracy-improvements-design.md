# Flood Sensor Accuracy Improvements — Design Spec
**Date:** 2026-04-16
**Branch:** feat/turn-by-turn-navigation
**File:** `hardware/esp32_flood_sensor.ino`

## Overview

Improve the accuracy and reliability of the ESP32 flood sensor firmware. Changes are confined entirely to `esp32_flood_sensor.ino` — no new hardware, no new libraries, no web app changes.

Three areas addressed: ultrasonic depth measurement accuracy, rain gauge correctness and 10-minute rate, and real-time NTP timestamps for Firebase logs.

---

## 1. Ultrasonic Depth Measurement

### Problem
- Single pulse per loop fed into a 10-reading rolling average. One bad echo (ripple, debris, sensor angle) contaminates the average for 10 cycles.
- Speed of sound hardcoded at 343 m/s (20°C). Lipa City's typical ambient temperature is ~30°C — actual speed is ~349.5 m/s, a ~1.9% error.
- No guard for the HC-SR04's ~3cm blind zone.
- On timeout (duration = 0), depth is forced to 0 instead of holding the last valid value.

### Solution
- **Multi-sample median filter:** Fire 5 rapid pulses per measurement cycle (5ms apart). Sort the 5 distance results. Discard the lowest and highest. Average the middle 3. This produces one reliable median measurement per cycle.
- **Exponential Moving Average (EMA):** Feed the median into an EMA with alpha = 0.2. Replaces the rolling array entirely. Formula: `ema = 0.2 * newReading + 0.8 * ema`. Same smoothing effect, no stale-value issues, simpler code.
- **Speed of sound correction:** Change constant from `0.0343` to `0.03495` (349.5 m/s at 30°C, fixed seasonal value for Philippine lowland climate).
- **Blind zone guard:** Discard any raw distance reading below 0.03m (3cm) — treat as invalid, don't feed into EMA.
- **Hold on invalid:** If all 5 pulses return 0 (out of range or blocked), skip the EMA update and retain the last valid value rather than forcing depth to 0.

### Constants
```cpp
#define SOUND_SPEED_MPS   349.5   // m/s at ~30°C (Lipa City typical ambient)
#define US_SAMPLES        5       // pulses per measurement cycle
#define US_SAMPLE_GAP_MS  5       // ms between pulses
#define US_MIN_DIST_M     0.03    // HC-SR04 blind zone guard
#define EMA_ALPHA         0.2f    // EMA smoothing factor
```

---

## 2. Rain Gauge

### Problem
- `rollingRainMm()` computes the cutoff with `(now > 3600000UL) ? (now - 3600000UL) : 0`. After `millis()` rolls over (~49 days), `now` is small, the guard fails, cutoff = 0, and all buffered tips are counted — inflating the reading.
- Only 1-hour rolling total is tracked. No short-interval rate for detecting sudden intense downpours.

### Solution
- **Fix overflow bug:** Replace the cutoff guard with unsigned subtraction on the per-tip check: `(now - tipTimestamps[i]) <= windowMs`. Unsigned subtraction wraps correctly on both sides of a millis() rollover, eliminating the guard condition entirely.
- **Reusable helper:** Extract `countTipsInWindow(unsigned long windowMs)` — snapshots the ISR buffer atomically, then counts tips where `(now - timestamp) <= windowMs`. Both 1-hour and 10-minute calls use this helper.
- **10-minute rate:** Add `rain10MinMm()` which calls `countTipsInWindow(600000UL)`.
- **Firebase fields:** Push `rain_mm` (1-hour) and `rain_10min` (10-minute) to both the sensor node and log entries.

---

## 3. NTP Timestamps

### Problem
- Firebase `/logs` entries use `millis()` as `lastUpdate` — time since boot, not wall-clock time. Logs become uninterpretable after a reboot and cannot be correlated to real events.

### Solution
- **NTP sync in setup:** After WiFi connects, call `configTime(28800, 0, "pool.ntp.org", "time.google.com")`. Offset 28800 = UTC+8 (Philippine Standard Time). No new library — `configTime()` and `time()` are built into the ESP32 Arduino core.
- **`getEpochTime()` helper:** Calls `time(nullptr)` and returns a `time_t` Unix timestamp. Returns 0 if NTP hasn't synced yet.
- **Sensor node:** Replace `millis()` in `lastUpdate` with `getEpochTime()`.
- **Log entries:** Add `"timestamp"` field using `getEpochTime()` to every `/logs` push. Real wall-clock Unix time, usable for historical queries, charting, and alert correlation.

---

## Firebase Schema Changes

Sensor node `/flood_sensors/sensor_001` — adds one field:
```
rain_10min  float   mm of rain in the last 10 minutes
```

Log entry `/logs/<push_key>` — adds one field, changes one:
```
timestamp   int     Unix epoch (seconds, UTC+8) — replaces millis()-based lastUpdate
rain_10min  float   mm of rain in the last 10 minutes
```

---

## Out of Scope
- Temperature sensor hardware addition
- Water level trend detection (rising/stable/falling)
- Web app changes — existing thresholds (`< 25cm` clear, `25–70cm` warning, `> 70cm` flooded) are unaffected
- NTP fallback (if WiFi is unavailable at boot, `getEpochTime()` returns 0 and logs degrade gracefully to no timestamp)

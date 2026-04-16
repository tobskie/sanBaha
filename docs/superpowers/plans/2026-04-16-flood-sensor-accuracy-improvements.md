# Flood Sensor Accuracy Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve ultrasonic depth accuracy, fix rain gauge overflow bug, add 10-minute rainfall rate, and add NTP-based real timestamps to Firebase logs.

**Architecture:** All changes are confined to `hardware/esp32_flood_sensor.ino`. Replace the single-pulse rolling average with a 5-sample median filter feeding an EMA. Fix the rain gauge's millis() overflow bug by extracting a reusable `countTipsInWindow()` helper. Add NTP sync using the ESP32 Arduino core's built-in `configTime()` — no new libraries.

**Tech Stack:** Arduino/ESP32, HC-SR04 ultrasonic sensor, tipping-bucket rain gauge, Firebase ESP32 library, TinyGPS++, Adafruit SSD1306.

---

## Files

- **Modify:** `hardware/esp32_flood_sensor.ino` (all tasks)

---

## Task 1: Add accuracy constants and replace smoothing variables

**Files:**
- Modify: `hardware/esp32_flood_sensor.ino:16–47`

Replace the hardcoded speed-of-sound value and the rolling-average variables with the new constants and EMA state.

- [ ] **Step 1: Replace the sensor height / screen defines block**

Find this block (lines ~16–19):
```cpp
#define SENSOR_HEIGHT_M 1.50   // Height from ground in METERS
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define SCREEN_ADDRESS 0x3C     
```

Replace with:
```cpp
#define SENSOR_HEIGHT_M   1.50    // Height from ground in METERS
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define SCREEN_ADDRESS    0x3C

// Ultrasonic accuracy constants
#define SOUND_SPEED_MPS   349.5f  // m/s at ~30°C (Lipa City typical ambient)
#define US_SAMPLES        5       // pulses per measurement cycle
#define US_SAMPLE_GAP_MS  5       // ms between pulses
#define US_MIN_DIST_M     0.03f   // HC-SR04 blind zone (discard readings below this)
#define EMA_ALPHA         0.2f    // EMA smoothing factor (0=no update, 1=no smoothing)
```

- [ ] **Step 2: Remove rolling-average variables and add EMA state**

Find this block (lines ~42–47):
```cpp
// Smoothing (Rolling Average)
const int numReadings = 10;
float readings[numReadings];      
int readIndex = 0;                
float total = 0;                  
float averageDepthM = 0;           
```

Replace with:
```cpp
// EMA depth state
float emaDepthM  = 0.0f;
bool  emaSeeded  = false;   // true after the first valid reading seeds the EMA
```

- [ ] **Step 3: Remove rolling-average array initialisation from setup()**

Find and delete this line in `setup()`:
```cpp
for (int i = 0; i < numReadings; i++) readings[i] = 0;
```

- [ ] **Step 4: Verify the sketch still compiles**

Open the Arduino IDE (or `arduino-cli compile`). Expected: no errors. The `readings`, `readIndex`, `total`, `averageDepthM` variables are removed — any remaining uses will surface as compile errors and will be fixed in Task 2.

- [ ] **Step 5: Commit**

```bash
git add hardware/esp32_flood_sensor.ino
git commit -m "refactor: replace rolling-average vars with EMA state and add accuracy constants"
```

---

## Task 2: Add measureDistanceM() and wire EMA into loop()

**Files:**
- Modify: `hardware/esp32_flood_sensor.ino`

Add the 5-sample median measurement helper and update the loop to use it.

- [ ] **Step 1: Add measureDistanceM() above loop()**

Insert the following function immediately before `void loop() {`:

```cpp
// Takes US_SAMPLES ultrasonic pulses, sorts valid results, returns the
// median distance in metres. Returns -1.0 if no valid echoes received.
float measureDistanceM() {
  float samples[US_SAMPLES];
  int validCount = 0;

  for (int i = 0; i < US_SAMPLES; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    if (dur > 0) {
      // distance_m = duration_µs * speed_m_per_s / 2_000_000
      float d = (dur * SOUND_SPEED_MPS) / 2000000.0f;
      if (d >= US_MIN_DIST_M) {
        samples[validCount++] = d;
      }
    }
    if (i < US_SAMPLES - 1) delay(US_SAMPLE_GAP_MS);
  }

  if (validCount == 0) return -1.0f;   // all echoes invalid — caller retains last EMA

  // Insertion sort (small N)
  for (int i = 1; i < validCount; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) { samples[j + 1] = samples[j]; j--; }
    samples[j + 1] = key;
  }

  // Average the middle values (drop min and max if 3+ samples)
  if (validCount >= 3) {
    float sum = 0;
    for (int i = 1; i < validCount - 1; i++) sum += samples[i];
    return sum / (validCount - 2);
  }
  return samples[validCount / 2];   // median of 1 or 2 valid samples
}
```

- [ ] **Step 2: Replace the ultrasonic measurement block in loop()**

Find this block in `loop()` (section C + D, lines ~146–162):
```cpp
  // C. Ultrasonic measurement in METERS
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  float distanceM = (duration * 0.0343) / 200.0; // cm to m
  float currentDepthM = SENSOR_HEIGHT_M - distanceM;
  if (currentDepthM < 0 || duration == 0) currentDepthM = 0;

  // D. Rolling Average (Smooths out ripples)
  total = total - readings[readIndex];
  readings[readIndex] = currentDepthM;
  total = total + readings[readIndex];
  readIndex = (readIndex + 1) % numReadings;
  averageDepthM = total / numReadings;
```

Replace with:
```cpp
  // C. Ultrasonic measurement — 5-sample median, EMA smoothed
  float distanceM = measureDistanceM();
  if (distanceM >= 0.0f) {
    float depthM = SENSOR_HEIGHT_M - distanceM;
    if (depthM < 0.0f) depthM = 0.0f;
    if (!emaSeeded) { emaDepthM = depthM; emaSeeded = true; }
    else            { emaDepthM = EMA_ALPHA * depthM + (1.0f - EMA_ALPHA) * emaDepthM; }
  }
  // If distanceM < 0 all 5 pulses timed out — retain last emaDepthM (no update)
```

- [ ] **Step 3: Update every reference to averageDepthM in loop()**

Find all occurrences of `averageDepthM` in the file and replace each with `emaDepthM`.

There are three occurrences:
1. OLED depth display line: `display.print(averageDepthM, 2);` → `display.print(emaDepthM, 2);`
2. `float waterLevelCm = averageDepthM * 100.0;` → `float waterLevelCm = emaDepthM * 100.0;`
3. `sensorJson.set("depth_m", averageDepthM);` → `sensorJson.set("depth_m", emaDepthM);`
4. `logJson.set("depth_m", averageDepthM);` → `logJson.set("depth_m", emaDepthM);`

- [ ] **Step 4: Verify compilation**

Expected: no errors, no references to `averageDepthM`, `readings`, `readIndex`, or `total`.

- [ ] **Step 5: Serial smoke test (optional but recommended)**

Flash to the ESP32. Open Serial Monitor at 115200 baud. Expected output every 5 seconds:
```
{"depth_m":0.XX,"waterLevel_cm":XX.X,"rain_mm":X.X,...}
```
`depth_m` should be stable (not jumping around). Hold your hand 10–20cm above the sensor — the value should rise smoothly and hold when you remove your hand.

- [ ] **Step 6: Commit**

```bash
git add hardware/esp32_flood_sensor.ino
git commit -m "feat: replace single-pulse rolling average with 5-sample median + EMA depth measurement"
```

---

## Task 3: Fix rain gauge and add 10-minute rainfall rate

**Files:**
- Modify: `hardware/esp32_flood_sensor.ino`

Replace `rollingRainMm()` with a reusable `countTipsInWindow()` helper that fixes the millis() overflow bug. Add `rain10MinMm()`.

- [ ] **Step 1: Replace the rain gauge functions**

Find and delete the entire `rollingRainMm()` function (lines ~71–88):
```cpp
// Returns mm of rain in the last 60 minutes
float rollingRainMm() {
  // Snapshot volatile ISR state atomically to avoid torn reads
  noInterrupts();
  int localCount = tipCount;
  unsigned long localTimestamps[MAX_TIPS];
  for (int i = 0; i < localCount; i++) localTimestamps[i] = tipTimestamps[i];
  interrupts();

  // Guard against unsigned underflow during first hour of uptime
  unsigned long now = millis();
  unsigned long cutoff = (now > 3600000UL) ? (now - 3600000UL) : 0;

  int count = 0;
  for (int i = 0; i < localCount; i++) {
    if (localTimestamps[i] > cutoff) count++;
  }
  return count * MM_PER_TIP;
}
```

Replace with:
```cpp
// Returns mm of rain in the given rolling window.
// Uses unsigned subtraction for millis() overflow safety — works correctly
// even when millis() wraps around at ~49 days of uptime.
float countTipsInWindow(unsigned long windowMs) {
  noInterrupts();
  int localCount = tipCount;
  unsigned long localTimestamps[MAX_TIPS];
  for (int i = 0; i < localCount; i++) localTimestamps[i] = tipTimestamps[i];
  interrupts();

  unsigned long now = millis();
  int count = 0;
  for (int i = 0; i < localCount; i++) {
    if ((now - localTimestamps[i]) <= windowMs) count++;
  }
  return count * MM_PER_TIP;
}

float rollingRainMm() { return countTipsInWindow(3600000UL); }  // last 60 minutes
float rain10MinMm()   { return countTipsInWindow(600000UL);  }  // last 10 minutes
```

- [ ] **Step 2: Verify compilation**

Expected: no errors. `rollingRainMm()` signature is unchanged — all existing call sites still work.

- [ ] **Step 3: Serial smoke test (optional)**

Flash to device. During rain (or tap the rain gauge pin to ground manually a few times), the Serial JSON should show `rain_mm` incrementing. After 10 minutes of no tips, `rain_10min` (added in Task 5) will return to 0 while `rain_mm` still holds the 1-hour total.

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32_flood_sensor.ino
git commit -m "fix: replace rain gauge overflow-prone cutoff with millis-safe countTipsInWindow helper, add rain10MinMm"
```

---

## Task 4: Add NTP sync

**Files:**
- Modify: `hardware/esp32_flood_sensor.ino`

Add `#include <time.h>`, `syncNTP()`, and `getEpochTime()`. Call `syncNTP()` in `setup()` after WiFi connects.

- [ ] **Step 1: Add time.h include**

Find the includes block at the top of the file:
```cpp
#include <Arduino.h>
#include <Wire.h>
```

Add `#include <time.h>` immediately after `#include <Arduino.h>`:
```cpp
#include <Arduino.h>
#include <time.h>
#include <Wire.h>
```

`<time.h>` is part of the ESP32 Arduino core — no library install needed.

- [ ] **Step 2: Add syncNTP() and getEpochTime() helpers**

Add these two functions immediately after `connectWiFi()`:

```cpp
// Sync time from NTP. UTC+8 = Philippine Standard Time (offset 28800s).
// Waits up to 5s for initial sync. If WiFi is unavailable, returns immediately.
void syncNTP() {
  if (WiFi.status() != WL_CONNECTED) return;
  configTime(28800, 0, "pool.ntp.org", "time.google.com");
  struct tm timeinfo;
  int retry = 0;
  while (!getLocalTime(&timeinfo) && retry < 10) {
    delay(500);
    retry++;
  }
}

// Returns Unix epoch time (seconds since 1970-01-01 00:00:00 UTC).
// Returns 0 if NTP has not synced yet — Firebase fields degrade gracefully.
time_t getEpochTime() {
  time_t now;
  time(&now);
  return now;
}
```

- [ ] **Step 3: Call syncNTP() in setup() after connectWiFi()**

Find in `setup()`:
```cpp
  connectWiFi();

  // Firebase Initialization
```

Replace with:
```cpp
  connectWiFi();
  syncNTP();

  // Firebase Initialization
```

- [ ] **Step 4: Verify compilation**

Expected: no errors.

- [ ] **Step 5: Serial smoke test (optional)**

Flash to device. After boot, open Serial Monitor. If WiFi connects, after ~2s the ESP32 should have a valid time. You can temporarily add `Serial.println(getEpochTime());` after `syncNTP()` to confirm a non-zero Unix timestamp is returned (remove after verifying).

- [ ] **Step 6: Commit**

```bash
git add hardware/esp32_flood_sensor.ino
git commit -m "feat: add NTP sync (UTC+8) and getEpochTime helper for real-time Firebase timestamps"
```

---

## Task 5: Update Firebase push — add rain_10min and real timestamps

**Files:**
- Modify: `hardware/esp32_flood_sensor.ino` (Firebase push block, lines ~204–251)

Push `rain_10min` to both nodes and replace `millis()` with `getEpochTime()`.

- [ ] **Step 1: Update the sensor node JSON**

Find the sensor push block in `loop()`:
```cpp
    FirebaseJson sensorJson;
    sensorJson.set("name", SENSOR_NAME);
    sensorJson.set("location", SENSOR_LOCATION);
    sensorJson.set("waterLevel", waterLevelCm);          // cm — web app thresholds: <25 clear, 25-70 warning, >70 flooded
    sensorJson.set("depth_m", emaDepthM);             // keep original meters value too
    sensorJson.set("rain_mm", currentRainMm);
    sensorJson.set("lat", gps.location.lat());
    sensorJson.set("lng", gps.location.lng());
    sensorJson.set("rssi", WiFi.RSSI());
    sensorJson.set("lastUpdate", millis());               // or use NTP if you add it later
```

Replace with:
```cpp
    float rain10Min = rain10MinMm();

    FirebaseJson sensorJson;
    sensorJson.set("name", SENSOR_NAME);
    sensorJson.set("location", SENSOR_LOCATION);
    sensorJson.set("waterLevel", waterLevelCm);   // cm — thresholds: <25 clear, 25-70 warning, >70 flooded
    sensorJson.set("depth_m", emaDepthM);
    sensorJson.set("rain_mm", currentRainMm);
    sensorJson.set("rain_10min", rain10Min);
    sensorJson.set("lat", gps.location.lat());
    sensorJson.set("lng", gps.location.lng());
    sensorJson.set("rssi", WiFi.RSSI());
    sensorJson.set("lastUpdate", (int)getEpochTime());
```

- [ ] **Step 2: Update the log JSON**

Find:
```cpp
    FirebaseJson logJson;
    logJson.set("depth_m", averageDepthM);
    logJson.set("rain_mm", currentRainMm);
    logJson.set("lat", gps.location.lat());
    logJson.set("lng", gps.location.lng());
    logJson.set("rssi", WiFi.RSSI());
```

Replace with:
```cpp
    FirebaseJson logJson;
    logJson.set("timestamp", (int)getEpochTime());
    logJson.set("depth_m", emaDepthM);
    logJson.set("rain_mm", currentRainMm);
    logJson.set("rain_10min", rain10Min);
    logJson.set("lat", gps.location.lat());
    logJson.set("lng", gps.location.lng());
    logJson.set("rssi", WiFi.RSSI());
```

- [ ] **Step 3: Update the Serial JSON output**

Find:
```cpp
    Serial.print("{\"depth_m\":"); Serial.print(averageDepthM, 2);
    Serial.print(",\"waterLevel_cm\":"); Serial.print(waterLevelCm, 1);
    Serial.print(",\"rain_mm\":"); Serial.print(currentRainMm, 1);
    Serial.print(",\"lat\":"); Serial.print(gps.location.lat(), 6);
    Serial.print(",\"lng\":"); Serial.print(gps.location.lng(), 6);
    Serial.println("}");
```

Replace with:
```cpp
    Serial.print("{\"depth_m\":"); Serial.print(emaDepthM, 2);
    Serial.print(",\"waterLevel_cm\":"); Serial.print(waterLevelCm, 1);
    Serial.print(",\"rain_mm\":"); Serial.print(currentRainMm, 1);
    Serial.print(",\"rain_10min\":"); Serial.print(rain10Min, 1);
    Serial.print(",\"ts\":"); Serial.print((int)getEpochTime());
    Serial.print(",\"lat\":"); Serial.print(gps.location.lat(), 6);
    Serial.print(",\"lng\":"); Serial.print(gps.location.lng(), 6);
    Serial.println("}");
```

- [ ] **Step 4: Verify compilation**

Expected: no errors, no references to `averageDepthM` or `millis()` in the Firebase block.

- [ ] **Step 5: Full integration test**

Flash to device. Open Serial Monitor at 115200. Confirm output looks like:
```
{"depth_m":0.12,"waterLevel_cm":12.0,"rain_mm":0.0,"rain_10min":0.0,"ts":1744780800,"lat":13.9411,"lng":121.1630}
```
Key checks:
- `ts` is a Unix timestamp (~1.7 billion), not a small millis() value
- `rain_10min` field is present
- `depth_m` is stable between readings (no large jumps)

Open Firebase Realtime Database console. Confirm `/flood_sensors/sensor_001` has `rain_10min` and `lastUpdate` is a Unix epoch value. Confirm `/logs` entries have `timestamp` and `rain_10min` fields.

- [ ] **Step 6: Commit**

```bash
git add hardware/esp32_flood_sensor.ino
git commit -m "feat: add rain_10min and real NTP timestamps to Firebase sensor and log nodes"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Multi-sample median filter (5 pulses) — Task 2
- [x] EMA with alpha = 0.2, seeded on first valid reading — Task 2
- [x] Speed of sound 349.5 m/s at 30°C — Task 1
- [x] HC-SR04 blind zone guard (0.03m) — Task 2 `measureDistanceM()`
- [x] Hold last valid EMA on all-invalid cycle — Task 2
- [x] Fix millis() overflow bug in rain gauge — Task 3
- [x] `countTipsInWindow()` reusable helper — Task 3
- [x] `rain10MinMm()` — Task 3
- [x] NTP sync UTC+8 in `setup()` — Task 4
- [x] `getEpochTime()` helper — Task 4
- [x] `lastUpdate` uses `getEpochTime()` — Task 5
- [x] `/logs` `timestamp` field uses `getEpochTime()` — Task 5
- [x] `rain_10min` in sensor node and log entries — Task 5

**No placeholders:** All steps contain actual code. No TBD/TODO.

**Type consistency:** `emaDepthM` (float) used consistently across Tasks 1–5. `rain10Min` local variable introduced in Task 5 Step 1 and reused in Steps 2–3. `getEpochTime()` returns `time_t`, cast to `(int)` at call sites.

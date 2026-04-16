#include <Arduino.h>
#include <time.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <TinyGPS++.h>
#include <WiFi.h>
#include <FirebaseESP32.h>

// --- 1. Credentials & Configuration ---
const char* ssid = "HP&P";
const char* password = "Ybots82505";

#define FIREBASE_HOST "sanbaha-e05ae-default-rtdb.asia-southeast1.firebasedatabase.app" 
#define FIREBASE_AUTH "5XCN927TVAwiHVlueWN7i3yaEujsExZ09mpUywTV"

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

// --- Sensor Identity (edit these for your location) ---
#define SENSOR_ID       "sensor_001"
#define SENSOR_NAME     "Lodlod Bridge"
#define SENSOR_LOCATION "Brgy. Lodlod, Lipa City"

// --- 2. Pin Definitions ---
#define TRIG_PIN 5
#define ECHO_PIN 18
#define GPS_RX 27
#define GPS_TX 26
#define PPS_PIN 25 
#define RAIN_PIN 14

// --- 3. Objects & Variables ---
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
TinyGPSPlus gps;
HardwareSerial SerialGPS(2);
FirebaseData firebaseData;
FirebaseConfig config;
FirebaseAuth auth;

// EMA depth state
float emaDepthM  = 0.0f;
bool  emaSeeded  = false;   // true after the first valid reading seeds the EMA

// Rain Gauge Variables
const float MM_PER_TIP = 0.2; // Typical value for tipping bucket, adjust if needed
volatile unsigned long lastTipTime = 0;

// Rolling 1-hour rain buffer — stores millis() timestamp of each tip
#define MAX_TIPS 200
volatile unsigned long tipTimestamps[MAX_TIPS];
volatile int tipHead = 0;
volatile int tipCount = 0;

void IRAM_ATTR countRain() {
  unsigned long currentTime = millis();
  // 200ms debounce time to prevent multiple triggers from one tip
  if (currentTime - lastTipTime > 200) {
    tipTimestamps[tipHead] = currentTime;
    tipHead = (tipHead + 1) % MAX_TIPS;
    if (tipCount < MAX_TIPS) tipCount++;
    lastTipTime = currentTime;
  }
}

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

void connectWiFi() {
  WiFi.begin(ssid, password);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    retry++;
  }
}

// Sync time from NTP. UTC+8 = Philippine Standard Time (offset 28800s).
// Waits up to 5s for initial sync. If WiFi is unavailable, returns immediately.
void syncNTP() {
  if (WiFi.status() != WL_CONNECTED) return;
  configTime(28800, 0, "pool.ntp.org", "time.google.com");  // 28800 = UTC+8, 0 = no DST (Philippines)
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
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return 0;
  time_t now;
  time(&now);
  return now;
}

void setup() {
  Serial.begin(115200);
  
  // I2C & OLED Initialization
  Wire.begin(21, 22);
  Wire.setClock(100000); 
  if(!display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS)) for(;;);

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0,20);
  display.println("sanBaha System");
  display.println("Connecting...");
  display.display();

  // Hardware Initialization
  SerialGPS.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(PPS_PIN, INPUT);

  // Rain Gauge Initialization
  pinMode(RAIN_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(RAIN_PIN), countRain, FALLING);

  connectWiFi();
  syncNTP();

  // Firebase Initialization
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

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

    // 30 000 µs timeout → ~5.2 m max range; well beyond the 1.5 m mount height
    long dur = pulseIn(ECHO_PIN, HIGH, 30000);
    if (dur > 0) {
      // distance_m = duration_µs * speed_m_per_s / 2_000_000
      float d = ((float)dur * SOUND_SPEED_MPS) / 2000000.0f;
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

void loop() {
  // A. Process GPS
  while (SerialGPS.available() > 0) {
    gps.encode(SerialGPS.read());
  }

  // B. Hardware Status
  bool ppsStatus = digitalRead(PPS_PIN);

  // C. Ultrasonic measurement — 5-sample median, EMA smoothed
  float distanceM = measureDistanceM();
  if (distanceM >= 0.0f) {
    float depthM = SENSOR_HEIGHT_M - distanceM;
    if (depthM < 0.0f) depthM = 0.0f;
    if (!emaSeeded) { emaDepthM = depthM; emaSeeded = true; }
    else            { emaDepthM = EMA_ALPHA * depthM + (1.0f - EMA_ALPHA) * emaDepthM; }
  }
  // If distanceM < 0 all 5 pulses timed out — retain last emaDepthM (no update)

  // E. Update 0.96" OLED
  display.clearDisplay();
  display.setTextWrap(false);
  
  // Header
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("sanBaha");
  display.setCursor(75, 0);
  if(WiFi.status() == WL_CONNECTED) display.print("W"); else display.print(" ");
  if(ppsStatus) display.print(" G[FIX]"); else display.print(" G[---]");
  display.drawLine(0, 11, 128, 11, WHITE);

  // Depth Display
  display.setCursor(5, 22);
  display.setTextSize(2);
  display.print("D:");
  display.print(emaDepthM, 2);
  display.print("m");

  // Rain Display
  display.setCursor(5, 40);
  display.setTextSize(1);
  float currentRainMm = rollingRainMm();
  display.print("Rain: ");
  display.print(currentRainMm, 1);
  display.print(" mm");

  // Footer
  display.setTextSize(1);
  display.setCursor(0, 50);
  if (gps.location.isValid()) {
    display.print(gps.location.lat(), 4); display.print(","); 
    display.print(gps.location.lng(), 4);
  } else {
    display.print("Sats: "); display.print(gps.satellites.value());
    display.print(" | "); display.print(WiFi.localIP().toString().substring(10));
  }
  display.display();

  // F. Firebase & Serial Output (Every 5 seconds)
  static unsigned long lastPush = 0;
  if (millis() - lastPush > 5000) {

    // Convert depth from meters to centimeters for the web app
    float waterLevelCm = emaDepthM * 100.0;
    float currentRainMm = rollingRainMm();
    float rain10Min = rain10MinMm();

    // ── Push to /flood_sensors/sensor_001 (web app reads this) ──
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

    if (WiFi.status() == WL_CONNECTED) {
      // setJSON overwrites at a fixed path (sensor_001 always stays sensor_001)
      // pushJSON would create a new random key every time — don't use that here
      Firebase.setJSON(firebaseData, "/flood_sensors/" SENSOR_ID, sensorJson);
    }

    // ── Also keep the /logs push for historical logging ──
    FirebaseJson logJson;
    logJson.set("timestamp", (int)getEpochTime());
    logJson.set("depth_m", emaDepthM);
    logJson.set("rain_mm", currentRainMm);
    logJson.set("rain_10min", rain10Min);
    logJson.set("lat", gps.location.lat());
    logJson.set("lng", gps.location.lng());
    logJson.set("rssi", WiFi.RSSI());
    
    if (WiFi.status() == WL_CONNECTED) {
       Firebase.pushJSON(firebaseData, "/logs", logJson);
    }
    
    // Serial JSON for local monitoring
    Serial.print("{\"depth_m\":"); Serial.print(emaDepthM, 2);
    Serial.print(",\"waterLevel_cm\":"); Serial.print(waterLevelCm, 1);
    Serial.print(",\"rain_mm\":"); Serial.print(currentRainMm, 1);
    Serial.print(",\"rain_10min\":"); Serial.print(rain10Min, 1);
    Serial.print(",\"ts\":"); Serial.print((int)getEpochTime());
    Serial.print(",\"lat\":"); Serial.print(gps.location.lat(), 6);
    Serial.print(",\"lng\":"); Serial.print(gps.location.lng(), 6);
    Serial.println("}");
    
    lastPush = millis();
  }
}

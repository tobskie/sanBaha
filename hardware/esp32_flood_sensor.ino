#include <Arduino.h>
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

void connectWiFi() {
  WiFi.begin(ssid, password);
  int retry = 0;
  while (WiFi.status() != WL_CONNECTED && retry < 20) {
    delay(500);
    retry++;
  }
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

  // Firebase Initialization
  config.host = FIREBASE_HOST;
  config.signer.tokens.legacy_token = FIREBASE_AUTH;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // A. Process GPS
  while (SerialGPS.available() > 0) {
    gps.encode(SerialGPS.read());
  }

  // B. Hardware Status
  bool ppsStatus = digitalRead(PPS_PIN);

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
  display.print(averageDepthM, 2); 
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
    float waterLevelCm = averageDepthM * 100.0;
    float currentRainMm = rollingRainMm();

    // ── Push to /flood_sensors/sensor_001 (web app reads this) ──
    FirebaseJson sensorJson;
    sensorJson.set("name", SENSOR_NAME);
    sensorJson.set("location", SENSOR_LOCATION);
    sensorJson.set("waterLevel", waterLevelCm);          // cm — web app thresholds: <25 clear, 25-70 warning, >70 flooded
    sensorJson.set("depth_m", averageDepthM);             // keep original meters value too
    sensorJson.set("rain_mm", currentRainMm);
    sensorJson.set("lat", gps.location.lat());
    sensorJson.set("lng", gps.location.lng());
    sensorJson.set("rssi", WiFi.RSSI());
    sensorJson.set("lastUpdate", millis());               // or use NTP if you add it later

    if (WiFi.status() == WL_CONNECTED) {
      // setJSON overwrites at a fixed path (sensor_001 always stays sensor_001)
      // pushJSON would create a new random key every time — don't use that here
      Firebase.setJSON(firebaseData, "/flood_sensors/" SENSOR_ID, sensorJson);
    }

    // ── Also keep the /logs push for historical logging ──
    FirebaseJson logJson;
    logJson.set("depth_m", averageDepthM);
    logJson.set("rain_mm", currentRainMm);
    logJson.set("lat", gps.location.lat());
    logJson.set("lng", gps.location.lng());
    logJson.set("rssi", WiFi.RSSI());
    
    if (WiFi.status() == WL_CONNECTED) {
       Firebase.pushJSON(firebaseData, "/logs", logJson);
    }
    
    // Serial JSON for local monitoring
    Serial.print("{\"depth_m\":"); Serial.print(averageDepthM, 2);
    Serial.print(",\"waterLevel_cm\":"); Serial.print(waterLevelCm, 1);
    Serial.print(",\"rain_mm\":"); Serial.print(currentRainMm, 1);
    Serial.print(",\"lat\":"); Serial.print(gps.location.lat(), 6);
    Serial.print(",\"lng\":"); Serial.print(gps.location.lng(), 6);
    Serial.println("}");
    
    lastPush = millis();
  }
}

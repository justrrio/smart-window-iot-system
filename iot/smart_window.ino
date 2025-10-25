#include <DHT.h>
#include <ESP32Servo.h>
#include <LiquidCrystal_I2C.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <Wire.h>

// --- WIFI & MQTT CONFIGURATION ---
const char *ssid = "YourWiFiName";         // Replace with your WiFi SSID
const char *password = "YourWiFiPassword"; // Replace with your WiFi password
const char *mqtt_server = "192.168.1.9";   // Replace with your computer's IP
const int mqtt_port = 1883;

// --- DEVICE PINOUT ---
#define DHTPIN 23
#define SERVO_PIN 15
#define LED_RED_PIN 13
#define LED_GREEN_PIN 14
#define LED_BLUE_PIN 12
#define IR_SENSOR_PIN 4

// --- DEVICE INITIALIZATION ---
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);
Servo myServo;
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- CLIENT & GLOBAL VARIABLES ---
WiFiClient espClient;
PubSubClient client(espClient);
float temperature = 0;
long lastTempRead = 0;
const float TEMP_THRESHOLD = 29.0;
bool isWindowOpen = false;
bool lastObjectDetected = false;

// Variables for tracking LCD changes
float lastDisplayedTemp = -999;
bool lastDisplayedWindowState = false;
bool lastDisplayedMqttStatus = false;

// --- FUNCTION DECLARATION ---
void publishCurrentStates();

// --- SETUP FUNCTION ---
void setup() {
  Serial.begin(115200);

  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_BLUE_PIN, OUTPUT);
  pinMode(IR_SENSOR_PIN, INPUT);
  myServo.attach(SERVO_PIN);
  dht.begin();

  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Smart Window IoT");
  lcd.setCursor(0, 1);
  lcd.print("Connecting...");

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  delay(1500);

  Serial.println("Setup complete. Initializing states.");
  // Perform an initial reading so the display isn't empty
  temperature = dht.readTemperature();

  // Set initial state without calling loop()
  isWindowOpen = false;
  updateActuators();
  updateLCD();
}

// --- CONNECTION & RECONNECTION FUNCTIONS ---
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("WiFi connection failed - continuing in offline mode");
  }
}

void reconnect() {
  static unsigned long lastAttempt = 0;
  const unsigned long retryInterval = 5000; // 5 seconds

  if (!client.connected() && (millis() - lastAttempt > retryInterval)) {
    lastAttempt = millis();

    // Check WiFi first
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("WiFi disconnected - attempting to reconnect");
      WiFi.reconnect();
      return;
    }

    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
      // Publish current states immediately after reconnection
      publishCurrentStates();
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" - will retry in 5 seconds");
    }
  }
}

// --- FUNCTION TO PUBLISH STATE ON RECONNECT ---
void publishCurrentStates() {
  Serial.println("Publishing current states to MQTT...");

  // Publish temperature
  if (!isnan(temperature)) {
    client.publish("sensor/dht", String(temperature).c_str(), true);
  }

  // Publish IR sensor state
  if (lastObjectDetected) {
    client.publish("sensor/infrared", "DETECTED", false);
  } else {
    client.publish("sensor/infrared", "NOT DETECTED", false);
  }

  // Publish actuator states
  if (isWindowOpen) {
    client.publish("aktuator/servo", "OPEN", true);
    client.publish("aktuator/led", "RED", true);
  } else {
    client.publish("aktuator/servo", "CLOSED", true);
    client.publish("aktuator/led", "GREEN", true);
  }

  Serial.println("All states published successfully");
}

// --- MAIN FUNCTION (LOOP) with NON-BLOCKING LOGIC ---
void loop() {
  // Non-blocking reconnection attempt
  if (!client.connected()) {
    reconnect();
  }

  // MQTT loop only if connected
  if (client.connected()) {
    client.loop();
  }

  // *** DEVICE LOGIC - RUNS INDEPENDENTLY OF MQTT ***

  // Read IR sensor
  bool objectDetected = (digitalRead(IR_SENSOR_PIN) == LOW);
  lastObjectDetected = objectDetected;

  // Read temperature every 5 seconds
  if (millis() - lastTempRead > 5000) {
    lastTempRead = millis();
    temperature = dht.readTemperature();
    if (!isnan(temperature)) {
      Serial.print("Suhu: ");
      Serial.print(temperature);
      Serial.println(" *C");

      // Publish only if connected
      if (client.connected()) {
        client.publish("sensor/dht", String(temperature).c_str(), true);
      }
    } else {
      Serial.println("Gagal membaca dari sensor DHT!");
    }
  }

  bool shouldBeOpen = false;
  String reason = "Suhu Normal";

  // Step 1: Check Main Priority (IR Sensor)
  if (objectDetected) {
    shouldBeOpen = true;
    reason = "Objek Terdeteksi";

    if (client.connected()) {
      client.publish("sensor/infrared", "DETECTED", false);
    }
    Serial.println("IR Sensor: Objek Terdeteksi");
  } else {
    // Step 2: If IR is not active, check Second Priority (DHT Sensor)
    shouldBeOpen = temperature > TEMP_THRESHOLD;

    if (shouldBeOpen) {
      reason = "Suhu Panas";
      Serial.println("DHT Sensor: Suhu Panas");
    }

    if (client.connected()) {
      client.publish("sensor/infrared", "NOT DETECTED", false);
    }
  }

  // Only update if there is a state change
  if (shouldBeOpen != isWindowOpen) {
    isWindowOpen = shouldBeOpen;
    Serial.print("Perubahan State -> Jendela ");
    Serial.print(isWindowOpen ? "DIBUKA" : "DITUTUP");
    Serial.print(". Alasan: ");
    Serial.println(reason);
    updateActuators();
  }

  // Always update LCD to show the latest temperature data
  updateLCD();

  // Small delay for stability
  delay(100);
}

// --- HELPER FUNCTIONS ---

// This function controls actuators and publishes to MQTT if connected
void updateActuators() {
  if (isWindowOpen) {
    // Action to open the window
    myServo.write(90);
    setLedColor(255, 0, 0); // Red

    if (client.connected()) {
      client.publish("aktuator/servo", "OPEN", true);
      client.publish("aktuator/led", "RED", true);
    }
  } else {
    // Action to close the window
    myServo.write(0);
    setLedColor(0, 255, 0); // Green

    if (client.connected()) {
      client.publish("aktuator/servo", "CLOSED", true);
      client.publish("aktuator/led", "GREEN", true);
    }
  }
}

void setLedColor(int r, int g, int b) {
  // Inverted logic for Common Anode LED
  analogWrite(LED_RED_PIN, 255 - r);
  analogWrite(LED_GREEN_PIN, 255 - g);
  analogWrite(LED_BLUE_PIN, 255 - b);
}

void updateLCD() {
  String windowState = isWindowOpen ? "OPEN" : "CLOSED";
  String ledColor = isWindowOpen ? "RED" : "GREEN";
  String mqttStatus = client.connected() ? "M" : "X";

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("T:" + String(temperature, 1) + "C " + mqttStatus);
  lcd.setCursor(0, 1);
  lcd.print("W:" + windowState + " L:" + ledColor);
  delay(1000);
}

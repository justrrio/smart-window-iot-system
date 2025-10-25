// MQTT Configuration (adjust to your setup)
const MQTT_CONFIG = {
  host: '192.168.1.9', // Change to your MQTT broker IP
  port: 9001, // Port for WebSocket (usually 9001, not 1883)
  clientId: 'WebDashboard-' + Math.random().toString(16).substr(2, 8)
};

// MQTT Topics
const TOPICS = {
  temperature: 'sensor/dht',
  infrared: 'sensor/infrared',
  servo: 'aktuator/servo',
  led: 'aktuator/led'
};

let mqttClient = null;
let reconnectAttempts = 0;
let reconnectTimer = null;

// Function to format time
function formatTime(date) {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Function to update MQTT connection status
function updateMQTTStatus(connected, reconnecting = false) {
  const statusBadge = document.getElementById('mqttStatus');
  const statusDot = statusBadge.querySelector('.status-dot');
  const statusText = statusBadge.querySelector('span:last-child');
  const connectionStatus = document.getElementById('connectionStatus');
  const reconnectBtn = document.getElementById('reconnectBtn');
  const reconnectInfo = document.getElementById('reconnectInfo');

  if (connected) {
    statusBadge.className = 'status-badge connected';
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Connected';
    connectionStatus.textContent = 'Terhubung';
    reconnectBtn.disabled = true;
    reconnectInfo.textContent = '';
    reconnectAttempts = 0;
  } else if (reconnecting) {
    statusBadge.className = 'status-badge reconnecting';
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Reconnecting...';
    connectionStatus.textContent = 'Mencoba terhubung kembali...';
    reconnectBtn.disabled = true;
    reconnectInfo.textContent = `🔄 Percobaan ke-${reconnectAttempts}... (otomatis setiap 5 detik)`;
  } else {
    statusBadge.className = 'status-badge disconnected';
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'Disconnected';
    connectionStatus.textContent = 'Terputus';
    reconnectBtn.disabled = false;
    reconnectInfo.textContent = '⚠️ Koneksi terputus. Klik tombol Reconnect atau tunggu auto-reconnect.';
  }
}

// Function to connect to MQTT Broker
function connectMQTT() {
  // Update connection info
  document.getElementById('mqttServer').textContent = MQTT_CONFIG.host;
  document.getElementById('mqttPort').textContent = MQTT_CONFIG.port;
  document.getElementById('clientId').textContent = MQTT_CONFIG.clientId;

  // Connect using WebSocket
  const wsUrl = `ws://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`;

  try {
    mqttClient = mqtt.connect(wsUrl, {
      clientId: MQTT_CONFIG.clientId,
      clean: true,
      reconnectPeriod: 5000
    });

    // Event on connect
    mqttClient.on('connect', function () {
      console.log('✅ Terhubung ke MQTT Broker');
      reconnectAttempts = 0;
      updateMQTTStatus(true);

      // Subscribe to all topics
      Object.values(TOPICS).forEach(topic => {
        mqttClient.subscribe(topic, function (err) {
          if (!err) {
            console.log(`📡 Subscribed to: ${topic}`);
          }
        });
      });
    });

    // Event on message received
    mqttClient.on('message', function (topic, message) {
      const payload = message.toString();
      const now = new Date();
      console.log(`📨 Pesan diterima - Topic: ${topic}, Payload: ${payload}`);

      // Process based on topic
      switch (topic) {
        case TOPICS.temperature:
          updateTemperature(payload, now);
          break;
        case TOPICS.infrared:
          updateInfrared(payload, now);
          break;
        case TOPICS.servo:
          updateServo(payload, now);
          break;
        case TOPICS.led:
          updateLED(payload, now);
          break;
      }
    });

    // Event on connection close
    mqttClient.on('close', function () {
      console.log('❌ Koneksi MQTT terputus');
      updateMQTTStatus(false, false);
    });

    // Event on reconnect
    mqttClient.on('reconnect', function () {
      reconnectAttempts++;
      console.log(`🔄 Mencoba reconnect... (Percobaan ke-${reconnectAttempts})`);
      updateMQTTStatus(false, true);
    });

    // Error event
    mqttClient.on('error', function (error) {
      console.error('⚠️ Error MQTT:', error);
      updateMQTTStatus(false);
    });

  } catch (error) {
    console.error('⚠️ Gagal koneksi MQTT:', error);
    updateMQTTStatus(false);
  }
}

// Update Temperature function
function updateTemperature(value, time) {
  const tempValue = parseFloat(value);
  document.getElementById('temperature').textContent = tempValue.toFixed(1) + '°C';
  document.getElementById('tempLastUpdate').textContent = 'Update: ' + formatTime(time);
}

// Update Infrared Sensor function
function updateInfrared(value, time) {
  const irStatus = document.getElementById('irStatus');
  const status = value.toUpperCase();

  if (status === 'DETECTED') {
    irStatus.innerHTML = '<span class="status-indicator detected">🔴 TERDETEKSI</span>';
  } else {
    irStatus.innerHTML = '<span class="status-indicator not-detected">🟢 TIDAK ADA</span>';
  }

  document.getElementById('irLastUpdate').textContent = 'Update: ' + formatTime(time);
}

// Update Servo function
function updateServo(value, time) {
  const servoStatus = document.getElementById('servoStatus');
  const status = value.toUpperCase();

  if (status === 'OPEN') {
    servoStatus.innerHTML = '<span class="status-indicator open">🔓 TERBUKA</span>';
  } else {
    servoStatus.innerHTML = '<span class="status-indicator closed">🔒 TERTUTUP</span>';
  }

  document.getElementById('servoLastUpdate').textContent = 'Update: ' + formatTime(time);
}

// Update LED function
function updateLED(value, time) {
  const ledStatus = document.getElementById('ledStatus');
  const ledPreview = document.getElementById('ledPreview');
  const color = value.toUpperCase();

  if (color === 'RED') {
    ledStatus.innerHTML = '<span class="status-indicator red">🔴 MERAH</span>';
    ledPreview.className = 'led-preview red';
    ledPreview.innerText = '';
  } else if (color === 'GREEN') {
    ledStatus.innerHTML = '<span class="status-indicator green">🟢 HIJAU</span>';
    ledPreview.className = 'led-preview green';
    ledPreview.innerText = '';
  }
}

// Function for manual reconnect
function manualReconnect() {
  console.log('🔄 Manual reconnect diminta...');
  const reconnectBtn = document.getElementById('reconnectBtn');
  reconnectBtn.disabled = true;

  if (mqttClient) {
    mqttClient.end(true);
  }

  setTimeout(() => {
    connectMQTT();
  }, 500);
}

// Run MQTT connection when the page loads
window.addEventListener('load', function () {
  console.log('🚀 Memulai Dashboard...');
  connectMQTT();
});

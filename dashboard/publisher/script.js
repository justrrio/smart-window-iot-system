// MQTT Configuration (MUST BE THE SAME as the dashboard!)
const MQTT_CONFIG = {
  host: '192.168.1.9', // Change to your MQTT broker IP
  port: 9001, // WebSocket Port
  clientId: 'WebPublisher-' + Math.random().toString(16).substr(2, 8)
};

let mqttClient = null;
let reconnectAttempts = 0;

// Function to format time
function formatTime(date) {
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Function to add a log entry
function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;

  const now = new Date();
  const timeStr = formatTime(now);
  const typeLabel = type === 'success' ? 'SUCCESS' : type === 'error' ? 'ERROR' : 'INFO';

  logEntry.innerHTML = `<span class="log-time">[${typeLabel} ${timeStr}]</span>${message}`;

  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Function to clear the log
function clearLog() {
  const logContainer = document.getElementById('logContainer');
  logContainer.innerHTML = '<div class="log-entry info"><span class="log-time">[INFO]</span>Log telah dibersihkan.</div>';
}

// Function to update connection status
function updateMQTTStatus(connected, reconnecting = false) {
  const statusBadge = document.getElementById('mqttStatus');
  const statusDot = statusBadge.querySelector('.status-dot');
  const statusText = statusBadge.querySelector('span:last-child');
  const connectionStatus = document.getElementById('connectionStatus');
  const reconnectBtn = document.getElementById('reconnectBtn');

  if (connected) {
    statusBadge.className = 'status-badge connected';
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Connected';
    connectionStatus.textContent = 'Terhubung';
    reconnectBtn.disabled = true;
    reconnectAttempts = 0;
    addLog('Berhasil terhubung ke MQTT Broker!', 'success');
  } else if (reconnecting) {
    statusBadge.className = 'status-badge reconnecting';
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Reconnecting...';
    connectionStatus.textContent = 'Mencoba terhubung kembali...';
    reconnectBtn.disabled = true;
  } else {
    statusBadge.className = 'status-badge disconnected';
    statusDot.className = 'status-dot inactive';
    statusText.textContent = 'Disconnected';
    connectionStatus.textContent = 'Terputus';
    reconnectBtn.disabled = false;
    addLog('Koneksi terputus dari MQTT Broker.', 'error');
  }
}

// Function to connect to MQTT Broker
function connectMQTT() {
  document.getElementById('mqttServer').textContent = MQTT_CONFIG.host;
  document.getElementById('mqttPort').textContent = MQTT_CONFIG.port;
  document.getElementById('clientId').textContent = MQTT_CONFIG.clientId;

  const wsUrl = `ws://${MQTT_CONFIG.host}:${MQTT_CONFIG.port}`;

  try {
    mqttClient = mqtt.connect(wsUrl, {
      clientId: MQTT_CONFIG.clientId,
      clean: true,
      reconnectPeriod: 5000
    });

    mqttClient.on('connect', function () {
      console.log('✅ Terhubung ke MQTT Broker');
      reconnectAttempts = 0;
      updateMQTTStatus(true);
    });

    mqttClient.on('close', function () {
      console.log('❌ Koneksi MQTT terputus');
      updateMQTTStatus(false, false);
    });

    mqttClient.on('reconnect', function () {
      reconnectAttempts++;
      console.log(`🔄 Mencoba reconnect... (Percobaan ke-${reconnectAttempts})`);
      updateMQTTStatus(false, true);
    });

    mqttClient.on('error', function (error) {
      console.error('⚠️ Error MQTT:', error);
      updateMQTTStatus(false);
      addLog(`Error: ${error.message}`, 'error');
    });

  } catch (error) {
    console.error('⚠️ Gagal koneksi MQTT:', error);
    updateMQTTStatus(false);
    addLog(`Gagal koneksi: ${error.message}`, 'error');
  }
}

// Function to set a quick value
function setQuickValue(inputId, value) {
  document.getElementById(inputId).value = value;
}

// Function to publish data
function publishData(topic, inputId) {
  if (!mqttClient || !mqttClient.connected) {
    addLog('Tidak dapat publish! Belum terhubung ke MQTT Broker.', 'error');
    alert('Belum terhubung ke MQTT Broker! Pastikan Mosquitto sudah running.');
    return;
  }

  const inputElement = document.getElementById(inputId);
  const value = inputElement.value;

  if (!value || value.trim() === '') {
    addLog(`Gagal publish ke ${topic}: Nilai kosong!`, 'error');
    alert('Mohon isi nilai terlebih dahulu!');
    return;
  }

  // Publish to MQTT
  mqttClient.publish(topic, value, { qos: 0, retain: false }, function (err) {
    if (err) {
      console.error('Error publishing:', err);
      addLog(`Gagal publish ke ${topic}: ${err.message}`, 'error');
    } else {
      console.log(`✅ Published to ${topic}: ${value}`);
      addLog(`Berhasil publish ke <strong>${topic}</strong> dengan nilai: <strong>${value}</strong>`, 'success');
    }
  });
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

// Start MQTT connection when the page loads
window.addEventListener('load', function () {
  console.log('🚀 Memulai MQTT Publisher...');
  addLog('Memulai koneksi ke MQTT Broker...', 'info');
  connectMQTT();
});

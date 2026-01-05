const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const path = require("path");
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

// ===== 1. DATABASE SETUP =====
const db = new sqlite3.Database('gps_history.db', (err) => {
    if (err) console.error("❌ Database Connect Error:", err.message);
    else console.log("📅 Connected to SQLite database.");
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS location_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL,
    lng REAL,
    speed REAL,
    temp REAL,           
    organ_mode TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_only DATE DEFAULT (CURRENT_DATE)
  )`);
});

// ===== 2. SERVE WEB FILES =====
app.use(express.static(path.join(__dirname, "public")));

// ===== 3. MQTT SETUP =====
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com");
const TOPIC_TEMP_STATUS  = "fridge/status/temp";
const TOPIC_GPS  = "tracker/gps";

// ===== 4. GLOBAL STATE (พิกัดเริ่มต้น: บางนา) =====
let currentTemp = 0;
let currentGPS = { lat: 13.66913, lng: 100.60842, speed: 0, time: Date.now() }; 
let currentActiveMode = "heart"; 

// ===== 5. MQTT MESSAGE HANDLER =====
mqttClient.on("connect", () => {
    console.log("📡 MQTT Connected");
    mqttClient.subscribe([TOPIC_TEMP_STATUS, TOPIC_GPS]);
});

mqttClient.on("message", (topic, message) => {
    const msgStr = message.toString();

    if (topic === TOPIC_TEMP_STATUS) {
        currentTemp = parseFloat(msgStr);
    }

    if (topic === TOPIC_GPS) {
        try {
            const data = JSON.parse(msgStr);
            currentGPS = {
                lat: data.lat,
                lng: data.lng,
                speed: data.speed || 0,
                time: Date.now()
            };

            if (currentGPS.lat && currentGPS.lng) {
                const stmt = db.prepare("INSERT INTO location_history (lat, lng, temp, speed, organ_mode) VALUES (?, ?, ?, ?, ?)");
                stmt.run(currentGPS.lat, currentGPS.lng, currentTemp, currentGPS.speed, currentActiveMode);
                stmt.finalize();
                console.log(`💾 Auto Saved: Temp ${currentTemp}°C | GPS ${currentGPS.lat}, ${currentGPS.lng}`);
            }
        } catch (e) { 
            console.log("❌ GPS JSON Error:", e.message); 
        }
    }
});

// ===== 6. API ENDPOINTS =====
app.post("/api/set-mode", (req, res) => {
    currentActiveMode = req.body.mode;
    res.json({ ok: true });
});

app.get("/api/status", (req, res) => {
    res.json({ temperature: currentTemp });
});

app.get("/gps", (req, res) => {
    res.json(currentGPS);
});

app.get("/api/recent-history", (req, res) => {
    const sql = `SELECT lat, lng, temp, speed, organ_mode, 
                 datetime(timestamp, 'localtime') as local_time 
                 FROM location_history 
                 ORDER BY id DESC LIMIT 30`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
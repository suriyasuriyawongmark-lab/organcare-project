const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");
const path = require("path");
const sqlite3 = require('sqlite3').verbose(); // ตรวจสอบว่ามีบรรทัดนี้

const app = express();
app.use(cors());
app.use(express.json());

// ===== 1. DATABASE SETUP =====
// สร้างการเชื่อมต่อฐานข้อมูลก่อนการใช้งานเสมอ
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

// ===== 4. GLOBAL STATE =====
let currentTemp = 0; // ตั้งค่าเริ่มต้นเป็น 0
let currentGPS = { lat: null, lng: null, speed: 0, time: null };
let currentActiveMode = "heart"; 

// ===== 5. MQTT MESSAGE HANDLER =====
mqttClient.on("connect", () => {
    console.log("📡 MQTT Connected");
    mqttClient.subscribe([TOPIC_TEMP_STATUS, TOPIC_GPS]);
});

mqttClient.on("message", (topic, message) => {
    const msgStr = message.toString();

    // 1. จัดการข้อมูลอุณหภูมิ
    if (topic === TOPIC_TEMP_STATUS) {
        currentTemp = parseFloat(msgStr);
    }

    // 2. จัดการข้อมูล GPS และบันทึกลง DB
    if (topic === TOPIC_GPS) {
        try {
            const data = JSON.parse(msgStr);
            currentGPS = {
                lat: data.lat,
                lng: data.lng,
                speed: data.speed || 0,
                time: Date.now()
            };

            // บันทึกลง Database ทันทีที่ GPS อัปเดต (ทุก 2 วินาที)
            if (currentGPS.lat !== null && currentGPS.lng !== null) {
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
    console.log("🔄 เปลี่ยนโหมดเป็น:", currentActiveMode);
    res.json({ ok: true });
});

app.get("/api/status", (req, res) => {
    res.json({ temperature: currentTemp });
});

app.get("/gps", (req, res) => {
    res.json(currentGPS);
});

// API สำหรับดึงข้อมูลล่าสุดมาโชว์ตอนรีเฟรชหน้าเว็บ (แก้เรื่องเวลา Timezone แล้ว)
app.get("/api/recent-history", (req, res) => {
    // ใช้ datetime(timestamp, 'localtime') เพื่อให้ได้เวลาไทย (GMT+7)
    const sql = `SELECT lat, lng, temp, speed, organ_mode, 
                 datetime(timestamp, 'localtime') as local_time 
                 FROM location_history 
                 ORDER BY id DESC LIMIT 30`; // ดึง 30 รายการล่าสุด
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
// ===== 7. START SERVER =====
app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
});
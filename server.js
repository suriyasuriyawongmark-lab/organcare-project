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

// ===== 4. GLOBAL STATE & MOCK DATA (พิกัดที่พี่กำหนด) =====
let currentTemp = 24.5; 
// ตั้งค่าเริ่มต้นที่พิกัดบางนาตามที่พี่บอก: 13.66913, 100.60842
let currentGPS = { lat: 13.66913, lng: 100.60842, speed: 0, time: Date.now() };
let currentActiveMode = "heart"; 

// --- ระบบจำลองการเคลื่อนที่ (ส่งค่าปลอมอัตโนมัติ) ---
setInterval(() => {
    // จำลองให้พิกัดขยับทีละนิดรอบๆ จุดที่พี่ให้มา (บางนา)
    currentGPS.lat += (Math.random() - 0.5) * 0.0003; 
    currentGPS.lng += (Math.random() - 0.5) * 0.0003;
    currentGPS.speed = Math.floor(Math.random() * 20) + 40; // สุ่มความเร็ว 40-60 กม./ชม.
    currentGPS.time = Date.now();

    // บันทึกลง Database ทุกๆ 5 วินาที เพื่อให้ตาราง Auto มีข้อมูลเดินตลอด
    const stmt = db.prepare("INSERT INTO location_history (lat, lng, temp, speed, organ_mode) VALUES (?, ?, ?, ?, ?)");
    stmt.run(currentGPS.lat, currentGPS.lng, currentTemp, currentGPS.speed, currentActiveMode);
    stmt.finalize();
    
    console.log(`🤖 [Mock Data] พิกัดจริงปัจจุบัน: ${currentGPS.lat.toFixed(5)}, ${currentGPS.lng.toFixed(5)} | Temp: ${currentTemp}°C`);
}, 5000); 

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
            // ถ้าบอร์ดส่งค่าจริงมา มันจะทับค่าปลอมทันที
            currentGPS = {
                lat: data.lat,
                lng: data.lng,
                speed: data.speed || 0,
                time: Date.now()
            };
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

// ===== 7. START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running at port ${PORT}`);
});

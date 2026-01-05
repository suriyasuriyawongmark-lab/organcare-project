// ================= GLOBAL VARIABLES =================
let historyPathLine = null; 
let forwardPathLine = null; 
let redDestMarker = null;
let currentLat = null, currentLng = null;
const organs = [
    { 
        id: "heart", name: "หัวใจ", minTemp: 4, maxTemp: 8, 
        icon: "https://png.pngtree.com/element_pic/16/10/28/a2b943a7a455905c69cc75a2f7af91a2.jpg" 
    },
    { 
        id: "liver", name: "ตับ", minTemp: 1, maxTemp: 4, 
        icon: "https://png.pngtree.com/element_our/20190529/ourmid/pngtree-human-organ-liver-illustration-image_1229165.jpg" 
    },
    { 
        id: "kidney", name: "ไต", minTemp: 2, maxTemp: 8, 
        icon: "https://png.pngtree.com/element_our/20190529/ourmid/pngtree-human-organ-kidney-illustration-image_1207438.jpg" 
    },
    { 
        id: "lung", name: "ปอด", minTemp: 4, maxTemp: 8, 
        icon: "https://png.pngtree.com/element_pic/16/12/14/e17add59870f2d3ab777d57f7c8aeb80.jpg" 
    }
];

let currentOrgan = null, temperature = null, tempChart = null;
let tempLabels = [], tempData = [], gpsHistory = [], historyLayer = null, map = null, marker = null;

// ================= INIT ON LOAD =================
document.addEventListener("DOMContentLoaded", () => {
    initOrganSelector();
    initTempChart();
    selectOrgan("heart"); // เริ่มต้นที่โหมดหัวใจ
    setInterval(() => { 
        fetchTemperature(); 
        fetchGPS(); 
    }, 2000);
    loadRecentAutoTable();
});

// ================= FUNCTIONS =================
function initOrganSelector() {
    const grid = document.getElementById("organGrid");
    if (!grid) return;

    grid.innerHTML = organs.map(o => `
        <button class="organ-btn" id="btn-${o.id}" onclick="selectOrgan('${o.id}')" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 10px;">
            <img src="${o.icon}" alt="${o.name}" style="width: 40px; height: 40px; margin-bottom: 8px; object-fit: contain;">
            <div style="font-weight: bold; font-size: 14px;">${o.name}</div>
            <div style="font-size: 11px; opacity: 0.7;">${o.minTemp}-${o.maxTemp}°C</div>
        </button>
    `).join("");
}

function selectOrgan(id) {
    currentOrgan = organs.find(o => o.id === id);
    document.querySelectorAll(".organ-btn").forEach(b => b.classList.remove("active"));
    const activeBtn = document.getElementById(`btn-${id}`);
    if (activeBtn) activeBtn.classList.add("active");

    fetch('/api/set-mode', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({mode: id}) 
    });
    updateUI();
}

function fetchTemperature() {
    fetch("/api/status").then(r => r.json()).then(data => {
        if (data.temperature !== null) {
            temperature = data.temperature;
            const tempEl = document.getElementById("temp");
            if (tempEl) tempEl.innerText = temperature.toFixed(1);
            updateUI();
            updateTempChart(temperature);
        }
    });
}

function updateUI() {
    if (!currentOrgan) return;

    // แก้ไข: ใช้ชื่อ name ตรงๆ เพราะใน array ไม่มี nameEn
    const nameEl = document.getElementById("organName");
    const rangeEl = document.getElementById("tempRange");
    const minEl = document.getElementById("minTemp");
    const maxEl = document.getElementById("maxTemp");

    if (nameEl) nameEl.innerText = currentOrgan.name;
    if (rangeEl) rangeEl.innerText = `${currentOrgan.minTemp}°C - ${currentOrgan.maxTemp}°C`;
    if (minEl) minEl.innerText = `${currentOrgan.minTemp}°C`;
    if (maxEl) maxEl.innerText = `${currentOrgan.maxTemp}°C`;

    if (temperature !== null) {
        const bar = document.getElementById("tempBarFill");
        if (bar) bar.style.width = Math.min((temperature / 20) * 100, 100) + "%";

        const isNormal = temperature >= currentOrgan.minTemp && temperature <= currentOrgan.maxTemp;
        const statusText = document.getElementById("statusText");
        const statusDot = document.getElementById("statusDot");

        if (statusText && statusDot) {
            statusText.innerText = isNormal ? "ปกติ" : "ผิดปกติ";
            statusText.style.color = isNormal ? "#22c55e" : "#ef4444";
            statusDot.style.backgroundColor = isNormal ? "#22c55e" : "#ef4444";
            statusDot.style.boxShadow = isNormal ? "0 0 8px #22c55e" : "0 0 8px #ef4444";
        }
    }
}

function fetchGPS() {
    fetch("/gps").then(r => r.json()).then(data => {
        if (!data.lat) return;
        updateMap(data.lat, data.lng);
    });
}
// แก้ไขฟังก์ชัน updateMap ให้เส้นสีฟ้าเป็นเส้นทึบ
function updateMap(lat, lng) {
    currentLat = lat; currentLng = lng;
    const newPos = [lat, lng];
    const tableBody = document.getElementById("autoTableBody");
if (tableBody) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('th-TH'); // วันที่ (31/12/2025)
    const timeStr = now.toLocaleTimeString('th-TH'); // เวลา (16:46:29)
    
    const row = `
        <tr>
            <td style="padding:10px; border-bottom:1px solid #334155;">${dateStr}</td>
            <td style="padding:10px; border-bottom:1px solid #334155;">${timeStr}</td>
            <td style="padding:10px; border-bottom:1px solid #334155; color:var(--secondary); font-weight:bold;">${currentOrgan ? currentOrgan.name : '--'}</td>
            <td style="padding:10px; border-bottom:1px solid #334155; color:#ef4444; font-weight:bold;">${temperature ? temperature.toFixed(1) : '--'}°C</td>
            <td style="padding:10px; border-bottom:1px solid #334155; font-size:11px;">${lat.toFixed(4)}, ${lng.toFixed(4)}</td>
        </tr>`;
    
    tableBody.insertAdjacentHTML('afterbegin', row); // ข้อมูลใหม่ขึ้นก่อน
    }
    gpsHistory.push(newPos);
    if (gpsHistory.length > 200) gpsHistory.shift();

    if (!map) {
        map = L.map("map").setView(newPos, 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
        marker = L.marker(newPos).addTo(map); // หมุดตำแหน่งปัจจุบัน

        // 1. เส้นสีเทา (History): เส้นที่ผ่านไปแล้ว
        historyPathLine = L.polyline(gpsHistory, { 
            color: '#6b7280', 
            weight: 4, 
            opacity: 0.6 
        }).addTo(map);

        // 2. เส้นสีฟ้า (Forward): เส้นทางที่จะไป (แก้ไขเป็นเส้นทึบ)
        forwardPathLine = L.polyline([], { 
            color: '#3b82f6',  // สีฟ้าสดใส
            weight: 5,         // เพิ่มความหนานิดหน่อยให้เห็นชัด
            opacity: 0.9,      // ให้สีเข้มขึ้น
            lineCap: 'round'   // ปลายเส้นมน สวยงาม
            // ลบ dashArray ออกเพื่อให้เป็นเส้นทึบยาวๆ
        }).addTo(map);

    } else {
        marker.setLatLng(newPos);
        historyPathLine.setLatLngs(gpsHistory);
        
        // เรียกคำนวณเส้นทางใหม่ (ถ้ามีปลายทาง)
        if (typeof calculateETA === "function") {
            calculateETA(lat, lng);
        }
    }
}

// ================= ROUTING FUNCTION =================

// ตัวแปรสำหรับป้องกันการเรียก API ถี่เกินไป
let lastRouteTime = 0; 

async function calculateETA(lat, lng) {
    const dest = document.getElementById("destHospital").value;
    
    // 1. ถ้ายังไม่เลือกโรงพยาบาล ให้เคลียร์เส้นและหมุด
    if (!dest) {
        if (forwardPathLine) forwardPathLine.setLatLngs([]);
        if (redDestMarker) map.removeLayer(redDestMarker);
        return;
    }

    const [dLat, dLng] = dest.split(",").map(Number);
    
    // 2. วาดหมุดสีแดงปลายทาง (เหมือนเดิม)
    if (redDestMarker) map.removeLayer(redDestMarker);
    const redIcon = L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
    });
    redDestMarker = L.marker([dLat, dLng], {icon: redIcon}).addTo(map).bindPopup("โรงพยาบาลปลายทาง");

    // 3. เรียก API ขอเส้นทางถนนจริง (OSRM)
    // จำกัดการเรียกไม่ให้เกินทุก 2 วินาที เพื่อไม่ให้ Server บล็อก
    const now = Date.now();
    if (now - lastRouteTime < 2000) return; 
    lastRouteTime = now;

    try {
        // OSRM API: router.project-osrm.org (ฟรี)
        // Format: /route/v1/driving/lon1,lat1;lon2,lat2
        const url = `https://router.project-osrm.org/route/v1/driving/${lng},${lat};${dLng},${dLat}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === "Ok" && data.routes.length > 0) {
            const route = data.routes[0];
            
            // แปลงพิกัดจาก [lon, lat] เป็น [lat, lon] เพื่อใช้กับ Leaflet
            const latLngs = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);

            // วาดเส้นทางถนนจริงลงบนเส้นสีฟ้า
            if (forwardPathLine) {
                forwardPathLine.setLatLngs(latLngs);
            }

            // 4. อัปเดตระยะทางและเวลาจากข้อมูลจริงของการขับรถ
            const distKm = route.distance / 1000; // แปลงเมตรเป็นกิโลเมตร
            const durationMin = Math.round(route.duration / 60); // แปลงวินาทีเป็นนาที

            const distEl = document.getElementById("distVal");
            const etaEl = document.getElementById("etaVal");
            
            if (distEl) distEl.innerText = distKm.toFixed(2) + " กม.";
            if (etaEl) etaEl.innerText = durationMin + " นาที";

            // แจ้งเตือนเมื่อใกล้ถึง (ระยะน้อยกว่า 300 เมตร)
            if (distKm <= 0.3) {
                const statusText = document.getElementById("statusText");
                if (statusText) statusText.innerText = "✨ ถึงจุดหมายแล้ว";
            }
        }
    } catch (error) {
        console.error("Routing Error:", error);
        // Fallback: ถ้าเน็ตหลุดหรือ API ล่ม ให้กลับไปใช้เส้นตรงเหมือนเดิม
        if (forwardPathLine) forwardPathLine.setLatLngs([[lat, lng], [dLat, dLng]]);
    }
}

// ================= CHART & HISTORY =================
function initTempChart() {
    tempChart = new Chart(document.getElementById("tempChart"), {
        type: "line",
        data: { 
            labels: [], 
            datasets: [{ 
                label: "°C", 
                data: [], 
                borderColor: "#ef4444", 
                fill: true, 
                backgroundColor: "rgba(239,68,68,0.1)",
                tension: 0.3 // เพิ่มความโค้งมนให้เส้นกราฟดูสวยขึ้นเมื่อกราฟใหญ่
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, // สำคัญ: ต้องเป็น false เพื่อให้ยืดตามความสูงใน HTML
            scales: { 
                x: { 
                    display: true, // เปิดไว้เพื่อให้เห็นเวลาใต้กราฟชัดขึ้นเมื่อพื้นที่เยอะ
                    ticks: { color: '#94a3b8' } 
                }, 
                y: { 
                    min: 0, 
                    max: 30, // ปรับ Max ตามที่ต้องการ
                    ticks: { 
                        color: '#94a3b8',
                        stepSize: 5 // ปรับระยะห่างตัวเลขแกน Y
                    } 
                } 
            },
            plugins: {
                legend: {
                    labels: { color: '#f8fafc', font: { size: 14 } }
                }
            }
        }
    });
}

function updateTempChart(val) {
    if (!tempChart) return;
    const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    tempLabels.push(now);
    tempData.push(val);
    if (tempLabels.length > 20) { tempLabels.shift(); tempData.shift(); }
    tempChart.data.labels = tempLabels;
    tempChart.data.datasets[0].data = tempData;
    tempChart.update('none');
}

async function loadHistory() {
    const date = document.getElementById("historyDate").value;
    if (!date) return alert("กรุณาเลือกวันที่ต้องการดูครับ");

    const res = await fetch(`/api/history?date=${date}`);
    const data = await res.json();
    const body = document.getElementById("historyTableBody");
    body.innerHTML = "";

    if (historyLayer) map.removeLayer(historyLayer);
    historyLayer = L.featureGroup().addTo(map);
    
    data.forEach(i => {
        // i.timestamp จะได้มาจาก DB (ปี-เดือน-วัน เวลา)
        const time = new Date(i.timestamp).toLocaleTimeString('th-TH');
        
        body.innerHTML += `
            <tr>
                <td>${time}</td>
                <td>${i.organ_mode}</td>
                <td style="color:#ef4444; font-weight:bold;">${i.temp ? i.temp.toFixed(1) : '--'}</td>
                <td>${i.lat.toFixed(4)}, ${i.lng.toFixed(4)}</td>
                <td>${i.speed}</td>
            </tr>`;

        // วาดจุดประวัติบนแผนที่ (สีฟ้าสำหรับประวัติ)
        L.circleMarker([i.lat, i.lng], {
            radius: 3, 
            color: '#3b82f6',
            fillOpacity: 0.5
        }).addTo(historyLayer);
    });

    if (data.length > 0) {
        map.fitBounds(historyLayer.getBounds());
    } else {
        alert("ไม่พบข้อมูลในวันที่เลือก");
    }
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Ogancare - Transport Report", 15, 15);
    doc.autoTable({ html: 'table', startY: 25 });
    doc.save(`Report_${new Date().toLocaleDateString()}.pdf`);
}

async function loadRecentAutoTable() {
    try {
        const res = await fetch('/api/recent-history');
        const data = await res.json();
        const tableBody = document.getElementById("autoTableBody");
        if (!tableBody || !data.length) return;

        tableBody.innerHTML = ""; // ล้างตารางก่อน
        
        data.forEach(item => {
            // item.local_time จะได้รูปแบบ "YYYY-MM-DD HH:MM:SS"
            const parts = item.local_time.split(' ');
            const dateStr = parts[0];
            const timeStr = parts[1];
            
            const row = `
                <tr>
                    <td style="padding:10px; border-bottom:1px solid #334155;">${dateStr}</td>
                    <td style="padding:10px; border-bottom:1px solid #334155;">${timeStr}</td>
                    <td style="padding:10px; border-bottom:1px solid #334155; color:var(--secondary); font-weight:bold;">${item.organ_mode}</td>
                    <td style="padding:10px; border-bottom:1px solid #334155; color:#ef4444; font-weight:bold;">${item.temp ? item.temp.toFixed(1) : '--'}°C</td>
                    <td style="padding:10px; border-bottom:1px solid #334155; font-size:11px;">${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</td>
                </tr>`;
            tableBody.insertAdjacentHTML('beforeend', row);
        });
    } catch (err) {
        console.error("โหลดข้อมูล Auto ไม่สำเร็จ:", err);
    }
}

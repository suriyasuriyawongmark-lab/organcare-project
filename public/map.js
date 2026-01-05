let map;
let marker;

document.addEventListener("DOMContentLoaded", () => {

  // 1️⃣ สร้างแผนที่
  map = L.map("map").setView([13.7563, 100.5018], 15);

  // 2️⃣ โหลด tile map
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19
  }).addTo(map);

  // 3️⃣ สร้าง marker
  marker = L.marker([13.7563, 100.5018]).addTo(map);

  // 4️⃣ อัปเดต GPS ทุก 1 วินาที
  setInterval(updateGPS, 1000);
});

// ================= GPS =================
function updateGPS() {
  fetch("/gps")
    .then(res => res.json())
    .then(data => {
      if (data && data.lat != null && data.lng != null) {
        marker.setLatLng([data.lat, data.lng]);
        map.setView([data.lat, data.lng]);
      }
    })
    .catch(err => console.error("GPS error:", err));
}

// =====================================================
// InfoBarrio OS v2.1 - Mobile-First + OpenStreetMap Real
// =====================================================

const VALENCIA_COORDS = { lat: 10.2146, lng: -68.0076 };

const state = {
  theme: "dark",
  userLat: VALENCIA_COORDS.lat,
  userLng: VALENCIA_COORDS.lng,
  radius: 1000,
  filter: "all",
  places: [],
  watchId: null,
  usingRealGps: false,
  sheetState: "half"
};

// Mapa OpenStreetMap 100% Gratuito (Sin API Key)
const osmLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19
});

const map = L.map("map", {
  center: [state.userLat, state.userLng],
  zoom: 15,
  zoomControl: false,
  layers: [osmLayer]
});

L.control.zoom({ position: "bottomright" }).addTo(map);
const placesLayer = L.layerGroup().addTo(map);

const userIcon = L.divIcon({
  className: "",
  html: `<div class="user-beacon"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10]
});

let userMarker = L.marker([state.userLat, state.userLng], { icon: userIcon }).addTo(map);
let radarCircle = L.circle([state.userLat, state.userLng], {
  radius: state.radius,
  color: "#00f0ff",
  weight: 1.5,
  fillColor: "#00f0ff",
  fillOpacity: 0.08,
  dashArray: "6 6"
}).addTo(map);

const dom = {
  statusText: document.getElementById("status-text"),
  coordsDisplay: document.getElementById("coords-display"),
  countDisplay: document.getElementById("count-display"),
  resultsList: document.getElementById("results-list"),
  scanBtn: document.getElementById("btn-scan"),
  scanBtnText: document.getElementById("scan-btn-text"),
  miniScanBtn: document.getElementById("btn-scan-mini"),
  sourceBadge: document.getElementById("scan-source-badge"),
  themeBtn: document.getElementById("btn-theme"),
  themeIcon: document.getElementById("theme-icon"),
  radiusLabel: document.getElementById("active-radius-label"),
  sheet: document.getElementById("bottom-sheet"),
  dragZone: document.getElementById("sheet-drag-zone"),
  tapToggle: document.getElementById("sheet-tap-toggle")
};

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function updateUserPosition(lat, lng, label) {
  state.userLat = lat;
  state.userLng = lng;
  userMarker.setLatLng([lat, lng]);
  radarCircle.setLatLng([lat, lng]);
  radarCircle.setRadius(state.radius);
  dom.coordsDisplay.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  dom.statusText.textContent = label;
}

function startLiveGPS() {
  if (!("geolocation" in navigator)) {
    updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "MODO DEMO // VALENCIA, VE");
    return;
  }

  dom.statusText.textContent = "BUSCANDO SEÑAL GPS...";

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const firstFix = !state.usingRealGps;
      state.usingRealGps = true;

      updateUserPosition(latitude, longitude, `GPS EN VIVO (±${Math.round(accuracy)}m)`);
      if (firstFix) {
        map.flyTo([latitude, longitude], 15, { duration: 1.1 });
        scanArea();
      }
    },
    () => {
      state.usingRealGps = false;
      updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "VALENCIA, VE (ACTIVA TU GPS)");
      map.setView([VALENCIA_COORDS.lat, VALENCIA_COORDS.lng], 15);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

const DEMO_PROMOS = [
  "2x1 en Hamburguesas HOY",
  "20% OFF pagando en efectivo / divisas",
  "Happy Hour 5PM - 8PM",
  "Combo Callejero Especial Fin de Semana",
  "Bebida gratis con tu almuerzo hoy"
];

function detectSocialAndPromos(tags, index) {
  const igTag = tags["contact:instagram"] || tags["instagram"] || null;
  const webTag = tags["website"] || tags["contact:website"] || null;
  const hasPromo = index % 3 === 0;
  const promoText = hasPromo ? DEMO_PROMOS[index % DEMO_PROMOS.length] : null;
  return { igTag, webTag, promoText };
}

function setScanningUI(isLoading) {
  dom.scanBtn.disabled = isLoading;
  dom.miniScanBtn.disabled = isLoading;
  dom.scanBtn.classList.toggle("loading", isLoading);
  dom.miniScanBtn.classList.toggle("loading", isLoading);
  dom.scanBtnText.textContent = isLoading ? "ESCANEANDO RADAR..." : "⚡ ESCANEAR ZONA EN VIVO";
}

async function fetchOverpass(query) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];
  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(url, { method: "POST", body: query, signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return await res.json();
    } catch (_) {
      // Intenta el siguiente servidor
    }
  }
  throw new Error("Sin respuesta de servidores OSM");
}

async function scanArea() {
  setScanningUI(true);

  const query = `
    [out:json][timeout:12];
    (
      node["amenity"~"restaurant|fast_food|cafe|food_court|ice_cream|bar"](around:${state.radius},${state.userLat},${state.userLng});
      way["amenity"~"restaurant|fast_food|cafe|food_court|ice_cream|bar"](around:${state.radius},${state.userLat},${state.userLng});
    );
    out center 60;
  `;

  try {
    const data = await fetchOverpass(query);
    const parsed = data.elements
      .map((el, idx) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!lat || !lng) return null;

        const tags = el.tags || {};
        const name = tags.name || `Local #${el.id.toString().slice(-4)}`;
        const amenity = tags.amenity || "restaurant";
        const cuisine = tags.cuisine ? tags.cuisine.replace(/;/g, ", ") : amenity;
        const dist = getDistanceMeters(state.userLat, state.userLng, lat, lng);
        const social = detectSocialAndPromos(tags, idx);

        return { id: el.id, name, amenity, cuisine, lat, lng, dist, ...social };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    state.places = parsed;
    dom.sourceBadge.textContent = `OSM (${parsed.length})`;
  } catch (err) {
    state.places = generateFallbackPlaces();
    dom.sourceBadge.textContent = "DEMO OFFLINE";
  } finally {
    setScanningUI(false);
    renderPlaces();
  }
}

function generateFallbackPlaces() {
  const samples = [
    { name: "Pepitos El Viñedo (Demo)", amenity: "fast_food", cuisine: "comida callejera", dLat: 0.0021, dLng: 0.0018 },
    { name: "Arepera La Ceiba (Demo)", amenity: "restaurant", cuisine: "venezolana", dLat: -0.0018, dLng: 0.0025 },
    { name: "Café Bolívar Lab (Demo)", amenity: "cafe", cuisine: "café, postres", dLat: 0.003, dLng: -0.002 }
  ];
  return samples.map((s, i) => {
    const lat = state.userLat + s.dLat;
    const lng = state.userLng + s.dLng;
    return {
      id: i + 1,
      name: s.name,
      amenity: s.amenity,
      cuisine: s.cuisine,
      lat,
      lng,
      dist: getDistanceMeters(state.userLat, state.userLng, lat, lng),
      igTag: "@local_demo",
      webTag: null,
      promoText: DEMO_PROMOS[i]
    };
  });
}

function renderPlaces() {
  placesLayer.clearLayers();

  const filtered = state.places.filter((p) => {
    if (state.filter === "all") return true;
    if (state.filter === "promos") return Boolean(p.promoText);
    return p.amenity === state.filter;
  });

  dom.countDisplay.textContent = filtered.length;

  if (filtered.length === 0) {
    dom.resultsList.innerHTML = `<div class="empty-state">No hay locales registrados en este radio (${state.radius >= 1000 ? state.radius / 1000 + " km" : state.radius + " m"}). Prueba ampliar a <strong>2 km</strong> o pulsa <strong>VE</strong>.</div>`;
    return;
  }

  dom.resultsList.innerHTML = "";

  filtered.forEach((place) => {
    const hasPromo = Boolean(place.promoText);
    const markerColor = hasPromo ? "#ff3b7f" : "#10b981";

    const marker = L.circleMarker([place.lat, place.lng], {
      radius: hasPromo ? 10 : 7,
      color: "#ffffff",
      weight: 2,
      fillColor: markerColor,
      fillOpacity: 0.95
    }).addTo(placesLayer);

    marker.bindPopup(`
      <div style="font-family: 'Space Grotesk', sans-serif; min-width: 170px;">
        <strong>${escapeHtml(place.name)}</strong><br/>
        <small style="opacity:0.8;">${escapeHtml(place.cuisine)} • ${place.dist} m</small>
        ${hasPromo ? `<div style="margin-top:6px; color:#ff3b7f; font-weight:700;">🔥 ${escapeHtml(place.promoText)}</div>` : ""}
        ${place.igTag ? `<div style="margin-top:4px; font-size:0.85em;">📸 ${escapeHtml(place.igTag)}</div>` : ""}
      </div>
    `);

    const card = document.createElement("div");
    card.className = "place-card";
    card.innerHTML = `
      <div class="place-top">
        <span class="place-name">${escapeHtml(place.name)}</span>
        <span class="place-dist">${place.dist} m</span>
      </div>
      <div class="place-meta">🍽️ ${escapeHtml(place.cuisine)}</div>
      ${place.igTag ? `<div class="ig-link">📸 IG: ${escapeHtml(place.igTag)}</div>` : ""}
      ${hasPromo ? `
        <div class="promo-pill">
          <span>🔥 ${escapeHtml(place.promoText)}</span>
          <small class="mono-text">DEMO</small>
        </div>` : ""
      }
    `;

    card.addEventListener("click", () => {
      if (window.innerWidth < 900) {
        setSheetState("peek");
      }
      map.flyTo([place.lat, place.lng], 17, { duration: 0.8 });
      marker.openPopup();
    });

    dom.resultsList.appendChild(card);
  });
}

// Gestos Táctiles del Bottom Sheet
function setSheetState(nextState) {
  state.sheetState = nextState;
  dom.sheet.classList.remove("state-peek", "state-half", "state-full");
  dom.sheet.classList.add(`state-${nextState}`);
}

let dragStartY = 0;
let dragStartHeight = 0;
let isDragging = false;

dom.dragZone.addEventListener("touchstart", (e) => {
  if (window.innerWidth >= 900 || e.target.closest("#btn-scan-mini")) return;
  isDragging = true;
  dragStartY = e.touches[0].clientY;
  dragStartHeight = dom.sheet.getBoundingClientRect().height;
  dom.sheet.classList.add("dragging");
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (!isDragging) return;
  const deltaY = dragStartY - e.touches[0].clientY;
  const vh = window.innerHeight;
  const clamped = Math.max(96, Math.min(vh * 0.86, dragStartHeight + deltaY));
  dom.sheet.style.height = `${clamped}px`;
}, { passive: true });

window.addEventListener("touchend", () => {
  if (!isDragging) return;
  isDragging = false;
  dom.sheet.classList.remove("dragging");

  const finalHeight = dom.sheet.getBoundingClientRect().height;
  const vh = window.innerHeight;
  dom.sheet.style.height = "";

  if (finalHeight < vh * 0.28) setSheetState("peek");
  else if (finalHeight < vh * 0.65) setSheetState("half");
  else setSheetState("full");
});

dom.tapToggle.addEventListener("click", () => {
  if (window.innerWidth >= 900) return;
  const order = { peek: "half", half: "full", full: "peek" };
  setSheetState(order[state.sheetState]);
});

// Controles
document.querySelectorAll(".pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.radius = Number(btn.dataset.radius);
    dom.radiusLabel.textContent = state.radius >= 1000 ? `${state.radius / 1000} km` : `${state.radius} m`;
    radarCircle.setRadius(state.radius);
    scanArea();
  });
});

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    state.filter = chip.dataset.filter;
    renderPlaces();
  });
});

dom.scanBtn.addEventListener("click", scanArea);
dom.miniScanBtn.addEventListener("click", scanArea);

document.getElementById("btn-valencia").addEventListener("click", () => {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.usingRealGps = false;
  updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "VALENCIA, VE (DEMO)");
  map.flyTo([VALENCIA_COORDS.lat, VALENCIA_COORDS.lng], 15, { duration: 1 });
  scanArea();
});

document.getElementById("btn-gps").addEventListener("click", startLiveGPS);

dom.themeBtn.addEventListener("click", () => {
  const isDark = state.theme === "dark";
  state.theme = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  dom.themeIcon.textContent = isDark ? "🌙" : "☀️";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", isDark ? "#f8fafc" : "#050811");

  if (isDark) {
    radarCircle.setStyle({ color: "#0284c7", fillColor: "#0284c7" });
  } else {
    radarCircle.setStyle({ color: "#00f0ff", fillColor: "#00f0ff" });
  }
});

// Arrancar
startLiveGPS();

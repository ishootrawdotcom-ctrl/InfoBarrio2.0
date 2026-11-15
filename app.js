// =====================================================
// InfoBarrio OS v2.3 - 100% Datos Reales OpenStreetMap
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
  hasCenteredOnce: false,
  bestAccuracy: Infinity,
  sheetState: "half"
};

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
  accPill: document.getElementById("gps-accuracy-pill"),
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

function updateUserPosition(lat, lng, label, accLabel = "RADAR ACTIVO") {
  state.userLat = lat;
  state.userLng = lng;
  userMarker.setLatLng([lat, lng]);
  radarCircle.setLatLng([lat, lng]);
  radarCircle.setRadius(state.radius);
  dom.coordsDisplay.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  dom.statusText.textContent = label;
  if (dom.accPill) dom.accPill.textContent = accLabel;
}

function startLiveGPS(forceRecenter = false) {
  if (!("geolocation" in navigator)) {
    updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "MODO VALENCIA", "SIN GPS");
    return;
  }

  if (forceRecenter) {
    state.hasCenteredOnce = false;
    state.bestAccuracy = Infinity;
  }

  dom.statusText.textContent = "CALIBRANDO GPS EXACTO...";

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const acc = Math.round(accuracy);
      const isExact = acc <= 40;
      const statusMsg = isExact ? `GPS EXACTO (±${acc}m)` : `SEÑAL APROX (±${acc}m)`;
      const accBadge = isExact ? `PRECISIÓN: ±${acc}m` : `WIFI/RED: ±${acc}m`;

      const improvedSignificantly = acc < state.bestAccuracy * 0.5 && acc <= 80;
      if (acc < state.bestAccuracy) state.bestAccuracy = acc;

      updateUserPosition(latitude, longitude, statusMsg, accBadge);

      if (!state.hasCenteredOnce || improvedSignificantly) {
        state.hasCenteredOnce = true;
        map.flyTo([latitude, longitude], isExact ? 16 : 15, { duration: 1.0 });
        scanArea();
      }
    },
    () => {
      updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "ACTIVA UBICACIÓN PRECISA", "GPS BLOQUEADO");
      map.setView([VALENCIA_COORDS.lat, VALENCIA_COORDS.lng], 15);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

const CATEGORY_LABELS = {
  restaurant: "Restaurante",
  fast_food: "Comida Rápida / Callejera",
  cafe: "Café",
  food_court: "Feria de Comida",
  ice_cream: "Heladería",
  bar: "Bar / Tasca",
  pub: "Pub",
  bakery: "Panadería",
  pastry: "Pastelería",
  convenience: "Abasto / Mini Market",
  supermarket: "Supermercado",
  beverages: "Licorería / Bebidas",
  butcher: "Carnicería",
  deli: "Charcutería / Bodegón"
};

function formatInstagramUrl(raw) {
  if (!raw) return null;
  const clean = raw.trim();
  if (clean.startsWith("http")) return clean;
  const user = clean.replace(/^@/, "").replace(/\/$/, "");
  return `https://instagram.com/${user}`;
}

function setScanningUI(isLoading) {
  dom.scanBtn.disabled = isLoading;
  dom.miniScanBtn.disabled = isLoading;
  dom.scanBtn.classList.toggle("loading", isLoading);
  dom.miniScanBtn.classList.toggle("loading", isLoading);
  dom.scanBtnText.textContent = isLoading ? "BUSCANDO LOCALES REALES..." : "⚡ ESCANEAR LOCALES REALES";
}

async function fetchOverpass(query) {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
  ];
  const encoded = encodeURIComponent(query.replace(/\s+/g, " ").trim());

  for (const base of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);
      const res = await fetch(`${base}?data=${encoded}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.elements)) return json;
      }
    } catch (_) {}
  }
  throw new Error("Servidores de OpenStreetMap ocupados");
}

async function scanArea() {
  setScanningUI(true);
  dom.sourceBadge.classList.remove("error");
  dom.sourceBadge.textContent = "BUSCANDO...";

  const query = `[out:json][timeout:15];(node["amenity"~"restaurant|fast_food|cafe|food_court|ice_cream|bar|pub"](around:${state.radius},${state.userLat},${state.userLng});way["amenity"~"restaurant|fast_food|cafe|food_court|ice_cream|bar|pub"](around:${state.radius},${state.userLat},${state.userLng});node["shop"~"bakery|pastry|convenience|supermarket|beverages|butcher|deli"](around:${state.radius},${state.userLat},${state.userLng});way["shop"~"bakery|pastry|convenience|supermarket|beverages|butcher|deli"](around:${state.radius},${state.userLat},${state.userLng}););out center 100;`;

  try {
    const data = await fetchOverpass(query);
    const parsed = data.elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!lat || !lng) return null;

        const tags = el.tags || {};
        // Ignorar puntos sin nombre real registrado
        if (!tags.name) return null;

        const rawType = tags.amenity || tags.shop || "restaurant";
        const group = tags.shop ? "shop" : rawType;
        const typeLabel = CATEGORY_LABELS[rawType] || rawType;
        const cuisine = tags.cuisine ? tags.cuisine.replace(/;/g, ", ") : typeLabel;

        const igRaw = tags["contact:instagram"] || tags["instagram"] || null;
        const igUrl = formatInstagramUrl(igRaw);
        const webRaw = tags["website"] || tags["contact:website"] || null;
        const phone = tags["phone"] || tags["contact:phone"] || tags["contact:whatsapp"] || null;
        const hours = tags["opening_hours"] || null;
        const street = tags["addr:street"] || null;

        return {
          id: el.id,
          name: tags.name,
          group,
          typeLabel,
          cuisine,
          lat,
          lng,
          dist: getDistanceMeters(state.userLat, state.userLng, lat, lng),
          igRaw,
          igUrl,
          webRaw,
          phone,
          hours,
          street
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    state.places = parsed;
    dom.sourceBadge.textContent = `REAL (${parsed.length})`;
    renderPlaces();
  } catch (err) {
    state.places = [];
    placesLayer.clearLayers();
    dom.countDisplay.textContent = "0";
    dom.sourceBadge.textContent = "SIN RED";
    dom.sourceBadge.classList.add("error");
    dom.resultsList.innerHTML = `
      <div class="empty-state">
        ⚠️ El servidor público de OpenStreetMap tardó demasiado en responder.<br/><br/>
        Toca <strong>⚡ ESCANEAR LOCALES REALES</strong> de nuevo para reintentar.
      </div>
    `;
  } finally {
    setScanningUI(false);
  }
}

function renderPlaces() {
  placesLayer.clearLayers();

  const filtered = state.places.filter((p) => {
    if (state.filter === "all") return true;
    if (state.filter === "social") return Boolean(p.igUrl || p.webRaw || p.phone);
    return p.group === state.filter;
  });

  dom.countDisplay.textContent = filtered.length;

  if (filtered.length === 0) {
    const rText = state.radius >= 1000 ? `${state.radius / 1000} km` : `${state.radius} m`;
    dom.resultsList.innerHTML = `
      <div class="empty-state">
        No hay comercios con nombre registrados en OpenStreetMap dentro de <strong>${rText}</strong> aquí.<br/><br/>
        Prueba ampliar el radio a <strong>2 km</strong> o <strong>5 km</strong> (o toca <strong>VE</strong> para ver Valencia centro).
      </div>
    `;
    return;
  }

  dom.resultsList.innerHTML = "";

  filtered.forEach((place) => {
    const hasSocial = Boolean(place.igUrl || place.webRaw);
    const markerColor = hasSocial ? "#f472b6" : "#10b981";

    const marker = L.circleMarker([place.lat, place.lng], {
      radius: hasSocial ? 9 : 7,
      color: "#ffffff",
      weight: 2,
      fillColor: markerColor,
      fillOpacity: 0.95
    }).addTo(placesLayer);

    marker.bindPopup(`
      <div style="font-family: 'Space Grotesk', sans-serif; min-width: 175px; max-width: 230px;">
        <strong>${escapeHtml(place.name)}</strong><br/>
        <small style="opacity:0.85;">${escapeHtml(place.typeLabel)} • ${place.dist} m</small>
        ${place.street ? `<div style="margin-top:4px; font-size:0.8em;">📍 ${escapeHtml(place.street)}</div>` : ""}
        ${place.phone ? `<div style="margin-top:4px; font-size:0.8em;">📞 ${escapeHtml(place.phone)}</div>` : ""}
        ${place.igUrl ? `<div style="margin-top:5px;"><a href="${escapeHtml(place.igUrl)}" target="_blank" rel="noopener" style="color:#f472b6; font-weight:700;">📸 Abrir Instagram</a></div>` : ""}
        ${place.webRaw ? `<div style="margin-top:4px;"><a href="${escapeHtml(place.webRaw)}" target="_blank" rel="noopener" style="color:#00f0ff;">🌐 Ver Sitio Web</a></div>` : ""}
      </div>
    `, {
      autoPanPaddingTopLeft: L.point(16, 85),
      autoPanPaddingBottomRight: L.point(70, 120)
    });

    const card = document.createElement("div");
    card.className = "place-card";
    card.innerHTML = `
      <div class="place-top">
        <span class="place-name">${escapeHtml(place.name)}</span>
        <span class="place-dist">${place.dist} m</span>
      </div>
      <div class="place-meta">
        ${escapeHtml(place.typeLabel)}${place.cuisine !== place.typeLabel ? ` • ${escapeHtml(place.cuisine)}` : ""}
        ${place.street ? ` • ${escapeHtml(place.street)}` : ""}
      </div>
      <div class="place-tags">
        ${place.igUrl ? `<a class="tag-badge social" href="${escapeHtml(place.igUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">📸 Instagram</a>` : ""}
        ${place.webRaw ? `<a class="tag-badge" href="${escapeHtml(place.webRaw)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">🌐 Web</a>` : ""}
        ${place.phone ? `<span class="tag-badge">📞 ${escapeHtml(place.phone)}</span>` : ""}
        ${place.hours ? `<span class="tag-badge">🕒 ${escapeHtml(place.hours)}</span>` : ""}
      </div>
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
  state.hasCenteredOnce = true;
  updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "VALENCIA, VE (PRUEBA)", "MODO PRUEBA");
  map.flyTo([VALENCIA_COORDS.lat, VALENCIA_COORDS.lng], 15, { duration: 1 });
  scanArea();
});

document.getElementById("btn-gps").addEventListener("click", () => startLiveGPS(true));

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
startLiveGPS(true);

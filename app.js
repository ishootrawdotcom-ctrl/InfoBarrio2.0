// =====================================================
// InfoBarrio OS v1.0 - Motor Geoespacial en Tiempo Real
// =====================================================

const VALENCIA_COORDS = { lat: 10.2146, lng: -68.0076 }; // Av. Bolívar Norte / El Viñedo, Valencia, VE

const state = {
  theme: "dark",
  userLat: VALENCIA_COORDS.lat,
  userLng: VALENCIA_COORDS.lng,
  radius: 1000,
  places: [],
  watchId: null,
  usingRealGps: false
};

// Capas de Mapa (Día vs Noche)
const TILE_LAYERS = {
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 20
  }),
  light: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 20
  })
};

// Inicializar Mapa
const map = L.map("map", {
  center: [state.userLat, state.userLng],
  zoom: 15,
  zoomControl: false,
  layers: [TILE_LAYERS.dark]
});

L.control.zoom({ position: "bottomright" }).addTo(map);

// Capa de marcadores de locales
const placesLayer = L.layerGroup().addTo(map);

// Marcador del usuario (Beacon cibernético)
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

// Referencias DOM
const dom = {
  statusText: document.getElementById("status-text"),
  coordsDisplay: document.getElementById("coords-display"),
  countDisplay: document.getElementById("count-display"),
  resultsList: document.getElementById("results-list"),
  scanBtn: document.getElementById("btn-scan"),
  scanBtnText: document.getElementById("scan-btn-text"),
  categoryFilter: document.getElementById("category-filter"),
  sourceBadge: document.getElementById("scan-source-badge"),
  themeBtn: document.getElementById("btn-theme"),
  themeIcon: document.getElementById("theme-icon"),
  sidebar: document.getElementById("hud-panel"),
  togglePanelBtn: document.getElementById("btn-toggle-panel")
};

// Escapar HTML para evitar inyecciones de datos externos
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

// Fórmula Haversine para distancia exacta en metros
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

// Actualizar posición en mapa y telemetría
function updateUserPosition(lat, lng, label) {
  state.userLat = lat;
  state.userLng = lng;

  userMarker.setLatLng([lat, lng]);
  radarCircle.setLatLng([lat, lng]);
  radarCircle.setRadius(state.radius);

  dom.coordsDisplay.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  dom.statusText.textContent = label;
}

// Activar GPS en vivo
function startLiveGPS() {
  if (!("geolocation" in navigator)) {
    updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "GPS NO DISPONIBLE // MODO VALENCIA");
    return;
  }

  dom.statusText.textContent = "BUSCANDO SEÑAL SATELITAL EN VIVO...";

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
        map.flyTo([latitude, longitude], 15, { duration: 1.2 });
        scanArea();
      }
    },
    (err) => {
      console.warn("Error GPS:", err.message);
      state.usingRealGps = false;
      updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "MODO DEMO: VALENCIA, VE (ACTIVA GPS PARA VIVO)");
      map.setView([VALENCIA_COORDS.lat, VALENCIA_COORDS.lng], 15);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

// Simulador de detección de ofertas en redes (Fase 1 Demo)
const DEMO_PROMOS = [
  "2x1 en Hamburguesas HOY",
  "20% OFF pagando en divisas / efectivo",
  "Happy Hour 5PM - 8PM",
  "Combo Callejero Especial Fin de Semana",
  "Bebida gratis con tu almuerzo hoy"
];

function detectSocialAndPromos(tags, index) {
  const igTag = tags["contact:instagram"] || tags["instagram"] || null;
  const webTag = tags["website"] || tags["contact:website"] || null;

  // En fase 1 simulamos la detección IA en ~40% de los locales
  const hasPromo = index % 3 === 0;
  const promoText = hasPromo ? DEMO_PROMOS[index % DEMO_PROMOS.length] : null;

  return { igTag, webTag, promoText };
}

// Consultar OpenStreetMap Overpass API en tiempo real
async function scanArea() {
  dom.scanBtn.disabled = true;
  dom.scanBtn.classList.add("loading");
  dom.scanBtnText.textContent = "ESCANEANDO RADAR...";

  const query = `
    [out:json][timeout:15];
    (
      node["amenity"~"restaurant|fast_food|cafe|food_court|ice_cream|bar"](around:${state.radius},${state.userLat},${state.userLng});
      way["amenity"~"restaurant|fast_food|cafe|food_court|ice_cream|bar"](around:${state.radius},${state.userLat},${state.userLng});
    );
    out center 60;
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 14000);

    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: query,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error("Overpass API saturada");
    const data = await res.json();

    const parsed = data.elements
      .map((el, idx) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        if (!lat || !lng) return null;

        const tags = el.tags || {};
        const name = tags.name || `Local Gastronómico #${el.id.toString().slice(-4)}`;
        const amenity = tags.amenity || "restaurant";
        const cuisine = tags.cuisine ? tags.cuisine.replace(/;/g, ", ") : amenity;
        const dist = getDistanceMeters(state.userLat, state.userLng, lat, lng);
        const social = detectSocialAndPromos(tags, idx);

        return { id: el.id, name, amenity, cuisine, lat, lng, dist, ...social };
      })
      .filter(Boolean)
      .sort((a, b) => a.dist - b.dist);

    state.places = parsed;
    dom.sourceBadge.textContent = `OSM LIVE (${parsed.length})`;
  } catch (err) {
    console.warn("Fallback local por error de red:", err);
    state.places = generateFallbackPlaces();
    dom.sourceBadge.textContent = "MODO OFFLINE DEMO";
  } finally {
    dom.scanBtn.disabled = false;
    dom.scanBtn.classList.remove("loading");
    dom.scanBtnText.textContent = "⚡ ESCANEAR ZONA EN VIVO";
    renderPlaces();
  }
}

// Respaldo si Overpass tarda mucho
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

// Dibujar resultados en el mapa y en el panel
function renderPlaces() {
  placesLayer.clearLayers();
  const filter = dom.categoryFilter.value;

  const filtered = state.places.filter((p) => {
    if (filter === "all") return true;
    if (filter === "promos") return Boolean(p.promoText);
    return p.amenity === filter;
  });

  dom.countDisplay.textContent = filtered.length;

  if (filtered.length === 0) {
    dom.resultsList.innerHTML = `<div class="empty-state">No se encontraron locales con este filtro en ${state.radius}m.</div>`;
    return;
  }

  dom.resultsList.innerHTML = "";

  filtered.forEach((place) => {
    const hasPromo = Boolean(place.promoText);
    const markerColor = hasPromo ? "#ff3b7f" : "#10b981";

    const marker = L.circleMarker([place.lat, place.lng], {
      radius: hasPromo ? 9 : 7,
      color: "#ffffff",
      weight: 2,
      fillColor: markerColor,
      fillOpacity: 0.95
    }).addTo(placesLayer);

    const popupHtml = `
      <div style="font-family: 'Space Grotesk', sans-serif; min-width: 180px;">
        <strong>${escapeHtml(place.name)}</strong><br/>
        <small style="opacity:0.8;">${escapeHtml(place.cuisine)} • ${place.dist} m</small>
        ${hasPromo ? `<div style="margin-top:6px; color:#ff3b7f; font-weight:700;">🔥 ${escapeHtml(place.promoText)} <small>(Demo)</small></div>` : ""}
        ${place.igTag ? `<div style="margin-top:4px; font-size:0.8em;">📸 IG: ${escapeHtml(place.igTag)}</div>` : ""}
      </div>
    `;
    marker.bindPopup(popupHtml);

    const card = document.createElement("div");
    card.className = "place-card";
    card.innerHTML = `
      <div class="place-top">
        <span class="place-name">${escapeHtml(place.name)}</span>
        <span class="place-dist">${place.dist} m</span>
      </div>
      <div class="place-meta">🍽️ ${escapeHtml(place.cuisine)}</div>
      ${place.igTag ? `<div class="ig-link">📸 Instagram detectado: ${escapeHtml(place.igTag)}</div>` : ""}
      ${hasPromo ? `
        <div class="promo-pill">
          <span>🔥 ${escapeHtml(place.promoText)}</span>
          <small class="mono-text">DEMO</small>
        </div>` : ""
      }
    `;

    card.addEventListener("click", () => {
      map.flyTo([place.lat, place.lng], 17, { duration: 0.8 });
      marker.openPopup();
    });

    dom.resultsList.appendChild(card);
  });
}

// =====================================================
// Eventos de Interfaz
// =====================================================

// Selector de Radio (500m, 1km, 2km)
document.querySelectorAll(".pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.radius = Number(btn.dataset.radius);
    radarCircle.setRadius(state.radius);
    scanArea();
  });
});

dom.scanBtn.addEventListener("click", scanArea);
dom.categoryFilter.addEventListener("change", renderPlaces);

// Botón Valencia, VE
document.getElementById("btn-valencia").addEventListener("click", () => {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.usingRealGps = false;
  updateUserPosition(VALENCIA_COORDS.lat, VALENCIA_COORDS.lng, "UBICACIÓN SIMULADA // VALENCIA, VE");
  map.flyTo([VALENCIA_COORDS.lat, VALENCIA_COORDS.lng], 15, { duration: 1 });
  scanArea();
});

// Botón GPS Real
document.getElementById("btn-gps").addEventListener("click", () => {
  startLiveGPS();
});

// Modo Día / Noche
dom.themeBtn.addEventListener("click", () => {
  const isDark = state.theme === "dark";
  state.theme = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", state.theme);
  dom.themeIcon.textContent = isDark ? "🌙" : "☀️";

  if (isDark) {
    map.removeLayer(TILE_LAYERS.dark);
    TILE_LAYERS.light.addTo(map);
    radarCircle.setStyle({ color: "#0284c7", fillColor: "#0284c7" });
  } else {
    map.removeLayer(TILE_LAYERS.light);
    TILE_LAYERS.dark.addTo(map);
    radarCircle.setStyle({ color: "#00f0ff", fillColor: "#00f0ff" });
  }
});

// Minimizar panel lateral en móvil/desktop
dom.togglePanelBtn.addEventListener("click", () => {
  dom.sidebar.classList.toggle("collapsed");
  dom.togglePanelBtn.textContent = dom.sidebar.classList.contains("collapsed") ? "▴" : "▾";
});

// Arranque inicial
startLiveGPS();

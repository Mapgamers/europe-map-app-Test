// ---------------------------------------------------------------
// MAP SETUP
// ---------------------------------------------------------------
const map = L.map("map", {
  zoomControl: false,
  minZoom: 3,
  maxZoom: 18
}).setView(MAP_CENTER, MAP_ZOOM);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: "abcd",
  maxZoom: 19
}).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Hillshade/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Hillshade: USGS, Esri",
  maxZoom: 13,
  opacity: 1
}).addTo(map);
L.tileLayer("tiles/{z}/{x}/{y}.png", {
  minZoom: 2,
  maxZoom: 9,
  opacity: 0.6
}).addTo(map);
// ---------------------------------------------------------------
// FEATURE INFO PANEL
// ---------------------------------------------------------------
const infoEl = document.getElementById("feature-info");

function showFeatureInfo(props, popupFields) {
  const keys =
    popupFields && popupFields.length ? popupFields : Object.keys(props || {});

  if (!keys.length) {
    infoEl.innerHTML = `<p class="empty">No attributes on this feature.</p>`;
    return;
  }

  const rows = keys
    .filter((k) => props[k] !== undefined)
    .map(
      (k) =>
        `<div class="info-row"><span class="info-key">${escapeHtml(
          k
        )}</span><span class="info-val">${escapeHtml(String(props[k]))}</span></div>`
    )
    .join("");

  infoEl.classList.remove("empty");
  infoEl.innerHTML = rows;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// LAYER STYLING HELPERS
// ---------------------------------------------------------------
function pointToLayer(color, iconCfg) {
  if (iconCfg && iconCfg.url) {
    const w = iconCfg.width || 24;
    const h = iconCfg.height || 24;
    const customIcon = L.icon({
      iconUrl: iconCfg.url,
      iconSize: [w, h],
      iconAnchor: [w / 2, h] // bottom-center, like a pin
    });
    return (feature, latlng) => L.marker(latlng, { icon: customIcon });
  }

  return (feature, latlng) =>
  L.circleMarker(latlng, {
    radius: 3,
    fillColor: color,
    color: "#1a1a1a",
    weight: 1,
    fillOpacity: 0.85
  });
}

function styleFor(color, type, dashed) {
  if (type === "line") {
    return {
      color: color,
      weight: 2.5,
      opacity: 0.9,
      dashArray: dashed ? "6, 6" : null
    };
  }
  // polygon
  return {
    color: color,
    weight: 1.5,
    fillColor: color,
    fillOpacity: 0.25
  };
}

// ---------------------------------------------------------------
// LOAD LAYERS
// ---------------------------------------------------------------
const layerListEl = document.getElementById("layer-list");
const activeLayers = {}; // id -> Leaflet layer

async function loadLayer(cfg) {
  try {
    const res = await fetch(cfg.file);
    if (!res.ok) throw new Error(`${cfg.file} not found (${res.status})`);
    const geojson = await res.json();

    const layerOptions = {
  onEachFeature: (feature, lyr) => {
    lyr.on("click", () => showFeatureInfo(feature.properties, cfg.popupFields));

    if (cfg.labelField && feature.properties && feature.properties[cfg.labelField]) {
  lyr.bindTooltip(String(feature.properties[cfg.labelField]), {
    permanent: true,
    direction: "right",
    offset: [8, 0],
    className: "map-label"
  });

  const minZ = cfg.minLabelZoom || 0;
  const updateLabelVisibility = () => {
    if (map.getZoom() >= minZ) {
      lyr.openTooltip();
    } else {
      lyr.closeTooltip();
    }
  };
  map.on("zoomend", updateLabelVisibility);
  updateLabelVisibility();
}
  }
};

    if (cfg.type === "point") {
      layerOptions.pointToLayer = pointToLayer(cfg.color, cfg.icon);
    } else {
      layerOptions.style = styleFor(cfg.color, cfg.type, cfg.dashed);
    }

    const lyr = L.geoJSON(geojson, layerOptions);
    activeLayers[cfg.id] = lyr;

    if (cfg.visible) lyr.addTo(map);

    buildLayerRow(cfg, true);
  } catch (err) {
    console.error(`Failed to load layer "${cfg.label}":`, err);
    buildLayerRow(cfg, false);
  }
}

function buildLayerRow(cfg, loaded) {
  const row = document.createElement("label");
  row.className = "layer-row" + (loaded ? "" : " layer-row--error");

  const swatch =
    cfg.icon && cfg.icon.url
      ? `<img class="swatch swatch--icon" src="${cfg.icon.url}" alt="" />`
      : `<span class="swatch" style="background:${cfg.color}"></span>`;
  const checkbox = loaded
    ? `<input type="checkbox" data-id="${cfg.id}" ${cfg.visible ? "checked" : ""} />`
    : `<input type="checkbox" disabled />`;
  const status = loaded ? "" : `<span class="layer-error">missing file</span>`;

  row.innerHTML = `${checkbox}${swatch}<span class="layer-label">${escapeHtml(
    cfg.label
  )}</span>${status}`;

  layerListEl.appendChild(row);

  if (loaded) {
    row.querySelector("input").addEventListener("change", (e) => {
      const lyr = activeLayers[cfg.id];
      if (e.target.checked) {
        lyr.addTo(map);
      } else {
        map.removeLayer(lyr);
      }
    });
  }
}

// Kick off loading
LAYERS.forEach(loadLayer);

// ---------------------------------------------------------------
// MOBILE PANEL TOGGLE
// ---------------------------------------------------------------
const panel = document.getElementById("panel");
const panelToggle = document.getElementById("panel-toggle");
panelToggle.addEventListener("click", () => {
  panel.classList.toggle("panel--open");
});

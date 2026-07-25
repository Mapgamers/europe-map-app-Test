// ---------------------------------------------------------------
// MAP SETUP
// ---------------------------------------------------------------
const map = L.map("map", {
  zoomControl: false,
  minZoom: 3,
  maxZoom: 18,
  renderer: L.canvas()
}).setView(MAP_CENTER, MAP_ZOOM);

L.control.zoom({ position: "bottomright" }).addTo(map);
L.control.ruler({
  position: "bottomright",
  lengthUnit: {
    display: "km",
    decimal: 2,
    factor: null,
    label: "Distance:"
  }
}).addTo(map);

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
      iconAnchor: [w / 2, h]
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
  return {
    color: color,
    weight: 1.5,
    fillColor: color,
    fillOpacity: 0.25
  };
}

// ---------------------------------------------------------------
// LABEL VISIBILITY (single global handler, no load-time flash)
// ---------------------------------------------------------------
const labeledMarkers = []; // { lyr, minZoom }

function updateAllLabels() {
  const z = map.getZoom();
  labeledMarkers.forEach(({ lyr, minZoom }) => {
    if (z >= minZoom) {
      lyr.openTooltip();
    } else {
      lyr.closeTooltip();
    }
  });
}

// ---------------------------------------------------------------
// VIEWPORT-BASED RENDERING
// ---------------------------------------------------------------
// Instead of adding every feature to the map at once, each feature
// is built as its own tiny layer and only actually attached to the
// map when it's within (or near) the current view. Off-screen
// features get detached until you scroll back to them. This keeps
// draw/interaction performance high even with large datasets.
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const viewportLayers = []; // entries needing refresh on move/zoom

function refreshViewport(entry) {
  if (!entry.viewportItems) return; // clustered layers manage themselves
  const viewBounds = map.getBounds().pad(0.25);

  entry.viewportItems.forEach((item) => {
    const shouldShow = viewBounds.intersects(item.bounds);
    if (shouldShow && !item.onMap) {
      entry.container.addLayer(item.layer);
      item.onMap = true;
    } else if (!shouldShow && item.onMap) {
      entry.container.removeLayer(item.layer);
      item.onMap = false;
    }
  });
}

const refreshAllViewports = debounce(() => {
  viewportLayers.forEach(refreshViewport);
}, 120);

map.on("moveend zoomend", refreshAllViewports);

// ---------------------------------------------------------------
// LOAD LAYERS
// ---------------------------------------------------------------
const layerListEl = document.getElementById("layer-list");
const activeLayers = {}; // id -> { container, viewportItems }

function makeLayerOptions(cfg) {
  return {
    renderer: L.canvas(),
    pointToLayer: cfg.type === "point" ? pointToLayer(cfg.color, cfg.icon) : undefined,
    style: cfg.type !== "point" ? styleFor(cfg.color, cfg.type, cfg.dashed) : undefined,
    onEachFeature: (feature, lyr) => {
      lyr.on("click", () => showFeatureInfo(feature.properties, cfg.popupFields));

      if (cfg.labelField && feature.properties && feature.properties[cfg.labelField]) {
        lyr.bindTooltip(String(feature.properties[cfg.labelField]), {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "map-label"
        });
        labeledMarkers.push({ lyr, minZoom: cfg.minLabelZoom || 0 });
      }
    }
  };
}

function buildLeafletLayer(cfg, geojson) {
  const options = makeLayerOptions(cfg);

  // Clustering handles its own performance/visibility — skip viewport logic.
  if (cfg.type === "point" && cfg.cluster && window.L.markerClusterGroup) {
    const clusterGroup = L.markerClusterGroup({
      disableClusteringAtZoom: cfg.clusterMaxZoom || 10,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false
    });
    const geoLayer = L.geoJSON(geojson, options);
    clusterGroup.addLayer(geoLayer);
    return { container: clusterGroup, viewportItems: null };
  }

  // Build each feature as its own small layer, don't attach yet.
  const container = L.layerGroup();
  const viewportItems = [];

  (geojson.features || []).forEach((feature) => {
    const single = L.geoJSON(feature, options);
    let bounds;
    try {
      bounds = single.getBounds();
      if (!bounds.isValid()) return;
    } catch (e) {
      return;
    }
    viewportItems.push({ layer: single, bounds, onMap: false });
  });

  return { container, viewportItems };
}

async function loadLayer(cfg) {
  try {
    const res = await fetch(cfg.file);
    if (!res.ok) throw new Error(`${cfg.file} not found (${res.status})`);
    const geojson = await res.json();

    const entry = buildLeafletLayer(cfg, geojson);
    activeLayers[cfg.id] = entry;

    if (entry.viewportItems) viewportLayers.push(entry);

    if (cfg.visible) {
      entry.container.addTo(map);
      refreshViewport(entry);
    }

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
      const entry = activeLayers[cfg.id];
      if (e.target.checked) {
        entry.container.addTo(map);
        refreshViewport(entry);
        updateAllLabels();
      } else {
        map.removeLayer(entry.container);
      }
    });
  }
}

Promise.all(LAYERS.map(loadLayer)).then(() => {
  updateAllLabels();
});

// ---------------------------------------------------------------
// MOBILE PANEL TOGGLE
// ---------------------------------------------------------------
const panel = document.getElementById("panel");
const panelToggle = document.getElementById("panel-toggle");
panelToggle.addEventListener("click", () => {
  panel.classList.toggle("panel--open");
});
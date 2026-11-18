// ---------------------------------------------------------------
// MAP SETUP
// ---------------------------------------------------------------
const map = L.map("map", {
  zoomControl: false,
  minZoom: 3,
  maxZoom: 18,
  renderer: L.canvas(),
  zoomAnimation: false
}).setView(MAP_CENTER, MAP_ZOOM);

map.createPane("polygonPane");
map.getPane("polygonPane").style.zIndex = 410;

map.createPane("linePane");
map.getPane("linePane").style.zIndex = 420;

map.createPane("pointPane");
map.getPane("pointPane").style.zIndex = 430;

const polygonRenderer = L.canvas({ pane: "polygonPane" });
const lineRenderer = L.canvas({ pane: "linePane" });
const pointRenderer = L.canvas({ pane: "pointPane" });

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

const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  subdomains: "abc",
  maxZoom: 19
}).addTo(map);

document.getElementById("osm-toggle").addEventListener("change", (e) => {
  if (e.target.checked) {
    osmLayer.addTo(map);
    osmLayer.bringToBack(); // keeps it underneath the hillshade and forest tiles
  } else {
    map.removeLayer(osmLayer);
  }
});

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Hillshade/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Hillshade: USGS, Esri",
  maxZoom: 13,
  opacity: 1
}).addTo(map);

const forestLayer = L.tileLayer("tiles/{z}/{x}/{y}.png", {
  minZoom: 2,
  maxZoom: 7,
  maxNativeZoom: 7,                        // never request tiles deeper than zoom 7; Leaflet stretches them instead
  bounds: [[31.9, -23.5], [73.1, 56.9]],   // only request tiles inside the forest data's area
  updateWhenIdle: true,                    // wait until you stop panning before loading tiles
  opacity: 0.6
});

document.getElementById("forest-toggle").addEventListener("change", (e) => {
  if (e.target.checked) {
    forestLayer.addTo(map);
  } else {
    map.removeLayer(forestLayer);
  }
});

// ---------------------------------------------------------------
// SUPABASE CONNECTION (fortress ownership data)
// ---------------------------------------------------------------
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const ownershipCache = {}; // tableName -> { featureId: { owner, color } }

let isAdmin = false;

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  isAdmin = !!data.session;
  updateAuthUI();
}

function updateAuthUI() {
  document.getElementById("auth-logged-out").style.display = isAdmin ? "none" : "block";
  document.getElementById("auth-logged-in").style.display = isAdmin ? "block" : "none";
  if (typeof refreshAllUnitDraggability === "function") refreshAllUnitDraggability();
  if (typeof renderDate === "function") renderDate();
}

document.getElementById("auth-login-btn").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-password").value;
  const statusEl = document.getElementById("auth-status");

  statusEl.textContent = "Logging in...";
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    statusEl.textContent = "Login failed.";
  } else {
    statusEl.textContent = "";
    isAdmin = true;
    updateAuthUI();
  }
});

document.getElementById("auth-logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  isAdmin = false;
  updateAuthUI();
});

checkSession();

async function loadOwnership(cfg) {
  const table = cfg.ownershipTable;
  if (ownershipCache[table]) return; // already loaded

  const { data, error } = await supabaseClient.from(table).select("*");
  if (error) {
    console.error(`Failed to load ownership for ${table}:`, JSON.stringify(error));
    ownershipCache[table] = {};
    return;
  }
  const idCol = cfg.ownershipIdColumn;
  const map = {};
  data.forEach((row) => {
    map[row[idCol]] = { owner: row.owner, color: row.color };
  });
  ownershipCache[table] = map;
}

async function saveOwnership(cfg, featureId, faction) {
  const table = cfg.ownershipTable;
  const idCol = cfg.ownershipIdColumn;

  const { error } = await supabaseClient
    .from(table)
    .upsert(
      { [idCol]: featureId, owner: faction.name, color: faction.color },
      { onConflict: idCol }
    );
  if (error) {
    console.error(`Failed to save ownership for ${table}:`, JSON.stringify(error));
    return false;
  }
  if (!ownershipCache[table]) ownershipCache[table] = {};
  ownershipCache[table][featureId] = { owner: faction.name, color: faction.color };
  return true;
}

// ---------------------------------------------------------------
// FEATURE INFO PANEL
// ---------------------------------------------------------------
const infoEl = document.getElementById("feature-info");

function clearFeatureInfo() {
  infoEl.classList.add("empty");
  infoEl.innerHTML = "Click a feature on the map for details.";
}

function showFeatureInfo(props, popupFields) {
  lastInfoShownAt = Date.now();

  const keys =
    popupFields && popupFields.length ? popupFields : Object.keys(props || {});

  const closeBtn = `<button id="clear-info-btn" class="clear-info-btn">✕ Close</button>`;

  if (!keys.length) {
    infoEl.classList.remove("empty");
    infoEl.innerHTML = closeBtn + `<p class="empty">No attributes on this feature.</p>`;
  } else {
    const rows = keys
      .filter((k) => props[k] !== undefined && !String(k).startsWith("_"))
      .map(
        (k) =>
          `<div class="info-row"><span class="info-key">${escapeHtml(
            k
          )}</span><span class="info-val">${escapeHtml(String(props[k]))}</span></div>`
      )
      .join("");

    infoEl.classList.remove("empty");
    infoEl.innerHTML = closeBtn + rows;
  }

  document.getElementById("clear-info-btn").addEventListener("click", clearFeatureInfo);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// BASTION OWNERSHIP EDITOR (appends to the feature-info panel)
// ---------------------------------------------------------------
function renderOwnershipEditor(feature, lyr, cfg) {
  const featureId = feature.properties.id;
  const currentOwnerName = feature.properties._owner || "None";
  const optionsHtml = FACTIONS.map(
    (f) =>
      `<option value="${escapeHtml(f.name)}" ${
        f.name === currentOwnerName ? "selected" : ""
      }>${escapeHtml(f.name)}</option>`
  ).join("");

  const editorHtml = `
    <div class="bastion-editor">
      <label class="bastion-editor-label">Assign owner</label>
      <select id="bastion-owner-select">${optionsHtml}</select>
      <button id="bastion-save-btn">Save</button>
      <span id="bastion-save-status"></span>
    </div>
  `;

  infoEl.insertAdjacentHTML("beforeend", editorHtml);

  document.getElementById("bastion-save-btn").addEventListener("click", async () => {
    const select = document.getElementById("bastion-owner-select");
    const chosenName = select.value;
    const faction = FACTIONS.find((f) => f.name === chosenName);
    const statusEl = document.getElementById("bastion-save-status");

    statusEl.textContent = "Saving...";
    const success = await saveOwnership(cfg, featureId, faction);

    if (success) {
      feature.properties._owner = faction.name;
      feature.properties._ownerColor = faction.color;
      lyr.setIcon(buildBastionIcon(feature, lyr._iconCfg));
      statusEl.textContent = "Saved.";
    } else {
      statusEl.textContent = "Failed to save.";
    }
  });
}

// ---------------------------------------------------------------
// LAYER STYLING HELPERS
// ---------------------------------------------------------------
function buildBastionIcon(feature, iconCfg) {
  const w = iconCfg.width || 24;
  const h = iconCfg.height || 24;
  const tintColor = feature.properties._ownerColor || iconCfg.defaultColor || "#e8a33d";
  const outline = "#1a1a1a";
  const badgeSize = Math.max(w, h) * 1.25;

  const html = `
    <div style="
      width:${badgeSize}px;
      height:${badgeSize}px;
      border-radius:50%;
      background:${outline};
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    ">
      <div style="
        width:${w}px;
        height:${h}px;
        background-color:${tintColor};
        -webkit-mask-image:url('${iconCfg.url}');
        mask-image:url('${iconCfg.url}');
        -webkit-mask-size:contain;
        mask-size:contain;
        -webkit-mask-repeat:no-repeat;
        mask-repeat:no-repeat;
        -webkit-mask-position:center;
        mask-position:center;
      "></div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: "",
    iconSize: [badgeSize, badgeSize],
    iconAnchor: [badgeSize / 2, badgeSize]
  });
}

function pointToLayer(color, iconCfg) {
  if (iconCfg && iconCfg.url) {
    return (feature, latlng) => {
      const cfgWithDefault = { ...iconCfg, defaultColor: color };
      const icon = buildBastionIcon(feature, cfgWithDefault);
      const marker = L.marker(latlng, { icon });
      marker._iconCfg = cfgWithDefault; // stashed here for later re-coloring on save
      return marker;
    };
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
// LABEL VISIBILITY + COLLISION AVOIDANCE
// ---------------------------------------------------------------
const labeledMarkers = []; // { lyr, minZoom, priority }

function updateAllLabels() {
  const z = map.getZoom();
  labeledMarkers.forEach(({ lyr, minZoom }) => {
    if (z >= minZoom) {
      lyr.openTooltip();
    } else {
      lyr.closeTooltip();
    }
  });
  requestAnimationFrame(resolveLabelCollisions);
}

function resolveLabelCollisions() {
  const acceptedRects = [];

  // Only bother with markers that actually have a rendered tooltip
  // right now — skips the vast majority when most of the dataset
  // is off-screen or below minFeatureZoom.
  const visibleMarkers = labeledMarkers.filter(({ lyr }) => {
    const tooltip = lyr.getTooltip && lyr.getTooltip();
    return tooltip && tooltip.isOpen() && tooltip.getElement();
  });

  const sortedMarkers = visibleMarkers.sort((a, b) => b.priority - a.priority);

  sortedMarkers.forEach(({ lyr }) => {
    const tooltip = lyr.getTooltip();
    const el = tooltip.getElement();

    el.style.visibility = "visible";

    const rect = el.getBoundingClientRect();
    const overlaps = acceptedRects.some(
      (r) =>
        rect.left < r.right &&
        rect.right > r.left &&
        rect.top < r.bottom &&
        rect.bottom > r.top
    );

    if (overlaps) {
      el.style.visibility = "hidden";
    } else {
      acceptedRects.push(rect);
    }
  });
}

// ---------------------------------------------------------------
// VIEWPORT-BASED RENDERING
// ---------------------------------------------------------------
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

const viewportLayers = [];

function refreshViewport(entry) {
  if (!entry.viewportItems) return; // clustered layers manage themselves

  const zoomOk = !entry.cfg.minFeatureZoom || map.getZoom() >= entry.cfg.minFeatureZoom;
  const viewBounds = map.getBounds().pad(0.25);

  entry.viewportItems.forEach((item) => {
    const shouldShow = zoomOk && viewBounds.intersects(item.bounds);
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
  viewportLayers.forEach((entry) => {
    if (map.hasLayer(entry.container)) {
      refreshViewport(entry);
    }
  });
  updateAllLabels();
}, 150);

map.on("moveend zoomend", refreshAllViewports);

// ---------------------------------------------------------------
// LOAD LAYERS
// ---------------------------------------------------------------
const layerListEl = document.getElementById("layer-list");
const activeLayers = {};

function makeLayerOptions(cfg) {
  const paneByType = { polygon: "polygonPane", line: "linePane", point: "pointPane" };
  const rendererByType = { polygon: polygonRenderer, line: lineRenderer, point: pointRenderer };
  return {
    renderer: rendererByType[cfg.type] || L.canvas(),
    pane: paneByType[cfg.type] || "overlayPane",
    interactive: cfg.interactive !== false,
    pointToLayer: cfg.type === "point" ? pointToLayer(cfg.color, cfg.icon) : undefined,
    style: cfg.type !== "point" ? styleFor(cfg.color, cfg.type, cfg.dashed) : undefined,
    onEachFeature: (feature, lyr) => {
      lyr.on("click", () => {
        showFeatureInfo(feature.properties, cfg.popupFields);
        if (cfg.ownershipTable && isAdmin) {
          renderOwnershipEditor(feature, lyr, cfg);
        }
      });

      if (cfg.labelField && feature.properties && feature.properties[cfg.labelField]) {
        lyr.bindTooltip(String(feature.properties[cfg.labelField]), {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "map-label"
        });
        const priority = cfg.priorityField
          ? Number(feature.properties[cfg.priorityField]) || 0
          : 0;
        labeledMarkers.push({ lyr, minZoom: cfg.minLabelZoom || 0, priority });
      }
    }
  };
}

function buildLeafletLayer(cfg, geojson) {
  const options = makeLayerOptions(cfg);

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

  return { container, viewportItems, cfg };
}

// ---------------------------------------------------------------
// APPROXIMATE POLYGON AREA (km²), used to sort the Borders group
// ---------------------------------------------------------------
function ringAreaKm2(ring) {
  if (!ring || ring.length < 4) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111.32;
  const ky = 110.57;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
  }
  return Math.abs(sum) / 2;
}

function polygonAreaKm2(rings) {
  return rings.reduce(
    (total, ring, i) => total + (i === 0 ? ringAreaKm2(ring) : -ringAreaKm2(ring)),
    0
  );
}

function geojsonAreaKm2(geojson) {
  let total = 0;
  (geojson.features || []).forEach((f) => {
    const g = f.geometry;
    if (!g) return;
    if (g.type === "Polygon") {
      total += polygonAreaKm2(g.coordinates);
    } else if (g.type === "MultiPolygon") {
      g.coordinates.forEach((poly) => {
        total += polygonAreaKm2(poly);
      });
    }
  });
  return total;
}

// ---------------------------------------------------------------
// LOAD LAYERS + BUILD THE LAYER PANEL
// ---------------------------------------------------------------
async function loadLayer(cfg) {
  try {
    const res = await fetch(cfg.file);
    if (!res.ok) throw new Error(`${cfg.file} not found (${res.status})`);
    const geojson = await res.json();

    if (cfg.ownershipTable) {
      await loadOwnership(cfg);
      const table = ownershipCache[cfg.ownershipTable] || {};
      geojson.features.forEach((feature) => {
        const ownership = table[feature.properties.id];
        if (ownership) {
          feature.properties._ownerColor = ownership.color;
          feature.properties._owner = ownership.owner;
        }
      });
    }

    const entry = buildLeafletLayer(cfg, geojson);
    activeLayers[cfg.id] = entry;
    if (entry.viewportItems) viewportLayers.push(entry);

    if (cfg.visible) {
      entry.container.addTo(map);
      refreshViewport(entry);
    }

    const area = cfg.type === "polygon" ? geojsonAreaKm2(geojson) : 0;
    return { cfg, loaded: true, area };
  } catch (err) {
    console.error(`Failed to load layer "${cfg.label}":`, err);
    return { cfg, loaded: false, area: 0 };
  }
}

function setLayerVisible(cfg, visible) {
  const entry = activeLayers[cfg.id];
  if (!entry) return;
  if (visible) {
    entry.container.addTo(map);
    refreshViewport(entry);
    updateAllLabels();
  } else {
    map.removeLayer(entry.container);
  }
}

function createLayerRow(cfg, loaded, { indent = false } = {}) {
  const row = document.createElement("label");
  row.className =
    "layer-row" + (loaded ? "" : " layer-row--error") + (indent ? " layer-row--child" : "");

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

  if (loaded) {
    row.querySelector("input").addEventListener("change", (e) => {
      setLayerVisible(cfg, e.target.checked);
    });
  }
  return row;
}

function buildGroup(name, items) {
  const wrap = document.createElement("div");
  wrap.className = "layer-group collapsed";

  const header = document.createElement("div");
  header.className = "layer-group-header";
  header.innerHTML = `
    <button class="group-caret" aria-label="Expand or collapse ${escapeHtml(name)}">▾</button>
    <input type="checkbox" class="group-master" />
    <span class="layer-label">${escapeHtml(name)} <span class="group-count">(${items.length})</span></span>
  `;

  const body = document.createElement("div");
  body.className = "layer-group-body";
  items.forEach((r) => body.appendChild(createLayerRow(r.cfg, r.loaded, { indent: true })));

  wrap.appendChild(header);
  wrap.appendChild(body);

  const master = header.querySelector(".group-master");
  const childBoxes = () => [...body.querySelectorAll('input[type="checkbox"]:not(:disabled)')];

  function syncMaster() {
    const boxes = childBoxes();
    const on = boxes.filter((b) => b.checked).length;
    master.checked = boxes.length > 0 && on === boxes.length;
    master.indeterminate = on > 0 && on < boxes.length;
  }

  master.addEventListener("change", () => {
    const target = master.checked;
    childBoxes().forEach((box) => {
      if (box.checked !== target) {
        box.checked = target;
        box.dispatchEvent(new Event("change"));
      }
    });
    syncMaster();
  });

  body.addEventListener("change", syncMaster);

  const toggleCollapsed = () => wrap.classList.toggle("collapsed");
  header.querySelector(".group-caret").addEventListener("click", toggleCollapsed);
  header.querySelector(".layer-label").addEventListener("click", toggleCollapsed);

  syncMaster();
  return wrap;
}

function groupNameFor(cfg) {
  if (cfg.group !== undefined) return cfg.group || null; // group: false opts a layer out
  return cfg.type === "polygon" ? "Borders" : null;
}

function buildLayerPanel(results) {
  layerListEl.innerHTML = "";

  const groups = {};
  results.forEach((r) => {
    const name = groupNameFor(r.cfg);
    if (name) (groups[name] = groups[name] || []).push(r);
  });

  const placed = new Set();
  results.forEach((r) => {
    const name = groupNameFor(r.cfg);
    if (!name) {
      layerListEl.appendChild(createLayerRow(r.cfg, r.loaded));
    } else if (!placed.has(name)) {
      placed.add(name);
      const sorted = [...groups[name]].sort((a, b) => b.area - a.area); // largest first
      layerListEl.appendChild(buildGroup(name, sorted));
    }
  });
}

Promise.all(LAYERS.map(loadLayer)).then((results) => {
  buildLayerPanel(results);
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

// ---------------------------------------------------------------
// MOVABLE UNITS (armies + fleets share this code)
// ---------------------------------------------------------------
let lastInfoShownAt = 0;
const unitLayers = [];

function createUnitLayer({ table, noun, svgPath, addBtnId, sizePlaceholder }) {
  const iconUri =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${svgPath}"/></svg>`
    );

  const entries = {};
  let addMode = false;
  const addBtn = document.getElementById(addBtnId);

  function buildIcon(color) {
    const w = 14, h = 14;
    const badge = w * 1.25;
    const html = `
      <div style="width:${badge}px;height:${badge}px;border-radius:50%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.5);">
        <div style="width:${w}px;height:${h}px;background-color:${color};-webkit-mask-image:url('${iconUri}');mask-image:url('${iconUri}');-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;"></div>
      </div>`;
    return L.divIcon({
      html,
      className: "",
      iconSize: [badge, badge],
      iconAnchor: [badge / 2, badge]
    });
  }

  function applyDraggable(entry) {
    const { row, marker } = entry;
    marker.off("dragend");
    if (isAdmin) {
      marker.dragging.enable();
      marker.on("dragend", async () => {
        const ll = marker.getLatLng();
        const { error } = await supabaseClient
          .from(table)
          .update({ lat: ll.lat, lng: ll.lng })
          .eq("id", row.id);
        if (error) console.error(`Failed to move ${noun}:`, JSON.stringify(error));
        row.lat = ll.lat;
        row.lng = ll.lng;
      });
    } else {
      marker.dragging.disable();
    }
  }

  function addMarker(row) {
    const marker = L.marker([row.lat, row.lng], { icon: buildIcon(row.color), draggable: false });
    marker.bindTooltip(row.name, {
      permanent: true,
      direction: "right",
      offset: [8, 0],
      className: "map-label"
    });
    marker.on("click", () => {
      showFeatureInfo(
        { Name: row.name, Faction: row.faction, "Estimated Size": row.size || "Unknown" },
        []
      );
      if (isAdmin) renderEditor(row, marker);
    });
    marker.addTo(map);
    const entry = { row, marker };
    entries[row.id] = entry;
    applyDraggable(entry);
    return entry;
  }

  function renderEditor(row, marker) {
    const optionsHtml = FACTIONS.map(
      (f) =>
        `<option value="${escapeHtml(f.name)}" ${
          f.name === row.faction ? "selected" : ""
        }>${escapeHtml(f.name)}</option>`
    ).join("");

    infoEl.insertAdjacentHTML(
      "beforeend",
      `
      <div class="bastion-editor">
        <label class="bastion-editor-label">${noun} name</label>
        <input type="text" id="unit-name-input" value="${escapeHtml(row.name)}" />
        <label class="bastion-editor-label">Faction</label>
        <select id="unit-faction-select">${optionsHtml}</select>
        <label class="bastion-editor-label">Estimated size</label>
        <input type="text" id="unit-size-input" value="${escapeHtml(row.size || "")}" placeholder="${sizePlaceholder}" />
        <button id="unit-save-btn">Save</button>
        <button id="unit-delete-btn" class="danger-btn">Delete ${noun}</button>
        <span class="editor-status" id="unit-save-status"></span>
      </div>`
    );

    document.getElementById("unit-save-btn").addEventListener("click", async () => {
      const name = document.getElementById("unit-name-input").value.trim();
      const faction = FACTIONS.find(
        (f) => f.name === document.getElementById("unit-faction-select").value
      );
      const size = document.getElementById("unit-size-input").value.trim();
      const statusEl = document.getElementById("unit-save-status");

      if (!name) {
        statusEl.textContent = "Name required.";
        return;
      }

      statusEl.textContent = "Saving...";
      const { error } = await supabaseClient
        .from(table)
        .update({ name, faction: faction.name, color: faction.color, size })
        .eq("id", row.id);

      if (error) {
        statusEl.textContent = "Failed to save.";
        console.error(JSON.stringify(error));
        return;
      }

      row.name = name;
      row.faction = faction.name;
      row.color = faction.color;
      row.size = size;
      marker.setIcon(buildIcon(faction.color));
      marker.setTooltipContent(name);
      statusEl.textContent = "Saved.";
    });

    document.getElementById("unit-delete-btn").addEventListener("click", async () => {
      if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
      const { error } = await supabaseClient.from(table).delete().eq("id", row.id);
      if (error) {
        console.error(JSON.stringify(error));
        return;
      }
      map.removeLayer(marker);
      delete entries[row.id];
      clearFeatureInfo();
    });
  }

  async function createAt(latlng) {
    const name = prompt(`${noun} name:`);
    if (!name) return;
    const size = prompt("Estimated size (optional):") || "";
    const faction = FACTIONS[0];

    const { data, error } = await supabaseClient
      .from(table)
      .insert({
        name,
        faction: faction.name,
        color: faction.color,
        size,
        lat: latlng.lat,
        lng: latlng.lng
      })
      .select()
      .single();

    if (error) {
      console.error(JSON.stringify(error));
      alert(`Failed to create ${noun.toLowerCase()} - check the console for details.`);
      return;
    }

    const entry = addMarker(data);
    showFeatureInfo(
      { Name: data.name, Faction: data.faction, "Estimated Size": data.size || "Unknown" },
      []
    );
    renderEditor(data, entry.marker); // opens the editor so you can set the faction right away
  }

  function setAddMode(on) {
    addMode = on;
    if (addBtn) {
      addBtn.textContent = on ? "Click map to place..." : `+ Add ${noun}`;
      addBtn.classList.toggle("active", on);
    }
  }

  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const turningOn = !addMode;
      unitLayers.forEach((u) => u.cancelAdd()); // only one placement mode at a time
      setAddMode(turningOn);
    });
  }

  map.on("click", (e) => {
    if (addMode && isAdmin) {
      createAt(e.latlng);
      setAddMode(false);
    } else if (Date.now() - lastInfoShownAt > 100) {
      clearFeatureInfo();
    }
  });

  async function load() {
    const { data, error } = await supabaseClient.from(table).select("*");
    if (error) {
      console.error(`Failed to load ${table}:`, JSON.stringify(error));
      return;
    }
    data.forEach((row) => addMarker(row));
  }

  const api = {
    load,
    cancelAdd: () => setAddMode(false),
    refreshDraggability: () => Object.values(entries).forEach(applyDraggable)
  };
  unitLayers.push(api);
  return api;
}

function refreshAllUnitDraggability() {
  unitLayers.forEach((u) => u.refreshDraggability());
}

const armyUnits = createUnitLayer({
  table: "Armies",
  noun: "Army",
  svgPath: "M4 2v20h2V13h11l-3-4 3-4H6V2H4z",
  addBtnId: "add-army-btn",
  sizePlaceholder: "e.g. 5,000"
});

const fleetUnits = createUnitLayer({
  table: "Fleets",
  noun: "Fleet",
  svgPath: "M2 16h20l-3.5 5h-13z M11 3h2v13h-2z M10 6L4 14h6z M14 6l6 8h-6z",
  addBtnId: "add-fleet-btn",
  sizePlaceholder: "e.g. 12 ships"
});

armyUnits.load();
fleetUnits.load();

// ---------------------------------------------------------------
// DATE BANNER
// ---------------------------------------------------------------
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
let gameDate = null;

const dateDisplayEl = document.getElementById("date-display");
const dateEditBtn = document.getElementById("date-edit-btn");
const dateEditorEl = document.getElementById("date-editor");
const dateStatusEl = document.getElementById("date-status");
const dateMonthSel = document.getElementById("date-month");

MONTHS.forEach((m, i) => dateMonthSel.add(new Option(m, i + 1)));

function setDateEditing(on) {
  dateEditorEl.style.display = on ? "flex" : "none";
  dateDisplayEl.style.display = on ? "none" : "inline";
  dateEditBtn.style.display = !on && isAdmin ? "inline-block" : "none";
}

function renderDate() {
  dateDisplayEl.textContent = gameDate
    ? `${gameDate.day} ${MONTHS[gameDate.month - 1]} ${gameDate.year}`
    : "Date not set";
  setDateEditing(isAdmin && dateEditorEl.style.display === "flex");
}

dateEditBtn.addEventListener("click", () => {
  const d = gameDate || { day: 1, month: 1, year: 1600 };
  document.getElementById("date-day").value = d.day;
  dateMonthSel.value = d.month;
  document.getElementById("date-year").value = d.year;
  dateStatusEl.textContent = "";
  setDateEditing(true);
});

document.getElementById("date-cancel-btn").addEventListener("click", () => setDateEditing(false));

document.getElementById("date-save-btn").addEventListener("click", async () => {
  const day = parseInt(document.getElementById("date-day").value, 10);
  const month = parseInt(dateMonthSel.value, 10);
  const year = parseInt(document.getElementById("date-year").value, 10);
  const maxDay = new Date(2000, month, 0).getDate(); // 2000 is a leap year, so Feb allows 29

  if (!Number.isInteger(day) || !Number.isInteger(year) || day < 1 || day > maxDay) {
    dateStatusEl.textContent = "Check the date.";
    return;
  }

  dateStatusEl.textContent = "Saving...";
  const { error } = await supabaseClient
    .from("GameDate")
    .upsert({ key: "current", day, month, year }, { onConflict: "key" });

  if (error) {
    dateStatusEl.textContent = "Failed to save.";
    console.error(JSON.stringify(error));
    return;
  }

  gameDate = { day, month, year };
  dateStatusEl.textContent = "";
  setDateEditing(false);
  renderDate();
});

async function loadGameDate() {
  const { data, error } = await supabaseClient
    .from("GameDate")
    .select("*")
    .eq("key", "current")
    .maybeSingle();
  if (error) {
    console.error("Failed to load date:", JSON.stringify(error));
  } else if (data) {
    gameDate = { day: data.day, month: data.month, year: data.year };
  }
  renderDate();
}

loadGameDate();
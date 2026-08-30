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

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  subdomains: "abc",
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
  if (typeof refreshAllArmyDraggability === "function") refreshAllArmyDraggability();
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
    <label class="bastion-editor-label">Army name</label>
    <input type="text" id="army-name-input" value="${escapeHtml(row.name)}" />
    <label class="bastion-editor-label">Faction</label>
    <select id="army-faction-select">${optionsHtml}</select>
    <label class="bastion-editor-label">Estimated size</label>
    <input type="text" id="army-size-input" value="${escapeHtml(row.size || "")}" placeholder="e.g. 5,000" />
    <button id="army-save-btn">Save</button>
    <button id="army-delete-btn" class="danger-btn">Delete Army</button>
    <span id="army-save-status"></span>
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

// Keeps track of which layer config each bastion feature came from,
// so we can rebuild its icon later with the right width/height.
const bastionIconCfgById = {};
function currentIconCfg(feature) {
  return bastionIconCfgById[feature.properties.id];
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
  const sortedMarkers = [...labeledMarkers].sort((a, b) => b.priority - a.priority);

  sortedMarkers.forEach(({ lyr }) => {
    const tooltip = lyr.getTooltip && lyr.getTooltip();
    if (!tooltip || !tooltip.isOpen()) return;

    const el = tooltip.getElement();
    if (!el) return;

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
  if (!entry.viewportItems) return;
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
  updateAllLabels();
}, 120);

map.on("moveend zoomend", refreshAllViewports);

// ---------------------------------------------------------------
// LOAD LAYERS
// ---------------------------------------------------------------
const layerListEl = document.getElementById("layer-list");
const activeLayers = {};

function makeLayerOptions(cfg) {
  return {
    renderer: L.canvas(),
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

  return { container, viewportItems };
}

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

// ---------------------------------------------------------------
// ARMY MOVEMENT LAYER
// ---------------------------------------------------------------
const ARMY_FLAG_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 2v20h2V13h11l-3-4 3-4H6V2H4z"/></svg>'
  );

const armyMarkers = {}; // army id -> Leaflet marker
let addArmyMode = false;

function buildArmyIcon(color) {
  const w = 14, h = 14;
  const outline = "#1a1a1a";
  const badgeSize = w * 1.25;

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
        background-color:${color};
        -webkit-mask-image:url('${ARMY_FLAG_SVG}');
        mask-image:url('${ARMY_FLAG_SVG}');
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

async function loadArmies() {
  const { data, error } = await supabaseClient.from("Armies").select("*");
  if (error) {
    console.error("Failed to load armies:", JSON.stringify(error));
    return;
  }
  data.forEach((row) => addArmyMarker(row));
}

function addArmyMarker(row) {
  const marker = L.marker([row.lat, row.lng], {
    icon: buildArmyIcon(row.color),
    draggable: false
  });

  marker.bindTooltip(row.name, {
    permanent: true,
    direction: "right",
    offset: [8, 0],
    className: "map-label"
  });

marker.on("click", () => {
  showFeatureInfo({ Name: row.name, Faction: row.faction, "Estimated Size": row.size || "Unknown" }, []);
  if (isAdmin) {
    renderArmyEditor(row, marker);
  }
});

  marker.addTo(map);
  armyMarkers[row.id] = marker;
  setArmyDraggable(marker, row);
}

function setArmyDraggable(marker, row) {
  if (isAdmin) {
    marker.dragging.enable();
    marker.off("dragend");
    marker.on("dragend", async () => {
      const latlng = marker.getLatLng();
      const { error } = await supabaseClient
        .from("Armies")
        .update({ lat: latlng.lat, lng: latlng.lng })
        .eq("id", row.id);
      if (error) console.error("Failed to update army position:", JSON.stringify(error));
      row.lat = latlng.lat;
      row.lng = latlng.lng;
    });
  } else {
    marker.dragging.disable();
  }
}

function refreshAllArmyDraggability() {
  Object.keys(armyMarkers).forEach((id) => {
    setArmyDraggable(armyMarkers[id], { id });
  });
}

function renderArmyEditor(row, marker) {
  const optionsHtml = FACTIONS.map(
    (f) =>
      `<option value="${escapeHtml(f.name)}" ${
        f.name === row.faction ? "selected" : ""
      }>${escapeHtml(f.name)}</option>`
  ).join("");

const editorHtml = `
  <div class="bastion-editor">
    <label class="bastion-editor-label">Army name</label>
    <input type="text" id="army-name-input" value="${escapeHtml(row.name)}" />
    <label class="bastion-editor-label">Faction</label>
    <select id="army-faction-select">${optionsHtml}</select>
    <label class="bastion-editor-label">Estimated size</label>
    <input type="text" id="army-size-input" value="${escapeHtml(row.size || "")}" placeholder="e.g. 5,000" />
    <button id="army-save-btn">Save</button>
    <button id="army-delete-btn" class="danger-btn">Delete Army</button>
    <span id="army-save-status"></span>
  </div>
`;

  infoEl.insertAdjacentHTML("beforeend", editorHtml);

document.getElementById("army-save-btn").addEventListener("click", async () => {
  const name = document.getElementById("army-name-input").value.trim();
  const factionName = document.getElementById("army-faction-select").value;
  const faction = FACTIONS.find((f) => f.name === factionName);
  const size = document.getElementById("army-size-input").value.trim();
  const statusEl = document.getElementById("army-save-status");

  if (!name) {
    statusEl.textContent = "Name required.";
    return;
  }

  statusEl.textContent = "Saving...";
  const { error } = await supabaseClient
    .from("Armies")
    .update({ name, faction: faction.name, color: faction.color, size })
    .eq("id", row.id);

  if (error) {
    statusEl.textContent = "Failed to save.";
    console.error(error);
    return;
  }

  row.name = name;
  row.faction = faction.name;
  row.color = faction.color;
  row.size = size;
  marker.setIcon(buildArmyIcon(faction.color));
  marker.setTooltipContent(name);
  statusEl.textContent = "Saved.";
});

  document.getElementById("army-delete-btn").addEventListener("click", async () => {
    if (!confirm(`Delete "${row.name}"? This cannot be undone.`)) return;

    const { error } = await supabaseClient.from("Armies").delete().eq("id", row.id);
    if (error) {
      console.error("Failed to delete army:", JSON.stringify(error));
      return;
    }
    map.removeLayer(marker);
    delete armyMarkers[row.id];
    infoEl.innerHTML = `<p class="empty">Army deleted.</p>`;
  });
}

async function createArmyAt(latlng) {
  const name = prompt("Army name:");
  if (!name) return;

  const size = prompt("Estimated size (optional):") || "";

  const faction = FACTIONS[0];

  const { data, error } = await supabaseClient
    .from("Armies")
    .insert({ name, faction: faction.name, color: faction.color, size, lat: latlng.lat, lng: latlng.lng })
    .select()
    .single();

  if (error) {
    console.error("Failed to create army:", JSON.stringify(error));
    alert("Failed to create army — check console for details.");
    return;
  }

  addArmyMarker(data);
}

const addArmyBtn = document.getElementById("add-army-btn");
if (addArmyBtn) {
  addArmyBtn.addEventListener("click", () => {
    addArmyMode = !addArmyMode;
    addArmyBtn.textContent = addArmyMode ? "Click map to place..." : "+ Add Army";
    addArmyBtn.classList.toggle("active", addArmyMode);
  });
}

map.on("click", (e) => {
  if (addArmyMode && isAdmin) {
    createArmyAt(e.latlng);
    addArmyMode = false;
    if (addArmyBtn) {
      addArmyBtn.textContent = "+ Add Army";
      addArmyBtn.classList.remove("active");
    }
  } else {
    clearFeatureInfo();
  }
});

loadArmies();
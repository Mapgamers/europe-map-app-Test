# Europe Map App

A static, interactive Leaflet map that loads your QGIS-exported GeoJSON layers,
with a toggleable layer panel and click-to-inspect feature info.

## 1. Add your data

Copy your `.geojson` files into the `data/` folder, replacing (or alongside) the
two example files.

## 2. Register each layer in `config.js`

Open `config.js` and edit the `LAYERS` array — one entry per file:

```js
{
  id: "cities",
  label: "Major Cities",
  file: "data/cities.geojson",
  type: "point",        // "point" | "line" | "polygon"
  color: "#e8a33d",
  visible: true,
  popupFields: []        // [] = show all properties, or list specific keys
}
```

Delete the two `example_*` entries once you've added your real layers
(you can also delete the example files from `data/`).

Adjust `MAP_CENTER` and `MAP_ZOOM` at the bottom of the file if you want a
different default view.

## 3. Preview locally (optional but recommended)

Browsers block `fetch()` on local files opened directly, so serve the folder:

```bash
cd europe-map-app
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## 4. Deploy to Vercel

**Option A — GitHub (recommended):**
1. Push this folder to a new GitHub repo.
2. In Vercel: **Add New → Project → Import** your repo.
3. Framework preset: choose **Other** (it's a static site, no build step needed).
4. Deploy. Vercel gives you a live `yourproject.vercel.app` URL.

**Option B — Vercel CLI (no GitHub needed):**
```bash
npm install -g vercel
cd europe-map-app
vercel
```
Follow the prompts — it deploys directly from your machine.

## Notes on large files

If any GeoJSON file is large (tens of MB), initial load will be slow. Consider
simplifying geometries in QGIS (Vector → Geometry Tools → Simplify) or reducing
coordinate precision before exporting. See the chat for more on this if your
files are large.

## Structure

```
europe-map-app/
├── index.html      # page shell
├── style.css        # look & feel
├── config.js         # <- you edit this: list your layers here
├── app.js            # map logic (loads layers, builds panel, handles clicks)
└── data/
    ├── example_points.geojson
    └── example_polygons.geojson
```

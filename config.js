// ---------------------------------------------------------------
// LAYER CONFIG
// ---------------------------------------------------------------
// Add one entry per GeoJSON file. Put the actual .geojson files
// in the /data folder — file names below must match exactly.
//
//   id       -> unique short id, no spaces
//   label    -> name shown in the layer panel
//   file     -> path inside /data
//   type     -> "point" | "line" | "polygon"
//   color    -> hex color used to style this layer (ignored for points if
//               "icon" is set below)
//   visible  -> true = layer is on by default
//   popupFields -> which properties to show when a feature is clicked
//                  (leave as [] to auto-show all properties)
//   icon     -> OPTIONAL, points only. Path to a custom icon image
//               (put the image file in /icons). Example:
//               icon: { url: "icons/tree.png", width: 24, height: 24 }
//               Omit "icon" entirely to use a plain colored dot.
// ---------------------------------------------------------------

const LAYERS = [
    {
    id: "Main_Roads",
    label: "Main Roads",
    file: "data/Main Roads.geojson",
    type: "line",
    color: "#613611",
    visible: true,
    popupFields: []
  },
  {
    id: "France",
    label: "Kingdom of France",
    file: "data/FranceReal.geojson",
    type: "polygon",
    color: "#4769b7",
    visible: true,
    popupFields: []
  },
{
  id: "SecondaryRoads",
  label: "Secondary Roads",
  file: "data/SecondaryRoads.geojson",
  type: "line",
  color: "#613611",
  visible: true,
  popupFields: [],
  dashed: true
},
{
  id: "pre_cities",
  label: "Cities",
  file: "data/pre_cities.geojson",
  type: "point",
  color: "#e8a33d",
  visible: true,
  popupFields: [],
  labelField: "city",
  minLabelZoom: 6,
  cluster: true,
  clusterMaxZoom: 6
},
{
  id: "bastions",
  label: "Bastions",
  file: "data/Bastions.geojson",
  type: "point",
  color: "#8a6d3b",
  visible: true,
  popupFields: [],
  icon: { url: "icons/Bastion.svg", width: 15, height: 15 },
  labelField: "name",
  cluster: true,
  clusterMaxZoom: 6
},
{
  id: "cities",
  label: "Other Cities",
  file: "data/mycities.geojson",
  type: "point",
  color: "#e8a33d",
  visible: true,
  popupFields: [],
  labelField: "names",
  minLabelZoom: 6,
  cluster: true,
  clusterMaxZoom: 6
},
{
  id: "Bicoque",
  label: "Bicoque",
  file: "data/Bicoque.geojson",
  type: "point",
  color: "#e8a33d",
  visible: true,
  popupFields: [],
  icon: { url: "icons/Basic_Fort.svg", width: 15, height: 15 },
  labelField: "names",
  minLabelZoom: 6,
  cluster: true,
  clusterMaxZoom: 6
},
{
  id: "Forts",
  label: "Forts",
  file: "data/Forts.geojson",
  type: "point",
  color: "#e8a33d",
  visible: true,
  popupFields: [],
  icon: { url: "icons/Castle.svg", width: 15, height: 15 },
  labelField: "names",
  minLabelZoom: 6,
  cluster: true,
  clusterMaxZoom: 6
},
{
  id: "Liege",
  label: "Prince-Bishopric of Liege",
  file: "data/Prince-Bishopric_Liege.geojson",
  type: "polygon",
  color: "#c594aa",
  visible: true,
  popupFields: [],
},
{
  id: "Netherlands",
  label: "Republic of the Seven United Netherlands",
  file: "data/Netherlands.geojson",
  type: "polygon",
  color: "#d86343",
  visible: true,
  popupFields: [],
},
{
  id: "Netherlands",
  label: "Republic of the Seven United Netherlands",
  file: "data/Netherlands.geojson",
  type: "polygon",
  color: "#d86343",
  visible: true,
  popupFields: [],
},
{
  id: "Spain",
  label: "Spanish Monarchy",
  file: "data/Spain.geojson",
  type: "polygon",
  color: "#c5a808",
  visible: true,
  popupFields: [],
}

  // Add more layers here, e.g.:
  // {
  //   id: "rivers",
  //   label: "Rivers",
  //   file: "data/rivers.geojson",
  //   type: "line",
  //   color: "#c594aa",
  //   visible: false,
  //   popupFields: ["name", "length_km"]
  // },
];

// Initial map view [lat, lng], zoom
const MAP_CENTER = [54.5, 15.5];
const MAP_ZOOM = 4;

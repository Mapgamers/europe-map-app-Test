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

const SUPABASE_URL = "https://agcybjjgaytxsibghniw.supabase.co";
const SUPABASE_KEY = "sb_publishable_MuPHkvO4GOGR575Udn1h8A_emQCy4Qc";

const FACTIONS = [
  { name: "Ottoman Empire", color: "#905744" },
  { name: "Vatican", color: "#ccb1b1" },
  { name: "Spain", color: "#c5a808" },
  { name: "Imperial", color: "#97996b" },
  { name: "Safavid", color: "#ffce47" },
  { name: "Venice", color: "#42b9ff" },
  { name: "Dutch", color: "#d86343" },
  { name: "Liege", color: "#c594aa" },
  { name: "Ragusa", color: "#95b265" },
  { name: "Genoa", color: "#ff63ea" },
  { name: "Hesse-Kassel", color: "#271e3a" },
  { name: "Hesse-Darmstadt", color: "#97996b" },
  { name: "Sweden", color: "#2a3c82" },
  { name: "Portugal", color: "#216d1e" },
  { name: "France", color: "#4769b7" },
  { name: "England", color: "#ff4264" },
  { name: "Denmark", color: "#00ffff" },
  { name: "Cologne", color: "#a94064" },
  { name: "Palatinate", color: "#65938c" },
  { name: "Habsburg", color: "#f3e5cb" },
  { name: "Tuscany", color: "#7c9bb5" },
  { name: "Morocco", color: "#f3a6b2" },
  { name: "Trier", color: "#d6b2bd" },
  { name: "Saxony", color: "#df8482" },
  { name: "Polish-Lithuanian Commonwealth", color: "#df8482" },
  { name: "Mainz", color: "#81538c" },
  { name: "Hanover", color: "#d38f52" },
  { name: "Bavaria", color: "#96bbce" },
  { name: "Holstein-Gottorp", color: "#426fe2" },
  { name: "Savoy", color: "#daa572" },
  { name: "Prussia", color: "#78685d" },
  { name: "Parma", color: "#c4cb7c" },
  { name: "Modena", color: "#5a9260" },
  { name: "Mantua", color: "#cdba9f" },
  { name: "Lorraine", color: "#8db7ab" },
  { name: "Russia", color: "#95a37e" },
  { name: "Switzerland", color: "#f2b9b4" },
  { name: "None", color: "#FFFFFF" }
];

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
  clusterMaxZoom: 6,
  priorityField: "citypop_le"
},
{
  id: "bastions",
  label: "Bastions",
  file: "data/Bastions.geojson",
  type: "point",
  color: "#FFFFFF",
  visible: true,
  popupFields: [],
  icon: { url: "icons/Bastion.svg", width: 15, height: 15 },
  labelField: "name",
  cluster: true,
  clusterMaxZoom: 6,
  ownershipTable: "Bastions",
  ownershipIdColumn: "Bastion_id"
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
  color: "#FFFFFF",
  visible: true,
  popupFields: [],
  icon: { url: "icons/Basic_Fort.svg", width: 15, height: 15 },
  labelField: "names",
  minLabelZoom: 6,
  cluster: true,
  clusterMaxZoom: 6,
  ownershipTable: "Bicoques",
  ownershipIdColumn: "Bicoque_id"
},
{
  id: "Forts",
  label: "Forts",
  file: "data/Forts.geojson",
  type: "point",
  color: "#FFFFFF",
  visible: true,
  popupFields: [],
  icon: { url: "icons/Castle.svg", width: 15, height: 15 },
  labelField: "names",
  minLabelZoom: 6,
  cluster: true,
  clusterMaxZoom: 6,
  ownershipTable: "Forts",
  ownershipIdColumn: "Fort_id"
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

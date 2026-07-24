Put your custom point-marker images here (PNG or SVG work best).

Then in config.js, reference them like:

  icon: { url: "icons/yourfile.png", width: 24, height: 24 }

Tip: keep icons roughly square and reasonably small (under ~50px) —
QGIS symbol images are sometimes exported much larger than needed for
a web map, which slows loading with no visible benefit.

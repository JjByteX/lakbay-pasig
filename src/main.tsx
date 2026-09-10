import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
// Leaflet's own CSS. Nothing in the app currently renders a Leaflet map
// (discover-map.tsx moved to maplibre-gl, see map-vector-restyle-plan.md),
// but leaflet/react-leaflet themselves stay installed per the plan's own
// Open Item ("removing them is a separate, larger decision, out of scope
// here"), so this import is left in place rather than silently dropped.
import "leaflet/dist/leaflet.css";
// MapLibre GL's own CSS, required for its controls (attribution, etc.) to
// render correctly. Imported once here, matching leaflet.css's own
// import-once-at-the-entry-point pattern above.
import "maplibre-gl/dist/maplibre-gl.css";
// leaflet-icon-fix.ts deleted: discover-map.tsx (the only map on this
// screen) never used Leaflet's default L.Icon.Default marker, only custom
// L.divIcon markers, and now uses maplibre-gl instead of Leaflet entirely.
// Dead code for this screen, per map-vector-restyle-plan.md's Open Item.

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

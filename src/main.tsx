import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
// Pre-step-7 cleanup: map-vector-restyle-plan.md's Open Item ("removing
// leaflet/react-leaflet is a separate, larger decision, out of scope
// here") is now resolved. discover-map.tsx (the only map in the app) has
// used maplibre-gl exclusively since that plan landed, nothing renders a
// Leaflet map anywhere in this codebase (grepped: discover-map.tsx and
// this file were the only two files referencing it, discover-map.tsx's
// own reference was already just a stale comment). leaflet, react-leaflet,
// and @types/leaflet are removed from package.json in the same pass, so
// this CSS import is dead weight, not a live dependency, and is dropped
// rather than left in per constraints.md's Inventory Before Suggesting
// rule, no parallel unused import should sit next to the one that's
// actually used.
//
// MapLibre GL's own CSS, required for its controls (attribution, etc.) to
// render correctly. Imported once here, at the entry point.
import "maplibre-gl/dist/maplibre-gl.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

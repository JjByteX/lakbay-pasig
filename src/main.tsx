import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
// Leaflet's own CSS, required for tiles/markers/controls to render correctly.
// Imported once here, not per-component, matching index.css's own pattern.
// Phase 0.2, step-5-phases.md: mapping library is Leaflet + OpenStreetMap tiles.
import "leaflet/dist/leaflet.css";
import "@/lib/leaflet-icon-fix";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

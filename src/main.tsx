import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { IconContext } from "@phosphor-icons/react";
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

// A data router (not <BrowserRouter>) so pages can use useBlocker, which the
// admin tables' "discard your selection?" prompt needs. One catch-all route
// renders App, whose own <Routes> tree is unchanged.
const router = createBrowserRouter([{ path: "*", element: <App /> }]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Bold is the default weight for every Phosphor icon (regular read
        too thin, duotone was dropped). Icons that pass their own weight
        (fill for selected or saved states) still win over this context
        value. */}
    <IconContext.Provider value={{ weight: "bold" }}>
      <RouterProvider router={router} />
    </IconContext.Provider>
  </StrictMode>
);

// Offline shell (offline-phases.md, Phase 3). The worker only exists in a
// production build, so npm run dev never registers one. A new version waits
// and applies the next time the app is opened, with no prompt.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => console.error("Service worker registration failed:", err));
  });
}

// Offline state, daily sync and the cleared-cache check (offline-phases.md,
// Phase 4). Loaded after first paint, so it never delays the app opening.
window.addEventListener("load", () => {
  import("./lib/offline")
    .then((m) => m.initOffline())
    .catch((err) => console.error("Offline setup failed:", err));
});

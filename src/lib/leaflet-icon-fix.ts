import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icon resolves image URLs off L.Icon.Default's own
// built-in imagePath assumption, which breaks under Vite's asset bundling
// (filenames get hashed, the relative path Leaflet expects no longer
// exists). Re-pointing the default icon at Vite-resolved asset URLs fixes
// this once, here, so every map that renders a default marker (Phase 4
// onward) just works, instead of hitting a missing-marker-icon bug per map
// instance. Import this module once, before any map renders; it has no
// exports, only the side effect of patching L.Icon.Default's prototype.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

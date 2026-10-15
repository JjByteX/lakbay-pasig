import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // Offline shell, offline-phases.md Phase 3. The worker is src/sw.ts. The
    // existing public/manifest.json stays, so no second manifest is made, and
    // main.tsx registers the worker itself. No worker runs in npm run dev.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      manifest: false,
      injectRegister: false,
      devOptions: { enabled: false },
      injectManifest: {
        // A plain script, so it registers as a classic worker.
        rollupFormat: "iife",
        // The maplibre-gl chunk is large. 5 MiB leaves room, check the build
        // output once to see the real sizes.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,png,ico,svg,json,geojson}"],
        // 30 seed photos (about 11 MB) the app never reads.
        globIgnores: ["content-photos/**"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

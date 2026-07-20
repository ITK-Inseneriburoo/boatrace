import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,hdr,glb,webmanifest,txt}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Vaikimisi serveerib Workbox index.html alati precache'ist ja avastab
        // uue versiooni alles pärast vana rakenduse käivitumist. Navigatsioon
        // küsib nüüd esmalt võrku; offline'is langeb ühe sekundi järel tagasi
        // viimase runtime-vastuse või precache'i index.html peale.
        navigateFallback: undefined,
        // Muidu teisendab precache'i marsruut `/` vaikimisi `/index.html`-ks
        // ja jõuab network-first reeglist ette.
        directoryIndex: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "boatrace-pages",
              networkTimeoutSeconds: 1,
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 8 },
              precacheFallback: { fallbackURL: "index.html" },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../shared/src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:8090", ws: true },
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1200,
  },
});

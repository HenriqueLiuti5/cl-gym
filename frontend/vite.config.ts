import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // O service worker novo entra sozinho na próxima abertura com internet.
      registerType: "autoUpdate",
      includeAssets: ["icone.svg", "apple-touch-icon.png"],
      manifest: {
        name: "CL Gym",
        short_name: "CL Gym",
        description: "Seus treinos, cargas, peso e alimentação, mesmo sem internet.",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Imagens de demonstração (free-exercise-db): ficam guardadas para usar offline.
            urlPattern: ({ url }) => url.hostname === "raw.githubusercontent.com",
            handler: "CacheFirst",
            options: {
              cacheName: "imagens-exercicios",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Em desenvolvimento, /api vai para a FastAPI (uv run uvicorn backend.main:app --reload).
    proxy: { "/api": "http://localhost:8000" },
  },
});

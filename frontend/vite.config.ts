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
      includeAssets: ["apple-touch-icon.png", "logo-1024.png"],
      manifest: {
        name: "CL Gym",
        short_name: "CL Gym",
        description: "Seus treinos, cargas, peso e alimentação, mesmo sem internet.",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        orientation: "portrait",
        // Tela de abertura no Android: preta, como o fundo da logo (o ícone se funde nela e fica só
        // o emblema), sem clarão no tema escuro.
        background_color: "#000000",
        // Sem theme_color de propósito. Com ele, o Chrome (156 em diante) pinta a barra de
        // navegação do Android, no app instalado, com essa cor fixa, e no tema escuro ela virava
        // uma faixa clara embaixo de tudo. Sem ele, a barra segue o tema do celular, como o app. A
        // barra de status segue as <meta name="theme-color"> do index.html (uma por tema).
        // `undefined`, e não apagar a linha: o plugin poria o verde padrão dele. O aviso do plugin
        // no build ("will not be able to be installed") está desatualizado: o Chrome não exige.
        theme_color: undefined,
        icons: [
          { src: "icone-192.png", sizes: "192x192", type: "image/png" },
          { src: "icone-512.png", sizes: "512x512", type: "image/png" },
          { src: "icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Imagens de demonstração (free-exercise-db), também as miniaturas da lista de
            // exercícios: ficam guardadas para usar offline. O catálogo tem uns 300 exercícios,
            // com 2 imagens cada; 1000 dá para todas, com folga para crescer.
            urlPattern: ({ url }) => url.hostname === "raw.githubusercontent.com",
            handler: "CacheFirst",
            options: {
              cacheName: "imagens-exercicios",
              expiration: { maxEntries: 1000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              // Busca com CORS (o GitHub responde com Access-Control-Allow-Origin: *) e guarda só
              // as respostas 200. Uma <img> comum pede sem CORS, e a resposta "opaca" conta uns 7 MB
              // na cota do aparelho (o Chrome infla o tamanho de propósito): mil delas passariam de
              // 7 GB, dividindo a cota com o banco local. Com CORS, conta o tamanho de verdade
              // (uns 60 KB cada).
              fetchOptions: { mode: "cors", credentials: "omit" },
              cacheableResponse: { statuses: [200] },
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

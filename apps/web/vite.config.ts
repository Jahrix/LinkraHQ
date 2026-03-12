import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Linkra",
        short_name: "Linkra",
        theme_color: "#7C5CFC",
        background_color: "#0d0d0f",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/logo-icon.png", sizes: "192x192", type: "image/png" },
          { src: "/logo-512.png", sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache" }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@linkra/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4170",
      "/auth": "http://localhost:4170"
    }
  }
});

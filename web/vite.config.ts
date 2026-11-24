import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// El contrato (esquemas zod) vive en ../src/contract y se importa tal cual con el alias @contract.
const contract = fileURLToPath(new URL("../src/contract/index.ts", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@contract": contract } },
  plugins: [
    react(),
    VitePWA({
      // «prompt» sin aviso en pantalla: la versión nueva se activa en el siguiente arranque,
      // nunca en medio de una meditación (docs/frontend.md).
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "Ume",
        short_name: "Ume",
        description: "Tu coach de mindfulness con voz.",
        lang: "es",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#1E2536",
        theme_color: "#1E2536",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Solo el subconjunto latino de Manrope: cubre español e italiano.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}", "**/manrope-latin-wght-normal-*.woff2"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/v1\//, /^\/health/],
      },
    }),
  ],
  // En desarrollo, las llamadas a /v1 van al servidor local (o a otro con API_PROXY).
  server: { proxy: { "/v1": process.env.API_PROXY ?? "http://localhost:8080" } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});

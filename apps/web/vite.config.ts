import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * HTTPS is opt-in via LAN=1 (see `pnpm dev:lan`), and only when ./certs
 * exists — created by ../../scripts/make-lan-cert.sh.
 *
 * Opt-in rather than automatic for two reasons: everyday localhost work
 * shouldn't inherit certificate warnings, and the certs are gitignored, so a
 * fresh clone must keep working without them.
 *
 * It matters for iOS: a service worker only registers in a secure context,
 * and a LAN IP over http:// is not one.
 */
const certDir = path.resolve(import.meta.dirname, "../../certs");
const keyFile = path.join(certDir, "lan-key.pem");
const certFile = path.join(certDir, "lan.pem");
const wantLan = process.env.LAN === "1";
const https =
  wantLan && fs.existsSync(keyFile) && fs.existsSync(certFile)
    ? { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }
    : undefined;

if (wantLan && !https) {
  console.warn(
    "\n[vite] LAN=1 but no certificates found — run `pnpm certs` first.\n",
  );
}

// The frontend calls /api/... relative, so the phone only ever speaks to
// Vite; this proxy target resolves on the dev machine.
const proxy = { "/api": "http://localhost:3000" };

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      // We need our own service worker for `push` and `notificationclick` —
      // generateSW cannot express those.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      // We register from src/lib/registerSW.ts so update polling actually
      // runs; the auto-injected script does not handle updates at all.
      injectRegister: null,
      devOptions: { enabled: true, type: "module" },
      injectManifest: {
        // The default glob misses nested assets, so the bundled league badges
        // in public/leagues and the self-hosted fonts were fetched from the
        // network every time and were unavailable offline.
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}",
        ],
      },
      manifest: {
        id: "/",
        name: "Live Football Scores",
        short_name: "Scores",
        description:
          "Live football scores, fixtures, match events and league statistics.",
        theme_color: "#fafafa",
        background_color: "#fafafa",
        display: "standalone",
        orientation: "portrait",
        categories: ["sports", "news"],
        start_url: "/",
        scope: "/",
        // URLs the browser fetches at runtime, resolved against the site
        // root — NOT filesystem paths. The files live in public/.
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    // Bind on all interfaces so the phone can reach the dev server at all.
    host: true,
    https,
    proxy,
  },
  preview: {
    // Mirrored so the production build can be tested on the phone too —
    // service worker behaviour differs from dev.
    host: true,
    https,
    proxy,
  },
});

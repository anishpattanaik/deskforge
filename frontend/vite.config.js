import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE lets the static GitHub Pages build live under /<repo>/ (e.g. /deskforge/).
export default defineConfig({
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});

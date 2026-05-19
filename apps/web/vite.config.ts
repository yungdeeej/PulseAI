import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 5000,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/votes": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/wallets": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/healthz": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5000,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

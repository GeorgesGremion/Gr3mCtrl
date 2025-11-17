import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://10.0.0.82:8080", // Deine Backend-IP
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "http://10.0.0.82:8080",
        ws: true,
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ["@novnc/novnc"],
  },
  plugins: [react()],
});

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@",
        replacement: resolve(import.meta.dirname, "src")
      },
      {
        find: /^@\//,
        replacement: `${resolve(import.meta.dirname, "src")}/`
      }
    ]
  },
  server: {
    port: 5173
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost/"
      }
    },
    globals: true,
    setupFiles: "./vitest.setup.ts"
  }
});

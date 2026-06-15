import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@arrowjaw/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      "@arrowjaw/client": path.resolve(__dirname, "../client/src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    open: false,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  test: {
    environment: "node",
  },
});

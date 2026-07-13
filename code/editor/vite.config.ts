import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { saveAnimTimingPlugin } from "./vite-plugins/save-anim-timing.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [saveAnimTimingPlugin()],
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
    fs: {
      allow: [repoRoot],
    },
    // 若 LLM API 有 CORS 限制，可取消注释并设置 target：
    // proxy: { "/api/llm": { target: "https://api.openai.com", changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/llm/, "/v1") } },
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  test: {
    environment: "node",
  },
});

import type { Plugin } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_REL = "code/client/src/core/game/anim-timing.config.json";

interface AnimTimingPayload {
  baseIntervalMs?: unknown;
  maxSpeedMultiplier?: unknown;
  accelSteps?: unknown;
}

function parsePayload(body: string): {
  baseIntervalMs: number;
  maxSpeedMultiplier: number;
  accelSteps: number;
} | null {
  let raw: AnimTimingPayload;
  try {
    raw = JSON.parse(body) as AnimTimingPayload;
  } catch {
    return null;
  }
  const baseIntervalMs = Number(raw.baseIntervalMs);
  const maxSpeedMultiplier = Number(raw.maxSpeedMultiplier);
  const accelSteps = Number(raw.accelSteps);
  if (
    !Number.isFinite(baseIntervalMs) ||
    !Number.isFinite(maxSpeedMultiplier) ||
    !Number.isFinite(accelSteps) ||
    baseIntervalMs <= 0 ||
    maxSpeedMultiplier < 1 ||
    accelSteps < 1
  ) {
    return null;
  }
  return {
    baseIntervalMs: Math.round(baseIntervalMs * 100) / 100,
    maxSpeedMultiplier: Math.round(maxSpeedMultiplier * 1000) / 1000,
    accelSteps: Math.round(accelSteps),
  };
}

export function saveAnimTimingPlugin(): Plugin {
  const pluginDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(pluginDir, "../../..");
  const configPath = path.join(repoRoot, CONFIG_REL);

  return {
    name: "save-anim-timing",
    configureServer(server) {
      server.middlewares.use("/api/dev/anim-timing-config", async (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        try {
          const raw = await fs.readFile(configPath, "utf8");
          const parsed = parsePayload(raw);
          if (!parsed) {
            res.statusCode = 500;
            res.end("invalid anim timing config file");
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ config: parsed }));
        } catch (err) {
          res.statusCode = 500;
          res.end(String(err));
        }
      });

      server.middlewares.use("/api/dev/save-anim-timing", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          const parsed = parsePayload(body);
          if (!parsed) {
            res.statusCode = 400;
            res.end("invalid anim timing payload");
            return;
          }

          try {
            const json = `${JSON.stringify(parsed, null, 2)}\n`;
            await fs.writeFile(configPath, json, "utf8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, config: parsed }));
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

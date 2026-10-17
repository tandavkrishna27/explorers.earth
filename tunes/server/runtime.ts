import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));

export function log(message: string, source = "express"): void {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express): void {
  const distPath = path.resolve(directory, "..", "public");
  if (!fs.existsSync(distPath)) {
    console.warn(`Could not find the build directory: ${distPath}, skipping frontend static serving. This is expected for API-only deployments.`);
    return;
  }
  app.use(express.static(distPath));
  app.use((_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

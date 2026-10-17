import { createApp } from "../app";
import { serveStatic } from "../runtime";

if (typeof createApp !== "function" || typeof serveStatic !== "function") {
  throw new Error("production server graph exports are unavailable");
}

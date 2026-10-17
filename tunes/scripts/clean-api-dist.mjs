import { rmSync } from "node:fs";
import { resolve } from "node:path";

// The combined build may have left a duplicate client and Vite chunks here.
rmSync(resolve(import.meta.dirname, "../dist"), { recursive: true, force: true });

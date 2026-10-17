import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { authorizationMatrixFromInventory } from "../server/policies/musicSurfacePolicy";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const inventoryPath = resolve(repositoryRoot, "docs/architecture/music-runtime-surface-inventory.json");
const outputPath = resolve(repositoryRoot, "docs/architecture/music-authorization-matrix.json");
const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
writeFileSync(outputPath, `${JSON.stringify(authorizationMatrixFromInventory(inventory), null, 2)}\n`);

import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const origin = "http://127.0.0.1:55177";
// Render-only fixture: no .env, developer tokens, proxy or hosted services.
export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  envDir: false,
  envPrefix: "MUSIC_PERMISSION_TEST_NEVER_EXPOSE_AMBIENT_",
  cacheDir: "node_modules/.vite-music-permissions-isolated",
  resolve: { alias: { '@vis.gl/react-google-maps': fileURLToPath(new URL('./setup/maps-fixture.tsx', import.meta.url)) } },
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(`${origin}/graphql`),
    "import.meta.env.VITE_REST_API_URL": JSON.stringify(`${origin}/api`),
    "import.meta.env.VITE_BASE_URL": JSON.stringify(origin),
    "import.meta.env.VITE_LOCAL_TUNES_API_URL": JSON.stringify("https://localtunes.test"),
    "import.meta.env.VITE_LOCAL_TUNES_ENABLED": JSON.stringify("false"),
    "import.meta.env.VITE_PAYMENT_API_URL": JSON.stringify(origin),
    "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(""),
    "import.meta.env.VITE_PUBLIC_ACCESS_TOKEN": JSON.stringify(""),
    "import.meta.env.VITE_FULL_ACCESS_TOKEN": JSON.stringify(""),
  },
  plugins: [react(), {
    name: "isolated-music-permissions-entry",
    transformIndexHtml: { order: "pre", handler: () => '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Music permissions</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>' },
  }],
  server: {
    host: "127.0.0.1", port: 55177, strictPort: true, hmr: false, proxy: {},
    headers: { "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://localtunes.test; frame-src https://www.youtube.com; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'" },
  },
});

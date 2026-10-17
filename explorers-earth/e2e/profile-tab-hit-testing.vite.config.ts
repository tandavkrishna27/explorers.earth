import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const origin = "http://127.0.0.1:55175";

// Do not import the application's normal Vite config: it has real API proxies.
// The synthetic entry retains the actual App, router, components, and CSS but
// excludes index.html's external preconnect, analytics, and tracking scripts.
export default defineConfig({
  root: fileURLToPath(new URL("../", import.meta.url)),
  envDir: false,
  envPrefix: "PROFILE_TAB_TEST_NEVER_EXPOSE_AMBIENT_",
  cacheDir: "node_modules/.vite-profile-tab-hit-testing",
  define: {
    "import.meta.env.VITE_API_URL": JSON.stringify(`${origin}/graphql`),
    "import.meta.env.VITE_REST_API_URL": JSON.stringify(`${origin}/api`),
    "import.meta.env.VITE_BASE_URL": JSON.stringify(origin),
    "import.meta.env.VITE_LOCAL_TUNES_API_URL": JSON.stringify(origin),
    "import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL": JSON.stringify(origin),
    "import.meta.env.VITE_LOCAL_TUNES_ENABLED": JSON.stringify("false"),
    "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify(""),
    "import.meta.env.VITE_PUBLIC_ACCESS_TOKEN": JSON.stringify(""),
  },
  plugins: [
    react(),
    {
      name: "synthetic-profile-tab-entry",
      transformIndexHtml: {
        order: "pre",
        handler: () => '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic public profile</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 55175,
    strictPort: true,
    hmr: false,
    proxy: {},
    headers: {
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'",
    },
  },
});

import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";

export function createReplatformViteConfig(): UserConfig {
  const gateway = "http://127.0.0.1:51474";
  return defineConfig({
    plugins: [react()],
    envDir: false,
    server: {
      host: "127.0.0.1",
      port: 5175,
      strictPort: true,
      headers: {
        "Content-Security-Policy": "default-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; img-src 'self' data: blob: http://127.0.0.1:* http://localhost:*; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; font-src 'self' data:; media-src 'self' blob: http://127.0.0.1:* http://localhost:*",
      },
      proxy: {
        "/__localtunes": { target: gateway, changeOrigin: true, ws: true, rewrite: (path) => path.replace(/^\/__localtunes/, "") },
        "^/api/music": { target: gateway, changeOrigin: true },
        "/api": { target: gateway, changeOrigin: true },
        "/graphql": { target: gateway, changeOrigin: true },
        "/twitch-api": { target: gateway, changeOrigin: true },
        "/igdb-api": { target: gateway, changeOrigin: true },
      },
    },
  });
}

export default createReplatformViteConfig;

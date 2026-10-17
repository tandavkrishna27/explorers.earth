'use strict';
const { channel } = require('node:diagnostics_channel');
const { writeSync } = require('node:fs');
const http = require('node:http');
const { isAbsolute } = require('node:path');
const root = process.argv[2];
const portText = process.argv[3];
const port = Number(portText);
if (!isAbsolute(root || '') || !/^[1-9][0-9]*$/.test(portText || '') || port > 65535) process.exit(70);
const host = '127.0.0.1';
const targetOrigin = `http://${host}:${port}`;
let published = false;
channel('explorers.contained-unit.blocked').subscribe(event => {
  if (published || event?.code !== 'TEST_EGRESS_BLOCKED' || event.target?.kind !== 'tcp'
    || event.target.host !== host || event.target.port !== port
    || event.target.key !== `${host}|${port}`) process.exit(65);
  published = true;
  writeSync(1, JSON.stringify({ code: 'TEST_EGRESS_BLOCKED', host, port }) + '\n');
});
async function main() {
  const { createServer } = await import('vite');
  const proxy = await createServer({
    root, configFile: false, envDir: false,
    envPrefix: 'CONTAINED_UNIT_NEVER_AMBIENT_',
    logLevel: 'silent', appType: 'custom',
    server: {
      host, port: 0, hmr: false, watch: null,
      proxy: { '/__probe': { target: targetOrigin, changeOrigin: true } },
    },
  });
  await proxy.listen();
  const proxyPort = proxy.httpServer.address().port;
  process.send({ type: 'ready' }, () => {
    const watchdog = setTimeout(() => process.exit(124), 2_000);
    let finished = false;
    const finish = async status => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      try {
        await proxy.close();
        if (proxy.httpServer?.listening) process.exitCode = 67;
        else process.exitCode = status;
      } catch {
        process.exitCode = 67;
      }
    };
    let request;
    try {
      request = http.get(`http://${host}:${proxyPort}/__probe`, response => {
        response.resume();
        response.on('end', () => {
          void finish(!published ? 65 : response.statusCode === 502 ? 0 : 66);
        });
      });
    } catch { void finish(64); return; }
    request.on('error', () => { void finish(64); });
  });
}
main().catch(() => { process.exitCode = 70; });

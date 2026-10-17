'use strict';

const { assertBlocked } = require('./contained-unit-runtime.cjs');

async function main() {
  const portText = process.argv[2];
  const port = Number(portText);
  if (!/^[1-9][0-9]*$/.test(portText || '') || port > 65535) throw new Error('Invalid local canary');
  const code = await assertBlocked({ host: '127.0.0.1', port });
  process.stdout.write(`${JSON.stringify({ pid: process.pid, code })}\n`);
}

main().catch(() => {
  process.stderr.write('LOCAL_PROBE_FAILED\n');
  process.exitCode = 1;
});

'use strict';
const http = require('node:http');
let connections = 0;
const sockets = new Set();
const server = http.createServer((req, res) => {
  req.resume();
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end('{"data":{"probe":true}}');
});
server.on('connection', socket => {
  connections++;
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
});
server.on('upgrade', (_req, socket) => socket.destroy());
server.listen(0, '127.0.0.1', () => {
  process.send({ host: '127.0.0.1', port: server.address().port, pid: process.pid });
});
function shutdown() {
  for (const socket of sockets) socket.destroy();
  server.close(() => {
    if (process.connected) process.send({ connections }, () => process.disconnect());
  });
}
process.on('message', message => {
  if (message === 'snapshot') process.send({ connections });
  if (message === 'close') shutdown();
});
process.once('disconnect', () => { for (const socket of sockets) socket.destroy(); server.close(); });

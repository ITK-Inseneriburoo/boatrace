import http from "node:http";
import express from "express";
import { WebSocketServer, type WebSocket } from "ws";
import { config } from "./config";
import { ConnectionHandler } from "./ConnectionHandler";

const app = express();
app.use(express.static(config.staticDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 32 * 1024 });
const handler = new ConnectionHandler();

interface AliveSocket extends WebSocket {
  isAlive?: boolean;
}

wss.on("connection", (socket: AliveSocket) => {
  socket.isAlive = true;
  socket.on("pong", () => (socket.isAlive = true));
  handler.handleConnection(socket);
});

// Heartbeat: 2 vahelejäänud pongi → ühendus maha
setInterval(() => {
  for (const s of wss.clients as Set<AliveSocket>) {
    if (s.isAlive === false) {
      s.terminate();
      continue;
    }
    s.isAlive = false;
    s.ping();
  }
}, 15_000);

server.listen(config.port, () => {
  console.log(`Boatrace server kuulab pordil ${config.port}`);
  console.log(`Staatika: ${config.staticDir}`);
});

import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { config } from "./config";

const app = express();
app.use(express.static(config.staticDir));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 32 * 1024 });

wss.on("connection", (socket) => {
  socket.on("error", () => socket.terminate());
});

server.listen(config.port, () => {
  console.log(`Boatrace server kuulab pordil ${config.port}`);
});

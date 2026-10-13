import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { parse as parseQuery } from "node:querystring";
import next from "next";
import { subscribeTaskRealtime } from "./lib/task-realtime.ts";
import { verifyTaskRealtimeTicket } from "./lib/task-realtime-auth.ts";

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.BIND_HOST ?? (dev ? "localhost" : "0.0.0.0");
const websocketPath = "/api/tasks/realtime";
const websocketGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const connections = new Set();

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer from 1 to 65535");
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function rejectUpgrade(socket, status, phrase) {
  if (socket.destroyed || !socket.writable) return;
  socket.end(`HTTP/1.1 ${status} ${phrase}\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`);
}
function sendFrame(socket, opcode, payload = Buffer.alloc(0)) {
  if (socket.destroyed || !socket.writable) return;
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  socket.write(Buffer.concat([header, body]));
}
function disposeConnection(connection) {
  if (connection.closed) return;
  connection.closed = true;
  connections.delete(connection);
  connection.unsubscribe?.();
  if (connection.expiryTimer) clearTimeout(connection.expiryTimer);
  connection.socket.removeAllListeners("data");
}
function consumeFrames(connection, chunk) {
  const socket = connection.socket;
  connection.buffer = Buffer.concat([connection.buffer, chunk]);
  while (connection.buffer.length >= 2) {
    const first = connection.buffer[0];
    const second = connection.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if ((first & 0x70) !== 0 || !masked) {
      socket.destroy();
      return;
    }
    if (length === 126) {
      if (connection.buffer.length < 4) return;
      length = connection.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (connection.buffer.length < 10) return;
      const largeLength = connection.buffer.readBigUInt64BE(2);
      if (largeLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        socket.destroy();
        return;
      }
      length = Number(largeLength);
      offset = 10;
    }
    if (length > 1_000_000) {
      socket.destroy();
      return;
    }
    if (connection.buffer.length < offset + 4 + length) return;
    const mask = connection.buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.from(connection.buffer.subarray(offset, offset + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    connection.buffer = connection.buffer.subarray(offset + length);
    if (opcode === 0x8) {
      sendFrame(socket, 0x8, payload.subarray(0, 125));
      socket.end();
      return;
    }
    if (opcode === 0x9) sendFrame(socket, 0xA, payload);
    else if (opcode === 0xA) connection.alive = true;
    // The browser client receives server events only; application data frames are ignored.
  }
}
function handleUpgrade(request, socket, head) {
  let pathname;
  try {
    pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  } catch {
    return;
  }
  // Leave Next.js development HMR and any other upgrade paths to their handlers.
  if (pathname !== websocketPath) return;
  const origin = request.headers.origin;
  let originHost = "";
  try { originHost = origin ? new URL(origin).host.toLowerCase() : ""; } catch { originHost = ""; }
  if (!originHost || originHost !== String(request.headers.host ?? "").toLowerCase()) {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  if (request.headers.upgrade?.toLowerCase() !== "websocket" ||
      !String(request.headers.connection ?? "").toLowerCase().split(",").map((value) => value.trim()).includes("upgrade") ||
      request.headers["sec-websocket-version"] !== "13") {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  if (connections.size >= 2000) {
    rejectUpgrade(socket, 503, "Service Unavailable");
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (typeof key !== "string" || Buffer.from(key, "base64").length !== 16) {
    rejectUpgrade(socket, 400, "Bad Request");
    return;
  }
  const protocols = String(request.headers["sec-websocket-protocol"] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const ticketProtocol = protocols.find((protocol) => protocol.startsWith("ticket."));
  const ticket = ticketProtocol?.slice("ticket.".length);
  const scope = ticket ? verifyTaskRealtimeTicket(ticket) : null;
  if (!scope) {
    rejectUpgrade(socket, 401, "Unauthorized");
    return;
  }

  const accept = createHash("sha1").update(key + websocketGuid).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n` +
    "Sec-WebSocket-Protocol: canvas-tasks\r\n" +
    "Cache-Control: no-store\r\n\r\n"
  );
  socket.setNoDelay(true);
  const connection = { socket, buffer: Buffer.alloc(0), alive: true, closed: false, unsubscribe: null, expiryTimer: undefined };
  connection.unsubscribe = subscribeTaskRealtime({
    companyId: scope.companyId,
    workspaceId: scope.workspaceId,
    send: (message) => sendFrame(socket, 0x1, Buffer.from(JSON.stringify(message)))
  });
  // Close at ticket expiry so a revoked membership/plan cannot keep an old socket alive.
  connection.expiryTimer = setTimeout(() => {
    sendFrame(socket, 0x8, Buffer.from([0x03, 0xf0])); // WebSocket policy violation (1008).
    socket.end();
    disposeConnection(connection);
  }, Math.max(1, scope.expiresAt - Date.now()));
  connection.expiryTimer.unref?.();
  connections.add(connection);
  socket.on("data", (data) => consumeFrames(connection, data));
  socket.on("error", () => disposeConnection(connection));
  socket.on("end", () => disposeConnection(connection));
  socket.on("close", () => disposeConnection(connection));
  sendFrame(socket, 0x1, Buffer.from(JSON.stringify({ type: "ready", expiresAt: scope.expiresAt })));
  if (head?.length) consumeFrames(connection, head);
}

const heartbeat = setInterval(() => {
  for (const connection of connections) {
    if (!connection.alive) {
      connection.socket.destroy();
      disposeConnection(connection);
      continue;
    }
    connection.alive = false;
    sendFrame(connection.socket, 0x9, Buffer.alloc(0));
  }
}, 25_000);
heartbeat.unref();

await app.prepare();
const server = createServer((request, response) => {
  let requestUrl;
  try {
    requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  } catch {
    response.statusCode = 400;
    response.end("Bad Request");
    return;
  }
  // Build the URL shape Next.js expects without Node's deprecated url.parse().
  const parsedUrl = {
    protocol: requestUrl.protocol,
    slashes: true,
    auth: null,
    host: requestUrl.host,
    port: requestUrl.port,
    hostname: requestUrl.hostname,
    hash: requestUrl.hash,
    search: requestUrl.search,
    query: parseQuery(requestUrl.search.slice(1)),
    pathname: requestUrl.pathname,
    path: requestUrl.pathname + requestUrl.search,
    href: requestUrl.href
  };
  void handle(request, response, parsedUrl);
});
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.on("upgrade", handleUpgrade);
server.listen(port, hostname, () => {
  console.info(`[canvas] Next.js ${dev ? "development" : "production"} and task WebSocket on http://${hostname}:${port}`);
});
function shutdown() {
  clearInterval(heartbeat);
  for (const connection of connections) {
    connection.socket.end();
    disposeConnection(connection);
  }
  server.close(() => process.exit(0));
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

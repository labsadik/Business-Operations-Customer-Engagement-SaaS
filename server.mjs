import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { Server } from "socket.io";
import { createClient } from "redis";

try { process.loadEnvFile(".env.local"); } catch {}
try { process.loadEnvFile(".env"); } catch {}

const PORT = Number(process.env.SOCKET_PORT || 3001);
const HOST = process.env.SOCKET_HOST || "0.0.0.0";
const presenceStatuses = new Set(["AVAILABLE", "BUSY", "NOT_AVAILABLE"]);
const heartbeatTtlSeconds = 90;
const notAvailableTtlSeconds = 30 * 24 * 60 * 60;
const allowedOrigins = (process.env.SOCKET_CORS_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const httpServer = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, service: "conventus-socket", timestamp: new Date().toISOString() }));
});

const io = new Server(httpServer, {
  path: process.env.SOCKET_PATH || "/socket.io",
  transports: ["websocket", "polling"],
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 20000
});

let tcpRedis = null;
let tcpRedisConnect = null;

function redisKey(companyId, userId) {
  return "conventus:employee-presence:" + companyId + ":" + userId;
}

async function redisGet(key) {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!token) throw new Error("REDIS_REST_TOKEN_NOT_CONFIGURED");

    const response = await fetch(url.replace(/\\/$/, "") + "/get/" + encodeURIComponent(key), {
      headers: {
        Authorization: "Bearer " + token,
        "content-type": "application/json"
      },
      cache: "no-store"
    });
    if (!response.ok) throw new Error("UPSTASH_REDIS_" + response.status);
    const body = await response.json();
    return body.result == null ? null : String(body.result);
  }

  if (!tcpRedis) {
    tcpRedis = createClient({ url });
    tcpRedis.on("error", (error) => console.error("[socket] Redis error", error));
  }
  if (!tcpRedis.isReady) {
    tcpRedisConnect ??= tcpRedis.connect().then(() => tcpRedis);
  }
  await tcpRedisConnect;
  return tcpRedis.get(key);
}

async function redisSet(key, value, ttlSeconds) {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_NOT_CONFIGURED");

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const token = process.env.REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!token) throw new Error("REDIS_REST_TOKEN_NOT_CONFIGURED");

    const response = await fetch(
      url.replace(/\\/$/, "") +
        "/set/" +
        encodeURIComponent(key) +
        "/" +
        encodeURIComponent(value) +
        "/PX/" +
        String(ttlSeconds * 1000),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "content-type": "application/json"
        },
        body: "{}",
        cache: "no-store"
      }
    );
    if (!response.ok) throw new Error("UPSTASH_REDIS_" + response.status);
    return;
  }

  if (!tcpRedis) {
    tcpRedis = createClient({ url });
    tcpRedis.on("error", (error) => console.error("[socket] Redis error", error));
  }
  if (!tcpRedis.isReady) {
    tcpRedisConnect ??= tcpRedis.connect().then(() => tcpRedis);
  }
  await tcpRedisConnect;
  await tcpRedis.set(key, value, { PX: ttlSeconds * 1000 });
}

function realtimeSecret() {
  const value = process.env.REALTIME_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("REALTIME_SECRET_NOT_CONFIGURED");
  return value;
}

function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [body, supplied] = token.split(".");
  if (!body || !supplied) return null;

  const expected = createHmac("sha256", realtimeSecret()).update(body).digest("base64url");
  if (supplied.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.userId || !payload?.companyId || !payload?.role) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function staffRoom(companyId) {
  return "company:" + companyId + ":staff";
}

function publicRoom(companyId) {
  return "company:" + companyId + ":public";
}

const connectionCounts = new Map();
const disconnectTimers = new Map();

function connectionKey(companyId, userId) {
  return companyId + ":" + userId;
}

function clearDisconnectTimer(key) {
  const timer = disconnectTimers.get(key);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(key);
}

function emitPresence(companyId, userId, status) {
  const event = {
    companyId,
    userId,
    status,
    updatedAt: new Date().toISOString()
  };
  io.to(staffRoom(companyId)).emit("presence:updated", event);
  io.to(publicRoom(companyId)).emit("availability:changed");
}

async function writePresence(companyId, userId, status) {
  const ttl = status === "NOT_AVAILABLE" ? notAvailableTtlSeconds : heartbeatTtlSeconds;
  await redisSet(redisKey(companyId, userId), status, ttl);
  emitPresence(companyId, userId, status);
  return { status, ttlSeconds: ttl };
}

async function heartbeatPresence(companyId, userId) {
  const current = (await redisGet(redisKey(companyId, userId))) || "AVAILABLE";
  const status = presenceStatuses.has(current) ? current : "AVAILABLE";
  const ttl = status === "NOT_AVAILABLE" ? notAvailableTtlSeconds : heartbeatTtlSeconds;
  await redisSet(redisKey(companyId, userId), status, ttl);
  emitPresence(companyId, userId, status);
  return { status, ttlSeconds: ttl };
}

io.use((socket, next) => {
  const isPublic = socket.handshake.auth?.public === true || socket.handshake.query?.public === "1";
  if (isPublic) {
    const companyId = String(socket.handshake.auth?.companyId || socket.handshake.query?.companyId || "");
    if (!companyId) return next(new Error("COMPANY_REQUIRED"));
    socket.data.publicCompanyId = companyId;
    return next();
  }

  try {
    const token = socket.handshake.auth?.token;
    const payload = verifyToken(token);
    if (!payload) return next(new Error("REALTIME_UNAUTHORIZED"));
    socket.data.auth = payload;
    return next();
  } catch {
    return next(new Error("REALTIME_UNAUTHORIZED"));
  }
});

io.on("connection", (socket) => {
  if (socket.data.auth) {
    const { companyId, userId } = socket.data.auth;
    const room = staffRoom(companyId);
    const key = connectionKey(companyId, userId);
    socket.join(room);

    const nextCount = (connectionCounts.get(key) || 0) + 1;
    connectionCounts.set(key, nextCount);
    clearDisconnectTimer(key);

    socket.emit("realtime:ready", { scope: "staff", companyId, userId });
    socket.on("presence:set", async (payload, acknowledge) => {
      const status = payload?.status;
      try {
        if (typeof status !== "string" || !presenceStatuses.has(status)) {
          throw new Error("INVALID_PRESENCE_STATUS");
        }
        const result = await writePresence(companyId, userId, status);
        acknowledge?.({ ok: true, data: result });
      } catch (error) {
        acknowledge?.({
          ok: false,
          error: error instanceof Error ? error.message : "PRESENCE_UPDATE_FAILED"
        });
      }
    });

    socket.on("presence:heartbeat", async (_payload, acknowledge) => {
      try {
        const result = await heartbeatPresence(companyId, userId);
        acknowledge?.({ ok: true, data: result });
      } catch (error) {
        acknowledge?.({
          ok: false,
          error: error instanceof Error ? error.message : "PRESENCE_HEARTBEAT_FAILED"
        });
      }
    });

    socket.on("disconnect", () => {
      const currentCount = Math.max(0, (connectionCounts.get(key) || 1) - 1);
      if (currentCount > 0) {
        connectionCounts.set(key, currentCount);
        return;
      }

      connectionCounts.delete(key);
      clearDisconnectTimer(key);
      disconnectTimers.set(key, setTimeout(async () => {
        disconnectTimers.delete(key);
        if (connectionCounts.has(key)) return;
        try {
          await redisSet(redisKey(companyId, userId), "NOT_AVAILABLE", notAvailableTtlSeconds);
          emitPresence(companyId, userId, "NOT_AVAILABLE");
        } catch (error) {
          console.error("[socket] Failed to mark employee offline", error);
        }
      }, 10_000));
    });
    return;
  }

  const companyId = socket.data.publicCompanyId;
  socket.join(publicRoom(companyId));
  socket.emit("realtime:ready", { scope: "public", companyId });
});

httpServer.listen(PORT, HOST, () => {
  console.log("[socket] Conventus Socket.IO server listening on " + HOST + ":" + PORT);
  console.log("[socket] Allowed origins: " + allowedOrigins.join(", "));
});

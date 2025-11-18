// server/src/app.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";

// HTTP + Socket.IO
import http from "http";
import { Server as SocketIOServer } from "socket.io";

// 라우터
import authRouter from "./routes/auth";
import productsRouter from "./routes/products";
import uploadRouter from "./routes/upload";
import chatRouter from "./routes/chat";

// 소켓 모델
import ChatMessage from "./models/ChatMessage";
import ChatRoom from "./models/ChatRoom";

const app = express();

/**
 * CORS 프리플라이트 핸들러
 * - 요청 Origin을 그대로 반환 (개발 단계에서 외부 IP/도메인 변화에 대응)
 * - credentials(쿠키) 허용
 * - OPTIONS(사전요청) 204로 처리
 */
app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin"); // 캐시 분리
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// 기본 cors 미들웨어(보호용 안전망)
app.use(cors({ origin: true, credentials: true }));

// 바디/쿠키
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// 업로드 정적 제공
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// 헬스체크
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// 실제 라우터
app.use("/api/auth", authRouter);
app.use("/api/products", productsRouter);
app.use("/api/uploads", uploadRouter);
app.use("/api/chat", chatRouter);

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log("MongoDB connected");

    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST ?? "0.0.0.0"; // 외부 접근 허용

    // HTTP 서버 + Socket.IO 서버
    const server = http.createServer(app);

    /**
     * Socket.IO CORS
     * - 어떤 Origin이든 허용(개발용)
     * - 쿠키 인증과 동일하게 credentials 허용
     */
    const io = new SocketIOServer(server, {
      cors: {
        origin: (origin, cb) => cb(null, true),
        credentials: true,
      },
    });

    // 소켓 이벤트
    io.on("connection", (socket) => {
      // 방 입장
      socket.on("join_room", (roomId: string) => {
        if (!roomId) return;
        socket.join(roomId);
      });

      // 메시지 전송
      socket.on(
        "send_message",
        async (payload: { roomId: string; text: string; senderId: string }) => {
          try {
            const { roomId, text, senderId } = payload || {};
            if (!roomId || !text?.trim() || !senderId) return;

            const room = await ChatRoom.findById(roomId).lean();
            if (!room) return;

            // 방 멤버 검증
            const isMember = [String(room.buyer), String(room.seller)].includes(
              String(senderId)
            );
            if (!isMember) return;

            const msg = await ChatMessage.create({
              room: roomId,
              sender: senderId,
              text: text.trim(),
            });

            await ChatRoom.findByIdAndUpdate(roomId, {
              lastMessage: text.trim(),
              updatedAt: new Date(),
            });

            io.to(roomId).emit("new_message", {
              _id: msg._id,
              room: msg.room,
              sender: msg.sender,
              text: msg.text,
              createdAt: msg.createdAt,
            });
          } catch (e) {
            console.error("send_message error:", e);
          }
        }
      );
    });

    server.listen(port, host, () => {
      console.log(
        `Server running at http://${
          host === "0.0.0.0" ? "127.0.0.1" : host
        }:${port}`
      );
    });
  } catch (err) {
    console.error("❌ Server startup failed:", err);
  }
})();

export default app;

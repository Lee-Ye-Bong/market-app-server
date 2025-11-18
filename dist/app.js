"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/app.ts
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env") });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
// HTTP + Socket.IO
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
// 라우터
const auth_1 = __importDefault(require("./routes/auth"));
const products_1 = __importDefault(require("./routes/products"));
const upload_1 = __importDefault(require("./routes/upload"));
const chat_1 = __importDefault(require("./routes/chat"));
// 소켓 모델
const ChatMessage_1 = __importDefault(require("./models/ChatMessage"));
const ChatRoom_1 = __importDefault(require("./models/ChatRoom"));
const app = (0, express_1.default)();
/**
 * CORS 프리플라이트 핸들러
 * - 요청 Origin을 그대로 반환 (개발 단계에서 외부 IP/도메인 변화에 대응)
 * - credentials(쿠키) 허용
 * - OPTIONS(사전요청) 204로 처리
 */
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Vary", "Origin"); // 캐시 분리
    }
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS")
        return res.sendStatus(204);
    next();
});
// 기본 cors 미들웨어(보호용 안전망)
app.use((0, cors_1.default)({ origin: true, credentials: true }));
// 바디/쿠키
app.use(express_1.default.json({ limit: "2mb" }));
app.use((0, cookie_parser_1.default)());
// 업로드 정적 제공
app.use("/uploads", express_1.default.static(path_1.default.join(process.cwd(), "uploads")));
// 헬스체크
app.get("/api/health", (_req, res) => res.json({ ok: true }));
// 실제 라우터
app.use("/api/auth", auth_1.default);
app.use("/api/products", products_1.default);
app.use("/api/uploads", upload_1.default);
app.use("/api/chat", chat_1.default);
(async () => {
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");
        const port = Number(process.env.PORT) || 4000;
        const host = process.env.HOST ?? "0.0.0.0"; // 외부 접근 허용
        // HTTP 서버 + Socket.IO 서버
        const server = http_1.default.createServer(app);
        /**
         * Socket.IO CORS
         * - 어떤 Origin이든 허용(개발용)
         * - 쿠키 인증과 동일하게 credentials 허용
         */
        const io = new socket_io_1.Server(server, {
            cors: {
                origin: (origin, cb) => cb(null, true),
                credentials: true,
            },
        });
        // 소켓 이벤트
        io.on("connection", (socket) => {
            // 방 입장
            socket.on("join_room", (roomId) => {
                if (!roomId)
                    return;
                socket.join(roomId);
            });
            // 메시지 전송
            socket.on("send_message", async (payload) => {
                try {
                    const { roomId, text, senderId } = payload || {};
                    if (!roomId || !text?.trim() || !senderId)
                        return;
                    const room = await ChatRoom_1.default.findById(roomId).lean();
                    if (!room)
                        return;
                    // 방 멤버 검증
                    const isMember = [String(room.buyer), String(room.seller)].includes(String(senderId));
                    if (!isMember)
                        return;
                    const msg = await ChatMessage_1.default.create({
                        room: roomId,
                        sender: senderId,
                        text: text.trim(),
                    });
                    await ChatRoom_1.default.findByIdAndUpdate(roomId, {
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
                }
                catch (e) {
                    console.error("send_message error:", e);
                }
            });
        });
        server.listen(port, host, () => {
            console.log(`Server running at http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
        });
    }
    catch (err) {
        console.error("❌ Server startup failed:", err);
    }
})();
exports.default = app;

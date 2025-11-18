"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const authToken_1 = require("../utils/authToken");
const ChatRoom_1 = __importDefault(require("../models/ChatRoom"));
const ChatMessage_1 = __importDefault(require("../models/ChatMessage"));
const Product_1 = __importDefault(require("../models/Product"));
const router = (0, express_1.Router)();
/**
 * POST /api/chat/rooms
 * body: { productId }
 * - 로그인 사용자(me)가 buyer
 * - product.seller를 서버가 조회
 * - 기존 방이 있으면 그대로 반환
 */
router.post("/rooms", async (req, res) => {
    const me = (0, authToken_1.readUserFromReq)(req); // {_id, userId, ...}
    if (!me)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const { productId } = req.body;
    if (!productId || !mongoose_1.default.isValidObjectId(productId)) {
        return res.status(400).json({ ok: false, error: "invalid_productId" });
    }
    const product = await Product_1.default.findById(productId).lean();
    if (!product)
        return res.status(404).json({ ok: false, error: "product_not_found" });
    const sellerId = String(product.seller);
    const buyerId = String(me.id);
    if (sellerId === buyerId) {
        return res
            .status(400)
            .json({ ok: false, error: "cannot_chat_with_own_product" });
    }
    let room = await ChatRoom_1.default.findOne({
        product: productId,
        buyer: buyerId,
    });
    if (!room) {
        room = await ChatRoom_1.default.create({
            product: productId,
            buyer: buyerId,
            seller: sellerId,
            lastMessage: "",
        });
    }
    return res.json({ ok: true, roomId: room._id.toString() });
});
/** 내가 참여한 채팅방 목록 */
router.get("/rooms", async (req, res) => {
    const me = (0, authToken_1.readUserFromReq)(req);
    if (!me)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const rooms = await ChatRoom_1.default.find({
        $or: [{ buyer: me.id }, { seller: me.id }],
    })
        .sort({ updatedAt: -1 })
        .lean();
    return res.json({ ok: true, rooms });
});
/** 특정 방의 메시지 */
router.get("/rooms/:roomId/messages", async (req, res) => {
    const me = (0, authToken_1.readUserFromReq)(req);
    if (!me)
        return res.status(401).json({ ok: false, error: "unauthorized" });
    const { roomId } = req.params;
    if (!mongoose_1.default.isValidObjectId(roomId)) {
        return res.status(400).json({ ok: false, error: "invalid_roomId" });
    }
    // (옵션) 방 멤버십 확인
    const room = await ChatRoom_1.default.findById(roomId).lean();
    if (!room)
        return res.status(404).json({ ok: false, error: "room_not_found" });
    const isMember = [String(room.buyer), String(room.seller)].includes(String(me.id));
    if (!isMember)
        return res.status(403).json({ ok: false, error: "forbidden" });
    const messages = await ChatMessage_1.default.find({ room: roomId })
        .sort({ createdAt: 1 })
        .lean();
    return res.json({ ok: true, messages });
});
exports.default = router;

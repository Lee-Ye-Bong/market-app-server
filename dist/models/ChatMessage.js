"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/models/ChatMessage.ts
const mongoose_1 = require("mongoose");
const ChatMessageSchema = new mongoose_1.Schema({
    room: { type: mongoose_1.Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    sender: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    readBy: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "User" }],
}, 
// 스크린샷대로 createdAt만 쓰고 updatedAt은 끔
{ timestamps: { createdAt: true, updatedAt: false } });
// 자주 조회하는 패턴: 같은 방에서 시간순
ChatMessageSchema.index({ room: 1, createdAt: 1 });
exports.default = (0, mongoose_1.model)("ChatMessage", ChatMessageSchema);

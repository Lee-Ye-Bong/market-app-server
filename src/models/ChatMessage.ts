// src/models/ChatMessage.ts
import {
  Schema,
  model,
  Types,
  InferSchemaType,
  HydratedDocument,
} from "mongoose";

const ChatMessageSchema = new Schema(
  {
    room: { type: Schema.Types.ObjectId, ref: "ChatRoom", required: true },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  // 스크린샷대로 createdAt만 쓰고 updatedAt은 끔
  { timestamps: { createdAt: true, updatedAt: false } }
);

// 자주 조회하는 패턴: 같은 방에서 시간순
ChatMessageSchema.index({ room: 1, createdAt: 1 });

export type ChatMessage = InferSchemaType<typeof ChatMessageSchema>;
export type ChatMessageDoc = HydratedDocument<ChatMessage>;

export default model<ChatMessage>("ChatMessage", ChatMessageSchema);

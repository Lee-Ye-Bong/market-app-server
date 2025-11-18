import mongoose, { Schema, Types } from "mongoose";

export interface ChatRoomDoc {
  product: Types.ObjectId;
  seller: Types.ObjectId;
  buyer: Types.ObjectId;
  lastMessage?: string;
  updatedAt: Date;
  createdAt: Date;
}

const ChatRoomSchema = new Schema<ChatRoomDoc>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
    buyer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastMessage: { type: String },
  },
  { timestamps: true }
);

ChatRoomSchema.index({ product: 1, buyer: 1 }, { unique: true });

export default mongoose.model<ChatRoomDoc>("ChatRoom", ChatRoomSchema);

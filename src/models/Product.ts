import { Schema, model, Types } from "mongoose";

const ProductSchema = new Schema(
  {
    seller: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "기타", index: true },
    location: { type: String, default: "미정", index: true },
    images: { type: [String], default: [] }, // 업로드된 이미지 URL 배열
    status: {
      type: String,
      enum: ["selling", "reserved", "sold"],
      default: "selling",
      index: true,
    },
  },
  { timestamps: true }
);

export default model("Product", ProductSchema);

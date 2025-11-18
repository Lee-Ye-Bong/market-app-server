// server/src/models/User.ts
import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";

const UserSchema = new Schema(
  {
    // 로그인용 ID (필수, 유니크)
    userId: { type: String, required: true, unique: true, trim: true },

    // 비밀번호 해시 (필수)
    passwordHash: { type: String, required: true },

    // 이메일 (필수, 유니크)
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },

    // 프로필 닉네임(선택) — 입력 안 하면 필드를 만들지 않도록 undefined 유지
    username: { type: String, trim: true, default: undefined },

    emailVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// username은 "문자열로 존재할 때만" 유니크 검사
UserSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string" } } }
);

// 스키마 → 타입 자동 추론
export type User = InferSchemaType<typeof UserSchema>;
export type UserDoc = HydratedDocument<User>;

export default model<User>("User", UserSchema);

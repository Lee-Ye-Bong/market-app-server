// server/src/routes/auth.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

import EmailCode from "../models/EmailCode";
import User from "../models/User";
import { signUser, readUserFromReq } from "../utils/authToken";

/* ---------------------- utils ---------------------- */
function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}
const mask = (s?: string) => (s ? s.slice(0, 2) + "***" : "(missing)");

/* ----------------- auth/cookie const ---------------- */
const JWT_COOKIE = process.env.JWT_COOKIE || "krush_token";

/**
 * 개발환경(http)에서 안전하게 쓰는 기본 쿠키 옵션
 * - sameSite: 'lax' → CSRF 보호에 기본적 도움, GET 네비게이션에는 쿠키 포함
 * - secure: false → https가 아닐 때(개발) 반드시 false
 */
const DEV_COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: false, // 로컬 http 개발환경
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};

/* ------------------- nodemailer -------------------- */
/** Gmail: 앱 비밀번호 필요(구글계정 → 보안 → 2단계 인증 → 앱 비밀번호) */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: requireEnv("SMTP_USER"),
    pass: requireEnv("SMTP_PASS"),
  },
});

// 기동 시 1회 확인 로그
(async () => {
  console.log("[SMTP ENV]", {
    user: mask(process.env.SMTP_USER),
    pass: process.env.SMTP_PASS ? "(set)" : "(missing)",
  });
  try {
    await transporter.verify();
    console.log("SMTP ready");
  } catch (e: any) {
    console.error("SMTP verify failed:", e?.message || e);
  }
})();

/* ---------------------- schema --------------------- */
const sendSchema = z.object({ email: z.string().email() });
const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(8),
});
const signupSchema = z.object({
  userId: z.string().min(3),
  password: z.string().min(4),
  email: z.string().email(),
});
const loginSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
});

/* -------------------- router ----------------------- */
const router = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 10 });

/**
 * POST /api/auth/send-code
 * body: { email }
 */
router.post("/send-code", limiter, async (req, res) => {
  try {
    const { email } = sendSchema.parse(req.body);

    // 6자리 코드 생성 & 만료 10분
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await EmailCode.findOneAndUpdate(
      { email },
      { code, expiresAt, attempts: 0 },
      { upsert: true, new: true }
    );

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM ?? requireEnv("SMTP_USER"),
      to: email,
      subject: "KRUSH 이메일 인증코드",
      text: `인증코드: ${code} (10분 이내 유효)`,
      html: `<p>인증코드: <b style="font-size:18px;">${code}</b></p><p>10분 이내에 입력해 주세요.</p>`,
    });

    return res.json({ ok: true, messageId: info.messageId });
  } catch (e: any) {
    console.error("send-code error:", e);
    const msg = e?.message || "Failed to send email code";
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/auth/verify-code
 * body: { email, code }
 */
router.post("/verify-code", limiter, async (req, res) => {
  try {
    const { email, code } = verifySchema.parse(req.body);

    const doc = await EmailCode.findOne({ email });
    if (!doc) {
      return res
        .status(400)
        .json({ ok: false, error: "코드를 다시 요청하세요." });
    }

    if (doc.expiresAt.getTime() < Date.now()) {
      await doc.deleteOne();
      return res
        .status(400)
        .json({ ok: false, error: "코드가 만료되었습니다." });
    }

    if (doc.attempts >= 5) {
      return res.status(429).json({ ok: false, error: "시도 횟수 초과" });
    }

    if (doc.code !== code) {
      doc.attempts += 1;
      await doc.save();
      return res
        .status(400)
        .json({ ok: false, error: "인증코드가 일치하지 않습니다." });
    }

    // 성공 시 사용 완료 처리
    await EmailCode.deleteOne({ email });
    return res.json({ ok: true, verified: true });
  } catch (e: any) {
    console.error("verify-code error:", e);
    const msg = e?.message || "Failed to verify code";
    return res.status(400).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/auth/signup
 * body: { userId, password, email }
 * - 기본적으로 회원만 생성(자동 로그인은 하지 않음)
 */
router.post("/signup", limiter, async (req, res) => {
  try {
    const { userId, password, email } = signupSchema.parse(req.body);

    const exists = await User.findOne({ $or: [{ userId }, { email }] });
    if (exists) {
      return res
        .status(409)
        .json({ ok: false, error: "이미 사용 중인 아이디/이메일" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      userId,
      passwordHash: hash,
      email,
      emailVerified: true, // 실제 서비스는 verify 후 true 권장
    });

    // 필요 시 자동 로그인까지 하려면 아래 주석 해제:
    // const token = signUser({ id: String(user._id), userId: user.userId, email: user.email });
    // res.cookie(JWT_COOKIE, token, DEV_COOKIE_OPTIONS);

    return res.json({
      ok: true,
      user: { id: String(user._id), userId: user.userId, email: user.email },
    });
  } catch (e: any) {
    console.error("signup error:", e);
    const msg = e?.message || "Failed to signup";
    return res.status(400).json({ ok: false, error: msg });
  }
});

/** POST /api/auth/login */
router.post("/login", limiter, async (req, res) => {
  try {
    const { userId, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ userId });
    if (!user) {
      return res.status(401).json({
        ok: false,
        error: "아이디 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({
        ok: false,
        error: "아이디 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    // ✅ JWT 발급
    const token = signUser({
      id: String(user._id),
      userId: user.userId,
      email: user.email,
    });

    // ✅ 여기서 쿠키로 내려줍니다 (개발환경 옵션)
    res.cookie(JWT_COOKIE, token, DEV_COOKIE_OPTIONS);

    return res.json({
      ok: true,
      user: { id: String(user._id), userId: user.userId, email: user.email },
    });
  } catch (e: any) {
    console.error("login error:", e);
    return res
      .status(500)
      .json({ ok: false, error: e?.message || "login failed" });
  }
});

/** GET /api/auth/me */
router.get("/me", (req, res) => {
  const u = readUserFromReq(req);
  if (!u) return res.status(401).json({ ok: false, error: "unauthorized" });
  return res.json({ ok: true, user: u });
});

/** POST /api/auth/logout */
router.post("/logout", (_req, res) => {
  // 로그인과 같은 옵션으로 지워야 확실히 클리어됨
  res.clearCookie(JWT_COOKIE, {
    sameSite: "lax",
    secure: false,
  });
  return res.json({ ok: true });
});

export default router;

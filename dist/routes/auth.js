"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// server/src/routes/auth.ts
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), ".env") });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const zod_1 = require("zod");
const nodemailer_1 = __importDefault(require("nodemailer"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const EmailCode_1 = __importDefault(require("../models/EmailCode"));
const User_1 = __importDefault(require("../models/User"));
const authToken_1 = require("../utils/authToken");
/* ---------------------- utils ---------------------- */
function requireEnv(name) {
    const v = process.env[name];
    if (!v)
        throw new Error(`Missing env ${name}`);
    return v;
}
const mask = (s) => (s ? s.slice(0, 2) + "***" : "(missing)");
/* ----------------- auth/cookie const ---------------- */
const JWT_COOKIE = process.env.JWT_COOKIE || "krush_token";
/**
 * 개발환경(http)에서 안전하게 쓰는 기본 쿠키 옵션
 * - sameSite: 'lax' → CSRF 보호에 기본적 도움, GET 네비게이션에는 쿠키 포함
 * - secure: false → https가 아닐 때(개발) 반드시 false
 */
const DEV_COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // 로컬 http 개발환경
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
};
/* ------------------- nodemailer -------------------- */
/** Gmail: 앱 비밀번호 필요(구글계정 → 보안 → 2단계 인증 → 앱 비밀번호) */
const transporter = nodemailer_1.default.createTransport({
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
    }
    catch (e) {
        console.error("SMTP verify failed:", e?.message || e);
    }
})();
/* ---------------------- schema --------------------- */
const sendSchema = zod_1.z.object({ email: zod_1.z.string().email() });
const verifySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    code: zod_1.z.string().min(4).max(8),
});
const signupSchema = zod_1.z.object({
    userId: zod_1.z.string().min(3),
    password: zod_1.z.string().min(4),
    email: zod_1.z.string().email(),
});
const loginSchema = zod_1.z.object({
    userId: zod_1.z.string().min(1),
    password: zod_1.z.string().min(1),
});
/* -------------------- router ----------------------- */
const router = (0, express_1.Router)();
const limiter = (0, express_rate_limit_1.default)({ windowMs: 60000, max: 10 });
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
        await EmailCode_1.default.findOneAndUpdate({ email }, { code, expiresAt, attempts: 0 }, { upsert: true, new: true });
        const info = await transporter.sendMail({
            from: process.env.MAIL_FROM ?? requireEnv("SMTP_USER"),
            to: email,
            subject: "KRUSH 이메일 인증코드",
            text: `인증코드: ${code} (10분 이내 유효)`,
            html: `<p>인증코드: <b style="font-size:18px;">${code}</b></p><p>10분 이내에 입력해 주세요.</p>`,
        });
        return res.json({ ok: true, messageId: info.messageId });
    }
    catch (e) {
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
        const doc = await EmailCode_1.default.findOne({ email });
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
        await EmailCode_1.default.deleteOne({ email });
        return res.json({ ok: true, verified: true });
    }
    catch (e) {
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
        const exists = await User_1.default.findOne({ $or: [{ userId }, { email }] });
        if (exists) {
            return res
                .status(409)
                .json({ ok: false, error: "이미 사용 중인 아이디/이메일" });
        }
        const hash = await bcryptjs_1.default.hash(password, 10);
        const user = await User_1.default.create({
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
    }
    catch (e) {
        console.error("signup error:", e);
        const msg = e?.message || "Failed to signup";
        return res.status(400).json({ ok: false, error: msg });
    }
});
/** POST /api/auth/login */
router.post("/login", limiter, async (req, res) => {
    try {
        const { userId, password } = loginSchema.parse(req.body);
        const user = await User_1.default.findOne({ userId });
        if (!user) {
            return res.status(401).json({
                ok: false,
                error: "아이디 또는 비밀번호가 올바르지 않습니다.",
            });
        }
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({
                ok: false,
                error: "아이디 또는 비밀번호가 올바르지 않습니다.",
            });
        }
        // ✅ JWT 발급
        const token = (0, authToken_1.signUser)({
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
    }
    catch (e) {
        console.error("login error:", e);
        return res
            .status(500)
            .json({ ok: false, error: e?.message || "login failed" });
    }
});
/** GET /api/auth/me */
router.get("/me", (req, res) => {
    const u = (0, authToken_1.readUserFromReq)(req);
    if (!u)
        return res.status(401).json({ ok: false, error: "unauthorized" });
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
exports.default = router;

import { Router } from "express";
import { z } from "zod";
import Product from "../models/Product";
import { readUserFromReq } from "../utils/authToken";

const router = Router();

/** 등록 */
router.post("/", async (req, res) => {
  const user = readUserFromReq(req);
  if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });

  const Body = z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
    price: z.number().nonnegative(),
    category: z.string().optional().default("기타"),
    location: z.string().optional().default("미정"),
    images: z.array(z.string().url()).optional().default([]),
  });

  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.message });
  }

  const doc = await Product.create({ ...parsed.data, seller: user.id });
  return res.status(201).json({ ok: true, product: doc });
});

/** 목록 (최신순) */
router.get("/", async (_req, res) => {
  const list = await Product.find().sort({ createdAt: -1 }).limit(200);
  return res.json({ ok: true, products: list });
});

/** 단건 조회 */
router.get("/:id", async (req, res) => {
  const item = await Product.findById(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "not_found" });
  return res.json({ ok: true, product: item });
});

export default router;

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { ApiError } from "../errors.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().optional(),
  }).parse(req.body);

  const passwordHash = await bcrypt.hash(body.password, 12);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name AS "fullName", created_at AS "createdAt"`,
      [body.email, passwordHash, body.fullName ?? null],
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === "23505") throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "Email already exists");
    throw error;
  }
});

authRouter.post("/login", async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const result = await pool.query("SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1", [body.email]);
  const user = result.rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }
  if (!user.is_active) throw new ApiError(403, "ACCOUNT_SUSPENDED", "Account suspended");

  const accessToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.jwtSecret, { expiresIn: "15m" });
  res.json({ accessToken, expiresIn: 900, user: { id: user.id, email: user.email, role: user.role } });
});

authRouter.post("/refresh", async (_req, res) => {
  throw new ApiError(501, "NOT_IMPLEMENTED", "Refresh-token rotation will be implemented with session cookies");
});

authRouter.post("/logout", async (_req, res) => {
  res.status(204).end();
});

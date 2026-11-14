import { cookies } from "next/headers";
import crypto from "crypto";
import { prisma } from "./db";

const COOKIE = "showroom_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function sign(payload: string) {
  const secret = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) throw new Error("Set a strong AUTH_SECRET before running in production");
  return crypto.createHmac("sha256", secret || "dev-secret").update(payload).digest("hex");
}

export async function createSession(userId: number) {
  const payload = `${userId}.${Date.now()}`;
  const value = `${payload}.${sign(payload)}`;
  const store = await cookies();
  store.set(COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getSessionUser() {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  const match = value?.match(/^(\d+)\.(\d+)\.([a-f0-9]{64})$/);
  if (!match) return null;
  const userId = Number(match[1]), issuedAt = Number(match[2]);
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(issuedAt) || issuedAt > Date.now() + 60000 || Date.now() - issuedAt > MAX_AGE * 1000) return null;
  const signature = Buffer.from(match[3], "hex");
  const expected = Buffer.from(sign(`${match[1]}.${match[2]}`), "hex");
  if (!crypto.timingSafeEqual(signature, expected)) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export async function requireAdminUser() {
  const user = await requireSessionUser();
  if (user.role !== "admin") throw new Error("Administrator required");
  return user;
}

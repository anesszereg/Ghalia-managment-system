import { createHash, timingSafeEqual } from "node:crypto";
import { retrySaleEmails, saleEmailConfigured } from "@/lib/sale-email";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 32) return Response.json({ error: "Email retries are not configured" }, { status: 503 });
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(request.headers.get("authorization") || ""), hash(`Bearer ${secret}`))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!saleEmailConfigured()) return Response.json({ error: "Email delivery is not configured" }, { status: 503 });
  return Response.json({ results: await retrySaleEmails() });
}

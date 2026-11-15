"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "./auth";
import { prisma } from "./db";
import { deliverSaleEmail, saleEmailConfigured } from "./sale-email";

export async function retrySaleEmailAction(formData: FormData) {
  await requireAdminUser();
  const saleId = Number(formData.get("saleId"));
  if (!Number.isSafeInteger(saleId) || saleId < 1 || !saleEmailConfigured()) return;
  const eligible = await prisma.saleEmailNotification.updateMany({ where: { saleId, status: "FAILED", attempts: { lt: 8 } }, data: { retryAt: new Date() } });
  if (eligible.count) await deliverSaleEmail(saleId);
  revalidatePath(`/sales/${saleId}`);
}

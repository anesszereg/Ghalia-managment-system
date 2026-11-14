import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ transactionOptions: { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 } });

export const isPostgres = /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || "");

export function textContains(value: string) {
  return isPostgres ? { contains: value, mode: "insensitive" as const } : { contains: value };
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

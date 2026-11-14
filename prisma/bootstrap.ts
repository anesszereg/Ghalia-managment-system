import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

export async function initializeHostedDatabase(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  if (!/^postgres(?:ql)?:/.test(env.DATABASE_URL || "")) throw new Error("Deployment: a PostgreSQL DATABASE_URL is required; local SQLite data will not be initialized.");
  if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) throw new Error("Deployment: AUTH_SECRET must contain at least 32 characters.");
  if (await db.user.count()) return false;
  const email = (env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Deployment: set a valid ADMIN_EMAIL for the initial administrator.");
  if (password.length < 16 || Buffer.byteLength(password) > 72) throw new Error("Deployment: ADMIN_PASSWORD must have at least 16 characters and at most 72 UTF-8 bytes.");
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    if (await tx.user.count()) return;
    await tx.user.create({ data: { email, name: env.ADMIN_NAME?.trim() || "Administrator", passwordHash, role: "admin" } });
    await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, showroomName: env.SHOWROOM_NAME?.trim() || "My Showroom" }, update: {} });
    await tx.cashbook.upsert({ where: { id: 1 }, create: { id: 1, baselineCents: 0, provisional: true }, update: {} });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return true;
}

if (require.main === module) {
  const db = new PrismaClient();
  initializeHostedDatabase(db)
    .then(created => console.log(created ? "Fresh database initialized. No demo transactions were added." : "Existing installation preserved; administrator credentials were not changed."))
    .catch(error => {
      console.error(error instanceof Error && error.message.startsWith("Deployment:") ? error.message : "Database initialization failed. Check PostgreSQL connectivity and deployment settings.");
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}

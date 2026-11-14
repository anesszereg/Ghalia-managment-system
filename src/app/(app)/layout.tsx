import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/utils";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";

async function count(query: ReturnType<typeof prisma.$queryRaw>): Promise<number> {
  const rows: any = await query;
  return Number(rows[0]?.c ?? 0);
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  const cashSession = await prisma.cashSession.findUnique({ where: { openKey: 1 } });
  const cashReady = cashSession?.openedAt.toDateString() === new Date().toDateString();

  const today = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);

  const [lowStock, overdueSales, overduePurchases, dueSoonSales, dueSoonPurchases] =
    await Promise.all([
      count(prisma.$queryRaw`SELECT COUNT(*) as c FROM "Product" WHERE stock <= "minStock"`),
      count(prisma.$queryRaw`SELECT COUNT(*) as c FROM "Sale" WHERE status='confirmed' AND paid < total AND "dueDate" < ${today}`),
      count(prisma.$queryRaw`SELECT COUNT(*) as c FROM "Purchase" WHERE status='confirmed' AND paid < total AND "dueDate" < ${today}`),
      count(prisma.$queryRaw`SELECT COUNT(*) as c FROM "Sale" WHERE status='confirmed' AND paid < total AND "dueDate" >= ${today} AND "dueDate" <= ${soon}`),
      count(prisma.$queryRaw`SELECT COUNT(*) as c FROM "Purchase" WHERE status='confirmed' AND paid < total AND "dueDate" >= ${today} AND "dueDate" <= ${soon}`),
    ]);

  const alerts = {
    lowStock,
    overdueSales,
    overduePurchases,
    dueSoon: dueSoonSales + dueSoonPurchases,
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar showroomName={settings.showroomName} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} alerts={alerts} />
        <main id="main-content" className="w-full max-w-[1440px] flex-1 self-center p-4 sm:p-8">
          {!cashReady && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><span><b>Caisse closed.</b> Open a session before recording cash payments.</span><Link href="/caisse" className="shrink-0 font-semibold underline underline-offset-4">Go to caisse</Link></div>}
          {children}
        </main>
      </div>
    </div>
  );
}

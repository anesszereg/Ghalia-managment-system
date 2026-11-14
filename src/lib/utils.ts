import { prisma } from "./db";

export function fmt(amount: number, currency = "DZD") {
  return (
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount) +
    " " +
    currency
  );
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return (
    fmtDate(date) +
    " " +
    date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export async function getSettings() {
  let s = await prisma.setting.findUnique({ where: { id: 1 } });
  if (!s) s = await prisma.setting.create({ data: { id: 1 } });
  return s;
}

// Unique reference generator. prefix from settings; sequence from counter table emulation.
export async function nextRef(
  tx: any,
  kind: "sale" | "purchase" | "payment" | "expense"
): Promise<string> {
  const settings = await tx.setting.findUnique({ where: { id: 1 } });
  const prefixes: Record<string, string> = {
    sale: settings?.salePrefix || "SAL-",
    purchase: settings?.purchasePrefix || "PUR-",
    payment: settings?.paymentPrefix || "PAY-",
    expense: settings?.expensePrefix || "EXP-",
  };
  const year = new Date().getFullYear();
  const models: Record<string, string> = {
    sale: "sale",
    purchase: "purchase",
    payment: "payment",
    expense: "expense",
  };
  const count = await tx[models[kind]].count();
  let n = count + 1;
  let ref = `${prefixes[kind]}${year}-${String(n).padStart(5, "0")}`;
  // ensure uniqueness
  while (await tx[models[kind]].findUnique({ where: { ref } })) {
    n++;
    ref = `${prefixes[kind]}${year}-${String(n).padStart(5, "0")}`;
  }
  return ref;
}

export function payStatus(paid: number, total: number) {
  if (paid <= 0) return "UNPAID";
  if (paid < total - 0.001) return "PARTIALLY PAID";
  return "PAID";
}

export const CATEGORIES = [
  "Bathroom cabinets",
  "Bathroom mirrors",
  "Washbasins",
  "Bathroom accessories",
  "Bathroom furniture sets",
  "Other products",
];

export const EXPENSE_CATEGORIES = [
  "Transportation",
  "Installation",
  "Rent",
  "Maintenance",
  "Salaries",
  "Utilities",
  "Marketing",
  "Other",
];

export const PAYMENT_METHODS = ["cash", "bank transfer", "other"];

export function rangeFromParams(
  range?: string,
  from?: string,
  to?: string
): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case "week": {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - d.getDay() + 1);
      return { start: d, end, label: "This week" };
    }
    case "month":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end,
        label: "This month",
      };
    case "year":
      return { start: new Date(now.getFullYear(), 0, 1), end, label: "This year" };
    case "custom": {
      const s = from ? new Date(from + "T00:00:00") : todayStart;
      const e = to ? new Date(to + "T23:59:59.999") : end;
      return { start: s, end: e, label: "Custom" };
    }
    case "today":
    default:
      return { start: todayStart, end, label: "Today" };
  }
}

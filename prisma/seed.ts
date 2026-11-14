import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production" || /^postgres(?:ql)?:/.test(process.env.DATABASE_URL || "")) throw new Error("Demo seeding is disabled for hosted databases. Use the secure bootstrap script instead.");
  await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: {
    id: 1,
    showroomName: "Elegance Bain Showroom",
    address: "123 Rue des Jardins, Algiers",
    phone: "+213 555 00 00 00",
  }});

  const admin = await prisma.user.upsert({
    where: { email: "admin@showroom.com" },
    update: {},
    create: {
      email: "admin@showroom.com",
      name: "Administrator",
      role: "admin",
      passwordHash: await bcrypt.hash("admin123", 10),
    },
  });
  console.log("Admin:", admin.email, "/ admin123");

  const supplier = await prisma.supplier.create({
    data: { name: "SaniaDist SARL", phone: "+213 550 11 22 33", address: "Zone Industrielle, Algiers", email: "contact@sanistadz.com" },
  });
  const supplier2 = await prisma.supplier.create({
    data: { name: "MediBath Import", phone: "+213 561 44 55 66", address: "Port d'Alger", email: "sales@medibath.dz" },
  });

  const products = [
    { sku: "CAB-001", name: "Milano Wall Cabinet 80cm", category: "Bathroom cabinets", purchasePrice: 18000, sellingPrice: 26000, stock: 8, minStock: 3, dimensions: "80x45x60 cm", supplierId: supplier.id },
    { sku: "CAB-002", name: "Roma Floor Cabinet 100cm", category: "Bathroom cabinets", purchasePrice: 32000, sellingPrice: 45000, stock: 5, minStock: 2, dimensions: "100x50x85 cm", supplierId: supplier.id },
    { sku: "MIR-001", name: "LED Mirror 60x80", category: "Bathroom mirrors", purchasePrice: 9000, sellingPrice: 14500, stock: 12, minStock: 4, dimensions: "60x80 cm", supplierId: supplier2.id },
    { sku: "MIR-002", name: "Round Mirror 70cm", category: "Bathroom mirrors", purchasePrice: 5500, sellingPrice: 9000, stock: 2, minStock: 4, dimensions: "Ø70 cm", supplierId: supplier2.id },
    { sku: "WB-001", name: "Ceramic Washbasin Oval", category: "Washbasins", purchasePrice: 7000, sellingPrice: 11500, stock: 15, minStock: 5, dimensions: "55x40 cm", supplierId: supplier.id },
    { sku: "WB-002", name: "Stone Countertop Basin", category: "Washbasins", purchasePrice: 14000, sellingPrice: 22000, stock: 6, minStock: 3, dimensions: "50x38 cm", supplierId: supplier.id },
    { sku: "ACC-001", name: "Towel Rack Set Chrome", category: "Bathroom accessories", purchasePrice: 2500, sellingPrice: 4500, stock: 25, minStock: 8, supplierId: supplier2.id },
    { sku: "SET-001", name: "Venice Complete Set 120cm", category: "Bathroom furniture sets", purchasePrice: 85000, sellingPrice: 120000, stock: 3, minStock: 1, dimensions: "120 cm", supplierId: supplier.id },
  ];
  for (const p of products) {
    await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  }

  const customer = await prisma.customer.create({
    data: { name: "Karim Benali", phone: "+213 770 12 34 56", address: "Hydra, Algiers" },
  });
  await prisma.customer.create({
    data: { name: "Amina Cherif", phone: "+213 661 98 76 54", address: "Oran" },
  });

  console.log("Seed complete");
}

main().finally(() => prisma.$disconnect());

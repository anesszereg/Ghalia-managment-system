-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "supplierOpening" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Payment_supplierOpening_idx" ON "Payment"("supplierOpening");

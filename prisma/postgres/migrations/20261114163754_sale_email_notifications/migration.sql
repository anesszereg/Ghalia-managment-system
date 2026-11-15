-- CreateTable
CREATE TABLE "SaleEmailNotification" (
    "id" TEXT NOT NULL,
    "saleId" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT NOT NULL DEFAULT '',
    "firstAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleEmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleEmailNotification_saleId_key" ON "SaleEmailNotification"("saleId");

-- CreateIndex
CREATE INDEX "SaleEmailNotification_status_retryAt_idx" ON "SaleEmailNotification"("status", "retryAt");

-- AddForeignKey
ALTER TABLE "SaleEmailNotification" ADD CONSTRAINT "SaleEmailNotification_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

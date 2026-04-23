-- CreateEnum
CREATE TYPE "AsaasPaymentStatus" AS ENUM ('PENDING', 'RECEIVED', 'CONFIRMED', 'OVERDUE', 'REFUNDED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'AWAITING_RISK_ANALYSIS');

-- CreateEnum
CREATE TYPE "AsaasBillingType" AS ENUM ('BOLETO', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'TRANSFER', 'DEPOSIT', 'UNDEFINED');

-- CreateEnum
CREATE TYPE "AgencyLeadStatus" AS ENUM ('NOVO', 'EM_CONTATO', 'REUNIAO_AGENDADA', 'PROPOSTA_ENVIADA', 'PROPOSTA_ACEITA', 'FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "AgencyActivityType" AS ENUM ('NOTA', 'LIGACAO', 'EMAIL', 'REUNIAO', 'WHATSAPP', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "AsaasCustomer" (
    "id" TEXT NOT NULL,
    "asaasId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "cpfCnpj" TEXT,
    "phone" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT,

    CONSTRAINT "AsaasCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsaasPayment" (
    "id" TEXT NOT NULL,
    "asaasId" TEXT NOT NULL,
    "status" "AsaasPaymentStatus" NOT NULL,
    "billingType" "AsaasBillingType" NOT NULL DEFAULT 'UNDEFINED',
    "value" DECIMAL(12,2) NOT NULL,
    "netValue" DECIMAL(12,2),
    "dueDate" DATE NOT NULL,
    "paymentDate" DATE,
    "description" TEXT,
    "invoiceUrl" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "AsaasPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsaasSubscription" (
    "id" TEXT NOT NULL,
    "asaasId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "nextDueDate" DATE,
    "description" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,

    CONSTRAINT "AsaasSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsaasTransfer" (
    "id" TEXT NOT NULL,
    "asaasId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "netValue" DECIMAL(12,2),
    "transferDate" DATE NOT NULL,
    "scheduleDate" DATE,
    "description" TEXT,
    "operationType" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "AsaasTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyLead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "source" TEXT,
    "status" "AgencyLeadStatus" NOT NULL DEFAULT 'NOVO',
    "value" DECIMAL(12,2),
    "probability" INTEGER,
    "expectedCloseAt" DATE,
    "closedAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AgencyLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyActivity" (
    "id" TEXT NOT NULL,
    "type" "AgencyActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "leadId" TEXT,

    CONSTRAINT "AgencyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AsaasCustomer_asaasId_key" ON "AsaasCustomer"("asaasId");
CREATE UNIQUE INDEX "AsaasCustomer_clientId_key" ON "AsaasCustomer"("clientId");
CREATE INDEX "AsaasCustomer_cpfCnpj_idx" ON "AsaasCustomer"("cpfCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "AsaasPayment_asaasId_key" ON "AsaasPayment"("asaasId");
CREATE INDEX "AsaasPayment_status_idx" ON "AsaasPayment"("status");
CREATE INDEX "AsaasPayment_dueDate_idx" ON "AsaasPayment"("dueDate");
CREATE INDEX "AsaasPayment_paymentDate_idx" ON "AsaasPayment"("paymentDate");
CREATE INDEX "AsaasPayment_customerId_idx" ON "AsaasPayment"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AsaasSubscription_asaasId_key" ON "AsaasSubscription"("asaasId");
CREATE INDEX "AsaasSubscription_status_idx" ON "AsaasSubscription"("status");
CREATE INDEX "AsaasSubscription_customerId_idx" ON "AsaasSubscription"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "AsaasTransfer_asaasId_key" ON "AsaasTransfer"("asaasId");
CREATE INDEX "AsaasTransfer_transferDate_idx" ON "AsaasTransfer"("transferDate");
CREATE INDEX "AsaasTransfer_status_idx" ON "AsaasTransfer"("status");
CREATE INDEX "AsaasTransfer_categoryId_idx" ON "AsaasTransfer"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_name_key" ON "FinancialCategory"("name");

-- CreateIndex
CREATE INDEX "AgencyLead_status_idx" ON "AgencyLead"("status");
CREATE INDEX "AgencyLead_createdAt_idx" ON "AgencyLead"("createdAt");

-- CreateIndex
CREATE INDEX "AgencyActivity_leadId_idx" ON "AgencyActivity"("leadId");

-- AddForeignKey
ALTER TABLE "AsaasCustomer" ADD CONSTRAINT "AsaasCustomer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AsaasPayment" ADD CONSTRAINT "AsaasPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "AsaasCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AsaasSubscription" ADD CONSTRAINT "AsaasSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "AsaasCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AsaasTransfer" ADD CONSTRAINT "AsaasTransfer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgencyActivity" ADD CONSTRAINT "AgencyActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgencyActivity" ADD CONSTRAINT "AgencyActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "AgencyLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

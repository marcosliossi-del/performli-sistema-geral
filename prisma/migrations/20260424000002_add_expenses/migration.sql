CREATE TYPE "ExpenseCategory" AS ENUM ('SALARIOS', 'MARKETING', 'FERRAMENTAS', 'IMPOSTOS', 'CONTABILIDADE', 'ESCRITORIO', 'OUTROS');

CREATE TABLE IF NOT EXISTS "Expense" (
  "id"          TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category"    "ExpenseCategory" NOT NULL,
  "value"       DECIMAL(12,2) NOT NULL,
  "date"        DATE NOT NULL,
  "recurring"   BOOLEAN NOT NULL DEFAULT false,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Expense_date_idx" ON "Expense"("date");

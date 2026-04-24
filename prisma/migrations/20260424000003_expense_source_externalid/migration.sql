ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Expense_externalId_key" ON "Expense"("externalId") WHERE "externalId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Expense_source_idx" ON "Expense"("source");

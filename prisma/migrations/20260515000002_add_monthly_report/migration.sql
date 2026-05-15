CREATE TABLE IF NOT EXISTS "MonthlyReport" (
    "id"          TEXT NOT NULL,
    "clientId"    TEXT NOT NULL,
    "monthStart"  DATE NOT NULL,
    "content"     TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MonthlyReport_clientId_monthStart_key" ON "MonthlyReport"("clientId", "monthStart");
CREATE INDEX IF NOT EXISTS "MonthlyReport_clientId_monthStart_idx" ON "MonthlyReport"("clientId", "monthStart");

ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

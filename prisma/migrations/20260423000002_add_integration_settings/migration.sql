CREATE TABLE IF NOT EXISTS "IntegrationSetting" (
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationSetting_pkey" PRIMARY KEY ("key")
);

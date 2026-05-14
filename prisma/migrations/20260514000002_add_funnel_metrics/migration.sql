-- Add GA4 sales funnel metrics to MetricSnapshot
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "addToCarts" INTEGER;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "checkoutsStarted" INTEGER;

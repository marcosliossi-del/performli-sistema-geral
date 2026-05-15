-- Add Meta Ads metrics for Local Business clients
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "mensagens" INTEGER;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "landingPageViews" INTEGER;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "thruplays" INTEGER;
ALTER TABLE "MetricSnapshot" ADD COLUMN IF NOT EXISTS "videoViews3s" INTEGER;

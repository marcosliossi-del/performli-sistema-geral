-- Add trendPct to HealthScore: % change of the metric over last 7d vs prior 7d.
-- Used by the dual-signal health system (MTD pace + recent trend).
ALTER TABLE "HealthScore" ADD COLUMN "trendPct" DECIMAL(8,4);

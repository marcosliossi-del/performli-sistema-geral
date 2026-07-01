-- CreateTable: rate limiting (fixed-window). Aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key"         TEXT NOT NULL,
    "count"       INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimit_windowStart_idx" ON "RateLimit" ("windowStart");

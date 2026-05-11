CREATE TABLE "ClientStatusStreak" (
    "id"        TEXT NOT NULL,
    "clientId"  TEXT NOT NULL,
    "status"    "HealthStatus" NOT NULL,
    "since"     DATE NOT NULL,
    "days"      INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStatusStreak_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientStatusStreak_clientId_key" ON "ClientStatusStreak"("clientId");

ALTER TABLE "ClientStatusStreak" ADD CONSTRAINT "ClientStatusStreak_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

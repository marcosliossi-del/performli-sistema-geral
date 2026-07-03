-- ═══════════════════════════════════════════════════════════════════════════
-- Client.fechouSemanaEmRisco — marcador de reincidência da régua de feedback
-- negativo. Setado na zeragem de segunda (C.2) quando o cliente fechou a semana
-- com >= 1 feedback negativo; usado nos hooks de feedback para tratar o 1º sinal
-- da nova semana como escalação direta ("margem menor" automática — antes
-- dependia da memória da CS). Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "fechouSemanaEmRisco" BOOLEAN NOT NULL DEFAULT false;

-- ═══════════════════════════════════════════════════════════════════════════
-- RBAC v2 — NOVOS VALORES DE PAPEL (enum "Role") — Agente 1 (Domínio & Schema)
-- Matriz oficial: ADMIN, SUPERVISOR_TRAFEGO, ANALISTA_TRAFEGO, CS, GESTOR_TRAFEGO.
--
-- 100% ADITIVO. Os valores legados MANAGER e ANALYST PERMANECEM no enum como
-- legado até uma limpeza futura (ver DECISIONS.md D-011). A transição dos DADOS
-- dos usuários existentes (MANAGER→GESTOR_TRAFEGO, ANALYST→ANALISTA_TRAFEGO) é
-- feita na migration SEPARADA 20260702061000 (limitação Postgres: um valor de
-- enum recém-adicionado não pode ser usado na mesma transação em que foi criado).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR_TRAFEGO';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ANALISTA_TRAFEGO';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'GESTOR_TRAFEGO';

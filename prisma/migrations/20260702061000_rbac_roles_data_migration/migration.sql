-- ═══════════════════════════════════════════════════════════════════════════
-- RBAC v2 — TRANSIÇÃO DE DADOS DOS USUÁRIOS — Agente 1 (Domínio & Schema)
-- Reatribui os usuários reais dos papéis legados para os papéis da matriz nova.
-- Mapeamento decidido (DECISIONS.md D-011):
--   MANAGER  → GESTOR_TRAFEGO
--   ANALYST  → ANALISTA_TRAFEGO
-- ADMIN e CS permanecem inalterados. SUPERVISOR_TRAFEGO é papel novo (sem
-- migração de dados — atribuído manualmente/seed).
--
-- IDEMPOTENTE: o WHERE só afeta linhas ainda no valor legado; re-executar não
-- tem efeito. Separada da migration que adiciona os valores (20260702060000) por
-- exigência do Postgres (enum novo não usável na mesma transação da criação).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "User" SET "role" = 'GESTOR_TRAFEGO'   WHERE "role" = 'MANAGER';
UPDATE "User" SET "role" = 'ANALISTA_TRAFEGO' WHERE "role" = 'ANALYST';

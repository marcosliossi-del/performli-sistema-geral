# HANDOFF — Agente 1 (Domínio & Schema) → Agente 2

Projeto RBAC v2 do Performli. Fatia: **modelagem de dados / migrations aditivas**.
NÃO toquei em UI, API nem policy engine (escopo dos Agentes 2–4).

## Matriz de papéis alvo
ADMIN · SUPERVISOR_TRAFEGO · ANALISTA_TRAFEGO · CS · GESTOR_TRAFEGO

## O que foi feito

### 1. Enum de papéis (`Role`) — ADITIVO
> ⚠️ O enum no schema chama-se **`Role`** (não `UserRole`). Confirmado em
> `prisma/schema.prisma` e no banco (`pg_type.typname = 'Role'`).

- **Migration `20260702060000_rbac_roles_add_values`**: adiciona
  `SUPERVISOR_TRAFEGO`, `ANALISTA_TRAFEGO`, `GESTOR_TRAFEGO` via
  `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS`. Legados `MANAGER`/`ANALYST`
  **permanecem** (não removidos).
- **Migration `20260702061000_rbac_roles_data_migration`** (separada — exigência
  do Postgres: valor de enum novo não é usável na mesma transação da criação):
  `UPDATE "User"` remapeando `MANAGER→GESTOR_TRAFEGO` e `ANALYST→ANALISTA_TRAFEGO`.
  ADMIN e CS inalterados.
- `prisma/schema.prisma`: enum `Role` atualizado com os 3 valores novos +
  comentários `@deprecated` nos legados. Ordenação lógica (ADMIN, CS, legados,
  novos) — enums Postgres são aditivos por sortorder, sem impacto.

### 2. Models existentes reaproveitados (nada recriado)
- **`ClientAssignment`** já cobre posse `userId ↔ clientId` com
  `@@unique([clientId, userId])` + flag `isPrimary`. **Nada criado.** É a fonte
  de ownership para GESTOR/ANALISTA. (Campos de responsável por papel também
  existem direto em `Client`: `gestorId`, `csId`, `supervisorId`, `headId`,
  `crmId`.)
- **`AuditLog`** já existe, append-only, com `actorRole String?` (snapshot do
  papel no momento da ação), `action`, `entityType/Id`, `clientId`, `metadata`.
  **Nada criado.** Serve para a regra técnica #8 (log de mutação sensível).

### 3. Seed de teste
- `src/services/seed-rbac-test.ts` — função exportada `seedRbacTest()`, padrão
  dos seeds do repo (`upsert` por chave natural, bcrypt cost 12, senha aleatória
  forte via `randomBytes` ou env `SENHA_TESTE_RBAC`, nunca hardcoded).
  Cria/upserta 1 usuário por papel (`@teste.arkza.com.br`) e atribui 2 clientes
  ATIVOS ao GESTOR de teste via `ClientAssignment` (idempotente). Zero `any`.

## Validação executada (obrigatória)
- `service postgresql start` → OK (PG16).
- Replay **2×** de cada migration em `performli_test` com `-v ON_ERROR_STOP=1`:
  passe 1 aplica; passe 2 emite apenas `NOTICE ... already exists, skipping`
  (idempotente). Enum final: ADMIN, MANAGER, ANALYST, CS, SUPERVISOR_TRAFEGO,
  ANALISTA_TRAFEGO, GESTOR_TRAFEGO.
- Fixture: inserido MANAGER+ANALYST → data-migration remapeou para
  GESTOR_TRAFEGO/ANALISTA_TRAFEGO (UPDATE 1 cada). Removido após teste.
- `tail -3` + `od -c | tail -2` em ambos os SQL: terminam em `\n` único, sem lixo.

## Mapeamento de roles (decisão — ver DECISIONS.md D-011)
| Legado (v1) | Novo (v2)          | Como muda |
|-------------|--------------------|-----------|
| MANAGER     | GESTOR_TRAFEGO     | UPDATE de dados (migration b) |
| ANALYST     | ANALISTA_TRAFEGO   | UPDATE de dados (migration b) |
| ADMIN       | ADMIN              | inalterado |
| CS          | CS                 | inalterado |
| —           | SUPERVISOR_TRAFEGO | papel novo, sem dados legados (atribuído por seed/admin) |

Legados **continuam no enum** até limpeza futura (remoção de valor de enum é
destrutiva e não-aditiva → fica para migration própria quando 0 código referenciar).

## Pendências para o Agente 2 (API/DAL) e Agente 3 (varredura de código)
1. **Seed novo NÃO foi ligado a runner.** `seedRbacTest()` está exportada mas não
   é chamada por `prisma/seed.ts` nem por rota. Agente 2 decide onde plugar (ex.:
   rota admin-only de teste). Não plugei para não criar superfície sem auth.
2. **Compat de papéis no código (Agente 3 — varredura):** após a data-migration,
   NÃO existirão mais usuários `MANAGER`/`ANALYST` no banco, mas o CÓDIGO ainda
   compara com esses literais. Todos os pontos abaixo precisam passar a reconhecer
   os nomes novos (ou usar um mapa de compat). Lista de referências a
   `MANAGER`/`ANALYST` (grep `\b(MANAGER|ANALYST)\b`):

   Autorização / lógica (CRÍTICO — muda comportamento):
   - `src/lib/permissions.ts:65`
   - `src/lib/audit.ts:27` (`role === 'MANAGER'`)
   - `src/lib/dal.ts:1313, 1738, 2176, 2893, 3228` (filtros `role: { in: [...] }` e defaults)
   - `src/lib/tasks/panel.ts:276` (`role !== 'ANALYST'`)
   - `src/lib/home.ts:35-36`
   - `src/app/actions/fichaCs.ts:27`, `chat.ts:41`, `planoAcao.ts:26-27`,
     `operacional.ts:62`, `tasks.ts` (assertCan)
   - `src/app/(dashboard)/comercial/dashboard/page.tsx:41`,
     `comercial/page.tsx:47`, `clients/[slug]/page.tsx:182,185`
   - `src/app/(dashboard)/operacional/page.tsx:17`, `anti-churn/page.tsx:93`
   - `src/components/anti-churn/ProtocolCard.tsx:79`
   - `src/services/weekly-checklist-generator.ts:143`
   - `src/services/recurrence-engine.ts:24,110` (usa `'MANAGER'` no fan-out;
     nota: linha 24 já mistura GESTOR/MANAGER — o `defaultAssigneeRole` é
     OperationalRole, cuidado para não confundir com `Role`)
   - API routes: `asaas/sync/route.ts:11`, `comercial/leads/[id]/route.ts:27`,
     `clients/[clientId]/budget/route.ts:12`, `ai/clients/route.ts:15`,
     `ai/chat/route.ts:128`, `sync/health|meta|ga4|nuvemshop`

   Tipos / enums TS (precisam incluir os novos literais):
   - `src/lib/auth.ts:7` e `src/lib/session.ts:10` (union
     `'ADMIN' | 'MANAGER' | 'ANALYST' | 'CS'` — ampliar para os novos)
   - `src/components/layout/Sidebar.tsx:39,87,95,181` (type Role local + `viewMode`
     mapeia ADMIN→'MANAGER'; revisar)

   UI / labels (cosmético, mas atualizar p/ não mostrar papel fantasma):
   - `src/components/team/TeamMemberRow.tsx:9,12,13,118`,
     `InviteUserForm.tsx:70,74,76`, `layout/TopNav.tsx:22,23`,
     `recorrencias/page.tsx:72,73`, `team/page.tsx:14,35`,
     `managers/ManagersClient.tsx:106`, `ai-agents/AIAgentsClient.tsx:70,71`

   Seeds que ainda GRAVAM papéis legados (Agente 2 decide migrar):
   - `src/services/seed-operacao.ts:32-36` (grava `MANAGER`/`ANALYST`)
   - `prisma/seed.ts:64,70,76` e `src/app/api/seed/route.ts:32,38,44`
   > Enquanto esses seeds gravarem literais legados, a data-migration precisa ser
   > re-rodada OU os seeds atualizados. Recomendo Agente 2/3 atualizarem os seeds
   > para os nomes novos (mantém banco limpo sem depender de re-migração).

3. **`SUPERVISOR_TRAFEGO` é papel novo sem regras.** Agentes 2/3 definem a
   matriz de permissão dele (o design diz: supervisiona tráfego). Hoje nenhum
   código o reconhece.

## Arquivos criados/alterados
- `prisma/migrations/20260702060000_rbac_roles_add_values/migration.sql` (novo)
- `prisma/migrations/20260702061000_rbac_roles_data_migration/migration.sql` (novo)
- `prisma/schema.prisma` (enum `Role` — aditivo)
- `src/services/seed-rbac-test.ts` (novo)
- `docs/rbac/HANDOFF_AGENTE_1.md` (este arquivo)
- `DECISIONS.md` (D-011 appendada)

## Status
Fatia pronta para revisão do **guardiao**. NÃO commitei/pushei (instrução).

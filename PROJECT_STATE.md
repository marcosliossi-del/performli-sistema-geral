# PROJECT_STATE — Performli (estado do maestro)

> Log de orquestração. Mantido pelo `maestro`. Decisões técnicas = append-only.

**Última atualização:** 2026-06-30

---

## FASE_ATUAL
Fase 2 (build) — fatias mescladas no `main` (deploy de produção):
- #16 docs · #17 WAR-14 · #18 WAR-16 · #19 Cockpit · #20 FIN-19 · #21 CSX-13 — **MERGED**.
- Fatia #7 (OPE-06) — entregue ao guardião (branch feat/pop-ope-06, PR a abrir).
Fórmula de score confirmada pelo usuário: **0.30** (mantida). Agentes .md: não sincronizar.

## POPS_MAPEADOS (21 — ranking 0.30)
Top-8 MVP: WAR-14 (4.52) · WAR-16 (4.47) · FIN-19 (4.45) · CSX-13 (4.40) ·
OPE-06 (4.39) · CSX-12 (4.32) · CRM-18 (4.19) · ONB-05 (4.09). Detalhe em
`docs/mapa-pops.md`.

| POP | Status no sistema |
|---|---|
| WAR-14 | **EM PRODUÇÃO (merged #17)** |
| WAR-16 | **EM PRODUÇÃO (merged #18)** |
| Cockpit | **EM PRODUÇÃO (merged #19)** |
| FIN-19 | **EM PRODUÇÃO (merged #20)** |
| CSX-13 | **EM PRODUÇÃO (merged #21)** |
| OPE-06 | **EM PRODUÇÃO (merged #22)** |
| /processos | **EM REVISÃO (catálogo vivo dos 21 POPs, branch feat/processos)** |
| demais 15 | mapeados, aguardando fatia |

## MODELS NOVOS (cumulativo)
- `AuditLog` (WAR-14) · `WarRoomOutcome` enum (WAR-14)
- `ClientWeeklyCheckin` + `CheckinStatus` enum (OPE-06) — check-in por cliente
  com workflow de validação da CS. Justificativa: `WeeklyChecklist` é por-gestor.

## LACUNAS_IDENTIFICADAS
`docs/mapa-lacunas.md`. 1 JÁ_EXISTE · 15 PARCIAL · 5 INEXISTENTE.
Gap dominante: camada operacional de visibilidade/validação/escalação.

## MODELS_APROVADOS (novos)
- `AuditLog` — criado (fatia WAR-14). Transversal, append-only.
- `WarRoomOutcome` (enum) — criado (fatia WAR-14).
- `CriticalProtocol` — estendido (aditivo): diagnosis, exitCriteria, exitMetric,
  exitTarget, exitMetAt, responsibleId, deadline, escalatedAt, closedOutcome.
- `WarRoomDecision` — PROPOSTO (Fase 2, WAR-15). Não criado.
- Rejeitados/adiados: ver `docs/proposta-schema.md`.

## TELAS_APROVADAS
Especificadas em `docs/proposta-telas.md`: `/cockpit`, `/processos`,
`/clientes/[slug]` (ampliação). Implementado nesta fatia: ampliação de `/anti-churn`
com `WarRoomPlanPanel`.

## DECISOES_TECNICAS (append-only)
- 2026-06-30 — Score 0.30 (saída do operacional) como critério de priorização.
- 2026-06-30 — Fatia #1 = WAR-14 (maior score, model-base já existe, baixo risco).
- 2026-06-30 — Extensão de `CriticalProtocol` em vez de novo `WarRoomExitCriteria`
  (critério único cabe em campos aditivos; evita duplicação).
- 2026-06-30 — `AuditLog` criado como model transversal (exigência CLAUDE.md #8).
- 2026-06-30 — `/processos` será catálogo estático (`pops-catalog.ts`), não model.
- 2026-06-30 — Escalação de 3 semanas implementada já na fatia WAR-14 (fecha o
  caminho crítico do POP), com idempotência via `escalatedAt`.

## BLOQUEIOS_ATIVOS
- **Build não verificável localmente** (node_modules vazio, registry npm 403).
  Gate obrigatório: Vercel CI verde antes de qualquer merge.
- Pré-existente: `src/app/actions/protocols.ts` valida só auth (sem posse).
  Recomendada fatia de correção de segurança.

## CENTRAL OPERACIONAL (nova direção — prompt em 7 blocos)
- Decisões do usuário: check-in migra para Task (A); enums Task substituídos+backfill; execução contínua.
- **BLOCO 1** (fundação) — branch feat/bloco1-central-operacional: Task estendido +
  24 models (hierarquia Área→POP→Lista→Tarefa, templates, recorrência, automação,
  campos personalizados, atividade, dependências, aprovação) + enums novos +
  troca TaskStatus/TaskPriority (backfill) + seed 7 áreas/21 POPs + TaskActivity nas actions.
- Próximos: BLOCO 2 (UI Central), 3 (templates+recorrência+cron), 4 (integração), 5 (POPs), 6 (automações), 7 (IA+KPIs).

- **BLOCO 1** — MERGED (#24, em produção). Migration aplicada (enum swap + 24 models + seed). Build com retry de migrate (cold-start Neon).
- **BLOCO 2** (Central de Tarefas / UI) — branch feat/bloco2-central-tarefas: página /operacional (KPIs + 4 views Lista/Kanban/Responsável/Cliente + filtros), NovaTarefaModal (autofill do cliente, área/POP, checklist), TaskDrawer (status/checklist/comentários/atividade). DAL getOperacionalBoard + getNovaTarefaContext; actions createOperacionalTask/addTaskComment/toggleChecklistItem/loadTaskDetail.

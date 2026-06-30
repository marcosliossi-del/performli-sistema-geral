# PROJECT_STATE — Performli (estado do maestro)

> Log de orquestração. Mantido pelo `maestro`. Decisões técnicas = append-only.

**Última atualização:** 2026-06-30

---

## FASE_ATUAL
Fase 2 (build) — fatia vertical #1 (WAR-14) entregue ao guardião: **APROVADO_COM_RESSALVAS**
(pendente confirmação de build no Vercel CI antes do merge).

## POPS_MAPEADOS (21 — ranking 0.30)
Top-8 MVP: WAR-14 (4.52) · WAR-16 (4.47) · FIN-19 (4.45) · CSX-13 (4.40) ·
OPE-06 (4.39) · CSX-12 (4.32) · CRM-18 (4.19) · ONB-05 (4.09). Detalhe em
`docs/mapa-pops.md`.

| POP | Status no sistema |
|---|---|
| WAR-14 | **EM REVISÃO (PR aberto, branch feat/pop-war-14)** |
| demais 20 | mapeados, aguardando fatia |

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

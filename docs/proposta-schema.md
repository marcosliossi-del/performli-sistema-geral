# Proposta de Schema Prisma — Performli

**Data:** 2026-06-30
**Versão:** 1.0
**Agente:** arquiteto-dados
**Base:** `docs/mapa-lacunas.md` · 29 models existentes (CLAUDE.md)

> **Read-only:** este documento PROPÕE. Não edita `schema.prisma`. A implementação
> da fatia é responsabilidade do `backend-dal`, que cria a migration aditiva.
> Regra-mestra: **migrations aditivas, sem quebra de produção**.

---

## Princípio aplicado

Confirmado contra o schema real: convenção de migration é
`prisma/migrations/AAAAMMDDHHMMSS_nome/migration.sql`, aplicada por
`prisma migrate deploy` no passo de `build`. Toda proposta abaixo é **aditiva**
(novas colunas nullable / com default, novos models, novos enums) — zero `DROP`,
zero `NOT NULL` sem default, zero rename. Produção não quebra.

---

## Fatia #1 (WAR-14) — schema necessário AGORA

### A. Estender `CriticalProtocol` (ADITIVO)

```json
{
  "model": "CriticalProtocol (ALTER)",
  "justificativa_nao_duplicacao": "Model já existe (schema:323) e já é populado por critical-account-detector.ts. WAR-14 pede critério de saída, responsável e prazo — todos AUSENTES. Criar model novo (WarRoomExitCriteria) duplicaria a entidade War Room. Solução: adicionar campos aditivos.",
  "campos_novos": [
    {"nome":"exitCriteria","tipo":"String? @db.Text","obrigatorio":false,"comentario":"Critério de saída em linguagem operacional. Dossiê: 'nenhuma War Room sem critério de saída'. Nullable na coluna, mas obrigatório na regra de negócio (action recusa fechar/ativar sem ele)."},
    {"nome":"exitMetric","tipo":"MetricType?","obrigatorio":false,"comentario":"Métrica mensurável do critério (ex.: ROAS). Reusa enum MetricType existente."},
    {"nome":"exitTarget","tipo":"Decimal? @db.Decimal(12,2)","obrigatorio":false,"comentario":"Valor-alvo do critério (ex.: 1.5)."},
    {"nome":"exitMetAt","tipo":"DateTime?","obrigatorio":false,"comentario":"Quando o critério foi atingido (preenchido pelo monitoramento — WAR-16)."},
    {"nome":"responsibleId","tipo":"String?","obrigatorio":false,"comentario":"Responsável pela War Room (User). FK aditiva."},
    {"nome":"deadline","tipo":"DateTime?","obrigatorio":false,"comentario":"Prazo da War Room."},
    {"nome":"diagnosis","tipo":"String? @db.Text","obrigatorio":false,"comentario":"Diagnóstico estruturado do gestor (hipótese de causa)."},
    {"nome":"escalatedAt","tipo":"DateTime?","obrigatorio":false,"comentario":"Marca quando foi escalado para Marcos (3 semanas em crítico). Idempotência da escalação (WAR-16)."},
    {"nome":"closedOutcome","tipo":"WarRoomOutcome?","obrigatorio":false,"comentario":"Resultado do encerramento (positivo/neutro/negativo)."}
  ],
  "relacoes_novas": [
    {"com":"User (responsibleId)","tipo":"N:1","onDelete":"SetNull","comentario":"Responsável pode ser desativado sem apagar histórico do protocolo."}
  ],
  "indices_novos": ["@@index([responsibleId])","@@index([escalatedAt])"],
  "enums_necessarios": ["WarRoomOutcome { RESOLVIDO_POSITIVO  ENCERRADO_NEUTRO  PERDIDO_CHURN }"],
  "migration_segura": "aditiva"
}
```

**Nota de compatibilidade:** `MetricType` e `User` já existem; a FK `responsibleId`
é nullable com `onDelete: SetNull`, então não exige backfill nem trava deleção de
usuários. O detector atual (`fireProtocol`) continua criando protocolos só com
`clientId` + `trigger` — os novos campos ficam nulos até o gestor preencher o
diagnóstico/critério, exatamente como o fluxo do dossiê prevê (protocolo abre →
diagnóstico depois).

### B. Criar `AuditLog` (NOVO — transversal, exigido pelo CLAUDE.md)

```json
{
  "model": "AuditLog",
  "justificativa_nao_duplicacao": "CLAUDE.md regra técnica #8 exige AuditLog para toda mutação sensível. NÃO existe no schema (confirmado na auditoria). Alert é notificação com read/sentAt (efêmera, voltada ao operador). Operation é trabalho operacional por cliente. SyncLog é específico de integrações. Nenhum é trilha imutável de auditoria de mutação de sistema.",
  "campos": [
    {"nome":"id","tipo":"String @id @default(cuid())","obrigatorio":true},
    {"nome":"actorId","tipo":"String?","obrigatorio":false,"comentario":"User que executou (nullable: ações de cron/sistema)."},
    {"nome":"actorRole","tipo":"String?","obrigatorio":false,"comentario":"Papel no momento da ação (snapshot, não FK — papel pode mudar)."},
    {"nome":"action","tipo":"String","obrigatorio":true,"comentario":"Ex.: 'warroom.open', 'warroom.set_exit_criteria', 'warroom.close'."},
    {"nome":"entityType","tipo":"String","obrigatorio":true,"comentario":"Ex.: 'CriticalProtocol'."},
    {"nome":"entityId","tipo":"String","obrigatorio":true},
    {"nome":"clientId","tipo":"String?","obrigatorio":false,"comentario":"Cliente afetado, quando aplicável (facilita filtro)."},
    {"nome":"metadata","tipo":"Json?","obrigatorio":false,"comentario":"Antes/depois ou payload resumido. Append-only."},
    {"nome":"createdAt","tipo":"DateTime @default(now())","obrigatorio":true}
  ],
  "relacoes": [
    {"com":"User (actorId)","tipo":"N:1","onDelete":"SetNull"},
    {"com":"Client (clientId)","tipo":"N:1","onDelete":"SetNull"}
  ],
  "indices": ["@@index([entityType, entityId])","@@index([clientId, createdAt])","@@index([actorId, createdAt])","@@index([action, createdAt])"],
  "enums_necessarios": [],
  "migration_segura": "aditiva"
}
```

**Append-only:** sem `updatedAt`, sem update/delete na aplicação. É a base de
evidência (CLAUDE.md: "nenhuma tarefa concluída sem evidência mínima").

---

## Fases 2+ — PROPOSTO, não criar nesta fatia

### C. `WarRoomDecision` (Fase 2 · WAR-15)
```json
{
  "model": "WarRoomDecision",
  "justificativa_nao_duplicacao": "WAR-15 exige decisão de War Room → tarefa(s) rastreável vinculada ao protocolo, com pauta/ata append-only. Nenhum model liga decisão↔protocolo↔Task. CriticalProtocol.notes é texto solto (proibido pelo dossiê).",
  "campos": [
    {"nome":"protocolId","tipo":"String","obrigatorio":true},
    {"nome":"decision","tipo":"String @db.Text","obrigatorio":true},
    {"nome":"taskId","tipo":"String?","obrigatorio":false,"comentario":"Task gerada a partir da decisão (reusa Task existente)."},
    {"nome":"responsibleId","tipo":"String","obrigatorio":true},
    {"nome":"createdAt","tipo":"DateTime @default(now())","obrigatorio":true}
  ],
  "relacoes": [
    {"com":"CriticalProtocol","tipo":"N:1","onDelete":"Cascade"},
    {"com":"Task","tipo":"N:1","onDelete":"SetNull"}
  ],
  "migration_segura": "aditiva"
}
```

### D. Onboarding (ONB-04/05) — **decisão: SEM model novo na Fase 2 inicial**
Reaproveitar com campos aditivos em `Client` (`kickoffAt`, `day30ReviewAt`,
`onboardingStartedAt`) + `Task` recorrentes + `WeeklyChecklist`. Só criar
`OnboardingChecklist` se a regra de itens obrigatórios por cliente provar que o
Json de `WeeklyChecklist` (que é por gestor) não modela. **Recomendação: adiar o
model, começar pelos campos aditivos.**

### E. `/processos` (catálogo vivo) — **decisão: catálogo ESTÁTICO, sem model**
Os 21 POPs são conjunto fixo. Propor `src/lib/pops-catalog.ts` (constante tipada:
código, nome, área, responsável padrão, frequência, SLA, risco) + status de
implementação derivado em tempo de leitura de: existência da rotina, `lastRunAt`
do `SyncLog`/cron, contagem de alertas. **Não criar `OperationalProcess` model**
até haver edição de POP pelo usuário (não há esse requisito hoje).

### F. `lastRunAt` do cron — **decisão: reusar `SyncLog`**
A auditoria apontou que o cron diário não persiste `lastRunAt`. Em vez de model
novo, gravar uma linha em `SyncLog` por job do cron (já tem `status`, timestamps).
Backend-dal/cron-automacao implementam quando a fatia de cron entrar.

---

## Plano de migration (por etapa)

| Etapa | Migration | Conteúdo | Risco |
|---|---|---|---|
| 1 (esta fatia) | `..._warroom_and_auditlog` | ALTER CriticalProtocol (+9 colunas nullable, +1 enum, +1 FK SetNull, +2 índices); CREATE AuditLog (+4 índices) | **Baixo — 100% aditivo** |
| 2 (WAR-15) | `..._warroom_decision` | CREATE WarRoomDecision | Baixo |
| 3 (ONB) | `..._client_onboarding_fields` | ALTER Client (+3 colunas nullable) | Baixo |

**Verificação obrigatória antes do deploy (guardião):** `prisma generate` +
`prisma migrate deploy` em ambiente de teste, depois `next build`. Como o build de
produção roda `prisma migrate deploy`, a migration precisa estar correta no PR.

---

## Critério de aceite (arquiteto-dados)
- [x] Diff 100% aditivo (sem DROP/rename/NOT-NULL-sem-default).
- [x] Justificativa de não-duplicação por model novo (`AuditLog`, `WarRoomDecision`).
- [x] Models de processo suportam histórico append-only (`AuditLog`, `WarRoomDecision`).
- [x] `AuditLog` transversal definido (regra CLAUDE.md #8).
- [x] Plano de migration por etapa, sem downtime.

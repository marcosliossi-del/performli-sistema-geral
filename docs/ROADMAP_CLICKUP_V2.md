Confirmado. Client não tem gestorId/csId/supervisorId/headId, nem os campos de meta/saúde/financeiro V2 (só resultado, etapa, nps, relacionamento, curva, feedbackNegativo). Não há externalId. recurrence-engine não marca ATRASADO nem materializa 4 semanas (só gera "hoje" via shouldRunToday). Confirmações suficientes para o backlog.

# Backlog Arquitetural — Recriação Operacional do ClickUp + Camada de Inteligência (Performli)

Documento produzido a partir do mapa de gaps, dos dois prompts (Migração fiel + V2 Inteligência) e de verificação direta do `schema.prisma` e `src/services`. Read-only: nada foi editado.

---

## 1. O QUE JÁ EXISTE (não refazer)

Verificado no código. Estes itens estão prontos ou quase-prontos e **não entram como trabalho**:

**Estrutura e modelos**
- `Task` com FKs completas (`listId`, `clientId`, `areaId`, `popId`, `templateId`, `recurrenceId`) + subtarefas, watchers, aux-assignees, approvals — `schema.prisma:658`.
- `TaskTemplate` + `TaskRecurrenceRule` + `POPProcess`/`POPStep` + `TaskArea`/`TaskList` (hierarquia de 1 nível) — presentes.
- `ClientAssignment` (elo cliente↔usuário, `isPrimary`) — `schema.prisma:187`.
- `TaskChecklistItem`, `TaskComment` (com flag `internal`), `TaskAttachment`, `TaskActivity`, `TaskApproval` — todos presentes.
- `AuditLog` (append-only, com `metadata` JSON) — `schema.prisma:422`. Existe, porém subutilizado.
- Campos de cliente que **já existem**: `resultado` (ClientResultado), `etapa` (ClientEtapa), `relacionamento`, `nps`, `curva`, `feedbackNegativo` (Int). Enums correspondentes prontos.

**Motor e automações**
- Motor de recorrência com **fan-out por cliente** e **idempotência** (`idempotencyKey` = template+cliente+janela) — `recurrence-engine.ts`. A herança de nome/descrição/prioridade/prioridade a partir do template já funciona.
- Cron de recorrências (`/api/cron/recurrences`) com auth e `AutomationLog`.
- **Automação Status Financeiro** (vencimento→atrasado, cliente sem cobrança) — `inadimplencia-checker.ts` + `asaas/sync.ts`. Completa.
- **Automação Resultado→Etapa** — `resultado-engine.ts` + `/api/cron/resultados` (classifica ROAS→resultado→etapa, cria tarefa de otimização idempotente).
- Detecção de risco/churn: `churn-scorer.ts` (ChurnRiskScore), `critical-account-detector.ts` (cria `CriticalProtocol`), `health-scorer.ts` (HealthScore), `antichurn-monitor.ts`, `warroom-monitor.ts`, `warroom-escalation.ts` (escala 3 semanas→Marcos), `checkin-monitor.ts`.
- Fluxo de check-in com workflow PENDENTE→PREENCHIDO→APROVADO/REPROVADO — `actions/checkin.ts` + `ClientWeeklyCheckin`.

**Telas existentes** (confirmar cobertura, não recriar): dashboard, clients/[slug] (rica: contrato, KPIs, ficha CS, checkin, health history), tasks, operacional, comercial (Kanban de leads + `AgencyLead`), financeiro, processos (catálogo dos 21 POPs), anti-churn, check-ins, alerts.

**Correções ao mapa de gaps (evitam trabalho duplicado ou omitido):**
- ⚠️ O cluster `telas-comercial` afirma que Task já tem `requires_evidence/requires_review/reviewer_id/quality_score/blocker_reason` "estrutura pronta". **Falso.** Verifiquei `schema.prisma:658-730`: Task só tem `evidence`, `blockReason`, `delayReason`, `tags`. Os campos V2 **não existem**. Vale a versão FALTA (cluster quality-guard-sop).
- ⚠️ `task-escalation.ts` **não marca ATRASADO**, **não notifica supervisor nem CS**: apenas adiciona tag "escalado" e sobe prioridade após 2 dias. O escalonamento em cascata é trabalho novo.
- ⚠️ `recurrence-engine` **não materializa 4 semanas** — gera apenas o dia corrente via `shouldRunToday`. A materialização de janela e o job "marcar ATRASADO" são trabalho novo.

---

## 2. BACKLOG POR FASES (cada fase = 1 PR coeso; ordem por dependência)

Esforço: **P** ≤0,5 dia · **M** 1-2 dias · **G** 3-5 dias. Risco = chance de quebrar produção/regressão.

### FASE 0 — Fundação do schema estrutural (schema → migration aditiva)
**PR: "Estrutura org ClickUp + rastreabilidade + papel operacional"**
Base de tudo. Migração puramente aditiva.
- `enum OperationalRole { HEAD, SUPERVISOR, GESTOR, CRM, CS, ACOMPANHAMENTO }` — separado do RBAC `Role` (regra CLAUDE.md). **P**
- `User`: + `externalId String? @unique`, + `operationalRole OperationalRole?`. **P**
- Novos models `Space` (externalId, nome, cor, descrição) e `Folder` (externalId, nome, spaceId). **M**
- `TaskList`: + `externalId`, + `folderId?`, + `clientId?`. **M**
- `TaskArea` → decidir: manter como está e introduzir Space/Folder ao lado (recomendado, aditivo) em vez de refatorar. **M**
- `Client`: + `externalId String? @unique`. **P**

Esforço total: **M-G** · Risco: **MÉDIO** (só se a refatoração TaskArea for agressiva; manter aditivo derruba para BAIXO).

### FASE 1 — Campos de Cliente (fonte única da verdade)
**PR: "Client como ficha completa — responsáveis, metas, saúde, financeiro"**
Depende de FASE 0 (OperationalRole, User).
- Responsáveis diretos: `gestorId`, `csId`, `supervisorId`, `headId`, `crmId` (FKs User). Isto é o que **destrava o roteamento por papel** — hoje impossível. **M**
- Enums novos: `ClientEngajamento`, `ClientHealthStatus (SAUDAVEL/ATENCAO/CRITICO/POSSIVEL_CHURN/WAR_ROOM/ARQUIVADO)`. **P**
- Campos: `engajamento`, `possivelChurn Bool`, `salaDeGuerra Bool`, `healthStatus`, `plataformas String[]`, `produtos String[]`, metas (`roasMinimo`, `cpaMaximo`, `investimentoMeta/Google/Tiktok`, `faturamentoEsperado`), `dashboardLooker`, `painelEcommerce`, `billingDueDay`, `feeAmount`, `contractEndDate`, `whatsapp`. **M**
- Expandir `BusinessType` com `B2B` (aditivo ao enum). **P**

Esforço: **M** · Risco: **BAIXO** (tudo nullable/aditivo). Decisão de arquitetura registrar: `feeAmount`/`contractEndDate` são **cache desnormalizado** de `Contract` — atualizado por trigger/agente, Contract continua fonte.

### FASE 2 — Seeds de dados reais (fidelidade — prioridade do cluster)
**PR: "Seed fiel Arkza: espaços, time, clientes, campos"**
Depende de FASE 0+1. Idempotente por upsert (externalId/slug).
- **7 Espaços** + pastas + listas (seção 4 do prompt 1) com externalId/cor. **M**
- **6 usuários reais** com externalId ClickUp e operationalRole: Marcos=HEAD, Leandro=SUPERVISOR, Pablo=GESTOR, Kyn=CRM, Letícia=CS, Red=ACOMPANHAMENTO. **P**
- **29-30 clientes** como Client + List no espaço de recorrentes; Lavinny Store 100% conforme gabarito; demais com `precisaCompletarCadastro` onde dado ausente (regra "não inventar"). **M**
- Campos customizados de cliente (dropdowns/cores) — decidir se viram enums nativos (já parcialmente são) ou tabela `CustomField`/`CustomFieldValue`. Recomendo mapear aos campos nativos da FASE 1 e **não** criar tabela genérica de custom fields (menos genérico, mais operacional — diretriz CLAUDE.md). **M**

Esforço: **G** · Risco: **MÉDIO** (o gabarito Lavinny e a lista de 29 são critério de aceite; erro aqui é visível). Alta prioridade estratégica.

### FASE 3 — Templates e recorrências reais + data-âncora
**PR: "15 tarefas recorrentes por cliente + rotinas de time + rituais"**
Depende de FASE 2.
- `TaskRecurrenceRule`: + `anchorDate DateTime?` e validação que **QUINZENAL exige anchorDate** (prompt 1 §10/§11). + suporte a 2x/semana (auditoria seg+qui): criar 2 rules OU `dayOfWeek Int[]`. **M**
- Frequências novas no enum se faltarem: QUINZENAL, TRIMESTRAL, POR_OCORRENCIA, DISPARADA_POR_AUTOMACAO. **P**
- Seed dos **15 TaskTemplate** (com SOPs nas descrições das 2 detalhadas + steps obrigatórios como `TaskChecklistItem` template). **M**
- Seed das **rotinas internas** (Head/Supervisor/CS/Gestores — seção 9) e dos **11 rituais** (seção 10) com participantes. **M**

Esforço: **G** · Risco: **MÉDIO** (data-âncora quinzenal é critério de aceite explícito).

### FASE 4 — Motor de recorrência: roteamento por papel + materialização + atraso
**PR: "Recorrência inteligente: resolve papel→usuário, materializa 4 semanas, marca atraso"**
Depende de FASE 1 (responsáveis) e FASE 3 (rules).
- Estender `recurrence-engine` para resolver `defaultAssigneeRole` (CS/CRM/GESTOR/HEAD/SUPERVISOR) → usuário via `Client.csId/gestorId/...`. Hoje só trata MANAGER→primário. **M**
- Materializar próximas 4 semanas (não só hoje). **M**
- Job diário `markOverdueTasks`: `dueDate < now AND status ∉ {CONCLUIDO,CANCELADO}` → `ATRASADO`, antes do escalonamento. **P**

Esforço: **M-G** · Risco: **MÉDIO**.

### FASE 5 — Extensão de Task para qualidade + SOP viva + Completion Guard
**PR: "Bloqueio de qualidade: campos de Task, SOP viva, TaskCompletionGuard"**
Depende de FASE 3.
- `Task`: + `sourcePopCode`, `reviewerId`, `requiresEvidence`, `requiresReview`, `qualityScore Int?`, `riskScore Int?`, `completionNotes`, `isGeneratedByAgent`, `generatedByAgentName`. (`blockReason` já existe.) **M**
- Model `TaskEvidence` (type/url/text/uploadedBy) — unifica evidência (hoje espalhada em `evidence`/attachment/comment). **P**
- Model/expansão `SOP` viva: `checklistTemplate` JSON, `qualityCriteria` JSON, `escalationRules` JSON, `onLateAction`, `onLowQualityAction` — decidir estender `POPProcess` (aditivo, recomendado) vs. model novo. **M**
- Serviço `TaskCompletionGuard` — bloqueia CONCLUIDO sem checklist/evidência/notas/review; grava `blockReason`. Ligado nas server actions de conclusão (`actions/tasks.ts`). **M**

Esforço: **G** · Risco: **MÉDIO-ALTO** (o Guard toca no fluxo de conclusão existente — regressão possível; blindar por flags `requires*`).

### FASE 6 — Observabilidade de agentes + AuditLog universal
**PR: "AgentRun + AuditLog em todas as mutações"**
Base para telas de agentes e para os agentes de inteligência.
- Model `AgentRun` (agentName, action, input/output JSON, status, errors, started/finishedAt). **M**
- Helper `writeAuditLog` aplicado a mutações críticas de Client/Contract/CriticalProtocol/recorrências (hoje só inadimplência). **M**

Esforço: **M** · Risco: **BAIXO**.

### FASE 7 — Agentes de inteligência (7)
**PR (fatiar 1 agente por PR):** depende de FASE 4-6.
- `ClientHealthAgent` — consolida os 4 serviços existentes e persiste `Client.healthStatus`. **G** / risco ALTO (unifica lógica dispersa; risco de regressão em health/churn atuais).
- `ResponsibilityRouterAgent` — propaga troca de gestor/CS para próximas tarefas. **M**.
- `OperationalQualityAgent` — atribui qualityScore, dispara `onLowQualityAction`. **G**.
- `WarRoomAgent` — expande warroom-monitor: gera diagnóstico/pauta, decisões→tarefas, saída só com melhora real. **G**.
- `CSAntiChurnAgent` — orquestra zeragem seg 9h / varredura sex 16h / pulso qui / NPS trim + gatilho 2 feedbacks. **M**.
- `ClientOnboardingAgent` — ao criar cliente cria operação inteira (15 recorrentes, K.O, fatura, kick-off). **G** / risco ALTO.
- `ClientOffboardingAgent` — suspende recorrências, arquiva mantendo histórico, coleta motivo. **M**.

Esforço agregado: **XG** · Risco: **ALTO**. Cada agente registra em `AgentRun` + `AuditLog` e tem try/catch por cliente (regra 7 CLAUDE.md).

### FASE 8 — Automação de feedback negativo (motor de churn manual→auto)
**PR: "Motor de feedback negativo: NPS→1, 1→2 escalação Head, zeragem seg 9h"**
Depende de FASE 1 (headId) e FASE 7 (CSAntiChurn).
- Gatilho NPS=Ruim → feedbackNegativo=1; 1→2 → cria Task escalação para Head; cron seg 9h zera registrando quem fechou em risco. **M** · Risco: **MÉDIO** (backfill deve ser comando manual separado — prompt 1 §12).

### FASE 9 — Escalonamento em cascata de tarefas atrasadas
**PR: "Escalonamento 4 níveis + reincidência"**
Depende de FASE 4 (markOverdue) e FASE 6.
- responsável → supervisor (após X horas) → CS (se clientId≠null) → alerta de reincidência 2x/semana por responsável. AlertTypes novos. **M** · Risco: **MÉDIO**.

### FASE 10 — Permissões por 8 perfis operacionais
**PR: "RBAC + papel operacional: scoping de dados por perfil"**
Depende de FASE 1.
- Camada de autorização por `operationalRole` (Head vê tudo; Supervisor carteira+gestores; Gestor só seus clientes; CS risco; CRM só produto CRM; Financeiro financeiro; Viewer read-only). Refatora `dal.ts` (`canViewAll`) e middleware. **G** · Risco: **ALTO** (toca autorização — regra inegociável CLAUDE.md; qualquer bug vira bypass). Não misturar com RBAC existente ADMIN/MANAGER/ANALYST/CS.

### FASE 11 — Telas novas
**PRs independentes (1 tela por PR):** dependem das fases de dados correspondentes.
- Tela de Recorrências (editar/pausar/próximas execuções/clientes impactados) — **M**.
- Tela de SOPs (30 POPs editáveis, checklist template, taxa execução) — **G**, depende FASE 5.
- Tela de Agentes (AgentRun: última/próxima execução, erros) — **M**, depende FASE 6-7.
- Ajustes nas telas existentes (Dashboard: carga por responsável, qualidade média; Cliente: War Room card, healthStatus, próximas recorrências; Tarefas: UI de checklist/evidência/revisão) — **M** cada.

Risco geral: **BAIXO-MÉDIO** (UI).

### FASE 12 — Módulo comercial + comissão
**PR: "Lead FECHADO dispara onboarding + comissão"**
Depende de FASE 7 (OnboardingAgent).
- Trigger `AgencyLead.status=FECHADO` → converte em Client + dispara ClientOnboardingAgent. Campos de comissão (10% 1ª + 3% recorrente) em Contract. **M-G** · Risco: **MÉDIO**.

---

## 3. RECOMENDAÇÃO — POR ONDE COMEÇAR

**Comece pelo caminho crítico de dados, nesta ordem estrita: FASE 0 → FASE 1 → FASE 2 → FASE 3.**

Justificativa:
1. **FASE 1 (responsáveis por papel no Client) é o desbloqueador de maior alavancagem.** Hoje é literalmente impossível saber "quem é o CS deste cliente" — só existe `ClientAssignment.userId` genérico com `isPrimary`, sem discriminação de papel. Sem `gestorId/csId/supervisorId/headId`, **nada** de roteamento (FASE 4), escalonamento (FASE 9), War Room, onboarding ou feedback→Head funciona. É esforço **M** e risco **BAIXO** (aditivo) com retorno enorme.
2. **A prioridade declarada do cluster é fidelidade dos dados reais** (times/clientes/templates). Isso é FASE 2 + FASE 3, e ambas dependem de FASE 0 (externalId, Space/Folder, OperationalRole). Entregar os 6 usuários reais, 29 clientes e 15 templates fiéis dá valor imediato e visível ao Marcos e satisfaz os critérios de aceite do prompt 1.
3. FASE 0-3 são **aditivas e de baixo risco** — não tocam autorização nem o fluxo de conclusão de tarefas. Constroem a base sobre a qual as capacidades de inteligência (que faltam de verdade) podem ser montadas sem retrabalho de schema.

**Sequência sugerida das primeiras 4 semanas de PRs:** FASE 0 (fundação) → FASE 1 (Client ficha) → FASE 2 (seed fiel) → FASE 3 (templates+recorrências+data-âncora). Só então partir para inteligência, começando por **FASE 4 (roteamento por papel)** + **FASE 5 (Completion Guard)**, que são as duas capacidades que mais diferenciam o Performli do ClickUp ("difícil de burlar" + "responsável vivo").

**Deixar por último / maior cautela:** FASE 10 (permissões — risco de bypass, regra inegociável) e os agentes pesados da FASE 7 (`ClientHealthAgent`, `OperationalQualityAgent`, `ClientOnboardingAgent`) que consolidam lógica dispersa e têm alto risco de regressão sobre health/churn já em produção.

**Arquivos-âncora para os primeiros PRs:** `prisma/schema.prisma` (models `Client:114`, `User:18`, `ClientAssignment:187`, `TaskRecurrenceRule:881`), `prisma/seed.ts`, `src/services/recurrence-engine.ts`, `src/lib/dal.ts`.
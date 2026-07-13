# Módulo "Conversas" (CRM Conversacional) — FASE 0: Discovery

> Entregável da Fase 0 do master prompt. Reconhecimento read-only feito por 3
> agentes (integrações/fila, tenancy/RBAC/models, design system), consolidado e
> verificado contra o código real (commit base: main de 2026-07-13).
> **Nenhum código de feature foi escrito.** Este documento PARA aqui e aguarda
> aprovação do Marcos antes da Fase 1.

---

## 1. CONVENÇÕES REAIS DO PERFORMLI (o que o prompt assume vs. o que existe)

| O prompt assume | O que existe de verdade | Tradução |
|---|---|---|
| `tenant_id` em toda tabela | Tenant = **`Client`**; isolamento por coluna **`clientId`** + `@relation(onDelete: Cascade)` + `@@index([clientId, ...])` (padrão de MetricSnapshot, Goal, etc.) | Toda tabela nova de Conversas nasce com `clientId` |
| 5 papéis: Admin, Supervisor, Gestor, CS, **CRM/Automação** | 5 papéis reais (`Role5`): `ADMIN`, `SUPERVISOR_TRAFEGO`, `ANALISTA_TRAFEGO`, `CS`, `GESTOR_TRAFEGO`. **Não existe papel "CRM/Automação" no RBAC** — existe `OperationalRole.CRM`, mas ele é de roteamento e **não governa autorização** (confirmado: o policy engine ignora) | Mapear "CRM/Automação"→`ANALISTA_TRAFEGO` ou `CS` (decisão abaixo), sem criar papel novo no enum |
| Fila de background jobs (pg-boss) | **Não existe fila.** Vercel serverless, sem worker persistente, sem Redis. Async atual = 4 crons **diários/semanais** drenando o banco. Webhook Z-API atual processa **inline** no POST | Ver risco R1 — decisão de arquitetura |
| `credentials (encrypted)` no Channel | **Não existe utilitário de criptografia** no repo. `IntegrationSetting`/`PlatformAccount.accessToken` são texto plano | Criar `src/lib/crypto.ts` (AES-256-GCM, chave em env) — greenfield |
| WhatsApp = Cloud API | O WhatsApp atual é **Z-API + Evolution (Baileys), NÃO-oficiais**. Zero código toca `graph.facebook.com/messages`, WABA, templates, janela 24h ou CTWA | Novo conector Cloud API do zero, **sem tocar** no webhook Z-API atual (rotas independentes) |
| Registrar KPIs no `kpi-registry.ts` | Único registry é `src/lib/portal/kpi-registry.ts` — **do portal do cliente lojista**. Regra dura: KPI não inventa dado que não existe | KPIs conversacionais no portal = fase 5; métricas internas de staff podem exigir registry análogo (não existe) |
| RBAC por papel do prompt | Matriz em `src/lib/rbac/permissions.ts` com `satisfies` exaustivo — adicionar módulo sem entrada **quebra a compilação** (bom) | Novo módulo `'conversas'` na matriz |

### Padrões obrigatórios confirmados
- **Toda rota `/api/*` precisa de guard próprio** — o middleware NÃO cobre `/api/*`.
- **Migrations aditivas**; `AuditLog` para automações críticas; `SyncLog` + heartbeat p/ rotinas; timeout em toda chamada externa; erro operacional pt-BR.
- **Webhooks fail-closed**: padrão HMAC-SHA256 sobre raw body já existe (Nuvemshop). O novo webhook Meta precisa de `X-Hub-Signature-256` (`sha256=` + HMAC do raw body com App Secret, comparação **timing-safe**) + handshake GET (`hub.verify_token`/`hub.challenge`) — nenhum webhook atual tem GET challenge.
- **Paleta**: usar utilitários **semânticos** novos (`text-text-hi/mid/low`, `bg-surface`, `--ak-*`), NUNCA os hex legados (`#0A1E2C`...) — lista congelada.

---

## 2. PONTOS DE INTEGRAÇÃO E REUSO (inventário verificado)

### Reusar direto
| Necessidade | Reusar | Onde |
|---|---|---|
| Isolamento de tenant | `clientId` + `scopeClients`/`ClientAssignment` | `src/lib/rbac/scope.ts` |
| RBAC | matriz `permissions.ts` + `can()` + `normalizeRole` | `src/lib/rbac/*` |
| Tarefa interna do lead | **model `Task` existente** + `createTask` (`src/app/actions/tasks.ts:54`) — NÃO criar InternalTask | `Task.clientId` + campo soft aditivo `conversationLeadId String?` (não sobrecarregar `Task.leadId`, que é semanticamente AgencyLead) |
| Kanban DnD | `@hello-pangea/dnd` — esqueleto de `LeadKanban.tsx` (onDragEnd otimista + rollback) | `src/components/comercial/LeadKanban.tsx:51-260` |
| Thread de chat (bolhas, scroll, composer) | base `ClientChatPanel.tsx` (generalizar) + composer com menções de `CommentThread.tsx` | `src/components/clients/`, `src/components/tasks/` |
| Lead card lateral | padrão `TaskDrawer` (abas, lazy, a11y) ou slide-over do LeadKanban + rota modal interceptada `@modal/(.)...` | `src/components/operacional/TaskDrawer.tsx` |
| UI base | button/card/badge/input/EmptyState/Skeleton/toast | `src/components/ui/*` |
| Página + nav | padrão `comercial/page.tsx` + item no `Sidebar` (visibilidade 100% via `can(role,'view',module)`, badge de não-lidas via CountKey) | `src/components/layout/Sidebar.tsx:77-148` |
| Verificação HMAC | padrão Nuvemshop (raw body) + `timingSafeEqual` (cron-auth) | `api/nuvemshop/webhooks`, `lib/cron-auth.ts` |
| Credencial DB-first | `IntegrationSetting` p/ config global; por tenant ver §3 | padrão Asaas/GA4Sync |

### NÃO reusar (domínios distintos — confirmado)
- **`AgencyLead`/`AgencyActivity`** — CRM da AGÊNCIA (Arkza vendendo; sem `clientId`; módulo `comercial` é ADMIN-only). O Lead de Conversas é o **consumidor da loja do cliente**. Reusar só o *padrão* (enum de estágio, DnD).
- **`ClientChat`/`ClientChatMessage`** — chat interno de STAFF sobre um cliente (`clientId @unique` = thread única; autor sempre `User`). O inbox precisa de N threads por cliente com autor **externo** e metadados de canal/direção/bot.
- **Z-API/Evolution** — permanecem para o uso atual (digest, leads da agência). O módulo Conversas usa a **Cloud API oficial** (canal por cliente). Rotas de webhook independentes; nada quebra.

### O que é genuinamente novo
1. Conector WhatsApp Cloud API (client Graph + webhook GET challenge + `X-Hub-Signature-256`).
2. Utilitário de criptografia at-rest (`encrypt/decrypt`, AES-256-GCM) p/ credenciais de canal.
3. Models do domínio Conversas (ver §4).
4. Envio Meta CAPI por tenant (`POST /{pixelId}/events`, hashing SHA-256 de PII, dedup `event_id`) — **não existe** pixel/dataset ID nem token CAPI por cliente hoje.
5. Shell de inbox 2-3 colunas (lista | thread | lead card) — única peça de UI de composição nova.
6. Motor de automações do funil (avaliador trigger→condições→ações, sem workflow engine genérico) + Salesbot v1 determinístico.

---

## 3. RISCOS E DECISÕES DE ARQUITETURA (precisam de aprovação)

### R1 — Ingestão assíncrona sem fila (o maior risco técnico)
O prompt pede webhook <5s + fila. **Não existe fila nem cron sub-diário** (os 4 crons são diários/semanais; pg-boss precisa de worker persistente que a Vercel não hospeda).
**Proposta (decisão minha, aprovar):** padrão **outbox + drenagem**:
- O webhook valida assinatura, grava o payload cru numa tabela `ChannelEvent` (idempotente por `wa_message_id`) e responde 200 imediatamente (<1s).
- O processamento (resolver Contact/Conversation/Message, CTWA→Lead, triggers) roda: (a) **inline best-effort** logo após gravar (try/catch; se passar do tempo, fica pendente), e (b) um **cron `/api/cron/conversas` a cada 1 minuto** (`* * * * *` no vercel.json — Vercel Cron suporta; hoje só não é usado) drena os eventos pendentes/falhados com retry + dead-letter (`status: PENDING|PROCESSED|FAILED|DEAD`).
- Isso dá resposta rápida, idempotência, retry e dead-letter usando só Postgres + Vercel Cron, sem Redis/pg-boss.

### R2 — WhatsApp Cloud API é um pré-requisito de NEGÓCIO, não só de código
Cada cliente (tenant) precisará de: **WABA própria (ou compartilhada via BSP)**, número dedicado, Meta Business verificado, e templates aprovados pela Meta. Isso é onboarding operacional por cliente — o código não resolve sozinho. A Fase 1 só é testável com pelo menos 1 WABA sandbox/real configurada.
**Também:** as versões da Graph API mudam — na implementação (Fase 1), o agente de integrações vai **ler a doc oficial atual via web search** antes de fixar versão/endpoints (regra 4 do prompt). Não fixei versão neste discovery de propósito.

### R3 — Credenciais criptografadas
Novo `src/lib/crypto.ts` (AES-256-GCM via `node:crypto`, chave `CONVERSAS_ENCRYPTION_KEY` em env). Campos `credentials` do Channel gravados cifrados. **Dívida herdada explícita:** os segredos existentes (IntegrationSetting etc.) permanecem em texto plano — migrar tudo é fora de escopo deste módulo.

### R4 — Papel "CRM/Automação"
Não existe no RBAC e criar valor novo no enum `Role` é caro/destrutivo. **Proposta:** matriz do módulo `conversas` com os 5 papéis reais:
| Papel real | Permissão em Conversas |
|---|---|
| ADMIN | tudo (incl. configurar canais/automações/broadcast) |
| SUPERVISOR_TRAFEGO | ver tudo, operar inbox/pipeline, sem deletar histórico |
| ANALISTA_TRAFEGO | criar/editar automações, bots, templates, broadcasts (≈ o "CRM/Automação" do prompt) |
| CS | inbox e leads dos clientes atribuídos, responder, mover cards |
| GESTOR_TRAFEGO | leitura dos pipelines da carteira + métricas de origem/UTM |
Ações novas no `type Action` se necessário (ex.: `reply`, `move_stage`) — o `satisfies` da matriz garante exaustividade em compile-time.

### R5 — Realtime
O projeto é Server Components sem websockets. **v1: polling leve** (refresh do inbox a cada N segundos no client) — suficiente para ~30 tenants. SSE/streaming é fase futura. (Já existe 1 rota SSE no projeto — `sync/stream` — como precedente se precisarmos.)

### R6 — LGPD
Soft delete em Contact/Lead (padrão `deletedAt` já usado em AgencyLead); exportação de dados do lead (JSON) e hard-delete agendado via cron; `opt_in_status/opt_in_at` + log de consentimento (AuditLog) para broadcast. Broadcast **só** para opt-in.

---

## 4. PLANO DE SCHEMA AJUSTADO ÀS CONVENÇÕES (proposta — não aplicado)

Traduzido do prompt para as convenções reais (`clientId`, cuid, enums Prisma, índices, soft-relations documentadas). Todos os models novos com `clientId String` + `client @relation(onDelete: Cascade)`.

```prisma
// ── Canal ─────────────────────────────────────────────────────────────────────
model ConversationChannel {
  id            String   @id @default(cuid())
  clientId      String
  type          ConversationChannelType   // WHATSAPP_CLOUD (v1) | INSTAGRAM (futuro)
  status        ConversationChannelStatus @default(PENDING) // PENDING|ACTIVE|ERROR|DISABLED
  phoneNumberId String?                   // WhatsApp Cloud API
  wabaId        String?
  displayName   String?
  credentials   String   @db.Text         // JSON cifrado (AES-256-GCM) — token de acesso etc.
  webhookSecret String?                   // verify_token do GET challenge (por canal)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  client        Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@unique([clientId, type, phoneNumberId])
  @@index([clientId])
}

// ── Contato e Lead (consumidor final da loja) ────────────────────────────────
model ConversationContact {
  id              String    @id @default(cuid())
  clientId        String
  name            String?
  phone           String?                 // E.164
  email           String?
  instagramHandle String?
  customFields    Json?
  optInStatus     ConversationOptIn @default(UNKNOWN) // UNKNOWN|OPTED_IN|OPTED_OUT
  optInAt         DateTime?
  deletedAt       DateTime?               // LGPD soft delete
  createdAt       DateTime  @default(now())
  client          Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@unique([clientId, phone])
  @@index([clientId, createdAt])
}

model ConversationPipeline {
  id        String  @id @default(cuid())
  clientId  String
  name      String
  isDefault Boolean @default(false)
  client    Client  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  stages    ConversationStage[]
  @@index([clientId])
}

model ConversationStage {
  id           String  @id @default(cuid())
  pipelineId   String
  name         String
  order        Int
  color        String?
  isWon        Boolean @default(false)
  isLost       Boolean @default(false)
  isConversion Boolean @default(false)    // dispara CAPI ao entrar (config por pipeline)
  pipeline     ConversationPipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  @@index([pipelineId, order])
}

model ConversationLead {
  id             String   @id @default(cuid())
  clientId       String
  contactId      String
  pipelineId     String
  stageId        String
  ownerUserId    String?                  // atendente responsável (User staff)
  value          Decimal? @db.Decimal(12, 2)
  source         String?                  // 'ctwa' | 'organic' | 'form' | ...
  utm            Json?
  ctwaClid       String?                  // click id do Click-to-WhatsApp
  referral       Json?                    // source_url, headline etc. do webhook CTWA
  status         ConversationLeadStatus @default(OPEN) // OPEN|WON|LOST
  lostReason     String?
  stageEnteredAt DateTime @default(now())
  deletedAt      DateTime?
  createdAt      DateTime @default(now())
  client   Client              @relation(fields: [clientId], references: [id], onDelete: Cascade)
  contact  ConversationContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  @@index([clientId, pipelineId, stageId])   // índice crítico do prompt
  @@index([clientId, status])
}

// ── Conversação ───────────────────────────────────────────────────────────────
model Conversation {
  id             String   @id @default(cuid())
  clientId       String
  contactId      String
  channelId      String
  leadId         String?
  status         ConversationStatus @default(OPEN) // OPEN|PENDING|CLOSED
  assignedUserId String?
  lastMessageAt  DateTime?
  lastInboundAt  DateTime?               // base da janela de 24h
  unreadCount    Int      @default(0)
  createdAt      DateTime @default(now())
  client  Client              @relation(fields: [clientId], references: [id], onDelete: Cascade)
  contact ConversationContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  channel ConversationChannel @relation(fields: [channelId], references: [id], onDelete: Cascade)
  messages ConversationMessage[]
  @@index([clientId, lastMessageAt])         // índice crítico do prompt
  @@index([clientId, status, assignedUserId])
}

model ConversationMessage {
  id             String   @id @default(cuid())
  conversationId String
  direction      MessageDirection // IN|OUT
  type           ConversationMessageType // TEXT|IMAGE|AUDIO|VIDEO|DOCUMENT|TEMPLATE|INTERACTIVE|UNSUPPORTED
  body           String?  @db.Text
  mediaUrl       String?
  waMessageId    String?  @unique          // idempotência de webhook (crítico)
  status         MessageDeliveryStatus @default(PENDING) // PENDING|SENT|DELIVERED|READ|FAILED
  errorDetail    String?
  sentByUserId   String?                   // staff que enviou (null = inbound/bot)
  sentByBot      Boolean  @default(false)
  createdAt      DateTime @default(now())
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([conversationId, createdAt])
}

// ── Ingestão (outbox — resposta do R1) ───────────────────────────────────────
model ChannelEvent {
  id          String   @id @default(cuid())
  channelId   String?                     // resolvido quando possível
  externalId  String?  @unique            // wa message/status id (dedup)
  payload     Json                        // payload cru do webhook
  status      ChannelEventStatus @default(PENDING) // PENDING|PROCESSED|FAILED|DEAD
  attempts    Int      @default(0)
  lastError   String?
  receivedAt  DateTime @default(now())
  processedAt DateTime?
  @@index([status, receivedAt])
}

// ── Automação (Digital Pipeline) ──────────────────────────────────────────────
model ConversationAutomation {
  id            String  @id @default(cuid())
  clientId      String
  name          String
  triggerType   ConversationTriggerType // LEAD_CREATED|STAGE_CHANGED|MESSAGE_RECEIVED|NO_REPLY_AFTER|TAG_ADDED
  triggerConfig Json?
  actions       Json                     // sequência ordenada de ações (v1: avaliador simples)
  isActive      Boolean @default(true)
  client        Client  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  runs          ConversationAutomationRun[]
  @@index([clientId, triggerType, isActive])
}

model ConversationAutomationRun {
  id           String   @id @default(cuid())
  automationId String
  leadId       String?
  status       AutomationLogStatus       // REUSA o enum existente (SUCESSO|FALHA|DUPLICIDADE_EVITADA)
  error        String?
  executedAt   DateTime @default(now())
  automation   ConversationAutomation @relation(fields: [automationId], references: [id], onDelete: Cascade)
  @@index([automationId, executedAt])
}

// ── Bot (Salesbot v1 determinístico) ─────────────────────────────────────────
model BotFlow {
  id         String  @id @default(cuid())
  clientId   String
  name       String
  definition Json                        // grafo de nós MESSAGE|QUESTION|CONDITION|ACTION|HANDOFF
  isActive   Boolean @default(false)
  channelIds String[]
  client     Client  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId, isActive])
}

model BotSession {
  id             String  @id @default(cuid())
  botFlowId      String
  conversationId String
  currentNode    String
  variables      Json?
  status         BotSessionStatus @default(ACTIVE) // ACTIVE|COMPLETED|HANDED_OFF|ABORTED
  botFlow        BotFlow @relation(fields: [botFlowId], references: [id], onDelete: Cascade)
  @@unique([conversationId, botFlowId])
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
model ConversationTemplate {
  id               String  @id @default(cuid())
  clientId         String
  channelId        String
  metaTemplateName String
  language         String  @default("pt_BR")
  body             String  @db.Text
  variables        String[]
  metaStatus       TemplateMetaStatus @default(PENDING) // PENDING|APPROVED|REJECTED
  client           Client  @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@unique([clientId, channelId, metaTemplateName, language])
}

model ConversationBroadcast {
  id             String   @id @default(cuid())
  clientId       String
  templateId     String
  audienceFilter Json                     // segmentação (só opt-in — enforced no código)
  scheduledAt    DateTime?
  status         BroadcastStatus @default(DRAFT) // DRAFT|SCHEDULED|SENDING|DONE|FAILED
  sentCount      Int @default(0)
  deliveredCount Int @default(0)
  readCount      Int @default(0)
  replyCount     Int @default(0)
  client         Client @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId, status])
}

// ── Atribuição / CAPI ─────────────────────────────────────────────────────────
model ConversionEvent {
  id          String   @id @default(cuid())
  clientId    String
  leadId      String
  eventName   String                      // Lead | Purchase | ...
  value       Decimal? @db.Decimal(12, 2)
  currency    String?  @default("BRL")
  eventId     String   @unique            // dedup na Meta
  sentToMeta  Boolean  @default(false)
  metaTraceId String?
  sentAt      DateTime?
  createdAt   DateTime @default(now())
  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  @@index([clientId, sentToMeta])
}

model ConversationNote {
  id        String   @id @default(cuid())
  leadId    String
  userId    String
  body      String   @db.Text
  createdAt DateTime @default(now())
  @@index([leadId, createdAt])
}
```

**Decisões de tradução notáveis:**
- `InternalTask` → **não existe**: reusa `Task` (adicionar `Task.conversationLeadId String?` soft, aditivo — NÃO sobrecarregar `Task.leadId`, que aponta semanticamente para `AgencyLead`).
- Pixel/CAPI por cliente: campos novos em `ConversationChannel.credentials` cifrado OU extensão de `PlatformAccount` — decidir na Fase 1 com a doc oficial CAPI (token de Ads não serve para CAPI).
- `ConversationAutomationRun.status` **reusa** o enum existente `AutomationLogStatus`.
- ~14 models novos + ~10 enums. Justificativa contra os 71 existentes: nenhum atende (AgencyLead sem clientId; ClientChat thread-única de staff; Task reusado onde cabe).

---

## 5. FASES (inalteradas do prompt) e ARQUITETURA DE PASTAS

Fases 1-5 conforme o master prompt, com gates. Pastas seguindo a convenção real do repo (não `/modules`):
```
src/services/conversas/        # cloud-api client, capi client, automation engine, bot engine
src/lib/conversas/             # guards, janela-24h, normalização de telefone (reusa lib/phone)
src/app/api/webhooks/meta-whatsapp/route.ts   # GET challenge + POST assinado (novo, separado do Z-API)
src/app/api/cron/conversas/route.ts           # drenagem do outbox (1 min)
src/app/(dashboard)/conversas/                # inbox + pipeline + config
src/components/conversas/                     # shell inbox, thread, kanban (compondo os existentes)
docs/conversas/                               # discovery + relatórios de fase
```

## 6. PERGUNTAS ABERTAS PARA O MARCOS (bloqueiam a Fase 1)

1. **R1 aprovado?** Outbox + cron de 1 min (sem Redis/pg-boss) como mecanismo de fila.
2. **R4 aprovado?** Mapeamento de papéis (ANALISTA_TRAFEGO ≈ "CRM/Automação") sem criar papel novo.
3. **WABA:** já existe alguma conta WhatsApp Business API (oficial) — da Arkza ou de algum cliente — para a Fase 1 testar? Sem WABA, a Fase 1 fica pronta em código mas não passa no gate ("mensagem real recebida").
4. **Piloto:** qual cliente será o tenant piloto (e o segundo tenant para o teste de isolamento do gate)?
5. **Custo/prazo Meta:** verificação do Business Manager + aprovação de templates tem lead time de dias — ok começar esse processo em paralelo à Fase 1?

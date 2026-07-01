## Integrações

Auditoria da dimensão **Integrações** do Performli — `src/services/*` e rotas `src/app/api`. Read-only. Data: 2026-07-01.

### (a) Tabela de integrações

| Integração | Finalidade | Arquivos principais | Config | Timeout | Eventos/Webhook |
|---|---|---|---|---|---|
| Asaas | Financeiro: entradas (payments→AsaasPayment), saídas (financialTransactions DEBIT→Expense source=ASAAS), customers, subs, transfers, balance | `services/asaas/{client,sync}.ts`, `api/asaas/{sync,webhook}` | **IntegrationSetting** (`ASAAS_API_KEY`,`ASAAS_SANDBOX`) c/ fallback env | 30s `AbortSignal.timeout` | Webhook header `asaas-access-token` vs `ASAAS_WEBHOOK_TOKEN` — **fail-closed 503** |
| Nuvemshop | Pedidos e-commerce → NuvemshopOrder + MetricSnapshot (conversions/revenue) | `services/nuvemshop/{client,sync}.ts`, `api/nuvemshop/{callback,webhooks}`, `api/sync/nuvemshop` | **env** (`NUVEMSHOP_APP_*`; token por loja em DB) | 30s | Webhook HMAC-SHA256 (`x-linkedstore-hmac-sha256`) vs `NUVEMSHOP_APP_SECRET` — **fail-closed 503** |
| GA4 | Métricas diárias → MetricSnapshot; `conversionValue = purchaseRevenue` (fallback totalRevenue) | `services/ga4/{client,sync,transformers}.ts`, `api/sync/ga4` | **env** (Service Account JWT; fallback OAuth) | 30s | — |
| Google Ads | Métricas por campanha → MetricSnapshot | `services/google-ads/*`, `api/sync/google-ads` | **env** (Service Account JWT + dev token) | 30s | — |
| Meta Ads | Insights conta/campanha → MetricSnapshot | `services/meta-ads/*`, `api/sync/meta` | **env** (`META_SYSTEM_TOKEN`; token por conta) | 25s (AbortController) | — |
| Windsor | GA4 legado (connector) | `services/windsor/*` | **env** (`WINDSOR_API_KEY`) | 25s | — |
| Z-API | WhatsApp: envio + QR + status | `services/zapi/client.ts`, `lib/whatsapp` | **IntegrationSetting** (`ZAPI_*`) | 30s | Webhook `client-token` (opcional) |
| Evolution | WhatsApp alternativo: envio + QR + webhook | `services/evolution/client.ts` | **IntegrationSetting** (`EVOLUTION_*`) | 30s | seta MESSAGES_UPSERT |
| Notifications | Digest diário WhatsApp por gestor | `services/notifications/daily-digest.ts` | **env** (`ZAPI_*`,`WHATSAPP_*`) | via lib | — |
| Leads capture | Endpoint público de captação | `api/leads/capture` | — | — | público (CORS `*`) |
| WhatsApp inbound | Cria lead a partir de msg recebida | `api/webhooks/whatsapp` | IntegrationSetting `ZAPI_CLIENT_TOKEN` | — | Z-API inbound |

### (b) Pontos fortes

- **Timeout em 100% das chamadas externas** — `AbortSignal.timeout(30_000)` ou `AbortController` (Meta/Windsor 25s), consistente.
- **Webhooks financeiros fail-closed**: Asaas (token) e Nuvemshop (HMAC) rejeitam 503 se secret ausente — evita webhook forjado de "pagamento recebido".
- **Resiliência no sync Asaas** (`asaas/sync.ts:231-245`): `Promise.allSettled` isola falha por sub-recurso; só lança se customers E payments falharem.
- **Sync por conta com try/catch individual** (GA4/Meta/Google/Nuvemshop): grava SyncLog RUNNING→SUCCESS/FAILED, cria alerta `SYNC_FAILED`, auto-dismiss em sucesso; falha de uma conta não derruba as demais.
- **Idempotência**: upserts por `externalId`/`asaasId`; Expenses Asaas não sobrescrevem categoria recategorizada (`asaas/sync.ts:191-207`).
- **Asaas e Z-API/Evolution usam IntegrationSetting** (regra 5) com fallback env.
- **Rotas de sync com auth dupla**: session ADMIN/MANAGER + ownership, ou `x-cron-secret`; ownership verificado por conta.

### (c) Riscos por severidade

**ALTO**
- **Webhook WhatsApp inbound fail-open** — `api/webhooks/whatsapp/route.ts:18-24`: `client-token` só é validado *se* o header vier. Sem header → aceita qualquer payload e **cria leads/atividades**. Diverge do padrão fail-closed dos webhooks financeiros; permite spam/injeção no CRM.
- **OAuth callback Nuvemshop com `state` não assinado e sem auth** — `api/nuvemshop/callback/route.ts:23-27`: `state` é base64 JSON `{clientId,userId}`, não assinado nem checado contra sessão. GET público cria PlatformAccount + registra webhooks → CSRF/vínculo forjado de loja.

**MÉDIO**
- **`leads/capture` público, CORS `*`, sem rate-limit/anti-spam** — `api/leads/capture/route.ts:32,117-123`. Dedup por telefone mitiga parcial; leads sem telefone passam livres.
- **GA4/Google Ads/Meta/Windsor usam só env vars, não IntegrationSetting** — `ga4/client.ts:146-159`, `google-ads/client.ts:36-85`, `meta-ads/client.ts:49`, `windsor/client.ts:57`. Regra 5 pede chaves dinâmicas; hoje trocar credencial exige redeploy.
- **Webhook Nuvemshop recalcula/sobrescreve MetricSnapshot `PAID`** — `api/nuvemshop/webhooks/route.ts:137-192`: fonte de verdade concorrente entre webhook e sync, sem reconciliação.

**BAIXO**
- **Email pessoal hardcoded no User-Agent** — `services/nuvemshop/client.ts:135` (`kyn.leonardo@gmail.com`). Não é segredo, mas deveria ser env obrigatória.
- **Asaas webhook 200 em erro interno sem AuditLog** — `api/asaas/webhook/route.ts:50-53`: erro só em `console.error`; pagamento pode falhar silenciosamente (viola regra 8).
- **Meta `validateToken`/`getAdAccounts` sem timeout** — `services/meta-ads/client.ts:176,200`: `fetch` sem `signal` (só insights têm timeout).

### 🔒 Travas / Fluidez

1. **Webhook WhatsApp fail-open** trava confiabilidade do CRM (leads forjados + follow-ups falsos). Correção simples, baixo risco.
2. **Callback Nuvemshop sem state assinado** trava segurança de onboarding de loja; exige assinar/verificar state contra sessão.
3. **Credenciais Google/Meta em env** travam autonomia operacional (troca de chave só com dev/redeploy) — contra "Arkza em processo". Migração p/ IntegrationSetting é aditiva.
4. **Falta AuditLog em webhooks financeiros** trava rastreabilidade da regra 8.

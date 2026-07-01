## Integrações

Auditoria da dimensão **Integrações** do Performli — serviços em `src/services` e rotas em `src/app/api`. Read-only.

### (a) Integrações mapeadas

| Integração | Finalidade | Credenciais | Arquivos principais |
|---|---|---|---|
| **Asaas** | Financeiro: cobranças, assinaturas, saldo, transferências, webhook de pagamento | `IntegrationSetting` (`ASAAS_API_KEY`, `ASAAS_SANDBOX`) com fallback `process.env`; webhook via `ASAAS_WEBHOOK_TOKEN` (env) | `src/services/asaas/{client,sync,types}.ts`, `src/app/api/asaas/{sync,webhook}/route.ts` |
| **Evolution API** (WhatsApp) | Envio/QR/status/webhook de instância WhatsApp (Baileys) | `IntegrationSetting` (`EVOLUTION_URL`, `EVOLUTION_KEY`, `EVOLUTION_INSTANCE`) | `src/services/evolution/client.ts` |
| **Z-API** (WhatsApp) | Envio de texto, QR, status; recebe leads via webhook | `IntegrationSetting` (`ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`) | `src/services/zapi/client.ts`, `src/app/api/webhooks/whatsapp/route.ts` |
| **Meta Ads** | Insights de conta/campanha (Graph API v22) | `PlatformAccount.accessToken` ou `META_SYSTEM_TOKEN` (env); `META_APP_ID/SECRET` p/ debug_token | `src/services/meta-ads/{client,sync,transformers}.ts` |
| **Google Ads** | Relatório diário por campanha (v17, Service Account JWT) | `GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (env) | `src/services/google-ads/{client,sync,transformers}.ts` |
| **GA4** | Relatório diário + itens (Data API v1beta, Service Account ou OAuth refresh) | `GOOGLE_SERVICE_ACCOUNT_*` ou `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` (env) | `src/services/ga4/{client,sync,transformers}.ts` |
| **Windsor.ai** | Fonte alternativa GA4 (connector) | `WINDSOR_API_KEY` (env) | `src/services/windsor/{client,transformers}.ts` |
| **Nuvemshop** | E-commerce: pedidos, OAuth, webhooks de pedido | `NUVEMSHOP_APP_ID/SECRET/USER_AGENT` (env); access_token por loja em DB | `src/services/nuvemshop/{client,sync,reconciliation,transformers}.ts`, `src/app/api/nuvemshop/*` |
| **Leads capture** | Endpoint público de captura de leads (landing pages, UTM) | — (público) | `src/app/api/leads/capture/route.ts` |
| **Notifications** | Digest diário via WhatsApp | — (usa Evolution/Z-API) | `src/services/notifications/daily-digest.ts` |

### (b) Pontos fortes

- **Zero segredo hardcoded** — grep por padrões de chave/token literais não retornou nada. Todas as credenciais vêm de `IntegrationSetting` ou `process.env`.
- **Asaas, Meta e Windsor têm timeout explícito** (`AbortSignal.timeout(30s)` / `AbortController` 25s) com mensagem de erro operacional em timeout.
- **Padrão de credencial dinâmica correto** nos serviços WhatsApp/Asaas: leem `IntegrationSetting` primeiro (permite troca de chave sem redeploy), fallback env.
- **Nuvemshop webhook verifica HMAC-SHA256** (`x-linkedstore-hmac-sha256`) quando o secret está presente.
- **Loops de sync com paginação limitada** (safety caps: 50 páginas Nuvemshop, limits Meta/GA4) evitam laços infinitos.
- **Webhooks retornam 200 em erro interno** (Asaas) para evitar retries em falha própria — comportamento intencional documentado.
- **Google Ads/GA4 usam Service Account JWT** assinado localmente (sem SDK pesado, sem armazenar tokens de longa duração).

### (c) Riscos por severidade

**ALTO**

- **Evolution client sem timeout** — `src/services/evolution/client.ts:30` (`fetch` em `req()` sem `AbortSignal`). Toda chamada WhatsApp (envio de digest, QR, status) pode pendurar indefinidamente. Viola regra "toda chamada externa tem timeout".
- **Z-API client sem timeout** — `src/services/zapi/client.ts:33` (`fetch` em `req()` sem `AbortSignal`). Mesmo risco no canal de envio de mensagens.
- **GA4 client sem timeout** — `src/services/ga4/client.ts` (`fetch` em `getServiceAccountToken`, `getRefreshToken`, `validateProperty`, `getItemReport`, `getReport` — nenhum tem `signal`). Sync diário pode travar.
- **Google Ads client sem timeout** — `src/services/google-ads/client.ts:59,104,151` (token + search sem `signal`).
- **Nuvemshop client sem timeout** — `src/services/nuvemshop/client.ts:96,129` (`exchangeCodeForToken` e `request()` sem `signal`). Paginação de até 10k pedidos sem timeout por página.
- **Meta `validateToken`/`getAdAccounts` sem timeout** — `src/services/meta-ads/client.ts:176,200` (usam `fetch` cru fora de `fetchPages`, sem `AbortController`).
- **Webhook Nuvemshop: HMAC opcional (bypass silencioso)** — `src/app/api/nuvemshop/webhooks/route.ts:25` só valida se `appSecret && hmacHeader`. Sem header, aceita payload não assinado e grava pedidos/métricas. Deveria rejeitar quando o secret está configurado mas o header ausente.
- **Webhook Asaas: token opcional** — `src/app/api/asaas/webhook/route.ts:15-16` só valida se `ASAAS_WEBHOOK_TOKEN` definido. Sem a env, endpoint aceita qualquer POST que altere status de pagamento (`handlePaymentWebhook`).
- **Webhook WhatsApp (Z-API): client-token opcional** — `src/app/api/webhooks/whatsapp/route.ts:18-19` só valida se header presente. Endpoint público que cria `AgencyLead`/`AgencyActivity` — sujeito a spam/injeção de leads falsos sem o token.

**MÉDIO**

- **Leads capture: público com CORS `*` refletido** — `src/app/api/leads/capture/route.ts:32,117` ecoa qualquer origin. Sem rate-limit nem captcha; alvo fácil para flood de leads. Aceitável por design (formulário público), mas sem nenhuma proteção anti-abuso.
- **`console.error` como único registro de falha de webhook** — Asaas/Nuvemshop/WhatsApp não gravam `AuditLog` em erro (regra 8: automação crítica gera log). Falha de webhook fica invisível no sistema.
- **Meta usa `META_SYSTEM_TOKEN` como fallback global** — `src/services/meta-ads/client.ts:49` — token único de sistema para todas as contas; se vazar, expõe todas as contas de anúncio.

**BAIXO**

- **User-Agent Nuvemshop com email pessoal default hardcoded** — `src/services/nuvemshop/client.ts:134` (`'Performli/1.0 (kyn.leonardo@gmail.com)'`). Não é segredo, mas email pessoal fixo em fallback.
- **Sem `lastRunAt` visível em alguns clients de integração** — verificar cobertura de `SyncLog` por integração (regra 9/10).

### 🔒 Travas / Fluidez

- **Travas de segurança (corrigir já):** adicionar timeout a Evolution, Z-API, GA4, Google Ads, Nuvemshop e aos dois métodos crus do Meta — mudança aditiva de baixo risco, sem alterar contratos.
- **Trava de webhook:** tornar a verificação de assinatura **obrigatória quando o secret existe** (Nuvemshop HMAC, Asaas token, Z-API client-token) — rejeitar em vez de aceitar silenciosamente. Requer que os secrets estejam populados em produção antes do deploy (coordenar para não quebrar recebimento).
- **Fluidez:** registrar `AuditLog` em falha de webhook e `SyncLog.lastRunAt` por integração dá ao Marcos a visão "qual rotina não rodou" sem depender de logs do Vercel.
- **Fluidez futura:** consolidar Evolution vs Z-API — dois clients WhatsApp coexistindo aumenta superfície de manutenção; definir canal canônico.

# Módulo Conversas — FASE 1 (fatia B): Conector Cloud API + Webhook + Ingestão + Cron

> Relatório de entrega. Continuação da fatia A (schema + crypto + RBAC). Esta
> fatia NÃO fez UI. Aguarda veredito do `guardiao` antes de ser considerada pronta.

## 1. O que foi construído

| Arquivo | Papel |
|---|---|
| `src/services/conversas/cloud-api.ts` | Client da WhatsApp Cloud API: `sendTextMessage`, `getWindowState` (janela 24h pura), `ConversasApiError`, `sendTemplateMessage` (stub Fase 3). |
| `src/app/api/webhooks/meta-whatsapp/route.ts` | Webhook oficial Meta: GET handshake + POST assinado → grava outbox `ChannelEvent` + processa inline. |
| `src/services/conversas/ingest.ts` | Processor idempotente `processChannelEvent`: inbound → Contact/Conversation/Message, CTWA → Lead, status update; retry/dead-letter. |
| `src/app/api/cron/conversas/route.ts` | Drenagem do outbox a cada 1 min (batch 50). |
| `src/app/actions/conversas.ts` | `sendConversationMessage` (envio outbound mínimo — gate). |
| `vercel.json` | +cron `/api/cron/conversas` `* * * * *`. |
| `src/lib/cron-heartbeat.ts` | `CronName` += `'CONVERSAS'`. |
| `DOSSIE-PERFORMLI.md` | §5 endpoints, §7 integrações, §8 crons, §10.2 env vars, §15 histórico. |

## 2. Versão da Graph API

- **v23.0** (constante `GRAPH_API_VERSION` em `cloud-api.ts`, troca de 1 linha).
- **Origem: MEMÓRIA do modelo.** WebSearch/WebFetch NÃO estavam disponíveis no
  ambiente de execução (2026-07-13). Marcado com `⚠️ TODO conferir doc oficial`
  no código e no dossiê. **Antes do go-live, validar contra**
  `https://developers.facebook.com/docs/whatsapp/cloud-api`:
  - `POST /{phone_number_id}/messages` (payload de texto e resposta `{messages:[{id}]}`);
  - webhook `entry[].changes[].value.{messages,statuses,contacts,metadata}`;
  - handshake GET (`hub.mode`/`hub.verify_token`/`hub.challenge`);
  - assinatura `X-Hub-Signature-256` (`sha256=`+HMAC do raw body com App Secret);
  - objeto `referral` do CTWA (`ctwa_clid`, `source_url`, `headline`).

## 3. Fluxo de ingestão (ponta a ponta)

```
Meta → POST /api/webhooks/meta-whatsapp
  1. lê RAW body; valida X-Hub-Signature-256 (HMAC timing-safe). 401/503 se falhar.
  2. por mensagem/status: upsert ChannelEvent (externalId unique = dedup), status PENDING.
  3. responde 200 IMEDIATO.
  4. inline best-effort: processChannelEvent(event) em try/catch (nunca derruba o 200).

Cron /api/cron/conversas (1 min, isCronAuthorized fail-closed)
  → busca ChannelEvent PENDING/FAILED (attempts<5, batch 50, ordem receivedAt)
  → processChannelEvent em série (try/catch por evento) → heartbeat CONVERSAS.

processChannelEvent(event) [idempotente]
  → resolve canal ATIVO por value.metadata.phone_number_id (senão FAILED, clara)
  → INBOUND: upsert Contact(clientId,phone); Conversation aberta ou nova;
             Message(waMessageId dedup natural); lastInboundAt/lastMessageAt/unread++;
             CTWA (referral + contato NOVO) → ConversationLead no pipeline default
             (seed lazy) + Conversation.leadId
  → STATUS: atualiza ConversationMessage.status por waMessageId (no-op se ausente)
  → PROCESSED | FAILED(attempts+1) | DEAD(attempts≥5) + AuditLog em DEAD
```

`clientId` é SEMPRE derivado do canal resolvido — nunca de input do payload.

## 4. Segurança (checklist por rota)

```json
{ "rota":"/api/webhooks/meta-whatsapp", "metodo":"GET", "papeis_permitidos":["webhook-meta (hub.verify_token DB-first/env)"], "validacao_posse":false, "log":false }
{ "rota":"/api/webhooks/meta-whatsapp", "metodo":"POST", "papeis_permitidos":["webhook-meta (X-Hub-Signature-256 HMAC timing-safe)"], "validacao_posse":true, "log":true }
{ "rota":"/api/cron/conversas", "metodo":"GET/POST", "papeis_permitidos":["cron (CRON_SECRET timing-safe, fail-closed)"], "validacao_posse":true, "log":true }
{ "rota":"action:sendConversationMessage", "metodo":"server-action", "papeis_permitidos":["ADMIN","SUPERVISOR_TRAFEGO","ANALISTA_TRAFEGO","CS"], "validacao_posse":true, "log":true }
```

Notas: posse no webhook/cron = canal/conversa resolvidos internamente (clientId
derivado); log = `ChannelEvent` cru + `AuditLog` em DEAD e no envio outbound.
GESTOR_TRAFEGO é VIEW_ONLY em `conversas` → bloqueado no envio por `can()`.

## 5. Como testar quando houver WABA

Pré-requisito (R2 do discovery): WABA + número + Business verificado + `ConversationChannel`
ACTIVE com `phoneNumberId` e `credentials` cifrado (`encryptSecret(JSON.stringify({accessToken}))`).

1. **Env/DB:** `CONVERSAS_ENCRYPTION_KEY` (32 bytes base64); `META_WA_VERIFY_TOKEN` e
   `META_WA_APP_SECRET` em `IntegrationSetting` (ou env). `CRON_SECRET` para o cron.
2. **Handshake:** configurar a Callback URL na Meta → ela chama GET com `hub.challenge`;
   esperar 200 com o challenge. Token errado → 403; sem token → 503.
3. **Inbound real:** enviar msg do celular ao número da WABA → webhook grava `ChannelEvent`
   → aparece `ConversationContact`/`Conversation`/`ConversationMessage` (direction IN).
4. **CTWA:** clicar num anúncio Click-to-WhatsApp (contato novo) → confere `ConversationLead`
   criado no pipeline default com `source='ctwa'` e `ctwaClid`.
5. **Outbound:** dentro da janela de 24h, `sendConversationMessage(conversationId, texto)` →
   `ConversationMessage` OUT status SENT + wamid; fora da janela → erro operacional pt-BR.
6. **Status:** após envio, a Meta manda status (sent/delivered/read) → atualiza a mensagem.
7. **Cron/retry:** desativar o canal e reenviar → evento FAILED; reativar → cron reprocessa;
   após 5 tentativas → DEAD + `AuditLog`.

## 6. Pendências / anti-escopo

- **Conferir doc oficial da Graph API** (v23.0 veio de memória) — item bloqueante de go-live.
- UI do inbox/pipeline: Fase 2.
- Envio de **template** fora da janela: Fase 3 (assinatura pronta, sem implementação).
- CAPI / atribuição / broadcast / bot: Fases 4-5.
- Migração dos segredos legados para cifrado: fora de escopo (débito herdado, R3).
- Realtime é polling (R5); sem websockets nesta fatia.

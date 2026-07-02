# Handoff — Migração ClickUp + Conciliação Asaas (backend-dal)

> Fatia vertical de dados: motor de migração dos lotes do ClickUp para o
> Performli + o reconciliador inteligente cliente↔contrato↔fatura↔task do Asaas.
> **Sem migration de schema** (tudo aditivo sobre colunas existentes).

## Arquivos entregues

- `src/services/clickup-migration.ts` — motor `migrarClickUp(lote)`.
- `src/services/asaas-task-reconciler.ts` — `reconcileAsaasTasks()`.
- `src/app/api/admin/seed-operacao/route.ts` — phases `migrar-clickup` (param
  `lote`) e `reconciliar-asaas` (ADMIN-only, mesmo guard 401/403).
- `src/app/api/cron/daily/route.ts` — novo **Step 5b.1** (`reconcileAsaasTasks`)
  logo após o Step 5b (sync Asaas), com try/catch + `summary.asaasReconcile`.
- `src/components/settings/SeedOperacaoCard.tsx` — seção "Migração ClickUp" com
  os botões "Migrar tudo (ClickUp)" e "Conciliar Asaas agora" + resultados.
- Dados de origem: `src/services/clickup-migration-data.ts` (snapshot commitado).

## Mapa de idempotencyKeys

| Origem | Chave | Dedupe |
|---|---|---|
| internas / rituais / pagar / metas | `clickup-mig:{clickupId}` | `Task.idempotencyKey @unique` → `findUnique` antes; P2002 = pulada |
| contratos | (sem chave) | REGRA DO DONO: se o cliente já tem `Contract` VIGENTE → pulada. O contrato criado nasce VIGENTE → re-run pula. Rastro em `notes` (`importado do ClickUp: {clickupId}`) |
| cobrança Asaas | `asaas-cobranca:{payment.id}` | `Task.idempotencyKey @unique`; vínculo fatura↔task SEMPRE por ID, nunca por nome |
| recorrência (motor, já existente) | `recur:{taskId}:{yyyy-mm-dd}` | disjunta das acima — não misturar |

Rodar N vezes = mesmo estado (idempotência total).

## Decisões

1. **Metas → Task, não Goal.** O model `Goal` EXIGE `clientId` (metas de
   cliente). As 9 metas do ClickUp são metas de AGÊNCIA (faturamento bruto, nº de
   clientes ativos, contratações) — nenhum model existente serve. Viram `Task`
   interna `type SIMPLES`, `assignedTo` Marcos, `tags ['meta','{quarter}','clickup']`,
   e o status do ClickUp ('não conquistada'/'a conquistar') na `description`.
   Não foi criado model novo (CLAUDE.md: nenhum model sem justificativa).
2. **startDate de contrato = endDate − 6 meses.** Ciclo de fee mensal padrão da
   Arkza; escolha simples e documentada. Marcos ajusta se o ciclo for anual.
3. **feeValue do contrato = 0.** A API do ClickUp não expõe o fee. Entra 0
   (coluna NOT NULL) com nota em `notes` — **Marcos completa no painel**.
   Ao criar o contrato, amarra `Client.contractStart` / `Client.contractEndDate`.
   AuditLog `contract.importClickup`.
4. **Enum AsaasPaymentStatus encontrado** (schema): `PENDING · RECEIVED ·
   CONFIRMED · OVERDUE · REFUNDED · REFUND_REQUESTED · CHARGEBACK_REQUESTED ·
   AWAITING_RISK_ANALYSIS`. Mapeamento usado:
   - ABERTO (gera task): `PENDING`, `OVERDUE` (OVERDUE → priority CRITICA).
   - PAGO (conclui task): `RECEIVED`, `CONFIRMED`. (Não existe `RECEIVED_IN_CASH`
     no enum deste projeto — o Asaas cru é normalizado no sync.)
   - ESTORNO (reabre task): `REFUNDED`.
5. **completedById = null** na conciliação automática (a coluna é `String?`
   nullable) → representa "sistema". `TaskActivity.actorId = null` idem.
   Valor efetivo da nota usa `netValue ?? value`.
6. **AsaasPayment não tem clientId direto** — o vínculo é
   `AsaasPayment.customer → AsaasCustomer.clientId`. A geração só ocorre para
   cliente ACTIVE.

## Contratos NÃO conciliados esperados (nomes de pessoa sem cliente óbvio)

O matching é por `normalize(name|slug)` dos aliases contra os `Client`. Contratos
cujo `nomeClickUp` é só um primeiro nome tendem a cair em `naoConciliados` (NÃO
criam nada — sem chute). Esperado revisar à mão:

- Marina · Victor · Rayane · Laura · Pedro · João · Maitê · Luana · Rafaela ·
  Thais · Daniela

Os com nome de loja (Tayna Moda Feminina, Catita Store, Lavinny Store, Leticia
Store, Via Miami RP, My Muse BR) tendem a casar. A lista real aparece em âmbar no
card ("Não conciliados") após rodar "Migrar tudo".

## O que o Marcos precisa completar

1. **Valores das Contas a Pagar** (12 tasks `type COBRANCA`, tags
   `financeiro/clickup`) — a API não expôs os valores; preencher no painel.
2. **feeValue dos contratos importados** — nascem com 0; completar o fee mensal
   real (a nota do contrato lembra disso).
3. **Contratos não conciliados** — para cada nome de pessoa sem cliente óbvio,
   decidir a qual `Client` corresponde (ou ignorar). Nada foi criado para eles.
4. **externalId dos demais usuários** (Leandro, Pablo, Kyn, Letícia, Red): sem
   isso, tasks internas do time caem no fallback Marcos. Pré-requisito do lote 0.

## Segurança / checklist de autorização por endpoint

```json
{ "rota":"/api/admin/seed-operacao", "metodo":"POST?phase=migrar-clickup", "papeis_permitidos":["ADMIN"], "validacao_posse":true, "log":true }
{ "rota":"/api/admin/seed-operacao", "metodo":"POST?phase=reconciliar-asaas", "papeis_permitidos":["ADMIN"], "validacao_posse":true, "log":true }
{ "rota":"/api/cron/daily", "metodo":"GET/POST (Step 5b.1)", "papeis_permitidos":["cron (CRON_SECRET)"], "validacao_posse":true, "log":true }
```

- `validacao_posse`: migração/conciliação operam sobre entidades internas da
  agência; a "posse" aqui é a barreira ADMIN + cron-secret. AuditLog em
  `clickup.migrar`, `contract.importClickup`, `asaas.autoReconcile`,
  `asaas.reopened`.

## Evidência mínima

- Cada lote retorna `{ criadas, puladas, naoConciliados, erros }`; conciliação
  retorna `{ geradas, conciliadas, reabertas, erros }`. Exibidos no card e
  registrados em AuditLog.
- try/catch por item (tarefa/fatura/contrato) — 1 item quebrado não derruba o
  lote (CLAUDE.md #7). `reconcileAsaasTasks` NUNCA lança.

## Validação não executada neste ambiente

- `prisma generate` bloqueado (registry 403) e `@types` não resolvem no tsc
  local → o type-check global acusa `Cannot find module` genéricos. Os únicos
  diagnósticos nos arquivos novos (`err is unknown` no ramo
  `Prisma.PrismaClientKnownRequestError`) desaparecem com o client gerado —
  padrão idêntico ao que já roda em produção em `src/lib/tasks/recurClone.ts:134`.
- Sem SQL novo / sem migration → nada a validar no Postgres.

## Handoff → guardião

Fatia pronta para revisão. NÃO considerar concluída antes do veredito APROVADO.

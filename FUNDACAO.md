# OPERAÇÃO FUNDAÇÃO — plano vigente (2026-07-18)

> Decisão do Marcos: o sistema "recomeça" enxuto, bloco por bloco; cada bloco só
> reaparece na navegação quando CERTIFICADO por ele por escrito.
> **CONGELAMENTO: nenhuma feature nova até o fim da operação.**

## Rito de cada bloco
1. Consertar o que estiver quebrado no bloco (com QA adversarial).
2. Marcos valida com dados reais e certifica por escrito.
3. Só então as abas do bloco reaparecem (Itens ocultos → Restaurar) e o
   próximo bloco começa.

## Bloco 1 — Dados & Saúde (EM CURSO)
Telas visíveis: Cockpit (saúde + radar) · Clientes · Diagnóstico de Fontes.
Checklist de saída:
- [ ] Cron diário rodando SOZINHO (CRON_SECRET na Vercel + job executado — evidência: SyncLog do dia seguinte sem toque manual)
- [ ] Watchdog de cron gritando no Cockpit quando não rodar (furo atual: não gritou)
- [ ] Contas vinculadas conferidas cliente a cliente no /diagnostico-fontes (externalId = propriedade/conta real)
- [ ] GA4Sync: lojas vinculadas para todos os clientes que usam (lista do Marcos)
- [ ] Números batendo com o Looker em 3 clientes-teste (New Man + 2) — tolerância <2%
- [ ] Quadro de saúde único coerente (sem SPEND na média, pacing certo)
- [ ] **Certificação por escrito do Marcos: "os números batem"**

### Ajuste da tela CLIENTES (2026-07-21) — AGUARDANDO APROVAÇÃO DO MARCOS
Lista `/clients` reformatada no layout do print (ClickUp): Status · Nome · Tipo de
Serviço · Classificação (OURO/PRATA/BRONZE) · Período do Contrato (vermelho se
vencido, âmbar se vence <30d) · Modelo de Negócio · Plataforma · Responsável ·
Investimento em anúncios · Valor do Contrato + rodapé de CONTAGEM e SOMAS
(financeiro só ADMIN). Regra nova "dado amarrado": período/valor vêm do Contract
vigente do Jurídico (fonte única; fallback = cadastro, sinalizado na UI).
Lacunas propostas: Classificação derivada de `curva` A/B/C; Tipo de Serviço de
`produtos[]`; Investimento = metas investimento (não SPEND). Detalhes no DOSSIE §15.
Pendente: veredito do `guardiao` + certificação por escrito do Marcos.

### Budget mensal → Metas automáticas → Health Score (2026-07-21) — AGUARDANDO APROVAÇÃO DO MARCOS
O INVESTIMENTO (budget mensal por plataforma) vira a métrica-mãe editável no
início do mês. Direção INVERTIDA: `roasMinimo` agora é INPUT humano e o
faturamento é DERIVADO (`faturamento-alvo = investimento total × ROAS mínimo`).
- Fonte única de derivação: `src/lib/metas/budget.ts` (`computeMetasFromBudget`) —
  `spendGoal = soma`, `faturamentoGoal = soma × roasMinimo`, `roasGoal = roasMinimo`.
- Ao salvar budget/ROAS na ficha do cliente (`EditClientModal` → `updateClient`),
  UPSERT das Goals MONTHLY do mês corrente (SPEND/FATURAMENTO/ROAS) + AuditLog
  `goals.auto_from_budget`. Health score já lê essas Goals (nada a mudar lá).
- Convivência com o cron `projetarMetasDoMes`: mesma chave de Goal do mês →
  **budget (decisão humana) SOBRESCREVE a projeção automática do mês corrente**;
  meses futuros seguem a projeção. Cron não alterado.
- `roasMinimo` já existia no schema (`Decimal?`) — NENHUMA migration criada.
- UI: coluna "Invest. Anúncios" da tela Clientes virou 4 colunas do print
  (Invest. Meta · Google · TikTok · ROAS mín.) com soma dos 3 investimentos no
  rodapé (ADMIN). Tipo de Serviço: sugestões canônicas "Tráfego Pago", "CRM",
  "Traqueamento". Detalhes no DOSSIE §15.

### Status editável (inline + massa) + ciclo de renovação de contrato
- Tela Clientes: célula STATUS virou dropdown-pill (Ativo/Pausado/Cancelado)
  editável inline + barra de ação em massa, otimista com rollback/toast. Escreve
  em `Client.status` (fonte única). Confirm ao Cancelar. Visível só p/ papéis
  autorizados; demais veem pill estática.
- "Em renovação" = badge de leitura (âmbar) na coluna Período, derivada do
  Contract vigente status RENOVACAO — NÃO é opção do seletor.
- Action `updateClientsStatus` (ADMIN/SUPERVISOR only; zod máx 100; AuditLog
  `client.status.bulk`; revalidate /clients+/cockpit). CHURNED → offboarding
  por cliente.
- Adendo — ciclo de renovação: cron `flagExpiredContractsForRenewal` (vencido →
  RENOVACAO + Alert CONTRACT_EXPIRING_SOON + AuditLog); reativação renova pelo
  mesmo período em $transaction (`computeRenewalDates`) + toast. Substituiu o
  antigo `renewExpiredContracts` silencioso (justificativa em PROJECT_STATE.md).
  Nenhum model/enum novo; `CONTRACT_EXPIRING_SOON` e `ClientStatus` reaproveitados.

Pendente: veredito do `guardiao` + certificação por escrito do Marcos.

## Blocos seguintes (aguardando)
2. Tarefas/rotinas · 3. Clientes/CS · 4. Comercial/Conversas · 5. Financeiro · 6. Portal

## Pendências conhecidas que entram nos blocos
- TikTok Ads não é integração (spend nunca entra) — decidir no Bloco 1 se entra no escopo
- Crash Client 360 (Barbara) — retestar pós-hotfix no Bloco 1
- Unificação restante da auditoria: ver VALIDACAO.md

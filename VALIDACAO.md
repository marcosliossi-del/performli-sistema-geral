# VALIDACAO.md — FASE 4 (A4) · Auditoria Sistêmica do Performli

> Entregável final do master prompt. Correções em produção via PR #192
> (squash 54c8288). QA adversarial por onda: A (1 reprova corrigida), B
> (1 reprova corrigida), C+hotfix (aprovado direto).

## 7.1 Verificação cruzada dos BUG_DIVERGENCIA

Método: no ambiente de desenvolvimento não há acesso ao banco de produção nem
egress ao app — a verificação é ESTRUTURAL (todos os caminhos passam a chamar a
MESMA função) + confirmação de runtime pendente do próximo cron diário e da
navegação do Marcos. Para cada dado, os caminhos convergidos:

| Dado | Caminhos (todos → fonte única) | Fonte única |
|---|---|---|
| Faturamento/ROAS/pedidos ECOM | Client 360 · lista · grid · cockpit · /agency/metas (corrente, histórico, prev) · gráfico 6 meses · portal (card + funil "Compraram") · resultado-engine/War Room/alertas | aggregateSnapshots (GA4SYNC>GA4/dia) via getRealizado*/Batch |
| Investimento/spend | lista · grid · /agency/metas · scorer | NON_AD_PLATFORMS/isAdPlatform |
| Projeção do mês · daysElapsed | portal · cockpit · /agency/metas · GoalPaceCard · Client 360 | pace.ts (spDayInfo/projectMonth) |
| % de meta em curso | Client 360 · /reports | proRataExpected + liveAchievementPct ("esperado até hoje") |
| "Hoje"/atrasada (tarefas) | badge Meu Dia · /meu-dia · /operacional · cockpit · aceite | startOfTodaySaoPaulo |
| Boundary financeiro | /financeiro · /api/summary · /api/cashflow · fila vencidos | spUtcMidnight/spDayInfo (00:00Z p/ @db.Date) |
| Inadimplentes | /clients · /financeiro · summary | countInadimplentes() |
| DRE (saídas/lucro) | página · endpoint | getDreTotals() |
| Badges | check-ins (ClientWeeklyCheckin) · alertas (EXCLUDED_ALERT_TYPES) · suporte (taskScopeFor+OPEN_SUPPORT_STATUSES) | predicados compartilhados badge×tela |
| Status de tarefa | board · painel/drawer | enum (statusId write-only) |

## 7.2 Papéis (5 roles)

Verificação estática: nenhuma correção alterou a matriz RBAC nem os scopings
(scopeClients/scopeTasks) — os QA de onda conferiram cada rota tocada.
Mudanças de exposição INTENCIONAIS: (a) grant financeiro → visão resumida
somente leitura, dados sensíveis NEM BUSCADOS para não-ADMIN (padrão-ouro,
QA Onda C §2); (b) /api/financeiro/summary+cashflow aceitam grant com o mesmo
recorte estripado; mutações seguem ADMIN. Deny-by-default preservado.
Pendente: teste de clique real papel-a-papel (bloqueado: sem egress ao app).

## 7.3 Regressão

- Vercel build verde (typecheck completo) no PR #192.
- LOCAL/B2B intocados nos pontos de métricas (QA Onda A); /financeiro ADMIN
  idêntico (QA Onda C); board sem prefs antigas → defaults; portal não-GA4Sync
  idêntico.
- Hotfix Client 360: 19 queries → 3 grupos sequenciais; take em tarefas;
  P2002 tolerado no chat. Confirmação prática: Marcos reabrir
  /clients/espaco-barbara-issas.

## 7.4 Autocrítica obrigatória

1. **Alguma correção criou nova fonte duplicada de verdade?** Uma fronteira:
   `pace.ts` reexporta lógica do health-scorer (computeAchievementPct) em vez
   de duplicá-la — ok. MAS o par `startOfTodaySaoPaulo` (03:00Z, DateTime) ×
   `spUtcMidnight` (00:00Z, @db.Date) é uma DUALIDADE INTENCIONAL documentada;
   se alguém usar o helper errado numa coluna nova, a divergência volta. Regra
   registrada no dossiê.
2. **Algum cache novo pode dessincronizar?** Não criamos cache novo. O risco
   remanescente é o pré-existente: HealthScore.achievementPct persistido segue
   podendo divergir do ao-vivo até o próximo cron — mitigado ao tirar ele da
   UI de metas (A-002), mantido no status (por design).
3. **Itens sem correção (status final):**
   - A-009 (dois eixos de status) — PENDENTE: decisão 3 aprovada (unificar),
     mas a unificação de UI/vocabulário é mudança de produto maior; ficou fora
     das ondas. Vai como fatia própria.
   - A-102 residual — coluna "última mensagem vista" exigiria migration;
     guard atual nunca PERDE não-lida (pode manter a mais). Pendência aceita.
   - A-115 endpoints summary/cashflow sem consumidor — candidatos a remoção
     (migration destrutiva de API; aguarda aprovação isolada, regra 2).
   - Spend `!== 'GA4'` em 6 pontos inertes (dal 698/984/1052/2287, sync
     stream, weekly-report) — padronizar via isAdPlatform em lote futuro.
   - prevEntradas bruto×líquido no DRE (pré-existente, centralizado).
   - Cap de 200 abertas no atrasadasCount do Client 360 (irrealista exceder).
4. **O que ainda vai gerar divergência em 6 meses?** (a) A dualidade 03:00Z ×
   00:00Z se não for respeitada em código novo; (b) Task.statusId espelhado —
   write-only hoje, mas sem constraint no banco; (c) todo cálculo novo que
   somar MetricSnapshot sem passar por aggregateSnapshots — sugerir lint/regra
   de revisão; (d) HealthScore congelado × ao-vivo nas telas que ainda exibem
   os dois (status vs número) — aceito por design, mas é o candidato nº1 a
   "por que o % não bate?" no futuro.

## Status final da Matriz

CORRIGIDOS: A-001, A-003..A-008, A-010, A-100, A-101, A-103..A-108, A-109..A-120
(exceto abaixo). PENDENTES: A-009 (fatia própria), A-102 (residual aceito),
A-115 (remoção dos endpoints aguarda aprovação). AGUARDANDO_DECISAO: nenhum —
as 10 perguntas do Gate 1 foram respondidas ("continue" = recomendações).
LACUNA: os 2 arquivos de referência do master prompt nunca foram anexados; as
decisões do Marcos fizeram o papel da spec (registrado).

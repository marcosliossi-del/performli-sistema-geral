# Backtest do Score de Risco de Churn v2 — FASE 0

> **Pergunta que este backtest responde:** os pesos PROPOSTOS pela auditoria
> (Bloco 6 de `docs/AUDITORIA_CHURN_SILENCIOSO.md`) realmente antecipam o churn
> real — ou são só uma hipótese bonita? Nada do score v2 entra em produção antes
> deste teste passar.

## Por que existe

O score de churn atual (`churn-scorer.ts`) é 100% derivado de performance de
mídia — confirma o churn depois que ele já aconteceu. O v2 propõe 10 fatores
(crônico Regular/Ruim, performance, tendência de spend, ficha CS, staleness,
suporte atrasado, silêncio, feedback reincidente, inadimplência, idade de
contrato). Os pesos vêm da intuição da auditoria, **não** de dados. Esta Fase 0
calibra (ou reprova) esses pesos contra os churns reais dos últimos 12 meses.

Enquanto `uncalibrated: true` em `src/lib/churn/score-v2-config.ts`, os pesos
são hipótese e **não podem** disparar automação (Alert, task, War Room).

## Como rodar

Não há acesso direto ao banco de produção neste ambiente. O backtest roda EM
PRODUÇÃO, via endpoint ADMIN, no mesmo padrão das rotinas one-off:

1. Entre em **Configurações → Operação** (logado como ADMIN).
2. Clique em **"Backtest do score de churn (Fase 0)"** no card de operação.
3. O serviço reconstrói os scores (leitura pura) e devolve o relatório.
4. Copie o **JSON completo** (bloco `<details>`) e cole na seção Resultados.

O botão grava um `AuditLog` (`action: 'churn.backtest.run'`) com as métricas
agregadas — a execução fica rastreada.

## Método

- **Coorte churned:** clientes `CHURNED` com data de churn nos últimos 12 meses.
  Data de churn = `Contract.cancelledAt` mais recente; fallback
  `Client.updatedAt`. Se houver menos de 8 casos, o relatório marca
  `coorteInsuficiente: true` (resultado apenas indicativo).
- **Coorte controle:** até 15 clientes `ACTIVE` sem `CriticalProtocol` nos
  últimos 6 meses, ordenados por `createdAt asc` (mais histórico). Cada um recebe
  uma data de referência **determinística** (hash do id → 6 a 16 semanas atrás,
  sem aleatoriedade).
- **Reconstrução (`computeScoreV2At`):** o score na foto de uma data passada usa
  SOMENTE registros com `date/createdAt <= refDate` — HealthScore WEEKLY (8 sem),
  MetricSnapshot.spend (4+4 sem), Task isSupport vencidas abertas na época,
  última interação/mensagem para silêncio, Contract.startDate para idade.
  **Exceção com ressalva:** o fator inadimplência **não** é totalmente
  reconstruível — ver "Limitação estrutural" abaixo.
- **Fotos por churned:** T-2, T-4, T-6, T-8 semanas antes da data de churn.
- **Métricas:** recall em cada T (% de churned com score ≥ 65), falso-positivo
  (% de controle ≥ 65), e separação média por fator (média churned em T-6 vs
  média controle — mostra quais fatores discriminam).

### Fatores não reconstruíveis

A ficha de CS (`nps/relacionamento/engajamento`), o `fichaCsUpdatedAt` e os
contadores de feedback (`feedbackNegativo/fechouSemanaEmRisco`) são estado
**atual**, sem histórico versionado — não dá para saber o valor numa data
passada. Os fatores `fichaCs`, `stalenessFicha` e `feedbackReincidencia` entram
como **0** no backtest e são listados em `fatoresNaoReconstruiveis`. A Fase 0
prevê isso: peso reduzido + `uncalibrated` + **reexecução em 90 dias**, quando já
houver histórico acumulado desses campos.

### Limitação estrutural: fator inadimplência (look-ahead)

O `AsaasPayment` não versiona transições de status. O backtest conta faturas com
`status = OVERDUE` (o status **de hoje**) e `dueDate <= refDate` — uma fatura que
estava vencida na foto e foi paga depois aparece hoje como `RECEIVED` e **some da
contagem** (e o inverso também vaza). É viés de futuro real num fator de peso 8.
Consequência prática: **a separação medida para `inadimplencia` deve ser lida com
ressalva**, e o peso deste fator permanece `uncalibrated` mesmo que as metas do
backtest passem — só a reexecução em 90 dias, com histórico de transições
acumulado a partir de agora, calibra este fator de verdade. O relatório expõe
essa limitação junto aos fatores não reconstruíveis.

## Regra de decisão

| Resultado | Ação |
|-----------|------|
| **recall T-6 ≥ 60% E falso-positivo ≤ 20%** | Pesos viram spec: mudar `uncalibrated` para `false`, liberar o score v2 para automação nas próximas fases. |
| **Qualquer meta não atingida** | Manter `uncalibrated: true`. Adotar faixas **provisórias** (score só informativo no cockpit, sem disparar Alert/task/War Room) e **reexecutar em 90 dias** com histórico acumulado (inclui os fatores hoje não reconstruíveis). Reavaliar pesos dos fatores com baixa separação. |

`coorteInsuficiente: true` (menos de 8 churned) → tratar QUALQUER resultado como
indicativo, nunca como aprovação de spec; reexecutar quando houver mais casos.

## Resultados

> **PENDENTE — rodar o botão "Backtest do score de churn" em
> Configurações → Operação e colar o resultado aqui.**

```json
(colar aqui o JSON completo do relatório)
```

**Veredito:** _pendente_
- recall T-6: _—_ (meta ≥ 60%)
- falso-positivo: _—_ (meta ≤ 20%)
- coorte suficiente (≥ 8 churned): _—_
- decisão: _spec / faixas provisórias + reexecução em 90 dias_

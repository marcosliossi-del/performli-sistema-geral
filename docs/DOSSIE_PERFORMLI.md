# DOSSIÊ COMPLETO — Como o Performli funciona

> Gerado em 02/07/2026 a partir de leitura direta do código (caminhos e nomes exatos).
> Performli = sistema operacional interno da Arkza. Fonte única da verdade: PostgreSQL (Prisma).

---

## 1. Visão geral em um parágrafo

O Performli concentra a operação da Arkza em um único lugar: clientes e carteiras, tarefas (substituindo o ClickUp), metas e resultados de tráfego, saúde/risco de churn de cada conta, financeiro (Asaas), contratos, comercial/CRM, comunicação (WhatsApp) e IA. Um **cron diário às 08:00 (BRT)** puxa dados de todas as plataformas de mídia, recalcula saúde e risco de cada cliente, concilia o financeiro e dispara alertas — para que ninguém dependa de memória.

---

## 2. Metas — como funcionam de verdade

### 2.1 A fonte da verdade é o model `Goal`
`prisma/schema.prisma` — cada meta é uma linha: **cliente + métrica + período + valor-alvo**.

- **Métricas disponíveis** (enum `MetricType`, 25 opções): ROAS, CPL, CPA, INVESTMENT, CONVERSIONS, SALES, CTR, CPC, IMPRESSIONS, REACH, FREQUENCY, CLICKS, SPEND, **FATURAMENTO**, TICKET_MEDIO, TAXA_CONVERSAO, CPS, CPM, CAC, MENSAGENS, VISITAS_PERFIL, LIGACOES, AGENDAMENTOS, LEADS, SEGUIDORES.
- **Períodos**: `MONTHLY` (você preenche) e `WEEKLY` (gerado automaticamente).
- Unicidade: um cliente não tem duas metas da mesma métrica/período/início.

### 2.2 Onde as metas são preenchidas
- Tela **Metas da Agência** (`/agency/metas`) → tabela em massa (`MetasBulkTable`) grava via `upsertMonthlyGoals` (`src/app/actions/goals.ts`).
- Toda **segunda-feira** o cron converte as metas mensais em semanais (`syncWeeklyGoalsFromMonthly`): taxas (ROAS, CTR…) mantêm o alvo; volumes (faturamento, leads…) dividem por 4,33.

### 2.3 De onde vêm os dados que medem as metas
Do model **`MetricSnapshot`** — uma linha por conta/plataforma/dia, alimentada pelas sincronizações (seção 3). Os motores comparam **realizado (snapshots)** × **alvo (Goal)**:

| Motor | O que faz | Fonte do realizado | Fonte do alvo |
|---|---|---|---|
| `resultado-engine.ts` | Resultado semanal (Ótimo→Péssimo) | GA4 (receita) ÷ demais plataformas (gasto) = ROAS | `Goal(ROAS)`; sem meta → 2.0 |
| `health-scorer.ts` | HealthScore por meta | GA4 (e-commerce) / Meta Ads (negócio local) | todas as `Goal` do cliente |
| `churn-scorer.ts` | Risco de churn 0–100 | HealthScores das últimas 8 semanas | — |
| `budget-monitor.ts` | Alerta de verba a 90% | soma de `spend` do mês | `Goal(SPEND/INVESTMENT)` |

### 2.4 ⚠️ Descoberta importante — campos de meta no cadastro do cliente NÃO são usados
O model `Client` tem `roasMinimo`, `cpaMaximo`, `investimentoMeta/Google/Tiktok` e `faturamentoEsperado` — mas esses campos **só foram preenchidos pelo seed das carteiras e nenhum motor os consome**:
- O Resultado semanal usa `Goal(ROAS)`, **não** `Client.roasMinimo`.
- O monitor de verba usa `Goal(SPEND)`, **não** `Client.investimentoMeta`.
- Na ficha do cliente, os cards "Invest. Meta/Google/Tiktok" mostram o **gasto real** dos snapshots, não o orçamento cadastrado.

**Implicação prática:** para uma meta valer, ela precisa estar em **/agency/metas** (model Goal). O que está só na ficha do cliente é informativo/morto. Vale decidirmos: ou plugamos esses campos como fallback dos motores, ou os tratamos como legado.

---

## 3. Fontes de dados (integrações)

| Fonte | O que puxa | Vai para | Credencial | Serviço |
|---|---|---|---|---|
| **Meta Ads** | gasto, resultados e campanhas por conta | `MetricSnapshot` + `CampaignSnapshot` | `META_SYSTEM_TOKEN` (env) ou token por conta | `src/services/meta-ads/` |
| **Google Ads** | performance por conta (API v17) | `MetricSnapshot` | Service Account Google (env) | `src/services/google-ads/` |
| **GA4** | receita, compras, sessões | `MetricSnapshot` | mesma Service Account | `src/services/ga4/` |
| **Nuvemshop** | pedidos das lojas | `NuvemshopOrder` + `MetricSnapshot` | OAuth por loja (app Nuvemshop) | `src/services/nuvemshop/` |
| **Asaas** | clientes, cobranças, assinaturas, transferências, despesas | `AsaasCustomer/Payment/Subscription/Transfer` + `Expense` | `ASAAS_API_KEY` no `IntegrationSetting` (painel) | `src/services/asaas/` |
| **Z-API / Evolution** | envio de WhatsApp (digest, alertas) | — | chaves no `IntegrationSetting` | `src/services/zapi/`, `evolution/` |
| **ClickUp** | migração one-shot (feita) | Task/Contract/Expense/Goal | — | `clickup-migration.ts` |
| **Windsor.ai** | *inativo* — módulo existe mas nada importa dele (Meta/GA4 falam direto com as APIs) | — | — | `src/services/windsor/` |

**Rotina (vercel.json):**
- `cron/daily` **08:00 BRT** — sincroniza TODAS as plataformas de todas as contas, recalcula saúde, churn, verba, contratos, concilia Asaas↔tarefas (fatura paga fecha a tarefa; vencida abre tarefa crítica; estorno reabre).
- `cron/digest` **08:30 BRT** — resumo do dia via WhatsApp.
- `cron/recurrences` **07:00 BRT** — materializa tarefas recorrentes.
- `cron/resultados` **segunda 06:00 BRT** — Resultado semanal dos e-commerces.
- Sincronização manual: botões nas telas chamam `/api/sync/*` (ADMIN).

---

## 4. Cálculos derivados (as "notas" de cada cliente)

### Resultado semanal (e-commerce)
ROAS da última semana fechada (dom–sáb) ÷ meta de ROAS →
**Ótimo** ≥120% · **Bom** ≥100% · **Regular** ≥80% · **Ruim** ≥60% · **Péssimo** <60%.
Etapa derivada: Ótimo→**Escala**; Bom/Regular→**Monitoramento**; Ruim/Péssimo→**Otimização**.
Ruim/Péssimo dispara alerta + tarefa de plano de ação para o gestor automaticamente.

### HealthScore (diário, por meta)
Ritmo do mês: realizado vs alvo proporcional aos dias decorridos → ≥90% Ótimo, 70–89% Regular, <70% Ruim. Tendência (últimos 7 dias vs 7 anteriores): ±20% sobe/rebaixa um nível. E-commerce mede por GA4; negócio local por Meta Ads.

### Risco de churn (0–100, semanal)
Semanas seguidas em Ruim (peso maior) + achievement médio + tendência negativa + falta de dados. Alimenta o War Room / anti-churn.

### Streak
`ClientStatusStreak` guarda há quantos dias o cliente está no status atual — é o que permite dizer "cliente crítico há 3 semanas".

---

## 5. Financeiro

- **Entradas**: espelho do Asaas (`AsaasPayment`), conciliado por ID de cobrança — fatura paga conclui a tarefa financeira sozinha com o valor líquido; vencida gera tarefa CRÍTICA; estorno reabre. Identidade do cliente = razão social (Asaas) ↔ nome fantasia (Performli), vinculadas 1-para-1.
- **Saídas**: `Expense` (importadas do Asaas + 12 contas a pagar mensais migradas do ClickUp — valores ainda a completar).
- **DRE** (`/financeiro`): entradas líquidas − saídas por mês, fluxo de 6 meses, inadimplência, timestamp da última sincronização. **Somente ADMIN.**
- **Contratos** (`/juridico`): fee, vigência, responsável; cache de fee/vencimento no cliente. **Somente ADMIN.**

## 6. Tarefas (núcleo operacional)

Workspace único estilo ClickUp: status em dois níveis (campo + statusId espelhado — regra D-004), responsável principal + auxiliares espelhados (D-005), datas sempre meio-dia UTC para não escorregar de dia no fuso de SP (D-006), recorrência por regra (D-010) com clones idempotentes, dependências com detecção de ciclo, checklist com evidência, comentários com menções, Kanban/Lista com ordenação fracionária. Automação v0: notificar/atribuir por regra. Suporte é uma lista dedicada (`/suporte`).

## 7. Módulos da sidebar (o que cada um responde)

| Módulo | Pergunta que responde |
|---|---|
| Meu Dia | o que EU preciso fazer hoje/atrasado |
| Central de Tarefas | tudo que está em aberto, por status/responsável |
| Hub de Suporte | demandas do dia por cliente e urgência |
| Cockpit | a agência está saudável? o que está crítico agora? |
| Clientes / Client 360 | tudo de um cliente: KPIs, saúde, contrato, chat, interações |
| Check-ins | quais clientes tiveram check-in semanal e quais faltam |
| Validação CS | o que está esperando aprovação da CS |
| Central de Comunicação | conversas WhatsApp por cliente |
| Relatórios | relatórios semanais/mensais gerados |
| Aceite / Processos / Recorrências / Registro | operação de tráfego padronizada (POPs) |
| War Room (anti-churn) | quem está em risco de sair e qual o protocolo |
| Alertas | tudo que o sistema detectou sozinho |
| Comercial / Pipeline | funil de vendas e CRM (ADMIN) |
| Financeiro / Jurídico | DRE, inadimplência, contratos (ADMIN) |
| Metas da Agência | alvo × realizado por cliente/mês |
| Visão CEO / Visão Gestor | desempenho consolidado e por gestor |
| Equipe / Atribuições | quem cuida de qual cliente |
| Agentes IA / Conhecimento | copiloto e base de conhecimento (RAG) |

## 8. Segurança e acesso (estado atual — em evolução hoje)

- Sessão JWT em cookie httpOnly; middleware protege rotas; auditoria (`AuditLog`) nas ações críticas.
- **RBAC v2 em implantação agora** (5 papéis): ADMIN (tudo), SUPERVISOR_TRAFEGO / ANALISTA_TRAFEGO / CS (operação inteira, ZERO financeiro/comercial), GESTOR_TRAFEGO (só a carteira; em tarefas só muda status). Financeiro, Jurídico, Comercial, Equipe e Visão CEO ficam exclusivos do ADMIN, inclusive nos dados que a IA usa como contexto.

## 9. Pontos de atenção em aberto

1. **Campos de meta na ficha do cliente são letra morta** (seção 2.4) — decidir: plugar ou aposentar.
2. **12 contas a pagar** migradas do ClickUp estão com valor zerado — completar no painel.
3. Metas de **negócio local** (mensagens, ligações, agendamentos) dependem de Goal preenchida — o resultado semanal automático hoje só cobre e-commerce (ROAS).
4. Windsor está instalado mas inativo — candidato a remoção futura.
5. Primeiras faturas do mês vencem 03–06/07 — primeiro teste real da conciliação automática.

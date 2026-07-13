# PERFORMLI — Sistema Operacional Interno da Arkza

> **Frase-guia do projeto:** "Arkza em processo, não em memória."
> **Visão final:** Marcos abre UMA única tela e entende a agência inteira.

Este arquivo define as regras transversais que **todos** os agentes herdam.
Nenhum agente pode violar o que está aqui, independente da tarefa.

> **DOSSIÊ TÉCNICO (regra permanente):** `DOSSIE-PERFORMLI.md` é a fonte
> canônica. **Antes de QUALQUER ação** (nova feature, integração, correção,
> investigação de bug), consulte o dossiê primeiro. **Depois de QUALQUER
> mudança** — upgrade, correção, bug encontrado, mudança estrutural (endpoint,
> model, role, integração, env var, cron) — documente no dossiê **no mesmo
> PR/commit**: atualize a seção correspondente e registre a mudança na seção
> "15. HISTÓRICO DE MUDANÇAS". Bug encontrado e ainda não corrigido vai para a
> seção 12.3 (bugs conhecidos) até ser resolvido. Correções derivadas da
> `AUDITORIA-PERFORMLI.md` atualizam o status do achado lá também.

---

## Contexto do produto

O Performli é o sistema operacional interno da Arkza (agência de tráfego pago,
foco em e-commerce de moda e negócios locais, ~30 clientes ativos). O objetivo
é transformar o sistema na **central de comando** da agência: uma única visão
de tudo que está saudável, em atenção, crítico — e de tudo que pode quebrar
silenciosamente.

O sistema deve fazer a Arkza **deixar de depender de memória, WhatsApp,
planilhas soltas e cobranças manuais**. O objetivo de negócio por trás disso é
permitir que o Marcos saia do papel de "cérebro operacional" e migre para
CEO/comercial sem que processos críticos quebrem.

## Stack (já existente — não reinventar)

- Next.js 16 · React 19 · TypeScript
- Prisma 7 · PostgreSQL
- Auth: JWT em cookie httpOnly
- Integrações: Meta Ads, Google Ads, GA4, Nuvemshop, Asaas, Z-API/Evolution,
  Windsor, base de conhecimento (RAG), ClickUp
- Cron diário já existente
- Repositório: `marcosliossi-del/performli-sistema-geral`

## Papéis de usuário (RBAC)

| Papel    | Permissão                                              |
|----------|--------------------------------------------------------|
| ADMIN    | Acesso total                                           |
| CS       | Leitura ampla, **sem** mutações indevidas              |
| MANAGER  | Vê e altera **apenas** clientes atribuídos             |
| ANALYST  | Acesso limitado                                        |

---

## REGRAS TÉCNICAS INEGOCIÁVEIS (toda implementação)

1. Toda **leitura** passa pela camada de dados/DAL quando aplicável.
2. Toda **mutação** valida: **autenticação + papel + posse (ownership)**.
3. **NUNCA** criar bypass de autorização.
4. **NUNCA** endpoint público sem proteção.
5. **NUNCA** segredo hardcoded — usar `IntegrationSetting` para chaves dinâmicas.
6. Toda chamada externa tem **timeout**.
7. Loops de cron têm **try/catch por cliente/processo**; falha em um cliente
   **não** quebra a rotina inteira.
8. Toda automação crítica gera **log** (`AuditLog`).
9. Toda rotina recorrente registra **última execução** (`lastRunAt`).
10. Toda tela com dado crítico mostra **data/hora da última atualização**.
11. **NÃO** quebrar deploy de produção.
12. **NÃO** remover funcionalidade existente sem justificativa registrada.
13. Migrations preferencialmente **aditivas**.
14. Nenhuma tarefa é "concluída" sem **evidência mínima** (check-in preenchido,
    relatório gerado/aprovado, mensagem enviada, auditoria registrada, etc).

## REGRAS DE UX (toda tela)

Cada tela responde a SEIS perguntas, sempre:
1. O que eu preciso ver?
2. O que está errado?
3. O que eu preciso fazer agora?
4. Quem é o responsável?
5. Qual o prazo?
6. Qual o impacto se eu não fizer?

- Linguagem **operacional**, nunca técnica.
- ✅ Bom: "Fatura vencida há 6 dias", "Cliente crítico há 3 semanas",
  "War Room sem critério de saída", "Lead quente sem próximo contato".
- ❌ Proibido sem motivo: "Erro", "Pendente", "Status inválido",
  "Ação necessária". Sempre explicar o **porquê**.

---

## MODELS PRISMA EXISTENTES (verificar antes de criar qualquer novo)

User · Client · ClientAssignment · ClientInteraction · PlatformAccount ·
MetricSnapshot · Goal · HealthScore · ClientStatusStreak · ChurnRiskScore ·
CriticalProtocol · Alert · Task · Operation · WeeklyChecklist · WeeklyReport ·
MonthlyReport · CampaignSnapshot · SyncLog · AgencyLead · AgencyActivity ·
Contract · Expense · FinancialCategory · AsaasPayment · AsaasSubscription ·
KnowledgeDocument · KnowledgeChunk

> **Regra crítica:** nenhum model novo é criado sem justificativa explícita de
> por que **nenhum** dos models acima serve.

---

## SCORE DE PRIORIZAÇÃO (versão 0.30 — saída do operacional)

```
score_final =
    dependencia_marcos       * 0.30   // tirar da cabeça do Marcos é O objetivo
  + risco_falha_silenciosa   * 0.22   // processo que quebra sem ninguém ver
  + impacto_churn            * 0.20
  + valor_financeiro         * 0.13
  + volume_frequencia        * 0.10
  + chance_automacao         * 0.05
```
Cada fator é pontuado de 0 a 5. Soma dos pesos = 1.0.

---

## OS 21 POPs (7 áreas)

- **CAP** — Captação e Comercial (CAP-01, CAP-02, CAP-03)
- **ONB** — Onboarding de Cliente (ONB-04, ONB-05)
- **OPE** — Operação de Tráfego (OPE-06, OPE-07, OPE-08, OPE-09)
- **CSX** — Sucesso do Cliente (CSX-10, CSX-11, CSX-12, CSX-13)
- **WAR** — War Room e Contas Críticas (WAR-14, WAR-15, WAR-16)
- **CRM** — Automação e CRM (CRM-17, CRM-18)
- **FIN** — Financeiro (FIN-19, FIN-20, FIN-21)

---

## DIRETRIZ ESTRATÉGICA SOBRE O CLICKUP (orienta TODA decisão de arquitetura)

O objetivo do sistema **não é apenas integrar** com o ClickUp. A intenção
estratégica é que o Performli evolua para se tornar a **principal central
operacional da Arkza, substituindo gradualmente o ClickUp** nas rotinas
críticas da agência.

Hoje o ClickUp é usado para tarefas, CRM, financeiro, gestão de clientes,
recorrências e acompanhamento operacional. Mas muitos processos ainda dependem
de memória, disciplina manual, planilhas paralelas e WhatsApp.

O Performli deve nascer como **fonte única da verdade da operação**. No começo,
o ClickUp pode ser **referência, fonte de dados ou apoio temporário**. Mas a
arquitetura deve ser pensada para que, no futuro, os processos principais rodem
**dentro do Performli, sem depender do ClickUp como sistema central**.

### O Performli deve substituir, gradualmente:
Gestão de tarefas recorrentes · Check-ins semanais · Validação da CS ·
CRM comercial · Follow-ups · Onboarding de clientes · Gestão de clientes ativos ·
Controle de demandas · War Room e contas críticas · Financeiro interno ·
Contas a receber · Contas a pagar · Gestão de contratos · Comissões comerciais ·
Visão geral da agência.

### A pergunta-guia da arquitetura
NÃO é "como replicar o ClickUp dentro do Performli?", e SIM:
**"Como criar um sistema mais inteligente que o ClickUp para a realidade
específica da Arkza?"**

O Performli deve ser **menos genérico e mais operacional**. Precisa mostrar com
clareza o que o ClickUp não mostra:
- O que está atrasado
- O que está crítico
- Quem precisa agir
- Qual processo falhou
- Qual cliente está em risco
- Qual dinheiro está em risco
- Qual tarefa não tem evidência
- Qual gestor está acumulando gargalos
- Qual rotina não rodou
- Qual cliente está sem acompanhamento
- Qual lead foi esquecido
- Qual contrato está irregular
- Qual indicador piorou
- Qual decisão precisa ser tomada hoje

### Implicações práticas para os agentes
1. **Ownership do dado no Performli.** Para cada processo que vira sistema, o
   Performli é a fonte da verdade. O ClickUp pode alimentar dados de origem
   numa fase de transição, mas o estado canônico vive no PostgreSQL.
2. **Direção da sincronização.** Toda integração ClickUp deve ser classificada
   como `clickup→performli` (leitura/migração), `performli→clickup` (espelho
   temporário) ou `bidirecional` (transição). O alvo de longo prazo é reduzir
   a dependência, não aumentá-la — evite criar acoplamentos que dificultem o
   desligamento futuro do ClickUp.
3. **Estratégia de saída (exit strategy).** Cada model/feature que substitui
   uma função do ClickUp deve registrar de qual rotina do ClickUp ele assume o
   lugar, e em que fase o ClickUp deixa de ser necessário para aquela rotina.
4. **Inteligência, não cópia.** Não replicar campos genéricos do ClickUp.
   Modelar para responder às perguntas operacionais acima (atraso, criticidade,
   responsável, evidência, gargalo, dinheiro em risco), que o ClickUp não
   responde com clareza.

---

## ÁREA DE CLIENTES (portal externo)

Portal do lojista em `/portal` (docs completas: `docs/AREA_CLIENTES.md`).
Convenções INEGOCIÁVEIS desta área:

1. **Namespace de auth separado.** NUNCA adicionar `CLIENT` ao enum `Role`.
   Auth do portal usa cookie próprio `performli_portal` + model
   `ClientPortalUser` (`src/lib/portal/session.ts`).
2. **Guard obrigatório.** Toda página/action do portal chama
   `getAuthorizedClient()` no topo. O middleware é a primeira barreira, não a
   única. `clientId` JAMAIS vem de param/body/header — só da sessão assinada.
3. **Toda query do portal filtra `clientId` explicitamente** (defesa em
   profundidade, mesmo com o guard).
4. **Cache sempre com `clientId` na chave** (padrão: `unstable_cache` com
   `['portal-kpis', clientId, period]`).
5. **KPIs só via `src/lib/portal/kpi-registry.ts`.** Nunca hardcode KPI em
   componente; dado que não existe no schema NÃO é inventado — vira pendência
   documentada em `docs/AREA_CLIENTES.md`.

---

## FLUXO DE AGENTES (orquestração)

```
maestro → auditor-codigo       (read-only)
maestro → mapeador-pops        (read-only)
maestro → analista-lacunas     (read-only)   ── GATE: escopo aprovado?
maestro → arquiteto-dados      (read-only)
maestro → arquiteto-produto    (read-only)   ── GATE: design aprovado?
maestro → backend-dal + frontend + cron + ia (escrita)
maestro → guardiao             (read-only)   ── GATE: segurança/QA/regressão
            └─ APROVADO → próxima fatia | REPROVADO → volta ao agente
```

Nenhum agente de **escrita** roda antes de auditoria + lacunas + arquitetura
aprovadas. O `guardiao` reprova e devolve — ele **nunca** conserta.

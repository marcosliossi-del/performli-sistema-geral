# PERFORMLI — Sistema Operacional Interno da Arkza

> **Frase-guia do projeto:** "Arkza em processo, não em memória."

Este arquivo define as regras transversais que **todos** os agentes herdam.
Nenhum agente pode violar o que está aqui, independente da tarefa.

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
  Windsor, base de conhecimento (RAG)
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

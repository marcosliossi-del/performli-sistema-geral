# Proposta de Telas — Performli

**Data:** 2026-06-30
**Versão:** 1.0
**Agente:** arquiteto-produto
**Base:** `docs/mapa-lacunas.md` · `docs/proposta-schema.md`

> Toda tela responde às 6 perguntas (CLAUDE.md): o que vejo / o que está errado /
> o que faço agora / quem é responsável / qual prazo / qual impacto se não fizer.
> Linguagem **operacional**, nunca técnica. Proibido "Erro/Pendente/Status
> inválido/Ação necessária" sem explicar o porquê.

---

## 1. `/cockpit` — Central de comando da Arkza

```json
{
  "rota": "/cockpit",
  "objetivo": "Em 30 segundos: o que está saudável, em atenção, crítico — e o que pode quebrar hoje.",
  "tipo": "nova",
  "controle_de_acesso": "ADMIN, CS (visão total) · MANAGER/ANALYST (escopo dos clientes atribuídos)",
  "ultima_atualizacao_visivel": true,
  "cabecalho": "Faixa fixa com 'Dados atualizados às HH:MM (último sync diário)' — vermelho se > 26h.",
  "cards_ou_blocos": [
    {
      "titulo_operacional": "Clientes críticos hoje",
      "fonte_de_dado": "HealthScore (status RUIM) + CriticalProtocol (status != ENCERRADO)",
      "responde": {
        "o_que_aconteceu": "N clientes em RUIM ou com War Room aberta",
        "por_que_importa": "Cada crítico é MRR em risco de cancelamento",
        "quem_responsavel": "Gestor primário + CS",
        "acao_agora": "Abrir War Room / revisar protocolo",
        "prazo": "Hoje",
        "impacto_se_nao": "Crítico há 3+ semanas escala para Marcos"
      },
      "acao_clicavel": "Ver lista → /anti-churn"
    },
    {
      "titulo_operacional": "Clientes sem check-in esta semana",
      "fonte_de_dado": "WeeklyChecklist (ausência na semana corrente) por cliente ativo",
      "responde": {
        "o_que_aconteceu": "N clientes sem check-in preenchido",
        "por_que_importa": "Sem check-in não há prestação de contas nem visibilidade de resultado",
        "quem_responsavel": "Gestor do cliente",
        "acao_agora": "Cobrar gestor / preencher",
        "prazo": "Quarta 18h",
        "impacto_se_nao": "2 semanas sem check-in = sinal de churn"
      },
      "acao_clicavel": "Ver fila → dashboard de check-ins"
    },
    {
      "titulo_operacional": "Check-ins reprovados aguardando correção",
      "fonte_de_dado": "WeeklyChecklist (status reprovado) — CSX-10",
      "responde": {
        "o_que_aconteceu": "N check-ins reprovados pela CS",
        "por_que_importa": "Check-in ruim chega ao cliente e destrói percepção de valor",
        "quem_responsavel": "Gestor que preencheu",
        "acao_agora": "Corrigir em 24h",
        "prazo": "24h após reprovação",
        "impacto_se_nao": "Relatório atrasa / qualidade cai"
      },
      "acao_clicavel": "Ver reprovados → fila CS"
    },
    {
      "titulo_operacional": "Demandas atrasadas",
      "fonte_de_dado": "Task/Operation (dueDate < hoje, status != DONE) — CSX-11",
      "responde": {
        "o_que_aconteceu": "N demandas com prazo vencido",
        "por_que_importa": "Demanda atrasada reincidente gera insatisfação",
        "quem_responsavel": "Responsável de cada tarefa",
        "acao_agora": "Concluir com evidência / repactuar prazo",
        "prazo": "Conforme SLA (D+3 alerta, D+7 escala)",
        "impacto_se_nao": "Escala para ADMIN em D+7"
      },
      "acao_clicavel": "Ver atrasadas → /tasks?filtro=atrasadas"
    },
    {
      "titulo_operacional": "Faturas vencidas",
      "fonte_de_dado": "AsaasPayment (status OVERDUE) — FIN-19",
      "responde": {
        "o_que_aconteceu": "N faturas vencidas, R$ X total em aberto",
        "por_que_importa": "Inadimplência é receita já contratada e não recebida",
        "quem_responsavel": "ADMIN (cobrança)",
        "acao_agora": "Disparar régua de cobrança",
        "prazo": "D+3 alerta, D+15 sugere pausa",
        "impacto_se_nao": "D+30 escala para Marcos + risco de churn"
      },
      "acao_clicavel": "Ver inadimplentes → /financeiro"
    },
    {
      "titulo_operacional": "MRR previsto vs realizado",
      "fonte_de_dado": "AsaasSubscription (previsto) × AsaasPayment confirmado (realizado) — FIN-21",
      "responde": {
        "o_que_aconteceu": "MRR previsto R$ X · realizado R$ Y (Z% de gap)",
        "por_que_importa": "Gap entre previsto e realizado = inadimplência ou churn não contabilizado",
        "quem_responsavel": "ADMIN",
        "acao_agora": "Investigar gap se > 10%",
        "prazo": "Revisão semanal (segunda)",
        "impacto_se_nao": "Decisão financeira sobre dado errado"
      },
      "acao_clicavel": "Detalhar → /financeiro"
    },
    {
      "titulo_operacional": "Margem do mês",
      "fonte_de_dado": "Receita confirmada − Expense categorizada — FIN-20/21",
      "responde": {
        "o_que_aconteceu": "Margem atual R$ X (W% da receita)",
        "por_que_importa": "Margem abaixo da meta compromete a operação",
        "quem_responsavel": "ADMIN",
        "acao_agora": "Revisar despesas se margem < meta",
        "prazo": "Mensal",
        "impacto_se_nao": "Crescimento sem lucro"
      },
      "acao_clicavel": "Ver DRE → /financeiro"
    },
    {
      "titulo_operacional": "Contratos vencendo em 30 dias",
      "fonte_de_dado": "Contract (status VIGENTE, fim < 30d) — contract-expiry-checker",
      "responde": {
        "o_que_aconteceu": "N contratos vencem em até 30 dias",
        "por_que_importa": "Contrato vencido sem renovação = cliente sem amarração",
        "quem_responsavel": "ADMIN + gestor",
        "acao_agora": "Iniciar renovação",
        "prazo": "Antes do vencimento",
        "impacto_se_nao": "Cliente opera sem contrato"
      },
      "acao_clicavel": "Ver contratos → /juridico"
    },
    {
      "titulo_operacional": "Clientes em onboarding / primeiros 30 dias",
      "fonte_de_dado": "Client (status ONBOARDING ou startDate < 30d) — ONB-05",
      "responde": {
        "o_que_aconteceu": "N clientes novos em acompanhamento intensivo",
        "por_que_importa": "Primeiros 30 dias = maior risco de churn precoce",
        "quem_responsavel": "Gestor + CS",
        "acao_agora": "Verificar milestones (metas, 1º check-in, revisão dia 30)",
        "prazo": "Marcos do onboarding",
        "impacto_se_nao": "Onboarding mal feito = churn em 60-90 dias"
      },
      "acao_clicavel": "Ver onboardings → /clientes?filtro=onboarding"
    },
    {
      "titulo_operacional": "Próxima ação do dia",
      "fonte_de_dado": "Agregação priorizada de todos os alertas/SLAs vencidos por urgência",
      "responde": {
        "o_que_aconteceu": "A ação de maior impacto pendente agora",
        "por_que_importa": "Tira do Marcos a decisão de 'por onde começo'",
        "quem_responsavel": "Quem o card indicar",
        "acao_agora": "Executar a ação destacada",
        "prazo": "Hoje",
        "impacto_se_nao": "Maior risco financeiro/churn fica parado"
      },
      "acao_clicavel": "Ir para o item"
    }
  ]
}
```

---

## 2. `/processos` — Catálogo vivo dos 21 POPs

```json
{
  "rota": "/processos",
  "objetivo": "Marcos vê quais processos JÁ estão sistematizados e quais ainda dependem de memória/pessoas.",
  "tipo": "nova",
  "controle_de_acesso": "ADMIN, CS",
  "ultima_atualizacao_visivel": true,
  "fonte_catalogo": "src/lib/pops-catalog.ts (estático) + status derivado em runtime",
  "cards_ou_blocos": [
    {
      "titulo_operacional": "POP card (1 por processo, agrupado pelas 7 áreas)",
      "fonte_de_dado": "pops-catalog + lastRunAt (SyncLog/cron) + nº de alertas + existência de rotina",
      "campos_exibidos": [
        "Código + nome (ex.: WAR-14 — Abertura de War Room)",
        "Área (CAP/ONB/OPE/CSX/WAR/CRM/FIN)",
        "Status de implementação: Manual · Parcial · Automatizado",
        "Nível de automação (0-100%)",
        "Última execução / Próxima execução",
        "Responsável padrão",
        "SLA",
        "Risco se falhar (operacional, não técnico)",
        "Score de priorização (0.30)"
      ],
      "responde": {
        "o_que_aconteceu": "Status atual do processo no sistema",
        "por_que_importa": "Processo manual = ainda depende da memória de alguém",
        "quem_responsavel": "Responsável padrão do POP",
        "acao_agora": "Para POPs 'Manual' de alto score: priorizar sistematização",
        "prazo": "Conforme roadmap de fases",
        "impacto_se_nao": "Processo de alto score continua na cabeça do Marcos"
      },
      "acao_clicavel": "Abrir detalhe do POP (frase de sistema, fluxo, dependências, histórico de falhas)"
    }
  ],
  "ordenacao": "Por score de priorização desc, destacando 'Manual + score alto' em vermelho (onde Marcos ainda é gargalo)."
}
```

---

## 3. `/clientes/[slug]` — Client 360 (ampliação)

```json
{
  "rota": "/clientes/[slug]",
  "objetivo": "Fonte única de verdade: 'o que está acontecendo com esse cliente?' responde-se aqui.",
  "tipo": "ampliacao",
  "controle_de_acesso": "ADMIN/CS (todos) · MANAGER (só atribuídos) · ANALYST (limitado)",
  "ultima_atualizacao_visivel": true,
  "ja_existe": "Página de 734 linhas com KPIs, gráficos, funil, chat, timeline (auditoria área 2).",
  "blocos_a_adicionar": [
    {
      "titulo_operacional": "Próxima ação obrigatória",
      "fonte_de_dado": "Agregação: War Room aberta / check-in pendente / fatura vencida / demanda atrasada do cliente",
      "responde": {
        "o_que_aconteceu": "A pendência mais urgente deste cliente",
        "por_que_importa": "Concentra a decisão num só lugar",
        "quem_responsavel": "Gestor/CS conforme a pendência",
        "acao_agora": "Executar",
        "prazo": "Do item",
        "impacto_se_nao": "Do item"
      },
      "acao_clicavel": "Resolver"
    },
    {
      "titulo_operacional": "Status da War Room (se ativa)",
      "fonte_de_dado": "CriticalProtocol (status, exitCriteria, deadline, responsibleId, escalatedAt)",
      "responde": {
        "o_que_aconteceu": "War Room aberta há N dias — critério de saída: <texto>",
        "por_que_importa": "Conta crítica sem critério de saída não fecha nunca",
        "quem_responsavel": "Responsável do protocolo",
        "acao_agora": "Registrar diagnóstico / avançar status",
        "prazo": "deadline do protocolo",
        "impacto_se_nao": "3 semanas → escala para Marcos"
      },
      "acao_clicavel": "Abrir War Room"
    },
    {
      "titulo_operacional": "Onboarding / primeiros 30 dias (se cliente novo)",
      "fonte_de_dado": "Client.startDate + milestones (ONB-05)",
      "responde": {
        "o_que_aconteceu": "Dia X de 30 — milestones cumpridos/pendentes",
        "por_que_importa": "Janela crítica de retenção",
        "quem_responsavel": "Gestor + CS",
        "acao_agora": "Cumprir próximo milestone",
        "prazo": "Datas dos marcos",
        "impacto_se_nao": "Churn precoce"
      },
      "acao_clicavel": "Ver checklist de onboarding"
    }
  ]
}
```

---

## Componentes reutilizáveis (não duplicar)

| Componente | Uso | Já existe? |
|---|---|---|
| `OperationalCard` | Card padrão com as 6 respostas + ação clicável | **criar** (base do cockpit) |
| `LastUpdatedBadge` | Selo 'atualizado às HH:MM', vermelho se stale | **criar** |
| `StatusBadge` | OTIMO/REGULAR/RUIM/CRÍTICO | reusar `components/ui/badge` |
| `ProtocolCard` | Card de War Room | **ampliar** (já existe em anti-churn) |
| `SLABadge` | 'atrasado há N dias' | **criar** |

---

## Critério de aceite (arquiteto-produto)
- [x] `/cockpit` especificado em nível de card (10 cards, cada um com 6 respostas + ação).
- [x] `/processos` especificado (catálogo vivo, status de implementação, destaque ao gargalo).
- [x] Client 360 ampliação especificada (próxima ação, War Room, onboarding).
- [x] Linguagem operacional em todos os títulos (zero "Erro/Pendente" sem motivo).
- [x] Componentes reutilizáveis mapeados (não duplicar cards).

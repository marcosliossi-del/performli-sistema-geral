# PROJECT_STATE — Performli (estado do maestro)

> Log de orquestração. Mantido pelo `maestro`. Decisões técnicas = append-only.

**Última atualização:** 2026-06-30

---

## FASE_ATUAL
Fase 2 (build) — fatias mescladas no `main` (deploy de produção):
- #16 docs · #17 WAR-14 · #18 WAR-16 · #19 Cockpit · #20 FIN-19 · #21 CSX-13 — **MERGED**.
- Fatia #7 (OPE-06) — entregue ao guardião (branch feat/pop-ope-06, PR a abrir).
Fórmula de score confirmada pelo usuário: **0.30** (mantida). Agentes .md: não sincronizar.

## POPS_MAPEADOS (21 — ranking 0.30)
Top-8 MVP: WAR-14 (4.52) · WAR-16 (4.47) · FIN-19 (4.45) · CSX-13 (4.40) ·
OPE-06 (4.39) · CSX-12 (4.32) · CRM-18 (4.19) · ONB-05 (4.09). Detalhe em
`docs/mapa-pops.md`.

| POP | Status no sistema |
|---|---|
| WAR-14 | **EM PRODUÇÃO (merged #17)** |
| WAR-16 | **EM PRODUÇÃO (merged #18)** |
| Cockpit | **EM PRODUÇÃO (merged #19)** |
| FIN-19 | **EM PRODUÇÃO (merged #20)** |
| CSX-13 | **EM PRODUÇÃO (merged #21)** |
| OPE-06 | **EM PRODUÇÃO (merged #22)** |
| /processos | **EM REVISÃO (catálogo vivo dos 21 POPs, branch feat/processos)** |
| demais 15 | mapeados, aguardando fatia |

## MODELS NOVOS (cumulativo)
- `AuditLog` (WAR-14) · `WarRoomOutcome` enum (WAR-14)
- `ClientWeeklyCheckin` + `CheckinStatus` enum (OPE-06) — check-in por cliente
  com workflow de validação da CS. Justificativa: `WeeklyChecklist` é por-gestor.

## LACUNAS_IDENTIFICADAS
`docs/mapa-lacunas.md`. 1 JÁ_EXISTE · 15 PARCIAL · 5 INEXISTENTE.
Gap dominante: camada operacional de visibilidade/validação/escalação.

## MODELS_APROVADOS (novos)
- `AuditLog` — criado (fatia WAR-14). Transversal, append-only.
- `WarRoomOutcome` (enum) — criado (fatia WAR-14).
- `CriticalProtocol` — estendido (aditivo): diagnosis, exitCriteria, exitMetric,
  exitTarget, exitMetAt, responsibleId, deadline, escalatedAt, closedOutcome.
- `WarRoomDecision` — PROPOSTO (Fase 2, WAR-15). Não criado.
- Rejeitados/adiados: ver `docs/proposta-schema.md`.

## TELAS_APROVADAS
Especificadas em `docs/proposta-telas.md`: `/cockpit`, `/processos`,
`/clientes/[slug]` (ampliação). Implementado nesta fatia: ampliação de `/anti-churn`
com `WarRoomPlanPanel`.

## DECISOES_TECNICAS (append-only)
- 2026-06-30 — Score 0.30 (saída do operacional) como critério de priorização.
- 2026-06-30 — Fatia #1 = WAR-14 (maior score, model-base já existe, baixo risco).
- 2026-06-30 — Extensão de `CriticalProtocol` em vez de novo `WarRoomExitCriteria`
  (critério único cabe em campos aditivos; evita duplicação).
- 2026-06-30 — `AuditLog` criado como model transversal (exigência CLAUDE.md #8).
- 2026-06-30 — `/processos` será catálogo estático (`pops-catalog.ts`), não model.
- 2026-06-30 — Escalação de 3 semanas implementada já na fatia WAR-14 (fecha o
  caminho crítico do POP), com idempotência via `escalatedAt`.

## BLOQUEIOS_ATIVOS
- **Build não verificável localmente** (node_modules vazio, registry npm 403).
  Gate obrigatório: Vercel CI verde antes de qualquer merge.
- Pré-existente: `src/app/actions/protocols.ts` valida só auth (sem posse).
  Recomendada fatia de correção de segurança.

## CENTRAL OPERACIONAL (nova direção — prompt em 7 blocos)
- Decisões do usuário: check-in migra para Task (A); enums Task substituídos+backfill; execução contínua.
- **BLOCO 1** (fundação) — branch feat/bloco1-central-operacional: Task estendido +
  24 models (hierarquia Área→POP→Lista→Tarefa, templates, recorrência, automação,
  campos personalizados, atividade, dependências, aprovação) + enums novos +
  troca TaskStatus/TaskPriority (backfill) + seed 7 áreas/21 POPs + TaskActivity nas actions.
- Próximos: BLOCO 2 (UI Central), 3 (templates+recorrência+cron), 4 (integração), 5 (POPs), 6 (automações), 7 (IA+KPIs).

- **BLOCO 1** — MERGED (#24, em produção). Migration aplicada (enum swap + 24 models + seed). Build com retry de migrate (cold-start Neon).
- **BLOCO 2** (Central de Tarefas / UI) — branch feat/bloco2-central-tarefas: página /operacional (KPIs + 4 views Lista/Kanban/Responsável/Cliente + filtros), NovaTarefaModal (autofill do cliente, área/POP, checklist), TaskDrawer (status/checklist/comentários/atividade). DAL getOperacionalBoard + getNovaTarefaContext; actions createOperacionalTask/addTaskComment/toggleChecklistItem/loadTaskDetail.

- **BLOCO 2** — MERGED (#25, em produção). /operacional (4 views + criação + drawer).
- **BLOCO 3** (templates + recorrência + cron) — branch feat/bloco3-recorrencia:
  motor recurrence-engine (fan-out por cliente ativo, idempotente por
  template+cliente+janela, AutomationLog por resultado), rota /api/cron/recurrences
  (CRON_SECRET, ?force=1), seed do template recorrente Check-in (OPE-06, semanal
  segunda, checklist), vercel.json com novo cron.

- **BLOCO 3** — MERGED (#26, em produção). Motor de recorrência + cron + template OPE-06.
- **BLOCO 4** (visões por papel) — branch feat/bloco4-views-papel:
  página /meu-dia ("Meu Dia · Minha Semana": tarefas próprias agrupadas por
  urgência — atrasadas/hoje/esta semana/depois/sem prazo + "Carga por gestor"
  para ADMIN/CS, com flag de gargalo). DAL getMinhaSemana, getGestoresCarga,
  getClienteTarefas. Bloco de tarefas operacionais na página do cliente
  (abertas + concluídas recentes, role-scoped por posse). Nav + middleware atualizados.

- **BLOCO 5** (POPs críticos, um por vez) — branch feat/bloco5-pop-checkin-ope06:
  - **OPE-06 Check-in semanal completo**: fluxo de validação na própria Task.
    Gestor preenche checklist + evidência e envia (submitTaskForValidation →
    AGUARDANDO_CS, exige itens obrigatórios + evidência ≥5 chars, só responsável/ADMIN).
    CS valida (decideTaskValidation): Aprovar → CONCLUIDO (completedAt/By) ou
    Solicitar ajustes → AJUSTES_SOLICITADOS (motivo obrigatório, só CS/ADMIN).
    TaskApproval registra cada decisão; TaskActivity + AuditLog. UI no TaskDrawer
    (painel "Validação da CS" com evidência, botões por papel, histórico de decisões).
    loadTaskDetail estendido (status/evidence/requiredOpen/canSubmit/canValidate/approvals).
    Reaproveitável para CSX-10 (validação da CS). /check-ins antigo mantido (regra 12).

  - **OPE-07 Prestação de contas semanal**: seed do template TPL-OPE-07
    (recorrência semanal quarta-feira, 5 passos — consolidar, gerar relatório,
    enviar ao cliente, confirmar recebimento, registrar próxima ação;
    evidência obrigatória, SLA 24h). Roda no motor de recorrência existente
    (fan-out por cliente, idempotente) e usa o mesmo fluxo de validação da CS
    do OPE-06. Migration aditiva (só INSERT idempotente).

## FASE FINAL — REDESIGN UX (pós-BLOCO 7, solicitado pelo usuário)
Após concluir todos os blocos da Central Operacional, fazer um overhaul de UX:
- Layout mais otimizado, fluido e **semelhante ao ClickUp** (densidade, navegação, hierarquia visual).
- Tipografia moderna, clean e objetiva (fontes mais sofisticadas).
- Liberdade para **revisar paleta de cores e fonte** buscando um ar mais sofisticado.
- Manter todas as regras de UX operacional do CLAUDE.md (cada tela responde às 6 perguntas).

  - **CSX-10 Validação da CS**: fila de validação dedicada (/validacoes).
    DAL getValidationQueue (tarefas AGUARDANDO_CS/EM_VALIDACAO, role-scoped:
    CS/ADMIN veem tudo e decidem, MANAGER vê as dos seus clientes p/ acompanhar;
    calcula dias de espera e progresso do checklist). Componente ValidationQueue
    (lista expansível com evidência, aprovar/solicitar ajustes inline, reusa
    decideTaskValidation; destaca itens esperando 3+ dias). Página com KPIs.
    Nav (PRINCIPAL, visível a ADMIN/CS/MANAGER) + middleware. Sem model novo.

  - **WAR-14 War Room → Central Operacional**: War Room (CriticalProtocol) já
    existia (plano/encerramento/revisão/painéis). Conectado ao Task: ao salvar
    o plano, cria/atualiza Task WAR_ROOM CRÍTICA do responsável (idempotente por
    `warroom:<protocolId>`, popId pop_war_14, dueDate=prazo) — aparece em
    /operacional, /meu-dia e na carga por gestor. Ao encerrar a War Room, a tarefa
    espelho fecha (CONCLUIDO se positivo, senão CANCELADO). Sem model novo.

## DESIGN SYSTEM TRAVADO (Etapa A — do protótipo aprovado do usuário)
Arquivos versionados: docs/ux/PROMPT_UX_DESIGN_SYSTEM_ARKZA.md + docs/ux/prototipo_ux_arkza.html.
Usuário deu AUTONOMIA TOTAL (sem checkpoints) — aplicar direto na fase de redesign.
Tokens definidos (NÃO clonar ClickUp, sem roxo ClickUp como primária):
- Superfícies: --surface-0 #0c1014 / -1 #121820 / -2 #19212b / -3 #212c38
- Bordas: --border #26323f / --border-soft #1c2530
- Texto: hi #e8eef4 / mid #9fb0c0 / low #637284
- Marca (ciano-petróleo): --brand #1fb6c9 / strong #3fd0e0 / dim rgba(31,182,201,.14)
- Status: todo #7c8da0 · doing #3d8bff · wait #d9a23b · valid #9b7cff · block #e0625b ·
  late #ff5470 · done #2fbf71 · cancel #4a5563 · critical #ff3b4e
- Prioridade: low #5b6b7c · mid #3d8bff · high #f0922b · crit #ff3b4e
- Raio: 12px (sm 8px)
- Fontes: UI = Inter; números/mono = JetBrains Mono (tabular p/ métricas/SLA/datas)
Etapas do prompt: A tokens+componentes base → B shell/sidebar hierárquica/topbar/views bar
→ C views (Lista inline-edit, Kanban DnD, Calendário) + drawer de tarefa + quick-add.
PLANO: terminar blocos funcionais (POPs restantes + 6 + 7), depois redesign aplicando
estes tokens (globals.css + tailwind.config) e evoluindo componentes existentes.

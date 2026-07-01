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

## REDESIGN UX — INÍCIO (fase final, autônoma, direção Apple/iOS)
- Branch feat/ux-redesign-apple. Usuário pediu "produto iOS", dinâmico/inovador.
- **Slice 1 — Skin global (globals.css):** reescrita da camada de tokens p/ paleta
  Arkza Apple (superfícies #0a0e13→#1e2832, marca ciano #22c2d6/#54e0ee, status
  iOS), fonte SF-first (-apple-system → Inter fallback), fundo dinâmico (malha de
  gradiente .ak-app-bg), .card com profundidade (raio 18 + sombra), vidro fosco
  (.ak-glass / .ak-sidebar / .ak-topbar), scrollbar macOS. OVERRIDE das classes
  de cor arbitrárias mais usadas (sky #95BBE2 → ciano em todas as variantes;
  superfícies/bordas/textos/status remapeados) — retematiza telas existentes sem
  editar cada arquivo. Regras sem @layer vencem as utilities do Tailwind v4.
- Shell: Sidebar (ak-sidebar + logo ciano), TopNav (ak-topbar), DashboardShell
  (ak-app-bg). Próximos slices: primitivos (Button gradient, segmented control),
  telas-herói (Cockpit/Operacional/Meu Dia) com densidade e drawer estilo protótipo.

- **Slice 2 — Navegação + primitivos (igual ao protótipo):** Sidebar reestruturada
  na IA do protótipo (PRINCIPAL: Meu Dia/Central de Tarefas/Cockpit/Dashboard ·
  ÁREAS: Check-ins/Validação CS/Processos/War Room/Comercial/Pipeline/Financeiro/
  Onboarding · CLIENTES · INTELIGÊNCIA · VISÕES POR PAPEL). Contadores de pendência
  por item (DAL getSidebarCounts: meuDia/abertas/checkins/validacoes/warRooms/
  alertas, role-scoped) com badge vermelho quando alerta. NavItem com barra ativa
  ciano (gradiente+glow), prefetch p/ navegação rápida, active-scale. Button com
  gradiente ciano + active-scale; segmented control iOS nas views do Operacional;
  KPIs com ak-lift + números tabulares. Próximo: drawer de task no formato do
  protótipo (breadcrumb, 2 colunas, checklist obrigatório, evidência, footer).

- **Slice 3 — Drawer de task (igual ao protótipo):** TaskDrawer reescrito no
  layout Apple: breadcrumb (Área ▸ Lista ▸ POP), título grande, linha
  status/prioridade/cliente; corpo em 2 colunas (principal: Descrição, Checklist
  obrigatório com selo vermelho "obrigatório", Evidência, histórico de decisões CS,
  abas Comentários/Atividade/Anexos; lateral: Status, Responsável, Observadores,
  Solicitante, Data do pedido, Início, Prazo, SLA, Área, Tipo, Tags); rodapé com
  "N campos obrigatórios pendentes" + ações por papel (Enviar para CS / Aprovar /
  Ajustes / Concluir — Concluir desabilitado se há obrigatórios pendentes).
  Slide com mola (.ak-drawer) + scrim com blur (.ak-scrim). loadTaskDetail estendido
  com TaskMeta (descrição, sla, datas, área/lista/pop, observadores, solicitante, tags).
  Mantém todas as ações existentes.

- **Slice 4 — View Lista/Kanban (igual ao protótipo):** OperacionalBoard reescrito.
  Lista = tabela densa (card) agrupada por status (header colapsável com contador),
  colunas Tarefa · Cliente (ponto de saúde) · Resp. (avatar com iniciais/cor) ·
  Status (badge com ponto) · Prioridade (bandeira) · Prazo (relativo, vermelho se
  atrasado) · SLA (chip ok/warn/over). Linha crítica com faixa vermelha. Kanban =
  colunas por status com cards (ak-lift), coluna crítica (BLOQUEADO/ATRASADO)
  destacada em vermelho. Views Por gestor/Por cliente reusam a tabela. DAL
  getOperacionalBoard estendido (clientHealth via statusStreak + slaHours/slaBreached).

## AUTOMAÇÃO RESULTADO (ROAS/GA4) — trilha funcional
- **Slice Resultado v1** — branch feat/resultado-roas-cron:
  - Schema (aditivo): enums ClientResultado (OTIMO/BOM/REGULAR/RUIM/PESSIMO) e
    ClientEtapa (ESCALA/MONITORAMENTO/OTIMIZACAO); Client ganha resultado, etapa,
    resultadoRoas, resultadoWeek (idempotência), resultadoUpdatedAt.
  - Motor src/services/resultado-engine.ts: para cada cliente ECOMMERCE ativo,
    soma faturamento GA4 (conversionValue) + investimento (spend das plataformas
    de anúncio) da última semana DOM–SÁB (getWeekRange(hoje-7d)) → ROAS → compara
    com meta de ROAS (Goal metric=ROAS, senão default 2.0) → Resultado e Etapa
    (Ótimo=Escala; Bom/Regular=Monitoramento; Ruim/Péssimo=Otimização). Ruim/
    Péssimo gera Alert (reusa ROAS_BELOW_TARGET_2W, sem duplicar na semana).
    Idempotente por resultadoWeek; try/catch por cliente; AutomationLog por resultado.
  - Rota /api/cron/resultados (CRON_SECRET, ?force=1) + cron segunda 9h UTC (vercel.json).
  - Pendente: surfacing na carteira (coluna Resultado/Etapa) — próximo slice.

  - **Slice Resultado surfacing** — branch feat/resultado-surfacing: colunas
    Resultado (badge colorido Ótimo→Péssimo + ROAS da semana) e Etapa (badge
    Escala/Monitoramento/Otimização) na tabela /clients; tooltip com data da
    última atualização; LOCAL = "manual", ecommerce sem dado = "aguardando".

## POPs FUNCIONAIS — continuação
- **FIN-19**: já estava completo (/financeiro DRE: entradas/saídas, lucro, margem,
  MRR, inadimplência, Contas a Pagar via Expense, fila de cobrança, inadimplencia-checker).
  Não refeito.
- **ONB-04 Onboarding** — branch feat/onb-04-onboarding: ao criar cliente
  (createClient), gera Task ONBOARDING (ALTA, área onboarding, pop_onb_04, prazo 7d,
  SLA 168h) com checklist (acessos, vincular contas, rastreamento, kickoff, metas,
  1ª campanha), atribuída ao gestor primário. Idempotente (onboarding:<clientId>),
  best-effort (try/catch — não quebra a criação). Entra em /operacional e /meu-dia.
  ONB-05 (30 dias) será gerada por evento no BLOCO 6.

- **CAP-01 Follow-up comercial** — branch feat/cap-01-followup: service
  lead-followup-checker (cron diário). Leads em negociação ativa (EM_CONTATO→
  PROPOSTA_ACEITA) sem atividade há 3+ dias e sem follow-up aberto → gera Task
  FOLLOWUP (ALTA, area_comercial, pop_cap_01, leadId vinculado, prazo 1d) atribuída
  ao usuário da última atividade (fallback ADMIN). Idempotente (follow-up aberto +
  chave por lead/dia), try/catch por lead, AutomationLog. Sem model novo.

## BLOCO 6 — Automações por evento — branch feat/bloco6-eventos
- (a) ONB-05: ao CONCLUIR a tarefa de onboarding (pop_onb_04) em updateTaskStatus,
  gera Task de acompanhamento 30 dias (pop_onb_05, checklist, prazo 30d), idempotente
  (onboarding-30d:<clientId>), best-effort.
- (b) Escalonamento (task-escalation, cron diário): tarefa aberta atrasada 2+ dias
  sem tag "escalado" → sobe prioridade p/ ALTA, tag escalado, delayReason, atividade
  'escalated'. Idempotente pela tag.
- (c) Plano de ação: no resultado-engine, Resultado RUIM/PESSIMO (além do alerta)
  gera Task DEMANDA_INTERNA "Plano de ação (Otimização)" p/ o gestor primário
  (pop_ope_08, checklist diagnóstico/ajuste/meta/acompanhar, prazo 3d), idempotente
  (otimizacao:<clientId>:<semana>).

## BLOCO 7 — IA + KPIs de aceite (último)
- **Slice 7.1 — Aceite Operacional** — branch feat/bloco7-kpis-aceite:
  DAL getAceiteOperacional (role-scoped) cruza sinais de integridade: tarefas
  atrasadas, concluídas sem evidência (OPE-06/07), War Room sem critério, leads
  quentes parados (3+ dias), clientes sem gestor, rotinas que não rodaram (recurrence
  lastRunAt > 8d/null), falhas de automação (24h). Página /aceite com agrupamento
  Crítico/Atenção/Sob controle — cada sinal responde o quê/porquê/ação/link.
  Nav (PRINCIPAL, ADMIN/CS/MANAGER) + middleware.

- **Slice 7.2 — IA operacional (plano de ação)** — branch feat/bloco7-ia-plano:
  action generatePlanoAcao(clientId) reusa getClientAIContext (dados reais) +
  resultado/etapa/War Room, chama Anthropic (claude-sonnet-4-6), retorna
  diagnóstico + causa provável + risco + 3-5 ações concretas com prazo (JSON,
  sem inventar métrica). Valida papel+posse. Componente PlanoAcaoPanel (botão
  "Sugerir plano de ação") na página do cliente (destaque quando saúde RUIM).
  Depende de ANTHROPIC_API_KEY em runtime (não bloqueia build).

## SIDEBAR — reorganização por departamentos (pedido do usuário)
- branch feat/sidebar-departamentos: navegação reagrupada por DEPARTAMENTO estilo
  ClickUp, cada um colapsável independente (Record<string,boolean>):
  PRINCIPAL (Meu Dia/Central de Tarefas/Cockpit/Aceite) · COMERCIAL (Pipeline/CRM/
  Onboarding) · OPERAÇÃO (Check-ins/Registro/Processos) · SUCESSO DO CLIENTE
  (Clientes/Validação CS/Anti-churn & War Room/Relatórios) · FINANCEIRO (DRE/Jurídico)
  · ADMINISTRATIVO (Visão Geral/Metas/Gestores/Equipe) · INTELIGÊNCIA & DADOS
  (Alertas/Agentes IA/Base de Conhecimento/Painel Analítico).
- Duplicidades removidas: "Minhas Tarefas" (/tasks) — coberto por Meu Dia+Central;
  "Dashboard" demovido p/ "Painel Analítico" em Inteligência (Cockpit é o comando);
  "War Room" e "Anti Churn" unificados em um item. Logo aponta p/ /cockpit.

## PENDÊNCIAS MENORES
- **(A) Resultado na página do cliente** — branch feat/resultado-cliente-page:
  query própria leve (resultado/etapa/resultadoRoas/resultadoUpdatedAt) no
  Promise.all da página; strip "Resultado da semana" (badge colorido + Etapa +
  ROAS + data automática) perto do topo, só quando há resultado calculado.

## POLIMENTO UX (aproximar do protótipo) — branch feat/ux-polish
- globals.css: seleção ciano; títulos h1/h2/h3 com tracking apertado; linha de
  brilho no topo dos cards (.card::after vibrancy); .ak-dot (glow) + .ak-pulse
  (pulso crítico); campos com raio consistente; foco visível ciano (a11y).
- OperacionalBoard StatusBadge: pontos com glow, pulso nos status críticos
  (BLOQUEADO/ATRASADO).

## TAREFA FINAL (quando a fila zerar) — AUDITORIA + DOSSIÊ MÃE
Rodar o prompt docs/prompt_auditoria_dossie_mae.md via WORKFLOW (auditores em
paralelo: stack, arquitetura, frontend, backend, DB, integrações, segurança,
performance, testes, docs → síntese). Gerar 4 arquivos na raiz:
AUDITORIA_SISTEMA.md · MAPA_ARQUITETURA.md · HANDOFF_PROXIMA_SESSAO.md ·
DOSSIE_MAE_PROJETO.md. Prioridade: documentar (não alterar). Só depois de
concluir: polimento #45, ficha de CS, e inovações funcionais (⌘K, toasts,
calendário, DnD, skeletons).

## PARIDADE VISUAL COM O PROTÓTIPO (pente-fino) — branch feat/paridade-prototipo
- Central de Tarefas idêntica ao protótipo:
  - Header "Central de Tarefas" (24px, weight bold, tracking -.03em) + subtítulo.
  - KPI strip = protótipo: SEM ícone, número grande 26px MONO (tabular) tracking
    -.04em, label uppercase 10.5px, variantes late(vermelho)/done(verde)/crit;
    card surface-2 raio 14 + linha de brilho no topo + hover lift. Métricas:
    Abertas · Atrasadas · Aguardando · No prazo(%) · War Room (DAL kpis reescrito).
  - Segmented control com THUMB DESLIZANTE (gradiente ciano, spring). 5 views com
    rótulos do protótipo: Lista · Kanban · Calendário · Por Cliente · Por Gestor.
  - Coluna "Responsável" (era "Resp.").
  - Nova view Calendário: grade do mês com tarefas por dia (crítico/atrasado
    destacados), navegação de mês.
- Workflow de auditoria de paridade rodou (8 comparadores ok; síntese estourou
  retry) — pente-fino feito inline.

- **Paridade topbar** — branch feat/paridade-topnav: busca no estilo do protótipo
  (pílula translúcida bg white/5, hairline, raio 11, magnifier + placeholder
  "Buscar tarefas, clientes, POPs…" + kbd ⌘K mono); avatar do usuário com gradiente
  ciano. Mantidos: view-mode ADMIN/GESTOR, sino de alertas, menu do usuário
  (funcionalidades reais). ⌘K funcional fica pra fatia de inovação (command palette).
- **Paridade sidebar** — branch feat/paridade-sidebar: estrutura igual ao protótipo iOS.
  Seções: (topo sem label) Meu Dia · Minha Semana · Central de Tarefas · Cockpit ·
  Aceite; ÁREAS com ITENS EXPANSÍVEIS + sub-menu aninhado (nav-tree): Tráfego
  (→ Check-ins/Prestações/Processos), Sucesso do Cliente (→ Clientes/Validação CS/
  Relatórios), War Room, Comercial (→ Pipeline/CRM), Financeiro (→ DRE/Jurídico),
  Onboarding; VISÕES POR PAPEL (Visão CS/Gestor/CEO); INTELIGÊNCIA (Alertas/IA/
  Base/Metas&Equipe/Painel). NavGroup (expansível, abre se filho ativo) + NavLeaf
  (nested com ·). Contadores mantidos. Nova rota /minha-semana (reusa Meu Dia).

- **Fonte iOS (San Francisco) global** — fixada como token do Tailwind (--font-sans/
  --font-mono/--default-font-family) = -apple-system → SF em Apple, Inter fallback.
  Sem webfont (zero download = mais rápido). body com text-rendering optimizeLegibility
  + font-optical-sizing auto.

## INOVAÇÕES FUNCIONAIS
- **⌘K Command Palette** — branch feat/command-palette: action globalSearch(q)
  role-scoped (tarefas/clientes/POPs, insensitive, take 6 cada). Componente
  CommandPalette (modal vidro, atalhos rápidos quando vazio, busca com debounce,
  navegação ↑↓/Enter/Esc, agrupado Tarefas/Clientes/POPs). Aberto por ⌘K/Ctrl+K
  global (listener no DashboardShell) e pelo botão de busca do TopNav.

- **Fluidez: Toasts + polish carteira** — branch feat/polish-telas: sistema de
  toasts global (lib/toast pub/sub + ToastViewport no shell, vidro, auto-dismiss)
  fiado no TaskDrawer (enviar/aprovar/ajustes/concluir/comentar) e na
  ValidationQueue (aprovar/ajustes). ClientesTable container → .card (hairline +
  sombra + brilho). Demais telas já herdam a paleta via overrides globais.

- **Fluidez: Skeletons** — branch feat/skeletons: Skeleton + PageSkeleton (shimmer
  .ak-skeleton no globals) + loading.tsx em /operacional /clients /cockpit
  /financeiro /meu-dia — transição suave durante o fetch (percepção de rapidez).

---

# MÓDULO TASKS CLICKUP-CLASS (PROMPT_MESTRE_TASKS.md) — estado do A0

> Seção mantida pelo A0-ORQUESTRADOR. Fases do BLOCO 5.

## Fase atual: Fase 0 — Auditoria & Decisões (em execução)

| Fase | Status | Gate |
|---|---|---|
| 0 — Auditoria & Decisões (A0) | 🔄 em execução | audit-fase0.md + DECISIONS.md |
| 1 — Fundação de dados (A1) | ⏳ aguardando gate 0 | migrations limpas + seed + índices |
| 2 — Núcleo de negócio (A2) | ⏳ | testes verdes + tenancy + recorrência on-complete |
| 3 — Vocabulário visual (A3) | ⏳ (pode iniciar na Fase 2) | playground aprovado |
| 4 — Experiência (A4) | ⏳ | fluxo completo sem reload; 500 tasks |
| 5 — Automação & Segurança (A5+A6) | ⏳ | cron idempotente; security sem ❌ |
| 6 — Qualidade (A7) | ⏳ | fluxos críticos verdes; sem P0/P1 |
| 7 — Docs & Migração (A8) | ⏳ | teste do usuário virgem |

## Decisões travadas
D-001…D-009 em `DECISIONS.md` (estado do cliente = server actions + optimistic local; DnD = @hello-pangea/dnd; fractional-indexing; convergência de status em 2 etapas com espelho do enum; multi-assignee com assignedTo espelho; TZ America/Sao_Paulo; tenancy gradual com Workspace único; WIP `wip/task-edit-inline` preservado; painel /t/[taskId] slide-over).

## Pendências (arbitragem A0)
- (nenhuma)

## Fila pós-execução (ordem de entrada)
1. **Liquid Glass (Apple/iOS) em todo o sistema** — pedido do dono em 01/07/2026: após TODAS as fases do módulo Tasks, executar melhoria de design/UX global aplicando o efeito liquid glass da Apple (translucidez, blur em camadas, bordas luminosas, profundidade). Base já existente: tokens --ak-glass/--ak-glass-strong e tema "Arkza · Apple/iOS" no globals.css. Escopo: superfícies de card/sidebar/modais/painéis, respeitando a allow-list congelada e os tokens semânticos (sem hex novo).

## Riscos ativos
- R1: enum TaskStatus → Status FK sem quebrar Hub de Suporte/recorrência/counts em produção (D-004).
- R2: dupla fonte de verdade ClickUp↔Performli — data de corte por lista/cliente; 21 demandas do Suporte já importadas.
- R3: sem build local — gates com `migrate dev`/testes locais adaptados para: migration idempotente + Vercel verde + revisão do guardião.

## Particularidades do repositório (para todos os agentes)
- Verificação SOMENTE via build Vercel; eslint no-explicit-any quebra o build.
- Fluxo por fatia: branch → PR → Vercel verde → squash merge.
- Produção com dados reais: 30 clientes, 510 recorrentes, Hub de Suporte ativo.
- CLAUDE.md continua valendo (auth+papel+posse, AuditLog, migrations aditivas).

## Handoffs arquivados
- (nenhum — docs/handoffs/)

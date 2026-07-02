# HANDOFF — Fase 7 · A8-DOCS

> Documentação viva do módulo + plano de migração ClickUp (BLOCO 4 §A8,
> BLOCO 5 Fase 7). Nenhuma linha de código alterada — só docs novos.
> Base: PROMPT_MESTRE_TASKS.md, DECISIONS.md D-001..D-010, handoffs fases 1-5,
> docs/schema-diff.md, docs/security-review.md + leitura direta do código na
> main (`89ba2d3`, Fases 0-5 mergeadas, PRs #104-#110).

## 1. O QUE FOI FEITO

- **`docs/modulo-tasks/README.md`** — mapa vivo do módulo: schema (models/enums
  com âncora de linha + as 3 decisões de convivência D-004/005/010), tabela de
  actions (assinatura × o que faz × authz, com o estado pós-correção do C1),
  catálogo de componentes (Fase 3 + TaskPanel/RecurrenceEditor + views 4b),
  rotas (`/t/[taskId]`, `@modal`, `/operacional`, `/suporte`, `/meu-dia`,
  `/validacoes`, `/dev/components`), crons (recurrences 10:00 UTC com os 2
  motores; daily 11:00 UTC com overdue/escalação; aviso da ordem 10h→11h) e o
  motor de automação v0 com **receita de criação de `TaskAutomationRule` no
  banco** (trigger literal, `conditions`/`actionConfig` JSON, 2 exemplos SQL,
  roteiro de depuração via `AutomationLog`).
- **`docs/modulo-tasks/GUIA_ARKZA.md`** — guia de uso interno pt-BR, zero
  jargão, passo a passo: painel `/t/` (11 pontos editáveis), Lista vs Kanban,
  filtros (e como "salvam" sozinhos), criação rápida, recorrência (3 receitas:
  toda 2ª, dia útil com "Ignorar dias não úteis", "Não repetir"), o que acontece
  ao concluir recorrente, Hub de Suporte (formulário campo a campo), evidência/
  validação da CS, dependências, comentários/atividade, tabela completa de
  cores/badges e FAQ. Screenshots como `[print a capturar: …]`.
- **`MIGRATION_CLICKUP.md`** (raiz) — plano de migração ClickUp→Performli
  (PLANO, não execução): princípios (lista vive em UM sistema; idempotência
  `clickup-{lista}:{taskId}`; só abertas; inteligência-não-cópia; exit strategy
  por lote), lote 0 já em produção (21 demandas do Suporte, motor das 15
  recorrentes, carteiras, `User.externalId`), inventário completo da hierarquia
  restante com destino por lista, mapeamento campo a campo comum + de-para de
  status/prioridade, 6 lotes detalhados (time interno, rituais→`REUNIAO`+
  `recurrenceRule`, contratos→`Contract` por reconciliação, financeiro→Asaas/
  `Expense`, metas→`Goal`//agency/metas, desligamento por cliente), critério de
  aceite = piloto Bambola 2 semanas (BLOCO 8), calendário com cortes às
  segundas (13/07 → 17/08) e padrão técnico do script (dry-run, upsert, espelho
  statusId, AutomationLog/AuditLog, try/catch por item).
- **Este handoff** + atualização do checklist do Apêndice B (§7 abaixo).

## 2. DECISÕES TOMADAS (documentais — nenhuma muda código)

- **Fatos conferidos no código, não copiados dos handoffs.** Divergência
  relevante encontrada e refletida: o `docs/security-review.md` registra o gate
  REPROVADO pelo C1 (IDOR em `loadTaskDetail`), mas a main atual JÁ contém a
  correção (recorte por papel/posse em `operacional.ts:326-340`, mesmo padrão
  do `loadTaskPanel`). O README documenta o estado real (corrigido) citando o
  review como histórico.
- **Guia descreve "salvar filtros" como automático (localStorage)** e explicita
  que "filtro salvo com nome" não existe — é a lacuna registrada na Fase 4b
  (`TaskSavedView` sem action). Não prometi feature inexistente.
- **Plano de migração: só tarefas ABERTAS.** Concluídas ficam em export CSV
  arquivado. Alternativa (importar histórico como CONCLUIDO) descartada: polui
  a Central, não responde pergunta operacional e infla `getOperacionalBoard`.
- **Comentários do ClickUp não são importados (v1)** — autoria não é
  reproduzível; o link da task original vai na descrição.
- **Contas a Receber NÃO vira import** — Asaas já é a fonte automatizada do
  FIN-19; o plano prescreve reconciliação (item sem cobrança no Asaas =
  regularizar no Asaas). Importar as 31 tasks recriaria o processo manual que o
  Performli já aposentou.
- **Objetivos Q1-Q4 → metas MENSAIS** (`Goal` não tem período QUARTERLY):
  trimestre quebrado em 3 metas mensais com `notes` de origem; só Q3/Q4 2026.
  Alternativa (criar período QUARTERLY) descartada: mudança de schema por
  necessidade de import é o rabo abanando o cachorro.
- **Rastreio de contrato em `notes`**, não em `Expense.externalId`/campo novo:
  `Expense.externalId` é reservado ao id Asaas; `Contract.externalId` aditivo
  fica como opção registrada para o A0 arbitrar no lote 3.
- **list_id do Suporte (`901109925274`) citado como fato da migração já feita**
  — ele NÃO está no código (o seed guarda `clickupId` por tarefa); os demais
  list_ids entram como `(coletar)` no D-0 do plano. Não inventei ids.

## 3. O QUE NÃO FOI FEITO (E POR QUÊ)

- **Screenshots reais** — ambiente sem app rodando/navegador; todos os pontos
  de captura estão marcados `[print a capturar: …]` no guia (12 marcadores).
- **Execução de qualquer lote de migração** — o escopo da Fase 7 é PLANEJAR
  (BLOCO 4 §A8: "planejar agora, executar quando o módulo estabilizar").
- **Coleta dos list_ids/externalIds via API ClickUp** — é o passo D-0 do
  próprio plano, ação operacional com credencial, não documentação.
- **`docs/qa-checklist.md`** (roteiro manual de 15 min) — entregável do A7, não
  do A8. A Fase 6 rodou EM PARALELO a esta fase e entregou
  `docs/qa-report-fase6.md` (veredito APROVADO); o roteiro manual executável
  pelo time segue como pendência do A7 no checklist (§7).
- **Correções R2-R6 do security-review** — são código; A8 não escreve código.
  Referenciadas no README §2 para não se perderem.

## 4. COMO VALIDAR

1. **Arquivos existem e são coerentes:**
   `docs/modulo-tasks/README.md` · `docs/modulo-tasks/GUIA_ARKZA.md` ·
   `MIGRATION_CLICKUP.md` (raiz) · este handoff. Nenhum arquivo de código
   alterado (`git status` deve mostrar só os 4 docs).
2. **Âncoras conferem:** amostrar 5 âncoras do README contra o código —
   `operacional.ts:326-340` (recorte do loadTaskDetail), `schema.prisma:822`
   (Task), `task-automation.ts:101` (match literal do trigger),
   `vercel.json` (recurrences `0 10 * * *`, daily `0 11 * * *`),
   `seed-suporte.ts:113` (idempotencyKey `clickup-suporte:`).
3. **Teste do usuário virgem (gate da Fase 7):** entregar SÓ o
   `GUIA_ARKZA.md` a alguém que não participou do build e pedir que responda
   às 3 perguntas abaixo (§6). Aprovado se acertar as 3 sem ajuda. Sugestão de
   cobaia: alguém do time que ainda não usa a Central.
4. **Plano de migração fecha com o prompt mestre:** conferir que cada item do
   BLOCO 8 (piloto, ritmo semanal, 2 ciclos de recorrência, corte por lote)
   tem contraparte no MIGRATION_CLICKUP.md §6-7.

## 5. RISCOS ATIVOS

- **Docs desatualizam.** O README fixa âncoras de linha da main `89ba2d3`;
  refatorações futuras devem atualizar `docs/modulo-tasks/README.md` (é "mapa
  VIVO" — a manutenção é parte do Definition of Done de cada fatia futura).
- **`security-review.md` continua dizendo REPROVADO** no veredito original.
  Quem ler só aquele arquivo conclui errado — o README §2 corrige, mas um
  adendo de 2 linhas no próprio review (pelo A6/A0) evitaria a confusão.
- **Fase 6 (A7-QA) rodou em paralelo a esta fase** e APROVOU
  (`docs/qa-report-fase6.md`: 8/8 fluxos críticos verdes, 26/26 funções puras
  PASS, carga 2.000 tasks < 50 ms). Ficam vivos do QA: o achado **P2** (índices
  `taskId` faltando em TaskChecklistItem/TaskComment/TaskApproval/TaskAttachment
  — migration aditiva devolvida ao A1) e a ausência do roteiro manual
  `docs/qa-checklist.md` executável pelo time.
- **Calendário do plano depende do D-0** (list_ids + externalIds até 10/07).
  Se atrasar, os cortes deslizam semana a semana — o plano é explícito nisso.

## 6. INSTRUÇÕES PARA O PRÓXIMO AGENTE (A0-ORQUESTRADOR)

- **Rodar o gate:** teste do usuário virgem com as 3 perguntas abaixo
  (respostas esperadas incluídas para correção):
  1. *"Preciso que uma tarefa se repita toda segunda-feira. Como configuro e o
     que acontece quando eu concluir?"* → Abrir a tarefa (clicar no título),
     seção **Recorrência → Configurar**, "Repetir a cada **1 semana**", deixar
     só **2ª** aceso, **Salvar**. Ao concluir, o sistema cria sozinho a próxima
     ocorrência em "A fazer", com os mesmos responsáveis, checklist zerado e
     prazo na segunda seguinte (guia §7 e §8).
  2. *"Chegou pedido da cliente Bambola pelo WhatsApp: onde registro e o que
     preencho?"* → **Hub de Suporte → Nova demanda**: Cliente = Bambola; "O que
     precisa ser feito?"; Categoria (Tráfego / Demanda da Agência / Sucesso do
     Cliente); responsável se souber; prioridade; vencimento se tem prazo real
     (guia §6).
  3. *"Uma tarefa está com a pílula âmbar 'Aguardando CS' e a borda esquerda
     vermelha. O que isso significa e quem age?"* → Está parada esperando a CS
     validar E está atrasada. Quem age é a **CS** (fila de Validação); o gestor
     cobra a validação — não muda o status na mão (guia §12 e §9).
- **Arbitrar 2 decisões deixadas em aberto no plano:** (a) `Contract.externalId`
  aditivo vs chave natural + `notes` (lote 3); (b) destino de objetivos que não
  são metas de cliente (lote 5).
- **Sequenciar:** D-0 do MIGRATION_CLICKUP.md na semana de 06/07; migration
  aditiva dos índices `*_taskId_idx` (achado P2 do QA → A1); roteiro manual
  `docs/qa-checklist.md` (A7); adendo de status no `security-review.md`;
  R2-R6 como micro-fatia do A2/A6.
- **Contratos que este handoff NÃO cria:** nenhum. Docs não mudam assinaturas;
  qualquer mudança futura de contrato continua exigindo ADR em DECISIONS.md.

## 7. APÊNDICE B — CHECKLIST DE ACEITE (estado em 2026-07-02)

- [x] **Fase 0**: auditoria + DECISIONS.md — `docs/audit-fase0.md`, D-001..D-009 (#104)
- [x] **Fase 1**: schema convergido, índices ok — migration única aditiva/idempotente + backfill (`ws_arkza`, `sset_arkza`, 11 Status) (#105). *Gate adaptado: sem seed fake de 8 clientes — produção usa seeds reais (schema-diff §6)*
- [x] **Fase 2**: actions completas, tenancy, recorrência on-complete — statusMap/recurrence/fractional/mentions + mutateTask/assertCan + espelho statusId em 100% das escritas (#107)
- [x] **Fase 3**: playground de componentes aprovado — 13 componentes + `/dev/components` ADMIN-only (#106)
- [x] **Fase 4**: Lista + Kanban + painel `/t/[taskId]` + filtros, tudo otimista (#108/#109); "Minhas Tarefas" atendida pelo `/meu-dia` existente; micro-fatia 4b-actions fechou as 4 lacunas
- [x] **Fase 5**: cron idempotente + automação v0 (#110) + security review — **C1 corrigido na main** (`operacional.ts:326-340`); zero ❌ vigente; R2-R6 (⚠️) em aberto
- [x] **Fase 6**: testes verdes + QA manual + carga 2.000 tasks — **APROVADA** (`docs/qa-report-fase6.md`, rodou em paralelo à Fase 7: 8/8 fluxos críticos verdes, 26/26 funções puras PASS, carga 2.000 tasks < 50 ms com índices Fase 1 usados, zero P0/P1). *Pendências não-bloqueantes do QA: migration aditiva dos índices `*_taskId_idx` (P2 → A1) e roteiro manual `docs/qa-checklist.md` executável pelo time*
- [x] **Fase 7**: docs + guia PT-BR + plano de migração ClickUp — este handoff; **gate (teste do usuário virgem) aguarda execução com pessoa real** (§6)
- [ ] **Aceite final**: piloto Bambola 2 semanas rodando — **agendado** (06-19/07, MIGRATION_CLICKUP.md §6-7), não iniciado; migração dos ~29 restantes condicionada ao gate de 20/07

**Faltam para o aceite final do módulo:** execução do teste do usuário virgem
com pessoa real, piloto Bambola aprovado, e as ondas de corte do
MIGRATION_CLICKUP.md (mais as pendências não-bloqueantes: índices P2,
qa-checklist manual, R2-R6, adendo no security-review).

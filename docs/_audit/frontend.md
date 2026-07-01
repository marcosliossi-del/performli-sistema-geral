## Frontend & UX

Auditoria read-only da dimensão Frontend & UX do PERFORMLI. Foco: 34 páginas em
`src/app/(dashboard)`, componentes em `src/components`, design system em
`globals.css`, Sidebar, CommandPalette, toasts, skeletons, estados vazios,
aderência às 6 perguntas de UX e acessibilidade básica.

### (a) O que existe

- **Design system coeso (`src/app/globals.css`).** Tokens Arkza (ciano-petróleo,
  vidro/glass, sombras, molas). Layer de OVERRIDES remapeia dezenas de cores hex
  legadas (`#95BBE2`, `#38435C`, etc.) para a nova paleta sem editar cada tela —
  retematização central inteligente. Classes utilitárias `.card`, `.ak-glass`,
  `.ak-lift`, `.ak-skeleton`, `.ak-drawer`, badges de status.
- **Cockpit exemplar (`src/app/(dashboard)/cockpit/page.tsx`).** Cada
  `OperationalCard` responde às 6 perguntas: título (o que/o que está errado),
  `why`, `responsible`, `deadline`, `impact` ("Se não agir: …"), `action` (CTA).
  Blocos pendentes mostrados com transparência ("aguardando ONB-04").
- **`OperationalCard` (`src/components/cockpit/OperationalCard.tsx`)** — padrão
  reutilizável das 6 perguntas com severidade (critical/warning/ok/neutral) e
  borda esquerda colorida.
- **`LastUpdatedBadge` (`src/components/cockpit/LastUpdatedBadge.tsx`)** —
  cumpre a regra 10 (data/hora da última atualização; fica vermelho se stale).
- **Sidebar (`src/components/layout/Sidebar.tsx`)** — nav-tree com RBAC por
  seção/item, badges de pendência (contadores), grupos expansíveis, indicador
  de item ativo, "Sistema online".
- **CommandPalette (`src/components/layout/CommandPalette.tsx`)** — busca global
  com debounce, navegação por teclado (↑↓/Enter/Esc), agrupamento, foco no
  input ao abrir.
- **Toasts (`src/lib/toast.ts` + `ToastViewport.tsx`)** — pub/sub sem lib,
  3 tons (ok/err/info), auto-dismiss 3.2s.
- **Skeletons (`src/components/ui/Skeleton.tsx`)** — `PageSkeleton` (título +
  KPIs + tabela) reutilizável; shimmer via `.ak-skeleton`.
- **Foco visível global** — `a/button/[role=button]:focus-visible` com outline
  ciano em `globals.css:301`; `prefers-reduced-motion` respeitado (`:136`).

### (b) Pontos fortes

1. **Cockpit e `OperationalCard` são referência de UX operacional** — 6 perguntas
   respondidas por card, linguagem de negócio, CTA com destino.
2. **Retematização central via overrides** — mudar paleta em 1 arquivo, sem
   tocar 105 componentes.
3. **Freshness tratada como cidadã de primeira classe** no Cockpit
   (`LastUpdatedBadge`), inclusive estado "Sem registro de sincronização".
4. **Estados vazios majoritariamente operacionais** — ex.: "Nenhum processo
   crítico quebrando agora." (verde), "Nenhum cliente em status Ruim esta
   semana.", "Nenhuma mensagem ainda — abra o canal para iniciar o alinhamento."
5. **RBAC no próprio menu** — itens/seções filtrados por papel, sem vazar rota.
6. **`prefers-reduced-motion` e foco-visível** já contemplados no CSS base.

### (c) Riscos / inconsistências por severidade

**ALTA**
- **Nenhuma `error.tsx` em todo `src/app`.** Zero error boundaries do App Router:
  qualquer exceção de RSC/DAL derruba a árvore para a tela de erro genérica do
  Next (mensagem técnica, sem "tentar de novo"). Viola "linguagem operacional".
- **Falha silenciosa no Pipeline (`pipeline/PipelineBoard.tsx:56`).** `catch {}`
  faz rollback do drag-and-drop **sem toast**: o card volta sozinho e nada
  explica o porquê — o "processo que quebra sem ninguém ver" que o sistema
  deveria eliminar.
- **Modais/drawers sem `role="dialog"`, sem focus-trap e (na maioria) sem Esc.**
  `grep` por `role="dialog"`/focus-trap = 0 resultados. `TaskDrawer.tsx`,
  `TaskFormModal.tsx`, `ClientChatPanel`, drawers de anti-churn abrem sem
  aprisionar o foco nem devolver o foco ao fechar; leitor de tela e teclado
  ficam presos no fundo. (CommandPalette é a exceção que trata Esc.)

**MÉDIA**
- **Aria/roles quase ausentes:** apenas ~6 arquivos em todo `src/` usam `aria-*`
  ou `role=`. Botões ícone-only (X de fechar, chevrons, ações de linha) sem
  `aria-label` — só `InteractionTimeline.tsx` usa. Impacto de acessibilidade em
  ações críticas (fechar drawer, aprovar/reprovar).
- **Estados vazios sem CTA de próxima ação.** Muitos são frases corretas mas
  "becos sem saída": `managers/page.tsx:109` "Nenhum gestor com clientes
  ativos", `team/page.tsx:49` "Nenhum membro cadastrado",
  `operations/page.tsx:83` "Nenhuma operação encontrada" — não dizem *o que
  fazer agora* (pergunta 3 das 6). Contraste: canais faz certo.
- **Mensagens de erro técnicas expostas ao usuário.** `TaskDrawer.tsx` e
  vários componentes fazem `setActionError(r.error)` + `toast(r.error,'err')`,
  renderizando a string crua do backend (`actionError` em vermelho). Viola
  "linguagem operacional, nunca técnica" — precisa mapear para mensagem com
  porquê/ação.
- **Badge "Sem dados" genérico** em `clients/[slug]/page.tsx:546,606` e
  `MetricsChartsGrid` — sem explicar o porquê (sincronizar? plataforma
  desconectada?). Em `:414` a versão boa existe ("Sincronize as plataformas
  para ver os KPIs") e deveria ser o padrão.
- **`LastUpdatedBadge` só no Cockpit.** Regra 10 (toda tela com dado crítico
  mostra última atualização) não é seguida em `clients/[slug]`, `reports`,
  `financeiro`, `anti-churn`, `dashboard` de forma consistente (freshness
  aparece ad-hoc em ~5 páginas).

**BAIXA**
- **Toast usado em só 4 arquivos** — mutações em muitas telas não dão feedback
  de sucesso/erro visível (só o `actionError` inline). Inconsistência de padrão.
- **Cores hex hardcoded nas telas** (`text-[#EBEBEB]`, `text-[#87919E]`) em vez
  de tokens semânticos (`text-foreground`/`text-muted`). Funciona pelos
  overrides, mas qualquer cor nova exige adicionar override — dívida de token.
- **Toasts sem `aria-live`** — mudanças não anunciadas a leitores de tela.
- **`animate-pulse` no dot "Sistema online"** (Sidebar:199) é decorativo e
  compete com o pulso do crítico (`.ak-pulse`) — ruído visual.

### 🔒 Travas / Fluidez

Melhorias concretas de fluidez, ordenadas por impacto/esforço:

1. **Criar `error.tsx` (dashboard) com copy operacional + "tentar de novo".**
   Hoje não há nenhuma error boundary; qualquer falha de RSC/DAL cai na tela
   nativa do Next. Baixo risco, alto ganho. (Obs.: `loading.tsx` do grupo
   `(dashboard)` já cobre rotas aninhadas via Suspense — não é lacuna.)
2. **Componente `EmptyState` com CTA obrigatório.** Props: ícone, título
   operacional, subtítulo (o porquê), ação (label+href). Substituir os "Nenhum
   X" secos por versões acionáveis (ex.: "Nenhum gestor com clientes ativos →
   Atribuir clientes"). Fecha a pergunta 3 nas telas de lista.
3. **Mapear erros de backend para mensagem operacional.** Criar
   `humanizeError(code)` e trocar `toast(r.error,'err')`/`setActionError(r.error)`
   por texto com porquê + próximo passo. Remove strings técnicas da UI.
4. **Acessibilidade de modais/drawers.** Wrapper `Dialog` com `role="dialog"`,
   `aria-modal`, focus-trap, Esc para fechar e devolução de foco ao gatilho.
   Aplicar em `TaskDrawer`, `TaskFormModal`, `ClientChatPanel`, drawers de
   anti-churn.
5. **`aria-label` em botões ícone-only** (fechar, chevrons, aprovar/reprovar) e
   `aria-live="polite"` no `ToastViewport`.
6. **Generalizar `LastUpdatedBadge`** para toda tela com dado sincronizado
   (client 360, reports, financeiro, anti-churn) — padroniza a regra 10.
7. **Padronizar "Sem dados" → "Sincronize as plataformas para ver…"** com link
   para a tela de integrações, em vez do badge mudo.
8. **Migrar hex → tokens semânticos** (`text-foreground`, `text-muted`,
   `border-hair`) gradualmente, reduzindo a dependência do layer de overrides.

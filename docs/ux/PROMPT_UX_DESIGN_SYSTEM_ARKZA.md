# Central Operacional Arkza — Prompt de UX / Design System

> **Como usar:** este prompt acompanha o documento de blocos funcionais (`PROMPT_CENTRAL_OPERACIONAL_ARKZA.md`). Aquele constrói a lógica; **este define a casca visual e as interações**. Rode-o como um bloco próprio, idealmente entre o BLOCO 1 (fundação) e o BLOCO 2 (UI principal), para que a Central de Tarefas já nasça com o design system pronto. Cole por etapas — Etapa A primeiro (tokens), aprove, depois B e C.

---

## Contexto

Você está desenhando a interface do **PerformliSistema** (sistema interno da agência Arkza). Stack visual existente: Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI, Recharts, Lucide React, dark mode.

O objetivo é dar ao sistema a **densidade, a navegação e as interações de um ClickUp** — mas com **identidade visual própria**, não a estética roxa clara deles. Quero a *lógica de UX* do ClickUp vestida numa marca que seja só da Arkza, em dark mode, com paleta repensada do zero.

**Regra inegociável:** não clone a aparência do ClickUp. Clonar a UX (como as coisas funcionam) é o objetivo; clonar a aparência (roxo, fundo claro, ilustrações deles) é o que NÃO quero. Se você se pegar usando roxo ClickUp (#7B68EE e parentes) como cor primária, pare e repense.

---

## ETAPA A — Design System (tokens, cores, tipografia, componentes base)

Antes de qualquer tela, entregue o design system como camada de tokens. Trabalhe em dois passos: primeiro o **plano** (paleta nomeada em 5–6 hex, par tipográfico justificado, conceito de layout), me mostre, e só depois implemente em CSS variables + config do Tailwind.

### A.1 Direção de cor (dark mode, paleta nova)

Construa uma paleta dark **própria da Arkza**, não a do ClickUp. Princípios:

- **Fundo:** dark de verdade, mas não preto puro chapado. Use 3–4 níveis de superfície (fundo da app, painel, card, card elevado/hover) para criar profundidade — esse escalonamento de superfícies é o que dá a sensação "ferramenta de trabalho densa" do ClickUp sem copiar a cor dele.
- **Primária:** escolha UMA cor de marca para ações, foco e seleção. Evite o roxo ClickUp. Pense em algo que combine com "tráfego pago / performance / agência" — pode ser um azul elétrico mais frio, um ciano-petróleo, um verde-performance, o que você justificar. Defina a cor e o porquê.
- **Cores de status operacional** (estas são funcionais, não decorativas — cada uma comunica um estado real do sistema):
  - A fazer / neutro
  - Em andamento
  - Aguardando (cliente / CS / gestor) — um tom de "pausa/espera"
  - Em validação / aprovação
  - Bloqueado
  - Atrasado — alto contraste, deve "saltar"
  - Concluído
  - Cancelado — apagado, baixo contraste
  - **Crítico / War Room** — a cor mais urgente de todas; cliente crítico precisa gritar na tela
- **Prioridades** (4 níveis: baixa, média, alta, crítica) com cores distintas das de status, para não confundir.
- Garanta contraste AA em texto sobre cada superfície.

Entregue como CSS custom properties (`--surface-0/1/2/3`, `--brand`, `--status-*`, `--priority-*`, etc.) e mapeie no `tailwind.config`.

### A.2 Tipografia

Defina um par tipográfico deliberado (não as fontes default de sempre):
- uma face de **display/títulos** com personalidade, usada com restrição (cabeçalhos de seção, números de KPI);
- uma face de **corpo/UI** altamente legível em tamanhos pequenos e densos (a maior parte da interface de tarefas é texto pequeno);
- opcionalmente uma face **mono/tabular** para números, métricas, datas e SLAs — em sistema operacional, números alinhados em coluna importam.

Defina escala de tipo, pesos e espaçamento. Justifique o par.

### A.3 Componentes base (a vestir com os tokens acima)

Construa, com Radix + Tailwind, a biblioteca base que todas as telas vão reusar:
- **Badge de status** e **badge de prioridade** (cor + ícone Lucide + label).
- **Avatar / grupo de avatares** (responsável, auxiliares, observadores).
- **Pill de cliente** (com indicador de saúde do cliente embutido).
- **Chip de tag**, **chip de área**, **chip de POP**.
- **Botão** (primário, secundário, ghost, perigo) e **ícone-botão**.
- **Campo** (input, select Radix, date picker, combobox de cliente com busca).
- **Checkbox** e **item de checklist** (com estado "obrigatório não preenchido" que trava).
- **Célula de tabela densa** e **linha de tarefa** (a unidade mais repetida do sistema).
- **Card de tarefa** (para o kanban).
- **Toast / alerta inline** (seguindo a voz: erro explica o que houve e como resolver, nunca pede desculpa nem é vago).
- **Tooltip, menu de contexto, dropdown** (Radix).
- **Drawer lateral** e **modal** (a base do detalhe de tarefa).
- **Estado vazio** (cada lista vazia é um convite à ação, não um espaço morto — ex.: "Nenhum check-in pendente esta semana" com botão para criar).
- **Skeleton/loading** denso.

Densidade é um valor de design aqui: o ClickUp ganha por mostrar muita informação sem virar bagunça. Linhas compactas, paddings contidos, hierarquia por peso e cor mais do que por espaço em branco generoso.

> **Checkpoint A:** me mostre o plano de paleta+tipografia ANTES de codar; depois, uma página de demonstração (`/design-system` ou storybook simples) com todos os componentes base nos seus estados. Só avance para a Etapa B quando os tokens estiverem aprovados.

---

## ETAPA B — Layout, sidebar e navegação hierárquica

Replique a **estrutura de navegação** do ClickUp, vestida no design system da Etapa A.

### B.1 Shell da aplicação
Layout de três zonas:
- **Sidebar esquerda** colapsável: navegação hierárquica Área → Processo/POP → Lista, mais atalhos fixos no topo (Meu Dia, Minha Semana, Central de Tarefas, Dashboard) e seções por papel (visão CS, visão Gestor, visão CEO) que aparecem conforme permissão. Itens expansíveis com chevron, contadores de pendência ao lado de cada item (ex.: "Atrasadas 7").
- **Topbar:** busca global (cmd+K), filtros rápidos, troca de view, botão "+ Nova tarefa" sempre acessível, avatar do usuário.
- **Área de conteúdo:** onde as views renderizam.

### B.2 Barra de views
Logo abaixo do título da lista, uma **barra de troca de visualização** estilo ClickUp: Lista · Kanban · Calendário · Por Cliente · Por Gestor · Por Área. Cada view lembra o último estado (filtros, agrupamento, ordenação) via `TaskSavedView`.

### B.3 Densidade e responsividade
Desktop-first (é ferramenta de trabalho), mas degrade com elegância: sidebar vira drawer no mobile, tabelas viram cards empilhados. Foco de teclado visível, `prefers-reduced-motion` respeitado.

> **Checkpoint B:** navego pela sidebar hierárquica, troco de view, abro a busca global. Contadores de pendência aparecem. Permissões escondem o que o papel não pode ver.

---

## ETAPA C — Views, drawer de tarefa e interações

O coração do sistema. Cada view abaixo é um modo de ver as mesmas tarefas.

### C.1 View Lista (a principal)
Tabela densa, agrupável por status / cliente / gestor / área / prioridade (header de grupo colapsável com contador). Colunas: título, cliente, responsável, status, prioridade, prazo (com destaque de atraso), SLA. **Edição inline:** clicar no status abre o seletor sem sair da linha; clicar no prazo abre o date picker; reatribuir responsável no próprio campo. **Seleção múltipla** com ações em massa (mudar status, atribuir, mover, definir prazo). Atalhos de teclado.

### C.2 View Kanban
Colunas por status (ou por qualquer campo agrupável). **Drag-and-drop** entre colunas muda o campo correspondente e registra `TaskActivity`. Card mostra: título, pill de cliente com saúde, avatar do responsável, prazo, prioridade, contador de checklist (3/8), ícones de comentário/anexo. Coluna de cliente crítico / War Room visualmente destacada.

### C.3 View Calendário
Tarefas por prazo. Marca visualmente as recorrências fixas (segunda = check-in, sexta = prestação, quinta = war room, dia 1 = relatório mensal). Arrastar um card muda o prazo.

### C.4 Drawer de detalhe da tarefa (a tela mais importante)
Abre **lateralmente** sobre qualquer view, sem tirar o usuário do contexto (Radix Dialog/Sheet). Conteúdo:
- topo: título editável inline, badge de status (troca rápida), prioridade;
- coluna principal: descrição, **checklist obrigatório** (itens `required` não marcados travam a conclusão e mostram o porquê), subtarefas, campos personalizados da área/POP, evidência de conclusão (link/print/texto — obrigatória se a tarefa for crítica);
- coluna lateral: cliente (com autopreenchimento de gestor/CS/supervisor/saúde ao selecionar), responsável + auxiliares + observadores, datas (pedido, início, prazo), SLA com indicador de tempo restante/estourado, área, POP, tags, dependências;
- abas inferiores: **Comentários** (com menções), **Atividade** (histórico completo: quem mudou status, quem mudou prazo, quem concluiu, quando), **Anexos**.
- rodapé: botão de concluir que **valida campos obrigatórios e evidência antes de permitir**.

### C.5 Fluxo "Nova tarefa" estilo ClickUp
Quick-add: botão "+ Nova tarefa" abre um composer rápido. Selecionar o cliente **autopreenche** gestor, CS, supervisor, área sugerida, prioridade sugerida (pela saúde do cliente), prazo sugerido (pelo tipo), e carrega checklist se vier de template. Criar e a tarefa aparece imediatamente em todas as views relevantes. Permita "criar e abrir" ou "criar e continuar criando".

### C.6 Micro-interações (com parcimônia)
- transição suave do drawer entrando pela lateral;
- feedback imediato em drag-and-drop e edição inline (otimista, com rollback em erro);
- destaque pulsante discreto em cliente crítico / tarefa atrasada;
- toasts que confirmam ação na mesma voz do botão ("Concluir" → "Concluída").
Nada de animação gratuita — movimento serve à leitura do estado, não à decoração.

> **Checkpoint C (aceite de UX):** as três views renderizam as mesmas tarefas com troca fluida; edição inline na lista funciona; drag-and-drop no kanban muda o campo e loga atividade; o drawer abre lateralmente e bloqueia conclusão sem campos/evidência obrigatórios; o quick-add autopreenche pelo cliente. Tudo no design system da Etapa A, em dark mode, sem nenhum traço da cara do ClickUp.

---

## Voz e conteúdo da interface (vale para todas as etapas)

- Nomeie pelo que o usuário controla, não pela implementação. "Aguardando validação da CS", não "status_pending_review".
- Voz ativa nos botões; a ação mantém o mesmo nome do início ao fim ("Enviar para CS" → toast "Enviado para CS").
- Erros explicam o que houve e como resolver, na voz do sistema, sem pedir desculpa e sem vaguidade.
- Telas vazias convidam à ação.
- Tudo em português do Brasil, registro profissional e direto, como a operação real da Arkza fala.

## Restrições

Não clone a aparência do ClickUp. Não use o roxo deles como primária. Não jogue fora o que já funciona no Performli sem motivo — se um componente atual já é bom, evolua-o com os novos tokens. Não crie animação decorativa. Não quebre acessibilidade (foco visível, contraste AA, reduced-motion). Mantenha densidade alta sem virar bagunça.

# Handoff — Liquid Glass (fundação)

Efeito Liquid Glass (Apple iOS/macOS) aplicado ao Performli **sem trocar a
identidade** (dark petróleo/ciano `--ak-*`) e **sem mudar layout, lógica, props,
handlers ou textos** — só classes/CSS.

## 1. Classes novas (`src/app/globals.css`, camada aditiva no fim do arquivo)

Nenhum hex novo — só `var(--ak-*)`, `color-mix` e rgba de branco/preto. Todas com
fallback sólido via `@supports` e sheen estático (compatível com
`prefers-reduced-motion`).

| Classe | Uso | Blur | Fallback (sem backdrop-filter) |
|---|---|---|---|
| `.lg-glass` | popovers/dropdowns/painéis flutuantes | 20px sat 1.4 | sólido `--ak-s1` |
| `.lg-glass-strong` | modais, slide-overs, toasts, palette | 28px sat 1.5 | sólido `--ak-s1` |
| `.lg-sidebar` | sidebar (glass + brilho radial ciano no topo, borda só à direita) | 22px | sólido `--ak-s1` + radial |
| `.lg-topbar` | topnav sticky (glass, borda só embaixo) | 24px | sólido `--ak-s1` |
| `.lg-overlay` | overlay de modal (só `backdrop-filter: blur(8px)`, compõe com `bg-black/xx`) | 8px | nada (fica só o scrim) |
| `.lg-card` | cards de lista/kanban — **SEM blur**: gradiente 180deg + borda hairline + `--ak-shadow-card` + hover com borda luminosa ciano fraca | — | — |
| `.lg-sheen` | specular highlight diagonal via `::before` (estático) | — | — |
| `.lg-edge` | borda luminosa ciano (foco/hover) via box-shadow ring | — | — |
| `.lg-field` | input translúcido sobre vidro (opt-in) | — | sólido `--ak-s1` |

Detalhes de robustez:
- `.lg-glass`/`.lg-glass-strong` definem só `border-color` (não o shorthand
  `border`) — cada elemento mantém seus lados (`border` all-around nos modais,
  `border-l` nos drawers). Inner highlight via `box-shadow: inset 0 1px 0 …`.
- `.lg-card` aplica só `background-image` (nunca `background-color`), para **não
  sobrescrever** fundos customizados/translúcidos dos consumidores (ex.:
  `<Card className="bg-[#0A1E2C]/40">` em WarRoomPlanPanel).
- Botões: regra escopada a `button.bg-brand`/`button.bg-[#95BBE2]` adiciona só
  gradiente vertical + inner highlight; a **cor da marca é preservada** (mexe só
  em `background-image` + `box-shadow`). O `<Button>` `default/accent` já tinha
  gradiente próprio e não foi tocado.
- Scrollbar fina: webkit já existia; adicionado `scrollbar-width/-color` (Firefox).

## 2. Onde foi aplicado

- **Shell**: `Sidebar.tsx` (`ak-sidebar`→`lg-sidebar`), `TopNav.tsx`
  (`ak-topbar`→`lg-topbar`; dropdown do usuário → `lg-glass`). Área de conteúdo
  (`ak-app-bg` + gradiente do body) **inalterada**.
- **Primitivo**: `ui/card.tsx` → `<Card>` ganha `lg-card` por padrão.
- **Flutuantes**: `CommandPalette` e `ToastViewport` → `lg-glass-strong`;
  `tasks/Popover` → `lg-glass`.
- **Slide-overs**: `tasks/TaskPanel`, `operacional/TaskDrawer` →
  `lg-glass-strong` + scrim com `lg-overlay`.
- **Modais** (todos os que usam `useModalA11y`) → painel `lg-glass-strong`:
  ConfirmDialog, NovaTarefaModal, NewSupportDemand, TaskFormModal, ExpenseModal,
  ContractFormModal, ConvertToClientModal, GoalFormModal, AddInteractionModal,
  EditClientModal, LinkAccountModal, LinkGA4Modal, LinkGoogleAdsModal.
  Overlays sem blur ganharam `lg-overlay` (NovaTarefaModal, NewSupportDemand,
  GoalFormModal, ConfirmDialog, TaskPanel, TaskDrawer, CommandPalette). Os demais
  já tinham `backdrop-blur-sm` (4px) e foram deixados como estavam.

## 3. Performance / acessibilidade

- `backdrop-filter` só em superfícies **fixas** (sidebar, topbar, modais,
  slide-overs, popovers, palette, toasts). Cards de lista/kanban usam `.lg-card`
  (gradiente + borda + sombra, **sem blur**) — não há blur repetido N vezes.
- Contraste preservado: glass forte a 78% de `--ak-s1` sobre scrim escuro; sidebar
  a 66% sempre tem backdrop escuro (nunca há conteúdo claro atrás dela). Sem
  backdrop-filter, tudo cai para fundo sólido `--ak-s1`.

## 4. Riscos visuais (baixos)

- Modais que antes eram sólidos (`bg-[#05141C]/#0A1E2C/#0D2137`) agora são vidro
  translúcido; o `lg-glass-strong` vence o `bg-[#…]` (leve mudança de tom no
  fallback sem backdrop-filter — imperceptível). Headers `sticky` internos dos
  modais seguem sólidos (legibilidade ao rolar).
- `<Card>` agora tem hover com borda ciano fraca (inclusive KPIs estáticos) —
  sutil e proposital (iOS-like).
- Drawers: `lg-glass-strong` troca a sombra custom `shadow-[-20px…]` pela
  `--ak-shadow-pop` (sombra de modal). Direção levemente diferente, visual OK.
- Não convertido nesta fatia (follow-up opcional): cards de kanban/lista soltos
  (que não usam `<Card>`) e headers sticky de páginas — podem adotar `.lg-card`
  e `.lg-glass` depois. Overlays com `backdrop-blur-sm` (4px) ficaram em 4px.

## Estado

Só classes/CSS. Zero mudança de layout/espaçamento, lógica, props, handlers ou
textos. Sem `any`. Sem commit/PR. **Aguardando veredito do `guardiao`.**

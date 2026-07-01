## Testes & Documentação

Auditoria read-only da dimensão **Testes & Documentação** do Performli.
Data: 2026-07-01.

---

### (a) O que existe

**Testes automatizados**
- **Nenhum.** Não há arquivos `*.test.ts(x)` nem `*.spec.ts(x)` em `src/`
  (busca em toda a árvore, excluindo `node_modules`, retornou 0).
- **Nenhum test runner configurado.** `package.json` não declara `jest`,
  `vitest`, `@playwright/test` nem `@testing-library` em `dependencies` ou
  `devDependencies`. Não há script `test`.
  - `@playwright/test` aparece apenas como dependência **transitiva** em
    `package-lock.json` (arrastado por outra lib), não é instalável/usável.
- **Nenhum CI.** Não existe `.github/workflows/` — nada roda lint/build/test
  em PR. A única defesa automática é `npm run build` (Vercel), que faz
  `prisma generate + migrate deploy + next build` (compilação/type-check),
  sem verificação comportamental.
- `.gitignore` tem seção `# testing`, mas sem infra por trás.

**Documentação (raiz)**
- `CLAUDE.md` — regras transversais, RBAC, 21 POPs, score 0.30, exit strategy
  ClickUp. Robusto e atual.
- `AGENTS.md` — apenas aviso "This is NOT the Next.js you know" (regras
  nextjs). **Não** documenta os agentes do projeto (isso está no README).
- `README.md` — descreve a **estrutura de subagents** (maestro, guardião etc.)
  e as 4 fases. **Não** é um README de setup do app (não há passos de
  instalação, `.env`, migrate, seed, rodar dev).
- `PROJECT_STATE.md` — estado global detalhado (23 KB), "Última atualização:
  2026-06-30" (véspera; convém revisar após cada merge).

**Documentação (`docs/`)**
- `PERFORMLI_CONTEXTO.md`, `Arkza_Dossie_POPs.html`, `ficha_clinica.docx`
- `auditoria-codigo.md`, `mapa-lacunas.md`, `mapa-pops.md`
- `proposta-schema.md`, `proposta-telas.md`, `ux-clickup-referencia.md`, `ux/`
- `nuvemshop-instalacao.md` (único guia de setup de integração)
- `prompt_auditoria_dossie_mae.md`
- `_audit/` (este diretório de auditoria)

---

### (b) Pontos fortes

1. **Documentação de contexto/produto excelente.** CLAUDE.md + PROJECT_STATE +
   docs/ cobrem regras, POPs, lacunas e propostas com profundidade rara.
2. **PROJECT_STATE.md vivo** — mantido append-only pelo maestro, serve de fonte
   de verdade do progresso (cabeçalho em 2026-06-30).
3. **Guia de integração** existe para Nuvemshop (`nuvemshop-instalacao.md`).
4. **Build faz type-check e migrate** — pega quebras de compilação e schema
   antes do deploy.
5. Regra de **"evidência mínima por tarefa"** (CLAUDE.md #14) está bem definida
   como conceito de produto (check-in preenchido, relatório aprovado etc.).

---

### (c) Lacunas por severidade

**🔴 ALTA**
- **Zero testes em fluxos críticos.** Sem cobertura de:
  - **Auth/RBAC** (`src/lib/auth.ts`, `src/lib/session.ts`,
    `src/app/actions/auth.ts`) — o pilar de segurança (auth+papel+posse,
    regras inegociáveis #2/#3) não tem nenhum teste de regressão.
  - **Mutações com posse (ownership)** — nenhuma server action validada por
    teste; um bypass de autorização passaria silenciosamente.
  - **`resultado-engine.ts` / `recurrence-engine.ts`** — motores de cálculo
    centrais, sem teste de regressão numérica.
  - **Crons** (`src/app/api/cron/{daily,digest,recurrences,resultados}`) —
    a regra #7 (try/catch por cliente, falha isolada) não é verificável por
    teste; regressão de resiliência passaria despercebida.
- **Sem rede de segurança de regressão.** Regras #11/#12 ("não quebrar
  produção", "não remover funcionalidade") dependem hoje 100% de revisão
  manual (guardião) — nada automatizado impede regressão comportamental.

**🟡 MÉDIA**
- **README não serve de onboarding do app.** Um dev novo não consegue subir o
  projeto lendo o README (falta `.env`, `prisma migrate dev`, `seed`, `dev`).
  O README documenta os agentes, não o software.
- **Sem CI.** PRs não têm gate automático de `lint`/`build`. `guardiao` é
  manual e "nunca conserta"; sem CI, regressões só são pegas se alguém rodar.
- **Ausência de doc de segredos/integrações.** Muitas integrações (Meta,
  Google Ads, GA4, Asaas, Z-API, Windsor, ClickUp) sem guia de config
  equivalente ao de Nuvemshop; risco operacional na transição para CEO.

**🟢 BAIXA**
- `AGENTS.md` é enxuto e pode confundir (parece placeholder); poderia apontar
  para README/CLAUDE.
- `docs/` mistura fontes (`.docx`, `.html`) sem índice (`docs/README.md`).

---

### 🔒 Travas / Fluidez

Ordem de menor esforço / maior retorno.

1. **[FLUIDEZ] Adicionar Vitest + 1 teste de fumaça** sobre a decisão de
   autorização (papel + posse) usada por mutações. Instalar `vitest`,
   `script "test"`, e um `*.test.ts` que cobra que um MANAGER só altera
   cliente atribuído e que CS não muta. Aplicável agora, risco baixo, protege
   a regra inegociável mais crítica.
2. **[FLUIDEZ] Teste de regressão do `resultado-engine`.** Fixar entradas
   conhecidas → saídas esperadas. Congela o motor de cálculo antes de futuras
   mudanças. Aplicável agora, risco baixo.
3. **[FLUIDEZ] Reescrever/dividir README.** Manter descrição dos agentes, mas
   adicionar seção "Rodar o app" (env, migrate, seed, dev). Ou mover agentes
   para `AGENTS.md` e deixar README = setup. Aplicável agora, risco baixo.
4. **[FLUIDEZ] CI mínimo** (`.github/workflows/ci.yml`): `npm ci` + `lint` +
   `build` (+ `test` quando existir). Gate automático antes do guardião.
   Aplicável agora, risco baixo.
5. **[TRAVA leve] Não marcar fatia como "concluída" sem ao menos 1 teste de
   fumaça no fluxo crítico** — operacionaliza a regra #14 ("evidência mínima")
   também para código, não só para dado de produto. Adotar como norma no
   checklist do guardião. Risco baixo.
6. **[FLUIDEZ] Atualizar PROJECT_STATE** com uma linha de status de testes
   (hoje: "sem cobertura automatizada") para que a lacuna fique visível na
   fonte de verdade. Aplicável agora, risco baixo.

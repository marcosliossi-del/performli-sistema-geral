# Área de Clientes — Portal Externo (documentação operacional)

> Fase 6. Todo passo a passo abaixo foi verificado contra o código real
> (não contra o plano). Última verificação: 11/07/2026.
> Documento-irmão: `docs/DIAGNOSTICO_AREA_CLIENTES.md` (Fase 0, decisões).

---

## 1. Visão geral e arquitetura

O portal do cliente (`/portal`) é um dashboard externo, somente leitura, onde o
lojista vê os KPIs da própria loja. Ele usa um **namespace de autenticação
totalmente separado** do staff interno: cookie próprio, JWT próprio, model
próprio (`ClientPortalUser`). Nenhum valor foi adicionado ao enum `Role`.

Fluxo de uma requisição autenticada:

```
Navegador do lojista
  │  cookie httpOnly `performli_portal` (JWT HS256, 7 dias)
  ▼
src/middleware.ts (bloco /portal)
  │  /portal/login é público; o resto exige JWT válido (mesmo SESSION_SECRET)
  │  token ausente/inválido → redirect /portal/login
  ▼
src/app/portal/page.tsx (Server Component)
  │  getAuthorizedClient()  ← guard OBRIGATÓRIO no topo
  ▼
src/lib/portal/session.ts → getAuthorizedClient()
  │  cookie → jwtVerify → ClientPortalUser no banco (active === true,
  │  clientId da sessão === clientId do registro) → Client canônico
  │  qualquer inconsistência: destrói cookie + redirect /portal/login
  ▼
src/lib/portal/kpis.ts → getPortalKpis(clientId, period)
  │  1 query MetricSnapshot filtrada por clientId (janela atual + anterior)
  │  cálculo via aggregateSnapshots (health-scorer) — mesma fonte das telas internas
  │  unstable_cache com chave ['portal-kpis', clientId, period], TTL 900s
  ▼
src/lib/portal/kpi-registry.ts (KPI_REGISTRY)
  │  define QUAIS KPIs existem, rótulo, formato, tipo de gráfico, helpText
  ▼
UI: src/app/portal/page.tsx + src/components/portal/* (KpiCard, PeriodSelector…)
```

Arquivos da área:

| Arquivo | Papel |
|---|---|
| `prisma/schema.prisma` (model `ClientPortalUser`, linha ~272) | Usuário externo: `clientId` FK cascade, `email @unique`, `passwordHash`, `active`, `failedAttempts`, `lockedUntil`, `lastLoginAt`, `@@index([clientId])` |
| `src/lib/portal/session.ts` | Cria/lê/destrói sessão do portal + `getAuthorizedClient()` |
| `src/lib/portal/kpis.ts` | `getPortalKpis`, `normalizePeriod`, janelas de período, cache |
| `src/lib/portal/kpi-registry.ts` | Registry de KPIs (config, sem lógica) |
| `src/app/actions/portalAuth.ts` | `portalLogin` / `portalLogout` (lockout por banco) |
| `src/app/actions/portalAccess.ts` | ADMIN: criar acesso, reset de senha, revogar/reativar |
| `src/app/portal/{layout,page,error}.tsx` + `login/page.tsx` | UI externa (layout próprio, sem sidebar interna) |
| `src/app/(dashboard)/portal-acessos/page.tsx` + `src/components/portal-admin/PortalAcessosManager` | Tela interna de gestão de acessos |
| `src/middleware.ts` | Bloco `/portal` no topo do middleware |

---

## 2. Fluxo de autenticação completo

### 2.1 Convite pelo admin (criação do acesso)
1. Admin (staff, papel ADMIN) abre `/portal-acessos` no sistema interno.
2. A tela lista clientes ACTIVE com seus acessos (`portalUsers`).
3. Ao criar, a action `createPortalAccess(clientId, email, name)`:
   - exige sessão de staff + `normalizeRole(role) === 'ADMIN'` (`requireAdmin`);
   - valida e-mail por regex e nome (≥ 2 chars);
   - verifica que o cliente existe e que o e-mail ainda não tem acesso;
   - gera senha temporária forte e legível (3 blocos de 4 chars, alfabeto sem
     0/O/1/l/I, via `crypto.randomInt`);
   - grava só o **hash bcrypt (custo 12)** — a senha em claro é retornada UMA
     vez ao admin e NUNCA vai para log/AuditLog;
   - registra `AuditLog` com action `portal.access.create`.

### 2.2 Login do lojista
1. Lojista acessa `/portal/login` (única rota pública do namespace) e envia
   e-mail + senha ao server action `portalLogin`.
2. A action busca o `ClientPortalUser` por e-mail (case-insensitive) e responde
   com **mensagem genérica única** para qualquer falha (e-mail inexistente,
   inativo, senha errada, conta bloqueada) — anti-enumeração:
   `"Credenciais inválidas ou acesso bloqueado. Tente mais tarde."`
3. Sucesso: zera `failedAttempts`/`lockedUntil`, grava `lastLoginAt`, cria o
   cookie `performli_portal` (JWT HS256, 7 dias, httpOnly, sameSite lax,
   secure em produção), registra `AuditLog` (`portal.login`, actorRole
   `CLIENT_PORTAL`) e redireciona para `/portal`.

### 2.3 Lockout (5 tentativas / 15 min)
- Estado vive **no banco** (serverless-safe), não em memória:
  `failedAttempts` e `lockedUntil` no `ClientPortalUser`.
- Cada senha errada incrementa `failedAttempts`; ao atingir **5**
  (`MAX_ATTEMPTS`), grava `lockedUntil = agora + 15 min` (`LOCK_MINUTES`).
- Com `lockedUntil` no futuro, o login é recusado com a mesma mensagem genérica.
- O contador só zera em login com sucesso ou reset de senha pelo admin.

### 2.4 Revogação e reativação
- `setPortalAccessActive(userId, false)` marca `active: false` (soft — nada é
  apagado); `true` reativa. `AuditLog`: `portal.access.revoke` /
  `portal.access.reactivate`.
- Efeito imediato mesmo com cookie ainda válido: `getAuthorizedClient()`
  revalida `active` no banco a cada página → sessão de usuário revogado é
  destruída e ele volta ao login.

### 2.5 Reset de senha
- Só pelo admin: `resetPortalPassword(userId)` gera nova senha temporária,
  grava novo hash, zera `failedAttempts`/`lockedUntil`, audita
  (`portal.access.reset_password`) e devolve a senha 1x na tela.
- Não existe "esqueci minha senha" self-service (ver §7).

### 2.6 Logout
- `portalLogout` apaga o cookie e redireciona para `/portal/login`.

---

## 3. Como adicionar um KPI novo (passo a passo real)

Todo KPI do portal vive em **um único arquivo**:
`src/lib/portal/kpi-registry.ts`. A UI e o cálculo derivam do array
`KPI_REGISTRY` — nunca hardcode KPI em componente.

### 3.1 Campos de `KpiDef`
```ts
export type KpiDef = {
  key: string        // identificador estável em snake_case (ex.: 'ticket_medio')
  metric: string     // chave de cálculo: um MetricType do Prisma OU 'SESSOES'
  label: string      // rótulo mostrado ao lojista (pt-BR)
  format: 'currency' | 'number' | 'percent' | 'ratio'
  chartType: 'line' | 'bar'
  provisional: boolean  // true = lista inicial aguardando validação com o cliente
  helpText: string   // linguagem de LOJISTA — explica o que o número diz
}
```

### 3.2 De onde vem a métrica
1. `getPortalKpis` (`src/lib/portal/kpis.ts`) carrega os `MetricSnapshot` do
   cliente e chama `computeValue(metric, snaps, businessType)` para cada KPI.
2. `computeValue` roteia:
   - `metric === 'SESSOES'` → `sumGa4Sessions` (soma do campo `clicks` dos
     snapshots de plataforma GA4 — **não existe coluna `sessions`** no schema);
   - qualquer outro `metric` → `aggregateSnapshots(snaps, metric as MetricType,
     businessType)` em `src/services/health-scorer.ts` — a MESMA função das
     telas internas de metas/saúde.
3. Portanto, um `metric` novo só funciona se:
   - já for um case tratado em `aggregateSnapshots` (ex.: FATURAMENTO,
     CONVERSIONS, TICKET_MEDIO, TAXA_CONVERSAO, INVESTMENT, ROAS, CAC…), **ou**
   - ganhar roteamento explícito em `computeValue` (como SESSOES).

### 3.3 Passos
1. Confirme que o dado existe: abra `aggregateSnapshots` em
   `src/services/health-scorer.ts` e verifique se o `MetricType` desejado é
   calculado a partir dos campos reais de `MetricSnapshot`.
2. Adicione o objeto `KpiDef` ao array `KPI_REGISTRY`, na posição desejada
   (a ordem do array é a ordem dos cards).
3. Escreva `helpText` em linguagem de lojista (regra de UX do CLAUDE.md).
4. Nada mais: `getPortalKpis` itera `KPI_REGISTRY` e a página renderiza os
   cards a partir dele. Formatação/gráfico saem de `format`/`chartType`.
5. O cache expira sozinho (TTL 900s); em dev, reinicie o server se necessário.

### 3.4 Quando o dado NÃO existe no schema (protocolo — Seção 7 do master prompt)
**NÃO inventar o número.** Nunca aproximar com outro campo "parecido", nunca
retornar zero fingindo ser dado real.
1. NÃO adicione o KPI ao registry.
2. Registre a dependência como pendência: qual dado falta, em qual fonte ele
   existiria (Meta/GA4/Nuvemshop…), o que precisa mudar no sync/schema.
   Anote no §7 deste documento (Limitações/débitos).
3. A coluna nova em `MetricSnapshot` (migration aditiva) + escrita no cron de
   sync são pré-requisitos; só depois o KPI entra no registry.
4. Exemplo real já tratado: "sessões" não é coluna — foi resolvido mapeando o
   campo `clicks` dos snapshots GA4, com roteamento explícito em `computeValue`.

---

## 4. Como criar acesso para um cliente novo

1. Logado como **ADMIN** no sistema interno, acesse `/portal-acessos`
   (entrada "Acessos do Portal" no sidebar; a página redireciona não-admins
   para `/`).
2. Localize o cliente (a lista traz clientes com status ACTIVE, ordem
   alfabética) e crie o acesso informando **nome** e **e-mail** do lojista.
3. O sistema exibe a **senha temporária UMA única vez** — copie e envie ao
   cliente por canal seguro. Ela não fica salva em lugar nenhum (só o hash).
4. Envie ao cliente a URL `/portal/login`.
5. Se a senha se perder: "Redefinir senha" na mesma tela gera outra (também
   exibida 1x) e destrava eventual lockout.
6. Para cortar o acesso: "Revogar" (soft, reversível). A tela também mostra o
   último login de cada acesso.

---

## 5. Variáveis de ambiente

| Variável | Uso no portal | Observação |
|---|---|---|
| `SESSION_SECRET` | Assina/verifica o JWT do cookie `performli_portal` (em `src/lib/portal/session.ts` e no `src/middleware.ts`) | **É o MESMO secret do auth interno** (`performli_session`). O isolamento entre staff e lojista vem do cookie/payload/model separados, NÃO de secrets distintos. Se um dia se quiser rotação independente, será preciso introduzir um secret próprio (ex.: `PORTAL_SESSION_SECRET`) — hoje NÃO existe. |
| `DATABASE_URL` | Indireto, via `@/lib/prisma` | Padrão do repo |
| `NODE_ENV` | `secure: true` no cookie apenas em produção | Padrão do repo |

Não há variável exclusiva do portal.

---

## 6. Isolamento de tenant — as 5 regras e onde cada uma vive

1. **Namespace de auth separado.** Cookie `performli_portal`, payload
   `PortalSession`, model `ClientPortalUser`. Nenhum valor `CLIENT` no enum
   `Role`. Vive em: `src/lib/portal/session.ts` + `prisma/schema.prisma`.
2. **clientId só da sessão assinada.** `clientId` JAMAIS vem de param, body,
   header ou querystring — só do JWT, revalidado contra o banco. Vive em:
   `src/lib/portal/session.ts` (`getAuthorizedClient`, checagem
   `user.clientId !== session.clientId` → destrói sessão).
3. **Guard em toda página/action do portal.** `getAuthorizedClient()` no topo
   de cada Server Component protegido. Vive em: `src/app/portal/page.tsx`
   (linha 24) — e é obrigatório em qualquer página nova do portal. O middleware
   (`src/middleware.ts`, bloco `/portal`) é a primeira barreira, não a única.
4. **Toda query filtra `clientId` explicitamente** (defesa em profundidade,
   mesmo com o guard). Vive em: `src/lib/portal/kpis.ts` —
   `prisma.metricSnapshot.findMany({ where: { clientId, ... } })` e
   `prisma.client.findUnique({ where: { id: clientId } })`.
5. **Cache sempre com `clientId` na chave.** Nunca cachear dado de cliente sem
   o tenant na chave. Vive em: `src/lib/portal/kpis.ts` —
   `unstable_cache(..., ['portal-kpis', clientId, period], { tags:
   ['portal-kpis:${clientId}'] })`.

---

## 7. Limitações conhecidas / débitos

1. **KPIs provisórios.** Os 7 KPIs atuais têm `provisional: true` — lista
   inicial aguardando a lista real validada com clientes. Trocar = editar só o
   `kpi-registry.ts`.
2. **Magic link não implementado.** Login é e-mail+senha com convite do admin.
   Magic link foi descartado por exigir fluxo de e-mail novo (Resend existe no
   repo, mas sem template/fluxo). Registrado como evolução.
3. **Sem "esqueci minha senha" self-service.** Reset só via admin em
   `/portal-acessos` (consequência do item 2).
4. **Teste automatizado de isolamento pendente.** O roteiro
   `tests/portal-tenant-isolation.test.md` previsto no diagnóstico (§3) **não
   existe no repo** hoje; a execução automatizada depende de CI com
   dependências de teste. Débito aberto.
5. **"Atualizado em" mostra o horário da renderização**, não o horário do
   último sync de `MetricSnapshot` (`src/app/portal/page.tsx`, `new Date()` em
   `KpiSection`). Como o cache tem TTL de 900s, o número exibido pode ser mais
   antigo que o carimbo. Melhorar: derivar do `SyncLog`/última data de snapshot.
6. **BUG conhecido de lookup do card** (divergência código×código): a página
   monta os cards com `data.get(def.metric)` (`src/app/portal/page.tsx:73`),
   mas `getPortalKpis` indexa o Map por `def.key`
   (`src/lib/portal/kpis.ts:186`). Como `key` ('faturamento') ≠ `metric`
   ('FATURAMENTO') em todos os KPIs, o lookup retorna `undefined` e os cards
   caem no estado vazio. Correção: usar `data.get(def.key)` na página (ou
   indexar por `metric` no loader). Registrado aqui; não corrigido nesta fase
   de documentação.
7. **`SESSION_SECRET` compartilhado** entre staff e portal (ver §5): rotação do
   secret derruba as duas populações de sessão ao mesmo tempo.

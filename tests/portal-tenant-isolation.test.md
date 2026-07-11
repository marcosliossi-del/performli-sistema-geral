# Prova de isolamento de tenant — Portal do Cliente (`/portal`)

> Evidência estática + roteiro de verificação manual. A regra inegociável do
> master prompt é: **um cliente NUNCA vê o dado de outro**, e o `clientId`
> **sempre** vem da sessão assinada no servidor — nunca de query param, body,
> header ou cookie manipulável.
>
> Este documento prova, por leitura do código, que não existe caminho pelo qual
> um usuário do portal alcance `clientId` diferente do seu, e dá o roteiro para
> reproduzir a prova em runtime quando houver ambiente com deps/CI.

---

## 1. O `clientId` é sempre derivado da sessão — nunca da requisição

Fonte única do `clientId` no portal: `getAuthorizedClient()` em
`src/lib/portal/session.ts`.

```
cookie performli_portal (JWT HS256, aud=performli-portal)
  → getPortalSession()  → valida assinatura + audience + shape
  → session.clientId    (veio do JWT que O SERVIDOR assinou no login)
  → revalida no banco: ClientPortalUser ativo E user.clientId === session.clientId
  → client = prisma.client.findUnique({ where: { id: session.clientId } })
```

Nenhuma página ou action do portal lê `clientId` de `searchParams`, `params`,
`headers()` ou `formData`. A dashboard (`src/app/portal/page.tsx`) obtém o
`clientId` exclusivamente de `getAuthorizedClient()` e o repassa para
`getPortalKpis(clientId, period)`.

**Verificação automatizável (grep):** não deve haver leitura de `clientId`
vinda da requisição em nenhum arquivo sob `src/app/portal/` ou
`src/lib/portal/`:

```bash
# Deve retornar VAZIO (nenhum clientId vindo de fora da sessão):
grep -rnE "searchParams|params\.clientId|formData\.get\(['\"]clientId|headers\(\)\.get\(['\"].*client" \
  src/app/portal src/lib/portal
```

## 2. O período (único input do usuário) é validado por whitelist

`getPortalKpis` recebe `period: PortalPeriod`. `normalizePeriod()`
(`src/lib/portal/kpis.ts`) mapeia a entrada crua para um enum fechado
(`7d | 14d | 30d | mes_atual | mes_anterior`), com fallback seguro. Não há
concatenação de input do
usuário em query — a agregação roda por `where: { clientId, date: {...} }` com
`clientId` fixo da sessão. Não há superfície de injeção de tenant pelo período.

## 3. Defesa em profundidade (3 camadas)

| Camada | Arquivo | O que garante |
|--------|---------|---------------|
| Middleware edge | `src/middleware.ts` | `/portal/*` (exceto `/portal/login`) exige cookie `performli_portal` com `aud=performli-portal`. Token interno (`aud=performli-staff`) é REJEITADO aqui. |
| Guard de sessão | `src/lib/portal/session.ts` | Revalida usuário ativo no banco e coerência `clientId` sessão↔registro. Qualquer divergência destrói o cookie e redireciona ao login. |
| Query de dados | `src/lib/portal/kpis.ts` | Todo `where` filtra por `clientId` da sessão. O cache (`unstable_cache`) tem chave `['portal-kpis', clientId, period]` — não há vazamento cruzado de cache entre tenants. |

## 4. Anti-confusão de token (namespaces com o mesmo `SESSION_SECRET`)

Staff e portal assinam com o mesmo `SESSION_SECRET`, então a assinatura sozinha
não distingue os dois. O discriminador é o claim **audience**:

- `createSession` (staff) assina com `aud=performli-staff`; `getSession` e o
  middleware exigem esse `aud` + shape (`userId`, `role`).
- `createPortalSession` assina com `aud=performli-portal`; `getPortalSession` e
  o middleware exigem esse `aud` + shape (`portalUserId`, `clientId`).

Resultado: um token de portal colado no cookie interno (`performli_session`) é
rejeitado por `audience`, e vice-versa. Sem o `aud`, um token válido de um
namespace seria aceito no outro — por isso a verificação está nos DOIS lados.

## 5. Roteiro de reprodução em runtime (quando houver deps/CI)

Pré-requisitos: banco de testes com 2 clientes (A, B), 1 `ClientPortalUser` em
cada, e MetricSnapshots distintos por cliente.

1. **Login isolado.** Autentique como usuário de A. Confirme que
   `GET /portal` mostra os KPIs de A. Faça logout.
2. **Sem vazamento por sessão.** Autentique como B. Confirme KPIs de B, nunca de A.
3. **clientId não é manipulável.** Com sessão de A ativa, tente
   `GET /portal?clientId=<id_de_B>` e variações em header/body. Esperado:
   continua mostrando A (o param é ignorado — o `clientId` vem da sessão).
4. **Cross-token rejeitado.** Copie o valor do cookie `performli_session` de um
   staff logado para o cookie `performli_portal` e acesse `/portal`. Esperado:
   redirect para `/portal/login` (audience não confere).
   Faça o inverso (portal→staff): esperado redirect para `/login`.
5. **Usuário revogado.** Com `setPortalAccessActive(userId, false)`, o próximo
   acesso de A deve cair no login mesmo com cookie ainda válido (revalidação no
   banco em `getAuthorizedClient`).
6. **Lockout.** 5 tentativas de senha errada → 6ª bloqueada por 15 min, com a
   mesma mensagem genérica das demais falhas (sem enumeração de e-mail).

Cada passo tem resultado esperado determinístico; qualquer desvio é REPROVAÇÃO
imediata da entrega (violação da regra "nunca expor dado de um cliente a outro").

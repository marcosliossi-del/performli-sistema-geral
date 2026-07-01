## Segurança

Auditoria da dimensão de segurança do PERFORMLI. Foco: middleware/RBAC, JWT,
endpoints públicos, webhooks e crons. Leitura read-only.

### (a) Modelo de auth/RBAC atual

- **Autenticação:** JWT (HS256) assinado com `SESSION_SECRET`, guardado em cookie
  httpOnly `performli_session` (`src/lib/session.ts`). `secure` só em produção,
  `sameSite: lax`, validade 7 dias. Verificação via `jose.jwtVerify` com
  `algorithms: ['HS256']` fixado (bom — evita `alg: none`).
- **Credenciais:** `verifyCredentials` (`src/lib/auth.ts`) usa `bcryptjs.compare`,
  checa `user.active`, mensagens de erro genéricas ("Credenciais inválidas").
- **Middleware de página:** `src/middleware.ts` protege prefixos listados em
  `PROTECTED_PREFIX` e redireciona não autenticados para `/login`. O matcher
  exclui `api`, então o middleware **não** protege rotas de API — cada rota de
  API é responsável por sua própria checagem via `getSession()`.
- **RBAC em API:** feito ad hoc dentro de cada handler (`session.role !== 'ADMIN'`
  etc). Não há helper central `requireRole`/`requireOwnership`; a validação de
  posse (ownership) para MANAGER está espalhada e não foi possível confirmar
  cobertura uniforme nesta dimensão.

### (b) Pontos fortes

- Algoritmo JWT fixado (`algorithms: ['HS256']`) no middleware e na sessão.
- Cookie httpOnly + `secure` em produção.
- Todos os 4 crons (`daily`, `digest`, `recurrences`, `resultados`) exigem
  `CRON_SECRET` via `Authorization: Bearer` ou `x-cron-secret`; se o secret não
  estiver setado, **rejeitam** tudo (fail-closed) — ver `cron/daily/route.ts:34`.
- Cron `daily` tem try/catch por etapa (não quebra a rotina inteira).
- Webhook Nuvemshop valida HMAC-SHA256 quando `NUVEMSHOP_APP_SECRET` existe
  (`nuvemshop/webhooks/route.ts:25`).
- `/api/seed` e `/api/debug/ga4` têm gate (secret / role ADMIN).
- Nenhum segredo hardcoded encontrado nos arquivos auditados — chaves vêm de
  `process.env` ou `IntegrationSetting` (ex.: `ZAPI_CLIENT_TOKEN`).

### (c) Vulnerabilidades por severidade

#### 🔴 Crítico

**1. Webhooks Asaas e WhatsApp autenticam apenas "se o secret existir" (fail-open).**
- `src/app/api/asaas/webhook/route.ts:15-21` — só valida `asaas-access-token` se
  `ASAAS_WEBHOOK_TOKEN` estiver setado. Sem a env var, qualquer um posta eventos
  de pagamento forjados (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`) e altera o
  estado financeiro (dinheiro em risco).
- `src/app/api/webhooks/whatsapp/route.ts:19-24` — só valida `client-token` se
  `IntegrationSetting.ZAPI_CLIENT_TOKEN` existir. Sem ele, qualquer um cria
  `AgencyLead`/`AgencyActivity` arbitrários (spam/poluição do CRM).
- `src/app/api/nuvemshop/webhooks/route.ts:25` — HMAC só é checado se
  `appSecret && hmacHeader`; um atacante que omita o header pula a verificação e
  injeta pedidos/receita falsos em `MetricSnapshot`.
  Correção: fail-closed — se o secret de produção não estiver configurado, **negar**.

**2. `/api/nuvemshop/install` é público e cria Client + PlatformAccount sem sessão.**
- `src/app/api/nuvemshop/install/route.ts:21` — endpoint público que, com um
  `code` OAuth válido, cria automaticamente um novo `Client` no banco. Qualquer
  fluxo de instalação (ou um atacante com um code) injeta clientes na base sem
  vínculo a nenhum usuário/atribuição. É um endpoint de mutação de dados
  canônicos sem autenticação do Performli.

#### 🟠 Alto

**3. `/api/seed` cria usuários com senhas fracas conhecidas e é acionável em produção.**
- `src/app/api/seed/route.ts:5-16` — protegido só por `SEED_SECRET` (header
  `x-seed-secret`). Cria ADMIN `admin@performli.com.br` com senha `admin123`
  (também `gestor123`, `analista123`). Se `SEED_SECRET` estiver setado em prod (ou
  vazar), cria-se um admin de senha trivial. **Não** há guarda de
  `NODE_ENV !== 'production'`. Se `SEED_SECRET` for undefined, o compare
  `secret !== undefined` já barra — mas o risco é a existência do endpoint em prod.
  Correção: bloquear em produção e/ou remover após bootstrap; nunca semear senhas fixas.

**4. `/api/debug/ga4` exposto em produção (retorna dados brutos de terceiros).**
- `src/app/api/debug/ga4/route.ts` — exige ADMIN (bom), mas o próprio comentário
  diz "Remover após diagnóstico". Endpoint de debug não deve viver em produção;
  vaza receita/sessões brutas de GA4 de qualquer property informada.

**5. `/api/leads/capture` público com CORS `*` reflexivo e sem rate limit.**
- `src/app/api/leads/capture/route.ts:32,117-123` — `Access-Control-Allow-Origin`
  reflete a origin recebida (efetivamente `*`) e não há rate limiting em nenhum
  endpoint (grep de `rateLimit` só acha em meta-ads sync). Permite flood de
  `AgencyLead` e enumeração/atualização de leads por telefone (dedupe por
  `phone.slice(-9)` no `update`). Correção: rate limit + allowlist de origins.

**6. Ausência total de rate limiting no login e endpoints públicos.**
- Não há rota `/api/auth/login` custom localizada nesta auditoria (login
  provavelmente via server action), mas `verifyCredentials` não tem proteção
  contra brute force. Combinado com a ausência de rate limit global, há exposição
  a força bruta de credenciais.

#### 🟡 Médio

**7. `PROTECTED_PREFIX` é uma allowlist manual — risco de rota nova descoberta.**
- `src/middleware.ts:7` — proteção por lista explícita de prefixos. Qualquer
  página nova cujo path não comece por um prefixo listado fica **pública** por
  omissão. Hoje as páginas vivem sob route groups (`(dashboard)`) e o path público
  raiz `/` cai no grupo autenticado, mas o modelo é frágil. A raiz `/` não está em
  `PROTECTED_PREFIX` nem em `PUBLIC_ROUTES` — não redireciona anônimos.
  Correção: inverter para deny-by-default (proteger tudo exceto uma allowlist pública).

**8. Webhooks retornam 200 mascarando erros / silenciam falhas de auth.**
- `asaas/webhook/route.ts:44-47` engole exceções e retorna `received:true`;
  dificulta detectar abuso. Menor, mas reduz observabilidade de segurança.

**9. `/api/webhooks/whatsapp/test` (ADMIN) faz SSRF-lite para a própria origin.**
- `webhooks/whatsapp/test/route.ts:17-18` — faz `fetch` para `req.nextUrl.origin`.
  Baixo risco (origin controlada, gate ADMIN), mas endpoint de teste em produção.

### 🔒 Travas / Fluidez (correções seguras)

Correções aditivas, sem quebrar deploy nem remover funcionalidade:

1. **Fail-closed nos 3 webhooks** (Asaas, WhatsApp, Nuvemshop): se a env/secret de
   produção não estiver setada, retornar 401 em vez de aceitar. Baixo risco;
   exige apenas garantir as envs configuradas antes do deploy.
2. **Guardar `/api/seed` e `/api/debug/ga4` atrás de `NODE_ENV !== 'production'`**
   (early-return 404). Trava simples, sem efeito em dev.
3. **Trocar senhas fixas do seed por variáveis de ambiente** (ou gerar aleatórias
   e logar uma vez). Remove admin `admin123`.
4. **Rate limit leve** (por IP) em `/api/leads/capture` e no fluxo de login, e
   **allowlist de origins** no CORS em vez de refletir a origin.
5. **Autenticar `/api/nuvemshop/install`** ou restringir criação de Client a um
   fluxo com `state` assinado/validado (como o callback já faz), evitando criação
   anônima de clientes canônicos.
6. **Inverter o middleware para deny-by-default** numa fatia futura (maior risco de
   regressão — validar todas as páginas/route groups antes).

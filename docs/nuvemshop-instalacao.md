# Guia de Instalacao — App Nuvemshop no Performli

## Visao Geral

Este guia explica como configurar a integracao da Nuvemshop com o Performli,
desde a criacao do app no painel de parceiros da Nuvemshop ate a conexao
com a loja do seu cliente.

A integracao permite:
- Coletar dados reais de vendas (pedidos, receita, status de pagamento)
- Receber atualizacoes em tempo real via webhooks
- Cruzar dados da Nuvemshop com o GA4 para eliminar divergencias

---

## Passo 1 — Criar o App no Painel de Parceiros da Nuvemshop

1. Acesse o painel de parceiros: https://partners.nuvemshop.com.br
2. Faca login (ou crie uma conta de parceiro se ainda nao tiver)
3. No menu lateral, clique em **"Aplicativos"** > **"Criar aplicativo"**
4. Preencha as informacoes do app:

   | Campo                  | Valor                                                     |
   |------------------------|-----------------------------------------------------------|
   | Nome do aplicativo     | `Performli`                                               |
   | URL de redirecionamento| `https://SEU_DOMINIO/api/nuvemshop/callback`              |
   | URL do aplicativo      | `https://SEU_DOMINIO`                                     |

   > Substitua `SEU_DOMINIO` pela URL real do seu Performli
   > (ex: `https://app.performli.com.br`)

5. Em **Permissoes (scopes)**, marque:
   - `read_orders` — Ler pedidos
   - `write_orders` — Atualizar pedidos (para marcar cruzamentos)
   - `read_products` — Ler produtos (para detalhes dos itens)
   - `read_customers` — Ler dados de clientes

6. Clique em **"Criar aplicativo"**
7. Anote os dados gerados:
   - **App ID** (Client ID)
   - **Client Secret**

---

## Passo 2 — Configurar Variaveis de Ambiente

Adicione as seguintes variaveis de ambiente no seu projeto (Vercel, `.env.local`,
ou onde voce gerencia suas env vars):

```env
# Credenciais do App Nuvemshop (do Passo 1)
NUVEMSHOP_APP_ID=12345
NUVEMSHOP_APP_SECRET=abcdef1234567890abcdef1234567890

# URL base do Performli (ja deve estar configurada)
NEXT_PUBLIC_APP_URL=https://app.performli.com.br
```

### No Vercel:

1. Acesse o projeto no dashboard do Vercel
2. Va em **Settings** > **Environment Variables**
3. Adicione cada variavel acima
4. Faca um novo deploy para aplicar as variaveis

### Em desenvolvimento local:

1. Abra o arquivo `.env.local` na raiz do projeto
2. Adicione as variaveis acima
3. Reinicie o servidor de desenvolvimento (`npm run dev`)

---

## Passo 3 — Executar a Migration do Banco de Dados

A integracao adiciona novas tabelas ao banco. Execute a migration:

```bash
npx prisma migrate deploy
```

Isso criara as tabelas:
- `NuvemshopStore` — Armazena credenciais e dados da loja
- `NuvemshopOrder` — Armazena os pedidos com UTMs e status

---

## Passo 4 — Conectar a Loja de um Cliente

Existem duas formas de conectar:

### Opcao A: Via fluxo OAuth (recomendado)

Este e o metodo mais simples. O lojista autoriza o app diretamente.

1. Faca login no Performli como **ADMIN** ou **MANAGER**
2. Acesse a pagina do cliente que deseja conectar
3. Abra no navegador a URL:

   ```
   https://SEU_DOMINIO/api/nuvemshop/auth?clientId=ID_DO_CLIENTE
   ```

   > Substitua `ID_DO_CLIENTE` pelo ID do cliente no Performli
   > (voce encontra na URL da pagina do cliente, ou via banco de dados)

4. Voce sera redirecionado para a Nuvemshop
5. Faca login na conta da loja do cliente (ou peca para o lojista fazer)
6. Clique em **"Autorizar"** para permitir o acesso
7. Voce sera redirecionado de volta ao Performli com a mensagem de sucesso

**O que acontece automaticamente:**
- O access token da loja e salvo no banco
- Os webhooks sao registrados (pedido criado, pago, atualizado, cancelado)
- A conta de plataforma `NUVEMSHOP` e criada e vinculada ao cliente

### Opcao B: Vinculacao manual (para quem ja tem o token)

Se voce ja possui o `store_id` e `access_token` da loja:

1. Use a server action `linkNuvemshopStore` no codigo:

   ```typescript
   import { linkNuvemshopStore } from '@/app/actions/platformAccounts'

   const result = await linkNuvemshopStore(
     'ID_DO_CLIENTE',      // clientId do Performli
     '1234567',            // store_id da Nuvemshop
     'token_abc123...',    // access_token
     'Nome da Loja'        // nome (opcional)
   )
   ```

2. Neste caso, voce precisara registrar os webhooks manualmente
   (veja o Passo 6)

---

## Passo 5 — Fazer o Primeiro Sync de Dados

Apos conectar a loja, dispare o primeiro sync para importar os pedidos:

### Via API (recomendado):

```bash
curl -X POST https://SEU_DOMINIO/api/sync/nuvemshop \
  -H "Content-Type: application/json" \
  -H "Cookie: performli_session=SEU_TOKEN_DE_SESSAO" \
  -d '{"clientId": "ID_DO_CLIENTE"}'
```

### Via cron secret (para automacao):

```bash
curl -X POST https://SEU_DOMINIO/api/sync/nuvemshop \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: SEU_CRON_SECRET" \
  -d '{}'
```

> O segundo comando sincroniza TODAS as lojas ativas.

### Parametros opcionais:

Adicione `?since=2026-01-01&until=2026-04-13` na URL para definir
o periodo de importacao. Por padrao, importa do inicio do mes atual ate hoje.

**O sync faz:**
1. Busca todos os pedidos do periodo na API da Nuvemshop
2. Salva cada pedido na tabela `NuvemshopOrder` (com UTMs extraidos)
3. Agrega receita e conversoes por dia no `MetricSnapshot`
4. Recalcula health scores do cliente
5. Dispara alertas se houver mudancas

---

## Passo 6 — Verificar Webhooks (opcional)

Os webhooks sao registrados automaticamente no fluxo OAuth (Passo 4A).
Para verificar ou registrar manualmente:

### Verificar webhooks registrados:

```bash
curl https://api.nuvemshop.com.br/v1/STORE_ID/webhooks \
  -H "Authentication: bearer ACCESS_TOKEN" \
  -H "User-Agent: Performli/1.0"
```

### Registrar webhook manualmente:

```bash
curl -X POST https://api.nuvemshop.com.br/v1/STORE_ID/webhooks \
  -H "Authentication: bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Performli/1.0" \
  -d '{
    "event": "order/paid",
    "url": "https://SEU_DOMINIO/api/nuvemshop/webhooks"
  }'
```

Eventos que devem estar registrados:
- `order/created` — Novo pedido
- `order/updated` — Pedido atualizado
- `order/paid` — Pedido pago
- `order/cancelled` — Pedido cancelado

---

## Passo 7 — Visualizar a Reconciliacao (Nuvemshop vs GA4)

Para ver o cruzamento de dados entre Nuvemshop e GA4:

### Via API:

```bash
curl "https://SEU_DOMINIO/api/nuvemshop/reconciliation?clientId=ID_DO_CLIENTE" \
  -H "Cookie: performli_session=SEU_TOKEN_DE_SESSAO"
```

### Via componente no dashboard:

O componente `ReconciliationCard` pode ser adicionado na pagina do cliente:

```tsx
import { ReconciliationCard } from '@/components/nuvemshop/ReconciliationCard'

// Na pagina do cliente:
<ReconciliationCard clientId="ID_DO_CLIENTE" />
```

### O que a reconciliacao mostra:

- **Receita Nuvemshop vs GA4** — Comparacao diaria de valores
- **Pedidos vs Transacoes** — Quantidade real vs reportada
- **% de divergencia** — Classificada como OK (<=5%), Warning (5-15%), Critical (>15%)
- **Pedidos sem tracking** — Vendas sem UTM (nao aparecem no GA4)
- **Status geral** — Indicador visual de saude dos dados

---

## Passo 8 — Sync Automatico (Cron Diario)

O sync da Nuvemshop ja esta integrado ao cron diario do Performli.

Se voce ja tem o cron configurado no Vercel (`/api/cron/daily`),
a Nuvemshop sera sincronizada automaticamente todos os dias as 09:00 BRT
junto com Meta Ads, GA4 e Google Ads.

Nada mais precisa ser feito — o cron cuida de tudo.

---

## Resolucao de Problemas

### "NUVEMSHOP_APP_ID nao configurado"
- Verifique se as variaveis de ambiente estao definidas
- No Vercel, faca redeploy apos adicionar as variaveis

### "Falha na troca do codigo OAuth"
- Verifique se o `NUVEMSHOP_APP_SECRET` esta correto
- Verifique se a URL de redirecionamento no painel de parceiros
  bate exatamente com `https://SEU_DOMINIO/api/nuvemshop/callback`

### Webhooks nao estao chegando
- Verifique se a URL do Performli e publica (nao localhost)
- Verifique se os webhooks estao registrados (Passo 6)
- Em dev local, use um tunel como ngrok para expor a porta

### Divergencia muito alta entre Nuvemshop e GA4
Causas comuns:
- **Tag do GA4 nao disparando** em todas as paginas de compra
- **Bloqueadores de anuncio** impedindo o GA4 de rastrear
- **Pedidos via WhatsApp/telefone** que nao passam pelo site
- **UTMs ausentes** nos links de campanha

### Migration falhou
```bash
# Verifique o status das migrations
npx prisma migrate status

# Force deploy se necessario
npx prisma migrate deploy
```

---

## Resumo das URLs do App

| Rota                              | Metodo | Descricao                          |
|-----------------------------------|--------|------------------------------------|
| `/api/nuvemshop/auth`             | GET    | Inicia o fluxo OAuth               |
| `/api/nuvemshop/callback`         | GET    | Callback do OAuth                  |
| `/api/nuvemshop/webhooks`         | POST   | Recebe webhooks da Nuvemshop       |
| `/api/nuvemshop/reconciliation`   | GET    | Consulta reconciliacao             |
| `/api/nuvemshop/reconciliation`   | POST   | Executa cruzamento de dados        |
| `/api/sync/nuvemshop`             | POST   | Sync manual de pedidos             |

## Variaveis de Ambiente

| Variavel               | Obrigatoria | Descricao                          |
|------------------------|-------------|------------------------------------|
| `NUVEMSHOP_APP_ID`     | Sim         | ID do app no painel de parceiros   |
| `NUVEMSHOP_APP_SECRET` | Sim         | Client secret do app               |
| `NEXT_PUBLIC_APP_URL`  | Sim         | URL base do Performli              |
| `CRON_SECRET`          | Sim*        | Secret para autenticacao do cron   |

> *`CRON_SECRET` ja deve estar configurado para os outros syncs.

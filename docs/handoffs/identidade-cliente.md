# Handoff — Identidade padronizada do cliente

Padrão visual: **nome fantasia em destaque + razão social como subtexto discreto**
(`text-[10px] text-[#647488]`, truncada com `title` = razão completa). Mesmo padrão
já usado no Jurídico (ContractsTable).

## Componente único
- `src/components/clients/ClientIdentity.tsx` — server-safe (sem hooks). Props
  `{ name, razaoSocial?, href?, size? }`. Sem razão → só a fantasia (zero mudança
  visual). Link opcional na fantasia.

## Superfícies alteradas
- **Lista /clients** — `src/components/clientes/ClientesTable.tsx` usa `ClientIdentity`
  na coluna Nome (mantém e-mail como 3ª linha). `ClientRow` ganhou `razaoSocial`.
  Select da page estendido: `src/app/(dashboard)/clients/page.tsx` (`razaoSocial: true`).
- **Header do cliente** — `src/app/(dashboard)/clients/[slug]/page.tsx`: razão social
  como subtexto discreto sob o `<h1>` (já vinha no `getClientDetail`).
- **/financeiro** — `src/app/(dashboard)/financeiro/page.tsx` (query `topEntradas`
  agora inclui `customer.client { name, razaoSocial }`) + `MovimentacoesTable.tsx`:
  entradas preferem o cliente vinculado (fantasia + razão). Sem vínculo, mantém o
  nome cru do Asaas + selo âmbar `(sem vínculo)` com tooltip explicando o porquê.
- **Hub de Suporte** — `src/components/suporte/SupportList.tsx`: célula do cliente
  ganhou `title` = razão social (tooltip nativo, sem 2ª linha — lista densa).
  `SupportRow` ganhou `clientRazaoSocial`; query da page (`suporte/page.tsx`) inclui
  `razaoSocial`.
- **TaskPanel** — `src/components/tasks/TaskPanel.tsx`: link do cliente ganhou `title`
  = razão social. Shape estendido em `src/lib/tasks/panel.ts` (`client.razaoSocial`).
- **Selects de cliente** — `ContractFormModal` (Jurídico) e `NewSupportDemand`
  (Suporte) mostram `Fantasia — Razão` na `<option>` quando há razão. Cadeia de tipos
  atualizada (`getClientsForSelect` na DAL agora retorna `razaoSocial`; `JuridicoPageTabs`,
  `ContractsTable`, `ContractFormModal`, `NewSupportDemand`).

## Fora do escopo (intencional)
- **Cockpit / dashboard / anti-churn** — cards densos; identidade completa poluiria.
- **SupportBoard (cards)** — o pedido restringiu Suporte à `SupportList`. Cards não
  receberam razão social para não adensar.
- **reports/operations pages** — consomem `getClientsForSelect` (agora traz `razaoSocial`),
  mas seus selects não foram alterados por não fazerem parte das superfícies-chave.
  Mudança na DAL é aditiva, não quebra esses consumidores.

## Notas técnicas
- Todas as mudanças de dados são **aditivas** (nenhum campo removido de select/shape).
- Nenhum `any`. Sem novas chamadas fora da DAL/queries já existentes.
- `Client.razaoSocial` já existia (migration `20260702050000_client_razao_social`).

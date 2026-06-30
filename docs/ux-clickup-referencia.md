# Referência de UX — ClickUp atual da Arkza

> Prints enviados pelo Marcos (30/06) do workspace ClickUp real, para orientar
> tanto os POPs restantes quanto o **redesign final de UX** do Performli.
> O objetivo NÃO é copiar o ClickUp, e sim entender a organização atual da Arkza
> e entregar algo **mais operacional e mais bonito** que ele.

## 1. Estrutura de navegação (sidebar do ClickUp)
Espaços → Pastas → Listas (cada lista com contador de itens):
- **_Comercial & Vendas**
- **_Gestão Interna** → _Head de Performance · _Supervisor · _Time de CS (Suporte 19, Tarefas CS 6) · _Time de Performance · Rotinas
- **_Administrativo** → CRM [Clientes Ativos] (Gestão de Clientes 41) · Jurídico · Financeiro (Contas a Receber 31, Contas a Pagar 12) · Notas Fiscais · Objetivos & Metas · Processos
- **_Gestão de Pessoas** → Recursos Humanos · Área de Contratação · Equipe
- **_Recorrentes - Tráfego** → uma "lista" por cliente, cada um com ~15 tarefas recorrentes

Implicação p/ Performli: a navegação atual já é por **área → processo → cliente**.
O Performli já modela Área→POP→Lista→Tarefa — alinhado. As 7 áreas do Performli
mapeiam para esses espaços.

## 2. Cronograma de Atividades (a tela mais importante p/ replicar melhor)
Lista de tarefas **agrupada por data de vencimento**: "Hoje (3)", "Amanhã (4)",
"Quinta-feira (2)"… com contador por grupo. Colunas:
- **Nome** da tarefa (ex.: "PLANET - PIX", "MICHELLE - NOVOS CRIATIVOS")
- **Status**: pill "PARA FAZER" (amarelo) — poucos status visuais
- **Cliente**: dropdown (Planet Imports, Michelle Rossi…)
- **Categoria**: pill colorida —
  - **Tráfego** = azul
  - **Demanda da Agência** = amarelo
  - **Sucesso do Cliente** = roxo
- **Responsável**: avatar
- Ícone de **recorrência** quando a tarefa é recorrente
- Linha "+ Adicionar Ocorrência" por grupo

→ Isto é exatamente o "Meu Dia / Minha Semana" do Performli (Bloco 4). O redesign
deve aproximar visualmente: grupos por data com contador, pills de categoria
coloridas, densidade de linha compacta, avatar do responsável à direita.
**Categoria** é um conceito novo útil (mapear para `Task.area`/`type` ou tags).

## 3. Financeiro — Overview (dashboard de cards)
Cards grandes de KPI: **MRR** (R$ 60.270,54), Recebimentos da Semana, Recebimentos
do Mês, **Inadimplência** (vermelho), Recebidos da Semana/Mês, **Ticket Médio**.
Gráfico de barras **Faturamento Realizado vs Previsto** (Para Receber amarelo /
Pendente vermelho / Recebida verde). → Performli já tem /financeiro; o redesign
deve usar cards grandes e numéricos como esses, com cor semântica (vermelho p/
inadimplência).

## 4. Gestão da Carteira [TODOS] (tabela de clientes — visões por papel)
Abas: Todos os Clientes · **Gestão da Carteira [TODOS]** · [LETICIA] · [MARCOS] …
(uma visão filtrada por gestor — exatamente o "Por Gestor" do Bloco 4).
Colunas ricas com pills/cores:
- **Curva** ABC (A verde, B amarelo, C vermelho) — classificação de valor do cliente
- **Tipo de Negócio**: Ecommerce / Negócio Local / B2B (pills coloridas)
- **Possível Churn**: Sim (vermelho) / Não (verde) → `ChurnRiskScore`
- **Sala de Guerra**: Sim/Não → `CriticalProtocol` (War Room)
- **Gestor de Tráfego** (avatar) · **Head de Tráfego** (avatar)

→ Conceitos a considerar no Performli: **Curva ABC do cliente** (campo novo? ou
derivar do MRR/contrato) e **Categoria de tarefa**. Avaliar no POP de CS/carteira.

## Diretrizes visuais extraídas (para o redesign final)
- Tema escuro, alto contraste, **pills de status/categoria coloridas e arredondadas**.
- Densidade **compacta** em tabelas/listas (muitas linhas visíveis), com avatares.
- Agrupamento por data/seção com **contadores**.
- Cards de KPI grandes com número em destaque e cor semântica.
- Abas por visão/papel no topo da tabela.
- Navegação lateral por área com contadores.
- Paleta de referência: azul (tráfego/ação), amarelo (atenção/pendência), vermelho
  (crítico/churn/inadimplência), verde (ok/recebido), roxo (sucesso do cliente).
  → No redesign, refinar para algo mais sofisticado mantendo esse mapa semântico.

## 5. Gestão da Carteira — visão de CS (colunas adicionais)
A mesma tabela de clientes, vista pela CS, tem colunas de relacionamento/saúde:
- **Produtos**: pills (Tráfego Pago, CRM, Traqueamento) — serviços contratados
- **Relacionamento**: Ótimo (verde) / Regular (amarelo) / Ruim (vermelho)
- **Resultado**: Péssimo / Ruim / Regular / Bom (escala de cor)
- **Etapa**: Otimização / Monitoramento (estágio do cliente na operação)
- **NPS**: Ruim / Neutro / Promotor (vermelho/amarelo/verde)
- **Curva** A/B/C

→ Mapear no Performli: `HealthScore`/`ClientStatusStreak` já cobrem saúde; mas
**Relacionamento, Resultado, Etapa, NPS, Produtos e Curva** são dimensões de CS
que hoje não existem como campo. Avaliar no POP de CS (CSX) se viram campos do
Client ou custom fields. NÃO criar model novo sem necessidade (usar Client + enums
ou TaskCustomField). É a "ficha do cliente" que a CS preenche.

## 6. Dashboard "Overview" de Gestão Interna (referência forte p/ o Cockpit)
Layout em grid de cards + feed:
- Linha de **KPIs numéricos grandes**: "Tarefas Atrasadas 9", "Em progresso 2",
  "Solicitações Hoje 4", "Concluído Hoje 0".
- **Status nessa semana**: barra horizontal por status (PARA FAZER…).
- **Tarefas abertas por responsável**: gráfico de barras por pessoa (Leandro 5,
  Letícia 2, Marcos 3, Pablo 5) — = `getGestoresCarga` do Bloco 4.
- **Tarefas concluídas nesta semana** agrupadas por responsável (com avatares).
- **Tarefas com vencimento nesta semana ou atrasadas**: lista agrupada
  "Em atraso (2) / Hoje (1)" com responsável, data (vermelho se atrasada),
  prioridade (bandeira) e ícone de recorrência — = "Meu Dia" do Bloco 4.
- **Prazo de entrega**: gráfico de estimativas de tempo.
- Coluna direita: **Últimas atividades** (feed: "Letícia definiu Categoria como
  Tráfego", "definiu prioridade como Urgent", "atribuiu a: Pablo"…) com timestamps.

→ Isto valida o Cockpit + Meu Dia + carga por gestor do Performli. O redesign deve
consolidar numa **única tela densa** (KPIs no topo, gráficos no meio, feed lateral),
e o feed de atividades pode reusar `TaskActivity`/`AuditLog`.

## Conceitos de dados a considerar nos POPs restantes (do CRM atual)
- **Curva ABC** do cliente (valor) — derivar de MRR/contrato ou campo no Client.
- **Categoria da tarefa**: Tráfego / Demanda da Agência / Sucesso do Cliente.
- **Ficha de CS**: Relacionamento, Resultado, Etapa, NPS, Produtos.
- **Sala de Guerra / Possível Churn** já existem (CriticalProtocol, ChurnRiskScore).
Decidir cada um no POP correspondente (CSX para a ficha de CS), sem criar models
desnecessários.

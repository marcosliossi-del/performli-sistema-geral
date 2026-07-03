# Migração das Rotinas Recorrentes de E-commerce — NÍVEL 2: Propostas de Otimização

> **Cliente-modelo desta rodada:** Lalluzi Store · **Nicho:** e-commerce de moda
> **Origem:** ClickUp → Performli · **Escopo:** 16 tarefas recorrentes da rotina de tráfego/CS/CRM

---

## Como ler este documento

**(a) A versão FIEL (Nível 1) já está no ar.**
As 16 tarefas recorrentes foram recriadas no Performli **idênticas ao ClickUp**
(nome genérico, descrição integral, checklist bloqueando conclusão, responsável,
categoria, etiquetas, recorrência ancorada na data de início e prorrogação para
dia útil) e estão em produção na **Lalluzi Store**. **Nenhuma** das propostas
deste documento altera, apaga ou "melhora" a versão fiel. A baseline permanece
como está — ela é a fonte de verdade auditável 1:1 contra o ClickUp.

**(b) Cada OPT só é aplicada após aprovação explícita do Marcos (GATE 2).**
Este é o entregável do Nível 2. Cada item OPT-1…OPT-9 é uma **proposta isolada e
auditável**, para o Marcos aprovar **item a item**. Otimizações reprovadas são
descartadas sem afetar nada; otimizações aprovadas entram em backlog de
implementação (que ainda passa pelo fluxo normal de agentes: arquitetura →
escrita → guardião). Aprovar um OPT aqui **não** é aprovar código — é liberar o
item para ser desenhado e construído.

**(c) A regra 4.8 é intocável.** Toda proposta preserva o princípio estrutural
"**CS é a única ponte externa**": Gestor de Tráfego (Pablo) e Gestor de CRM (Kyn)
nunca falam direto com o cliente. Todo output destinado ao cliente é postado no
**canal interno de comunicação do cliente** e **a CS (Leticia) faz o envio
externo** (WhatsApp). As automações abaixo só automatizam o *elo interno*
(handoff, coleta de dados, pré-avaliação) — o botão de "enviar ao cliente"
continua nas mãos da CS, com double check (regra 4.9).

---

## Tabela-resumo

| OPT | Tarefa(s) do prompt | Esforço estimado | Preserva 4.8? |
|-----|---------------------|------------------|---------------|
| OPT-1 | 5 → 8 (Gestor→CS, criativos) | **Médio** | Sim — CS segue como executora do repasse |
| OPT-2 | 6 → 9 (Gestor→CS, relatório mensal) | **Médio** | Sim — CS valida e envia |
| OPT-3 | 3 e 6 (check-in semanal/mensal) | **Alto** | Sim — handoff termina na CS |
| OPT-4 | 10 (QA dos check-ins) | **Alto** | Sim — CS revisa e aprova o envio |
| OPT-5 | 11 (revisão diária de budget) | **Médio** | Sim — alerta é interno, ao gestor |
| OPT-6 | 3, 4, 11 (resumo "enviar no chat") | **Baixo** | Sim — alimenta o handoff para a CS |
| OPT-7 | 13 (desativação de anúncios) | **Alto** | Sim — CS segue como interface com o cliente |
| OPT-8 | 15 e 16 (relatórios CRM) | **Médio** | Sim — CS mantém o envio externo |
| OPT-9 | 6, 7, 9, 15 (virada de mês) | **Baixo/Médio** | Sim — não toca no envio externo |

> **Legenda de esforço:** Baixo = aditivo/configuração sobre peça existente ·
> Médio = estender um motor já existente (ex.: `TaskAutomationRule`) ·
> Alto = construir capacidade nova (reporting nativo, motor de exceção,
> integração de dados por anúncio).

---

## OPT-1 · Handoff automático Gestor→CS (criativos)

**Refere-se a:** Tarefa 5 (Solicitação de Novos Criativos — Gestor) → Tarefa 8
(Enviar Solicitação de Criativo — CS). Par-espelho (regra 4.9).

**Problema hoje (processo manual/ClickUp).**
São duas tarefas independentes e desconectadas. O gestor cria a solicitação de
criativos (qua 12h) e a CS, numa tarefa separada (qua 15h), precisa **"verificar
se o gestor enviou as solicitações de criativo da semana, via chat"** — ou seja,
a CS gasta tempo checando manualmente se o insumo apareceu, e o elo depende de
disciplina e do olho da CS. Se o gestor atrasar, ninguém é avisado até a CS ir
conferir.

**Proposta.**
Ao **concluir a Tarefa 5**, o Performli dispara automaticamente a Tarefa 8 (ou a
marca como "insumo pronto"), já populada com o briefing de criativos que o gestor
escreveu. Elimina o item de checklist "verificar se o gestor enviou". **SLA:** se
o gestor não concluir a Tarefa 5 até 12h de quarta, o sistema alerta/escala
(Alert), em vez de a falha ficar silenciosa. A CS continua sendo quem repassa a
solicitação ao cliente.

**O que já existe.**
- O canal interno de comunicação existe (`ClientChat`/`ClientChatMessage`) e há o
  helper `postSystemChatMessage(clientId, authorUserId, content)` em
  `src/services/client-lifecycle-automations.ts` para postar o briefing no canal
  programaticamente.
- **Existe** um precedente de "concluir task → cria task", mas **hardcoded**: o
  fluxo ONB-04 conclui → cria ONB-05 em `src/app/actions/tasks.ts`.
- O motor `TaskAutomationRule` já dispara em eventos de task, com ações `notify`
  (cria Alert) e `assign` (troca responsável) — o `notify` já cobre a parte do
  **SLA/escalação**.

**O que falta construir.**
- O motor `TaskAutomationRule` **não** cria tarefas. Para o handoff, é preciso OU
  replicar o padrão hardcoded ONB-04→ONB-05 para o par 5→8, OU (melhor,
  reaproveitável) **estender o `TaskAutomationRule` com uma ação nova
  `create_task`/`handoff`** que instancia a tarefa-alvo e carrega o payload
  (briefing).
- Regra de SLA "não concluída até qua 12h → escalar" (gatilho por prazo, não só
  por evento de conclusão).

**Preserva a regra 4.8?** **Sim.** O disparo é interno (cria/prepara a tarefa da
CS); quem envia a solicitação ao cliente continua sendo a CS.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-2 · Handoff automático Gestor→CS (relatório mensal)

**Refere-se a:** Tarefa 6 (Check-in Mensal — Gestor) → Tarefa 9 (Envio do
Relatório Mensal — CS). Par-espelho (regra 4.9).

**Problema hoje.**
Ao concluir o check-in mensal, o gestor posta o relatório no chat. A CS, na
Tarefa 9, precisa **"localizar o relatório no chat interno"**, validar e só então
enviar. A localização manual é frágil (relatório some no meio do chat, CS não
sabe se já saiu, etc.).

**Proposta.**
Concluir a Tarefa 6 **dispara** a Tarefa 9 com o relatório **anexado/vinculado**.
A CS abre a tarefa já com o artefato em mãos, faz a validação (mês de referência,
ROAS/Receita/Custo/CPA/Conversão legíveis, conclusões e próximos passos,
branding) e envia. Elimina o "localizar no chat".

**O que já existe.**
- Mesmo canal e helper `postSystemChatMessage` do OPT-1.
- Mesmo precedente hardcoded ONB-04→ONB-05 e mesmo motor `TaskAutomationRule`
  (com `notify` para SLA).

**O que falta construir.**
- Mesma lacuna do OPT-1: a ação `create_task`/`handoff` no `TaskAutomationRule`
  (ou replicar o padrão hardcoded para 6→9), carregando o **anexo/vínculo do
  relatório** como payload.

**Preserva a regra 4.8?** **Sim.** A CS mantém a validação e o envio externo.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-3 · Reporting nativo (check-in semanal/mensal)

**Refere-se a:** Tarefa 3 (Check-in Semanal) e Tarefa 6 (Check-in Mensal), ambas
do Gestor.

**Problema hoje.**
O fluxo é inteiramente manual e existe **por limitação do ClickUp**, não por
necessidade de negócio: (1) duplicar um Google Doc por cliente e renomear; (2)
abrir o GA4 e tirar prints (faturamento, investimento, ROAS, compras, sessões,
ticket médio, taxa de conversão, gráficos de categoria/produto); (3) preencher as
6 perguntas; (4) salvar em PDF; (5) mandar PDF + prints para a IA com um prompt
colado; (6) conferir; (7) postar. É trabalhoso, propenso a erro de dados e não
deixa rastro estruturado.

**Proposta.**
Reconstruir o check-in **nativamente** no Performli: **GA4 puxa os dados** do
cliente automaticamente → o gestor preenche as **6 perguntas dentro do próprio
Performli** (sem Google Doc/PDF) → a **IA integrada gera o relatório** já alinhado
com os números puxados → **handoff automático para a CS** (encadeia com OPT-4 e
OPT-2). Semanal usa a semana anterior; mensal compara mês atual vs. anterior.

**O que já existe.**
- Integrações **GA4, Meta Ads e Google Ads** no stack, e uma base de conhecimento
  (RAG) — as fontes de dados e a camada de IA já estão previstas.
- Canal interno + `postSystemChatMessage` para o handoff final.

**O que falta construir.**
- Praticamente todo o fluxo nativo: coleta GA4 → tela/estrutura de check-in com as
  6 perguntas no Performli → geração do relatório pela IA integrada (com rubrica,
  sem inventar métrica) → encadeamento do handoff. É a proposta de **maior
  esforço** do conjunto (base para OPT-4 e OPT-6).

**Preserva a regra 4.8?** **Sim.** O reporting é interno; termina em handoff para
a CS, que valida e envia.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-4 · QA assistida dos check-ins

**Refere-se a:** Tarefa 10 (Validar qualidade e enviar relatório — CS).

**Problema hoje.**
A CS é a primeira linha de controle de qualidade dos check-ins. Hoje ela abre uma
planilha ("_CONTROLE_DE_CHECKINS___CS__ARKZA", aba por cliente) e avalia
manualmente os 6 critérios (SIM/NÃO) + detectores de "relatório genérico"
("check-in copiado do ChatGPT?", "métricas soltas sem contexto?"). É trabalho
manual, subjetivo e não escala para ~30 clientes.

**Proposta.**
O sistema **pré-avalia automaticamente** os 6 critérios + os detectores de texto
genérico (descreveu problema com números reais? explicou o que fez e o
resultado? comparou com a semana anterior? ação concreta? pedido específico com
prazo? texto que parece copiado/colado?). A CS **revisa apenas o que o sistema
sinalizar como suspeito** e dá o OK final para o envio. Substitui o preenchimento
manual da planilha.

**O que já existe.**
- Model `Alert` para sinalizar os casos suspeitos.
- Camada de IA/RAG do stack para a análise dos critérios de qualidade.
- Depende do check-in existir de forma estruturada no Performli — ou seja,
  **encadeia com OPT-3** (sem reporting nativo, não há texto estruturado para
  pré-avaliar).

**O que falta construir.**
- O motor de pré-avaliação (rubrica dos 6 critérios + detectores de conteúdo
  genérico), a marcação verde/vermelho e a fila de revisão da CS. Alto esforço,
  dependente de OPT-3.

**Preserva a regra 4.8?** **Sim.** A CS continua sendo quem aprova e envia o
relatório ao cliente; o sistema só pré-filtra.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-5 · Revisão diária por exceção

**Refere-se a:** Tarefa 11 (Revisão Diária de Budget e Performance — Gestor).

**Problema hoje.**
Todo dia útil o gestor abre manualmente cada conta (Meta e Google) para conferir
veiculação de ontem/hoje, CPA acima da média, distribuição de budget etc. — mesmo
quando **está tudo normal**. Em ~30 contas isso é caro e faz o gestor gastar
atenção onde não há problema, aumentando a chance de deixar passar a conta que
realmente precisa de ação.

**Proposta.**
Inverter a lógica: as integrações **Meta/Google Ads monitoram** veiculação, CPA
acima da média e distribuição de budget e o sistema **alerta o gestor apenas nos
casos que exigem ação** ("Campanha X sem veiculação hoje", "Grupo Y com CPA 2x a
média", "budget concentrado na campanha de pior ROAS"). Revisão por exceção, não
varredura cega.

**O que já existe.**
- Integrações Meta Ads e Google Ads no stack (fonte das métricas).
- Model `Alert` para materializar o aviso ao gestor.

**O que falta construir.**
- A **lógica de exceção**: puxar as métricas diariamente (encaixa no cron diário
  já existente, com try/catch por cliente — regra 7), calcular médias/limiares e
  gerar Alert só nos desvios. A regra de negócio do que é "exceção" é o núcleo a
  construir.

**Preserva a regra 4.8?** **Sim.** O alerta é interno, destinado ao gestor; não
há comunicação com o cliente.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-6 · Campo de resumo estruturado + envio único

**Refere-se a:** Tarefas 3, 4 e 11 (o item repetido "criar resumo do que foi
feito e enviar no chat de comunicação do cliente").

**Problema hoje.**
A mesma ação manual — "criar resumo e enviar no chat" — aparece repetida no fim
das Tarefas 3, 4 e 11. O gestor reescreve e reposta o resumo várias vezes por
semana, sem padrão e sem estrutura, e cada repost é uma chance de esquecimento.

**Proposta.**
Transformar esse item num **campo de resumo estruturado** dentro da tarefa. Ao
preencher o campo, ele **alimenta automaticamente o handoff de comunicação para a
CS** (posta no canal interno e prepara/encaminha para a CS). Elimina a ação manual
repetida e padroniza o formato do resumo.

**O que já existe.**
- A `Task` já tem **checklist e comentários**; um campo de resumo é uma adição
  **aditiva** ao modelo/tela da tarefa (migration aditiva — regra 13).
- Canal interno + `postSystemChatMessage` para alimentar o handoff.

**O que falta construir.**
- O campo estruturado de resumo na Task e o gatilho "campo preenchido → posta no
  canal + aciona a CS". Baixo esforço; é a base de padronização que os handoffs
  (OPT-1/2/8) consomem.

**Preserva a regra 4.8?** **Sim.** O resumo vai para o canal interno e para a CS,
que faz o envio externo.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-7 · Fluxo bidirecional de desativação de anúncios

**Refere-se a:** Tarefa 13 (Validação dos Anúncios Ativos — CS ↔ Gestor,
handoff bidirecional).

**Problema hoje.**
Quando o cliente pede para pausar um anúncio, a CS manda mensagem manual ao
gestor ("Cliente pediu para pausar o anúncio X. Pode me mandar um resumo da
performance dele?"), o gestor pesquisa a performance à mão e responde, a CS
retorna ao cliente de forma consultiva e, se confirmada a pausa, abre outra
tarefa para o gestor desativar. É um vai-e-vem manual, lento e sujeito a
esquecimento no meio do caminho.

**Proposta.**
Quando a CS aciona "pedir resumo de performance" de um anúncio, o sistema **já
puxa automaticamente os dados daquele anúncio** (Meta Ads: vendas, ROAS, gasto)
para a CS responder ao cliente de forma consultiva sem esperar o gestor. Se a
pausa for confirmada, a **ação de desativar é encaminhada ao gestor** (ou
executada mediante aprovação). Elimina o "me manda um resumo" manual.

**O que já existe.**
- Integração **Meta Ads** (fonte dos dados por anúncio) e model `Alert`/tarefas
  para encaminhar a ação de desativação.

**O que falta construir.**
- A busca de métricas **no nível de anúncio individual** acionada pela CS, a
  apresentação desses dados na tarefa e o fluxo de encaminhamento/execução da
  desativação (com aprovação). Alto esforço pela granularidade por anúncio e pelo
  laço bidirecional.

**Preserva a regra 4.8?** **Sim.** A CS continua sendo a única interface com o
cliente; o sistema só entrega os dados e encaminha a ação internamente.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-8 · Handoff Kyn→CS (relatórios CRM)

**Refere-se a:** Tarefa 15 (Relatório Mensal [CRM]) e Tarefa 16 (Relatório
Semanal [CRM]), ambas do Gestor de Automação/CRM (Kyn).

**Problema hoje.**
Kyn formata o relatório CRM (Zoppy) — vendas influenciadas, ROAS CRM, vendas por
campanha — e posta no chat interno. A CS depende de perceber que o relatório
chegou para então enviá-lo ao cliente. Mesmo problema de handoff manual dos
OPT-1/2, agora no eixo CRM.

**Proposta.**
Concluir as Tarefas 15/16 **dispara automaticamente a fila de envio da CS** com o
relatório CRM já formatado. A CS mantém o papel de ponte externa: recebe pronto,
confere e envia.

**O que já existe.**
- Canal interno + `postSystemChatMessage`.
- Precedente hardcoded ONB-04→ONB-05 e motor `TaskAutomationRule` (`notify` para
  SLA).

**O que falta construir.**
- Mesma lacuna dos OPT-1/2: a ação `create_task`/`handoff` no `TaskAutomationRule`
  (ou replicar o padrão hardcoded) para os pares 15→(CS) e 16→(CS), carregando o
  relatório CRM formatado como payload. Esforço médio, e reaproveita 100% do que
  for feito em OPT-1/2.

**Preserva a regra 4.8?** **Sim.** Kyn nunca fala com o cliente; o handoff é
interno e a CS faz o envio externo.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## OPT-9 · Agrupamento de virada de mês

**Refere-se a:** Tarefas 6 (Check-in Mensal), 7 (Revisão de Anúncios/Ofertas
Expiradas), 9 (Envio do Relatório Mensal) e 15 (Relatório Mensal CRM) — todas no
início do mês.

**Problema hoje.**
Quatro tarefas caem no começo do mês, por cliente, cada uma exigindo que o gestor
(e a CS/Kyn) abra a conta e o cliente separadamente. Em ~30 clientes, isso vira
uma enxurrada de tarefas soltas na virada do mês, sem visão de sequência nem de
"o que já rodou / o que falta".

**Proposta.**
Um **"painel de fechamento mensal" por cliente** que **sequencia** essas etapas
(check-in mensal → revisão de ofertas expiradas → relatório CRM → envio do
relatório pela CS), mostrando o progresso de cada cliente na virada do mês e
evitando que o gestor abra a conta várias vezes. É uma **visão orientada à ação**
(o que está pendente / atrasado / pronto para envio) sobre tarefas que já existem
— não cria processo novo.

**O que já existe.**
- As Tarefas 6, 7, 9 e 15 já existem como recorrentes fiéis; o painel é uma
  **camada de visualização/orquestração** sobre elas.
- Cada tela com dado crítico já deve mostrar data/hora da última atualização
  (regra 10) — o painel se encaixa nesse padrão.

**O que falta construir.**
- A tela de "fechamento mensal por cliente" que agrega o status dessas tarefas e
  ordena a sequência. Esforço baixo/médio (majoritariamente frontend +
  agregação), sem tocar na lógica das tarefas.

**Preserva a regra 4.8?** **Sim.** É apenas visão/sequência interna; o envio ao
cliente continua sendo passo da CS na Tarefa 9.

**Status:** ⬜ Aguardando aprovação do Marcos (GATE 2).

---

## Observações de arquitetura (transição ClickUp → Performli)

- **Dependência comum a OPT-1, OPT-2 e OPT-8:** os três handoffs "concluir task →
  gerar/preparar task da CS" dependem da **mesma peça faltante** — o
  `TaskAutomationRule` hoje só faz `notify` e `assign`, **não cria task**. A
  decisão de arquitetura (estender o motor com ação `create_task`/`handoff` vs.
  replicar o padrão hardcoded ONB-04→ONB-05) deve ser tomada uma vez e reaproveitada
  nos três. Recomenda-se a extensão do motor, para não espalhar handoffs
  hardcoded pelo código.
- **OPT-3 é pré-requisito de OPT-4 e insumo de OPT-6:** sem o check-in nativo
  estruturado, não há texto para a QA assistida pré-avaliar nem campo para o
  resumo estruturado alimentar. Se aprovado o conjunto, priorizar OPT-3.
- **Exit strategy (diretriz ClickUp):** todas as propostas movem o estado
  canônico do processo para o PostgreSQL/Performli (handoffs, resumos, check-ins,
  QA), reduzindo a dependência de artefatos externos (Google Doc, planilha de
  controle, chat manual) — coerente com o alvo de longo prazo de desligar o
  ClickUp das rotinas críticas.
- **Nada aqui é implementação.** Aprovar um OPT libera-o para o fluxo normal de
  agentes (arquitetura de dados/produto → escrita → guardião). A versão fiel
  (Nível 1) segue intocada em qualquer cenário.

# QA MANUAL — Central de Tarefas (Módulo Tasks ClickUp-class)

> **Para quem:** qualquer pessoa da Arkza. **Tempo:** ~15 minutos.
> **Como usar:** siga na ordem, clicando. Cada passo tem o **resultado esperado**.
> Se algum resultado não bater, anote o passo e avise no canal do time.
> **Antes de começar:** esteja logado (ADMIN ou CS enxergam tudo; Gestor enxerga
> só os clientes atribuídos a ele). Faça o teste com um **cliente de teste** ou um
> cliente atribuído a você — não use um cliente crítico em produção.

Legenda: 🔗 = link/rota · ✅ = resultado esperado.

---

## 0. Abrir a Central (30s)
1. Acesse 🔗 **`/operacional`** (menu: **Central de Tarefas**).
   ✅ Abre a lista de tarefas. No topo: **KPIs** (Abertas · Atrasadas · Aguardando ·
   No prazo % · War Room) e um **seletor de visões** (Lista · Kanban · Calendário ·
   Por Cliente · Por Gestor). Em algum canto aparece a **data/hora da última
   atualização**.

## 1. Alternar Lista ↔ Kanban (1 min)
2. Clique em **Kanban** no seletor.
   ✅ A tela vira colunas por status (A Fazer, Em Andamento, …). Cada coluna mostra
   um **contador**. A coluna crítica (Bloqueado/Atrasado) aparece destacada em vermelho.
3. Clique em **Lista**.
   ✅ Volta para a lista agrupada por status (grupos colapsáveis; Concluído/Cancelado
   já vêm recolhidos).
4. Recarregue a página (F5).
   ✅ A visão que você deixou selecionada **permanece** (fica salva no navegador).

## 2. Criar uma tarefa rápida (2 min)
5. Na **Lista**, no grupo **"A fazer"**, clique em **"+ Nova tarefa"**, digite um
   título (ex.: *"Teste QA — revisar criativos"*) e tecle **Enter**.
   ✅ A tarefa **aparece na hora** no topo do grupo "A fazer" (sem recarregar).
6. (Opcional) Use o botão de **Nova tarefa** completo para preencher cliente, área,
   POP, responsável e checklist.
   ✅ Ao salvar, a tarefa aparece na Central vinculada ao cliente/POP escolhidos.

## 3. Arrastar entre colunas (mover status) e reordenar (2 min)
7. Vá para **Kanban**. **Arraste** a tarefa de teste de "A Fazer" para "Em Andamento".
   ✅ O card muda de coluna **instantaneamente** e o status passa a "Em Andamento".
   Se recarregar, continua em "Em Andamento".
8. **Arraste** um card para cima/baixo **dentro da mesma coluna**.
   ✅ A ordem muda e é mantida. (Obs.: em colunas cujas tarefas nunca foram
   reordenadas, o card pode "subir" para o topo do bloco — comportamento conhecido
   que se ajusta conforme as tarefas ganham ordem manual.)
9. Tente **concluir uma tarefa crítica que exige evidência** sem preencher a
   evidência (arraste-a para "Concluído" ou use o botão Concluir).
   ✅ O sistema **bloqueia** e mostra uma mensagem operacional explicando o porquê
   (ex.: itens obrigatórios/evidência pendentes); o card **volta** ao lugar (rollback).

## 4. Abrir o painel da tarefa `/t/…` e editar tudo (3 min)
10. Na Lista, **clique no título** da tarefa de teste.
    ✅ Abre um **painel lateral (slide-over)** por cima da lista, **sem perder a lista
    atrás**. A URL vira 🔗 **`/t/<id da tarefa>`**.
11. Clique no **título** dentro do painel e edite; clique fora.
    ✅ O título salva sozinho (edição inline).
12. Altere o **prazo (vencimento)** e o **responsável** pelo painel.
    ✅ Cada mudança aplica **na hora**; some/aparece nos avatares e no chip de prazo.
13. Feche o painel (Esc ou clicar fora).
    ✅ Volta para a lista, **sem recarregar**, exatamente onde estava.
14. Abra a mesma tarefa por **link direto**: cole 🔗 **`/t/<id>`** numa aba nova.
    ✅ Abre a **página cheia** da tarefa (com menu lateral), servindo de deep-link.

## 5. Configurar recorrência semanal e ver regenerar (2 min)
15. No painel da tarefa, abra a seção **Recorrência**. Escolha **Semanal**, marque
    **segunda-feira**, deixe modo **"ao concluir"** e clique **Salvar**.
    ✅ O resumo mostra algo como *"Repete toda semana (segunda) · ao concluir"*.
16. **Conclua** a tarefa (respeitando evidência/checklist, se exigidos).
    ✅ A tarefa vai para **Concluído** e o sistema **gera automaticamente a próxima
    ocorrência** (nova tarefa, checklist desmarcado, prazo na próxima segunda no
    futuro). Confira que **não** duplicou (só uma nova ocorrência).

## 6. Comentar (1 min)
17. Abra uma tarefa, vá na aba **Comentários**, escreva um comentário e envie.
    ✅ O comentário aparece **imediatamente** com o seu nome; ao concluir o envio ele
    é confirmado (persistido). Recarregando, o comentário continua lá.

## 7. Criar demanda no Hub de Suporte e conferir (2 min)
18. Acesse 🔗 **`/suporte`** (Hub de Suporte).
    ✅ Lista/quadro das demandas de suporte, com **data/hora da última atualização**.
19. Clique em **Nova demanda**, escolha o **cliente**, a **categoria**, prioridade e
    descrição; salve.
    ✅ A demanda aparece no Hub de Suporte vinculada ao cliente.
20. Clique no **título** da demanda.
    ✅ Abre o painel `/t/<id>` da demanda (mesmo painel das tarefas), com o selo de
    **Suporte** e a categoria.

## 8. Conferir alerta / fila de validação (1 min)
21. Acesse 🔗 **`/validacoes`** (Validação CS) — visível para CS/ADMIN (Gestor vê as
    dos seus clientes para acompanhar).
    ✅ Mostra as tarefas **Aguardando CS / Em Validação**, com a evidência e os botões
    **Aprovar** / **Solicitar ajustes** (para CS/ADMIN). Destaca as que esperam 3+ dias.
22. Acesse 🔗 **`/alertas`** e confira o **sino** de alertas no topo.
    ✅ Lista de alertas não lidos; o contador do sino bate com a quantidade.

---

## Encerramento
23. **Apague** a tarefa/demanda de teste que você criou (ou marque como Cancelada)
    para não poluir a Central.
    ✅ Some da lista de abertas.

**Deu tudo certo?** Fluxo aprovado. **Algum passo falhou?** Anote o **número do
passo** + o que aconteceu (e print, se puder) e mande no canal do time — não tente
consertar pela tela.

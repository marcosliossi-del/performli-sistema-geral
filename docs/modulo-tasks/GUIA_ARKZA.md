# Guia de uso — Tarefas no Performli (para o time Arkza)

> Este guia é para quem USA o sistema no dia a dia (Head, Supervisor, Gestores,
> CS, CRM). Não tem nada técnico aqui. Se algo não funcionar como descrito,
> avise quem cuida do sistema — não "dê um jeito" por fora (WhatsApp/planilha),
> porque aí o sistema para de enxergar a operação.

O princípio de tudo: **se não está no Performli, não aconteceu.**

---

## 1. Onde as tarefas vivem

| Tela | Para que serve | Quem usa |
|---|---|---|
| **Meu Dia** (`/meu-dia`) | Suas tarefas de hoje, atrasadas e da semana | Todo mundo, primeira tela do dia |
| **Central de Tarefas** (`/operacional`) | Todas as tarefas da operação, com filtros e visões | Gestores, Supervisor, Head, CS |
| **Hub de Suporte** (`/suporte`) | Demandas de cliente (pedidos que entram e saem) | CS e Gestores |
| **Validação CS** (`/validacoes`) | Tarefas esperando a CS aprovar | CS |
| **Painel da tarefa** (`/t/…`) | A tarefa aberta por inteiro, onde tudo se edita | Todo mundo |

[print a capturar: sidebar com Meu Dia, Central de Tarefas e Hub de Suporte]

---

## 2. Abrir uma tarefa e editar tudo (o painel da tarefa)

Clique no **título** de qualquer tarefa (na Lista, no Kanban ou no Suporte).
Um painel desliza da direita, **sem você perder a lista atrás**. Cada tarefa tem
um endereço próprio (`/t/` + código) — dá para copiar o link do navegador e
mandar para um colega: ele abre exatamente a mesma tarefa.

Dentro do painel, tudo se edita clicando em cima:

1. **Título** — clique no texto, digite, `Enter` salva, `Esc` cancela.
2. **Status** — clique na pílula colorida e escolha o novo status.
3. **Prioridade** — clique na bandeira (Urgente / Alta / Normal / Baixa).
4. **Responsáveis** — clique nos avatares para adicionar ou remover pessoas.
   Uma tarefa pode ter mais de um responsável; sempre existe um principal.
5. **Datas** — campos de início e vencimento; o botão ao lado limpa a data.
6. **Seguir** — o botão "Seguir" faz você acompanhar a tarefa sem ser responsável.
7. **Recorrência** — ver seção 7 deste guia.
8. **Descrição** — clique, escreva e clique fora para salvar.
9. **Checklist** — marque itens prontos; itens com selo "obrigatório" precisam
   estar marcados antes de concluir a tarefa.
10. **Dependências** — ver seção 10.
11. **Comentários e Atividade** — ver seção 11.

No rodapé do painel ficam: origem da tarefa, quem pediu, quando foi criada e a
**data da última atualização**.

**Toda edição salva na hora.** Se algo der errado (ex.: tentar concluir uma
tarefa que exige evidência), a mudança volta atrás sozinha e aparece um aviso
vermelho explicando o motivo. Leia o aviso: ele diz exatamente o que falta.

[print a capturar: painel da tarefa aberto sobre a Central, com as seções numeradas]

> Botão **"Abrir painel completo →"**: transforma o painel lateral em página
> cheia — útil para tarefas com muito conteúdo.

---

## 3. Central de Tarefas: Lista ou Kanban?

No topo da Central (`/operacional`) há um seletor com 5 visões:
**Lista · Kanban · Calendário · Por Cliente · Por Gestor**.
O sistema lembra a última visão que você usou.

### Lista — para trabalhar o dia
- As tarefas ficam **agrupadas por status** (A fazer, Em andamento, …), cada
  grupo com contador. Clique no cabeçalho do grupo para recolher/expandir.
- Concluído e Cancelado já vêm recolhidos para não poluir.
- **Edição direto na linha**: clique no status, na bandeira de prioridade, no
  prazo ou nos avatares — muda ali mesmo, sem abrir a tarefa.

### Kanban — para mover trabalho
- Cada coluna é um status, com contador no topo.
- **Arraste o card** para outra coluna = mudar o status.
- Arraste **dentro da coluna** = mudar a ordem de prioridade visual.
- As colunas Concluído/Cancelado mostram só as 20 mais recentes.

Use Lista quando quer editar rápido em massa; use Kanban quando quer
"empurrar" o fluxo da semana. **Os dados são os mesmos** — só muda a lente.

[print a capturar: seletor Lista | Kanban e as duas visões lado a lado]

---

## 4. Filtrar (e manter os filtros salvos)

A barra de filtros vale para Lista e Kanban ao mesmo tempo:

- **Status** — marque um ou vários.
- **Responsável** — uma ou várias pessoas.
- **Prioridade** — Urgente / Alta / Normal / Baixa.
- **Cliente** — um cliente específico, ou "Interno" (tarefas sem cliente).
- **Vencimento** — pílulas: `Atrasadas` · `Hoje` · `Próximos 7 dias` · `Sem prazo`.
- **Busca** — digite parte do título.

Os filtros se **combinam** (ex.: "Atrasadas" + responsável Pablo = só as
atrasadas do Pablo). O botão **"Limpar (N)"** zera tudo.

**Salvar filtros:** o sistema guarda automaticamente os filtros e a visão no
seu navegador — ao voltar amanhã, está tudo como você deixou. Não existe ainda
"filtro salvo com nome" para compartilhar com colegas; se precisar disso, peça.

[print a capturar: barra de filtros com 2 filtros ativos e o botão Limpar]

---

## 5. Criar tarefa rápida

Na Lista ou no Kanban, no rodapé do grupo/coluna **"A fazer"**, clique em
**"+ Nova tarefa"**, digite o título e aperte `Enter`. Pronto — a tarefa nasce
em "A fazer", atribuída a você. `Esc` fecha sem criar.

Depois, abra a tarefa (clique no título) para completar prazo, cliente,
responsável e o resto.

Para uma tarefa completa desde o início (cliente, área, checklist, prazo), use
o botão **"Nova tarefa"** no topo da Central — abre o formulário completo.

> A criação rápida só existe em "A fazer" de propósito: tarefa nova começa do
> começo. Os outros status têm regras (ex.: enviar para validação exige
> evidência), então não dá para nascer direto neles.

---

## 6. Criar demanda no Hub de Suporte

O Hub de Suporte (`/suporte`) é onde entram os **pedidos de cliente** (e os
nossos pedidos para clientes). Clique em **"Nova demanda"** e preencha:

- **Cliente** (obrigatório) — de quem é o pedido.
- **O que precisa ser feito?** (obrigatório) — escreva como pedido concreto.
  Ex.: "Ajustar criativo da campanha de inverno".
- **Categoria** (obrigatório) — escolha uma:
  - **Tráfego** (azul) — campanha, verba, criativo, otimização.
  - **Demanda da Agência** (amarelo) — algo que NÓS precisamos do cliente ou
    tarefas administrativas do atendimento.
  - **Sucesso do Cliente** (roxo) — relacionamento, reunião, saúde da conta.
- **Responsável** — quem vai atender (se souber).
- **Prioridade** — Urgente / Alta / Normal / Baixa.
- **Vencimento** (opcional) — quando precisa estar pronto. Sem vencimento a
  demanda não aparece nos alertas de atraso — se tem prazo real, preencha.
- **Detalhes** (opcional) — contexto que ajuda quem for atender.

A demanda vira uma tarefa como qualquer outra: aparece no Meu Dia do
responsável, na Central e pode ser aberta no painel.

[print a capturar: formulário Nova demanda preenchido]

---

## 7. Configurar recorrência (tarefa que se repete)

Abra a tarefa no painel e procure a seção **"Recorrência"** (ícone de setas em
círculo). Clique em **"Configurar"** (ou "Editar", se já repete).

### Exemplo 1 — toda segunda-feira
1. Em "Repetir a cada", deixe **1** e escolha **semana**.
2. Nos dias da semana, deixe só **2ª** aceso.
3. Clique **Salvar**. O resumo mostra: *"Repete toda semana (segunda) · ao concluir"*.

### Exemplo 2 — todo dia útil (ignorando fins de semana)
1. "Repetir a cada" **1 dia**.
2. Marque **"Ignorar dias não úteis (joga sábado/domingo para segunda)"**.
3. Salvar. Se a próxima repetição cair no sábado, ela pula para segunda.

### Exemplo 3 — parar de repetir
Clique em **"Não repetir"** (botão vermelho). A tarefa atual continua existindo;
só param de nascer novas.

Outras combinações possíveis: a cada 2 semanas (quinzenal), todo mês, mais de
um dia por semana (ex.: 2ª e 5ª para auditoria).

[print a capturar: editor de recorrência com semanal + 2ª selecionada]

---

## 8. O que acontece quando eu concluo uma tarefa recorrente?

Ao mover a tarefa para **Concluído**, o sistema **cria sozinho a próxima
ocorrência**:

- Nasce em **"A fazer"**, com os **mesmos responsáveis**;
- O **checklist volta zerado** (tudo desmarcado, para fazer de novo);
- O **prazo é recalculado** pela regra (ex.: semanal às 2ª → próxima segunda);
- A tarefa concluída fica no histórico — nada se perde.

Você não precisa (e não deve) duplicar tarefa recorrente na mão. Se concluir e
a próxima não aparecer, avise quem cuida do sistema.

> Existem também as **recorrentes fixas por cliente** (as ~15 rotinas de
> tráfego que todo cliente tem). Essas o sistema gera automaticamente todo dia
> de manhã — ninguém cria nem configura na mão. A recorrência da seção 7 é para
> as SUAS tarefas que se repetem.

---

## 9. Concluir tarefa com regras (evidência e validação)

Algumas tarefas têm selos **"Exige evidência"** ou **"Exige validação"** (no
rodapé do painel). Para essas:

- Não dá para marcar **Concluído** direto — o sistema barra e explica.
- O caminho é: preencher o **checklist obrigatório**, anexar a **evidência**
  (texto/print do que foi feito) e **enviar para a CS validar**.
- A CS **aprova** (vira Concluído) ou **pede ajustes** (volta para você com o
  motivo escrito).

Isso não é burocracia: é o que garante que "concluído" significa **feito de
verdade** — a regra da casa é que nenhuma tarefa fecha sem evidência mínima.

---

## 10. Dependências — "essa tarefa está travada por outra"

No painel, a seção **"Dependências"** mostra duas listas:

- **Bloqueada por** — tarefas que precisam terminar ANTES desta começar.
- **Bloqueia** — tarefas que estão esperando esta terminar.

Para adicionar: clique no seletor de dependência, busque a tarefa (do mesmo
cliente) e selecione. Ela entra em "Bloqueada por".

- O sistema **recusa ciclos** (A trava B e B trava A) com um aviso.
- Tarefas bloqueadas mostram o cadeado 🔒 no card — é um alerta visual, o
  sistema não te impede de trabalhar, mas pense duas vezes.
- Para desfazer, remova a dependência na própria lista.

---

## 11. Comentários e trilha de atividade

Na parte de baixo do painel há duas abas:

- **Comentários** — conversa sobre a tarefa. Escreva `@nome` para citar alguém.
  Use comentários para contexto e decisão ("cliente aprovou por áudio,
  segue"), não WhatsApp — aqui fica registrado junto da tarefa.
- **Atividade** — a linha do tempo automática: quem criou, quem mudou status,
  quem trocou prazo, quando recorreu. Ninguém edita essa trilha; é a memória
  da tarefa. Se houver dúvida de "quem mexeu nisso?", a resposta está aqui.

---

## 12. O que significa cada cor e badge

### Pílula de status
| Cor | Status | Significa |
|---|---|---|
| Cinza | **A fazer** | Ainda não começou |
| Ciano/azul | **Em andamento** | Alguém está trabalhando |
| Âmbar | **Aguardando cliente / gestor / CS** | Parada esperando alguém — veja QUEM no nome do status |
| Roxo | **Em validação** | Na fila da CS para aprovar |
| Laranja | **Ajustes solicitados** | A CS devolveu; tem correção a fazer |
| Vermelho | **Bloqueado** | Travada por impedimento ou dependência |
| Vermelho | **Atrasado** | Venceu sem ser feita (o sistema marca sozinho todo dia) |
| Verde + check | **Concluído** | Feita (com evidência, quando exigida) |
| Cinza + check | **Cancelado** | Não será feita (fica no histórico) |

### Bandeira de prioridade
| Cor | Prioridade | Quando usar |
|---|---|---|
| Vermelha | **Urgente** | Cliente em risco / incêndio — para tudo |
| Âmbar | **Alta** | Entrega da semana |
| Azul | **Normal** | Rotina |
| Cinza | **Baixa** | Pode esperar |

### Chip de prazo
- **"Hoje"** (âmbar) — vence hoje.
- **"Atrasada há N dias"** (vermelho) — passou do prazo.
- **"Amanhã" / "Em N dias" / data** (neutro) — no futuro.
- **"Sem prazo"** (apagado) — sem vencimento definido.
- Ícone de **setas em círculo (↻)** — tarefa recorrente.

### Outros sinais
- **Linha/card com borda vermelha à esquerda** — tarefa atrasada.
- **Cadeado 🔒 no card** — bloqueada por outra tarefa.
- **Avatares empilhados** — os responsáveis (passe o mouse para ver os nomes).
- **Contadores no card** — itens de checklist feitos/total e nº de comentários.
- **Tag "escalado"** — a tarefa atrasou 2+ dias e o sistema subiu a prioridade
  sozinho; o gestor da conta e o supervisor já enxergam isso.

---

## 13. Perguntas rápidas

**Editei e não salvou.** Apareceu um aviso vermelho? Ele diz o motivo (ex.:
falta evidência). Sem aviso, recarregue a página; se persistir, reporte.

**Não encontro uma tarefa.** Confira os filtros (botão "Limpar (N)") — o filtro
salvo de ontem pode estar escondendo. Grupos Concluído/Cancelado ficam
recolhidos por padrão.

**Concluí uma recorrente e não nasceu a próxima.** Confira se a seção
Recorrência da tarefa mostrava uma regra ("Repete…"). Se mostrava e nada
nasceu, reporte com o link da tarefa.

**Posso apagar uma tarefa?** Não existe apagar. Use **Cancelado** — a história
fica registrada (e isso protege você).

**Quem pode editar o quê?** Gestores editam as tarefas dos SEUS clientes; a CS
enxerga tudo e valida; o Head/Admin edita tudo. Se um botão não aparece para
você, é o seu papel — não é defeito.

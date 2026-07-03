# AUDITORIA FORENSE — CHURN SILENCIOSO (Arkza / Performli)

> **Pergunta-guia:** "Qual cliente da Arkza vai cancelar daqui a 6 semanas — e por que a operação de hoje ainda não sabe disso?"
>
> **Regras de qualidade aplicadas:** (1) Mecanismo, não força de vontade — nenhuma correção é "a CS deve lembrar de"; toda correção é automação, campo obrigatório, alerta ou bloqueio. (2) Priorizar por dinheiro — atrito que ameaça um Curva A vale mais que um Curva C.
>
> Método: 7 agentes (SignalChain, SilentSignalHunter, MemoryDependency, TouchpointResilience, PredictiveGap, ProcessFriction, RemediationArchitect) sobre o estado atual do branch (incluindo o motor de automações do Farol). Toda afirmação tem evidência `arquivo:linha`.
>
> Data: 2026-07-03

---

## BLOCO 1 — Diagnóstico executivo

**Veredito: hoje, se 3 clientes estivessem em churn silencioso, a operação NÃO identificaria antes do cancelamento.**

O Performli captura muitos sinais, mas o preditor de churn (`churn-scorer.ts`) é **100% derivado de performance de mídia** (HealthScore semanal vs meta). Ele é um detector de churn *barulhento* — confirma o que já aconteceu — e não de churn *silencioso*. Os sinais precoces (relacionamento frio, spend caindo, silêncio do cliente, suporte atrasado, inadimplência, ficha apodrecida, Regular crônico) **existem no banco e não alimentam nada**.

Padrão sistêmico em 3 frases:
1. **Sinais não-métricos morrem em badges ou Alerts isolados** — nenhum retroalimenta o score de churn nem o farol.
2. **"Não fez" quase nunca escala** — `escalateOverdueTasks` só sobe prioridade + tag `escalado`, sem Alert nem aviso ao HEAD (`task-escalation.ts:16-54`).
3. **O trabalho de retenção não exige evidência de conclusão** — War Room encerra por métrica, relatório "gerado" ≠ "entregue".

---

## BLOCO 2 — Cadeias de sinal e os elos quebrados (SignalChain)

| # | Sinal | Elo quebrado (evidência) | Prioridade |
|---|-------|--------------------------|-----------|
| 1 | Resultado/War Room | Conclusão do plano de ação não fecha o ciclo; escalação só por relógio de 21d (`warroom-escalation.ts:23-51`); A5 encerra automático sem evidência de ação (`client-lifecycle-automations.ts` recoverFromWarRoom) | ALTA |
| 2 | NPS/feedback → HEAD | Task do HEAD (`escalacao-2fb`) vencida cai só na escalação genérica; `possivelChurn=true` nunca é lido por monitor nenhum | ALTA |
| 3 | Relacionamento (ficha CS) | Campo MORTO: só pinta badge (`ClientesTable.tsx:309-314`); nenhum cron/scorer/hook lê `relacionamento` | MÉDIA |
| 4 | Atendimento (suporte) | Suporte atrasado NÃO vira sinal de saúde/churn — `health-scorer` e `churn-scorer` não leem `Task` | ALTA |
| 5 | Financeiro | Fatura vencida gera Alert de cobrança mas não entra no churn-score (`churn-scorer.ts:27-56`) | MÉDIA-ALTA |
| 6 | Check-in semanal | Ausência = 1 Alert deduplicado 5 dias (`checkin-monitor.ts:61-72`); sem task, sem reincidência, sem escalação, sem impacto no churn | ALTA |

**Cenário concreto:** conta Curva A cai para PÉSSIMO → War Room abre → gestor não age → por 21 dias o único sinal é um Alert deduplicado → ROAS oscila 1 semana para BOM (sazonalidade) → A5 encerra tudo como `RESOLVIDO_POSITIVO` sem ninguém ter tocado no plano → cliente cancela na semana seguinte.

---

## BLOCO 3 — Os 10 sinais invisíveis (SilentSignalHunter)

| # | Sinal | Estado hoje | Dado-fonte já existe? | Esforço |
|---|-------|-------------|----------------------|---------|
| 1 | **Curva A sem régua diferenciada** (raiz de tudo) | 100% invisível — `Client.curva` é preenchido e **nunca lido por nenhum detector** | `Client.curva` | M |
| 2 | Regular crônico (6-8 semanas REGULAR) | 100% invisível — fator 1 do scorer só conta RUIM; `ClientStatusStreak` registra e ninguém consome | `ClientStatusStreak` | P |
| 3 | Spend caindo gradualmente | 100% invisível — oscilação só compara 24h e não monitora SPEND | `MetricSnapshot.spend` | M |
| 4 | Silêncio de cliente "saudável" | Invisível — radar de silêncio só roda para score≥60 (`antichurn-monitor.ts:37`) | `ClientInteraction` | P |
| 5 | Sem reunião estratégica há 60+ dias | 100% invisível — ninguém filtra `type=REUNIAO` | `ClientInteraction.type` | P |
| 6 | Idade de contrato vs vida média dos churned | 100% invisível | `Contract`, `Client.contractStart` | M |
| 7 | Relação fria + número bom | 100% invisível — `relacionamento/engajamento` sem leitor | `Client.relacionamento/engajamento` | M |
| 8 | NPS nunca preenchido / ficha apodrecida | Só nudge cego de terça; `fichaCsUpdatedAt` escrito e nunca lido | `Client.nps/fichaCsUpdatedAt` | P |
| 9 | Demandas de suporte atrasadas acumuladas | Invisível como sinal (só escala individual) | `Task.isSupport/status/clientId` | P |
| 10 | Sumiço pós-relatório | 100% invisível E não instrumentável — `WeeklyReport` não tem `sentAt/respondedAt` | **Falta campo** | G |

---

## BLOCO 4 — Dependências de memória remanescentes (MemoryDependency)

O motor do Farol cobriu bem os **eventos** (feedback 0→1/1→2, queda de resultado, war room, zeragem de segunda com reincidência automática). O que resta é a camada do **não-evento** — quando alguém não faz e nada acontece:

| Dependência | Mecanismo que elimina | Esforço |
|-------------|----------------------|---------|
| Ficha CS envelhece em silêncio (`fichaCsUpdatedAt` nunca lido) | Monitor diário: ficha >14/30 dias → Alert ao CS, escala ao HEAD | P |
| Ritual de terça (NPS) ignorado não escala | Task `nps-terca` vencida → Alert ao HEAD nomeando CS e clientes não tocados | M |
| Check-in cobrado só de quarta e sem degraus | Escalonamento: 1º dia gestor, 2º dia HEAD, 3º dia digest do Marcos | M |
| **`escalateOverdueTasks` não avisa ninguém (padrão-raiz)** | Escalação gera Alert direcionado ao supervisor/HEAD por severidade — corrige metade da tabela de uma vez | P |
| Tasks críticas de automação nascem sem `requiresEvidence` | Setar `requiresEvidence: true` na origem (war room, escalações) | P |
| Pulso de quinta (2º contato semanal) não existe no sistema | Ramo `isThursday` no cron: task de pulso para clientes RUIM/REGULAR/War Room | M |
| Onboarding travado só cai na escalação genérica | Alert dedicado para task de onboarding vencida (janela de churn precoce) | P |

---

## BLOCO 5 — Resiliência de pontos de contato (TouchpointResilience)

**Achado crítico nº 1: o relatório semanal ao cliente é GERADO mas nunca ENVIADO pelo sistema — e ninguém rastreia o envio.** `WeeklyReport` (schema:1333-1344) só tem `content` + `generatedAt`; não há `sentAt/sentBy`, nenhuma chamada de envio, e falha de geração só faz `console.error`. Gestor esquece 3 clientes no domingo → ninguém no sistema sabe → cliente Curva A passa 3 semanas sem prestação de contas → "a agência sumiu". **É o principal ponto de contato de valor e a falha é 100% silenciosa.**

Outros: digest interno faz `skip` silencioso se env var/token Z-API falhar (só `console.warn`); geração dominical sem retry na segunda; NPS obsoleto sem detecção; check-in ignorado 3 semanas seguidas não muda de intensidade.

---

## BLOCO 6 — Score de Risco de Churn v2 (PredictiveGap)

**Fórmula atual** (`churn-scorer.ts:27-56`): semanas RUIM×12 (máx 40) + achievement (máx 30) + tendência (máx 20) + noData (+10). 100% performance de mídia; antecedência efetiva **negativa**. Consumo: cor na fila (≥40) e 1 alerta genérico sem dono/prazo (≥60 + 14d silêncio).

**Spec v2 — 0-100, todas as variáveis já existem no banco (nenhum model novo):**

| # | Variável | Fonte | Peso |
|---|----------|-------|------|
| 1 | Regular/Ruim crônico | `ClientStatusStreak.status/days` | 18 |
| 2 | Performance recente | `HealthScore.achievementPct` 4 sem | 12 |
| 3 | Tendência de spend (leading) | `MetricSnapshot.spend` 4+4 sem | 14 |
| 4 | Engajamento/Relacionamento/NPS da ficha | `Client.engajamento/relacionamento/nps` | 12 |
| 5 | Staleness da ficha | `Client.fichaCsUpdatedAt` | 5 |
| 6 | Suporte atrasado | `Task` isSupport + vencida | 8 |
| 7 | Silêncio (última interação) | `ClientInteraction`/`ClientChatMessage` | 10 |
| 8 | Feedback negativo + reincidência | `Client.feedbackNegativo/fechouSemanaEmRisco` | 7 |
| 9 | Fatura em atraso recorrente | `AsaasPayment.status=OVERDUE` | 8 |
| 10 | Idade de contrato vs vida média dos churned | `Contract`/`Client.contractStart` | 6 |

**Curva não é peso — é multiplicador de negócio:** `R$ em risco = feeAmount × (score/100)`, ordenação do cockpit por dinheiro (Curva A no topo). Um B com score 85 não ofusca um A com score 70 que vale 3×.

**Faixas → AÇÃO (mecanismo, nunca "alguém olha"):**

| Faixa | Score | Ação obrigatória |
|-------|-------|------------------|
| Saudável | 0–39 | Monitorar |
| Atenção | 40–64 | Task automática ao CS (dono + prazo +3d) |
| Alto | 65–79 | `possivelChurn=true` + Alert com dono + task gestor+CS prazo +1d |
| Crítico | 80+ | `CriticalProtocol` (War Room) + `salaDeGuerra=true` + task HEAD mesmo dia |

**Cockpit:** card "R$ em risco" = Σ(fee × score/100) dos clientes ≥65, quebrado por curva e por gestor.

---

## BLOCO 7 — Atritos que acumulam (ProcessFriction)

1. **Cliente ÓTIMO é esquecido** — todos os monitores atacam o RUIM; nenhum atua no ÓTIMO. Sem task de depoimento/case/expansão. Concorrente aparece e leva o cliente bom nunca valorizado. (Curva A, esforço P — reusa `ClientStatusStreak`.)
2. **Relatório do cliente ÓTIMO é igual ao do RUIM** — sem bloco de "vitória da semana"/celebração; cliente indo bem recebe burocracia repetida e questiona o fee.
3. **War Room invisível para o cliente** — mobilização interna total, mas nenhum contato proativo comunicando o plano de recuperação. Cliente churna achando que ninguém agiu.
4. **Onboarding sem cadência** — 1 task genérica de 30d em vez de contatos D+3/D+7/D+14/D+30 na janela de maior churn precoce.
5. **Renovação de contrato burocrática** — sem ritual de retrospectiva de valor antes de renovar.

---

## BLOCO 8 — Plano de remediação priorizado (impacto × facilidade)

Legenda: 🔴 fazer já · 🟠 próxima onda · 🟢 backlog. Todas as correções são MECANISMO.

| # | Falha | Correção | Mecanismo | Responsável | Esforço | Prio |
|---|-------|----------|-----------|-------------|---------|------|
| 1 | Relatório gerado ≠ enviado | `sentAt/sentBy` em `WeeklyReport` + alerta terça "gerado e não enviado" + painel por cliente | Campo + alerta | Sistema | M | 🔴 |
| 2 | `escalateOverdueTasks` muda (padrão-raiz) | Task crítica vencida → Alert direcionado ao supervisor/HEAD | Alerta | Sistema | P | 🔴 |
| 3 | Churn-score cego (v2 fase P) | Somar streak REGULAR, ficha (nps/rel/eng), staleness, feedback, silêncio ao `computeScore`; faixa 40-64 gera task com dono/prazo | Automação | Sistema | P | 🔴 |
| 4 | Curva A sem régua | Multiplicador por curva nos limiares + "R$ em risco" no cockpit | Automação | Sistema | M | 🔴 |
| 5 | War Room encerra sem evidência | Bloquear encerramento automático (A5) com plano de ação aberto → encerra pendente + Alert | Bloqueio | Sistema | P | 🔴 |
| 6 | Task de retenção do HEAD sem follow-up | Cron: `escalacao-*` vencida → Alert + WhatsApp ao Marcos; monitorar `possivelChurn=true` parado | Alerta | Sistema | P | 🔴 |
| 7 | Ficha CS apodrece | Monitor `fichaCsUpdatedAt` >14/30d → Alert nominal, escala HEAD | Alerta | Sistema | P | 🔴 |
| 8 | Tasks críticas sem evidência | `requiresEvidence: true` na origem das tasks de automação críticas | Campo obrigatório | Sistema | P | 🔴 |
| 9 | Suporte atrasado invisível | Agregador ≥3 vencidas por cliente → Alert + fator no score | Alerta+score | Sistema | P | 🟠 |
| 10 | Spend caindo | Comparador 4+4 semanas, queda ≥25% → Alert ao gestor | Automação | Sistema | M | 🟠 |
| 11 | Silêncio desacoplado do score | Cliente ACTIVE sem interação ≥21d (Curva A: 10d) → Alert | Alerta | Sistema | P | 🟠 |
| 12 | Cliente ÓTIMO esquecido | Streak ÓTIMO ≥N semanas → task CS "depoimento/case/expansão" | Automação | Sistema | P | 🟠 |
| 13 | Check-in sem degraus | Reincidência de `CHECKIN_MISSING` → task gestor + escala HEAD na 2ª semana + fator no score | Escalação | Sistema | M | 🟠 |
| 14 | Inadimplência fora do churn | Fator financeiro no score + `possivelChurn` em D+15/D+30 | Automação | Sistema | P | 🟠 |
| 15 | War Room invisível ao cliente | Ao abrir War Room → task "comunicar plano de recuperação ao cliente" | Automação | Sistema | P | 🟠 |
| 16 | Sem reunião estratégica | Radar `type=REUNIAO` >60d (Curva A: 45d) → task de agendamento | Automação | Sistema | P | 🟢 |
| 17 | Onboarding sem cadência | Tasks D+3/D+7/D+14/D+30 | Automação | Sistema | P | 🟢 |
| 18 | Renovação sem ritual | Task de retrospectiva X dias antes do fim do contrato | Automação | Sistema | P | 🟢 |
| 19 | Idade vs vida média churned | Mediana de sobrevivência + alerta na janela de risco | Automação | Sistema | G | 🟢 |
| 20 | Resposta pós-relatório | Instrumentar webhook WhatsApp (leitura/resposta) | Novo dado | Sistema | G | 🟢 |

---

## BLOCO 9 — Resposta à pergunta final

**"Se hoje 3 clientes estivessem em churn silencioso, a operação identificaria antes?" — NÃO.**

O cliente que vai cancelar em 6 semanas hoje se parece com isto: Curva A, resultado REGULAR há 2 meses (nunca RUIM → score baixo), spend caindo 10% por semana (ninguém mede), relacionamento marcado RUIM na ficha (badge que ninguém consome), 2 demandas de suporte vencidas (escaladas individualmente, invisíveis como padrão), ficha de CS sem atualização há 5 semanas (fichaCsUpdatedAt nunca lido), sem reunião estratégica há 70 dias, e sem receber o relatório semanal há 3 (gerado, nunca enviado, ninguém sabe). **Cada sinal existe no banco. Nenhum vira ação.**

Com os itens 🔴 do Bloco 8 implementados, esse mesmo cliente teria: score v2 ~70 (Alto) × multiplicador Curva A → `possivelChurn=true` + task com dono e prazo + "R$ em risco" no cockpit do Marcos — 4 a 6 semanas antes do cancelamento. A resposta vira **SIM, o sistema já me avisou.**

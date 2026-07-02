# AUDITORIA — SISTEMA DE METAS PERFORMLI

**Data:** 02/07/2026 · **Commit base:** `5001032` (branch claude/readme-update-pr-r0jgil)
**Método:** 6 auditores paralelos + red team de 10 cenários, read-only, evidência obrigatória em `arquivo:linha`.
**Cobertura:** goals.ts, resultado-engine.ts, health-scorer.ts, churn-scorer.ts, budget-monitor.ts, ga4/*, nuvemshop/*, meta-ads/*, google-ads/*, dal.ts, progress.ts, MetasBulkTable/MetasDashboard, telas de metas, cron/daily, client-onboarding, assignments.

---

## 1. SUMÁRIO EXECUTIVO

**A corrente da meta está QUEBRADA em 3 elos.** Uma meta cadastrada uma vez NÃO chega intacta a todos os pontos de consumo, o faturamento do e-commerce é medido com a métrica errada, e o cron que gera as metas semanais nunca roda.

### Findings por severidade
- **S0 (churn-crítico): 1** — cron de metas semanais nunca executa.
- **S1 (grave): 12**
- **S2 (atrito): 15**
- **S3 (cosmético): 6**

### Top 5 riscos de churn
1. **Cron de metas semanais nunca roda** (`syncWeeklyGoalsFromMonthly` exige sessão de usuário) → health/resultado calculados sem baseline semanal. **[S0]**
2. **Faturamento do e-commerce medido com `purchaseRevenue` (líquida de estornos)** em vez de `grossPurchaseRevenue` (bruta) → subreporta receita; agrava com fallback `totalRevenue` e fuso trocado. **[S1]** (Sintoma B)
3. **"Cliente sem meta" com meta existente** porque as telas leem HealthScore, não Goal → gestor acredita que a meta sumiu. **[S1]** (Sintoma A)
4. **Negócio local preso ao Meta Ads** + e-commerce sem GA4 vira "Péssimo" falso → alertas e tarefas errados, cliente cego. **[S1]**
5. **Sync quebrado degrada saúde/infla churn em silêncio** → cliente saudável entra no War Room ou cliente crítico fica verde. **[S1]**

### Veredito da corrente
| Elo | Estado |
|---|---|
| Cadastro da meta (Goal) | ⚠️ Frágil (0/negativo aceitos, salvamento não-transacional) |
| Conversão mensal→semanal | ❌ Quebrada (cron não roda; CPC/FREQUENCY errados; não atualiza) |
| Meta visível em toda navegação | ❌ Inconsistente (HealthScore≠Goal; 3 períodos de ROAS; números divergem) |
| Meta atribuída ao gestor | ⚠️ Frágil (sem gestor = tarefa engolida; troca de carteira = órfãs) |
| Realizado da fonte certa | ❌ Local→Meta hard-coded; e-commerce→métrica GA4 errada |
| Motores calculam certo | ⚠️ Corretos com dado limpo; mentem por omissão/zero com dado sujo |
| Alerta antes do cliente perceber | ❌ Sem watchdog de cron; fallback 2.0 mascara |

---

## 2. FINDINGS

### [S0-001] Cron de metas semanais nunca executa
- **Elo:** Conversão mensal→semanal · **Evidência:** `src/app/actions/goals.ts:66` (`requireSession()`), chamado por `src/app/api/cron/daily/route.ts:112`.
- **Atual:** `syncWeeklyGoalsFromMonthly` inicia com `requireSession()`, que faz `redirect('/login')` sem sessão. O cron roda com `CRON_SECRET`, sem cookie → o redirect lança `NEXT_REDIRECT`, é engolido pelo try/catch, `weeklyGoalsSync.ok=false`. A conversão automática de segunda **nunca acontece**; só o botão manual funciona.
- **Correto:** extrair a lógica para função de serviço sem `requireSession`; a server action mantém o guard, o cron chama a função interna.
- **Churn:** metas mensais existem, semanais nunca nascem → `recalculateAllClientsHealth` roda sem baseline semanal → health/resultado sem meta → clientes em risco não disparam alerta.
- **Esforço:** P.

### [S1-002] Faturamento e-commerce usa métrica líquida (Sintoma B — causa raiz)
- **Elo:** Fonte de dados · **Evidência:** `src/services/ga4/client.ts:44` (`purchaseRevenue`), `src/services/ga4/transformers.ts:58-60`.
- **Atual:** o GA4 é consultado com `purchaseRevenue` (receita de compras **menos estornos**). A regra de negócio é receita **bruta** (`grossPurchaseRevenue`, que não existe no código). Agravantes: fallback para `totalRevenue` quando compras=0 (inclui receita de anúncios/assinatura — `transformers.ts:60`); data do dia BRT carimbada como UTC (`transformers.ts:44`), deslocando vendas nas bordas.
- **Correto:** requisitar `grossPurchaseRevenue`; remover o fallback `totalRevenue`; definir `timeZone` explícito no `runReport`. Reprocessar o histórico do mês.
- **Não é dupla fonte:** Nuvemshop grava em linha separada (`platform=NUVEMSHOP`) e nenhum dashboard de faturamento a lê — confirmado.
- **Esforço:** M (+ reprocesso).

### [S1-003] "Cliente sem meta" com meta cadastrada (Sintoma A — causa raiz, tripla)
- **Elo:** Navegação · **Evidência:** `src/lib/dal.ts:148-156`, `:288`, `:1794-1801`; `ClientHealthGrid.tsx:119`; `ManagerCards.tsx:179`; `agency/page.tsx:98`.
- **Atual (3 causas somadas):**
  - **(A)** Dashboard/gestores decidem "sem meta" pela existência de **HealthScore**, não de **Goal**. HealthScore só nasce com meta **e** snapshot com valor (`health-scorer.ts:272`). Meta recém-cadastrada + sync pendente → "sem meta" falso.
  - **(B)** `MetasDashboard`/`progress.ts:75` só olham FATURAMENTO/ROAS/SPEND → cliente local (LEADS/CPL) aparece "sem meta".
  - **(C)** `Goal WEEKLY` só nasce no save do mês corrente ou no cron (que não roda, S0-001) → Client 360 mostra "Nenhuma meta semanal" em mês futuro / virada de domingo.
- **Correto:** distinguir "sem Goal" de "com Goal, sem HealthScore/sync"; rotular por métrica; derivar semanal da mensal na leitura.
- **Refutado:** desalinhamento de fuso no startDate — queries mensais usam overlap, resilientes a ±3h.
- **Esforço:** M.

### [S1-004] Negócio local preso ao Meta Ads
- **Evidência:** `src/services/health-scorer.ts:78,94-100,142-154`.
- **Atual:** para `businessType=LOCAL`, revenue/conversões/spend vêm só de `META_ADS`. Cliente local que roda só Google Ads → tudo zero → goals pulados → sem HealthScore → "sem metas" → invisível na operação.
- **Correto:** usar todas as contas de anúncio vinculadas ao cliente.
- **Esforço:** M.

### [S1-005] E-commerce sem GA4 vira "Péssimo" falso
- **Evidência:** `src/services/resultado-engine.ts:95,107,30`.
- **Atual:** revenue só soma GA4. E-commerce sem GA4 vinculado (mas com gasto) → `roas=0/spend=0` → PÉSSIMO → alerta + tarefa de otimização indevidos. Ausência de fonte tratada como resultado ruim.
- **Correto:** sem snapshot GA4 na janela = indeterminado (pular + log), nunca classificar.
- **Esforço:** P.

### [S1-006] Sync quebrado degrada saúde / infla churn em silêncio
- **Evidência:** `health-scorer.ts:272` (goal pulado se `actual===null`); `churn-scorer.ts:41` **e** `:51` (penalidade "sem dados" contada 2× = +20).
- **Atual:** com sync morto, health-scorer pula o goal e o cliente fica **verde por omissão**; ao mesmo tempo, o churn-scorer soma +20 (deveria ser +10) para cliente sem dado → cliente saudável salta para o War Room, ou crítico fica invisível.
- **Correto:** marcar score STALE/indeterminado quando o snapshot mais recente é velho; contar "sem dados" uma única vez.
- **Esforço:** M (health) / P (churn).

### [S1-007] Não existe watchdog de cron
- **Evidência:** nenhum consumidor de `SyncLog`/`lastRunAt` para alertar ausência; `daily-digest.ts` não referencia SyncLog.
- **Atual:** cron diário quebrado por 2 dias → health/churn congelam sem sinal; ninguém é avisado de que a rotina não rodou. Viola CLAUDE.md #9/#10.
- **Correto:** watchdog que alerta quando a última execução passou do esperado.
- **Esforço:** M.

### [S1-008] Fallback ROAS 2.0 silencioso
- **Evidência:** `resultado-engine.ts:21,108`.
- **Atual:** sem `Goal(ROAS)`, assume 2.0 sem registrar. Cliente com meta real 4.0 e ROAS 2.5 aparece "Ótimo/Escalar" (deveria ser Ruim/Otimização).
- **Correto:** sem meta → não classificar ou marcar "sem meta ROAS — cadastrar" + AutomationLog.
- **Esforço:** P.

### [S1-009] CPC e FREQUENCY divididos por 4,33 na conversão semanal
- **Evidência:** `goals.ts:11-13` (RATE_METRICS não inclui CPC/FREQUENCY → caem no default ÷4,33).
- **Atual:** CPC e FREQUENCY são razões/médias — o alvo semanal deveria ser igual ao mensal. Meta CPC R$2,00 vira R$0,46 → cliente cronicamente "fora da meta de CPC", alerta falso.
- **Correto:** adicionar `'CPC'` e `'FREQUENCY'` a RATE_METRICS.
- **Esforço:** P.

### [S1-010] Sync semanal em massa não atualiza metas existentes
- **Evidência:** `goals.ts:93` (`createMany({ skipDuplicates:true })`).
- **Atual:** meta semanal já existente não recebe o novo `targetValue` quando a mensal é editada — fica congelada no valor antigo.
- **Correto:** upsert em vez de createMany+skipDuplicates.
- **Esforço:** P.

### [S1-011] Salvamento em massa não é transacional
- **Evidência:** `goals.ts:116-146` (loop de upsert sem `$transaction`, sem status por linha).
- **Atual:** salvar 30 metas e falhar na 14ª grava 1–13 e perde 15–30, sem indicar onde parou; a UI marca tudo como salvo.
- **Correto:** `$transaction` (tudo-ou-nada) ou retorno por linha.
- **Esforço:** M.

### [S1-012] Meta com valor 0/negativo aceita como alvo real
- **Evidência:** `goals.ts:117` (só barra `<0` e `NaN`; 0 passa e grava), `MetasBulkTable.tsx:203,218,222`.
- **Atual:** valor negativo é pulado com check verde falso; **0 é gravado** → ROAS=0 faz "meta batida" sempre, ou vira PÉSSIMO/RUIM falso conforme o motor. Erro de digitação vira alvo silencioso.
- **Correto:** 0 = "sem meta"; negativo/NaN retornam aviso visível.
- **Esforço:** P.

### [S1-013] Vazamento de meta de faturamento em /reports
- **Evidência:** `dal.ts:1041-1077` (getReportData retorna Goal.targetValue WEEKLY sem `stripSensitive`).
- **Atual:** papel não-ADMIN (CS/ANALISTA/SUPERVISOR) com acesso ao cliente vê o valor da meta de FATURAMENTO em /reports — o que /agency/metas bloqueia. Quebra o RBAC v2.
- **Correto:** aplicar `stripSensitive(role,'Goal',...)` no getReportData. *(Em verificação pelo Agente 5 do RBAC.)*
- **Esforço:** M.

### S2 (atrito) — resumo
- **S2-014** Realizado da mesma meta vem de 2 fontes (Σ GA4 MTD × HealthScore.actualValue) e ROAS em 3 períodos sem rótulo — números divergem entre telas (`progress.ts:112` × `clients/[slug]/page.tsx:594` × `resultado-engine`).
- **S2-015** GoalPaceCard divide ROAS/CTR por dias ("meta diária 0,07x") — `dal.ts:2456`.
- **S2-016** Cliente crítico sem gestor primário → tarefa de plano de ação **engolida** (`resultado-engine.ts:64,140`).
- **S2-017** Troca de carteira não migra tarefas automáticas → órfãs no gestor antigo (`assignments.ts:24-34`).
- **S2-018** Onboarding conclui sem meta e sem conta de plataforma vinculada (`clients/new`, `convert/route.ts`).
- **S2-019** Financeiro/Metas sem timestamp de "última atualização" (regra 10).
- **S2-020** "sem dados" penaliza churn de cliente novo (janela de 8 semanas, prevAvg=0).
- **S2-021** churn-scorer mistura HealthScore MONTHLY na contagem de "semanas em RUIM" (`churn-scorer.ts:97-116`).
- **S2-022** budget-monitor: SPEND vs INVESTMENT não determinístico; mudo sem meta de verba; não re-alerta 90%→120%.
- **S2-023** SPEND é PRORATE + LOWER_IS_BETTER: subgasto no início do mês vira "Ótimo".
- **S2-024** Fronteira dom–sáb calculada em UTC, não SP (`utils.ts:36-53`).
- **S2-025** Metas fora de {FAT,ROAS,SPEND,LEADS,CPL} somem da tabela em massa após reload (`goals.ts:190`).
- **S2-026** Onboarding cria tarefas duplicadas (createClient inline + runClientOnboarding).
- **S2-027** Conversão de lead cria Goal mensal sem disparar a semanal.
- **S2-028** Nuvemshop × GA4 divergem em pedido cancelado sem cross-check exibido.

### S3 (cosmético) — resumo
- S3-029 Campos de meta na ficha do Client são dado morto (nenhum motor/tela consome) — decisão do Marcos (seção 5).
- S3-030 Windsor 100% inerte (código morto).
- S3-031 Snapshot D0 parcial conta no MTD.
- S3-032 Dedupe do alerta de resultado é assimétrico (data × windowKey).
- S3-033 Google Ads não faz auto-dismiss de SYNC_FAILED após sucesso.
- S3-034 Estorno reabre tarefa financeira mas não sobe churn (gap de visibilidade, não bug).

---

## 3. MATRIZ DE CONSISTÊNCIA ENTRE TELAS

| Tela | Meta (fonte) | Realizado (fonte) | Período | Diverge de /agency/metas? |
|---|---|---|---|---|
| /agency/metas | Goal MONTHLY (FAT/ROAS/SPEND/LEADS/CPL) | Σ GA4 conversionValue MTD | MTD | referência |
| Client 360 · Metas do Mês | Goal MONTHLY | **HealthScore.actualValue** | mês do HealthScore | **SIM** (fonte diferente) |
| Client 360 · GoalPaceCard | Goal MONTHLY | HealthScore.actualValue | mês, dia N | **SIM** (÷dias até ROAS) |
| Client 360 · ResultadoStrip | ROAS (ou 2.0) | **Client.resultadoRoas** | última semana fechada | **SIM** (período) |
| /agency (CEO) | não compara; "sem metas" = sem HealthScore | Σ GA4 MTD | MTD | rótulo enganoso |
| /managers (gestor) | Goal SPEND/INVESTMENT → MRR | — | mistura MONTHLY+WEEKLY×4,33 | **SIM** (só budget) |
| /anti-churn | ROAS implícita (Alert) | resultado-engine | semana fechada | **SIM** |
| /reports | Goal **WEEKLY** | HealthScore.actualValue WEEKLY | semana selecionada | **SIM** (mensal÷4,33) + vaza FAT |
| /cockpit, /dashboard, /check-ins | não exibem meta | — | — | N/A |

**Conclusão:** a mesma meta de FATURAMENTO tem realizado calculado de 2 formas; a mesma meta de ROAS aparece em 3 períodos. Sem fonte única de "realizado".

---

## 4. RED TEAM (10 cenários)

| # | Cenário | Real (elo quebrado) | Sev |
|---|---|---|---|
| 1 | GA4 cai qua, resultado seg | revenue=0 → PÉSSIMO falso + health verde por omissão (contradição) | S1 |
| 2 | Local só Google Ads | fora do resultado + LOCAL exige META → invisível | S1 |
| 3 | CPA a 60% (melhor) | scorer OTIMO **correto**; resultado/bulk cegos a CPA | S3 |
| 4 | Meta editada dia 20 | UI atualiza semanal; cron falha + skipDuplicates não atualiza | S1 |
| 5 | Cliente novo dia 28 | sem score + churn "sem dados" +20 | S2 |
| 6 | Cron quebrado 2 dias | ninguém sabe (sem watchdog) | S1 |
| 7 | Estorno reabre task | não contamina saúde/churn (correto); gap de visibilidade | S3 |
| 8 | Troca de carteira | só isPrimary muda; tasks órfãs | S2 |
| 9 | Nuvemshop×GA4 divergem | meta usa só GA4; sem cross-check | S2 |
| 10 | Meta 0 por digitação | grava 0 → RUIM/PÉSSIMO falso; budget mudo | S1 |

---

## 5. DECISÕES QUE PRECISAM DO MARCOS

1. **Campos de meta na ficha do Client** (`roasMinimo`, `cpaMaximo`, `investimentoMeta/Google/Tiktok`, `faturamentoEsperado`):
   - **A) Plugar como fallback** dos motores quando não há Goal (precedência Goal > Client). Aproveita os valores já cadastrados. Esforço M.
   - **B) Remover** (migration + limpar seed/RBAC). Elimina a 2ª fonte de verdade. Esforço P (mas destrutiva).
   - *Recomendação do auditor: A.*
2. **Fallback ROAS 2.0** (S1-008): manter silencioso × virar alerta "cliente sem meta ROAS" × não classificar sem meta.
3. **SPEND lower-is-better** (S2-023): mede "não estourar verba" ou "entregar o volume planejado"? Muda a semântica do health.
4. **Meta 0** (S1-012): tratar como "sem meta" (sugerido) × exigir `>0` × permitir 0 explícito.

---

## 6. HIPÓTESES NÃO CONFIRMADAS
- Vazamento em /reports (S1-013): confirmado que o sync cria Goal WEEKLY de todas as métricas e getReportData não faz strip; falta validar em runtime que um não-ADMIN alcança /reports de cliente com meta FATURAMENTO. *(Agente 5 do RBAC está confirmando.)*
- SEGUIDORES/REACH ÷4,33 conceitualmente questionável (estoque × fluxo) — depende do motor que consome.
- Existência de Goals com targetValue=0 na base de produção (amplifica S1-012).

---

## 7. PLANO DE CORREÇÃO SUGERIDO (por ROI de churn evitado)

**Onda 1 — parar a hemorragia (P, alto impacto):**
1. S0-001 cron de metas semanais (remover requireSession).
2. S1-009 CPC/FREQUENCY em RATE_METRICS.
3. S1-012 rejeitar meta 0/negativa.
4. S1-005 e-commerce sem GA4 = indeterminado (não PÉSSIMO).
5. S1-008 fallback ROAS 2.0 → não classificar/alertar.
6. S1-010 upsert no sync semanal.

**Onda 2 — medir certo (M):**
7. S1-002 grossPurchaseRevenue + timezone (Sintoma B) + reprocesso.
8. S1-003 "sem meta" vs "sem dado" nas telas (Sintoma A).
9. S1-004 local usa plataforma vinculada.
10. S1-006 health STALE + churn "sem dados" 1×.
11. S1-011 salvamento transacional.
12. S1-013 stripSensitive em /reports.

**Onda 3 — confiança e cobertura (M/G):**
13. S1-007 watchdog de cron.
14. S2-014/015/016/017 fonte única de realizado, GoalPaceCard, atribuição sem gestor, migração de tarefas.
15. S2-018/026 onboarding com trava de meta+conta e sem tarefas duplicadas.
16. Demais S2/S3 conforme capacidade.

**Decisões do Marcos (seção 5) destravam a Onda 2/3.**

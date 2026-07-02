/**
 * Dados da migração ClickUp → Performli (lotes: internas, rituais, metas,
 * contratos), extraídos via API do ClickUp em 2026-07-02 pelo A0.
 *
 * Fonte por lista:
 *  - Tarefas Head 901112503157 · Supervisor 901113760490 · CS 901109925270 ·
 *    Gestores 901112524404 (19 tasks)
 *  - Encontros & Rituais 901109936667 (12)
 *  - Objetivos & Metas Q1-Q4 901109936693/92/91/90 (9)
 *  - Gestão de Contratos 901109936681 (17)
 *
 * Contas a Receber (31) NÃO entram aqui: fonte da verdade é o Asaas (valores
 * reais via API) — ver asaas-task-reconciler. Contas a Pagar (12) viram tasks
 * recorrentes internas (valores não expostos pela API do ClickUp; Marcos
 * completa o valor no painel).
 *
 * Recorrência: inferida do TÍTULO de cada task (ex.: "seg e qui às 10hs" →
 * WEEKLY [1,4]). 0=domingo. mode 'schedule' (materializa por data via cron).
 */

import type { TaskPriority } from '@prisma/client'
import type { RecurrenceRule } from '@/lib/tasks/recurrence'

export type MigTaskInterna = {
  clickupId: string
  title: string
  /** externalId (ClickUp) do responsável; null → Marcos. */
  assigneeExternalId: string | null
  /** externalIds adicionais (auxAssignees). */
  extraAssignees?: string[]
  dueDateMs: number | null
  priority: TaskPriority
  /** Papel de origem (vira tag para filtro). */
  papel: 'HEAD' | 'SUPERVISOR' | 'CS' | 'GESTORES' | 'RITUAL' | 'FINANCEIRO'
  recurrence?: RecurrenceRule
  /** Tipo da task no Performli. */
  tipo: 'SIMPLES' | 'REUNIAO' | 'COBRANCA' | 'AUDITORIA'
}

const W = (byWeekday: number[], interval = 1): RecurrenceRule =>
  ({ freq: 'WEEKLY', interval, byWeekday, mode: 'schedule' })
const MONTHLY = (interval = 1): RecurrenceRule => ({ freq: 'MONTHLY', interval, mode: 'schedule' })
const DAILY_UTIL: RecurrenceRule = { freq: 'DAILY', interval: 1, mode: 'schedule', skipWeekends: true }

// ─── Lote 1: tarefas internas por papel (Head/Supervisor/CS/Gestores) ─────────
export const MIG_INTERNAS: MigTaskInterna[] = [
  { clickupId: '868k6q7up', title: 'Analisar feedback do Supervisor — até as 15h', assigneeExternalId: '152690431', dueDateMs: 1783101600000, priority: 'ALTA', papel: 'HEAD', tipo: 'SIMPLES', recurrence: W([2]) },
  { clickupId: '868k6q7tn', title: 'Review mensal de KPIs — Head de Tráfego (última semana)', assigneeExternalId: '152690431', dueDateMs: 1785481200000, priority: 'ALTA', papel: 'HEAD', tipo: 'SIMPLES', recurrence: MONTHLY() },
  { clickupId: '868k64k0b', title: 'Analisar Resumo da Semana | Performli', assigneeExternalId: '152690431', dueDateMs: 1783062000000, priority: 'ALTA', papel: 'HEAD', tipo: 'SIMPLES', recurrence: { freq: 'WEEKLY', interval: 1, mode: 'schedule' } },
  { clickupId: '868k1r580', title: '🔴 AUDITORIA · Correções críticas de arquitetura ClickUp', assigneeExternalId: '152690431', dueDateMs: 1781643600000, priority: 'CRITICA', papel: 'HEAD', tipo: 'AUDITORIA' },
  { clickupId: '868k0fxrz', title: '🔴 Escalação · 2 feedbacks negativos · consultar CS + gestor', assigneeExternalId: '152690431', dueDateMs: null, priority: 'ALTA', papel: 'HEAD', tipo: 'SIMPLES' },
  { clickupId: '868jytm4e', title: '[DIÁRIO] Conferir Saúde das Contas | Performli', assigneeExternalId: '152690431', dueDateMs: null, priority: 'CRITICA', papel: 'HEAD', tipo: 'SIMPLES', recurrence: DAILY_UTIL },
  { clickupId: '868k5bcz6', title: 'Auditoria de Contas — Supervisor de Tráfego (seg e qui às 10h)', assigneeExternalId: '152690431', dueDateMs: 1782738000000, priority: 'CRITICA', papel: 'SUPERVISOR', tipo: 'AUDITORIA', recurrence: W([1, 4]) },
  { clickupId: '868jzeqdu', title: 'Feedback para o Head de Tráfego — até as 12h', assigneeExternalId: '152690431', dueDateMs: 1781276400000, priority: 'ALTA', papel: 'SUPERVISOR', tipo: 'SIMPLES', recurrence: W([1]) },
  { clickupId: '868k6mqd0', title: '🔁 Zeragem Semanal · Feedback Negativo (toda segunda 9h)', assigneeExternalId: '87373550', dueDateMs: 1783339200000, priority: 'ALTA', papel: 'CS', tipo: 'SIMPLES', recurrence: W([1]) },
  { clickupId: '868k5xq1f', title: 'Atualizar Planilha do Farol — Sucesso do Cliente (terça até 14h)', assigneeExternalId: '87373550', dueDateMs: 1782838800000, priority: 'ALTA', papel: 'CS', tipo: 'SIMPLES', recurrence: W([2]) },
  { clickupId: '868k5xq1d', title: '🔴 Varredura de Sexta · Feedbacks Negativos da Semana (toda sexta 16h)', assigneeExternalId: '87373550', dueDateMs: 1783105200000, priority: 'ALTA', papel: 'CS', tipo: 'SIMPLES', recurrence: W([5]) },
  { clickupId: '868k5gjbg', title: 'Pulso emocional da carteira — Sucesso do Cliente (após War Room)', assigneeExternalId: '87373550', dueDateMs: 1782997200000, priority: 'ALTA', papel: 'CS', tipo: 'SIMPLES', recurrence: W([1]) },
  { clickupId: '868k4hh4w', title: 'Avaliar qualidade do check-in — Sucesso do Cliente (segunda 13h)', assigneeExternalId: '87373550', dueDateMs: 1782748800000, priority: 'ALTA', papel: 'CS', tipo: 'SIMPLES', recurrence: W([1]) },
  { clickupId: '868jmrg5y', title: 'Processo de Offboarding — Cliente Cancelou (referência)', assigneeExternalId: '87373550', dueDateMs: null, priority: 'ALTA', papel: 'CS', tipo: 'SIMPLES' },
  { clickupId: '868k57r06', title: 'Preparação para Reunião de Sucesso — (toda outra terça até 17h)', assigneeExternalId: '152690431', dueDateMs: 1783454400000, priority: 'ALTA', papel: 'GESTORES', tipo: 'SIMPLES', recurrence: W([2], 2) },
  { clickupId: '868k4mtjj', title: 'Preparação para Reunião de Sucesso — (toda outra terça até 17h)', assigneeExternalId: '254576012', dueDateMs: 1783454400000, priority: 'ALTA', papel: 'GESTORES', tipo: 'SIMPLES', recurrence: W([2], 2) },
  { clickupId: '868k4cqwt', title: 'Preparação para Reunião de Sucesso — (toda outra terça até 17h)', assigneeExternalId: '81516815', dueDateMs: 1783454400000, priority: 'ALTA', papel: 'GESTORES', tipo: 'SIMPLES', recurrence: W([2], 2) },
  { clickupId: '868jmqr7z', title: 'Protocolo de Escalação — quando e como acionar o Supervisor (referência)', assigneeExternalId: null, dueDateMs: null, priority: 'MEDIA', papel: 'GESTORES', tipo: 'SIMPLES' },
  { clickupId: '868jmqqz6', title: 'Sistema de Hipóteses — como pensar estrategicamente (referência)', assigneeExternalId: null, dueDateMs: null, priority: 'MEDIA', papel: 'GESTORES', tipo: 'SIMPLES' },
]

// ─── Lote 2: Encontros & Rituais (Task type REUNIAO, multi-assignee) ──────────
const TIME_TODO = ['152690431', '81516815', '254576012', '81525390', '87373550']
export const MIG_RITUAIS: MigTaskInterna[] = [
  { clickupId: '868k7r5gr', title: '🚨 War Room — segunda 09:00', assigneeExternalId: '152690431', extraAssignees: TIME_TODO, dueDateMs: 1783598400000, priority: 'CRITICA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([1]) },
  { clickupId: '868k6mrdx', title: 'Daily 9:00 — 15 min', assigneeExternalId: '152690431', extraAssignees: TIME_TODO, dueDateMs: 1783080000000, priority: 'CRITICA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: DAILY_UTIL },
  { clickupId: '868k5k5cg', title: 'Reunião Quinzenal — Análise de Sucesso e Aprendizados (sexta 10h30)', assigneeExternalId: '152690431', extraAssignees: ['81525390', '254576012', '81516815'], dueDateMs: 1783690200000, priority: 'ALTA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([5], 2) },
  { clickupId: '868k3k3t6', title: 'Reunião Quinzenal — Head + Supervisor de Tráfego (segunda 10h)', assigneeExternalId: '152690431', dueDateMs: 1783342800000, priority: 'ALTA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([1], 2) },
  // 868jyucxw é duplicata da 868k3k3t6 (mesmo ritual, sem assignee) — pulada.
  { clickupId: '868jr38yn', title: '1:1 Quinzenal — Supervisor com Gestor Júnior (terça 11h30)', assigneeExternalId: '81516815', extraAssignees: ['254576012'], dueDateMs: null, priority: 'MEDIA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([2], 2) },
  { clickupId: '868jr38ub', title: '1:1 Quinzenal — Supervisor com Gestor Pleno (terça 11h)', assigneeExternalId: '81516815', dueDateMs: null, priority: 'MEDIA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([2], 2) },
  { clickupId: '868jr312w', title: '1:1 Quinzenal — Supervisor com Gestor Sênior (terça 10h30)', assigneeExternalId: '81516815', extraAssignees: ['152690431'], dueDateMs: null, priority: 'MEDIA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([2], 2) },
  { clickupId: '868jr0hr0', title: 'All Hands — todo o time (quinzenal, quarta 10h)', assigneeExternalId: '152690431', extraAssignees: TIME_TODO, dueDateMs: null, priority: 'ALTA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([3], 2) },
  { clickupId: '868jp9m3v', title: '1:1 Head + Supervisor + Sucesso do Cliente (quinzenal, terça 9h30)', assigneeExternalId: '152690431', extraAssignees: ['81516815', '87373550'], dueDateMs: null, priority: 'ALTA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: W([2], 2) },
  { clickupId: '868jp9m13', title: 'Reunião Trimestral — Resultados + próximos 90 dias (dia 1, 15h)', assigneeExternalId: '152690431', extraAssignees: TIME_TODO, dueDateMs: null, priority: 'ALTA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: MONTHLY(3) },
  { clickupId: '868jp9kzr', title: 'Reunião Mensal — Abertura do mês (dia 01, 10h)', assigneeExternalId: '152690431', extraAssignees: TIME_TODO, dueDateMs: null, priority: 'ALTA', papel: 'RITUAL', tipo: 'REUNIAO', recurrence: MONTHLY() },
]

// ─── Lote 3: Contas a Pagar → tasks financeiras recorrentes mensais ───────────
// Valores não expostos pela API — Marcos completa no painel. Recorrência MENSAL
// (folha/impostos/mensalidades). Dedupe clickup-pagar:{id}.
export const MIG_CONTAS_PAGAR: MigTaskInterna[] = [
  { clickupId: '868k6ukng', title: 'Pagar — Taxas Asaas', assigneeExternalId: '152690431', dueDateMs: 1785481200000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868k5bcua', title: 'Pagar — INSS · Pró-labore', assigneeExternalId: '152690431', dueDateMs: 1784444400000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868k5bc10', title: 'Pagar — Assessoria Jurídica', assigneeExternalId: '152690431', dueDateMs: 1784530800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868k5bbv0', title: 'Pagar — Imposto DAS', assigneeExternalId: '152690431', dueDateMs: 1784530800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868k57qz8', title: 'Pagar — Leandro (parcela II)', assigneeExternalId: '152690431', dueDateMs: 1784530800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868k04xbf', title: 'Pagar — Distribuição de Lucro', assigneeExternalId: '152690431', dueDateMs: 1783666800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868jzm154', title: 'Pagar — Leandro', assigneeExternalId: '152690431', dueDateMs: 1783666800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868jzm0tk', title: 'Pagar — Marcos', assigneeExternalId: '152690431', dueDateMs: 1783666800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868jzm0pg', title: 'Pagar — Kyn', assigneeExternalId: '152690431', dueDateMs: 1783666800000, priority: 'MEDIA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868jzkyyg', title: 'Pagar — Pablo', assigneeExternalId: '152690431', dueDateMs: 1783666800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868jzkycq', title: 'Pagar — Letícia', assigneeExternalId: '152690431', dueDateMs: 1783666800000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
  { clickupId: '868jzer90', title: 'Pagar — Mensalidade Acountech', assigneeExternalId: '152690431', dueDateMs: 1783407600000, priority: 'ALTA', papel: 'FINANCEIRO', tipo: 'COBRANCA', recurrence: MONTHLY() },
]

// ─── Lote 4: Metas Q1-Q4 (Objetivos & Metas) ──────────────────────────────────
export type MigMeta = {
  clickupId: string
  title: string
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4'
  /** Status no ClickUp: 'a conquistar' | 'não conquistada'. */
  conquistada: boolean | null
  dueDateMs: number | null
}
export const MIG_METAS: MigMeta[] = [
  { clickupId: '868jf90xt', title: 'Entregar Estratégias de Grupo VIP', quarter: 'Q1', conquistada: null, dueDateMs: null },
  { clickupId: '868gze3jp', title: 'Fechar 12 novos clientes', quarter: 'Q1', conquistada: false, dueDateMs: 1774940400000 },
  { clickupId: '868gzex2a', title: 'Fechar 09 novos clientes', quarter: 'Q2', conquistada: false, dueDateMs: 1782802800000 },
  { clickupId: '868gzemqc', title: 'Aumentar Equipe', quarter: 'Q2', conquistada: false, dueDateMs: 1782802800000 },
  { clickupId: '868gzfcgg', title: 'Contratar um Head de Tráfego', quarter: 'Q3', conquistada: null, dueDateMs: 1783666800000 },
  { clickupId: '868gzeymn', title: 'Fechar 08 novos clientes', quarter: 'Q3', conquistada: null, dueDateMs: 1790751600000 },
  { clickupId: '868gzf4en', title: 'Fechar 06 novos clientes', quarter: 'Q4', conquistada: null, dueDateMs: 1797750000000 },
  { clickupId: '868gze9z5', title: 'Alcançar 70 clientes ATIVOS', quarter: 'Q4', conquistada: null, dueDateMs: 1797750000000 },
  { clickupId: '868gze9vy', title: 'Alcançar R$ 100 mil de faturamento BRUTO', quarter: 'Q4', conquistada: null, dueDateMs: 1797750000000 },
]

// ─── Lote 5: Gestão de Contratos (reconciliação — NUNCA duplicar) ─────────────
// Regra do dono: se o cliente JÁ tem Contract no Performli, desconsiderar o do
// ClickUp. Sem match de cliente → relatório 'não conciliado' (sem chute).
export type MigContrato = {
  clickupId: string
  nomeClickUp: string
  /** Aliases para matching com Client.name/slug (normalize). */
  clientAliases: string[]
  /** Fim de vigência (due_date do ClickUp). */
  vigenciaFimMs: number
}
export const MIG_CONTRATOS: MigContrato[] = [
  { clickupId: '868juc150', nomeClickUp: 'Contrato | Tayna Moda Feminina', clientAliases: ['Tayna Moda Feminina'], vigenciaFimMs: 1795935600000 },
  { clickupId: '868jhh6y9', nomeClickUp: 'Contrato | Marina', clientAliases: ['Marina'], vigenciaFimMs: 1794034800000 },
  { clickupId: '868jhh5x1', nomeClickUp: 'Contrato | VICTOR', clientAliases: ['Victor'], vigenciaFimMs: 1794034800000 },
  { clickupId: '868j3cfz9', nomeClickUp: 'Contrato | Rayane', clientAliases: ['Rayane'], vigenciaFimMs: 1791010800000 },
  { clickupId: '868hz1d77', nomeClickUp: 'Contrato | Laura', clientAliases: ['Laura', 'Laura Mastrandéa', 'Laura Mastrandea'], vigenciaFimMs: 1789974000000 },
  { clickupId: '868hvh1e6', nomeClickUp: 'Contrato | Pedro', clientAliases: ['Pedro'], vigenciaFimMs: 1796540400000 },
  { clickupId: '868hvh19r', nomeClickUp: 'Contrato | João', clientAliases: ['João', 'Joao'], vigenciaFimMs: 1790578800000 },
  { clickupId: '868hcmuc3', nomeClickUp: 'Contrato | Catita Store', clientAliases: ['Catita Store'], vigenciaFimMs: 1786258800000 },
  { clickupId: '868h9ahvd', nomeClickUp: 'Contrato | Lavinny Store', clientAliases: ['Lavinny Store', 'Lavinny'], vigenciaFimMs: 1785654000000 },
  { clickupId: '868h77m13', nomeClickUp: 'Contrato | Maitê', clientAliases: ['Maitê', 'Maite'], vigenciaFimMs: 1816585200000 },
  { clickupId: '868gmr4he', nomeClickUp: 'Contrato | Luana', clientAliases: ['Luana'], vigenciaFimMs: 1802761200000 },
  { clickupId: '868gf8um1', nomeClickUp: 'Contrato | Rafaela', clientAliases: ['Rafaela'], vigenciaFimMs: 1796540400000 },
  { clickupId: '868g8hr91', nomeClickUp: 'Contrato | Thais', clientAliases: ['Thais', 'Thaís'], vigenciaFimMs: 1796540400000 },
  { clickupId: '868g7m73z', nomeClickUp: 'Contrato | Leticia Store', clientAliases: ['Leticia Store', 'Letícia Store'], vigenciaFimMs: 1796540400000 },
  { clickupId: '868fd0uj5', nomeClickUp: 'Contrato | Daniela', clientAliases: ['Daniela'], vigenciaFimMs: 1783407600000 },
  { clickupId: '868e9u52w', nomeClickUp: 'Contrato | Via Miami RP', clientAliases: ['Via Miami', 'Via Miami RP'], vigenciaFimMs: 1796540400000 },
  { clickupId: '868e1fq8g', nomeClickUp: 'Contrato – My Muse BR', clientAliases: ['My Muse', 'My Muse BR', 'My Muse Confecções'], vigenciaFimMs: 1802761200000 },
]

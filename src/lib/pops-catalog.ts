/**
 * Catálogo vivo dos 21 POPs da Arkza (OPE/CSX/WAR/CRM/FIN/CAP/ONB).
 *
 * É um catálogo ESTÁTICO (não um model Prisma): os 21 POPs são um conjunto fixo
 * e conhecido. O status de implementação reflete o que já foi sistematizado no
 * Performli — atualizado a cada fatia entregue. Objetivo: o Marcos enxergar
 * quais processos já rodam no sistema e quais ainda dependem de pessoas/memória.
 */

export type PopArea = 'CAP' | 'ONB' | 'OPE' | 'CSX' | 'WAR' | 'CRM' | 'FIN'

export type ImplementacaoStatus = 'MANUAL' | 'PARCIAL' | 'AUTOMATIZADO'

export type Pop = {
  codigo: string
  nome: string
  area: PopArea
  responsavelPadrao: string
  frequencia: string
  score: number // priorização 0.30
  implementacao: ImplementacaoStatus
  nivelAutomacao: number // 0–100
  sla: string
  riscoSeFalhar: string
  ondeVive: string | null // rota no sistema, quando já sistematizado
}

export const POP_AREAS: { key: PopArea; nome: string }[] = [
  { key: 'CAP', nome: 'Captação e Comercial' },
  { key: 'ONB', nome: 'Onboarding de Cliente' },
  { key: 'OPE', nome: 'Operação de Tráfego' },
  { key: 'CSX', nome: 'Sucesso do Cliente' },
  { key: 'WAR', nome: 'War Room e Contas Críticas' },
  { key: 'CRM', nome: 'Automação e CRM' },
  { key: 'FIN', nome: 'Financeiro' },
]

export const POPS_CATALOG: Pop[] = [
  // ── CAP ──────────────────────────────────────────────────────────────────
  {
    codigo: 'CAP-01', nome: 'Prospecção e qualificação de leads comerciais', area: 'CAP',
    responsavelPadrao: 'Comercial / Marcos', frequencia: 'Contínua', score: 2.78,
    implementacao: 'MANUAL', nivelAutomacao: 20, sla: 'Primeiro contato em 4h',
    riscoSeFalhar: 'Lead quente perdido por falta de follow-up', ondeVive: '/comercial',
  },
  {
    codigo: 'CAP-02', nome: 'Fechamento de contrato e definição de comissão', area: 'CAP',
    responsavelPadrao: 'ADMIN / Comercial', frequencia: 'Por fechamento', score: 3.28,
    implementacao: 'MANUAL', nivelAutomacao: 15, sla: 'Contrato em até 3 dias',
    riscoSeFalhar: 'Cliente operando sem contrato ou sem fee cadastrado', ondeVive: '/juridico',
  },
  {
    codigo: 'CAP-03', nome: 'Recuperação de leads frios e ex-clientes', area: 'CAP',
    responsavelPadrao: 'Comercial / Marcos', frequencia: 'Mensal', score: 3.40,
    implementacao: 'MANUAL', nivelAutomacao: 10, sla: 'Contato em até 7 dias na fila',
    riscoSeFalhar: 'Oportunidade de reativação perdida por esquecimento', ondeVive: null,
  },
  // ── ONB ──────────────────────────────────────────────────────────────────
  {
    codigo: 'ONB-04', nome: 'Configuração inicial do cliente', area: 'ONB',
    responsavelPadrao: 'Gestor / ADMIN', frequencia: 'Por cliente novo', score: 3.34,
    implementacao: 'MANUAL', nivelAutomacao: 15, sla: 'Configuração em 3 dias',
    riscoSeFalhar: 'Cliente novo opera às cegas na primeira semana', ondeVive: null,
  },
  {
    codigo: 'ONB-05', nome: 'Acompanhamento dos primeiros 30 dias', area: 'ONB',
    responsavelPadrao: 'Gestor + CS', frequencia: 'Diária (30 dias)', score: 4.09,
    implementacao: 'MANUAL', nivelAutomacao: 10, sla: 'Revisão obrigatória no dia 30',
    riscoSeFalhar: 'Churn precoce em 60–90 dias por onboarding mal acompanhado', ondeVive: null,
  },
  // ── OPE ──────────────────────────────────────────────────────────────────
  {
    codigo: 'OPE-06', nome: 'Check-in semanal por cliente', area: 'OPE',
    responsavelPadrao: 'Gestor (preenche) · CS (valida)', frequencia: 'Semanal', score: 4.39,
    implementacao: 'AUTOMATIZADO', nivelAutomacao: 80, sla: 'Preenchimento até quarta · revisão sexta',
    riscoSeFalhar: 'Cliente sem check-in vira sinal de churn', ondeVive: '/check-ins',
  },
  {
    codigo: 'OPE-07', nome: 'Prestação de contas semanal ao cliente', area: 'OPE',
    responsavelPadrao: 'Gestor', frequencia: 'Semanal', score: 3.62,
    implementacao: 'PARCIAL', nivelAutomacao: 55, sla: 'Envio até sexta 18h',
    riscoSeFalhar: 'Cliente sem retorno semanal questiona o serviço', ondeVive: '/reports',
  },
  {
    codigo: 'OPE-08', nome: 'Auditoria técnica de contas pelo Supervisor', area: 'OPE',
    responsavelPadrao: 'Supervisor', frequencia: 'Mensal', score: 3.22,
    implementacao: 'MANUAL', nivelAutomacao: 10, sla: '1 auditoria por cliente/mês',
    riscoSeFalhar: 'Problema técnico de conta não detectado por meses', ondeVive: null,
  },
  {
    codigo: 'OPE-09', nome: 'Relatório mensal consolidado ao cliente', area: 'OPE',
    responsavelPadrao: 'Gestor', frequencia: 'Mensal', score: 3.22,
    implementacao: 'PARCIAL', nivelAutomacao: 60, sla: 'Enviado até dia 5',
    riscoSeFalhar: 'Mês sem prestação de contas formal reduz retenção', ondeVive: '/reports',
  },
  // ── CSX ──────────────────────────────────────────────────────────────────
  {
    codigo: 'CSX-10', nome: 'Validação de qualidade dos check-ins', area: 'CSX',
    responsavelPadrao: 'CS', frequencia: 'Semanal', score: 3.76,
    implementacao: 'PARCIAL', nivelAutomacao: 55, sla: 'Revisão CS em até 48h',
    riscoSeFalhar: 'Check-in ruim chega ao cliente sem revisão', ondeVive: '/check-ins',
  },
  {
    codigo: 'CSX-11', nome: 'Acompanhamento diário de demandas em atraso', area: 'CSX',
    responsavelPadrao: 'CS', frequencia: 'Diária', score: 3.91,
    implementacao: 'PARCIAL', nivelAutomacao: 50, sla: 'D+3 alerta · D+7 escala',
    riscoSeFalhar: 'Demanda atrasada reincidente gera insatisfação', ondeVive: '/cockpit',
  },
  {
    codigo: 'CSX-12', nome: 'Fechamento semanal e termômetro da carteira', area: 'CSX',
    responsavelPadrao: 'CS', frequencia: 'Semanal', score: 4.32,
    implementacao: 'MANUAL', nivelAutomacao: 25, sla: 'Fechamento até sexta 18h',
    riscoSeFalhar: 'Semana fecha sem visão do estado real da carteira', ondeVive: null,
  },
  {
    codigo: 'CSX-13', nome: 'Protocolo anti-churn proativo', area: 'CSX',
    responsavelPadrao: 'CS', frequencia: 'Contínua', score: 4.40,
    implementacao: 'AUTOMATIZADO', nivelAutomacao: 75, sla: 'Ação em até 48h após sinal',
    riscoSeFalhar: 'Churn silencioso de cliente aparentemente OK', ondeVive: '/anti-churn',
  },
  // ── WAR ──────────────────────────────────────────────────────────────────
  {
    codigo: 'WAR-14', nome: 'Abertura de War Room para conta crítica', area: 'WAR',
    responsavelPadrao: 'CS + ADMIN', frequencia: 'Por evento crítico', score: 4.52,
    implementacao: 'AUTOMATIZADO', nivelAutomacao: 80, sla: 'Abertura em 24h · reunião em 48h',
    riscoSeFalhar: 'Cliente crítico sem diagnóstico ou critério de saída', ondeVive: '/anti-churn',
  },
  {
    codigo: 'WAR-15', nome: 'Reunião de War Room e documentação de decisões', area: 'WAR',
    responsavelPadrao: 'ADMIN + CS', frequencia: 'Por War Room', score: 3.40,
    implementacao: 'MANUAL', nivelAutomacao: 20, sla: 'Ata em 24h após a reunião',
    riscoSeFalhar: 'Decisões ficam no WhatsApp e não viram tarefas', ondeVive: '/anti-churn',
  },
  {
    codigo: 'WAR-16', nome: 'Acompanhamento pós-War Room até saída do crítico', area: 'WAR',
    responsavelPadrao: 'CS', frequencia: 'Semanal (enquanto ativo)', score: 4.47,
    implementacao: 'AUTOMATIZADO', nivelAutomacao: 75, sla: 'Revisão semanal · 3 semanas escala p/ Marcos',
    riscoSeFalhar: 'War Room esquecida, cliente sai sem ninguém perceber', ondeVive: '/anti-churn',
  },
  // ── CRM ──────────────────────────────────────────────────────────────────
  {
    codigo: 'CRM-17', nome: 'Classificação automática de Resultado para Etapa', area: 'CRM',
    responsavelPadrao: 'Sistema / Red', frequencia: 'Diária', score: 3.94,
    implementacao: 'PARCIAL', nivelAutomacao: 50, sla: 'Classificação em 1h após health score',
    riscoSeFalhar: 'Cliente ruim permanece em etapa errada, sem ação', ondeVive: '/pipeline',
  },
  {
    codigo: 'CRM-18', nome: 'Acompanhamento diário de clientes em Otimização', area: 'CRM',
    responsavelPadrao: 'Red', frequencia: 'Diária', score: 4.19,
    implementacao: 'MANUAL', nivelAutomacao: 20, sla: '1 dia s/ comentário alerta · 7 dias escala',
    riscoSeFalhar: 'Cliente em Otimização esquecido vira crítico', ondeVive: null,
  },
  // ── FIN ──────────────────────────────────────────────────────────────────
  {
    codigo: 'FIN-19', nome: 'Controle de Contas a Receber e inadimplência', area: 'FIN',
    responsavelPadrao: 'ADMIN', frequencia: 'Diária', score: 4.45,
    implementacao: 'AUTOMATIZADO', nivelAutomacao: 75, sla: 'Régua D+3 / D+7 / D+15 / D+30',
    riscoSeFalhar: 'Cliente inadimplente há semanas sem cobrança ativa', ondeVive: '/financeiro',
  },
  {
    codigo: 'FIN-20', nome: 'Controle de Contas a Pagar e categorização de despesas', area: 'FIN',
    responsavelPadrao: 'ADMIN', frequencia: 'Semanal', score: 3.03,
    implementacao: 'PARCIAL', nivelAutomacao: 50, sla: 'Categorização em 48h',
    riscoSeFalhar: 'DRE distorcido por despesas sem categoria', ondeVive: '/financeiro',
  },
  {
    codigo: 'FIN-21', nome: 'Atualização semanal do dashboard financeiro', area: 'FIN',
    responsavelPadrao: 'ADMIN', frequencia: 'Semanal', score: 3.88,
    implementacao: 'PARCIAL', nivelAutomacao: 60, sla: 'Snapshot até segunda 10h',
    riscoSeFalhar: 'Decisão financeira sobre dado desatualizado', ondeVive: '/financeiro',
  },
]

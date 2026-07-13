// Rótulos/cores da Central Operacional. Keyed por string com fallback — robusto
// a valores ausentes (não quebra o build por exaustividade).

export const STATUS_LABELS: Record<string, string> = {
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_CLIENTE: 'Aguardando cliente',
  AGUARDANDO_GESTOR: 'Aguardando gestor',
  AGUARDANDO_CS: 'Aguardando CS',
  EM_VALIDACAO: 'Em validação',
  AJUSTES_SOLICITADOS: 'Ajustes solicitados',
  BLOQUEADO: 'Bloqueado',
  ATRASADO: 'Atrasado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const STATUS_COLORS: Record<string, string> = {
  A_FAZER: 'text-[#87919E] border-[#38435C]',
  EM_ANDAMENTO: 'text-[#95BBE2] border-[#95BBE2]/30',
  AGUARDANDO_CLIENTE: 'text-[#EAB308] border-[#EAB308]/30',
  AGUARDANDO_GESTOR: 'text-[#EAB308] border-[#EAB308]/30',
  AGUARDANDO_CS: 'text-[#EAB308] border-[#EAB308]/30',
  EM_VALIDACAO: 'text-[#95BBE2] border-[#95BBE2]/30',
  AJUSTES_SOLICITADOS: 'text-[#F59E0B] border-[#F59E0B]/30',
  BLOQUEADO: 'text-[#EF4444] border-[#EF4444]/30',
  ATRASADO: 'text-[#EF4444] border-[#EF4444]/30',
  CONCLUIDO: 'text-[#22C55E] border-[#22C55E]/30',
  CANCELADO: 'text-[#87919E] border-[#38435C]',
}

// Colunas do Kanban (ordem)
export const KANBAN_ORDER: string[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_CS', 'EM_VALIDACAO',
  'AJUSTES_SOLICITADOS', 'BLOQUEADO', 'CONCLUIDO', 'CANCELADO',
]

// Status que o usuário pode escolher no drawer
export const STATUS_OPTIONS: string[] = [
  'A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_GESTOR', 'AGUARDANDO_CS',
  'EM_VALIDACAO', 'AJUSTES_SOLICITADOS', 'BLOQUEADO', 'CONCLUIDO', 'CANCELADO',
]

export const PRIORITY_LABELS: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica',
}
export const PRIORITY_COLORS: Record<string, string> = {
  BAIXA: 'text-[#87919E]', MEDIA: 'text-[#EAB308]', ALTA: 'text-[#EF4444]', CRITICA: 'text-[#EF4444] font-bold',
}
export const PRIORITY_OPTIONS = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']

export const TYPE_LABELS: Record<string, string> = {
  SIMPLES: 'Simples', RECORRENTE: 'Recorrente', CHECKLIST_OPERACIONAL: 'Checklist',
  APROVACAO: 'Aprovação', VALIDACAO: 'Validação', FOLLOWUP: 'Follow-up', REUNIAO: 'Reunião',
  COBRANCA: 'Cobrança', AUDITORIA: 'Auditoria', RELATORIO: 'Relatório',
  DEMANDA_CLIENTE: 'Demanda do cliente', DEMANDA_INTERNA: 'Demanda interna',
  MELHORIA_PROCESSO: 'Melhoria de processo', BUG_OPERACIONAL: 'Bug operacional',
  WAR_ROOM: 'War Room', ONBOARDING: 'Onboarding', FINANCEIRA: 'Financeira',
  COMERCIAL: 'Comercial', CS: 'CS', GERADA_POR_ALERTA: 'Gerada por alerta',
  GERADA_POR_POP: 'Gerada por POP', GERADA_POR_IA: 'Gerada por IA',
}
// Tipos mais comuns para o seletor de criação
export const TYPE_OPTIONS = [
  'SIMPLES', 'DEMANDA_CLIENTE', 'DEMANDA_INTERNA', 'FOLLOWUP', 'REUNIAO', 'COBRANCA',
  'AUDITORIA', 'RELATORIO', 'VALIDACAO', 'APROVACAO', 'WAR_ROOM', 'ONBOARDING',
  'FINANCEIRA', 'COMERCIAL', 'CS', 'MELHORIA_PROCESSO', 'BUG_OPERACIONAL',
]

// Rótulos operacionais das Áreas (Categoria) — fallback caso o nome não venha
// do banco (TaskArea.name). Keyed por AreaCode (enum, 10 valores).
export const AREA_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  ONBOARDING: 'Onboarding',
  TRAFEGO: 'Tráfego',
  SUCESSO_CLIENTE: 'Sucesso do Cliente',
  WAR_ROOM: 'War Room',
  CRM_AUTOMACAO: 'CRM e Automação',
  FINANCEIRO: 'Financeiro',
  JURIDICO: 'Jurídico',
  GESTAO_INTERNA: 'Gestão Interna',
  CONTEUDO: 'Conteúdo',
}

export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key
}

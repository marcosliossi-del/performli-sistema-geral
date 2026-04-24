export type LeadStatus =
  | 'NOVO'
  | 'EM_CONTATO'
  | 'REUNIAO_AGENDADA'
  | 'PROPOSTA_ENVIADA'
  | 'PROPOSTA_ACEITA'
  | 'FECHADO'
  | 'PERDIDO'

export type ActivityType =
  | 'NOTA'
  | 'LIGACAO'
  | 'EMAIL'
  | 'REUNIAO'
  | 'WHATSAPP'
  | 'STATUS_CHANGE'

export interface Activity {
  id:         string
  type:       ActivityType
  title:      string
  body:       string | null
  occurredAt: string
  user?:      { name: string; avatarUrl?: string | null } | null
}

export interface Lead {
  id:              string
  name:            string
  email:           string | null
  phone:           string | null
  company:         string | null
  source:          string | null
  status:          LeadStatus
  value:           number | null
  probability:     number | null
  expectedCloseAt: string | null
  closedAt:        string | null
  lostReason:      string | null
  notes:           string | null
  createdAt:       string
  updatedAt:       string
  activities:      Activity[]
  utmSource:       string | null
  utmMedium:       string | null
  utmCampaign:     string | null
  utmContent:      string | null
}

export const STAGE_CONFIG: Record<
  LeadStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  NOVO:             { label: 'Novo',             color: '#95BBE2', bg: 'bg-[#95BBE2]/10', border: 'border-[#95BBE2]/30' },
  EM_CONTATO:       { label: 'Em contato',       color: '#F59E0B', bg: 'bg-[#F59E0B]/10', border: 'border-[#F59E0B]/30' },
  REUNIAO_AGENDADA: { label: 'Reunião agendada', color: '#8B5CF6', bg: 'bg-[#8B5CF6]/10', border: 'border-[#8B5CF6]/30' },
  PROPOSTA_ENVIADA: { label: 'Proposta enviada', color: '#3B82F6', bg: 'bg-[#3B82F6]/10', border: 'border-[#3B82F6]/30' },
  PROPOSTA_ACEITA:  { label: 'Proposta aceita',  color: '#22C55E', bg: 'bg-[#22C55E]/10', border: 'border-[#22C55E]/30' },
  FECHADO:          { label: 'Fechado',           color: '#22C55E', bg: 'bg-[#22C55E]/10', border: 'border-[#22C55E]/30' },
  PERDIDO:          { label: 'Perdido',           color: '#EF4444', bg: 'bg-[#EF4444]/10', border: 'border-[#EF4444]/30' },
}

export const KANBAN_STAGES: LeadStatus[] = [
  'NOVO',
  'EM_CONTATO',
  'REUNIAO_AGENDADA',
  'PROPOSTA_ENVIADA',
  'PROPOSTA_ACEITA',
]

export const HOT_STATUSES: LeadStatus[] = [
  'REUNIAO_AGENDADA',
  'PROPOSTA_ENVIADA',
  'PROPOSTA_ACEITA',
]

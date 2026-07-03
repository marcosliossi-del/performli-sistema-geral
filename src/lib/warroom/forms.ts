/**
 * WAR-14/15 — Shapes dos DOIS documentos da War Room que substituem os PDFs
 * manuais da Arkza. Validados por zod (padrão de lib/tasks/recurrence.ts:
 * funções PURAS, sem prisma; parse retorna null em vez de lançar).
 *
 *   DiagnosticoGestor — o que o gestor preenchia até quarta e mandava no chat.
 *   DecisoesCs        — a ata que a CS documentava na call de quinta.
 *
 * Ambos vivem em colunas Json nullable de CriticalProtocol (migration aditiva
 * 20260703190000). Nada é gravado sem passar por estes schemas.
 */

import { z } from 'zod'

// ── Nível do framework de diagnóstico (rótulos operacionais do PDF) ──────────
// Onde está o problema, do mais raso ao mais profundo. 1 é o mais barato de
// corrigir; 4 exige decisão de negócio.
export const NIVEL_FRAMEWORK_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Criativo / anúncio',
  2: 'Campanha / estrutura',
  3: 'Oferta / página',
  4: 'Negócio / produto',
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data no formato AAAA-MM-DD.')

// ── Tetos anti-abuso ─────────────────────────────────────────────────────────
// O payload vive em coluna Json — sem teto, uma entrada colada por engano pode
// inflar a linha do protocolo. Limites generosos p/ texto operacional real.
const LONG_MAX = 2000       // textos livres longos
const MID_MAX = 300         // título de problema / descrição de ação
const SHORT_MAX = 120       // campos curtos (nome, data-livre, assinatura)
const MAX_PROBLEMAS = 20    // problemas por War Room
const MAX_ACOES = 10        // ações por problema
const longMsg = (max: number) => `Texto longo demais (máx. ${max} caracteres) — resuma.`

// ── DiagnosticoGestor ────────────────────────────────────────────────────────
export const diagnosticoGestorSchema = z.object({
  // "O que está acontecendo" — com NÚMEROS (o loader pré-preenche a comparação).
  situacao: z.string().trim().min(1, 'Descreva a situação com números.').max(LONG_MAX, longMsg(LONG_MAX)),
  desdeQuando: z.string().trim().min(1, 'Diga desde quando o problema aparece.').max(SHORT_MAX, longMsg(SHORT_MAX)),
  oQueJaFoiFeito: z.string().trim().min(1, 'Liste o que já foi feito.').max(LONG_MAX, longMsg(LONG_MAX)),
  // Nível do framework: onde mora a causa provável.
  nivelFramework: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
  hipotese: z.string().trim().min(1, 'Escreva a hipótese de causa.').max(LONG_MAX, longMsg(LONG_MAX)),
  evidencia: z.string().trim().min(1, 'Aponte a evidência que sustenta a hipótese.').max(LONG_MAX, longMsg(LONG_MAX)),
  teste: z.string().trim().min(1, 'Defina o teste que valida a hipótese.').max(LONG_MAX, longMsg(LONG_MAX)),
  prazoTeste: dateOnly,
  // O que o gestor precisa de terceiros para executar o teste.
  precisaDoCliente: z.string().trim().max(LONG_MAX, longMsg(LONG_MAX)).default(''),
  precisaDoSupervisor: z.string().trim().max(LONG_MAX, longMsg(LONG_MAX)).default(''),
  // Assinatura da evidência mínima (#14).
  preenchidoPor: z.string().trim().min(1).max(SHORT_MAX, longMsg(SHORT_MAX)),
  preenchidoEm: z.string().trim().min(1).max(SHORT_MAX, longMsg(SHORT_MAX)),
})

export type DiagnosticoGestor = z.infer<typeof diagnosticoGestorSchema>

// ── DecisoesCs ───────────────────────────────────────────────────────────────
const acaoSchema = z.object({
  acao: z.string().trim().min(1, 'Descreva a ação.').max(MID_MAX, longMsg(MID_MAX)),
  responsavelId: z.string().trim().min(1, 'Selecione o responsável pela ação.').max(SHORT_MAX, longMsg(SHORT_MAX)),
  prazo: dateOnly,
})

const problemaSchema = z.object({
  problema: z.string().trim().min(1, 'Descreva o problema discutido.').max(MID_MAX, longMsg(MID_MAX)),
  acoes: z.array(acaoSchema)
    .min(1, 'Cada problema precisa de ao menos uma ação.')
    .max(MAX_ACOES, `Máximo de ${MAX_ACOES} ações por problema — agrupe.`),
})

export const decisoesCsSchema = z.object({
  resumoDiagnostico: z.string().trim().min(1, 'Resuma o diagnóstico discutido.').max(LONG_MAX, longMsg(LONG_MAX)),
  problemas: z.array(problemaSchema)
    .min(1, 'Registre ao menos um problema com ações.')
    .max(MAX_PROBLEMAS, `Máximo de ${MAX_PROBLEMAS} problemas por War Room.`),
  precisaDoCliente: z.string().trim().max(LONG_MAX, longMsg(LONG_MAX)).default(''),
  proximaReuniao: dateOnly.nullable(),
  notas: z.string().trim().max(LONG_MAX, longMsg(LONG_MAX)).default(''),
  preenchidoPor: z.string().trim().min(1).max(SHORT_MAX, longMsg(SHORT_MAX)),
  preenchidoEm: z.string().trim().min(1).max(SHORT_MAX, longMsg(SHORT_MAX)),
})

export type DecisoesCs = z.infer<typeof decisoesCsSchema>
export type AcaoDecisao = z.infer<typeof acaoSchema>

// ── Parsers tolerantes (leitura de Json do banco → objeto tipado ou null) ────
// Usados por loaders/UI para exibir dados já salvos sem quebrar se o shape
// antigo divergir. Nunca lançam (padrão parseRecurrenceRule).
export function parseDiagnosticoGestor(json: unknown): DiagnosticoGestor | null {
  const parsed = diagnosticoGestorSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export function parseDecisoesCs(json: unknown): DecisoesCs | null {
  const parsed = decisoesCsSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/**
 * Hash determinístico curto (base36) de uma string — soma rolante de charCodes.
 * Usado na idempotencyKey da task de cada ação da War Room, para que re-salvar
 * as decisões NÃO duplique tasks já criadas (mesma ação → mesma chave).
 */
export function shortHash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

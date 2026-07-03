import { prisma } from '@/lib/prisma'

/**
 * FASE 5 — TaskCompletionGuard.
 *
 * Verifica se uma tarefa pode ser concluída. REGRA DE SEGURANÇA ABSOLUTA:
 * o guard SÓ bloqueia tarefas explicitamente marcadas como críticas
 * (requiresEvidence / requiresReview true, riskScore >= 4, ou priority CRITICA).
 * Tarefas comuns (a imensa maioria) sempre retornam { allowed: true } —
 * comportamento atual 100% preservado, zero regressão.
 *
 * Nunca lança: erros de carga também não bloqueiam (permite, para não quebrar
 * o fluxo existente por causa de uma falha de leitura).
 */
export async function checkTaskCompletion(
  taskId: string,
  opts?: { reviewSatisfied?: boolean },
): Promise<{ allowed: boolean; reason?: string }> {
  let task
  try {
    task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        priority: true,
        evidence: true,
        completionNotes: true,
        requiresEvidence: true,
        requiresReview: true,
        riskScore: true,
        checklist: { select: { required: true, done: true } },
        approvals: { select: { approved: true } },
        _count: { select: { attachments: true, comments: true } },
      },
    })
  } catch {
    // "Nunca lança" (doc): uma falha de LEITURA não pode bloquear nem quebrar a
    // conclusão. Na dúvida, permite — o pior caso é não barrar uma tarefa
    // crítica, jamais derrubar a tela.
    return { allowed: true }
  }

  // Tarefa inexistente: não é papel do guard bloquear isso (o caller trata).
  if (!task) return { allowed: true }

  const isCritical =
    task.requiresEvidence ||
    task.requiresReview ||
    (task.riskScore != null && task.riskScore >= 4) ||
    task.priority === 'CRITICA'

  // Não crítica → nunca bloqueia. Comportamento atual preservado.
  if (!isCritical) return { allowed: true }

  const reasons: string[] = []

  // 1) Checklist obrigatório incompleto.
  const requiredOpen = task.checklist.filter((c) => c.required && !c.done).length
  if (requiredOpen > 0) {
    reasons.push(`Checklist obrigatório incompleto (${requiredOpen} item(ns) pendente(s))`)
  }

  // 2) Evidência obrigatória.
  if (task.requiresEvidence) {
    const hasEvidence =
      (task.evidence != null && task.evidence.trim().length > 0) ||
      task._count.attachments > 0
    if (!hasEvidence) {
      reasons.push('Evidência obrigatória não anexada')
    }
  }

  // 3) Registro de conclusão (o que foi feito).
  if (task.completionNotes == null || task.completionNotes.trim().length === 0) {
    reasons.push('Registro de conclusão (o que foi feito) é obrigatório')
  }

  // 4) Revisão aprovada. Se o próprio ato em curso é a aprovação da revisão
  //    (fluxo da CS em decideTaskValidation), considera-se satisfeita.
  if (task.requiresReview && !opts?.reviewSatisfied) {
    const hasApproved = task.approvals.some((a) => a.approved === true)
    if (!hasApproved) {
      reasons.push('Precisa de revisão aprovada antes de concluir')
    }
  }

  if (reasons.length > 0) {
    return { allowed: false, reason: reasons.join(' · ') }
  }

  return { allowed: true }
}

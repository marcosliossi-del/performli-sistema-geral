'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/dal'
import { writeAuditLog } from '@/lib/audit'
import { BusinessType, ClientCurva } from '@prisma/client'
import { updateClient, type UpdateClientState } from './updateClient'
import { parseDateInput } from '@/lib/tasks/dateInput'

// ─── EDIÇÃO INLINE DA TELA DE CLIENTES (estilo ClickUp) ───────────────────────
// Regra Marcos 2026-07-21: TODAS as colunas viram editáveis in-place. Este
// arquivo NÃO cria caminho paralelo de dado — ele DELEGA para as actions
// canônicas já existentes, preservando auth + papel + posse + derivação de metas:
//   • campos do Client        → updateClient (assertClientMutationAccess + metas)
//   • produtos (tipo serviço)  → updateClientProdutos (chamada direta pela UI)
//   • responsável (gestor)     → updateClientPrimaryManager (chamada direta)
//   • período/valor do contrato→ updateClientContractInline (abaixo — DADO AMARRADO
//                                à fonte única Contract do Jurídico)

/** Patch de campos NATIVOS do Client editáveis inline (fora contrato/produtos/gestor). */
export type ClientFieldPatch = {
  name?: string
  curva?: ClientCurva | null
  businessType?: BusinessType
  investimentoMeta?: number | null
  investimentoGoogle?: number | null
  investimentoTiktok?: number | null
  roasMinimo?: number | null
}

/**
 * Action FINA para a edição inline de campos nativos do Client. Delega 100% para
 * `updateClient`, que já valida autenticação + papel + posse
 * (assertClientMutationAccess) e deriva as metas do mês quando budget/ROAS mudam
 * (computeMetasFromBudget → upsert Goals MONTHLY + AuditLog). NÃO reimplementa
 * nada — só estreita a superfície de tipos que a tabela usa.
 */
export async function updateClientField(
  clientId: string,
  patch: ClientFieldPatch,
): Promise<UpdateClientState> {
  return updateClient(clientId, patch)
}

// Parse de data via helper canônico (@/lib/tasks/dateInput, meio-dia UTC — evita
// o off-by-one D-006), preservando a assinatura tolerante a null/inválido.
function parseDateOrNull(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const d = parseDateInput(raw)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Edita PERÍODO e/ou VALOR do contrato pela tela de Clientes.
 *
 * DADO AMARRADO (CLAUDE.md #0): período (startDate/endDate) e valor (feeValue) têm
 * fonte canônica no model Contract (Jurídico). Se o cliente TEM contrato vigente
 * (VIGENTE ou RENOVACAO), a edição atualiza ESSE contrato — e sincroniza o cache
 * do cadastro (Client.contractStart/contractEndDate/contractValue) para as telas
 * que ainda leem o fallback baterem. Se NÃO há contrato vigente
 * (fonteContrato = cadastro), edita apenas o cadastro do Client (a UI avisa que
 * está editando o cadastro, não o Jurídico).
 *
 * Autorização (CLAUDE.md #2/#3): requireSession + gate ADMIN — espelha o gate das
 * actions de contrato (contracts.ts: "Apenas o admin pode gerenciar contratos").
 * AuditLog em ambos os caminhos.
 */
export async function updateClientContractInline(
  clientId: string,
  patch: { startDate?: string | null; endDate?: string | null; feeValue?: number | null },
): Promise<{ error?: string; slug?: string }> {
  const session = await requireSession()
  if (session.role !== 'ADMIN') return { error: 'Apenas o administrador pode alterar período e valor de contrato.' }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      slug: true,
      contractStart: true,
      contractEndDate: true,
      contracts: {
        where: { status: { in: ['VIGENTE', 'RENOVACAO'] } },
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { id: true, startDate: true, endDate: true },
      },
    },
  })
  if (!client) return { error: 'Cliente não encontrado.' }

  const touchStart = 'startDate' in patch
  const touchEnd = 'endDate' in patch
  const touchFee = 'feeValue' in patch

  const newStart = touchStart ? parseDateOrNull(patch.startDate) : undefined
  const newEnd = touchEnd ? parseDateOrNull(patch.endDate) : undefined
  if (touchStart && patch.startDate && !newStart) return { error: 'Data de início inválida.' }
  if (touchEnd && patch.endDate && !newEnd) return { error: 'Data de vencimento inválida.' }

  const feeValue = touchFee ? (patch.feeValue ?? null) : undefined
  if (touchFee && feeValue != null && !(feeValue >= 0)) return { error: 'Valor do contrato inválido.' }

  const vigente = client.contracts[0] ?? null

  if (vigente) {
    // Datas EFETIVAS (o que veio prevalece; o resto usa o valor atual do contrato).
    const effStart = touchStart ? newStart : vigente.startDate
    const effEnd = touchEnd ? newEnd : vigente.endDate
    if (effStart && effEnd && effEnd <= effStart) {
      return { error: 'A data de vencimento deve ser posterior à data de início.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: vigente.id },
        data: {
          ...(touchStart && newStart ? { startDate: newStart } : {}),
          ...(touchEnd && newEnd ? { endDate: newEnd } : {}),
          ...(touchFee && feeValue != null ? { feeValue } : {}),
        },
      })
      // Sincroniza o cache do cadastro (dado amarrado): telas que leem o fallback.
      await tx.client.update({
        where: { id: clientId },
        data: {
          ...(touchStart && newStart ? { contractStart: newStart } : {}),
          ...(touchEnd && newEnd ? { contractEndDate: newEnd } : {}),
          ...(touchFee && feeValue != null ? { contractValue: feeValue, feeAmount: feeValue } : {}),
        },
      })
    })

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'contract.inline_update',
      entityType: 'Contract',
      entityId: vigente.id,
      clientId,
      metadata: {
        via: 'tela_clientes',
        startDate: newStart?.toISOString() ?? null,
        endDate: newEnd?.toISOString() ?? null,
        feeValue: touchFee ? feeValue : undefined,
      },
    })
  } else {
    // Sem contrato vigente → edita o CADASTRO (fonteContrato = cadastro).
    const effStart = touchStart ? newStart : client.contractStart
    const effEnd = touchEnd ? newEnd : client.contractEndDate
    if (effStart && effEnd && effEnd <= effStart) {
      return { error: 'A data de vencimento deve ser posterior à data de início.' }
    }

    await prisma.client.update({
      where: { id: clientId },
      data: {
        ...(touchStart ? { contractStart: newStart } : {}),
        ...(touchEnd ? { contractEndDate: newEnd } : {}),
        ...(touchFee && feeValue != null ? { contractValue: feeValue, feeAmount: feeValue } : {}),
      },
    })

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'client.contract_cadastro_update',
      entityType: 'Client',
      entityId: clientId,
      clientId,
      metadata: {
        via: 'tela_clientes',
        note: 'Sem contrato vigente no Jurídico — editado o cadastro do cliente.',
        startDate: newStart?.toISOString() ?? null,
        endDate: newEnd?.toISOString() ?? null,
        feeValue: touchFee ? feeValue : undefined,
      },
    })
  }

  revalidatePath('/clients')
  revalidatePath(`/clients/${client.slug}`)
  revalidatePath('/juridico')
  return { slug: client.slug }
}

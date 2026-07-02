/**
 * Vincula os customers do Asaas aos clientes do Performli usando a lista REAL
 * de razões sociais enviada pelo dono (2026-07-02, 31 cobranças do mês — mapeamento 31/31 confirmado pelo dono).
 *
 * Para cada par {razão social no Asaas → cliente}: grava Client.razaoSocial
 * EXATAMENTE como está no Asaas e religa AsaasCustomer.clientId (match por
 * nome normalizado). Idempotente: re-executar não altera o que já está certo.
 *
 * Os nomes NÃO identificados ficam fora daqui de propósito (regra do dono:
 * "os que você não conseguir conciliar, me avisa" — sem chute). O retorno
 * lista os customers do Asaas que continuam sem vínculo.
 */

import { prisma } from '@/lib/prisma'
import { normalize } from '@/services/seed-carteiras'
import { writeAuditLog } from '@/lib/audit'

type Vinculo = {
  /** Razão social EXATAMENTE como aparece no Asaas. */
  razaoAsaas: string
  /** Aliases do cliente no Performli (matching por normalize). */
  clientAliases: string[]
}

// Mapeamento CONFIRMÁVEL pela lista do dono. Nomes sem cliente óbvio ficam de
// fora até o dono apontar (relatório `semVinculo`).
const VINCULOS: Vinculo[] = [
  { razaoAsaas: 'Laralu Store/L L MODA E CONFECCAO RIO PRETO LTDA', clientAliases: ['Laralu', 'Laralu Store'] },
  { razaoAsaas: 'Letícia Store Mirassol', clientAliases: ['Leticia Store', 'Letícia Store'] },
  { razaoAsaas: 'Brazolli Pizzaria & Hamburgueria LTDA', clientAliases: ['Brazolli', 'Brazolli Pizza & Burger'] },
  { razaoAsaas: 'DUPLO SENTIDO INDUSTRIA E COMERCIO DE CONFECCOES', clientAliases: ['Duplo Sentido Varejo', 'Duplo Sentido [Varejo]'] },
  { razaoAsaas: 'SOUL BY DHARA E MARINA', clientAliases: ['Soul By DM', 'Soul'] },
  { razaoAsaas: 'Lamici Brand LTDA', clientAliases: ['Lamici'] },
  { razaoAsaas: 'MIAMI STORE ELETRONICOS LTDA', clientAliases: ['Via Miami', 'Via Miami RP'] },
  { razaoAsaas: 'AUYBER DA SILVA PIOVEZAM ODONTOLOGIA', clientAliases: ['Dr. Auyber', 'Dr Auyber'] },
  { razaoAsaas: 'LALLUZI STORE COMERCIO DE ARTIGOS DO VESTUARIO LTDA', clientAliases: ['Lalluzi', 'Lalluzi Modas', 'Lalluzi Store'] },
  { razaoAsaas: 'LAURA MASTRANDÉA', clientAliases: ['Lalolli'] },
  { razaoAsaas: 'MICHELLE ROSSI RODRIGUES', clientAliases: ['Michelle Rossi'] },
  { razaoAsaas: 'My Muse Confecções LTDA', clientAliases: ['My Muse', 'My Muse BR'] },
  { razaoAsaas: 'TAYNA ANDRESSA MOTA DE OLIVEIRA', clientAliases: ['Tayna Moda Feminina'] },
  { razaoAsaas: 'BARBARA ISSAS', clientAliases: ['Espaço Barbara Issas', 'Espaco Barbara Issas', 'Barbara Issas'] },
  // ── 2ª rodada — mapeamento completo confirmado pelo dono (31/31) ────────────
  // Esj (SVN atende Atacado E Varejo — fatura fica na Svn Varejo, mesma regra
  // do Duplo: uma fatura só, sem duplicidade).
  { razaoAsaas: 'Esj Confeccoes do Vestuario LTDA', clientAliases: ['Svn Varejo', 'Svn [Varejo]'] },
  { razaoAsaas: 'C DE ALMEIDA FERREIRA ZAFFANI', clientAliases: ['New Man Store', 'New Man'] },
  { razaoAsaas: 'André Padilha de Arruda', clientAliases: ['Outlet Mauá', 'Outlet Maua'] },
  { razaoAsaas: '40.856.803 Ianca de Melo Curti Araujo', clientAliases: ['Catita Store'] },
  { razaoAsaas: 'BRUNA PACE', clientAliases: ['Roupa Branca'] },
  { razaoAsaas: 'Julia Gasques Oliveira', clientAliases: ['Lazulli', 'Use Lazuli', 'Lazuli'] },
  { razaoAsaas: 'Ana Adelia Vicente de Araujo-Confeccoes', clientAliases: ['Tuca Clothing', 'Tuca'] },
  { razaoAsaas: 'KLEBER J ROBERTO LANCHONETE ME', clientAliases: ['Family Restaurante', 'Family Pizzaria'] },
  { razaoAsaas: 'Larissa Neris Cardoso Agostini ME', clientAliases: ['Lavinny', 'Lavinny Store'] },
  { razaoAsaas: 'GUILHERME HENRIQUE BONFIM DA SILVA', clientAliases: ['Draft Shop', 'Draft'] },
  { razaoAsaas: 'BRUNA FONTELES DE SOUSA BARBOSA', clientAliases: ['Planet Imports'] },
  { razaoAsaas: 'LUIS EDUARDO PETERLEVITZ', clientAliases: ['Beard Sports'] },
  { razaoAsaas: 'MARIA THEREZA ANDRADE DANTAS', clientAliases: ['Bambola'] },
  { razaoAsaas: 'SR DOS PASTÉIS RIO PRETO LTDA', clientAliases: ['Donna Sô', 'Donna So', 'DonnaSo Pastelaria', 'Donna Sô Pastelaria'] },
]

export type VincularResult = {
  vinculados: number
  jaVinculados: number
  clienteNaoEncontrado: string[]
  /** Customers do Asaas que seguem sem vínculo (dono aponta quem são). */
  semVinculo: string[]
  customersReligados: number
}

export async function vincularAsaasClientes(): Promise<VincularResult> {
  const result: VincularResult = {
    vinculados: 0, jaVinculados: 0, clienteNaoEncontrado: [], semVinculo: [], customersReligados: 0,
  }

  const clients = await prisma.client.findMany({ select: { id: true, name: true, slug: true, razaoSocial: true } })
  const byNorm = new Map<string, { id: string; razaoSocial: string | null }>()
  for (const c of clients) {
    byNorm.set(normalize(c.name), { id: c.id, razaoSocial: c.razaoSocial })
    byNorm.set(normalize(c.slug), { id: c.id, razaoSocial: c.razaoSocial })
  }

  for (const v of VINCULOS) {
    try {
      let hit: { id: string; razaoSocial: string | null } | null = null
      for (const alias of v.clientAliases) {
        const found = byNorm.get(normalize(alias))
        if (found) { hit = found; break }
      }
      if (!hit) {
        result.clienteNaoEncontrado.push(`${v.razaoAsaas} → ${v.clientAliases[0]}`)
        continue
      }

      if (hit.razaoSocial === v.razaoAsaas) {
        result.jaVinculados++
      } else {
        await prisma.client.update({ where: { id: hit.id }, data: { razaoSocial: v.razaoAsaas } })
        await writeAuditLog({
          action: 'client.razaoSocialVinculada',
          entityType: 'Client',
          entityId: hit.id,
          clientId: hit.id,
          metadata: { razaoAsaas: v.razaoAsaas },
        })
        result.vinculados++
      }

      // Religa os customers do Asaas cujo nome bate com a razão social
      // (normalizado — tolera caixa/acentos da transcrição).
      const candidatos = await prisma.asaasCustomer.findMany({
        where: { clientId: null },
        select: { id: true, name: true },
      })
      const alvo = normalize(v.razaoAsaas)
      const ids = candidatos.filter((c) => normalize(c.name) === alvo).map((c) => c.id)
      if (ids.length) {
        const religados = await prisma.asaasCustomer.updateMany({
          where: { id: { in: ids } },
          data: { clientId: hit.id },
        })
        result.customersReligados += religados.count
      }
    } catch (err) {
      result.clienteNaoEncontrado.push(`${v.razaoAsaas} (erro: ${err instanceof Error ? err.message : 'desconhecido'})`)
    }
  }

  // Relatório: customers que continuam órfãos (o dono aponta quem são).
  const orfaos = await prisma.asaasCustomer.findMany({
    where: { clientId: null },
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  result.semVinculo = orfaos.map((o) => o.name)

  return result
}

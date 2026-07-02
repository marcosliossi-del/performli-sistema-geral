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

// Ex-clientes (churn) confirmados pelo dono em 2026-07-02 — sem cliente no
// Performli de propósito; ficam FORA do relatório de pendências para sempre.
const IGNORAR_CHURN = [
  '38.431.296 Lavinia Ribeiro',
  'LAVINIA RIBEIRO',
  'BOOM CLOSET LTDA',
  'Bruno Henrique Godoi',
  'M.E.A de Araujo',
  'Marcela Sousa Concept',
  'Maria Clara Moro Cabrelli',
  'RAYANE EVELYN TEIXEIRA DE FREITAS 41545988803',
]

export type VincularResult = {
  vinculados: number
  jaVinculados: number
  clienteNaoEncontrado: string[]
  /** Customers RELEVANTES (fatura nos últimos 60 dias) ainda sem vínculo. */
  semVinculo: string[]
  /** Mesmo nome 2x+ no Asaas — o dono decide se limpa lá. */
  duplicadosNoAsaas: string[]
  customersReligados: number
}

export async function vincularAsaasClientes(): Promise<VincularResult> {
  const result: VincularResult = {
    vinculados: 0, jaVinculados: 0, clienteNaoEncontrado: [], semVinculo: [],
    duplicadosNoAsaas: [], customersReligados: 0,
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

      // Religa o customer do Asaas cujo nome bate com a razão social
      // (normalizado — tolera caixa/acentos da transcrição). Quando existe
      // DUPLICATA no Asaas (mesmo nome 2x, ex.: Soul By DM), o vínculo vai
      // para o registro que tem a assinatura/faturas — o vazio é o duplicado.
      const alvo = normalize(v.razaoAsaas)
      const mesmoNome = await prisma.asaasCustomer.findMany({
        where: { OR: [{ clientId: null }, { clientId: hit.id }] },
        select: {
          id: true,
          name: true,
          clientId: true,
          subscriptions: { where: { status: 'ACTIVE' }, select: { id: true } },
          payments: { orderBy: { dueDate: 'desc' }, take: 1, select: { dueDate: true } },
          _count: { select: { payments: true } },
        },
      })
      const candidatos = mesmoNome.filter((c) => normalize(c.name) === alvo)
      if (candidatos.length) {
        // Melhor candidato: assinatura ATIVA > fatura mais recente > mais faturas.
        const score = (c: (typeof candidatos)[number]) =>
          (c.subscriptions.length > 0 ? 1e15 : 0) +
          (c.payments[0]?.dueDate?.getTime() ?? 0) +
          c._count.payments
        const melhor = [...candidatos].sort((a, b) => score(b) - score(a))[0]

        if (melhor.clientId !== hit.id) {
          // Troca de vínculo (1-para-1, clientId @unique): solta o registro
          // antigo/vazio e liga o que tem a assinatura e as faturas.
          await prisma.$transaction([
            prisma.asaasCustomer.updateMany({ where: { clientId: hit.id }, data: { clientId: null } }),
            prisma.asaasCustomer.update({ where: { id: melhor.id }, data: { clientId: hit.id } }),
          ])
          await writeAuditLog({
            action: 'asaas.customerReligado',
            entityType: 'AsaasCustomer',
            entityId: melhor.id,
            clientId: hit.id,
            metadata: {
              razaoAsaas: v.razaoAsaas,
              assinaturasAtivas: melhor.subscriptions.length,
              faturas: melhor._count.payments,
            },
          })
          result.customersReligados += 1
        }

        const sobras = candidatos.filter((c) => c.id !== melhor.id)
        if (sobras.length) {
          result.duplicadosNoAsaas.push(
            `${v.razaoAsaas} (${sobras.length + 1} customers com o mesmo nome no Asaas — o vínculo ficou no que tem assinatura/faturas; o duplicado sem movimentação pode ser apagado lá)`,
          )
        }
      }
    } catch (err) {
      result.clienteNaoEncontrado.push(`${v.razaoAsaas} (erro: ${err instanceof Error ? err.message : 'desconhecido'})`)
    }
  }

  // Relatório: só órfãos RELEVANTES — com fatura nos últimos 60 dias (o
  // histórico completo do Asaas tem ex-clientes/fornecedores/time e é ruído).
  const corte = new Date(Date.now() - 60 * 86_400_000)
  const orfaos = await prisma.asaasCustomer.findMany({
    where: {
      clientId: null,
      payments: { some: { dueDate: { gte: corte } } },
    },
    select: { name: true },
    orderBy: { name: 'asc' },
  })
  const ignorados = new Set(IGNORAR_CHURN.map((n) => normalize(n)))
  // Duplicatas identificadas acima já são reportadas em `duplicadosNoAsaas`;
  // não repetir o mesmo customer como "sem vínculo".
  const razoesVinculadas = new Set(VINCULOS.map((v) => normalize(v.razaoAsaas)))
  result.semVinculo = [...new Set(
    orfaos
      .map((o) => o.name)
      .filter((n) => !ignorados.has(normalize(n)) && !razoesVinculadas.has(normalize(n))),
  )]

  return result
}

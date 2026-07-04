/**
 * Seed idempotente da operação real da Arkza (time + 15 templates recorrentes
 * fixos + regras de recorrência). NÃO cria clientes fake — a produção já tem os
 * clientes reais. Roda quantas vezes for preciso sem duplicar (upsert por chave
 * natural: email/externalId para User, code para TaskTemplate).
 *
 * Fonte: seções 5 e 8 do documento "Recriar ClickUp no Performli".
 *
 * Segurança: passwordHash de usuário NOVO é gerado a partir de senha ALEATÓRIA
 * forte (crypto.randomBytes) — nunca previsível. Usuários definem a senha via
 * fluxo de reset. passwordHash de usuário já existente NUNCA é sobrescrito.
 */

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import type { Role, OperationalRole, AreaCode, TaskPriority, RecurrenceFrequency } from '@prisma/client'

// ── Time real (seção 5) ───────────────────────────────────────────────────────

type SeedUser = {
  slug: string
  name: string
  email: string | null
  externalId: string | null
  operationalRole: OperationalRole
  role: Role
}

const TEAM: SeedUser[] = [
  { slug: 'marcos-liossi',  name: 'Marcos Liossi',  email: 'marcosliossi@arkza.com.br', externalId: '152690431', operationalRole: 'HEAD',           role: 'ADMIN'   },
  { slug: 'leandro-strazzi', name: 'Leandro Strazzi', email: null,                       externalId: '81516815',  operationalRole: 'SUPERVISOR',     role: 'SUPERVISOR_TRAFEGO' },
  { slug: 'pablo-junior',   name: 'Pablo Júnior',   email: 'jjuniorpablo1@gmail.com',   externalId: '254576012', operationalRole: 'GESTOR',         role: 'GESTOR_TRAFEGO' },
  { slug: 'kyn-leonardo',   name: 'Kyn Leonardo',   email: null,                        externalId: '81525390',  operationalRole: 'CRM',            role: 'GESTOR_TRAFEGO' },
  { slug: 'leticia-perez',  name: 'Leticia Perez',  email: 'leticiaperez1812@gmail.com', externalId: '87373550', operationalRole: 'CS',             role: 'CS'      },
  { slug: 'red',            name: 'Red',            email: null,                        externalId: null,        operationalRole: 'ACOMPANHAMENTO', role: 'ANALISTA_TRAFEGO' },
]

// ── 15 templates recorrentes (seção 8) ────────────────────────────────────────

type SeedTemplate = {
  code: string
  name: string
  role: 'GESTOR' | 'CS' | 'CRM'
  area: AreaCode
  priority: TaskPriority
  description: string
  steps?: string[]
  tags?: string[]
  enforceChecklist?: boolean
  formType?: string
  businessType?: 'ECOMMERCE' | 'LOCAL' | 'B2B'
  activeRule?: boolean
  recurrence: {
    frequency: RecurrenceFrequency
    dayOfWeek?: number   // 0=Dom..6=Sáb
    daysOfWeek?: number[]
    dayOfMonth?: number
    hour?: number
    minute?: number
    anchorDate?: string   // ISO, ex.: '2026-07-01T00:00:00.000Z'
    rollToBusinessDay?: boolean
  }
}

const SOP_CHECKIN_SEMANAL = `📋 CHECK-IN SEMANAL DE CONTAS — COMO FAZER
Quando: toda segunda-feira, até as 12h.
Por que: o relatório do cliente e o check-in interno precisam contar a mesma história. Você diagnostica cada conta primeiro, e a IA gera o relatório alinhado.
Importante: feito por cliente. 10 clientes = 10 documentos + 10 relatórios até as 12h.

Passo 1 — Duplique o documento modelo (Arkza Processo Semanal) por cliente e renomeie.
Passo 2 — Abra o GA4 do cliente e tire prints da semana anterior: faturamento, investimento, ROAS, compras, sessões, ticket médio, taxa de conversão, gráficos de categoria e produto.
Passo 3 — Preencha as 6 perguntas do check-in com dados reais e hipótese clara (interno, não vai pro cliente). As perguntas 5 e 6 viram as ações e os pedidos no relatório.
Passo 4 — Salve a cópia do cliente em PDF.
Passo 5 — Envie o PDF + prints para a IA, que gera o relatório.
Passo 6 — Confira se os números batem e se o relatório fecha com pergunta de ativação (obrigatória).
Passo 7 — Envie ao cliente no WhatsApp, marcando ele na mensagem de fechamento.
Passo 8 — Suba todos os PDFs nesta tarefa até 12h de segunda e marque como concluída.`

const STEPS_CHECKIN_SEMANAL = [
  'Duplicar o documento modelo (Arkza Processo Semanal) por cliente e renomear',
  'Abrir o GA4 e tirar prints da semana anterior (faturamento, investimento, ROAS, compras, sessões, ticket médio, taxa de conversão, categoria e produto)',
  'Preencher as 6 perguntas do check-in com dados reais e hipótese clara',
  'Salvar a cópia do cliente em PDF',
  'Enviar o PDF + prints para a IA gerar o relatório',
  'Conferir se os números batem e se o relatório fecha com pergunta de ativação',
  'Enviar ao cliente no WhatsApp, marcando ele na mensagem de fechamento',
  'Subir todos os PDFs na tarefa até 12h de segunda e marcar como concluída',
]

const SOP_RESUMO_SEMANAL = `Prestação de Contas ao Cliente — Resumo Semanal
Quando: toda sexta-feira até as 17h.
Por que: o cliente precisa saber o que foi feito na conta. Cliente que entende confia mais e reclama menos.

Passo 1 — Liste o que foi feito na conta: revisões, ajustes de orçamento e motivo, mudanças de estrutura, novos públicos/criativos testados, pausas, negativações do Google.
Passo 2 — Escreva um resumo simples de até 3 linhas, em linguagem acessível, sem jargão.
Passo 3 — Termine com uma pergunta ou pedido de ativação (ex: "você sentiu diferença?", "consegue mandar criativos até quarta?").
Passo 4 — Envie o texto para a CS (Letícia) via sistema. Ela revisa e envia ao cliente.
Regra: não envie direto ao cliente. Sempre passa pela CS primeiro.`

const STEPS_RESUMO_SEMANAL = [
  'Listar o que foi feito na conta (revisões, ajustes de orçamento e motivo, mudanças de estrutura, novos públicos/criativos, pausas, negativações do Google)',
  'Escrever um resumo simples de até 3 linhas, em linguagem acessível, sem jargão',
  'Terminar com uma pergunta ou pedido de ativação',
  'Enviar o texto para a CS via sistema (não enviar direto ao cliente — sempre passa pela CS)',
]

// ── 16 tarefas recorrentes de e-commerce (seção 5 do PROMPT MESTRE) ───────────
// Réplica FIEL (Nível 1). Regras nascem inativas (activeRule:false) até o gate
// de auditoria humana (GATE 1) — o cron não materializa até a ativação.

const SOP_ECOM_01 = `✅ Objetivo da Tarefa — Coleta de NPS Trimestral
Realizar a coleta trimestral do NPS (Net Promoter Score) da cliente através do formulário oficial, garantindo que a percepção da cliente sobre a Arkza seja monitorada e utilizada para melhorias internas.

✅ Atividades (CS)
1. Enviar o formulário de NPS para a cliente
   - Enviar o link oficial do formulário: forms.gle/abH5m18wGmH1DLNX6
   - A mensagem deve ser leve, simples e acolhedora, incentivando o preenchimento.
2. Acompanhar a resposta
   - Verificar se a cliente respondeu dentro do prazo.
   - Caso não responda, enviar lembrete suave após 48h.
3. Registrar o resultado — Atualizar o painel interno da Arkza com: nota, comentário, sentimento, ações necessárias.
4. Sinalizar internamente se houver alerta
   - Nota 0 a 6 (detratora) → sinalizar imediatamente para Supervisor + Head
   - Nota 7 a 8 (neutra) → observar
   - Nota 9 a 10 (promotora) → registrar e reforçar relacionamento
5. Criar tasks internas (se necessário) — Se a cliente apontar melhorias, dúvidas ou riscos → criar task para o responsável (gestor / supervisor / head)

✅ Modelo de mensagem para enviar o NPS
Oi, [NOME]! Tudo bem?
Pra gente continuar evoluindo juntos, fazemos uma avaliação trimestral de relacionamento com todos os clientes da Arkza.
É super rapidinho (leva menos de 1 minuto) e ajuda demais a melhorar nossa entrega! 💙
Segue o link: 👉 forms.gle/abH5m18wGmH1DLNX6
Qualquer coisa estou aqui! 🙂`

const STEPS_ECOM_01 = [
  'Enviar NPS',
  'Criar tarefa para sanar pendências',
]

const SOP_ECOM_02 = `✅ Objetivo da Tarefa — Atualização da Lista de Clientes do Site
Garantir que o cliente envie a lista recente de clientes do e-commerce, para que o gestor possa atualizar os públicos de compradores e melhorar a eficiência das campanhas.

✅ Atividades do CS
1. Solicitar a lista atualizada no grupo do WhatsApp
   - A lista atualizada de clientes do site
   - Preferencialmente em formato CSV ou Excel
   - Com nome, e-mail, telefone e outras informações disponíveis
   Objetivo: manter os públicos de compradores sempre atualizados para otimizar campanhas de remarketing e lookalike.
2. Criar tarefa para o Gestor de Tráfego (assim que o cliente enviar a lista)
   - Criar uma task para o gestor da conta, com vencimento no dia seguinte do envio.
   - Anexar a lista recebida
   - Informar na descrição: ✅ Atualizar público de compradores (lista do cliente)`

const STEPS_ECOM_02 = [
  'Solicitar lista de clientes do site, atualizada. Solicitar no grupo de Whatsapp p/ o cliente.',
  'Criar tarefa para o gestor atualizar publico lista',
  'Criar tarefa para sanar pendências',
]

const SOP_ECOM_03 = `📋 CHECK-IN SEMANAL DE CONTAS — COMO FAZER
Quando: toda segunda-feira, até as 12h. Por que: o relatório do cliente e o seu check-in interno precisam contar a mesma história. Você diagnostica cada conta primeiro, e a IA gera o relatório alinhado com o que você já sabe que está acontecendo.
Importante: este processo é feito por cliente.
Passo 1 — Duplique o documento por cliente: abra o modelo anexo (Arkza Processo Semanal) e faça uma cópia para cada cliente. Renomeie com o nome do cliente.
Passo 2 — Abra o GA4 do cliente (semana anterior): tire prints da semana anterior — faturamento, investimento, ROAS, compras, sessões, ticket médio, taxa de conversão e gráficos de categoria e produto.
Passo 3 — Preencha as 6 perguntas do check-in: dados reais e hipótese clara. Interna, não vai para o cliente. Respostas vagas voltam para refazer. Perguntas 5 e 6 viram ações e pedidos no relatório.
Passo 4 — Salve o documento em PDF.
Passo 5 — Envie para a IA: PDF + prints do GA4. O prompt já está no documento.
Passo 6 — Confira o relatório: números batem e fecha com pergunta pro cliente (ativação obrigatória).
Passo 7 — [Comunicação ao cliente é feita pela CS — postar o relatório no canal interno.]
Passo 8 — Repita e anexe: passos 2 a 7 para cada cliente. Suba os PDFs até as 12h de segunda e marque como concluída.`

const STEPS_ECOM_03 = [
  'Enviar resumo da semana anterior no canal do Chat',
]

const SOP_ECOM_04 = `Objetivos da tarefa:
1. Pausar os piores criativos.
2. Adicionar novos criativos.
3. Pausar os piores públicos.
4. Adicionar pelo menos um novo público para teste.
5. Passar pelo menos 1 feedback para a criação de novos criativos (se necessário).`

const STEPS_ECOM_04 = [
  '[META ADS] Otimizar criativos, garantindo que os GA tenham de 2 a 3 criativos ativos',
  '[META ADS] Otimizar Grupos de Anúncios pausando os com CPA acima da média ou os que gastaram e não converteram',
  '[META ADS] Testar pelo menos um novo grupo de anúncio com segmentação diferente',
  '[META ADS] Se o resultado estiver ruim, trocar estrutura de campanhas (pausa as antigas e sobe novas) ou testar novos objetivos',
  '[META ADS] Otimização de Verba: garantir que as campanhas com mais performance recebam o maior investimento (AJUSTAR de 20% em 20%)',
  '[META ADS] Caso poucas criativos, testar postagem Evergreen ou solicitar novos criativos ao Designer/Cliente',
  '[META ADS] Otimizar Catálogo de Produtos (se cabível)',
  '[META ADS] Criar resumo do que foi feito e enviar no chat de comunicação do cliente',
  '[GOOGLE ADS] Otimizar Termos de Pesquisa e pausar o que não faz sentido',
  '[GOOGLE ADS] Negativar palavras-chave usando filtro de 7 e 14 dias',
  '[GOOGLE ADS] Otimizar Grupos de Anúncios, isolando as melhores palavras-chave e criando anúncios específicos',
  '[GOOGLE ADS] Otimizar "onde os anúncios estão sendo exibidos" em Display e Youtube',
  '[GOOGLE ADS] Otimizar Lances por público-alvo',
  '[GOOGLE ADS] Criar resumo do que foi feito e enviar no chat de comunicação do cliente',
]

const SOP_ECOM_05 = `✅ Objetivo da Tarefa — Solicitação de Criativos
Garantir que a cliente receba um direcionamento estratégico e claro sobre os criativos que precisam ser produzidos, sempre baseado no que já está performando na conta e nas melhores práticas de diversidade criativa. O gestor deve solicitar criativos toda semana.

✅ Responsabilidades do Gestor de Tráfego
1. Solicitar os criativos necessários
   - Definir quantos criativos são necessários para a semana (ex: 3–5).
   - Informar o objetivo do criativo (destaque de produto, prova social, comparação, UGC, uso, lifestyle).
   - Passar a solicitação para a CS, com clareza e exemplos.
2. Enviar referências estratégicas
   - Criativos que já performaram bem na conta.
   - Exemplos de outras marcas do nicho.
   - UGCs e formatos validados.
   - Links da biblioteca de anúncios.
   - Exemplos internos da Arkza.
   A cliente nunca deve ficar sem saber o que gravar — o gestor deve guiar.
3. Diversificar formatos: UGC narrado, detalhes do produto, prova social, reviews rápidos, troca de looks, antes/depois, carrossel de fotos, uso real, texto+narração, criativos de movimento.
4. Basear recomendações no histórico da conta: recomendar formatos que já performaram bem; sugerir variações de criativos campeões; reforçar formatos que funcionaram.

✅ FORMATO DE MENSAGEM PARA SOLICITAR (use de referência)
Oi, [NOME]! Olhei a conta agora e a [PRODUTO] foi a que mais vendeu essa semana. Quero acelerar ela enquanto o estoque ainda dá pra escalar.
Pra isso, queria te pedir 3 vídeos curtos, cada um testando uma forma diferente de vender:
1. Pela versatilidade: 3 jeitos de usar (trabalho, passeio, balada)
2. Pelo caimento: como veste, andando, sentando, mostrando que não marca
3. Pelo conforto: um GRWM mostrando que dá pra usar o dia todo sem desconforto
Te mando 2 vídeos de referência do que está bombando: [LINK 1] / [LINK 2]
Topa gravar até quinta? Se quiser eu te passo um roteirinho, é só avisar!

Materiais de suporte — Guia de Criativos - Referências Visuais (Google Drive):
https://drive.google.com/drive/u/0/folders/1bESB7HyBuzJtp7GvaR0oTz0g1WsLzyIP`

const STEPS_ECOM_05 = [
  'Solicitar criativos e enviar referências',
  'Enviar no canal de comunicação do cliente.',
]

const SOP_ECOM_06 = `📋 CHECK-IN MENSAL DE CONTAS — COMO FAZER
Quando: todo primeiro dia útil do mês, até as 12h. Por que: o relatório do cliente e o check-in interno precisam contar a mesma história.
Importante: processo por cliente.
Passo 1 — Duplique o documento por cliente (modelo Arkza Processo Mensal). Renomeie com nome do cliente e mês de referência (ex: "Megan - Maio").
Passo 2 — Abra o GA4 do cliente: prints de DOIS períodos (mês atual e mês anterior) — faturamento, investimento, ROAS, compras, sessões, ticket médio, taxa de conversão e gráficos de categoria e produto. A comparação é o coração do relatório mensal.
Passo 3 — Preencha as 6 perguntas do check-in (escala mensal: ações do mês, resultado consolidado, plano estratégico do próximo mês).
Passo 4 — Salve em PDF.
Passo 5 — Envie para a IA: PDF + prints dos dois meses.
Passo 6 — Confira o relatório (comparação mês a mês, fecha com pergunta pro cliente).
Passo 7 — [Comunicação ao cliente feita pela CS — postar no canal interno.]
Passo 8 — Repita e anexe: suba os PDFs do mês e marque como concluída.`

const STEPS_ECOM_06 = [
  'Enviar relatório',
]

const SOP_ECOM_07 = `✅ Objetivo da Tarefa — Revisão de Anúncios Ativos (Ofertas Expiradas)
Garantir que nenhum anúncio ativo esteja rodando com ofertas, preços, condições ou comunicações do mês anterior que já não são válidas. Evita inconsistências, reclamações e má experiência de compra.

✅ Atividades do GESTOR
1. Revisar os anúncios ativos na Biblioteca de Anúncios
   - Acessar a Biblioteca de Anúncios do cliente
   - Verificar todos os anúncios ativos
   - Conferir se existem anúncios com: promoções do mês anterior, datas comemorativas passadas, preços antigos, condições que não se aplicam mais (frete grátis, kits, cupons, etc.)
2. Validar com o cliente (se necessário) — enviar print e perguntar: "Essa oferta ainda está válida para continuarmos rodando?"
   Caso exista anúncio com oferta antiga: pausar o anúncio; solicitar substituição/atualização do criativo.

✅ Por que é responsabilidade do GESTOR: evita atritos, protege a marca, mantém comunicação alinhada ao calendário atual, reforça o cuidado e a proatividade da Arkza.`

const STEPS_ECOM_07 = [
  'Revisar anúncios ativos com ofertas expiradas',
]

const SOP_ECOM_08 = `✅ Objetivo da Tarefa — Alinhamento de Demandas com o Gestor
Garantir que o gestor de tráfego tenha solicitado no chat do cliente todas as demandas de criativos necessários para a produção e evolução da semana. A CS atua um passo à frente, evitando que a Arkza fique "devendo" algo ao cliente.

✅ Responsabilidade do CS
- Verificar se o gestor enviou as solicitações de criativo da semana
- Reforçar com o cliente o que é preciso enviar e os prazos.
- Monitorar a entrega dessas demandas ao longo da semana.
- Garantir que nada fique travado por falta de insumos.

✅ Por que é importante: mantém o cliente engajado, evita atrasos, mostra organização e proatividade, reforça que a Arkza está sempre adiantada.`

const STEPS_ECOM_08 = [
  'Verificar se o gestor enviou as solicitações de criativo da semana, via chat',
  'Reforçar com o cliente o que é preciso enviar e os prazos.',
  'Monitorar a entrega dessas demandas ao longo da semana.',
  'Criar tarefa para sanar pendências',
]

const SOP_ECOM_09 = `✅ Objetivo da Tarefa — Envio do Relatório Mensal
Garantir que o relatório mensal gerado pelo gestor seja validado e enviado no grupo do cliente.

✅ Passo a passo do CS
1. Localizar o relatório no chat interno de comunicação do cliente.
2. Validar antes de enviar: mês de referência correto (1º ao último dia); dados legíveis e sem erros (ROAS, Receita, Custo, CPA, Conversão); conclusões e próximos passos preenchidos; branding e layout no padrão Arkza.
3. Enviar ao cliente: postar no grupo do WhatsApp o PDF/Link com mensagem objetiva.
4. Registrar: marcar como concluída e anotar feedback do cliente.

✅ Modelo de mensagem (WhatsApp)
Olá, [NOME]! Segue o Relatório Mensal de [MÊS/ANO] com os principais números (Receita, ROAS, CPA e Taxa de Conversão) e os próximos passos já apontados pela nossa equipe. Qualquer dúvida, fico por aqui! 🚀
[Anexar PDF + Resumo em texto explicativo]`

const STEPS_ECOM_09 = [
  'Enviar relatório mensal',
  'Enviar modelo de mensagem',
  'Criar tarefa para sanar pendências',
]

const SOP_ECOM_10 = `Avaliar Qualidade dos Checkins e Enviar Relatório — Sucesso do Cliente
Quando: toda segunda-feira, 13h. Por que: se os gestores entregarem check-ins ruins, a análise de contas não funciona. A CS é a primeira linha de controle de qualidade.
Passo 1 — Confira se os check-ins chegaram (gestores devem preencher até 12h de segunda).
Passo 2 — Abra a planilha de controle, aba do cliente.
Passo 3 — Avalie o check-in com as 6 perguntas (SIM/NÃO):
   1. Descreveu o problema com números reais? (ex: ROAS caiu de 8 para 3)
   2. Explicou o que fez para resolver?
   3. Descreveu qual foi o resultado do que fez?
   4. Comparou com a semana anterior e explicou o motivo?
   5. Escreveu uma ação concreta para essa semana?
   6. Deixou claro o que precisa do cliente, com especificidade e prazo?
   + Detectores de relatório genérico: "Check-in feito com ChatGPT copiado e colado?" / "Métricas soltas, sem conexão com contexto?"
   + Indicadores de saúde: Warroom, Possível Churn, Desempenho da Campanha, Resposta do Cliente.
Passo 4 — Veja o resultado no Resumo (verde = aprovado, vermelho = reprovado).
Passo 5 — Registre: informar quais gestores tiveram check-ins reprovados.
Passo 6 — Aprovado (individualizado e real): enviar o relatório ao cliente via WhatsApp.`

const SOP_ECOM_11 = `Objetivo da tarefa:
1. Garantir que a campanha esteja rodando e o orçamento dentro do planejado para o mês.
2. Garantir que o resultado da campanha esteja aumentando.
3. Não perder oportunidades de escala.
4. Pausar o que estiver EXTREMAMENTE RUIM antes das otimizações semanais.`

const STEPS_ECOM_11 = [
  '[META ADS] Verificar se as campanhas tiveram veiculação ontem e hoje',
  '[META ADS] Verificar se existem criativos ou públicos com CPA muito acima da média e pausar',
  '[META ADS] Subir criativos enviados pelo cliente',
  '[META ADS] Verificar se campanhas com mais performance recebem o maior investimento (AJUSTAR de 20% em 20%)',
  '[META ADS] Caso poucas criativos, testar postagem Evergreen ou solicitar novos criativos',
  '[META ADS] Pontuar no chat informações importantes sobre a revisão diária, para informarmos ao cliente',
  '[GOOGLE ADS] Verificar se as campanhas tiveram veiculação ontem e hoje',
  '[GOOGLE ADS] Negativar termos de pesquisa sem contexto',
  '[GOOGLE ADS] Verificar palavras-chave/criativos/públicos com CPA acima da média e pausar ou negativar',
  '[GOOGLE ADS] Verificar se campanhas com mais performance recebem o maior investimento (AJUSTAR de 20% em 20%)',
  '[GOOGLE ADS] Ajustar ROAS, CPC ou CPA desejado caso alguma campanha não esteja gastando o orçamento',
  '[GOOGLE ADS] Pontuar no chat informações importantes sobre a revisão diária, para informarmos ao cliente',
]

const SOP_ECOM_12 = `Realizar a troca dos impulsionamentos ou criativos que estão rodando em campanhas de distribuição de conteúdo (geralmente tráfego para o perfil), com o objetivo de aumentar seguidores, fortalecer a marca e gerar novas bases de público para remarketing.

✅ Objetivo Estratégico: atrair novos seguidores qualificados; ampliar visibilidade da marca; gerar novas fontes de tráfego para conversão e remarketing.

✅ Regras Básicas de Avaliação
Quando trocar: se a campanha de distribuição NÃO estiver retendo de 5% a 10% das visitas em novos seguidores → pausar o criativo atual e substituir por um post mais recente do perfil.
Quando manter: se o resultado estiver dentro/acima da referência (5%–10%) e sem potencial de melhoria imediata, a campanha segue.

✅ Critérios para Escolher as Publicações
- Priorizar os últimos posts do Instagram do cliente.
- Preferir conteúdos com bom engajamento orgânico, que mostrem o produto de forma clara, com contexto visual forte/chamada atrativa, alinhados ao posicionamento da marca.`

const SOP_ECOM_13 = `✅ Objetivo da Tarefa — Validação dos Anúncios Ativos
Garantir que o cliente valide se todos os anúncios ativos podem continuar rodando, confirmando: disponibilidade de estoque, grade completa, capacidade de reposição. Evita gastar verba em produtos indisponíveis.

✅ Atividades do CS
1. Enviar link da Biblioteca de Anúncios — enviar ao cliente o link com os anúncios ativos e solicitar confirmação de que todos podem continuar rodando.
2. Validar disponibilidade com o cliente — estoque suficiente? grade completa (tamanhos/cores)? algum produto que não pode mais anunciar?
3. Caso o cliente peça para desativar algum anúncio, o CS deve:
   - Enviar a solicitação ao Gestor de Tráfego: "Cliente pediu para pausar o anúncio X. Pode me mandar um resumo da performance dele?"
   - Validar a performance: se fraca → pausa sem objeção; se positiva → informar o cliente.
   - Responder ao cliente de forma consultiva. Ex: "Esse anúncio está trazendo resultados muito positivos: X vendas e ROAS de X. Você confirma que deseja desativá-lo mesmo assim?"
   Isso evita que o cliente pause campanhas boas sem saber do impacto.

✅ Por que é responsabilidade do CS: mantém o cliente consciente das decisões, protege o desempenho, gera percepção de acompanhamento próximo, reduz risco de queda de vendas por pausas indevidas.`

const STEPS_ECOM_13 = [
  'Enviar link da biblioteca de anúncios',
  'Anúncios que forem para desativar > criar tarefa para o gestor de tráfego desativá-los',
]

const SOP_ECOM_14 = `Prestação de Contas ao Cliente — Resumo Semanal
Quando: toda sexta-feira até as 17h. Por que: o cliente precisa saber o que foi feito na conta dele durante a semana. Cliente que entende confia mais e reclama menos.

Passo 1 — Liste o que foi feito na conta essa semana (por cliente): revisões feitas; ajustes de orçamento e motivo; mudanças na estrutura das campanhas; novos públicos ou criativos testados; o que foi pausado e por quê; palavras negativadas no Google.
Passo 2 — Escreva um resumo simples de no máximo 3 linhas, como se explicando para alguém que não entende de tráfego.
   Ex: "Essa semana testamos 2 criativos novos com foco no produto mais vendido, ajustamos o orçamento para concentrar nos horários de maior conversão e pausamos os públicos que estavam gastando sem retorno."
Passo 3 — Ative o cliente: termine com uma pergunta/pedido. Ex: "Você sentiu diferença nos resultados?" / "Consegue enviar novos criativos até quarta?" / "Tem alguma data especial se aproximando?"
Passo 4 — Envie para o Sucesso do Cliente: mande o texto para a CS via sistema. Ela revisa e envia para o cliente.
⚠️ Regra: não envie o resumo direto para o cliente. Sempre passa pela CS primeiro.`

const SOP_ECOM_15 = `📊 RELATÓRIO MENSAL DE VENDAS CRM (ZOPPY) — POR CLIENTE
Quando: todo dia 1 do mês, até as 12h. Para que serve: acompanhar quanto o CRM está gerando de receita influenciada por cliente no mês fechado, separando por tipo de automação. Mostra a saúde do canal de retenção e ajuda a justificar a estratégia.

Formato padrão da mensagem (copie e preencha):
🏪 [NOME DO CLIENTE]
📅 [Mês de referência, ex: Maio/2026]
⚡ [X] vendas influenciadas pelo CRM/Zoppy
💜 R$ [valor] em vendas influenciadas
📈 ROAS CRM: [X,XX]
Vendas por campanha:
🛒 R$ [valor] vindo da recuperação de carrinho
🛍 R$ [valor] vindo de campanhas promocionais / datas / coleções / eventos
💌 R$ [valor] vindo de [outra automação ativa]

Regras de preenchimento:
- ROAS CRM: faturamento total influenciado ÷ investimento da ferramenta (mensalidade Zoppy do mês). Sem custo claro → em branco e "ROAS não calculado".
- Vendas por campanha: liste apenas categorias com valor maior que zero. Não preencha linhas vazias.
- Cliente sem CRM ativo no mês: registre "CRM pausado/não ativo nesse mês" e justifique em 1 frase.
- Mais de uma automação além das 2 padrões (carrinho e promocional): adicione linhas extras (emoji + valor + origem).`

const SOP_ECOM_16 = `📊 RELATÓRIO SEMANAL DE VENDAS CRM (ZOPPY) — POR CLIENTE
Quando: toda segunda-feira, até as 12h. (mesma estrutura de formato e regras da Tarefa 15)
📅 [Período da semana, ex: 24 a 30 de Maio/2026]
ROAS CRM: use a mensalidade Zoppy proporcional à semana.`

const TEMPLATES_ECOM: SeedTemplate[] = [
  {
    code: 'REC-ECOM-NPS-TRIMESTRAL', name: 'NPS Trimestral', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: SOP_ECOM_01, steps: STEPS_ECOM_01, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'TRIMESTRAL', dayOfMonth: 1, anchorDate: '2026-07-01T00:00:00.000Z', rollToBusinessDay: true },
  },
  {
    code: 'REC-ECOM-LISTA-CLIENTES', name: 'Solicitar Lista de Clientes Atualizada', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: SOP_ECOM_02, steps: STEPS_ECOM_02, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'DIA_DO_MES', dayOfMonth: 5, rollToBusinessDay: true },
  },
  {
    code: 'REC-ECOM-CHECKIN-SEMANAL', name: 'Checkin Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'CRITICA',
    description: SOP_ECOM_03, steps: STEPS_ECOM_03, enforceChecklist: false, formType: 'CHECKIN_SEMANAL',
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-ECOM-OTIMIZACAO-SEMANAL', name: 'Otimização Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: SOP_ECOM_04, steps: STEPS_ECOM_04, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', daysOfWeek: [2, 5] },
  },
  {
    code: 'REC-ECOM-SOLIC-CRIATIVOS', name: 'Solicitação de Novos Criativos', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: SOP_ECOM_05, steps: STEPS_ECOM_05, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 3, hour: 12 },
  },
  {
    code: 'REC-ECOM-CHECKIN-MENSAL', name: 'Checkin Mensal', role: 'GESTOR', area: 'TRAFEGO', priority: 'CRITICA',
    description: SOP_ECOM_06, steps: STEPS_ECOM_06, enforceChecklist: false, formType: 'CHECKIN_MENSAL',
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'DIA_DO_MES', dayOfMonth: 1, rollToBusinessDay: true, hour: 12 },
  },
  {
    code: 'REC-ECOM-REVISAO-ANUNCIOS-MES', name: 'Revisão de Anúncios Ativos (Ofertas Expiradas)', role: 'GESTOR', area: 'TRAFEGO', priority: 'CRITICA',
    description: SOP_ECOM_07, steps: STEPS_ECOM_07, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'DIA_DO_MES', dayOfMonth: 1, rollToBusinessDay: true },
  },
  {
    code: 'REC-ECOM-ENVIAR-SOLIC-CRIATIVO-CS', name: 'Enviar Solicitação de Criativo', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'ALTA',
    description: SOP_ECOM_08, steps: STEPS_ECOM_08, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 3, hour: 15 },
  },
  {
    code: 'REC-ECOM-ENVIO-RELATORIO-MENSAL-CS', name: 'Envio do Relatório Mensal', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'CRITICA',
    description: SOP_ECOM_09, steps: STEPS_ECOM_09, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'DIA_DO_MES', dayOfMonth: 1, rollToBusinessDay: true, hour: 14 },
  },
  {
    code: 'REC-ECOM-VALIDAR-QUALIDADE-CS', name: 'Validar qualidade e enviar relatório', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'ALTA',
    description: SOP_ECOM_10, enforceChecklist: false,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 13 },
  },
  {
    code: 'REC-ECOM-REVISAO-DIARIA', name: 'Revisão Diária de Budget e Performance', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: SOP_ECOM_11, steps: STEPS_ECOM_11, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'DIA_UTIL' },
  },
  {
    code: 'REC-ECOM-TROCA-IMPULSIONAMENTOS', name: 'Troca de Impulsionamentos / Criativos', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: SOP_ECOM_12, enforceChecklist: false,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 4 },
  },
  {
    code: 'REC-ECOM-VALIDACAO-ANUNCIOS-CS', name: 'Validação dos Anúncios Ativos', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: SOP_ECOM_13, steps: STEPS_ECOM_13, enforceChecklist: true,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 4, hour: 15 },
  },
  {
    code: 'REC-ECOM-RESUMO-SEMANAL', name: 'Resumo Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: SOP_ECOM_14, enforceChecklist: false,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 5, hour: 17 },
  },
  {
    code: 'REC-ECOM-RELATORIO-MENSAL-CRM', name: 'Relatório Mensal [CRM]', role: 'CRM', area: 'CRM_AUTOMACAO', priority: 'CRITICA',
    description: SOP_ECOM_15, enforceChecklist: false,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'DIA_DO_MES', dayOfMonth: 1, rollToBusinessDay: true, hour: 12 },
  },
  {
    code: 'REC-ECOM-RELATORIO-SEMANAL-CRM', name: 'Relatório Semanal [CRM]', role: 'CRM', area: 'CRM_AUTOMACAO', priority: 'CRITICA',
    description: SOP_ECOM_16, enforceChecklist: false,
    businessType: 'ECOMMERCE', activeRule: false,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
]

const TEMPLATES: SeedTemplate[] = [
  {
    code: 'REC-CHECKIN-SEMANAL', name: 'Checkin Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: SOP_CHECKIN_SEMANAL, steps: STEPS_CHECKIN_SEMANAL,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-OTIMIZACAO-SEMANAL', name: 'Otimização Semanal', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Otimização Semanal — revisar e otimizar as campanhas do cliente na semana corrente (orçamento, criativos, públicos e estrutura).',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-RESUMO-SEMANAL', name: 'Resumo Semanal (Prestação de Contas)', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: SOP_RESUMO_SEMANAL, steps: STEPS_RESUMO_SEMANAL,
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 5, hour: 17 },
  },
  {
    code: 'REC-CHECKIN-MENSAL', name: 'Checkin Mensal', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Checkin Mensal — consolidar o resultado do mês do cliente e planejar o mês seguinte.',
    recurrence: { frequency: 'MENSAL', dayOfMonth: 1, hour: 12 },
  },
  {
    code: 'REC-RELATORIO-MENSAL-CS', name: 'Envio do Relatório Mensal', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Envio do Relatório Mensal — consolidar e enviar ao cliente o relatório mensal de resultados.',
    recurrence: { frequency: 'MENSAL', dayOfMonth: 1, hour: 14 },
  },
  {
    code: 'REC-RELATORIO-SEMANAL-CRM', name: 'Relatório Semanal [CRM]', role: 'CRM', area: 'CRM_AUTOMACAO', priority: 'MEDIA',
    description: 'Relatório Semanal [CRM] — consolidar e enviar o relatório semanal de CRM/automação (Zoppy) do cliente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-RELATORIO-MENSAL-CRM', name: 'Relatório Mensal [CRM]', role: 'CRM', area: 'CRM_AUTOMACAO', priority: 'MEDIA',
    description: 'Relatório Mensal [CRM] — consolidar e enviar o relatório mensal de CRM/automação (Zoppy) do cliente.',
    recurrence: { frequency: 'MENSAL', dayOfMonth: 1, hour: 12 },
  },
  {
    code: 'REC-NPS-TRIMESTRAL', name: 'NPS Trimestral', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'NPS Trimestral — coletar a nota de satisfação (NPS) do cliente a cada 90 dias.',
    recurrence: { frequency: 'TRIMESTRAL', dayOfMonth: 1 },
  },
  {
    code: 'REC-VALIDACAO-ANUNCIOS', name: 'Validação dos Anúncios Ativos', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Validação dos Anúncios Ativos — conferir se os anúncios ativos do cliente estão corretos e coerentes com a oferta.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 15 },
  },
  {
    code: 'REC-SOLIC-NOVOS-CRIATIVOS', name: 'Solicitação de Novos Criativos', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Solicitação de Novos Criativos — solicitar ao cliente os novos criativos necessários para a semana.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1, hour: 12 },
  },
  {
    code: 'REC-REVISAO-DIARIA-BUDGET', name: 'Revisão Diária de Budget e Performance', role: 'GESTOR', area: 'TRAFEGO', priority: 'ALTA',
    description: 'Revisão Diária de Budget e Performance — revisar o orçamento e a performance das contas no dia corrente.',
    recurrence: { frequency: 'DIA_UTIL' },
  },
  {
    code: 'REC-REVISAO-ANUNCIOS-OFERTAS', name: 'Revisão de Anúncios Ativos (Ofertas Expiradas)', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Revisão de Anúncios Ativos — identificar e pausar anúncios com ofertas expiradas na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-TROCA-IMPULSIONAMENTOS', name: 'Troca de Impulsionamentos / Criativos', role: 'GESTOR', area: 'TRAFEGO', priority: 'MEDIA',
    description: 'Troca de Impulsionamentos / Criativos — trocar os impulsionamentos e criativos das campanhas na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-SOLIC-LISTA-CLIENTES', name: 'Solicitar Lista de Clientes Atualizada', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Solicitar Lista de Clientes Atualizada — solicitar ao cliente a lista atualizada de clientes/base para o CRM na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
  {
    code: 'REC-ENVIAR-SOLIC-CRIATIVO', name: 'Enviar Solicitação de Criativo', role: 'CS', area: 'SUCESSO_CLIENTE', priority: 'MEDIA',
    description: 'Enviar Solicitação de Criativo — enviar ao cliente a solicitação formal de criativos na semana corrente.',
    recurrence: { frequency: 'SEMANAL', dayOfWeek: 1 },
  },
]

function slugEmail(slug: string): string {
  return `${slug}@arkza.com.br`
}

export async function seedOperacaoArkza(): Promise<{
  usersCreated: number
  usersUpdated: number
  templatesUpserted: number
  recurrencesUpserted: number
  stepsCreated: number
}> {
  let usersCreated = 0
  let usersUpdated = 0

  // ── (a) Time ────────────────────────────────────────────────────────────────
  for (const u of TEAM) {
    const email = u.email ?? slugEmail(u.slug)

    // Localiza por externalId (quando houver) ou por email.
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          ...(u.externalId ? [{ externalId: u.externalId }] : []),
          { email },
        ],
      },
      select: { id: true },
    })

    if (existing) {
      // NUNCA sobrescreve passwordHash. Atualiza só metadados operacionais.
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: u.name,
          operationalRole: u.operationalRole,
          role: u.role,
          externalId: u.externalId ?? undefined,
          active: true,
        },
      })
      usersUpdated++
    } else {
      // Senha ALEATÓRIA forte — usuário define depois via reset.
      const randomPassword = randomBytes(32).toString('hex')
      const passwordHash = await bcrypt.hash(randomPassword, 12)
      await prisma.user.create({
        data: {
          name: u.name,
          email,
          passwordHash,
          role: u.role,
          operationalRole: u.operationalRole,
          externalId: u.externalId,
          active: true,
        },
      })
      usersCreated++
    }
  }

  // ── Áreas (para resolver areaId por AreaCode) ────────────────────────────────
  const areas = await prisma.taskArea.findMany({ select: { id: true, code: true } })
  const areaByCode = new Map(areas.map((a) => [a.code, a.id]))

  // ── (b) + (c) Templates + recorrências + steps ───────────────────────────────
  let templatesUpserted = 0
  let recurrencesUpserted = 0
  let stepsCreated = 0

  for (const t of [...TEMPLATES, ...TEMPLATES_ECOM]) {
    const areaId = areaByCode.get(t.area) ?? null

    const tpl = await prisma.taskTemplate.upsert({
      where: { code: t.code },
      update: {
        name: t.name,
        description: t.description,
        areaId,
        defaultType: 'RECORRENTE',
        defaultPriority: t.priority,
        defaultAssigneeRole: t.role,
        enforceChecklist: t.enforceChecklist ?? false,
        formType: t.formType ?? null,
        tags: t.tags ?? [],
        active: true,
      },
      create: {
        code: t.code,
        name: t.name,
        description: t.description,
        areaId,
        defaultType: 'RECORRENTE',
        defaultPriority: t.priority,
        defaultStatus: 'A_FAZER',
        defaultAssigneeRole: t.role,
        enforceChecklist: t.enforceChecklist ?? false,
        formType: t.formType ?? null,
        tags: t.tags ?? [],
        active: true,
      },
      select: { id: true },
    })
    templatesUpserted++

    // Steps (apenas onde o documento fornece SOP detalhada). Idempotente:
    // recria só se ainda não houver step para o template.
    if (t.steps && t.steps.length) {
      const stepCount = await prisma.taskTemplateStep.count({ where: { templateId: tpl.id } })
      if (stepCount === 0) {
        await prisma.taskTemplateStep.createMany({
          data: t.steps.map((label, i) => ({ templateId: tpl.id, label, required: true, order: i })),
        })
        stepsCreated += t.steps.length
      }
    }

    // Recorrência (templateId é @unique → upsert por templateId).
    await prisma.taskRecurrenceRule.upsert({
      where: { templateId: tpl.id },
      update: {
        frequency: t.recurrence.frequency,
        dayOfWeek: t.recurrence.dayOfWeek ?? null,
        daysOfWeek: t.recurrence.daysOfWeek ?? [],
        dayOfMonth: t.recurrence.dayOfMonth ?? null,
        hour: t.recurrence.hour ?? null,
        minute: t.recurrence.minute ?? 0,
        anchorDate: t.recurrence.anchorDate ? new Date(t.recurrence.anchorDate) : null,
        rollToBusinessDay: t.recurrence.rollToBusinessDay ?? false,
        businessType: t.businessType ?? null,
        // NÃO tocar `active` no update: preserva a ativação manual pós-gate. Se o
        // seed forçasse active aqui, re-rodar depois da ativação desligaria as 16.
      },
      create: {
        templateId: tpl.id,
        frequency: t.recurrence.frequency,
        dayOfWeek: t.recurrence.dayOfWeek ?? null,
        daysOfWeek: t.recurrence.daysOfWeek ?? [],
        dayOfMonth: t.recurrence.dayOfMonth ?? null,
        hour: t.recurrence.hour ?? null,
        minute: t.recurrence.minute ?? 0,
        anchorDate: t.recurrence.anchorDate ? new Date(t.recurrence.anchorDate) : null,
        rollToBusinessDay: t.recurrence.rollToBusinessDay ?? false,
        businessType: t.businessType ?? null,
        active: t.activeRule ?? true,
      },
    })
    recurrencesUpserted++
  }

  return { usersCreated, usersUpdated, templatesUpserted, recurrencesUpserted, stepsCreated }
}

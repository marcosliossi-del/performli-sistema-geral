'use client'

import { useState, useTransition } from 'react'
import { Card } from '@/components/ui/card'
import {
  FileText, MessageSquare, CheckCircle2, ChevronDown, ChevronUp,
  Save, Plus, Trash2, Target, CalendarClock,
} from 'lucide-react'
import { saveDiagnosticoGestor, saveDecisoesCs } from '@/app/actions/warRoom'
import { NIVEL_FRAMEWORK_LABELS, type DiagnosticoGestor, type DecisoesCs } from '@/lib/warroom/forms'

type ResponsibleOption = { id: string; name: string; role: string }

export type WarRoomDocsProps = {
  protocolId: string
  clientName: string
  exitCriteria: string | null
  responsibleOptions: ResponsibleOption[]
  currentUserName: string
  savedDiagnostico: DiagnosticoGestor | null
  savedDecisoes: DecisoesCs | null
  prefill: { situacao: string; desdeQuando: string; oQueJaFoiFeito: string }
  canEditDiagnostico: boolean
  canEditDecisoes: boolean
}

const inputCls =
  'mt-1 w-full bg-[#0A1E2C] border border-[#38435C] rounded-lg px-3 py-2 text-xs text-[#EBEBEB] placeholder:text-[#87919E]/50 focus:outline-none focus:border-[#95BBE2]/50'
const labelCls = 'text-[10px] font-medium text-[#87919E] uppercase tracking-wider'

const NIVEIS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]

export function WarRoomDocsPanel(props: WarRoomDocsProps) {
  return (
    <div className="space-y-2">
      <DiagnosticoBlock {...props} />
      <DecisoesBlock {...props} />
    </div>
  )
}

// ── Bloco 1: Diagnóstico do gestor (até quarta) ──────────────────────────────
function DiagnosticoBlock({
  protocolId, exitCriteria, savedDiagnostico, prefill, canEditDiagnostico, currentUserName,
}: WarRoomDocsProps) {
  const [open, setOpen] = useState(false)
  const [enviado, setEnviado] = useState(!!savedDiagnostico)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [situacao, setSituacao] = useState(savedDiagnostico?.situacao ?? prefill.situacao)
  const [desdeQuando, setDesdeQuando] = useState(savedDiagnostico?.desdeQuando ?? prefill.desdeQuando)
  const [oQueJaFoiFeito, setOQueJaFoiFeito] = useState(savedDiagnostico?.oQueJaFoiFeito ?? prefill.oQueJaFoiFeito)
  const [nivelFramework, setNivelFramework] = useState<1 | 2 | 3 | 4>(savedDiagnostico?.nivelFramework ?? 1)
  const [hipotese, setHipotese] = useState(savedDiagnostico?.hipotese ?? '')
  const [evidencia, setEvidencia] = useState(savedDiagnostico?.evidencia ?? '')
  const [teste, setTeste] = useState(savedDiagnostico?.teste ?? '')
  const [prazoTeste, setPrazoTeste] = useState(savedDiagnostico?.prazoTeste ?? '')
  const [precisaDoCliente, setPrecisaDoCliente] = useState(savedDiagnostico?.precisaDoCliente ?? '')
  const [precisaDoSupervisor, setPrecisaDoSupervisor] = useState(savedDiagnostico?.precisaDoSupervisor ?? '')

  function handleSave() {
    setMsg(null)
    const data = {
      situacao, desdeQuando, oQueJaFoiFeito, nivelFramework, hipotese, evidencia,
      teste, prazoTeste, precisaDoCliente, precisaDoSupervisor,
      preenchidoPor: currentUserName,
      preenchidoEm: new Date().toISOString(),
    }
    startTransition(async () => {
      const res = await saveDiagnosticoGestor(protocolId, data)
      if ('error' in res) { setMsg(res.error); return }
      setEnviado(true)
      setMsg('Diagnóstico salvo.')
    })
  }

  return (
    <Card className="p-4 border-l-4 border-l-[#EAB308]/50 bg-[#0A1E2C]/40">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2">
          <FileText size={14} className="text-[#EAB308]" />
          <span className="text-xs font-semibold text-[#EBEBEB] uppercase tracking-wider">
            Diagnóstico do gestor (até quarta)
          </span>
          {enviado && (
            <span className="flex items-center gap-1 text-[10px] text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/20 rounded px-2 py-0.5">
              <MessageSquare size={10} /> Enviado no chat ✓
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} className="text-[#87919E]" /> : <ChevronDown size={16} className="text-[#87919E]" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {exitCriteria?.trim() && (
            <div className="flex items-start gap-2 text-[11px] bg-[#95BBE2]/5 border border-[#95BBE2]/20 rounded-lg px-3 py-2">
              <Target size={12} className="text-[#95BBE2] mt-0.5" />
              <span className="text-[#95BBE2]"><span className="text-[#EBEBEB] font-medium">Critério de saída:</span> {exitCriteria}</span>
            </div>
          )}

          {!canEditDiagnostico ? (
            <ReadOnlyDiagnostico saved={savedDiagnostico} />
          ) : (
            <>
              <Field label="O que está acontecendo (com números)">
                <textarea value={situacao} onChange={(e) => setSituacao(e.target.value)} rows={4}
                  placeholder="Pré-preenchido pela comparação de métricas — complemente se precisar." className={`${inputCls} resize-none`} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde quando">
                  <input value={desdeQuando} onChange={(e) => setDesdeQuando(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Nível do problema (framework)">
                  <select value={nivelFramework} onChange={(e) => setNivelFramework(Number(e.target.value) as 1 | 2 | 3 | 4)} className={inputCls}>
                    {NIVEIS.map((n) => <option key={n} value={n}>{n}. {NIVEL_FRAMEWORK_LABELS[n]}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="O que já foi feito">
                <textarea value={oQueJaFoiFeito} onChange={(e) => setOQueJaFoiFeito(e.target.value)} rows={3}
                  placeholder="Pré-preenchido com as últimas tarefas concluídas." className={`${inputCls} resize-none`} />
              </Field>
              <Field label="Hipótese de causa">
                <textarea value={hipotese} onChange={(e) => setHipotese(e.target.value)} rows={2}
                  placeholder="Por que isso está acontecendo?" className={`${inputCls} resize-none`} />
              </Field>
              <Field label="Evidência que sustenta a hipótese">
                <textarea value={evidencia} onChange={(e) => setEvidencia(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </Field>
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <Field label="Teste que valida a hipótese">
                  <input value={teste} onChange={(e) => setTeste(e.target.value)} className={inputCls} />
                </Field>
                <Field label="Prazo do teste">
                  <input type="date" value={prazoTeste} onChange={(e) => setPrazoTeste(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preciso do cliente">
                  <input value={precisaDoCliente} onChange={(e) => setPrecisaDoCliente(e.target.value)} placeholder="Opcional" className={inputCls} />
                </Field>
                <Field label="Preciso do supervisor">
                  <input value={precisaDoSupervisor} onChange={(e) => setPrecisaDoSupervisor(e.target.value)} placeholder="Opcional" className={inputCls} />
                </Field>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button onClick={handleSave} disabled={isPending}
                  className="flex items-center gap-1.5 text-xs bg-[#EAB308]/10 text-[#EAB308] border border-[#EAB308]/20 rounded-lg px-3 py-1.5 hover:bg-[#EAB308]/20 transition-colors disabled:opacity-50">
                  <Save size={12} /> Salvar e enviar no chat
                </button>
                {msg && <span className="text-[11px] text-[#95BBE2]">{msg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function ReadOnlyDiagnostico({ saved }: { saved: DiagnosticoGestor | null }) {
  if (!saved) {
    return <p className="text-xs text-[#87919E]">Diagnóstico do gestor ainda não preenchido. O gestor tem até quarta para registrar situação, hipótese e teste.</p>
  }
  return (
    <div className="space-y-1.5 text-xs text-[#87919E]">
      <p className="whitespace-pre-wrap"><span className="text-[#EBEBEB]">Situação:</span> {saved.situacao}</p>
      <p><span className="text-[#EBEBEB]">Nível:</span> {saved.nivelFramework}. {NIVEL_FRAMEWORK_LABELS[saved.nivelFramework]}</p>
      <p><span className="text-[#EBEBEB]">Hipótese:</span> {saved.hipotese}</p>
      <p><span className="text-[#EBEBEB]">Teste:</span> {saved.teste} · Prazo: {saved.prazoTeste}</p>
    </div>
  )
}

// ── Bloco 2: Decisões da War Room (quinta) ───────────────────────────────────
type ProblemaState = { problema: string; acoes: { acao: string; responsavelId: string; prazo: string }[] }

function DecisoesBlock({
  protocolId, exitCriteria, savedDecisoes, responsibleOptions, canEditDecisoes, currentUserName,
}: WarRoomDocsProps) {
  const [open, setOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [resumoDiagnostico, setResumoDiagnostico] = useState(savedDecisoes?.resumoDiagnostico ?? '')
  const [problemas, setProblemas] = useState<ProblemaState[]>(
    savedDecisoes?.problemas ?? [{ problema: '', acoes: [{ acao: '', responsavelId: '', prazo: '' }] }],
  )
  const [precisaDoCliente, setPrecisaDoCliente] = useState(savedDecisoes?.precisaDoCliente ?? '')
  const [proximaReuniao, setProximaReuniao] = useState(savedDecisoes?.proximaReuniao ?? '')
  const [notas, setNotas] = useState(savedDecisoes?.notas ?? '')

  function updateProblema(pi: number, value: string) {
    setProblemas((prev) => prev.map((p, i) => (i === pi ? { ...p, problema: value } : p)))
  }
  function updateAcao(pi: number, ai: number, field: 'acao' | 'responsavelId' | 'prazo', value: string) {
    setProblemas((prev) => prev.map((p, i) => i !== pi ? p : {
      ...p, acoes: p.acoes.map((a, j) => (j === ai ? { ...a, [field]: value } : a)),
    }))
  }
  function addAcao(pi: number) {
    setProblemas((prev) => prev.map((p, i) => i !== pi ? p : { ...p, acoes: [...p.acoes, { acao: '', responsavelId: '', prazo: '' }] }))
  }
  function removeAcao(pi: number, ai: number) {
    setProblemas((prev) => prev.map((p, i) => i !== pi ? p : { ...p, acoes: p.acoes.filter((_, j) => j !== ai) }))
  }
  function addProblema() {
    setProblemas((prev) => [...prev, { problema: '', acoes: [{ acao: '', responsavelId: '', prazo: '' }] }])
  }
  function removeProblema(pi: number) {
    setProblemas((prev) => prev.filter((_, i) => i !== pi))
  }

  function handleSave() {
    setMsg(null)
    const data = {
      resumoDiagnostico,
      problemas,
      precisaDoCliente,
      proximaReuniao: proximaReuniao.trim() ? proximaReuniao : null,
      notas,
      preenchidoPor: currentUserName,
      preenchidoEm: new Date().toISOString(),
    }
    startTransition(async () => {
      const res = await saveDecisoesCs(protocolId, data)
      if ('error' in res) { setMsg(res.error); return }
      const criadas = `${res.tasksCriadas} task${res.tasksCriadas !== 1 ? 's' : ''} criada${res.tasksCriadas !== 1 ? 's' : ''}`
      const canceladas = res.tasksCanceladas > 0
        ? ` · ${res.tasksCanceladas} de ação removida cancelada${res.tasksCanceladas !== 1 ? 's' : ''}`
        : ''
      setMsg(`${criadas}${canceladas}.`)
    })
  }

  return (
    <Card className="p-4 border-l-4 border-l-[#95BBE2]/50 bg-[#0A1E2C]/40">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-[#95BBE2]" />
          <span className="text-xs font-semibold text-[#EBEBEB] uppercase tracking-wider">
            Decisões da War Room (quinta)
          </span>
          {savedDecisoes && (
            <span className="text-[10px] text-[#87919E]">· registrado por {savedDecisoes.preenchidoPor}</span>
          )}
        </span>
        {open ? <ChevronUp size={16} className="text-[#87919E]" /> : <ChevronDown size={16} className="text-[#87919E]" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {exitCriteria?.trim() && (
            <div className="flex items-start gap-2 text-[11px] bg-[#95BBE2]/5 border border-[#95BBE2]/20 rounded-lg px-3 py-2">
              <Target size={12} className="text-[#95BBE2] mt-0.5" />
              <span className="text-[#95BBE2]"><span className="text-[#EBEBEB] font-medium">Critério de saída:</span> {exitCriteria}</span>
            </div>
          )}

          {!canEditDecisoes ? (
            savedDecisoes ? (
              <div className="space-y-1.5 text-xs text-[#87919E]">
                <p className="whitespace-pre-wrap"><span className="text-[#EBEBEB]">Resumo:</span> {savedDecisoes.resumoDiagnostico}</p>
                {savedDecisoes.problemas.map((p, i) => (
                  <div key={i}>
                    <p className="text-[#EBEBEB]">{p.problema}</p>
                    <ul className="ml-3 list-disc">
                      {p.acoes.map((a, j) => <li key={j}>{a.acao} · prazo {a.prazo}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#87919E]">Decisões ainda não documentadas. A CS registra os problemas e as ações na call de quinta.</p>
            )
          ) : (
            <>
              <Field label="Resumo do diagnóstico discutido">
                <textarea value={resumoDiagnostico} onChange={(e) => setResumoDiagnostico(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </Field>

              <div className="space-y-3">
                {problemas.map((p, pi) => (
                  <div key={pi} className="border border-[#38435C]/60 rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input value={p.problema} onChange={(e) => updateProblema(pi, e.target.value)}
                        placeholder={`Problema ${pi + 1}`} className={inputCls} />
                      {problemas.length > 1 && (
                        <button onClick={() => removeProblema(pi)} className="mt-1 text-[#EF4444]/70 hover:text-[#EF4444]"><Trash2 size={14} /></button>
                      )}
                    </div>
                    {p.acoes.map((a, ai) => (
                      <div key={ai} className="grid grid-cols-[1fr_150px_140px_auto] gap-2 items-center">
                        <input value={a.acao} onChange={(e) => updateAcao(pi, ai, 'acao', e.target.value)} placeholder="Ação → vira task" className={inputCls} />
                        <select value={a.responsavelId} onChange={(e) => updateAcao(pi, ai, 'responsavelId', e.target.value)} className={inputCls}>
                          <option value="">— responsável —</option>
                          {responsibleOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        <input type="date" value={a.prazo} onChange={(e) => updateAcao(pi, ai, 'prazo', e.target.value)} className={inputCls} />
                        {p.acoes.length > 1 && (
                          <button onClick={() => removeAcao(pi, ai)} className="text-[#EF4444]/70 hover:text-[#EF4444]"><Trash2 size={13} /></button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => addAcao(pi)} className="flex items-center gap-1 text-[10px] text-[#95BBE2] hover:underline">
                      <Plus size={11} /> adicionar ação
                    </button>
                  </div>
                ))}
                <button onClick={addProblema} className="flex items-center gap-1 text-[11px] text-[#95BBE2] hover:underline">
                  <Plus size={12} /> adicionar problema
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Preciso do cliente">
                  <input value={precisaDoCliente} onChange={(e) => setPrecisaDoCliente(e.target.value)} placeholder="Opcional" className={inputCls} />
                </Field>
                <Field label="Próxima reunião">
                  <input type="date" value={proximaReuniao} onChange={(e) => setProximaReuniao(e.target.value)} className={inputCls} />
                </Field>
              </div>
              <Field label="Notas">
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Opcional" className={`${inputCls} resize-none`} />
              </Field>

              <div className="flex items-center gap-3 pt-1">
                <button onClick={handleSave} disabled={isPending}
                  className="flex items-center gap-1.5 text-xs bg-[#95BBE2]/10 text-[#95BBE2] border border-[#95BBE2]/20 rounded-lg px-3 py-1.5 hover:bg-[#95BBE2]/20 transition-colors disabled:opacity-50">
                  <CalendarClock size={12} /> Salvar decisões e gerar tasks
                </button>
                {msg && <span className="text-[11px] text-[#95BBE2]">{msg}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

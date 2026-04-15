'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Trash2, FileText, CheckCircle2, XCircle, Loader2, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type AgentTag = 'ALL' | 'ECOMMERCE' | 'LOCAL' | 'CS'

type KnowledgeDoc = {
  id: string
  filename: string
  title: string
  chunkCount: number
  tags: string[]
  createdAt: string
  uploader: { name: string }
}

type UploadResult = {
  filename: string
  success: boolean
  chunkCount?: number
  error?: string
}

const TAG_OPTIONS: { value: AgentTag; label: string; color: string }[] = [
  { value: 'ALL',       label: 'Todos os agentes', color: '#87919E' },
  { value: 'ECOMMERCE', label: 'E-commerce',        color: '#95BBE2' },
  { value: 'LOCAL',     label: 'Negócio Local',     color: '#F59E0B' },
  { value: 'CS',        label: 'Sucesso do Cliente', color: '#34D399' },
]

function tagLabel(tag: string) {
  return TAG_OPTIONS.find(t => t.value === tag)?.label ?? tag
}
function tagColor(tag: string) {
  return TAG_OPTIONS.find(t => t.value === tag)?.color ?? '#87919E'
}

export function KnowledgeClient() {
  const [files, setFiles]           = useState<File[]>([])
  const [tag, setTag]               = useState<AgentTag>('ALL')
  const [uploading, setUploading]   = useState(false)
  const [results, setResults]       = useState<UploadResult[]>([])
  const [docs, setDocs]             = useState<KnowledgeDoc[]>([])
  const [loadingDocs, setLoadingDocs] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [dragging, setDragging]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true)
    try {
      const res = await fetch('/api/admin/knowledge')
      const data = await res.json()
      if (Array.isArray(data)) setDocs(data)
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  function addFiles(newFiles: FileList | File[]) {
    const pdfs = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...pdfs.filter(f => !existing.has(f.name))]
    })
  }

  function removeFile(name: string) {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }, [])

  async function upload() {
    if (!files.length || uploading) return
    setUploading(true)
    setResults([])

    const formData = new FormData()
    files.forEach(f => formData.append('files', f))
    formData.append('tags', tag)

    try {
      const res = await fetch('/api/admin/knowledge/upload', { method: 'POST', body: formData })
      const data = await res.json()
      setResults(data.results ?? [])
      setFiles([])
      fetchDocs()
    } catch {
      setResults([{ filename: 'Erro geral', success: false, error: 'Falha ao conectar com o servidor' }])
    } finally {
      setUploading(false)
    }
  }

  async function deleteDoc(id: string) {
    setDeletingId(id)
    try {
      await fetch(`/api/admin/knowledge/${id}`, { method: 'DELETE' })
      setDocs(prev => prev.filter(d => d.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const totalChunks = docs.reduce((s, d) => s + d.chunkCount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#EBEBEB]">Base de Conhecimento</h1>
        <p className="text-[#87919E] text-sm mt-0.5">
          Materiais de apoio que alimentam a inteligência dos Agentes IA
        </p>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl px-5 py-3">
          <p className="text-2xl font-bold text-[#EBEBEB]">{docs.length}</p>
          <p className="text-xs text-[#87919E]">Documentos</p>
        </div>
        <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl px-5 py-3">
          <p className="text-2xl font-bold text-[#EBEBEB]">{totalChunks}</p>
          <p className="text-xs text-[#87919E]">Trechos indexados</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Upload section */}
        <div className="col-span-2 space-y-4">
          <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#EBEBEB]">Upload de materiais</h2>

            {/* Dropzone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-all',
                dragging
                  ? 'border-[#95BBE2] bg-[#95BBE2]/10'
                  : 'border-[#38435C] hover:border-[#95BBE2]/50 hover:bg-[#38435C]/20'
              )}
            >
              <Upload size={28} className="mx-auto text-[#87919E] mb-3" />
              <p className="text-sm text-[#EBEBEB] font-medium">Arraste os PDFs aqui</p>
              <p className="text-xs text-[#87919E] mt-1">ou clique para selecionar</p>
              <p className="text-[11px] text-[#87919E] mt-3">Múltiplos arquivos • Somente PDF</p>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) addFiles(e.target.files) }}
            />

            {/* Selected files list */}
            {files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-[#87919E]">{files.length} arquivo{files.length > 1 ? 's' : ''} selecionado{files.length > 1 ? 's' : ''}</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {files.map(f => (
                    <div key={f.name} className="flex items-center gap-2 bg-[#38435C]/30 rounded-lg px-3 py-1.5">
                      <FileText size={12} className="text-[#87919E] flex-shrink-0" />
                      <span className="text-xs text-[#EBEBEB] flex-1 truncate">{f.name}</span>
                      <span className="text-[10px] text-[#87919E]">{(f.size / 1024).toFixed(0)}KB</span>
                      <button onClick={() => removeFile(f.name)} className="text-[#87919E] hover:text-[#EF4444]">
                        <XCircle size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent tag selector */}
            <div className="space-y-2">
              <p className="text-xs text-[#87919E] font-medium">Aplicar a qual agente?</p>
              <div className="grid grid-cols-2 gap-2">
                {TAG_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTag(opt.value)}
                    className={cn(
                      'px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left',
                      tag === opt.value
                        ? 'text-[#EBEBEB] border-opacity-50'
                        : 'border-[#38435C] text-[#87919E] hover:bg-[#38435C]/30'
                    )}
                    style={tag === opt.value ? {
                      backgroundColor: `${opt.color}20`,
                      borderColor: `${opt.color}60`,
                      color: opt.color,
                    } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={upload}
              disabled={!files.length || uploading}
              className="w-full"
            >
              {uploading ? (
                <><Loader2 size={14} className="animate-spin mr-2" /> Processando...</>
              ) : (
                <><Upload size={14} className="mr-2" /> Enviar {files.length > 0 ? `${files.length} arquivo${files.length > 1 ? 's' : ''}` : 'materiais'}</>
              )}
            </Button>

            {/* Upload results */}
            {results.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#EBEBEB]">Resultado do upload</p>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
                      r.success ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                    )}
                  >
                    {r.success
                      ? <CheckCircle2 size={12} className="flex-shrink-0 mt-0.5" />
                      : <XCircle size={12} className="flex-shrink-0 mt-0.5" />}
                    <div>
                      <p className="font-medium truncate">{r.filename}</p>
                      {r.success
                        ? <p className="opacity-80">{r.chunkCount} trechos indexados</p>
                        : <p className="opacity-80">{r.error}</p>
                      }
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Documents list */}
        <div className="col-span-3">
          <div className="bg-[#38435C]/20 border border-[#38435C] rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#38435C]">
              <h2 className="text-sm font-semibold text-[#EBEBEB]">Materiais indexados</h2>
            </div>

            {loadingDocs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-[#87919E]" />
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-8">
                <BookOpen size={32} className="text-[#38435C] mb-3" />
                <p className="text-sm text-[#87919E]">Nenhum material ainda</p>
                <p className="text-xs text-[#38435C] mt-1">Faça upload dos seus PDFs para começar</p>
              </div>
            ) : (
              <div className="divide-y divide-[#38435C]/50">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#38435C]/10 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-[#38435C]/40 flex items-center justify-center flex-shrink-0">
                      <FileText size={14} className="text-[#87919E]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#EBEBEB] truncate">{doc.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-[#87919E]">{doc.chunkCount} trechos</span>
                        <span className="text-[11px] text-[#87919E]">
                          {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        <div className="flex gap-1">
                          {doc.tags.map(t => (
                            <span
                              key={t}
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${tagColor(t)}15`, color: tagColor(t) }}
                            >
                              {tagLabel(t)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => deleteDoc(doc.id)}
                      disabled={deletingId === doc.id}
                      className="p-1.5 rounded-lg text-[#87919E] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors disabled:opacity-50"
                    >
                      {deletingId === doc.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

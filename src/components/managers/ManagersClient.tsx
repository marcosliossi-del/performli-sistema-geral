'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { healthLabels, healthBgClasses } from '@/lib/health'
import { HealthStatus } from '@prisma/client'
import type { ManagerWithStats } from '@/lib/dal'

// ── Cores por gestor (sequencial) ─────────────────────────────────────────────
const MANAGER_COLORS = [
  '#95BBE2', // azul claro
  '#A78BFA', // roxo
  '#34D399', // verde
  '#FB923C', // laranja
  '#F472B6', // rosa
  '#60A5FA', // azul
  '#FBBF24', // amarelo
]

const STATUS_LABELS: Record<string, string> = {
  OTIMO: 'Saudável',
  REGULAR: 'Atenção',
  RUIM: 'Crítico',
}

const STATUS_ICONS: Record<string, string> = {
  OTIMO: '✅',
  REGULAR: '⚠️',
  RUIM: '🔴',
}

type StatusFilter = 'ALL' | 'OTIMO' | 'REGULAR' | 'RUIM'

interface Props {
  managers: ManagerWithStats[]
}

export function ManagersClient({ managers }: Props) {
  const [selectedManager, setSelectedManager] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')

  // Todos os clientes (flatmap) para a tabela
  const allClients = managers.flatMap((m) =>
    m.clients.map((c) => ({ ...c, managerName: m.name, managerId: m.id }))
  )

  // Filtragem
  const filteredClients = allClients.filter((c) => {
    const matchesManager = !selectedManager || c.managerId === selectedManager
    const matchesStatus =
      statusFilter === 'ALL' || c.overallStatus === statusFilter
    return matchesManager && matchesStatus
  })

  // Dados do donut: clientes por gestor
  const donutData = managers.map((m, i) => ({
    name: m.name,
    value: m.clientCount,
    color: MANAGER_COLORS[i % MANAGER_COLORS.length],
  }))

  const totalClients = managers.reduce((s, m) => s + m.clientCount, 0)

  return (
    <div className="space-y-6">
      {/* ── Cards + Donut ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Cards dos gestores */}
        <div className="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {managers.map((manager, i) => {
            const color = MANAGER_COLORS[i % MANAGER_COLORS.length]
            const hitPct =
              manager.clientCount > 0
                ? Math.round((manager.goalsHit / manager.clientCount) * 100)
                : 0
            const isSelected = selectedManager === manager.id

            return (
              <button
                key={manager.id}
                onClick={() =>
                  setSelectedManager(isSelected ? null : manager.id)
                }
                className={`text-left rounded-2xl border p-4 transition-all ${
                  isSelected
                    ? 'border-[#95BBE2] bg-[#95BBE2]/5'
                    : 'border-[#38435C] bg-[#0A1E2C] hover:border-[#95BBE2]/50'
                }`}
              >
                {/* Avatar + nome */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {manager.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#EBEBEB] font-semibold text-sm truncate">
                      {manager.name}
                    </p>
                    <p className="text-[#87919E] text-[10px] uppercase tracking-wide">
                      {manager.role === 'ADMIN'
                        ? 'Administrador'
                        : manager.role === 'MANAGER'
                        ? 'Gestor'
                        : 'Analista'}
                    </p>
                  </div>
                  <span
                    className="ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {manager.clientCount} conta{manager.clientCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Métricas */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#87919E]">Clientes com meta batida</span>
                    <span className="text-[#22C55E] font-semibold">{manager.goalsHit}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#87919E]">Clientes sem meta</span>
                    <span className="text-[#EF4444] font-semibold">{manager.goalsOff}</span>
                  </div>
                </div>

                {/* Barra de progresso */}
                <div className="w-full bg-[#38435C] rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: `${hitPct}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <p className="text-[10px] text-[#87919E] mt-1">{hitPct}% das metas batidas</p>
              </button>
            )
          })}
        </div>

        {/* Donut chart */}
        <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl p-4 flex flex-col items-center justify-center">
          <p className="text-xs font-semibold text-[#87919E] uppercase tracking-wide mb-4">
            Distribuição de clientes
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: '#0A1E2C',
                  border: '1px solid #38435C',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#EBEBEB',
                }}
                formatter={(value) => [
                  `${value} cliente${Number(value) !== 1 ? 's' : ''}`,
                  '',
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="w-full space-y-1.5 mt-2">
            {donutData.map((entry) => {
              const pct =
                totalClients > 0
                  ? Math.round((entry.value / totalClients) * 100)
                  : 0
              return (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-[#87919E] truncate flex-1">{entry.name}</span>
                  <span className="text-[#87919E]">({pct}%)</span>
                  <span className="text-[#EBEBEB] font-medium">{entry.value}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Filtro por gestor */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedManager(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !selectedManager
                ? 'bg-[#95BBE2]/15 text-[#95BBE2]'
                : 'text-[#87919E] hover:text-[#EBEBEB]'
            }`}
          >
            Todos
          </button>
          {managers.map((m, i) => (
            <button
              key={m.id}
              onClick={() =>
                setSelectedManager(selectedManager === m.id ? null : m.id)
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedManager === m.id
                  ? 'text-white'
                  : 'text-[#87919E] hover:text-[#EBEBEB]'
              }`}
              style={
                selectedManager === m.id
                  ? {
                      backgroundColor:
                        MANAGER_COLORS[i % MANAGER_COLORS.length] + '30',
                      color: MANAGER_COLORS[i % MANAGER_COLORS.length],
                    }
                  : undefined
              }
            >
              {m.name}{' '}
              <span className="opacity-60">{m.clientCount}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-[#38435C] mx-1" />

        {/* Filtro por status */}
        {(['ALL', 'OTIMO', 'REGULAR', 'RUIM'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-[#38435C] text-[#EBEBEB]'
                : 'text-[#87919E] hover:text-[#EBEBEB]'
            }`}
          >
            {s !== 'ALL' && <span>{STATUS_ICONS[s]}</span>}
            {s === 'ALL' ? 'Todos' : STATUS_LABELS[s]}
          </button>
        ))}

        <span className="ml-auto text-xs text-[#87919E]">
          {filteredClients.length} conta{filteredClients.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────────── */}
      <div className="bg-[#0A1E2C] border border-[#38435C] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#38435C]">
              {['#', 'Cliente', 'Gestor', 'Plataformas', 'Metas batidas', 'Status'].map(
                (h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-semibold text-[#87919E] uppercase tracking-wide"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filteredClients.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[#87919E] text-sm"
                >
                  Nenhum cliente encontrado com esses filtros.
                </td>
              </tr>
            ) : (
              filteredClients.map((client, idx) => {
                const managerIdx = managers.findIndex((m) => m.id === client.managerId)
                const color = MANAGER_COLORS[managerIdx % MANAGER_COLORS.length]
                const status = client.overallStatus

                return (
                  <tr
                    key={client.id}
                    className="border-b border-[#38435C]/50 hover:bg-[#38435C]/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-[#87919E] text-xs">{idx + 1}</td>

                    <td className="px-4 py-3">
                      <Link
                        href={`/clients/${client.slug}`}
                        className="text-[#EBEBEB] font-medium hover:text-[#95BBE2] transition-colors"
                      >
                        {client.name}
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className="text-xs font-medium"
                        style={{ color }}
                      >
                        {client.managerName}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {client.platforms.length === 0 ? (
                          <span className="text-[#87919E] text-xs">—</span>
                        ) : (
                          client.platforms.map((p) => (
                            <span
                              key={p}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[#38435C] text-[#87919E]"
                            >
                              {p === 'META_ADS' ? 'Meta' : p === 'GA4' ? 'GA4' : p}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {client.goalsTotal === 0 ? (
                        <span className="text-[#87919E] text-xs">Sem metas</span>
                      ) : (
                        <span className="text-xs text-[#EBEBEB]">
                          {client.goalsHit}/{client.goalsTotal}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {status ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            healthBgClasses[status as HealthStatus]
                          }`}
                        >
                          {STATUS_ICONS[status]} {healthLabels[status as HealthStatus]}
                        </span>
                      ) : (
                        <span className="text-[#87919E] text-xs">Sem dados</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

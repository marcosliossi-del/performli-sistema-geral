'use client'

import { useActionState, useState } from 'react'
import { portalLogin } from '@/app/actions/portalAuth'
import { Eye, EyeOff } from 'lucide-react'

const initialState: { error?: string } = {}

export function PortalLoginForm() {
  const [state, formAction, pending] = useActionState(portalLogin, initialState)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="w-full max-w-sm px-4">
      <div className="mb-8 text-center">
        <span className="text-2xl font-bold tracking-tight text-[#EBEBEB]">
          Ark<span className="text-[#95BBE2]">za</span>
        </span>
        <p className="mt-2 text-sm text-[#87919E]">
          Acompanhe os resultados da sua loja
        </p>
      </div>

      <div className="rounded-2xl border border-[#38435C] bg-[#0A1E2C] p-6 shadow-[0_20px_60px_-24px_rgba(0,0,0,0.7)]">
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="portal-email"
              className="text-xs font-medium uppercase tracking-wider text-[#87919E]"
            >
              E-mail
            </label>
            <input
              id="portal-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="voce@sualoja.com.br"
              className="h-11 w-full rounded-lg border border-[#38435C] bg-[#05141C] px-3 text-sm text-[#EBEBEB] placeholder-[#87919E] transition-colors focus:border-[#95BBE2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="portal-password"
              className="text-xs font-medium uppercase tracking-wider text-[#87919E]"
            >
              Senha
            </label>
            <div className="relative">
              <input
                id="portal-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="h-11 w-full rounded-lg border border-[#38435C] bg-[#05141C] px-3 pr-11 text-sm text-[#EBEBEB] placeholder-[#87919E] transition-colors focus:border-[#95BBE2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87919E] transition-colors hover:text-[#EBEBEB] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 rounded"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {state?.error && (
            <div
              role="alert"
              className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2"
            >
              <p className="text-xs text-[#EF4444]">{state.error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-1 h-11 w-full rounded-xl bg-gradient-to-b from-[#54e0ee] to-[#22c2d6] text-sm font-semibold text-[#021015] shadow-[0_6px_18px_-6px_rgba(34,194,214,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-all hover:brightness-[1.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#95BBE2]/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-[#87919E]/60">
        Acesso fornecido pela Arkza. Em caso de dúvida, fale com seu gestor.
      </p>
    </div>
  )
}

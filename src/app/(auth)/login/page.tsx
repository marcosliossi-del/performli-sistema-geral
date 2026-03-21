'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Credenciais inválidas')
      } else {
        window.location.href = '/dashboard'
      }
    } catch {
      setError('Erro ao conectar com o servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#05141C] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-4">
            <path d="M50 5L90 28V72L50 95L10 72V28L50 5Z" fill="none" stroke="#95BBE2" strokeWidth="5"/>
            <path d="M50 5L50 50M50 50L90 28M50 50L10 28" stroke="#95BBE2" strokeWidth="3.5"/>
            <path d="M50 50L50 95" stroke="#95BBE2" strokeWidth="3.5" strokeDasharray="6 4"/>
          </svg>
          <h1 className="text-2xl font-bold text-[#EBEBEB] tracking-tight">
            Perform<span className="italic font-normal text-[#95BBE2]">li</span>
          </h1>
          <p className="text-[#87919E] text-sm mt-1">Gestão Operacional</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#87919E] uppercase tracking-wider">
              Usuário
            </label>
            <Input
              name="email"
              type="email"
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[#87919E] uppercase tracking-wider">
              Senha
            </label>
            <div className="relative">
              <Input
                name="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#87919E] hover:text-[#EBEBEB] transition-colors"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg px-3 py-2">
              <p className="text-[#EF4444] text-xs">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-2"
            size="lg"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>

        <p className="text-center text-[#87919E]/40 text-xs mt-8">
          Performli © 2025 — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}

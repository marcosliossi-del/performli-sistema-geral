import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Performli — Gestão Operacional',
  description: 'Central de controle de saúde e performance dos clientes da Performli.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}

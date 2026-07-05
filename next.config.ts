import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a todas as respostas.
// CSP fica de fora por ora (alto risco de quebrar estilos/scripts inline do Next);
// tratada como item separado de backlog.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  // Chromium headless (gerador de proposta): usa @sparticuz/chromium-min (sem
  // binário local) e baixa o pack completo (com libnss3) em runtime — evita o
  // problema do tracer do Next não empacotar os packs brotli. Externaliza p/
  // resolver em node_modules.
  serverExternalPackages: ['@sparticuz/chromium-min', 'puppeteer-core'],
  // Só o template precisa ser rastreado para a função (o Chromium vem por download).
  outputFileTracingIncludes: {
    '/api/comercial/proposta/pdf': ['./public/comercial/proposta-template.html'],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@anthropic-ai/sdk'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
};

export default nextConfig;

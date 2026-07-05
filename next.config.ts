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
  // Chromium headless (gerador de proposta): NÃO empacotar — o Next quebraria a
  // localização do binário do Chromium. Externaliza p/ resolver em node_modules.
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  // Garante que o template E os binários do Chromium (libnss3 etc., carregados via
  // fs pela lib — o tracer do Next não os detecta) acompanhem a função serverless.
  outputFileTracingIncludes: {
    '/api/comercial/proposta/pdf': [
      './public/comercial/proposta-template.html',
      './node_modules/@sparticuz/chromium/bin/**',
    ],
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@anthropic-ai/sdk'],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
};

export default nextConfig;

import { APP_URL } from './email'

const BRAND = {
  meianoite: '#05141C',
  classico: '#38435C',
  ceu: '#95BBE2',
  nanquim: '#87919E',
  brancoDama: '#EBEBEB',
}

function baseLayout(content: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Performli</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.meianoite};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.meianoite};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Logo / Header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <span style="font-size:22px;font-weight:800;color:${BRAND.ceu};letter-spacing:-0.5px;">Performli</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#0A1E2C;border:1px solid ${BRAND.classico};border-radius:16px;padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;">
              <p style="margin:0;font-size:11px;color:${BRAND.nanquim};">
                Você recebeu este e-mail porque é gestor de um cliente na plataforma Performli.<br/>
                <a href="${APP_URL}" style="color:${BRAND.ceu};text-decoration:none;">Acessar plataforma</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Alert: metric dropped ─────────────────────────────────────────────────────

export function alertDroppedEmail(opts: {
  clientName: string
  clientSlug: string
  metricLabel: string
  newStatus: 'RUIM' | 'REGULAR'
  actualValue: string
  targetValue: string
  achievementPct: number
}) {
  const statusColor = opts.newStatus === 'RUIM' ? '#EF4444' : '#F59E0B'
  const statusLabel = opts.newStatus === 'RUIM' ? 'Ruim' : 'Regular'
  const clientUrl = `${APP_URL}/clients/${opts.clientSlug}`

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${BRAND.brancoDama};">
      Alerta de saúde do cliente
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:${BRAND.nanquim};">
      ${opts.clientName} · ${opts.metricLabel}
    </p>

    <div style="background-color:${statusColor}18;border:1px solid ${statusColor}40;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;color:${BRAND.nanquim};">Status atual</p>
      <p style="margin:0;font-size:22px;font-weight:800;color:${statusColor};">${statusLabel}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:12px;background-color:#0D2235;border-radius:10px;text-align:center;width:50%;">
          <p style="margin:0 0 2px;font-size:11px;color:${BRAND.nanquim};">Realizado</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND.brancoDama};">${opts.actualValue}</p>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px;background-color:#0D2235;border-radius:10px;text-align:center;width:50%;">
          <p style="margin:0 0 2px;font-size:11px;color:${BRAND.nanquim};">Meta</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:${BRAND.brancoDama};">${opts.targetValue}</p>
        </td>
      </tr>
    </table>

    <div style="background-color:#0D2235;border-radius:10px;padding:12px 16px;margin-bottom:28px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:12px;color:${BRAND.nanquim};">Atingimento da meta</span>
        <span style="font-size:12px;font-weight:700;color:${statusColor};">${opts.achievementPct}%</span>
      </div>
      <div style="background-color:${BRAND.classico};border-radius:99px;height:6px;">
        <div style="background-color:${statusColor};border-radius:99px;height:6px;width:${Math.min(opts.achievementPct, 100)}%;"></div>
      </div>
    </div>

    <a href="${clientUrl}" style="display:block;background-color:${BRAND.ceu};color:${BRAND.meianoite};text-decoration:none;text-align:center;font-weight:700;font-size:14px;padding:14px;border-radius:12px;">
      Ver cliente →
    </a>
  `

  return baseLayout(content)
}

// ─── Alert: metric improved ────────────────────────────────────────────────────

export function alertImprovedEmail(opts: {
  clientName: string
  clientSlug: string
  metricLabel: string
  actualValue: string
  achievementPct: number
}) {
  const clientUrl = `${APP_URL}/clients/${opts.clientSlug}`

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${BRAND.brancoDama};">
      Meta atingida! 🎉
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:${BRAND.nanquim};">
      ${opts.clientName} · ${opts.metricLabel}
    </p>

    <div style="background-color:#22C55E18;border:1px solid #22C55E40;border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:12px;color:${BRAND.nanquim};">Realizado</p>
      <p style="margin:0;font-size:28px;font-weight:800;color:#22C55E;">${opts.actualValue}</p>
      <p style="margin:4px 0 0;font-size:12px;color:#22C55E;">${opts.achievementPct}% da meta ✓</p>
    </div>

    <a href="${clientUrl}" style="display:block;background-color:${BRAND.ceu};color:${BRAND.meianoite};text-decoration:none;text-align:center;font-weight:700;font-size:14px;padding:14px;border-radius:12px;">
      Ver cliente →
    </a>
  `

  return baseLayout(content)
}

// ─── Alert: sync failed ────────────────────────────────────────────────────────

export function syncFailedEmail(opts: {
  clientName: string
  clientSlug: string
  platform: string
  errorMessage: string
}) {
  const clientUrl = `${APP_URL}/clients/${opts.clientSlug}`

  const content = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:${BRAND.brancoDama};">
      Falha na sincronização
    </h2>
    <p style="margin:0 0 24px;font-size:14px;color:${BRAND.nanquim};">
      ${opts.clientName} · ${opts.platform}
    </p>

    <div style="background-color:#EF444418;border:1px solid #EF444440;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:12px;color:${BRAND.nanquim};">Erro</p>
      <p style="margin:0;font-size:13px;color:#EF4444;font-family:monospace;">${opts.errorMessage}</p>
    </div>

    <a href="${clientUrl}" style="display:block;background-color:${BRAND.ceu};color:${BRAND.meianoite};text-decoration:none;text-align:center;font-weight:700;font-size:14px;padding:14px;border-radius:12px;">
      Ver cliente →
    </a>
  `

  return baseLayout(content)
}

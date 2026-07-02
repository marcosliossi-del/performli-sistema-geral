/**
 * Converte data de <input type="date"> ('YYYY-MM-DD') para meio-dia UTC:
 * meia-noite UTC vira 21h do dia ANTERIOR em America/Sao_Paulo (off-by-one,
 * D-006); meio-dia UTC cai no MESMO dia em qualquer fuso ±12. Strings com hora
 * (datetime completo) passam direto.
 */
export function parseDateInput(s: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : new Date(s)
}

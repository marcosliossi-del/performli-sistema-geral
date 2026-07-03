import { redirect } from 'next/navigation'

// O Cockpit virou a TELA ÚNICA da agência (opção A). O antigo Painel Analítico
// foi absorvido pelo /cockpit; esta rota só redireciona para não quebrar links.
export default function DashboardPage() {
  redirect('/cockpit')
}

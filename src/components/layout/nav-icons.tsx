'use client'

/**
 * Mapa `icon:string` (nome lucide vindo da árvore de navegação editável, ver
 * `nav-tree-shared.ts`) → componente `LucideIcon`. A árvore atravessa
 * server→client como dados puros (string); a UI resolve o componente aqui.
 * Fallbacks: `Folder` para GROUP, `Circle` para LEAF (nunca quebra o render se
 * o ADMIN criar uma pasta com um ícone que ainda não mapeamos).
 */
import {
  Gauge,
  Sun,
  ShieldCheck,
  FileText,
  ListTodo,
  CheckSquare,
  Users,
  UserPlus,
  BookOpen,
  ShieldAlert,
  BarChart3,
  Bot,
  Bell,
  PieChart,
  Activity,
  Building2,
  Kanban,
  BookMarked,
  TrendingUp,
  Target,
  Scale,
  MessagesSquare,
  Repeat,
  Headset,
  KeyRound,
  Folder,
  Circle,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  Gauge,
  Sun,
  ShieldCheck,
  FileText,
  ListTodo,
  CheckSquare,
  Users,
  UserPlus,
  BookOpen,
  ShieldAlert,
  BarChart3,
  Bot,
  Bell,
  PieChart,
  Activity,
  Building2,
  Kanban,
  BookMarked,
  TrendingUp,
  Target,
  Scale,
  MessagesSquare,
  Repeat,
  Headset,
  KeyRound,
  Folder,
  Circle,
}

/** Resolve o ícone. `fallback` = 'group' → Folder; 'leaf' → Circle. */
export function navIcon(name: string | null, fallback: 'group' | 'leaf'): LucideIcon {
  if (name && ICONS[name]) return ICONS[name]
  return fallback === 'group' ? Folder : Circle
}

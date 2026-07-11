import { Suspense } from 'react'
import { PortalLoginForm } from '@/components/portal/PortalLoginForm'

export const dynamic = 'force-dynamic'

export default function PortalLoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
      <Suspense fallback={null}>
        <PortalLoginForm />
      </Suspense>
    </div>
  )
}

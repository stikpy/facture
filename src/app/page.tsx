'use client'

import { useAuth } from './providers'
import { AuthPage } from '@/components/auth/auth-page'
import { Dashboard } from '@/components/dashboard/dashboard'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

export default function Home() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return <Dashboard />
}
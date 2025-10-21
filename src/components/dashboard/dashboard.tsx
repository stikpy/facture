'use client'

import { useState } from 'react'
import { useAuth } from '@/app/providers'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { FileText, LogOut, Upload } from 'lucide-react'
import Link from 'next/link'

export function Dashboard() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'invoices'>('invoices')

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-primary" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900">
                Facture AI
              </h1>
              <Link href="/invoices" className="ml-4 text-sm text-primary hover:underline">
                Ouvrir la page Mes factures
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/import" className="hidden sm:inline-block">
                <Button size="sm">
                  <Upload className="h-4 w-4 mr-2" />
                  Importer
                </Button>
              </Link>
              <span className="text-sm text-gray-700">
                {user?.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Déconnexion
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation allégée */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex items-center text-sm text-gray-600">
          <span>Pour importer, allez sur</span>
          <Link href="/import" className="ml-1 text-primary hover:underline">Importer des factures</Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <InvoiceList />
      </main>
    </div>
  )
}

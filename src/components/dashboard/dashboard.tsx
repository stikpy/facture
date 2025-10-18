'use client'

import { useState } from 'react'
import { useAuth } from '@/app/providers'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/upload/file-upload'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { Upload, FileText, LogOut } from 'lucide-react'
import Link from 'next/link'

export function Dashboard() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'upload' | 'invoices'>('upload')

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

      {/* Navigation */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-8 mt-6">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center px-1 pt-1 border-b-2 font-medium text-sm ${
              activeTab === 'upload'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload de factures
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center px-1 pt-1 border-b-2 font-medium text-sm ${
              activeTab === 'invoices'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="h-4 w-4 mr-2" />
            Mes factures
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'upload' ? (
          <div className="space-y-8">
            <StatsCards />
            <FileUpload />
          </div>
        ) : (
          <InvoiceList />
        )}
      </main>
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { Insights } from '@/components/dashboard/insights'
import { FileText, LogOut, Upload } from 'lucide-react'
import Link from 'next/link'

export function Dashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const search = useSearchParams()
  const [activeTab, setActiveTab] = useState<'invoices'>('invoices')
  const now = useMemo(() => new Date(), [])
  const [range, setRange] = useState<'month' | '12m' | 'year'>((search.get('range') as any) || 'month')
  const [supplier, setSupplier] = useState<string>(search.get('supplier') || '')
  const [status, setStatus] = useState<'completed' | 'processing' | 'error' | ''>((search.get('status') as any) || '')
  const [year, setYear] = useState<number>(Number(search.get('year')) || now.getFullYear())
  const [month, setMonth] = useState<number>(Number(search.get('month')) || (now.getMonth() + 1))

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
  }

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('range', range)
    if (supplier) params.set('supplier', supplier)
    if (status) params.set('status', status)
    if (range === 'year' || range === 'month' || range === '12m') params.set('year', String(year))
    if (range === 'month' || range === '12m') params.set('month', String(month))
    const qs = params.toString()
    router.replace(`/` + (qs ? `?${qs}` : ''), { scroll: false })
  }, [range, supplier, status, year, month])

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

      {/* Bandeau CTA */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="text-sm text-blue-800">Importez vos nouvelles factures pour les traiter automatiquement.</div>
          <Link href="/import"><Button size="sm" variant="outline"><Upload className="h-4 w-4 mr-2"/>Importer</Button></Link>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Filtres */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <input
              value={supplier}
              onChange={(e)=>setSupplier(e.target.value)}
              placeholder="Filtrer fournisseur"
              className="border border-gray-300 rounded px-3 py-1.5 text-sm"
            />
            <select
              value={status}
              onChange={(e)=>setStatus(e.target.value as any)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="">Tous statuts</option>
              <option value="completed">Terminées</option>
              <option value="processing">En cours</option>
              <option value="error">Erreurs</option>
            </select>
            {(range === 'month' || range === '12m' || range === 'year') && (
              <select value={year} onChange={(e)=>setYear(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                {Array.from({ length: 6 }).map((_,i)=>{
                  const y = now.getFullYear() - i
                  return <option key={y} value={y}>{y}</option>
                })}
              </select>
            )}
            {(range === 'month' || range === '12m') && (
              <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                {Array.from({ length: 12 }).map((_,i)=>{
                  const m = i + 1
                  return <option key={m} value={m}>{String(m).padStart(2,'0')}</option>
                })}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
          <button onClick={() => setRange('month')} className={`px-3 py-1.5 text-sm rounded border ${range==='month'?'bg-blue-50 border-blue-200 text-blue-700':'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>Mois courant</button>
          <button onClick={() => setRange('12m')} className={`px-3 py-1.5 text-sm rounded border ${range==='12m'?'bg-blue-50 border-blue-200 text-blue-700':'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>12 mois</button>
          <button onClick={() => setRange('year')} className={`px-3 py-1.5 text-sm rounded border ${range==='year'?'bg-blue-50 border-blue-200 text-blue-700':'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>Année</button>
          </div>
        </div>

        {/* KPI */}
        <StatsCards filters={{...computeFilters(range, year, month), supplier: supplier || undefined, status: status || undefined}} />
        {/* Insights */}
        <Insights filters={{...computeFilters(range, year, month), supplier: supplier || undefined, status: status || undefined}} />
        {/* Liste récente */}
        <InvoiceList from={computeFilters(range, year, month).from} to={computeFilters(range, year, month).to} />
      </main>
    </div>
  )
}

function computeFilters(range: 'month' | '12m' | 'year', year?: number, month?: number) {
  const now = new Date()
  const y = year || now.getFullYear()
  const m = month ? month - 1 : now.getMonth()
  const to = new Date(y, m + (range==='12m'?12:1), 0).toISOString().slice(0,10)
  if (range === 'month') {
    const fromDate = new Date(y, m, 1)
    const from = fromDate.toISOString().slice(0,10)
    return { from, to, group: 'day' as const }
  }
  if (range === '12m') {
    const fromDate = new Date(y, m - 11, 1)
    const from = fromDate.toISOString().slice(0,10)
    return { from, to, group: 'month' as const }
  }
  // year
  const fromDate = new Date(y, 0, 1)
  const from = fromDate.toISOString().slice(0,10)
  return { from, to, group: 'month' as const }
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { FileText, CheckCircle, Clock, AlertCircle, TrendingUp, Users } from 'lucide-react'

interface Stats {
  total: number
  completed: number
  processing: number
  error: number
}

type Filters = { from?: string; to?: string; group?: 'day' | 'month'; supplier?: string; status?: 'completed' | 'processing' | 'error' }

export function StatsCards({ filters }: { filters?: Filters }) {
  const [stats, setStats] = useState<Stats>({ total: 0, completed: 0, processing: 0, error: 0 })
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<{ monthTotal?: number; topSupplier?: string; categoryTop?: string }>({})

  useEffect(() => {
    const supabase = createClient()
    
    const fetchStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('invoices')
          .select('status')
          .eq('user_id', user.id)

        if (error) throw error

        const statsData = data.reduce((acc, invoice) => {
          acc.total++
          acc[invoice.status as keyof Stats]++
          return acc
        }, { total: 0, completed: 0, processing: 0, error: 0 } as Stats)

        setStats(statsData)

        // Résumé via API stats
        try {
          const qs = new URLSearchParams()
          if (filters?.group) qs.set('group', filters.group)
          if (filters?.from) qs.set('from', filters.from)
          if (filters?.to) qs.set('to', filters.to)
          if (filters?.supplier) qs.set('supplier', filters.supplier)
          if (filters?.status) qs.set('status', filters.status)
          const res = await fetch(`/api/stats?${qs.toString()}`)
          if (res.ok) {
            const json = await res.json()
            const lastPeriod = (json.byGroup || []).slice(-1)[0]
            const top = (json.bySupplier || [])[0]
            const topCat = (json.byCategory || [])[0]
            setSummary({ monthTotal: lastPeriod?.total, topSupplier: top?.supplier, categoryTop: topCat?.category })
          }
        } catch {}
      } catch (error) {
        console.error('Erreur lors du chargement des statistiques:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [filters])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: 'Total factures',
      value: stats.total,
      icon: FileText,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      extra: summary.monthTotal !== undefined ? `Période en cours: ${summary.monthTotal?.toFixed(2)} €` : undefined
    },
    {
      title: 'Traitées',
      value: stats.completed,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50'
    },
    {
      title: 'En cours',
      value: stats.processing,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      extra: summary.topSupplier ? `Top fournisseur: ${summary.topSupplier}` : undefined
    },
    {
      title: 'Erreurs',
      value: stats.error,
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div key={index} className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-6 w-6 ${card.color}`} />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">{card.title}</p>
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              {card.extra && (
                <p className="text-xs text-gray-500 mt-1">{card.extra}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

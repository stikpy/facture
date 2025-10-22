'use client'

import { useEffect, useMemo, useState } from 'react'

type SeriesPoint = { period: string; total: number }
type SupplierRow = { supplier: string; total: number; count: number }

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

type Filters = { from?: string; to?: string; group?: 'day' | 'month'; supplier?: string; status?: 'completed' | 'processing' | 'error' }

export function Insights({ filters }: { filters?: Filters }) {
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const qs = new URLSearchParams()
        if (filters?.group) qs.set('group', filters.group)
        if (filters?.from) qs.set('from', filters.from)
        if (filters?.to) qs.set('to', filters.to)
        if (filters?.supplier) qs.set('supplier', filters.supplier)
        if (filters?.status) qs.set('status', filters.status)
        const res = await fetch(`/api/stats?${qs.toString()}`)
        if (!res.ok) return
        const json = await res.json()
        if (!mounted) return
        const s: SeriesPoint[] = (json.byGroup || []).map((r: any) => ({ period: r.period, total: Number(r.total || 0) }))
        const last12 = s.slice(-12)
        setSeries(last12)
        setSuppliers(((json.bySupplier || []) as any[]).slice(0, 5).map(r => ({ supplier: String(r.supplier || 'Inconnu'), total: Number(r.total || 0), count: Number(r.count || 0) })))
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [filters])

  const spark = useMemo(() => {
    if (!series.length) return { path: '', min: 0, max: 0 }
    const values = series.map(p => p.total)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const width = 220
    const height = 60
    const dx = width / Math.max(1, series.length - 1)
    const scaleY = (v: number) => {
      if (max === min) return height / 2
      return height - ((v - min) / (max - min)) * height
    }
    const d = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * dx} ${scaleY(p.total)}`).join(' ')
    return { path: d, min, max }
  }, [series])

  // Month-by-month normalized series for a bar chart when group is 'month'
  const monthly = useMemo(() => {
    if (!series.length) return { labels: [] as string[], values: [] as number[], max: 0 }
    // Build a map YYYY-MM -> total
    const map = new Map<string, number>()
    for (const p of series) map.set(p.period, (map.get(p.period) || 0) + Number(p.total || 0))

    // If a yearly view is requested, make sure we output 12 months with 0 for missing
    let labels: string[] = []
    let values: number[] = []
    if (filters?.group === 'month' && filters?.from && filters?.to) {
      const start = new Date(filters.from)
      const end = new Date(filters.to)
      const yStart = start.getFullYear()
      const yEnd = end.getFullYear()
      if (yStart === yEnd) {
        for (let m = 0; m < 12; m++) {
          const key = `${yStart}-${String(m + 1).padStart(2, '0')}`
          labels.push(String(m + 1).padStart(2, '0'))
          values.push(map.get(key) || 0)
        }
      }
    }
    if (!labels.length) {
      // Fallback: use whatever periods are present
      labels = series.map(s => s.period)
      values = series.map(s => s.total)
    }
    const max = Math.max(0, ...values)
    return { labels, values, max }
  }, [series, filters?.group, filters?.from, filters?.to])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Courbe dépenses */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Dépenses</h3>
          {!loading && series.length > 0 && (
            <div className="text-xs text-gray-500">{series[0].period} → {series[series.length - 1].period}</div>
          )}
        </div>
        {loading ? (
          <div className="h-16 bg-gray-100 animate-pulse rounded" />
        ) : series.length === 0 ? (
          <div className="text-sm text-gray-500">Aucune donnée</div>
        ) : filters?.group === 'month' ? (
          // Bar chart for month-by-month
          <svg viewBox="0 0 240 90" className="w-full h-24">
            {monthly.values.map((v, i) => {
              const barW = 240 / Math.max(12, monthly.values.length)
              const h = monthly.max > 0 ? (v / monthly.max) * 70 : 0
              const x = i * barW + 2
              const y = 80 - h
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barW - 4} height={h} fill="#2563eb" opacity={0.8} />
                  {/* month label */}
                  <text x={x + (barW - 4) / 2} y={88} textAnchor="middle" fontSize="8" fill="#6b7280">{monthly.labels[i]}</text>
                </g>
              )
            })}
          </svg>
        ) : (
          // Sparkline for recent periods (days or custom chunks)
          <svg viewBox="0 0 220 60" className="w-full h-16">
            <path d={spark.path} fill="none" stroke="#2563eb" strokeWidth="2" />
          </svg>
        )}
      </div>

      {/* Top fournisseurs */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top fournisseurs</h3>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun fournisseur</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {suppliers.map((s, i) => (
              <li key={i} className="py-2 flex items-center justify-between text-sm">
                <div className="truncate mr-2">
                  <span className="text-gray-900">{s.supplier}</span>
                  <span className="text-gray-400 ml-2">×{s.count}</span>
                </div>
                <div className="font-medium text-gray-900">{formatCurrency(s.total)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}



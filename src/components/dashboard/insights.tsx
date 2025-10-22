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
  const [hoveredBar, setHoveredBar] = useState<{ index: number; x: number; y: number; text: string } | null>(null)

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
        console.log('[INSIGHTS] /api/stats payload:', json)
        if (!mounted) return
        const s: SeriesPoint[] = (json.byGroup || []).map((r: any) => ({ period: r.period, total: Number(r.total || 0) }))
        console.log('[INSIGHTS] series (byGroup):', s)
        const last12 = s.slice(-12)
        setSeries(last12)
        const sup = ((json.bySupplier || []) as any[]).slice(0, 5).map(r => ({ supplier: String(r.supplier || 'Inconnu'), total: Number(r.total || 0), count: Number(r.count || 0) }))
        console.log('[INSIGHTS] top suppliers:', sup)
        setSuppliers(sup)
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
    console.log('[INSIGHTS] monthly: building from series:', series)
    // Build a map YYYY-MM -> total
    const map = new Map<string, number>()
    const normalize = (per: string) => {
      const m = (per || '').match(/^(\d{4})-(\d{1,2})/)
      if (!m) return per
      return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
    }
    for (const p of series) {
      const key = normalize(p.period)
      const val = Number(p.total || 0)
      console.log(`[INSIGHTS] map.set("${key}", ${val})`)
      map.set(key, (map.get(key) || 0) + val)
    }
    console.log('[INSIGHTS] monthly map:', Object.fromEntries(map))

    // Si group='month', on affiche TOUJOURS les 12 mois de janvier à décembre
    let labels: string[] = []
    let values: number[] = []
    if (filters?.group === 'month') {
      // Déterminer l'année de référence à partir des données réelles (map keys)
      const baseYear = (() => {
        // D'abord, chercher l'année dans les données réelles
        if (map.size > 0) {
          const firstKey = Array.from(map.keys())[0]
          const y = Number(firstKey.split('-')[0])
          console.log('[INSIGHTS] baseYear from map keys:', y)
          return y
        }
        // Sinon, utiliser filters.from
        if (filters?.from) {
          const y = new Date(filters.from).getFullYear()
          console.log('[INSIGHTS] baseYear from filters.from:', y)
          return y
        }
        // Sinon, utiliser series[0].period
        if (series.length > 0 && series[0].period) {
          const y = Number(series[0].period.split('-')[0])
          console.log('[INSIGHTS] baseYear from series[0].period:', y)
          return y
        }
        // Fallback: année courante
        const y = new Date().getFullYear()
        console.log('[INSIGHTS] baseYear fallback:', y)
        return y
      })()
      // Générer la séquence complète : janvier (01) → décembre (12)
      const seq = Array.from({ length: 12 }, (_, i) => `${baseYear}-${String(i + 1).padStart(2, '0')}`)
      console.log('[INSIGHTS] seq:', seq)
      labels = seq.map(k => k.slice(5)) // '01', '02', ..., '12'
      values = seq.map(k => {
        // Chercher d'abord avec zéro initial
        const v = map.get(k)
        if (v !== undefined) {
          console.log(`[INSIGHTS] Found ${k}: ${v}`)
          return v
        }
        // Essayer sans zéro initial (ex: 2025-3)
        const month = Number(k.slice(5))
        const alt = `${baseYear}-${month}`
        const altV = map.get(alt)
        if (altV !== undefined) {
          console.log(`[INSIGHTS] Found ${alt}: ${altV}`)
          return altV
        }
        console.log(`[INSIGHTS] Not found ${k} or ${alt}: 0`)
        return 0
      })
      console.log('[INSIGHTS] monthly labels/values (forced 12 months):', labels, values)
    } else {
      // Fallback: use whatever periods are present
      if (series.length > 0) {
        labels = series.map(s => (s.period || '').slice(5))
        values = series.map(s => s.total)
      }
    }
    const max = Math.max(0, ...values)
    console.log('[INSIGHTS] monthly max:', max)
    return { labels, values, max }
  }, [series, filters?.group, filters?.from])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Courbe dépenses */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Dépenses</h3>
          {!loading && series.length > 0 && (
            <div className="text-xs text-gray-500">{series[0].period} → {series[series.length - 1].period} (basé sur la date document)</div>
          )}
        </div>
        {loading ? (
          <div className="h-40 bg-gray-100 animate-pulse rounded" />
        ) : series.length === 0 ? (
          <div className="text-sm text-gray-500">Aucune donnée</div>
        ) : filters?.group === 'month' ? (
          // Bar chart for month-by-month (plus grand)
          <div className="relative">
            <svg viewBox="0 0 720 240" className="w-full h-60">
              {/* axe X */}
              <line x1="0" y1="210" x2="720" y2="210" stroke="#e5e7eb" strokeWidth="1" />
              {monthly.values.map((v, i) => {
                const barW = Math.max(24, 720 / Math.max(1, monthly.values.length))
                const h = monthly.max > 0 ? (v / monthly.max) * 170 : 0
                const x = i * barW + 6
                const isZero = v === 0
                const hDraw = isZero ? 16 : Math.max(2, h)
                const y = 210 - hDraw
                const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
                const monthName = monthNames[i] || monthly.labels[i]
                const tooltipText = `${monthName}: ${formatCurrency(v)}`
                return (
                  <g 
                    key={i}
                    onMouseEnter={() => setHoveredBar({ index: i, x: x + (barW - 12) / 2, y: y - 10, text: tooltipText })}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <rect 
                      x={x} 
                      y={y} 
                      width={barW - 12} 
                      height={hDraw} 
                      fill={isZero ? '#e5e7eb' : '#2563eb'} 
                      opacity={isZero ? 1 : 0.85} 
                      rx={3} 
                      stroke={isZero ? '#cbd5e1' : 'none'} 
                      style={{ cursor: 'pointer' }}
                    />
                    {/* month label */}
                    <text x={x + (barW - 12) / 2} y={228} textAnchor="middle" fontSize="10" fill="#6b7280">{monthly.labels[i]}</text>
                  </g>
                )
              })}
              {/* Tooltip SVG */}
              {hoveredBar && (
                <g>
                  <rect 
                    x={hoveredBar.x - 60} 
                    y={hoveredBar.y - 30} 
                    width="120" 
                    height="24" 
                    fill="#1f2937" 
                    rx="4" 
                    opacity="0.95"
                  />
                  <text 
                    x={hoveredBar.x} 
                    y={hoveredBar.y - 13} 
                    textAnchor="middle" 
                    fontSize="11" 
                    fill="white" 
                    fontWeight="500"
                  >
                    {hoveredBar.text}
                  </text>
                </g>
              )}
            </svg>
          </div>
        ) : (
          // Sparkline for recent periods (days or custom chunks), plus grand
          <svg viewBox="0 0 660 180" className="w-full h-44">
            <path d={spark.path.replace(/\d+(?=\s)/g, (m) => String((Number(m) / 220) * 660)).replace(/(?<=\s)\d+(?![\d\s])/g, (m) => String((Number(m) / 60) * 120))} fill="none" stroke="#2563eb" strokeWidth="2.5" />
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



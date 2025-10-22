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

  // Barres pour mois (group='month') ou jours (group='day')
  const barData = useMemo(() => {
    console.log('[INSIGHTS] barData: building from series:', series)
    let labels: string[] = []
    let values: number[] = []
    
    if (filters?.group === 'month') {
      // Pour l'année : afficher les 12 mois
      const map = new Map<string, number>()
      const normalize = (per: string) => {
        const m = (per || '').match(/^(\d{4})-(\d{1,2})/)
        if (!m) return per
        return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
      }
      for (const p of series) {
        const key = normalize(p.period)
        map.set(key, (map.get(key) || 0) + Number(p.total || 0))
      }
      
      const baseYear = (() => {
        if (map.size > 0) return Number(Array.from(map.keys())[0].split('-')[0])
        if (filters?.from) return new Date(filters.from).getFullYear()
        if (series.length > 0 && series[0].period) return Number(series[0].period.split('-')[0])
        return new Date().getFullYear()
      })()
      
      const seq = Array.from({ length: 12 }, (_, i) => `${baseYear}-${String(i + 1).padStart(2, '0')}`)
      labels = seq.map(k => k.slice(5))
      values = seq.map(k => map.get(k) || map.get(`${baseYear}-${Number(k.slice(5))}`) || 0)
    } else if (filters?.group === 'day') {
      // Pour le mois : afficher tous les jours du mois
      const map = new Map<string, number>()
      for (const p of series) {
        map.set(p.period, Number(p.total || 0))
      }
      
      // Générer tous les jours du mois
      if (filters?.from && filters?.to) {
        const start = new Date(filters.from)
        const end = new Date(filters.to)
        const days: string[] = []
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10)
          days.push(key)
        }
        labels = days.map(d => d.slice(8)) // '01', '02', ..., '31'
        values = days.map(d => map.get(d) || 0)
      } else {
        // Fallback: utiliser les données présentes
        labels = series.map(s => (s.period || '').slice(8))
        values = series.map(s => s.total)
      }
    }
    
    const max = Math.max(0, ...values)
    console.log('[INSIGHTS] barData labels/values/max:', labels, values, max)
    return { labels, values, max }
  }, [series, filters?.group, filters?.from, filters?.to])

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
        ) : (
          // Bar chart (mois ou jours selon le filtre)
          <div className="relative">
            <svg viewBox="-80 0 800 240" className="w-full h-60">
              {/* Axe Y - repères de valeurs */}
              {barData.max > 0 && (() => {
                // Calculer des tranches rondes
                const max = barData.max
                const rawStep = max / 4
                const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
                const normalized = rawStep / magnitude
                let niceStep
                if (normalized <= 1) niceStep = magnitude
                else if (normalized <= 2) niceStep = 2 * magnitude
                else if (normalized <= 5) niceStep = 5 * magnitude
                else niceStep = 10 * magnitude
                
                const niceMax = Math.ceil(max / niceStep) * niceStep
                const ticks = [0, niceStep, niceStep * 2, niceStep * 3, niceMax]
                
                return ticks.map((value, idx) => {
                  const y = 210 - ((value / niceMax) * 170)
                  const label = value >= 1000 
                    ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1).replace('.', ',')} k€`
                    : `${Math.round(value)} €`
                  return (
                    <g key={idx}>
                      <line x1="0" y1={y} x2="720" y2={y} stroke="#f3f4f6" strokeWidth="1" strokeDasharray={value === 0 ? '0' : '4 2'} />
                      <text x="-5" y={y + 3} fontSize="10" fill="#6b7280" fontWeight="400" textAnchor="end">
                        {label}
                      </text>
                    </g>
                  )
                })
              })()}
              {/* axe X */}
              <line x1="0" y1="210" x2="720" y2="210" stroke="#e5e7eb" strokeWidth="1" />
              {(() => {
                // Calculer niceMax pour les barres
                const max = barData.max
                const rawStep = max / 4
                const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
                const normalized = rawStep / magnitude
                let niceStep
                if (normalized <= 1) niceStep = magnitude
                else if (normalized <= 2) niceStep = 2 * magnitude
                else if (normalized <= 5) niceStep = 5 * magnitude
                else niceStep = 10 * magnitude
                const niceMax = Math.ceil(max / niceStep) * niceStep
                
                return barData.values.map((v, i) => {
                  const barW = Math.max(filters?.group === 'day' ? 12 : 24, 720 / Math.max(1, barData.values.length))
                  const h = niceMax > 0 ? (v / niceMax) * 170 : 0
                  const x = i * barW + 6
                  const isZero = v === 0
                  const hDraw = isZero ? 16 : Math.max(2, h)
                  const y = 210 - hDraw
                  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
                  
                  // Générer le label pour le tooltip
                  let tooltipLabel = ''
                  if (filters?.group === 'month') {
                    tooltipLabel = monthNames[i] || barData.labels[i]
                  } else if (filters?.group === 'day' && filters?.from) {
                    // Pour les jours, afficher "21 octobre"
                    const date = new Date(filters.from)
                    date.setDate(date.getDate() + i)
                    const day = date.getDate()
                    const month = monthNames[date.getMonth()]
                    tooltipLabel = `${day} ${month}`
                  } else {
                    tooltipLabel = barData.labels[i]
                  }
                  const tooltipText = formatCurrency(v)
                  const isHovered = hoveredBar?.index === i
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
                        fill={isZero ? '#e5e7eb' : (isHovered ? '#1d4ed8' : '#2563eb')} 
                        opacity={isZero ? 1 : (isHovered ? 1 : 0.85)} 
                        rx={3} 
                        stroke={isZero ? '#cbd5e1' : 'none'} 
                        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      />
                      {/* label */}
                      {(filters?.group === 'month' || (filters?.group === 'day' && i % 2 === 0)) && (
                        <text x={x + (barW - 12) / 2} y={228} textAnchor="middle" fontSize="9" fill="#6b7280">{barData.labels[i]}</text>
                      )}
                    </g>
                  )
                })
              })()}
              {/* Tooltip SVG */}
              {hoveredBar && (
                <g>
                  <rect 
                    x={hoveredBar.x - 50} 
                    y={hoveredBar.y - 30} 
                    width="100" 
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



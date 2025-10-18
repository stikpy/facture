
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type ByMonth = { month: string; total: number; ht: number; tva: number; count: number }
type ByYear = { year: string; total: number; ht: number; tva: number; count: number }
type BySupplier = { supplier: string; total: number; ht: number; tva: number; count: number }

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [byMonth, setByMonth] = useState<ByMonth[]>([])
  const [byYear, setByYear] = useState<ByYear[]>([])
  const [bySupplier, setBySupplier] = useState<BySupplier[]>([])
  const [debugJson, setDebugJson] = useState<any>(null)

  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = {}
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }
        const res = await fetch('/api/stats', { headers })
        if (res.ok) {
          const json = await res.json()
          if (!mounted) return
          console.log('📊 [STATS] Réponse API:', json)
          setByMonth(json.byMonth || [])
          setByYear(json.byYear || [])
          setBySupplier(json.bySupplier || [])
          setDebugJson(json)
        } else {
          const text = await res.text()
          console.error('Erreur API stats:', res.status, text)
          setDebugJson({ status: res.status, error: text })
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [])

  const toCsv = (rows: any[], headers: string[]) => {
    const esc = (v: any) => {
      const s = v ?? ''
      const t = String(s)
      if (t.includes(',') || t.includes('"') || t.includes('\n')) {
        return '"' + t.replace(/"/g, '""') + '"'
      }
      return t
    }
    const lines = [headers.join(',')]
    for (const r of rows) {
      lines.push(headers.map(h => esc((r as any)[h])).join(','))
    }
    return lines.join('\n')
  }

  const downloadCsv = (name: string, rows: any[], headers: string[]) => {
    const csv = toCsv(rows, headers)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className='max-w-6xl mx-auto px-4 py-8 space-y-8'>
      <h1 className='text-2xl font-semibold text-gray-900'>Statistiques</h1>

      {loading ? (
        <div className='text-sm text-gray-500'>Chargement…</div>
      ) : (
        <div className='space-y-10'>
          {byMonth.length === 0 && byYear.length === 0 && bySupplier.length === 0 && (
            <div className='border rounded-md p-4 bg-gray-50 text-sm'>
              <p className='mb-2 text-gray-700'>Aucune donnée agrégée. JSON de debug:</p>
              <pre className='overflow-auto text-xs'>
                {JSON.stringify(debugJson, null, 2)}
              </pre>
            </div>
          )}
          <section>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='text-lg font-medium'>Par mois (12 derniers)</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('stats_par_mois', byMonth, ['month', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>
            <div className='overflow-auto border rounded-md'>
              <table className='min-w-full text-sm'>
                <thead className='bg-gray-50'>
                  <tr>
                    <th className='text-left px-4 py-2'>Mois</th>
                    <th className='text-right px-4 py-2'>Total</th>
                    <th className='text-right px-4 py-2'>HT</th>
                    <th className='text-right px-4 py-2'>TVA</th>
                    <th className='text-right px-4 py-2'>#</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map((r) => (
                    <tr key={r.month} className='border-t'>
                      <td className='px-4 py-2'>{r.month}</td>
                      <td className='px-4 py-2 text-right'>{r.total.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.ht.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.tva.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='text-lg font-medium'>Par année</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('stats_par_annee', byYear, ['year', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>
            <div className='overflow-auto border rounded-md'>
              <table className='min-w-full text-sm'>
                <thead className='bg-gray-50'>
                  <tr>
                    <th className='text-left px-4 py-2'>Année</th>
                    <th className='text-right px-4 py-2'>Total</th>
                    <th className='text-right px-4 py-2'>HT</th>
                    <th className='text-right px-4 py-2'>TVA</th>
                    <th className='text-right px-4 py-2'>#</th>
                  </tr>
                </thead>
                <tbody>
                  {byYear.map((r) => (
                    <tr key={r.year} className='border-t'>
                      <td className='px-4 py-2'>{r.year}</td>
                      <td className='px-4 py-2 text-right'>{r.total.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.ht.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.tva.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className='flex items-center justify-between mb-3'>
              <h2 className='text-lg font-medium'>Top fournisseurs</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('stats_par_fournisseur', bySupplier, ['supplier', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>
            <div className='overflow-auto border rounded-md'>
              <table className='min-w-full text-sm'>
                <thead className='bg-gray-50'>
                  <tr>
                    <th className='text-left px-4 py-2'>Fournisseur</th>
                    <th className='text-right px-4 py-2'>Total</th>
                    <th className='text-right px-4 py-2'>HT</th>
                    <th className='text-right px-4 py-2'>TVA</th>
                    <th className='text-right px-4 py-2'>#</th>
                  </tr>
                </thead>
                <tbody>
                  {bySupplier.map((r) => (
                    <tr key={r.supplier} className='border-t'>
                      <td className='px-4 py-2'>{r.supplier}</td>
                      <td className='px-4 py-2 text-right'>{r.total.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.ht.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.tva.toFixed(2)} €</td>
                      <td className='px-4 py-2 text-right'>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}



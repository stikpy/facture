
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { formatTitleCaseName } from '@/lib/utils'
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend
} from 'recharts'

type ByGroup = { period: string; total: number; ht: number; tva: number; count: number }
type ByYear = { year: string; total: number; ht: number; tva: number; count: number }
type BySupplier = { supplier: string; supplierCode?: string; supplierId?: string; total: number; ht: number; tva: number; count: number }
type ByCategory = { category: string; total: number; ht: number; tva: number; count: number }

type SortDir = 'asc' | 'desc'

const numberFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

export default function StatsPage() {
  const [loading, setLoading] = useState(true)
  const [byGroup, setByGroup] = useState<ByGroup[]>([])
  const [byYear, setByYear] = useState<ByYear[]>([])
  const [bySupplier, setBySupplier] = useState<BySupplier[]>([])
  const [byCategory, setByCategory] = useState<ByCategory[]>([])
  const [debugJson, setDebugJson] = useState<any>(null)

  // Filtres
  const [group, setGroup] = useState<'day'|'month'>('month')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [supplier, setSupplier] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [min, setMin] = useState<string>('')
  const [max, setMax] = useState<string>('')

  // Tri fournisseur
  const [supplierSortKey, setSupplierSortKey] = useState<keyof BySupplier>('total')
  const [supplierSortDir, setSupplierSortDir] = useState<SortDir>('desc')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const headers: HeadersInit = {}
    if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
    const params = new URLSearchParams()
    params.set('group', group)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (supplier) params.set('supplier', supplier)
    if (status) params.set('status', status)
    if (min) params.set('min', min)
    if (max) params.set('max', max)

    const res = await fetch(`/api/stats?${params.toString()}`, { headers })
    if (res.ok) {
      const json = await res.json()
      setByGroup(json.byGroup || [])
      setByYear(json.byYear || [])
      setBySupplier(json.bySupplier || [])
      setByCategory(json.byCategory || [])
      setDebugJson(json)
    } else {
      const text = await res.text()
      setDebugJson({ status: res.status, error: text })
    }
    setLoading(false)
  }, [group, from, to, supplier, status, min, max])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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

  const sortedSuppliers = useMemo(() => {
    const data = [...bySupplier]
    data.sort((a, b) => {
      const dir = supplierSortDir === 'asc' ? 1 : -1
      const av = (a as any)[supplierSortKey]
      const bv = (b as any)[supplierSortKey]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
    return data
  }, [bySupplier, supplierSortKey, supplierSortDir])

  const toggleSort = (key: keyof BySupplier) => {
    if (supplierSortKey === key) setSupplierSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSupplierSortKey(key); setSupplierSortDir('desc') }
  }

  return (
    <div className='max-w-7xl mx-auto px-4 py-8 space-y-8'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-semibold text-gray-900'>Statistiques</h1>
      </div>

      <section className='border rounded-md p-4 bg-white'>
        <div className='grid grid-cols-1 md:grid-cols-6 gap-3'>
          <div className='md:col-span-1'>
            <label className='block text-xs text-gray-600 mb-1'>Grouper par</label>
            <select value={group} onChange={e => setGroup(e.target.value as any)} className='w-full border rounded px-2 py-2 text-sm'>
              <option value='month'>Mois</option>
              <option value='day'>Jour</option>
            </select>
          </div>
          <div>
            <label className='block text-xs text-gray-600 mb-1'>Du</label>
            <input type='date' value={from} onChange={e => setFrom(e.target.value)} className='w-full border rounded px-2 py-2 text-sm' />
          </div>
          <div>
            <label className='block text-xs text-gray-600 mb-1'>Au</label>
            <input type='date' value={to} onChange={e => setTo(e.target.value)} className='w-full border rounded px-2 py-2 text-sm' />
          </div>
          <div>
            <label className='block text-xs text-gray-600 mb-1'>Fournisseur (recherche)</label>
            <input type='text' placeholder='nom ou code' value={supplier} onChange={e => setSupplier(e.target.value)} className='w-full border rounded px-2 py-2 text-sm' />
          </div>
          <div>
            <label className='block text-xs text-gray-600 mb-1'>Statut</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className='w-full border rounded px-2 py-2 text-sm'>
              <option value=''>Tous</option>
              <option value='completed'>Traité</option>
              <option value='processing'>En cours</option>
              <option value='error'>Erreur</option>
            </select>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            <div>
              <label className='block text-xs text-gray-600 mb-1'>Montant min (€)</label>
              <input type='number' step='0.01' value={min} onChange={e => setMin(e.target.value)} className='w-full border rounded px-2 py-2 text-sm' />
            </div>
            <div>
              <label className='block text-xs text-gray-600 mb-1'>Montant max (€)</label>
              <input type='number' step='0.01' value={max} onChange={e => setMax(e.target.value)} className='w-full border rounded px-2 py-2 text-sm' />
            </div>
          </div>
        </div>
        <div className='mt-3 flex gap-2'>
          <button onClick={fetchData} className='px-3 py-2 text-sm rounded bg-primary text-white'>Appliquer</button>
          <button onClick={() => { setFrom(''); setTo(''); setSupplier(''); setStatus(''); setMin(''); setMax(''); }} className='px-3 py-2 text-sm rounded border'>Réinitialiser</button>
        </div>
      </section>

      {loading ? (
        <div className='text-sm text-gray-500'>Chargement…</div>
      ) : (
        <div className='space-y-10'>
          {byGroup.length === 0 && byYear.length === 0 && bySupplier.length === 0 && (
            <div className='border rounded-md p-4 bg-gray-50 text-sm'>
              <p className='mb-2 text-gray-700'>Aucune donnée agrégée. JSON de debug:</p>
              <pre className='overflow-auto text-xs'>
                {JSON.stringify(debugJson, null, 2)}
              </pre>
            </div>
          )}

          <section className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-medium'>Dépenses par centre</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('depenses_par_centre', byCategory, ['category', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>

            <div className='h-64 w-full border rounded-md bg-white p-2'>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory.slice(0, 10)} layout='vertical' margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type='number' />
                  <YAxis type='category' dataKey='category' width={260} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? numberFmt.format(v) : v} />
                  <Bar dataKey='total' name='Total dépensé' fill='#7c3aed' />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className='overflow-auto border rounded-md'>
              <table className='min-w-full text-sm'>
                <thead className='bg-gray-50'>
                  <tr>
                    <th className='text-left px-4 py-2'>Centre</th>
                    <th className='text-right px-4 py-2'>Total</th>
                    <th className='text-right px-4 py-2'>HT</th>
                    <th className='text-right px-4 py-2'>TVA</th>
                    <th className='text-right px-4 py-2'>#</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((r) => (
                    <tr key={r.category} className='border-t'>
                      <td className='px-4 py-2'>{r.category}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.total)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.ht)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.tva)}</td>
                      <td className='px-4 py-2 text-right'>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-medium'>Par période ({group === 'month' ? 'mois' : 'jour'})</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('stats_par_periode', byGroup, ['period', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>
            <div className='h-64 w-full border rounded-md bg-white p-2'>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={byGroup} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? numberFmt.format(v) : v} />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="Total" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ht" name="HT" stroke="#059669" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="tva" name="TVA" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className='overflow-auto border rounded-md'>
              <table className='min-w-full text-sm'>
                <thead className='bg-gray-50'>
                  <tr>
                    <th className='text-left px-4 py-2'>Période</th>
                    <th className='text-right px-4 py-2'>Total</th>
                    <th className='text-right px-4 py-2'>HT</th>
                    <th className='text-right px-4 py-2'>TVA</th>
                    <th className='text-right px-4 py-2'>#</th>
                  </tr>
                </thead>
                <tbody>
                  {byGroup.map((r) => (
                    <tr key={r.period} className='border-t'>
                      <td className='px-4 py-2'>{r.period}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.total)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.ht)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.tva)}</td>
                      <td className='px-4 py-2 text-right'>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-medium'>Par année</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('stats_par_annee', byYear, ['year', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>

            <div className='h-64 w-full border rounded-md bg-white p-2'>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byYear} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? numberFmt.format(v) : v} />
                  <Legend />
                  <Bar dataKey="total" name="Total" fill="#2563eb" />
                  <Bar dataKey="ht" name="HT" fill="#059669" />
                </BarChart>
              </ResponsiveContainer>
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
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.total)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.ht)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.tva)}</td>
                      <td className='px-4 py-2 text-right'>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className='space-y-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-medium'>Dépenses par fournisseur</h2>
              <button
                className='text-sm text-primary hover:underline'
                onClick={() => downloadCsv('depenses_par_fournisseur', sortedSuppliers, ['supplier', 'total', 'ht', 'tva', 'count'])}
              >
                Export CSV
              </button>
            </div>

            <div className='h-64 w-full border rounded-md bg-white p-2'>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedSuppliers.slice(0, 10)} layout='vertical' margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type='number' />
                  <YAxis type='category' dataKey={(d: any) => formatTitleCaseName(d.supplier)} width={260} />
                  <Tooltip formatter={(v: any) => typeof v === 'number' ? numberFmt.format(v) : v} />
                  <Bar dataKey='total' name='Total dépensé' fill='#2563eb' />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className='overflow-auto border rounded-md'>
              <table className='min-w-full text-sm'>
                <thead className='bg-gray-50'>
                  <tr>
                    <th className='text-left px-4 py-2 cursor-pointer' onClick={() => toggleSort('supplier')}>Fournisseur</th>
                    <th className='text-right px-4 py-2 cursor-pointer' onClick={() => toggleSort('total')}>Total</th>
                    <th className='text-right px-4 py-2 cursor-pointer' onClick={() => toggleSort('ht')}>HT</th>
                    <th className='text-right px-4 py-2 cursor-pointer' onClick={() => toggleSort('tva')}>TVA</th>
                    <th className='text-right px-4 py-2 cursor-pointer' onClick={() => toggleSort('count')}>#</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSuppliers.map((r) => (
                    <tr key={(r.supplierId || r.supplier) + String(r.total)} className='border-t'>
                      <td className='px-4 py-2'>{formatTitleCaseName(r.supplier)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.total)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.ht)}</td>
                      <td className='px-4 py-2 text-right'>{numberFmt.format(r.tva)}</td>
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


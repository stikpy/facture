import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

type Totals = { total: number; ht: number; tva: number; count: number }

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Auth: cookies puis Authorization header
    let { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user) {
      const authHeader = request.headers.get('authorization')
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '')
        const authResult = await supabase.auth.getUser(token)
        user = authResult.data.user
        authError = authResult.error
      }
    }

    if (authError || !user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Charger les factures complétées de l'utilisateur
    // Récupération des paramètres de filtre
    const { searchParams } = new URL(request.url)
    const group = (searchParams.get('group') || 'month').toLowerCase() // 'day' | 'month'
    const from = searchParams.get('from') // YYYY-MM-DD
    const to = searchParams.get('to') // YYYY-MM-DD
    const supplier = (searchParams.get('supplier') || '').toLowerCase()
    const status = (searchParams.get('status') || '').toLowerCase() // completed|processing|error
    const minStr = searchParams.get('min')
    const maxStr = searchParams.get('max')
    const min = minStr ? Number(minStr) : undefined
    const max = maxStr ? Number(maxStr) : undefined

    // Utiliser le client service role pour éviter les effets RLS
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('created_at, extracted_data, status, user_id')
      .eq('user_id', user.id)
      .limit(10000)

    if (error) throw error

    const rows = (data as any[]) || []

    // Helpers
    const toNum = (n: any): number => (typeof n === 'number' ? n : 0)
    const yyyy_mm = (d: string) => {
      const dt = new Date(d)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    }
    const yyyy_mm_dd = (d: string) => {
      const dt = new Date(d)
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    }
    const yOnly = (d: string) => new Date(d).getFullYear().toString()

    // Par mois (12 derniers mois, tri asc)
    // Appliquer filtres
    const filtered = rows.filter((r: any) => {
      const ed = r.extracted_data || {}
      const created = new Date(r.created_at)
      if (from) {
        const f = new Date(from)
        if (created < f) return false
      }
      if (to) {
        const t = new Date(to)
        // inclure la journée entière
        t.setHours(23, 59, 59, 999)
        if (created > t) return false
      }
      if (supplier) {
        const s = String(ed.supplier_name || '').toLowerCase()
        if (!s.includes(supplier)) return false
      }
      if (status && String(r.status || '').toLowerCase() !== status) return false
      const amount = toNum(ed.total_amount)
      if (min !== undefined && amount < min) return false
      if (max !== undefined && amount > max) return false
      return true
    })

    // Regroupement par jour ou par mois
    const byGroupMap = new Map<string, Totals>()
    for (const r of filtered) {
      const key = group === 'day' ? yyyy_mm_dd(String((r as any).created_at)) : yyyy_mm(String((r as any).created_at))
      const ed = (r as any).extracted_data || {}
      const cur = byGroupMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      cur.total += toNum(ed.total_amount)
      cur.ht += toNum(ed.subtotal)
      cur.tva += toNum(ed.tax_amount)
      cur.count += 1
      byGroupMap.set(key, cur)
    }
    const byGroup = Array.from(byGroupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, v]) => ({ period, ...v }))

    // Par année
    const byYearMap = new Map<string, Totals>()
    for (const r of rows as any[]) {
      const key = yOnly(String((r as any).created_at))
      const ed = (r as any).extracted_data || {}
      const cur = byYearMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      cur.total += toNum(ed.total_amount)
      cur.ht += toNum(ed.subtotal)
      cur.tva += toNum(ed.tax_amount)
      cur.count += 1
      byYearMap.set(key, cur)
    }
    const byYear = Array.from(byYearMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([year, v]) => ({ year, ...v }))

    // Par fournisseur (top 10)
    const bySupplierMap = new Map<string, Totals>()
    for (const r of filtered) {
      const ed = (r as any).extracted_data || {}
      const key = String(ed.supplier_name || 'Inconnu')
      const cur = bySupplierMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      cur.total += toNum(ed.total_amount)
      cur.ht += toNum(ed.subtotal)
      cur.tva += toNum(ed.tax_amount)
      cur.count += 1
      bySupplierMap.set(key, cur)
    }
    const bySupplier = Array.from(bySupplierMap.entries())
      .map(([supplier, v]) => ({ supplier, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    // Anciennes clés gardées vides pour compat
    return NextResponse.json({ success: true, group, byGroup, byMonth: [], byYear, bySupplier })
  } catch (error) {
    console.error('Erreur stats:', error)
    return NextResponse.json({ error: 'Erreur lors du calcul des stats' }, { status: 500 })
  }
}



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

    // Utiliser le client service role pour éviter les effets RLS,
    // mais filtrer par organisation(s) dont l'utilisateur est membre
    const { data: memberships } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
    
    const orgIds = ((memberships as any[]) || []).map(m => m.organization_id)
    const activeOrgId = (user as any)?.user_metadata?.organization_id || null

    const query = (supabaseAdmin as any)
      .from('invoices')
      .select('created_at, extracted_data, status, user_id, supplier_id, organization_id')
      .limit(10000)

    // Simpler and safer: read with user-scoped client so RLS applies
    const { data, error } = await (supabase as any)
      .from('invoices')
      .select('created_at, extracted_data, status, user_id, supplier_id, organization_id')
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
    const supplierDisplay = new Map<string, { name: string; code?: string; id?: string }>()

    const normalizeSupplier = (name: string) => {
      const stopwords = /(\b(sas|sasu|sarl|sa|eurl|spa|ltd|inc|societe|maison|ste|ets|etablissement|les|des|du|de|la|le|l)\b)/gi
      return String(name || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(stopwords, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    // Charger toutes les métadonnées fournisseurs (pour faire correspondre les noms libres aux fiches)
    let supplierMetaMap = new Map<string, { code?: string; name: string; normalized?: string }>()
    {
      const { data: supplierRows } = await (supabaseAdmin as any)
        .from('suppliers')
        .select('id, code, display_name, normalized_key')
      for (const s of (supplierRows as any[]) || []) {
        supplierMetaMap.set(String((s as any).id), { code: (s as any).code, name: (s as any).display_name, normalized: (s as any).normalized_key })
      }
    }

    for (const r of filtered as any[]) {
      const ed = r.extracted_data || {}
      const hasSupplierId = !!r.supplier_id
      let key = ''
      if (hasSupplierId) {
        key = `id:${r.supplier_id}`
      } else {
        // Tenter de faire correspondre aux fournisseurs existants
        const norm = normalizeSupplier(ed.supplier_name || 'Inconnu')
        // 1) correspondance exacte sur normalized_key
        let matchedId: string | null = null
        for (const [sid, meta] of supplierMetaMap.entries()) {
          if ((meta.normalized || '') === norm) { matchedId = sid; break }
        }
        // 2) sinon, correspondance "contient" bi-directionnelle (tokens inclus)
        if (!matchedId) {
          for (const [sid, meta] of supplierMetaMap.entries()) {
            const m = (meta.normalized || '')
            if (!m) continue
            if (norm.includes(m) || m.includes(norm)) { matchedId = sid; break }
          }
        }
        key = matchedId ? `id:${matchedId}` : `nk:${norm}`
      }

      if (!supplierDisplay.has(key)) {
        if (key.startsWith('id:')) {
          const sid = key.slice(3)
          const meta = supplierMetaMap.get(sid)
          if (meta) supplierDisplay.set(key, { name: meta.name, code: meta.code, id: sid })
          else supplierDisplay.set(key, { name: ed.supplier_name || 'Inconnu' })
        } else {
          supplierDisplay.set(key, { name: ed.supplier_name || 'Inconnu' })
        }
      }

      const cur = bySupplierMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      cur.total += toNum(ed.total_amount)
      cur.ht += toNum(ed.subtotal)
      cur.tva += toNum(ed.tax_amount)
      cur.count += 1
      bySupplierMap.set(key, cur)
    }

    const bySupplier = Array.from(bySupplierMap.entries())
      .map(([key, v]) => {
        const meta = supplierDisplay.get(key)
        return ({
          supplier: meta?.name || key,
          supplierCode: meta?.code,
          supplierId: meta?.id,
          ...v
        })
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)

    // Centres de dépense (catégorie x taux TVA)
    const byCategoryMap = new Map<string, Totals>()
    const approxVat = (ht?: number, tva?: number): number | null => {
      const h = Number(ht || 0)
      const t = Number(tva || 0)
      if (h <= 0 || t <= 0) return null
      const r = (t / h) * 100
      if (Math.abs(r - 5.5) < 1.5) return 5.5
      if (Math.abs(r - 10) < 2) return 10
      if (Math.abs(r - 20) < 3) return 20
      return Math.round(r)
    }
    const supplierToBase = (name: string): string => {
      const n = (name || '').toLowerCase()
      const isBeverage = /boisson|cave|vin|brass|bi[eè]re|spirit|bar/.test(n)
      const isHygiene = /hygi[eè]ne|nettoy|savon|linge|lessiv|d[eé]tergent|d[eé]sinfect|papier|essuie/.test(n)
      const isMaterial = /[é|e]quip|ustensile|mat[eé]riel|vaisselle|consommable/.test(n)
      if (isBeverage) return 'Boissons'
      if (isHygiene) return 'Hygiène'
      if (isMaterial) return 'Matériel'
      return 'Nourriture'
    }
    for (const r of filtered as any[]) {
      const ed = r.extracted_data || {}
      const base = supplierToBase(String(ed.supplier_name || ''))
      const rate = approxVat(Number(ed.subtotal), Number(ed.tax_amount))
      const key = rate ? `${base} ${rate}%` : base
      const cur = byCategoryMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      cur.total += toNum(ed.total_amount)
      cur.ht += toNum(ed.subtotal)
      cur.tva += toNum(ed.tax_amount)
      cur.count += 1
      byCategoryMap.set(key, cur)
    }
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total)

    // Anciennes clés gardées vides pour compat
    return NextResponse.json({ success: true, group, byGroup, byMonth: [], byYear, bySupplier, byCategory })
  } catch (error) {
    console.error('Erreur stats:', error)
    return NextResponse.json({ error: 'Erreur lors du calcul des stats' }, { status: 500 })
  }
}



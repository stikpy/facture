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
    const allocFilter = (searchParams.get('alloc') || 'all').toLowerCase() // all|allocated|unallocated

    // Lire avec le client utilisateur (RLS) + filtre organisation courant
    let orgId: string | null = null
    try {
      const { data: member } = await (supabase as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      orgId = member?.organization_id || null
    } catch {}
    if (!orgId) {
      const { data: userRow } = await (supabase as any)
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      orgId = userRow?.organization_id || null
    }

    let query = (supabase as any)
      .from('invoices')
      .select('id, created_at, extracted_data, status, user_id, supplier_id, organization_id')
      .limit(10000)
    if (orgId) query = query.eq('organization_id', orgId)
    const { data, error } = await query

    if (error) throw error

    const rows = (data as any[]) || []

    // Précharger les métadonnées fournisseurs pour filtrage et regroupement
    let supplierMetaMap = new Map<string, { code?: string; name: string; normalized?: string }>()
    {
      const { data: supplierRows } = await (supabaseAdmin as any)
        .from('suppliers')
        .select('id, code, display_name, normalized_key')
      for (const s of (supplierRows as any[]) || []) {
        supplierMetaMap.set(String((s as any).id), { code: (s as any).code, name: (s as any).display_name, normalized: (s as any).normalized_key })
      }
    }

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
      const basisDateStr = String(ed.invoice_date || r.created_at)
      const created = new Date(basisDateStr)
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
        const s1 = String(ed.supplier_name || '').toLowerCase()
        const s2 = (() => {
          try { return String((supplierMetaMap.get(String(r.supplier_id))?.name || '')).toLowerCase() } catch { return '' }
        })()
        if (!(s1.includes(supplier) || s2.includes(supplier))) return false
      }
      if (status && String(r.status || '').toLowerCase() !== status) return false
      const amount = toNum(ed.total_amount)
      if (min !== undefined && amount < min) return false
      if (max !== undefined && amount > max) return false
      return true
    })

    // Charger les ventilations de l'utilisateur sur ces factures
    const filteredIds = filtered.map((r: any) => String(r.id))
    let allocatedMap = new Map<string, { ht: number; tva: number; total: number; count: number }>()
    let byAccountMap = new Map<string, { total: number; ht: number; tva: number; count: number }>()
    let byVatMap = new Map<string, { total: number; ht: number; tva: number; count: number }>()
    if (filteredIds.length > 0) {
      const { data: allocs } = await (supabaseAdmin as any)
        .from('invoice_allocations')
        .select('invoice_id, account_code, amount, vat_code, vat_rate, user_id')
        .in('invoice_id', filteredIds)
        .eq('user_id', user.id)
      for (const a of (allocs as any[]) || []) {
        const invId = String((a as any).invoice_id)
        const ht = Number((a as any).amount || 0)
        const rate = Number((a as any).vat_rate || 0)
        const tva = rate > 0 ? ht * (rate / 100) : 0
        const total = ht + tva
        const cur = allocatedMap.get(invId) || { ht: 0, tva: 0, total: 0, count: 0 }
        cur.ht += ht; cur.tva += tva; cur.total += total; cur.count += 1
        allocatedMap.set(invId, cur)

        // Par compte
        const accKey = String((a as any).account_code || '—')
        const acc = byAccountMap.get(accKey) || { total: 0, ht: 0, tva: 0, count: 0 }
        acc.ht += ht; acc.tva += tva; acc.total += total; acc.count += 1
        byAccountMap.set(accKey, acc)

        // Par TVA (code ou taux)
        const vKey = String((a as any).vat_code || `${rate}%`)
        const v = byVatMap.get(vKey) || { total: 0, ht: 0, tva: 0, count: 0 }
        v.ht += ht; v.tva += tva; v.total += total; v.count += 1
        byVatMap.set(vKey, v)
      }
    }

    // Appliquer filtre allocations si demandé
    const filteredByAlloc = filtered.filter((r: any) => {
      if (allocFilter === 'all') return true
      const has = allocatedMap.has(String(r.id))
      return allocFilter === 'allocated' ? has : !has
    })

    // Regroupement par jour ou par mois
    const byGroupMap = new Map<string, Totals>()
    for (const r of filteredByAlloc) {
      const ed = (r as any).extracted_data || {}
      const basisDateStr = String(ed.invoice_date || (r as any).created_at)
      const key = group === 'day' ? yyyy_mm_dd(basisDateStr) : yyyy_mm(basisDateStr)
      const cur = byGroupMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      const alloc = allocatedMap.get(String((r as any).id))
      if (alloc) {
        cur.total += alloc.total
        cur.ht += alloc.ht
        cur.tva += alloc.tva
      } else {
        cur.total += toNum(ed.total_amount)
        cur.ht += toNum(ed.subtotal)
        cur.tva += toNum(ed.tax_amount)
      }
      cur.count += 1
      byGroupMap.set(key, cur)
    }
    const byGroup = Array.from(byGroupMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, v]) => ({ period, ...v }))

    // Par année
    const byYearMap = new Map<string, Totals>()
    for (const r of rows as any[]) {
      const ed = (r as any).extracted_data || {}
      const basisDateStr = String(ed.invoice_date || (r as any).created_at)
      const key = yOnly(basisDateStr)
      const cur = byYearMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      const alloc = allocatedMap.get(String((r as any).id))
      if (alloc) {
        cur.total += alloc.total
        cur.ht += alloc.ht
        cur.tva += alloc.tva
      } else {
        cur.total += toNum(ed.total_amount)
        cur.ht += toNum(ed.subtotal)
        cur.tva += toNum(ed.tax_amount)
      }
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

    // supplierMetaMap déjà chargé ci-dessus

    for (const r of filteredByAlloc as any[]) {
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
      const alloc = allocatedMap.get(String((r as any).id))
      if (alloc) {
        cur.total += alloc.total
        cur.ht += alloc.ht
        cur.tva += alloc.tva
      } else {
        cur.total += toNum(ed.total_amount)
        cur.ht += toNum(ed.subtotal)
        cur.tva += toNum(ed.tax_amount)
      }
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
    for (const r of filteredByAlloc as any[]) {
      const ed = r.extracted_data || {}
      const base = supplierToBase(String(ed.supplier_name || ''))
      const alloc = allocatedMap.get(String((r as any).id))
      const rate = alloc ? approxVat(Number(alloc.ht), Number(alloc.tva)) : approxVat(Number(ed.subtotal), Number(ed.tax_amount))
      const key = rate ? `${base} ${rate}%` : base
      const cur = byCategoryMap.get(key) || { total: 0, ht: 0, tva: 0, count: 0 }
      if (alloc) {
        cur.total += alloc.total
        cur.ht += alloc.ht
        cur.tva += alloc.tva
      } else {
        cur.total += toNum(ed.total_amount)
        cur.ht += toNum(ed.subtotal)
        cur.tva += toNum(ed.tax_amount)
      }
      cur.count += 1
      byCategoryMap.set(key, cur)
    }
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.total - a.total)

    // Anciennes clés gardées vides pour compat
    const byAccount = Array.from(byAccountMap.entries())
      .map(([account, v]) => ({ account, ...v }))
      .sort((a, b) => b.total - a.total)
    const byVat = Array.from(byVatMap.entries())
      .map(([vat, v]) => ({ vat, ...v }))
      .sort((a, b) => b.total - a.total)

    const coverage = {
      invoicesAllocated: Array.from(allocatedMap.keys()).length,
      invoicesTotal: filtered.length,
      invoicesUnallocated: filtered.length - Array.from(allocatedMap.keys()).length
    }

    return NextResponse.json({ success: true, group, byGroup, byMonth: [], byYear, bySupplier, byCategory, byAccount, byVat, coverage })
  } catch (error) {
    console.error('Erreur stats:', error)
    return NextResponse.json({ error: 'Erreur lors du calcul des stats' }, { status: 500 })
  }
}



import { supabaseAdmin } from '@/lib/supabase'

export const normalizeSupplier = (name: string) => {
  const stopwords = /(\b(sas|sasu|sarl|sa|eurl|spa|ltd|inc|societe|maison|ste|ets|etablissement|les|des|du|de|la|le|l)\b)/gi
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(stopwords, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const slug4 = (s: string) =>
  s.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 6).padEnd(4, 'X')

export async function upsertSupplier(displayName: string) {
  const key = normalizeSupplier(displayName)
  if (!key) return null

  // 1) Chercher par normalized_key exact ou alias existant
  {
    const { data: existing } = await (supabaseAdmin as any)
      .from('suppliers')
      .select('*')
      .eq('normalized_key', key)
      .single()
    if (existing) return existing
  }

  // Alias -> supplier
  {
    const { data: aliasRow } = await (supabaseAdmin as any)
      .from('supplier_aliases')
      .select('supplier_id')
      .eq('alias_key', key)
      .maybeSingle?.() ?? { data: null }
    if (aliasRow?.supplier_id) {
      const { data: supplier } = await (supabaseAdmin as any)
        .from('suppliers')
        .select('*')
        .eq('id', aliasRow.supplier_id)
        .single()
      if (supplier) return supplier
    }
  }

  // 2) Correspondance floue: si un fournisseur existant a une clé normalisée incluse
  {
    const { data: allSuppliers } = await (supabaseAdmin as any)
      .from('suppliers')
      .select('id, display_name, code, normalized_key')
    const match = (allSuppliers as any[] | null)?.find(s => {
      const n = String((s as any).normalized_key || '')
      return n && (n.includes(key) || key.includes(n))
    })
    if (match) {
      // Enregistrer l'alias pour les prochaines fois
      await (supabaseAdmin as any)
        .from('supplier_aliases')
        .insert({ supplier_id: (match as any).id, alias_key: key } as any)
        .onConflict('supplier_id,alias_key')
        .ignore?.()
      return match
    }
  }

  // generate code base
  const base = slug4(key)
  let idx = 1
  let code = `${base}-${String(idx).padStart(3, '0')}`
  while (true) {
    const { data: hit } = await (supabaseAdmin as any)
      .from('suppliers')
      .select('id')
      .eq('code', code)
      .maybeSingle?.() ?? { data: null }
    if (!hit) break
    idx++
    code = `${base}-${String(idx).padStart(3, '0')}`
  }

  const { data: inserted, error } = await (supabaseAdmin as any)
    .from('suppliers')
    .insert({ code, display_name: displayName, normalized_key: key } as any)
    .select()
    .single()
  if (error) throw error
  // Créer l'alias d'entrée pour capturer la variante initiale
  await (supabaseAdmin as any)
    .from('supplier_aliases')
    .insert({ supplier_id: (inserted as any).id, alias_key: key } as any)
    .onConflict('supplier_id,alias_key')
    .ignore?.()
  return inserted
}

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

  // Try get existing
  const { data: existing } = await (supabaseAdmin as any)
    .from('suppliers')
    .select('*')
    .eq('normalized_key', key)
    .single()

  if (existing) return existing

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
  return inserted
}

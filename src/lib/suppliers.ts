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

  // 2) Correspondance floue STRICTE: seulement si la clé est quasi-identique
  {
    const { data: allSuppliers } = await (supabaseAdmin as any)
      .from('suppliers')
      .select('id, display_name, code, normalized_key, validation_status')
    
    // Chercher une correspondance très proche (80%+ de similarité)
    const match = (allSuppliers as any[] | null)?.find(s => {
      const n = String((s as any).normalized_key || '')
      if (!n) return false
      
      // Calcul de similarité simple (ratio de mots communs)
      const keyWords = new Set(key.split(' ').filter(w => w.length > 2))
      const nWords = new Set(n.split(' ').filter(w => w.length > 2))
      
      if (keyWords.size === 0 || nWords.size === 0) return false
      
      // Intersection des mots
      const intersection = [...keyWords].filter(w => nWords.has(w))
      const similarity = (intersection.length * 2) / (keyWords.size + nWords.size)
      
      // Seulement si 80%+ de similarité ET que le fournisseur est validé
      return similarity >= 0.8 && (s as any).validation_status === 'validated'
    })
    
    if (match) {
      console.log(`✅ [SUPPLIERS] Correspondance floue trouvée pour "${displayName}" → "${(match as any).display_name}" (${Math.round(((match as any).similarity || 0) * 100)}% similaire)`)
      // Enregistrer l'alias pour les prochaines fois
      await (supabaseAdmin as any)
        .from('supplier_aliases')
        .insert({ supplier_id: (match as any).id, alias_key: key } as any)
        .onConflict('supplier_id,alias_key')
        .ignore?.()
      return match
    }
    
    console.log(`🔍 [SUPPLIERS] Aucune correspondance floue trouvée pour "${displayName}", création d'un nouveau fournisseur`)
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

  console.log(`🆕 [SUPPLIERS] Création d'un nouveau fournisseur en attente de validation: ${displayName}`)
  const { data: inserted, error } = await (supabaseAdmin as any)
    .from('suppliers')
    .insert({ 
      code, 
      display_name: displayName, 
      normalized_key: key,
      validation_status: 'pending',
      is_active: false  // Désactivé par défaut jusqu'à validation
    } as any)
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

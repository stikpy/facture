#!/usr/bin/env node

/*
  Backfill fournisseurs à partir des factures existantes
  - Crée les enregistrements suppliers manquants depuis extracted_data.supplier_name
  - Renseigne invoices.supplier_id
  - Enregistre les alias (normalized)
*/

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const DRY_RUN = process.argv.includes('--dry-run')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey)

const normalize = (name) => {
  const stop = /(\b(sas|sasu|sarl|sa|eurl|spa|ltd|inc|societe|maison|ste|ets|etablissement|les|des|du|de|la|le|l)\b)/gi
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(stop, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function ensureSupplier(displayName) {
  const key = normalize(displayName)
  if (!key) return null

  // chercher exact
  const { data: existing } = await supabase
    .from('suppliers')
    .select('id, code, display_name, normalized_key')
    .eq('normalized_key', key)
    .maybeSingle()
  if (existing) return existing

  // alias
  const { data: aliasRow } = await supabase
    .from('supplier_aliases')
    .select('supplier_id')
    .eq('alias_key', key)
    .maybeSingle()
  if (aliasRow?.supplier_id) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, code, display_name, normalized_key')
      .eq('id', aliasRow.supplier_id)
      .single()
    if (supplier) return supplier
  }

  // correspondance floue
  const { data: all } = await supabase
    .from('suppliers')
    .select('id, code, display_name, normalized_key')
  const match = (all || []).find(s => {
    const n = String(s.normalized_key || '')
    return n && (n.includes(key) || key.includes(n))
  })
  if (match) {
    await supabase
      .from('supplier_aliases')
      .insert({ supplier_id: match.id, alias_key: key })
      .then(() => {})
      .catch(() => {})
    return match
  }

  // créer
  if (DRY_RUN) {
    return { id: null, code: 'DRY', display_name: displayName, normalized_key: key }
  }
  const base = key.replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 6).padEnd(4, 'X')
  let idx = 1
  let code = `${base}-${String(idx).padStart(3, '0')}`
  // éviter collision
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: hit } = await supabase
      .from('suppliers')
      .select('id')
      .eq('code', code)
      .maybeSingle()
    if (!hit) break
    idx++
    code = `${base}-${String(idx).padStart(3, '0')}`
  }
  const { data: inserted, error } = await supabase
    .from('suppliers')
    .insert({ code, display_name: displayName, normalized_key: key })
    .select()
    .single()
  if (error) throw error
  await supabase
    .from('supplier_aliases')
    .insert({ supplier_id: inserted.id, alias_key: key })
    .then(() => {})
    .catch(() => {})
  return inserted
}

async function main() {
  console.log(`🧩 Backfill fournisseurs (${DRY_RUN ? 'dry-run' : 'live'})…`)
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, supplier_id, extracted_data')
    .limit(10000)
  if (error) throw error

  let linked = 0, created = 0
  for (const inv of invoices || []) {
    const name = inv?.extracted_data?.supplier_name
    if (!name) continue
    const supplier = await ensureSupplier(String(name))
    if (!supplier) continue
    if (DRY_RUN) {
      linked++
      continue
    }
    if (inv.supplier_id !== supplier.id) {
      await supabase
        .from('invoices')
        .update({ supplier_id: supplier.id })
        .eq('id', inv.id)
      linked++
    }
  }

  console.log(`✅ Backfill terminé. Liens mis à jour: ${linked}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })



#!/usr/bin/env node

/*
  Script de déduplication fournisseurs (exécutable en Node)
  - Détermine un fournisseur canonique pour chaque groupe d'alias proches
  - Met à jour invoices.supplier_id
  - Crée les alias manquants
  - Supprime les fournisseurs fusionnés (sauf en --dry-run)
*/

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const DRY_RUN = process.argv.includes('--dry-run')
const NO_ORPHANS = !process.argv.includes('--no-orphans') // par défaut: nettoyer les orphelins

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

async function main() {
  console.log(`🔧 Déduplication des fournisseurs (${DRY_RUN ? 'dry-run' : 'live'})…`)

  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('id, code, display_name, normalized_key')
  if (error) throw error

  // Grouper d'abord par normalized_key identique
  const groups = {}
  for (const s of suppliers || []) {
    const n = s.normalized_key || normalize(s.display_name)
    groups[n] = groups[n] || []
    groups[n].push(s)
  }

  const entries = Object.entries(groups).filter(([, arr]) => arr.length > 1)
  if (entries.length === 0) {
    console.log('✅ Aucun doublon strict via normalized_key')
  }

  for (const [norm, arr] of entries) {
    const keeper = arr[0]
    const toMerge = arr.slice(1)
    console.log(`👥 Fusion '${norm}': garder ${keeper.id}, fusionner ${toMerge.map(s=>s.id).join(', ')}`)

    // Mettre à jour invoices
    const { error: invErr } = await supabase
      .from('invoices')
      .update({ supplier_id: keeper.id })
      .in('supplier_id', toMerge.map(s => s.id))
    if (invErr) throw invErr

    // Créer alias
    for (const merged of toMerge) {
      await supabase
        .from('supplier_aliases')
        .insert({ supplier_id: keeper.id, alias_key: norm })
        .then(() => {})
        .catch(() => {})
    }

    // Supprimer doublons
    if (!DRY_RUN) {
      const { error: delErr } = await supabase
        .from('suppliers')
        .delete()
        .in('id', toMerge.map(s => s.id))
      if (delErr) throw delErr
      console.log(`🗑️  Supprimés: ${toMerge.map(s=>s.id).join(', ')}`)
    } else {
      console.log('🧪 Dry-run: suppression non exécutée')
    }
  }

  // Nettoyage des fournisseurs orphelins (aucune facture liée)
  if (NO_ORPHANS) {
    console.log('🧹 Vérification des fournisseurs orphelins…')
    const { data: allSuppliers, error: sErr } = await supabase
      .from('suppliers')
      .select('id')
    if (sErr) throw sErr
    let deleted = 0
    for (const s of allSuppliers || []) {
      const { count, error: cErr } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('supplier_id', s.id)
      if (cErr) throw cErr
      if ((count || 0) === 0) {
        if (!DRY_RUN) {
          const { error: del } = await supabase
            .from('suppliers')
            .delete()
            .eq('id', s.id)
          if (del) throw del
        }
        deleted++
      }
    }
    console.log(`🧹 Orphelins ${DRY_RUN ? '(dry-run) ' : ''}supprimés: ${deleted}`)
  } else {
    console.log('ℹ️  Nettoyage des orphelins désactivé (--no-orphans)')
  }

  console.log('🎉 Déduplication terminée')
}

main().catch((e) => { console.error(e); process.exit(1) })



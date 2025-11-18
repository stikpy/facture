/**
 * Script pour corriger les allocations d'une facture en distribuant les articles
 * Usage: npx tsx scripts/fix-invoice-allocations.ts <invoice_id>
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

// Charger les variables d'environnement
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables d\'environnement manquantes')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const invoiceId = process.argv[2] || '74133749-236b-4d36-9302-2891f78be131'

async function fixInvoiceAllocations() {
  console.log(`🔧 Correction des allocations pour la facture: ${invoiceId}\n`)

  try {
    // 1. Récupérer la facture
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, extracted_data')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvée: ${invoiceError?.message || 'Aucune donnée'}`)
    }

    const items = (invoice.extracted_data as any)?.items || []
    const subtotal = Number((invoice.extracted_data as any)?.subtotal || 0)
    
    console.log(`✅ Facture trouvée: ${invoice.file_name}`)
    console.log(`   - Nombre d'items: ${items.length}`)
    console.log(`   - Subtotal HT: ${subtotal} €\n`)

    // 2. Récupérer les allocations existantes
    const { data: allocations, error: allocError } = await supabase
      .from('invoice_allocations')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true })

    if (allocError) {
      throw new Error(`Erreur lors de la récupération des allocations: ${allocError.message}`)
    }

    if (!allocations || allocations.length === 0) {
      console.log('⚠️  Aucune allocation trouvée. Rien à corriger.')
      return
    }

    console.log(`📊 Allocations trouvées: ${allocations.length}\n`)

    // 3. Calculer le total des montants des allocations
    const totalAllocated = allocations.reduce((sum: number, alloc) => sum + Number(alloc.amount || 0), 0)
    console.log(`💰 Total alloué: ${totalAllocated} €`)
    console.log(`💰 Subtotal facture: ${subtotal} €`)
    console.log(`💰 Différence: ${Math.abs(totalAllocated - subtotal).toFixed(2)} €\n`)

    // 4. Calculer le montant HT total des items
    const calculateItemHT = (item: any): number => {
      if (item.is_ht === false && item.total_price) {
        // Si le prix est TTC, calculer le HT
        const taxMultiplier = 1 + (item.tax_rate || 0) / 100
        return item.total_price / taxMultiplier
      }
      return Number(item.unit_price || 0) * Number(item.quantity || 1)
    }

    const itemsHT: Array<{ idx: number; item: any; ht: number }> = items.map((item: any, idx: number) => ({
      idx,
      item,
      ht: calculateItemHT(item)
    }))

    const totalItemsHT = itemsHT.reduce((sum: number, { ht }: { ht: number }) => sum + ht, 0)
    console.log(`📦 Total HT des items: ${totalItemsHT.toFixed(2)} €\n`)

    // 5. Distribuer les articles proportionnellement aux montants des allocations
    const updatedAllocations: Array<{ id: string; item_indices: number[] }> = []
    let remainingIndices = new Set(itemsHT.map(({ idx }: { idx: number }) => idx))
    let allocatedHT = 0

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i]
      const allocAmount = Number(alloc.amount || 0)
      const allocRatio = totalAllocated > 0 ? allocAmount / totalAllocated : 0
      const targetHT = totalItemsHT * allocRatio

      console.log(`\n📋 Allocation ${i + 1}:`)
      console.log(`   - Compte: ${alloc.account_code} - ${alloc.label || 'Sans libellé'}`)
      console.log(`   - Montant: ${allocAmount} €`)
      console.log(`   - Ratio: ${(allocRatio * 100).toFixed(2)}%`)
      console.log(`   - Objectif HT: ${targetHT.toFixed(2)} €`)

      const itemIndices: number[] = []
      let currentHT = 0

      // Distribuer les articles pour atteindre le montant cible
      for (const { idx, ht } of itemsHT) {
        if (!remainingIndices.has(idx)) continue
        
        if (currentHT + ht <= targetHT || itemIndices.length === 0) {
          itemIndices.push(idx)
          currentHT += ht
          remainingIndices.delete(idx)
          
          // Si on a atteint le montant cible, on peut s'arrêter
          if (currentHT >= targetHT * 0.95) { // 95% pour éviter les arrondis
            break
          }
        }
      }

      // Si c'est la dernière allocation, ajouter tous les articles restants
      if (i === allocations.length - 1 && remainingIndices.size > 0) {
        remainingIndices.forEach(idx => {
          itemIndices.push(idx)
          currentHT += itemsHT[idx].ht
        })
        remainingIndices.clear()
      }

      allocatedHT += currentHT
      console.log(`   - Articles assignés: ${itemIndices.length}`)
      console.log(`   - HT assigné: ${currentHT.toFixed(2)} €`)

      updatedAllocations.push({
        id: alloc.id,
        item_indices: itemIndices.sort((a, b) => a - b)
      })
    }

    // 6. Mettre à jour les allocations dans la base
    console.log(`\n🔄 Mise à jour des allocations...`)
    for (const { id, item_indices } of updatedAllocations) {
      const { error: updateError } = await supabase
        .from('invoice_allocations')
        .update({ item_indices })
        .eq('id', id)

      if (updateError) {
        console.error(`❌ Erreur lors de la mise à jour de l'allocation ${id}:`, updateError)
      } else {
        console.log(`✅ Allocation ${id} mise à jour avec ${item_indices.length} articles`)
      }
    }

    // 7. Vérification finale
    const { data: finalAllocations } = await supabase
      .from('invoice_allocations')
      .select('item_indices')
      .eq('invoice_id', invoiceId)

    const finalAllocatedIndices = new Set<number>()
    finalAllocations?.forEach((alloc: any) => {
      if (Array.isArray(alloc.item_indices)) {
        alloc.item_indices.forEach((idx: number) => finalAllocatedIndices.add(idx))
      }
    })

    console.log(`\n✨ Correction terminée!`)
    console.log(`   - Articles ventilés: ${finalAllocatedIndices.size} / ${items.length}`)
    console.log(`   - Articles à ventiler: ${items.length - finalAllocatedIndices.size}`)

  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

fixInvoiceAllocations()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  })


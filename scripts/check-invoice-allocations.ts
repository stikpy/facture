/**
 * Script pour vérifier les allocations d'une facture
 * Usage: npx tsx scripts/check-invoice-allocations.ts <invoice_id>
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

async function checkInvoiceAllocations() {
  console.log(`🔍 Vérification des allocations pour la facture: ${invoiceId}\n`)

  try {
    // 1. Récupérer la facture
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, supplier_id, organization_id, extracted_data')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvée: ${invoiceError?.message || 'Aucune donnée'}`)
    }

    const items = (invoice.extracted_data as any)?.items || []
    console.log(`✅ Facture trouvée: ${invoice.file_name}`)
    console.log(`   - Nombre d'items extraits: ${items.length}\n`)

    // 2. Récupérer toutes les allocations pour cette facture
    const { data: allocations, error: allocError } = await supabase
      .from('invoice_allocations')
      .select('*')
      .eq('invoice_id', invoiceId)

    if (allocError) {
      console.error('❌ Erreur lors de la récupération des allocations:', allocError)
      return
    }

    console.log(`📊 Allocations trouvées: ${allocations?.length || 0}\n`)

    if (!allocations || allocations.length === 0) {
      console.log('⚠️  Aucune allocation trouvée pour cette facture.')
      console.log('   Tous les articles sont donc "à ventiler".\n')
      return
    }

    // 3. Analyser les item_indices
    const allocatedIndices = new Set<number>()
    let allocationsWithIndices = 0
    let allocationsWithoutIndices = 0

    allocations.forEach((alloc: any) => {
      if (Array.isArray(alloc.item_indices) && alloc.item_indices.length > 0) {
        allocationsWithIndices++
        alloc.item_indices.forEach((idx: number) => allocatedIndices.add(idx))
      } else {
        allocationsWithoutIndices++
      }
    })

    console.log(`📋 Analyse des allocations:`)
    console.log(`   - Allocations avec item_indices: ${allocationsWithIndices}`)
    console.log(`   - Allocations sans item_indices: ${allocationsWithoutIndices}`)
    console.log(`   - Indices d'articles ventilés: ${allocatedIndices.size}`)
    console.log(`   - Articles non ventilés: ${items.length - allocatedIndices.size}\n`)

    // 4. Afficher le détail des allocations
    if (allocations.length > 0) {
      console.log(`📝 Détail des allocations:`)
      allocations.forEach((alloc: any, idx: number) => {
        console.log(`\n   Allocation ${idx + 1}:`)
        console.log(`   - ID: ${alloc.id}`)
        console.log(`   - Compte: ${alloc.account_code} - ${alloc.label || 'Sans libellé'}`)
        console.log(`   - Montant: ${alloc.amount} €`)
        console.log(`   - TVA: ${alloc.vat_code || 'N/A'} (${alloc.vat_rate || 'N/A'}%)`)
        console.log(`   - item_indices: ${Array.isArray(alloc.item_indices) ? JSON.stringify(alloc.item_indices) : 'Aucun'}`)
        if (Array.isArray(alloc.item_indices) && alloc.item_indices.length > 0) {
          console.log(`   - Articles ventilés: ${alloc.item_indices.length}`)
          alloc.item_indices.forEach((itemIdx: number) => {
            const item = items[itemIdx]
            if (item) {
              console.log(`     • [${itemIdx}] ${item.description || 'Sans description'} - ${item.unit_price || 0} €`)
            }
          })
        }
      })
    }

    // 5. Résumé
    console.log(`\n📊 Résumé:`)
    console.log(`   - Total articles: ${items.length}`)
    console.log(`   - Articles ventilés: ${allocatedIndices.size}`)
    console.log(`   - Articles à ventiler: ${items.length - allocatedIndices.size}`)

  } catch (error: any) {
    console.error('❌ Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

checkInvoiceAllocations()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  })


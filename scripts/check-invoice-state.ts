/**
 * Script pour verifier l'etat actuel d'une facture
 * Usage: npx tsx scripts/check-invoice-state.ts <invoice_id>
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Variables d\'environnement manquantes')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const invoiceId = process.argv[2] || '74133749-236b-4d36-9302-2891f78be131'

async function checkInvoiceState() {
  console.log(`Verification de l'etat de la facture: ${invoiceId}\n`)

  try {
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, status, supplier_id, organization_id, extracted_data, created_at, updated_at')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvee: ${invoiceError?.message || 'Aucune donnee'}`)
    }

    console.log(`Facture: ${invoice.file_name}`)
    console.log(`Status: ${invoice.status}`)
    console.log(`Creee le: ${invoice.created_at}`)
    console.log(`Modifiee le: ${invoice.updated_at}\n`)

    const extractedData = invoice.extracted_data as any
    const items = (extractedData?.items || []) as any[]
    
    console.log(`Donnees extraites:`)
    console.log(`   - Fournisseur: ${extractedData?.supplier_name || 'N/A'}`)
    console.log(`   - Numero facture: ${extractedData?.invoice_number || 'N/A'}`)
    console.log(`   - Date facture: ${extractedData?.invoice_date || 'N/A'}`)
    console.log(`   - Subtotal HT: ${extractedData?.subtotal || 0} €`)
    console.log(`   - TVA: ${extractedData?.tax_amount || 0} €`)
    console.log(`   - Total TTC: ${extractedData?.total_amount || 0} €`)
    console.log(`   - Nombre d'items: ${items.length}\n`)

    if (items.length > 0) {
      console.log(`Premiers items (max 10):`)
      items.slice(0, 10).forEach((item, idx) => {
        console.log(`   ${idx + 1}. ${item.description || 'Sans description'}`)
        console.log(`      Ref: ${item.reference || 'Aucune'}, Qte: ${item.quantity}, PU: ${item.unit_price} €, Total: ${item.total_price} €`)
      })
      if (items.length > 10) {
        console.log(`   ... et ${items.length - 10} autres items`)
      }
    } else {
      console.log(`⚠️  Aucun item trouve dans extracted_data.items`)
    }

    // Verifier les allocations
    const { data: allocations } = await supabase
      .from('invoice_allocations')
      .select('*')
      .eq('invoice_id', invoiceId)

    console.log(`\nAllocations: ${allocations?.length || 0}`)
    if (allocations && allocations.length > 0) {
      allocations.forEach((alloc, idx) => {
        console.log(`   ${idx + 1}. Compte: ${alloc.account_code}, Montant: ${alloc.amount} €, Items: ${(alloc.item_indices || []).length}`)
      })
    }

  } catch (error: any) {
    console.error('Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

checkInvoiceState()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nErreur fatale:', error)
    process.exit(1)
  })


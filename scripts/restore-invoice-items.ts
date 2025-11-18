/**
 * Script pour restaurer les items d'une facture depuis les donnees des logs
 * Usage: npx tsx scripts/restore-invoice-items.ts <invoice_id>
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

// Items uniques extraits des logs (38 items apres deduplication)
const restoredItems = [
  { description: "TIRAMISU BKE BANDE 900G X2", quantity: 8, unit_price: 13.3, total_price: 106.4, tax_rate: 5.5, is_ht: true, reference: "L 5831" },
  { description: "TOMATE FARCIE CUITE 170G SYE CT6KG", quantity: 12, unit_price: 8.12, total_price: 97.44, tax_rate: 5.5, is_ht: true, reference: "L 7729" },
  { description: "PAVE SAUMON ATL. A/P QSA 150G X20 ENV. 3KG", quantity: 12, unit_price: 16.1, total_price: 193.2, tax_rate: 5.5, is_ht: true, reference: "SI L 37820" },
  { description: "POELEE RUSTIQUE MIN. BOND. ST2.5KG X4", quantity: 10, unit_price: 5.7, total_price: 57, tax_rate: 5.5, is_ht: true, reference: "L 39695" },
  { description: "RIZ BASMATI CUIT ST2.5KG X4", quantity: 10, unit_price: 4.61, total_price: 46.1, tax_rate: 5.5, is_ht: true, reference: "L 39699" },
  { description: "FLAN PATISSIER BANDE 1.4KG CDG X8", quantity: 8, unit_price: 8.92, total_price: 71.36, tax_rate: 5.5, is_ht: true, reference: "L 60499" },
  { description: "POELEE AUTREFOIS BKE ST2.5KG X2", quantity: 10, unit_price: 4.82, total_price: 48.2, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "PALERON BOEUF CONFIT IQF 100G CT4KG", quantity: 8, unit_price: 28.95, total_price: 231.6, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "TAJINE LEGUME/ABRICOT DAUCY ST2.5KG X4", quantity: 10, unit_price: 6.82, total_price: 68.2, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "POELEE PIPERADE/PIMENT ESP. BKE 2.5KG X2", quantity: 5, unit_price: 6.49, total_price: 32.45, tax_rate: 5.5, is_ht: true, reference: "SI L 72929" },
  { description: "FONDANT CHOC. COEUR COULANT 90G SYE X36", quantity: 72, unit_price: 1.04, total_price: 74.88, tax_rate: 5.5, is_ht: true, reference: "SI L 74208" },
  { description: "ALLUMETTE GIANDUJA PRALINE 73G CBR X27", quantity: 81, unit_price: 1.44, total_price: 116.64, tax_rate: 5.5, is_ht: true, reference: "SI L 74520" },
  { description: "POELEE RATATOUILLE CBR ST2.5KG X4", quantity: 10, unit_price: 5.91, total_price: 59.1, tax_rate: 5.5, is_ht: true, reference: "L 75029" },
  { description: "POELEE DOUCEUR LEGUME BLE ST2.5KG", quantity: 10, unit_price: 5.13, total_price: 51.3, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "NAVETTE COCO ANANAS 80G X12", quantity: 24, unit_price: 1.97, total_price: 47.28, tax_rate: 5.5, is_ht: true, reference: "SI L 75111" },
  { description: "ROLL DIT CHAMP CUTT 110G ENV SYC CT5KG", quantity: 5, unit_price: 12.5, total_price: 62.5, tax_rate: 5.5, is_ht: true, reference: "SL L 75120" },
  { description: "POELEE MARAICHERE 2 CAROT. SYC ST2.5KG X4", quantity: 10, unit_price: 5.35, total_price: 53.5, tax_rate: 5.5, is_ht: true, reference: "FI R 17536" },
  { description: "1/2 LANGOUSTE TROPIC. EVIS. ENV. 160G CT5KG", quantity: 5, unit_price: 30, total_price: 150, tax_rate: 5.5, is_ht: true, reference: "FI R 41485" },
  { description: "AUMONIERE CROUST. GAMBAS 80G CBR BT8PC X3", quantity: 3.84, unit_price: 17.56, total_price: 67.43, tax_rate: 5.5, is_ht: true, reference: "FI R 41615" },
  { description: "TR TERRINE 2 POISSONS 45G ENV. CT3KG", quantity: 3, unit_price: 10.81, total_price: 32.43, tax_rate: 5.5, is_ht: true, reference: "FI R 80508" },
  { description: "PENNE RIGATE PREC. IQF ST1KG X5", quantity: 10, unit_price: 3.07, total_price: 30.7, tax_rate: 5.5, is_ht: true, reference: "FI R 81430" },
  { description: "DES BETTERAVE BT5/1 PNE 2.655KG X3", quantity: 3, unit_price: 9.33, total_price: 27.99, tax_rate: 5.5, is_ht: true, reference: "FI R 81679" },
  { description: "OREILL. PECHE SIR. LEG. BT4/4", quantity: 4, unit_price: 3.83, total_price: 15.32, tax_rate: 5.5, is_ht: true, reference: "R42679" },
  { description: "BRIOCHE TRESSEE NON TRANCHEE PC600G X5", quantity: 4, unit_price: 2.39, total_price: 9.56, tax_rate: 5.5, is_ht: true, reference: "L42668" },
  { description: "FLT POULET BLC VF ST2.5KG X4", quantity: 10, unit_price: 9.51, total_price: 95.1, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "SAUTE POULET VF S/OS S/P 30/60G 2.5KG X2", quantity: 10.188, unit_price: 10.61, total_price: 108.1, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "FROM. BLANC LISSE 7%MG MIN SE5KG", quantity: 5, unit_price: 4.6, total_price: 23, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "OEUF DUR ECALE SOL PT INF.53G SE75PC", quantity: 75, unit_price: 0.47, total_price: 35.25, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "APPAREIL MOUSSE CHOC. NOIR 15% MG IL X 6", quantity: 6, unit_price: 10.69, total_price: 64.14, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "DES FETA 22%MG MIN. AOP SE900G X4", quantity: 1, unit_price: 19.02, total_price: 19.02, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "RIZ AU LAIT ST1.7KG X4", quantity: 6.8, unit_price: 6.13, total_price: 41.68, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "SALADE ALTIPLANO QUINOA SYC BQ1.5KG X6", quantity: 3, unit_price: 5.27, total_price: 15.81, tax_rate: 5.5, is_ht: true, reference: "" },
  { description: "TRIO CAROTTE CONFITE BEURRE CBR ST2KG X2", quantity: 8.404, unit_price: 7.45, total_price: 62.61, tax_rate: 5.5, is_ht: true, reference: "" }
]

async function restoreInvoiceItems() {
  console.log(`Restauration des items pour la facture: ${invoiceId}\n`)

  try {
    // 1. Recuperer la facture
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, file_name, extracted_data, supplier_id, organization_id')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      throw new Error(`Facture non trouvee: ${invoiceError?.message || 'Aucune donnee'}`)
    }

    console.log(`Facture trouvee: ${invoice.file_name}`)
    console.log(`Items a restaurer: ${restoredItems.length}\n`)

    // 2. Calculer les totaux
    const subtotalHT = restoredItems.reduce((sum, item) => sum + (item.total_price || 0), 0)
    const taxAmount = restoredItems.reduce((sum, item) => {
      const itemHT = item.total_price || 0
      const taxRate = item.tax_rate || 0
      return sum + (itemHT * taxRate / 100)
    }, 0)
    const totalTTC = subtotalHT + taxAmount

    console.log(`Totaux calcules:`)
    console.log(`   Subtotal HT: ${subtotalHT.toFixed(2)} €`)
    console.log(`   TVA: ${taxAmount.toFixed(2)} €`)
    console.log(`   Total TTC: ${totalTTC.toFixed(2)} €\n`)

    // 3. Mettre a jour extracted_data
    const updatedExtractedData = {
      ...(invoice.extracted_data || {}),
      items: restoredItems,
      subtotal: subtotalHT,
      tax_amount: taxAmount,
      total_amount: totalTTC,
      items_count: restoredItems.length,
      supplier_name: invoice.extracted_data?.supplier_name || "SYSCO France",
      invoice_number: invoice.extracted_data?.invoice_number || "1252091113",
      invoice_date: invoice.extracted_data?.invoice_date || "2025-11-06",
      due_date: invoice.extracted_data?.due_date || "2025-11-20"
    }

    console.log(`Mise a jour de la facture...`)
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ 
        extracted_data: updatedExtractedData,
        status: 'completed'
      })
      .eq('id', invoiceId)

    if (updateError) {
      throw new Error(`Erreur lors de la mise a jour: ${updateError.message}`)
    }

    console.log(`✅ Facture mise a jour avec succes!`)
    console.log(`   Items restaures: ${restoredItems.length}`)
    console.log(`   Status: completed`)

    // 4. Recalculer les allocations
    console.log(`\n⚠️  Les allocations doivent etre recalculées via le script fix-invoice-allocations.ts`)

  } catch (error: any) {
    console.error('Erreur:', error.message)
    console.error(error)
    process.exit(1)
  }
}

restoreInvoiceItems()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('\nErreur fatale:', error)
    process.exit(1)
  })


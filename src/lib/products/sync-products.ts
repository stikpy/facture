/**
 * Fonction utilitaire pour synchroniser les produits extraits d'une facture
 * vers la table products
 */

import { supabaseAdmin } from '@/lib/supabase'

interface InvoiceItem {
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  tax_rate?: number
  is_ht?: boolean
  reference?: string
}

interface SyncProductsParams {
  organizationId: string
  supplierId: string
  items: InvoiceItem[]
}

/**
 * Synchronise les produits d'une facture vers la table products
 */
export async function syncProductsFromInvoice({
  organizationId,
  supplierId,
  items
}: SyncProductsParams): Promise<{ synced: number; errors: number }> {
  if (!items || items.length === 0) {
    return { synced: 0, errors: 0 }
  }

  // Utiliser une Map pour dédupliquer les produits par (organization_id, supplier_id, reference)
  const productsMap = new Map<string, {
    organization_id: string
    supplier_id: string
    reference: string
    name: string
    price: number
    vat_rate: number | null
    vat_code: string | null
    unit: string
    description: string | null
  }>()

  for (const item of items) {
    // Ignorer les items sans référence ou description
    if (!item.reference && !item.description) {
      continue
    }

    // Utiliser la référence si disponible, sinon générer une clé depuis la description
    const referenceRaw = item.reference?.trim()
    const reference = (referenceRaw ? referenceRaw.toUpperCase() : undefined) || 
      `AUTO-${item.description?.substring(0, 20).replace(/[^A-Z0-9]/gi, '')}` || 
      'NO-REF'

    // Clé unique pour la déduplication
    const uniqueKey = `${organizationId}-${supplierId}-${reference}`

    // Si le produit existe déjà, garder le prix le plus élevé (peut être plus récent)
    if (productsMap.has(uniqueKey)) {
      const existing = productsMap.get(uniqueKey)!
      // Calculer le prix du nouvel item
      let price = item.unit_price || 0
      if (item.is_ht === false && item.total_price) {
        const taxMultiplier = 1 + (item.tax_rate || 0) / 100
        price = item.total_price / taxMultiplier / (item.quantity || 1)
      } else if (item.total_price && item.quantity) {
        price = item.total_price / item.quantity
      }
      // Mettre à jour si le prix est plus élevé
      if (price > existing.price) {
        existing.price = Math.max(0, price)
        existing.vat_rate = item.tax_rate || existing.vat_rate
      }
      continue
    }

    // Déterminer le prix HT
    let price = item.unit_price || 0
    if (item.is_ht === false && item.total_price) {
      // Si le prix est TTC, calculer le HT
      const taxMultiplier = 1 + (item.tax_rate || 0) / 100
      price = item.total_price / taxMultiplier / (item.quantity || 1)
    } else if (item.total_price && item.quantity) {
      // Utiliser le prix unitaire calculé depuis le total
      price = item.total_price / item.quantity
    }

    // Déterminer l'unité (essayer de l'inférer depuis la description)
    let unit = 'pièce'
    const descriptionLower = item.description?.toLowerCase() || ''
    if (descriptionLower.includes('kg') || descriptionLower.includes('kilo')) {
      unit = 'kg'
    } else if (descriptionLower.includes('litre') || descriptionLower.includes('l ')) {
      unit = 'litre'
    } else if (descriptionLower.includes('mètre') || descriptionLower.includes('m ')) {
      unit = 'mètre'
    }

    productsMap.set(uniqueKey, {
      organization_id: organizationId,
      supplier_id: supplierId,
      reference: reference,
      name: item.description?.trim() || 'Produit sans nom',
      price: Math.max(0, price),
      vat_rate: item.tax_rate || null,
      vat_code: null, // Sera rempli manuellement ou via mapping
      unit: unit,
      description: item.description?.trim() || null
    })
  }

  // Convertir la Map en tableau pour l'upsert
  const productsToUpsert = Array.from(productsMap.values())

  if (productsToUpsert.length === 0) {
    return { synced: 0, errors: 0 }
  }

  // Utiliser upsert pour gérer les doublons (basé sur la contrainte unique)
  const { data, error } = await (supabaseAdmin as any)
    .from('products')
    .upsert(productsToUpsert, {
      onConflict: 'organization_id,supplier_id,reference',
      ignoreDuplicates: false
    })
    .select()

  if (error) {
    console.error('❌ Erreur lors de la synchronisation des produits:', error)
    return { synced: 0, errors: productsToUpsert.length }
  }

  const synced = data?.length || 0
  console.log(`✅ ${synced} produit(s) synchronisé(s) vers la table products`)

  return { synced, errors: 0 }
}


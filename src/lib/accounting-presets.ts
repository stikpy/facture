export interface AccountPreset {
  code: string
  label: string
  synonyms?: string[]
}

// Presets simples pour hôtellerie-restauration (PCG FR)
export const HOTEL_RESTAURANT_ACCOUNTS: AccountPreset[] = [
  { code: '601', label: 'Achats stockés - Matières premières', synonyms: ['nourriture', 'nourri', 'food', 'pdj', 'restauration', 'solide cuisine'] },
  { code: '602', label: 'Achats stockés - Autres approvisionnements' },
  { code: '606', label: 'Achats non stockés - Fournitures', synonyms: ['consommables', 'disposables'] },
  { code: '6061', label: 'Fournitures non stockables (eau, énergie...)', synonyms: ['energie', 'eau', 'electricite', 'gaz'] },
  { code: '6063', label: "Fournitures d’entretien et de petit équipement", synonyms: ['equipement', 'petit materiel', 'ustensiles'] },
  { code: '6064', label: 'Fournitures administratives', synonyms: ['bureau', 'paperasse'] },
  { code: '6068', label: 'Autres matières et fournitures' },
  { code: '607', label: 'Achats de marchandises (alimentaire, boissons)', synonyms: ['boissons', 'bev', 'bar', 'alcool', 'solide bar'] },
  { code: '611', label: 'Sous-traitance générale' },
  { code: '613', label: 'Locations' },
  { code: '624', label: 'Transports', synonyms: ['transport', 'livraison', 'frais de port'] },
  { code: '615', label: 'Entretien et réparations', synonyms: ['maintenance'] },
  { code: '622', label: "Rémunérations d’intermédiaires et honoraires" },
  { code: '623', label: 'Publicité, publications, relations publiques', synonyms: ['marketing', 'ads', 'google', 'facebook'] },
  { code: '6251', label: 'Voyages et déplacements' },
  { code: '6256', label: 'Missions' },
  { code: '6257', label: 'Réceptions' },
  { code: '626', label: 'Frais postaux et de télécommunications', synonyms: ['telephone', 'internet', 'telecom'] },
  { code: '627', label: 'Services bancaires et assimilés', synonyms: ['banque', 'cb', 'frais bancaires'] },
  { code: '628', label: 'Autres services extérieurs' },
  { code: '44566', label: 'TVA déductible sur autres biens et services', synonyms: ['tva', 'deductible'] },
]

export function suggestAccountForSupplier(supplierName?: string): string {
  if (!supplierName) return '606'
  const s = supplierName.toLowerCase()
  // Alimentation / grossistes
  if (s.includes('rungis') || s.includes('transgourmet') || s.includes('metro') || s.includes('bourg') || s.includes('boucher')) {
    return '607'
  }
  // Énergie / fluides
  if (s.includes('edf') || s.includes('engie') || s.includes('total') || s.includes('ener') || s.includes('eau') || s.includes('veolia')) {
    return '6061'
  }
  // Télécoms
  if (s.includes('orange') || s.includes('sfr') || s.includes('bouygues') || s.includes('free')) {
    return '626'
  }
  // Banque
  if (s.includes('banque') || s.includes('bp') || s.includes('credit') || s.includes('lcl') || s.includes('caisse d')) {
    return '627'
  }
  // Publicité / sites
  if (s.includes('google') || s.includes('facebook') || s.includes('meta') || s.includes('yelp') || s.includes('tripadvisor')) {
    return '623'
  }
  // Par défaut, achats non stockés
  return '606'
}

export function searchAccounts(query: string): AccountPreset[] {
  const q = (query || '').toLowerCase().trim()
  if (!q) return HOTEL_RESTAURANT_ACCOUNTS.slice(0, 10)
  return HOTEL_RESTAURANT_ACCOUNTS.filter((a) => {
    return (
      a.code.startsWith(q) ||
      a.label.toLowerCase().includes(q) ||
      (a.synonyms || []).some((s) => s.toLowerCase().includes(q))
    )
  }).slice(0, 10)
}

export interface VatPreset {
  code: string
  label: string
  rate: number
  synonyms?: string[]
}

export const VAT_PRESETS: VatPreset[] = [
  { code: '002', label: 'TVA DED 20% - TVA Déductible Taux normal', rate: 20, synonyms: ['20', 'normal'] },
  { code: 'B5', label: 'TVA PRESTA Déductible Taux normal (20%)', rate: 20, synonyms: ['20', 'presta'] },
  { code: 'A6', label: 'TVA B&S Déductible Taux intermédiaire (10%)', rate: 10, synonyms: ['10', 'intermediaire'] },
  { code: 'B6', label: 'TVA PRESTA Déductible Taux intermédiaire (10%)', rate: 10, synonyms: ['10', 'presta'] },
  { code: 'A2', label: 'TVA B&S Déductible Taux réduit (5.5%)', rate: 5.5, synonyms: ['5.5', 'reduit'] },
  { code: 'B2', label: 'TVA PRESTA Déductible Taux réduit (5.5%)', rate: 5.5, synonyms: ['5.5', 'presta'] },
  { code: 'I5', label: 'TVA Immobilisations Taux normal (20%)', rate: 20, synonyms: ['immobilisation'] },
]

export function suggestVatForRate(rate?: number): VatPreset | undefined {
  const target = rate ?? 20
  const best = VAT_PRESETS.reduce((acc: VatPreset | undefined, v) => {
    if (!acc) return v
    return Math.abs(v.rate - target) < Math.abs((acc?.rate ?? 0) - target) ? v : acc
  }, undefined as any)
  return best
}

export function searchVat(query: string): VatPreset[] {
  const q = (query || '').toLowerCase().trim()
  if (!q) return VAT_PRESETS.slice(0, 10)
  return VAT_PRESETS.filter((v) =>
    v.code.toLowerCase().includes(q) ||
    v.label.toLowerCase().includes(q) ||
    (v.synonyms || []).some((s) => s.toLowerCase().includes(q))
  ).slice(0, 10)
}

export function findVatByCode(code?: string): VatPreset | undefined {
  if (!code) return undefined
  return VAT_PRESETS.find((v) => v.code.toLowerCase() === code.toLowerCase())
}



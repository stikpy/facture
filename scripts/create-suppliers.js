// Script pour créer des fournisseurs de test dans la base de production
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mdjtbzutahoxvfjbeqal.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kanRienV0YWhveHZmamJlcWFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDc5MzU5MSwiZXhwIjoyMDc2MzY5NTkxfQ.Ts0dfRLXAWGeJ_QtPpj07JWR8SQ1I7fPpTCtB_cv_sM'

const supabase = createClient(supabaseUrl, supabaseKey)

const suppliers = [
  {
    name: 'TERREAZUR RUNGIS',
    display_name: 'TERREAZUR RUNGIS',
    code: 'TERREA-001',
    normalized_key: 'terreazur rungis',
    is_active: true
  },
  {
    name: 'Maison Granola',
    display_name: 'Maison Granola - SASU Lowcal',
    code: 'GRANOL-001',
    normalized_key: 'granola lowcal',
    is_active: true
  },
  {
    name: 'BOUCHERIES NIVERNAISES',
    display_name: 'BOUCHERIES NIVERNAISES',
    code: 'BOUCHE-001',
    normalized_key: 'boucheries nivernaises',
    is_active: true
  },
  {
    name: 'HUGUENIN',
    display_name: 'HUGUENIN',
    code: 'HUGUEN-001',
    normalized_key: 'huguenin',
    is_active: true
  },
  {
    name: 'VIANDES DES GRANDES TABLES',
    display_name: 'VIANDES DES GRANDES TABLES',
    code: 'VIANDE-001',
    normalized_key: 'viandes grandes tables',
    is_active: true
  }
]

async function createSuppliers() {
  try {
    console.log('Création des fournisseurs...')
    
    // D'abord, créer une organisation par défaut
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({ name: 'Organisation par défaut' })
      .select()
      .single()
    
    if (orgError && !orgError.message.includes('duplicate')) {
      console.error('Erreur création organisation:', orgError)
      return
    }
    
    const organizationId = org?.id || (await supabase.from('organizations').select('id').limit(1).single()).data?.id
    
    console.log('Organisation ID:', organizationId)
    
    // Créer les fournisseurs
    const suppliersWithOrg = suppliers.map(s => ({ ...s, organization_id: organizationId }))
    
    const { data, error } = await supabase
      .from('suppliers')
      .insert(suppliersWithOrg)
      .select()
    
    if (error) {
      console.error('Erreur création fournisseurs:', error)
    } else {
      console.log('Fournisseurs créés:', data?.length || 0)
    }
    
  } catch (error) {
    console.error('Erreur générale:', error)
  }
}

createSuppliers()

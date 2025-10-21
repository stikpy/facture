// Script pour ajouter la colonne organization_id aux fournisseurs
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mdjtbzutahoxvfjbeqal.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kanRienV0YWhveHZmamJlcWFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDc5MzU5MSwiZXhwIjoyMDc2MzY5NTkxfQ.Ts0dfRLXAWGeJ_QtPpj07JWR8SQ1I7fPpTCtB_cv_sM'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addOrganizationToSuppliers() {
  try {
    console.log('🔧 Ajout de la colonne organization_id aux fournisseurs...')
    
    // 1. Vérifier si la colonne existe déjà
    const { data: suppliers, error: checkError } = await supabase
      .from('suppliers')
      .select('id, display_name, organization_id')
      .limit(1)
    
    if (checkError && checkError.code === '42703') {
      console.log('📝 La colonne organization_id n\'existe pas encore')
      
      // 2. Créer une organisation par défaut d'abord
      console.log('🏢 Création d\'une organisation par défaut...')
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: 'Organisation par défaut' })
        .select()
        .single()
      
      if (orgError) {
        console.error('❌ Erreur lors de la création de l\'organisation:', orgError)
        return
      }
      
      console.log('✅ Organisation créée:', org.name, '(ID:', org.id, ')')
      
      // 3. Exécuter la migration SQL directement
      console.log('🔧 Exécution de la migration SQL...')
      
      // Note: On ne peut pas exécuter du DDL directement via l'API REST
      // Il faut le faire via l'interface Supabase ou via une fonction SQL
      console.log('⚠️  Migration SQL à exécuter manuellement dans l\'interface Supabase:')
      console.log(`
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_suppliers_organization_id ON public.suppliers(organization_id);

UPDATE public.suppliers 
SET organization_id = '${org.id}'
WHERE organization_id IS NULL;
      `)
      
      console.log('\n📋 Instructions:')
      console.log('1. Va dans l\'interface Supabase > SQL Editor')
      console.log('2. Exécute le SQL ci-dessus')
      console.log('3. Relance ce script pour vérifier')
      
    } else if (checkError) {
      console.error('❌ Erreur lors de la vérification:', checkError)
    } else {
      console.log('✅ La colonne organization_id existe déjà')
      
      // Vérifier si les fournisseurs ont une organisation assignée
      const suppliersWithoutOrg = suppliers?.filter(s => !s.organization_id) || []
      
      if (suppliersWithoutOrg.length > 0) {
        console.log(`⚠️  ${suppliersWithoutOrg.length} fournisseurs sans organisation`)
        
        // Récupérer l'organisation par défaut
        const { data: defaultOrg, error: orgError } = await supabase
          .from('organizations')
          .select('id, name')
          .eq('name', 'Organisation par défaut')
          .single()
        
        if (orgError) {
          console.error('❌ Erreur lors de la récupération de l\'organisation:', orgError)
        } else {
          console.log('🔗 Assignation des fournisseurs à l\'organisation:', defaultOrg.name)
          
          const { error: updateError } = await supabase
            .from('suppliers')
            .update({ organization_id: defaultOrg.id })
            .is('organization_id', null)
          
          if (updateError) {
            console.error('❌ Erreur lors de l\'assignation:', updateError)
          } else {
            console.log('✅ Fournisseurs assignés avec succès!')
          }
        }
      } else {
        console.log('✅ Tous les fournisseurs ont déjà une organisation assignée')
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

addOrganizationToSuppliers()

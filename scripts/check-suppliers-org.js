// Script pour vérifier et assigner les fournisseurs à une organisation
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mdjtbzutahoxvfjbeqal.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kanRienV0YWhveHZmamJlcWFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDc5MzU5MSwiZXhwIjoyMDc2MzY5NTkxfQ.Ts0dfRLXAWGeJ_QtPpj07JWR8SQ1I7fPpTCtB_cv_sM'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSuppliersOrganization() {
  try {
    console.log('🔍 Vérification des fournisseurs et organisations...')
    
    // 1. Vérifier les fournisseurs existants
    const { data: suppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .select('id, display_name, organization_id')
    
    if (suppliersError) {
      console.error('❌ Erreur lors de la récupération des fournisseurs:', suppliersError)
      return
    }
    
    console.log('📊 Fournisseurs trouvés:', suppliers?.length || 0)
    console.log('📋 Détails des fournisseurs:')
    suppliers?.forEach(supplier => {
      console.log(`  - ${supplier.display_name} (ID: ${supplier.id}) - Org: ${supplier.organization_id || 'NULL'}`)
    })
    
    // 2. Vérifier les organisations existantes
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name')
    
    if (orgsError) {
      console.error('❌ Erreur lors de la récupération des organisations:', orgsError)
      return
    }
    
    console.log('\n🏢 Organisations trouvées:', orgs?.length || 0)
    orgs?.forEach(org => {
      console.log(`  - ${org.name} (ID: ${org.id})`)
    })
    
    // 3. Assigner les fournisseurs à une organisation si nécessaire
    if (suppliers && suppliers.length > 0) {
      const suppliersWithoutOrg = suppliers.filter(s => !s.organization_id)
      
      if (suppliersWithoutOrg.length > 0) {
        console.log(`\n⚠️  ${suppliersWithoutOrg.length} fournisseurs sans organisation`)
        
        if (orgs && orgs.length > 0) {
          const defaultOrg = orgs[0]
          console.log(`🔗 Assignation à l'organisation: ${defaultOrg.name}`)
          
          const { error: updateError } = await supabase
            .from('suppliers')
            .update({ organization_id: defaultOrg.id })
            .is('organization_id', null)
          
          if (updateError) {
            console.error('❌ Erreur lors de l\'assignation:', updateError)
          } else {
            console.log('✅ Fournisseurs assignés avec succès!')
          }
        } else {
          console.log('❌ Aucune organisation trouvée. Création d\'une organisation par défaut...')
          
          const { data: newOrg, error: createOrgError } = await supabase
            .from('organizations')
            .insert({ name: 'Organisation par défaut' })
            .select()
            .single()
          
          if (createOrgError) {
            console.error('❌ Erreur lors de la création de l\'organisation:', createOrgError)
          } else {
            console.log('✅ Organisation créée:', newOrg.name)
            
            // Assigner tous les fournisseurs à cette organisation
            const { error: updateError } = await supabase
              .from('suppliers')
              .update({ organization_id: newOrg.id })
              .is('organization_id', null)
            
            if (updateError) {
              console.error('❌ Erreur lors de l\'assignation:', updateError)
            } else {
              console.log('✅ Tous les fournisseurs assignés à l\'organisation par défaut!')
            }
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

checkSuppliersOrganization()

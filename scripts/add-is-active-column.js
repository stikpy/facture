// Script pour ajouter la colonne is_active aux fournisseurs
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://mdjtbzutahoxvfjbeqal.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kanRienV0YWhveHZmamJlcWFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDc5MzU5MSwiZXhwIjoyMDc2MzY5NTkxfQ.Ts0dfRLXAWGeJ_QtPpj07JWR8SQ1I7fPpTCtB_cv_sM'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addIsActiveColumn() {
  try {
    console.log('🔧 Ajout de la colonne is_active aux fournisseurs...')
    
    // 1. Vérifier si la colonne existe déjà
    const { data: suppliers, error: checkError } = await supabase
      .from('suppliers')
      .select('id, display_name, is_active')
      .limit(1)
    
    if (checkError && checkError.code === '42703') {
      console.log('📝 La colonne is_active n\'existe pas encore')
      
      console.log('⚠️  Migration SQL à exécuter manuellement dans l\'interface Supabase:')
      console.log(`
-- Ajouter la colonne is_active
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Mettre à jour tous les fournisseurs existants pour qu'ils soient actifs par défaut
UPDATE public.suppliers 
SET is_active = true 
WHERE is_active IS NULL;

-- Créer un index pour les performances
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON public.suppliers(is_active);
      `)
      
      console.log('\n📋 Instructions:')
      console.log('1. Va dans l\'interface Supabase > SQL Editor')
      console.log('2. Exécute le SQL ci-dessus')
      console.log('3. Relance ce script pour vérifier')
      
    } else if (checkError) {
      console.error('❌ Erreur lors de la vérification:', checkError)
    } else {
      console.log('✅ La colonne is_active existe déjà')
      
      // Vérifier les valeurs
      console.log('📊 État des fournisseurs:')
      suppliers?.forEach(supplier => {
        console.log(`  - ${supplier.display_name}: ${supplier.is_active ? 'Actif' : 'Inactif'}`)
      })
      
      // Compter les actifs/inactifs
      const activeCount = suppliers?.filter(s => s.is_active).length || 0
      const inactiveCount = suppliers?.filter(s => !s.is_active).length || 0
      
      console.log(`\n📈 Résumé: ${activeCount} actifs, ${inactiveCount} inactifs`)
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

addIsActiveColumn()

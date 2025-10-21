const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function createBucket() {
  try {
    console.log('🔧 Création du bucket invoices...')
    
    // Créer le bucket avec les bonnes permissions
    const { data, error } = await supabase.storage.createBucket('invoices', {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['application/pdf', 'image/*']
    })
    
    if (error) {
      console.error('❌ Erreur lors de la création du bucket:', error)
    } else {
      console.log('✅ Bucket invoices créé avec succès:', data)
    }
    
    // Vérifier que le bucket existe
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      console.error('❌ Erreur lors de la liste des buckets:', listError)
    } else {
      console.log('📋 Buckets disponibles:', buckets)
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

createBucket()

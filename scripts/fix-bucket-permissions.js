const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function fixBucketPermissions() {
  try {
    console.log('🔧 Configuration du bucket invoices...')
    
    // Vérifier la configuration actuelle
    const { data: buckets, error: bucketsError } = await supabase
      .from('storage.buckets')
      .select('*')
      .eq('id', 'invoices')
    
    if (bucketsError) {
      console.error('❌ Erreur lors de la récupération des buckets:', bucketsError)
      return
    }
    
    console.log('📋 Buckets trouvés:', buckets)
    
    if (buckets && buckets.length > 0) {
      const bucket = buckets[0]
      console.log('🔍 Configuration actuelle du bucket invoices:')
      console.log('- ID:', bucket.id)
      console.log('- Public:', bucket.public)
      console.log('- File size limit:', bucket.file_size_limit)
      console.log('- Allowed MIME types:', bucket.allowed_mime_types)
      
      // Mettre à jour le bucket pour le rendre public
      const { data: updateData, error: updateError } = await supabase
        .from('storage.buckets')
        .update({ 
          public: true,
          file_size_limit: 52428800, // 50MB
          allowed_mime_types: ['application/pdf', 'image/*']
        })
        .eq('id', 'invoices')
      
      if (updateError) {
        console.error('❌ Erreur lors de la mise à jour du bucket:', updateError)
      } else {
        console.log('✅ Bucket invoices configuré comme public')
      }
    } else {
      console.log('❌ Bucket invoices non trouvé')
    }
    
    // Vérifier les politiques RLS
    const { data: policies, error: policiesError } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'objects')
      .eq('schemaname', 'storage')
    
    if (policiesError) {
      console.error('❌ Erreur lors de la récupération des politiques:', policiesError)
    } else {
      console.log('📋 Politiques RLS existantes:', policies)
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

fixBucketPermissions()

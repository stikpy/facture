const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function makeBucketPublic() {
  try {
    console.log('🔧 Configuration du bucket invoices comme public...')
    
    // Mettre à jour le bucket pour le rendre public
    const { data, error } = await supabase.storage.updateBucket('invoices', {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: ['application/pdf', 'image/*']
    })
    
    if (error) {
      console.error('❌ Erreur lors de la mise à jour du bucket:', error)
    } else {
      console.log('✅ Bucket invoices configuré comme public:', data)
    }
    
    // Vérifier la configuration
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    
    if (listError) {
      console.error('❌ Erreur lors de la liste des buckets:', listError)
    } else {
      const invoicesBucket = buckets.find(b => b.id === 'invoices')
      if (invoicesBucket) {
        console.log('📋 Configuration du bucket invoices:')
        console.log('- ID:', invoicesBucket.id)
        console.log('- Public:', invoicesBucket.public)
        console.log('- File size limit:', invoicesBucket.file_size_limit)
        console.log('- Allowed MIME types:', invoicesBucket.allowed_mime_types)
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

makeBucketPublic()

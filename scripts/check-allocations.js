// Script pour vérifier les allocations en base
const { createClient } = require('@supabase/supabase-js')

// Utiliser les vraies clés de production
const supabaseUrl = 'https://mdjtbzutahoxvfjbeqal.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kanRienV0YWhveHZmanJlYWwiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczNzI0NzQ4MCwiZXhwIjoyMDUyODIzNDgwfQ.8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkAllocations() {
  try {
    console.log('🔍 Vérification des allocations en base...')
    
    // Lister toutes les allocations
    const { data: allocations, error } = await supabase
      .from('invoice_allocations')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('❌ Erreur:', error)
      return
    }
    
    console.log('📊 Total allocations en base:', allocations?.length || 0)
    
    if (allocations && allocations.length > 0) {
      console.log('📋 Détail des allocations:')
      allocations.forEach((alloc, index) => {
        console.log(`  ${index + 1}. Invoice: ${alloc.invoice_id}`)
        console.log(`     User: ${alloc.user_id}`)
        console.log(`     Code: ${alloc.account_code}`)
        console.log(`     Label: ${alloc.label}`)
        console.log(`     Amount: ${alloc.amount}`)
        console.log(`     Created: ${alloc.created_at}`)
        console.log('')
      })
    } else {
      console.log('⚠️ Aucune allocation trouvée')
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

checkAllocations()

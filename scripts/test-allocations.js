// Script pour tester les allocations
const { createClient } = require('@supabase/supabase-js')

// Utiliser les vraies clés de production
const supabaseUrl = 'https://mdjtbzutahoxvfjbeqal.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kanRienV0YWhveHZmanJlYWwiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczNzI0NzQ4MCwiZXhwIjoyMDUyODIzNDgwfQ.8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q8Q'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testAllocations() {
  try {
    console.log('🔍 Test des allocations...')
    
    // Tester la connexion
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      console.error('❌ Erreur auth:', authError)
      return
    }
    console.log('✅ Utilisateur connecté:', user?.email)
    
    // Tester si la table existe
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'invoice_allocations')
    
    if (tablesError) {
      console.error('❌ Erreur vérification table:', tablesError)
      return
    }
    
    if (tables && tables.length > 0) {
      console.log('✅ Table invoice_allocations existe')
      
      // Tester une insertion
      const testAllocation = {
        invoice_id: 'test-invoice-id',
        user_id: user.id,
        account_code: '601000',
        label: 'Test allocation',
        amount: 100.50
      }
      
      const { data: insertData, error: insertError } = await supabase
        .from('invoice_allocations')
        .insert(testAllocation)
        .select()
      
      if (insertError) {
        console.error('❌ Erreur insertion test:', insertError)
      } else {
        console.log('✅ Insertion test réussie:', insertData)
      }
      
    } else {
      console.log('❌ Table invoice_allocations n\'existe pas')
      console.log('📝 Tables disponibles:')
      
      const { data: allTables, error: allTablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
      
      if (!allTablesError && allTables) {
        allTables.forEach(table => {
          console.log('  -', table.table_name)
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

testAllocations()

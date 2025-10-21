const { createClient } = require('@supabase/supabase-js')

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Variables d\'environnement manquantes')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl)
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey)
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createInvoiceAllocationsTable() {
  try {
    console.log('🔍 Création de la table invoice_allocations...')
    
    // Vérifier si la table existe déjà
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
      console.log('✅ Table invoice_allocations existe déjà')
      return
    }
    
    // Créer la table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS public.invoice_allocations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        account_code TEXT NOT NULL,
        label TEXT,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
    
    const { error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
    
    if (createError) {
      console.error('❌ Erreur création table:', createError)
      return
    }
    
    console.log('✅ Table invoice_allocations créée')
    
    // Créer les index
    const indexSQL = `
      CREATE INDEX IF NOT EXISTS idx_invoice_allocations_invoice_id ON public.invoice_allocations(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_invoice_allocations_user_id ON public.invoice_allocations(user_id);
    `
    
    const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexSQL })
    
    if (indexError) {
      console.error('❌ Erreur création index:', indexError)
    } else {
      console.log('✅ Index créés')
    }
    
    // Activer RLS
    const rlsSQL = `ALTER TABLE public.invoice_allocations ENABLE ROW LEVEL SECURITY;`
    const { error: rlsError } = await supabase.rpc('exec_sql', { sql: rlsSQL })
    
    if (rlsError) {
      console.error('❌ Erreur activation RLS:', rlsError)
    } else {
      console.log('✅ RLS activé')
    }
    
    console.log('🎉 Table invoice_allocations configurée avec succès!')
    
  } catch (error) {
    console.error('❌ Erreur générale:', error)
  }
}

createInvoiceAllocationsTable()

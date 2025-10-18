#!/usr/bin/env node

/**
 * Script de test final de l'application
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

async function testFinal() {
  console.log('🧪 Test final de l\'application...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    process.exit(1)
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Test 1: Connexion de base
    console.log('📡 Test de connexion...')
    const { data: users, error: usersError } = await supabase.from('users').select('*').limit(1)
    if (usersError) {
      console.log('❌ Erreur connexion users:', usersError.message)
    } else {
      console.log('✅ Connexion users OK')
    }
    
    // Test 2: Test des tables
    console.log('📋 Test des tables...')
    const tables = ['users', 'invoices', 'invoice_items']
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1)
        if (error) {
          console.log(`❌ Table ${table}:`, error.message)
        } else {
          console.log(`✅ Table ${table}: OK`)
        }
      } catch (err) {
        console.log(`❌ Table ${table}:`, err.message)
      }
    }
    
    // Test 3: Test des politiques RLS
    console.log('🔒 Test des politiques RLS...')
    const { data: rlsData, error: rlsError } = await supabase
      .from('invoices')
      .select('*')
      .limit(1)
    
    if (rlsError && rlsError.code === 'PGRST301') {
      console.log('✅ RLS activé (accès refusé sans authentification)')
    } else if (rlsError) {
      console.log('⚠️  RLS:', rlsError.message)
    } else {
      console.log('⚠️  RLS pourrait ne pas être activé')
    }
    
    // Test 4: Vérification des extensions
    console.log('🔧 Test des extensions...')
    const { data: extData, error: extError } = await supabase.rpc('exec_sql', {
      sql: "SELECT * FROM pg_extension WHERE extname = 'uuid-ossp';"
    })
    
    if (extError) {
      console.log('⚠️  Extension uuid-ossp:', extError.message)
    } else {
      console.log('✅ Extension uuid-ossp: OK')
    }
    
    console.log('🎉 Test final terminé!')
    console.log('🚀 L\'application devrait être accessible sur http://localhost:3000')
    console.log('📝 Vous pouvez maintenant:')
    console.log('   - Vous inscrire/connexion')
    console.log('   - Uploader des factures')
    console.log('   - Traiter les documents avec l\'IA')
    console.log('   - Rechercher dans vos documents')
    
  } catch (error) {
    console.error('❌ Erreur lors du test final:', error)
    process.exit(1)
  }
}

// Exécuter le script
testFinal()

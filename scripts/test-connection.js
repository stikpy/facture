#!/usr/bin/env node

/**
 * Script de test de connexion Supabase
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

async function testConnection() {
  console.log('🧪 Test de connexion Supabase...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    process.exit(1)
  }
  
  console.log('🔗 URL Supabase:', supabaseUrl)
  console.log('🔑 Clé API (début):', supabaseKey.substring(0, 20) + '...')
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Test de connexion basique
    console.log('📡 Test de connexion...')
    const { data, error } = await supabase.from('users').select('count').limit(1)
    
    if (error) {
      console.log('⚠️  Erreur lors du test:', error.message)
      if (error.code === 'PGRST116') {
        console.log('✅ Connexion OK - Table users n\'existe pas encore (normal)')
      } else {
        console.log('❌ Erreur de connexion:', error)
        process.exit(1)
      }
    } else {
      console.log('✅ Connexion réussie!')
    }
    
    // Test des tables
    console.log('📋 Vérification des tables...')
    
    const tables = ['users', 'invoices', 'invoice_items']
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase.from(table).select('*').limit(1)
        if (error && error.code === 'PGRST116') {
          console.log(`❌ Table ${table} n'existe pas`)
        } else {
          console.log(`✅ Table ${table} existe`)
        }
      } catch (err) {
        console.log(`❌ Erreur avec la table ${table}:`, err.message)
      }
    }
    
    console.log('🎉 Test de connexion terminé!')
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error)
    process.exit(1)
  }
}

// Exécuter le script
testConnection()

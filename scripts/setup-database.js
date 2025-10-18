#!/usr/bin/env node

/**
 * Script de configuration de la base de données Supabase
 * Exécute les migrations SQL pour créer les tables nécessaires
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

async function setupDatabase() {
  console.log('🚀 Configuration de la base de données Supabase...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    console.log('Assurez-vous d\'avoir configuré:')
    console.log('- NEXT_PUBLIC_SUPABASE_URL')
    console.log('- SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Lire le fichier de migration
    const migrationPath = path.join(__dirname, '../supabase/migrations/001_initial_schema.sql')
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')
    
    console.log('📄 Exécution des migrations...')
    
    // Exécuter la migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    })
    
    if (error) {
      console.error('❌ Erreur lors de l\'exécution des migrations:', error)
      process.exit(1)
    }
    
    console.log('✅ Migrations exécutées avec succès!')
    console.log('🎉 Base de données configurée et prête à l\'emploi!')
    
  } catch (error) {
    console.error('❌ Erreur lors de la configuration:', error)
    process.exit(1)
  }
}

// Exécuter le script
setupDatabase()

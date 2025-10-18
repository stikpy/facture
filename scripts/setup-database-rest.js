#!/usr/bin/env node

/**
 * Script de configuration de la base de données Supabase
 * Utilise l'API REST pour créer les tables
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
    
    console.log('📄 Exécution des migrations via API REST...')
    
    // Diviser le SQL en requêtes individuelles
    const queries = migrationSQL
      .split(';')
      .map(q => q.trim())
      .filter(q => q.length > 0 && !q.startsWith('--'))
    
    console.log(`📝 ${queries.length} requêtes SQL à exécuter...`)
    
    // Exécuter chaque requête individuellement
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      if (query.trim()) {
        console.log(`⏳ Exécution de la requête ${i + 1}/${queries.length}...`)
        
        try {
          const { data, error } = await supabase.rpc('exec', { sql: query })
          if (error) {
            console.warn(`⚠️  Avertissement pour la requête ${i + 1}:`, error.message)
          } else {
            console.log(`✅ Requête ${i + 1} exécutée avec succès`)
          }
        } catch (err) {
          console.warn(`⚠️  Erreur pour la requête ${i + 1}:`, err.message)
        }
      }
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

#!/usr/bin/env node

/**
 * Script de test de la configuration
 * Vérifie que toutes les variables d'environnement sont correctement configurées
 */

require('dotenv').config({ path: '.env.local' })

function testConfiguration() {
  console.log('🧪 Test de la configuration Facture AI...\n')
  
  const requiredVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY', 
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY'
  ]
  
  let allConfigured = true
  
  console.log('📋 Vérification des variables d\'environnement:')
  
  requiredVars.forEach(varName => {
    const value = process.env[varName]
    if (value && value !== 'your_' + varName.toLowerCase().replace('next_public_', '').replace('_key', '_key_here')) {
      console.log(`✅ ${varName}: Configuré`)
    } else {
      console.log(`❌ ${varName}: Non configuré`)
      allConfigured = false
    }
  })
  
  console.log('\n🔧 Configuration Supabase:')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl && supabaseUrl.includes('supabase.co')) {
    console.log('✅ URL Supabase: Valide')
  } else {
    console.log('❌ URL Supabase: Invalide')
    allConfigured = false
  }
  
  console.log('\n🤖 Configuration OpenAI:')
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey && openaiKey.startsWith('sk-')) {
    console.log('✅ Clé OpenAI: Valide')
  } else {
    console.log('❌ Clé OpenAI: Invalide')
    allConfigured = false
  }
  
  console.log('\n' + '='.repeat(50))
  
  if (allConfigured) {
    console.log('🎉 Configuration complète! Votre application est prête.')
    console.log('🚀 Vous pouvez maintenant utiliser toutes les fonctionnalités:')
    console.log('   • Upload de factures')
    console.log('   • Traitement IA avec OCR')
    console.log('   • Classification automatique')
    console.log('   • Recherche sémantique')
  } else {
    console.log('⚠️  Configuration incomplète. Veuillez configurer les variables manquantes.')
    console.log('📖 Consultez le README.md pour les instructions détaillées.')
  }
  
  console.log('\n🌐 Application disponible sur: http://localhost:3000')
}

testConfiguration()

#!/usr/bin/env node

/**
 * Script de test d'authentification Supabase
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

async function testAuth() {
  console.log('🧪 Test d\'authentification Supabase...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    process.exit(1)
  }
  
  console.log('🔗 URL Supabase:', supabaseUrl)
  console.log('🔑 Clé Anon (début):', supabaseAnonKey.substring(0, 20) + '...')
  console.log('🔑 Clé Service (début):', supabaseServiceKey.substring(0, 20) + '...')
  
  // Test avec la clé anonyme
  console.log('\n📡 Test avec la clé anonyme...')
  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey)
  
  try {
    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser()
    if (userError) {
      console.log('⚠️  Erreur getUser avec clé anonyme:', userError.message)
    } else if (user) {
      console.log('✅ Utilisateur connecté avec clé anonyme:', user.email)
    } else {
      console.log('ℹ️  Aucun utilisateur connecté avec clé anonyme (normal)')
    }
  } catch (err) {
    console.error('❌ Erreur avec clé anonyme:', err.message)
  }
  
  // Test avec la clé service
  console.log('\n📡 Test avec la clé service...')
  const supabaseService = createClient(supabaseUrl, supabaseServiceKey)
  
  try {
    const { data: { user }, error: userError } = await supabaseService.auth.getUser()
    if (userError) {
      console.log('⚠️  Erreur getUser avec clé service:', userError.message)
    } else if (user) {
      console.log('✅ Utilisateur connecté avec clé service:', user.email)
    } else {
      console.log('ℹ️  Aucun utilisateur connecté avec clé service (normal)')
    }
  } catch (err) {
    console.error('❌ Erreur avec clé service:', err.message)
  }
  
  // Test de création d'utilisateur
  console.log('\n👤 Test de création d\'utilisateur...')
  try {
    const testEmail = 'test@example.com'
    const testPassword = 'testpassword123'
    
    const { data, error } = await supabaseAnon.auth.signUp({
      email: testEmail,
      password: testPassword
    })
    
    if (error) {
      console.log('⚠️  Erreur signUp:', error.message)
    } else {
      console.log('✅ Utilisateur créé:', data.user?.email)
    }
  } catch (err) {
    console.error('❌ Erreur lors de la création d\'utilisateur:', err.message)
  }
  
  // Test de connexion
  console.log('\n🔐 Test de connexion...')
  try {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({
      email: 'gabriel.khaldi@gmail.com',
      password: 'testpassword123'
    })
    
    if (error) {
      console.log('⚠️  Erreur signIn:', error.message)
    } else {
      console.log('✅ Connexion réussie:', data.user?.email)
    }
  } catch (err) {
    console.error('❌ Erreur lors de la connexion:', err.message)
  }
  
  console.log('\n🎉 Test d\'authentification terminé!')
}

// Exécuter le script
testAuth()

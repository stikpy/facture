#!/usr/bin/env node

/**
 * Script de test du flux d'authentification complet
 * Teste l'inscription, la connexion et l'upload
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

async function testAuthFlow() {
  console.log('🧪 Test du flux d\'authentification complet...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    process.exit(1)
  }
  
  console.log('🔗 URL Supabase:', supabaseUrl)
  console.log('🔑 Clé Anon (début):', supabaseAnonKey.substring(0, 20) + '...')
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  
  // Test 1: Inscription
  console.log('\n📝 Test 1: Inscription d\'un utilisateur')
  const testEmail = `test-${Date.now()}@example.com`
  const testPassword = 'testpassword123'
  
  try {
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    })
    
    if (signUpError) {
      console.log('⚠️  Erreur signUp:', signUpError.message)
    } else {
      console.log('✅ Utilisateur créé:', signUpData.user?.email)
      console.log('📧 Confirmation email requise:', signUpData.user?.email_confirmed_at ? 'Non' : 'Oui')
    }
  } catch (err) {
    console.error('❌ Erreur lors de l\'inscription:', err.message)
  }
  
  // Test 2: Connexion
  console.log('\n🔐 Test 2: Connexion')
  try {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })
    
    if (signInError) {
      console.log('⚠️  Erreur signIn:', signInError.message)
    } else {
      console.log('✅ Connexion réussie:', signInData.user?.email)
      console.log('🔑 Session active:', !!signInData.session)
    }
  } catch (err) {
    console.error('❌ Erreur lors de la connexion:', err.message)
  }
  
  // Test 3: Vérification de la session
  console.log('\n👤 Test 3: Vérification de la session')
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError) {
      console.log('⚠️  Erreur getUser:', userError.message)
    } else if (user) {
      console.log('✅ Utilisateur dans la session:', user.email)
    } else {
      console.log('ℹ️  Aucun utilisateur dans la session')
    }
  } catch (err) {
    console.error('❌ Erreur lors de la vérification de session:', err.message)
  }
  
  // Test 4: Test de l'API upload (simulation)
  console.log('\n📤 Test 4: Simulation de l\'API upload')
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session) {
      console.log('✅ Session disponible pour l\'API')
      console.log('🔑 Token (début):', session.access_token.substring(0, 20) + '...')
    } else {
      console.log('❌ Aucune session disponible pour l\'API')
    }
  } catch (err) {
    console.error('❌ Erreur lors de la récupération de session:', err.message)
  }
  
  console.log('\n🎉 Test du flux d\'authentification terminé!')
  console.log('\n💡 Pour tester l\'upload complet:')
  console.log('1. Ouvrez http://localhost:3000')
  console.log('2. Créez un compte ou connectez-vous')
  console.log('3. Essayez d\'uploader un fichier')
  console.log('4. Vérifiez les logs dans la console du navigateur et du serveur')
}

// Exécuter le script
testAuthFlow()

require('dotenv').config({ path: '.env.local' });

console.log('🔧 Test des vraies clés Supabase:');
console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('Anon Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Présente (' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length + ' caractères)' : 'Manquante');

if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.log('Début de la clé:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.substring(0, 20) + '...');
}

const { createClient } = require('@supabase/supabase-js');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Variables d\'environnement manquantes');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🧪 Test de connexion avec les vraies clés...');

supabase.auth.signInWithOtp({
  email: 'test@example.com',
  options: {
    emailRedirectTo: 'http://localhost:3000/auth/callback'
  }
}).then(result => {
  console.log('✅ Magic link envoyé avec succès');
  console.log('Résultat:', result);
}).catch(err => {
  console.error('❌ Erreur magic link:', err.message);
  console.error('Détails:', err);
});

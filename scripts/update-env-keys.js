const fs = require('fs');
const path = require('path');

console.log('🔧 Script pour mettre à jour les clés Supabase');
console.log('');
console.log('1. Allez sur https://supabase.com/dashboard');
console.log('2. Sélectionnez votre projet: mdjtbzutahoxvfjbeqal');
console.log('3. Allez dans Settings → API');
console.log('4. Copiez les vraies clés');
console.log('');
console.log('Ensuite, exécutez:');
console.log('node scripts/update-env-keys.js "VOTRE_VRAIE_ANON_KEY" "VOTRE_VRAIE_SERVICE_ROLE_KEY"');
console.log('');

const args = process.argv.slice(2);

if (args.length !== 2) {
  console.log('❌ Usage: node scripts/update-env-keys.js "ANON_KEY" "SERVICE_ROLE_KEY"');
  process.exit(1);
}

const [anonKey, serviceRoleKey] = args;

// Vérifier que les clés commencent par eyJ
if (!anonKey.startsWith('eyJ') || !serviceRoleKey.startsWith('eyJ')) {
  console.log('❌ Les clés doivent commencer par "eyJ"');
  process.exit(1);
}

const envContent = `# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://mdjtbzutahoxvfjbeqal.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}

# Service Role Key (pour les opérations admin)
SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}

# OpenAI Configuration  
OPENAI_API_KEY=your_openai_api_key_here

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
UPLOAD_MAX_SIZE=10485760
`;

fs.writeFileSync('.env.local', envContent);
console.log('✅ Fichier .env.local mis à jour avec les vraies clés');
console.log('🔄 Redémarrez le serveur: npm run dev');

import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  console.log('🔧 [SUPABASE-CLIENT] Configuration:')
  console.log('🌐 [SUPABASE-CLIENT] URL:', supabaseUrl)
  console.log('🔑 [SUPABASE-CLIENT] Anon Key:', supabaseAnonKey ? 'Présente (' + supabaseAnonKey.length + ' caractères)' : 'Manquante')
  console.log('🔑 [SUPABASE-CLIENT] Anon Key début:', supabaseAnonKey?.substring(0, 20) + '...')
  
  if (!supabaseUrl) {
    console.error('❌ [SUPABASE-CLIENT] NEXT_PUBLIC_SUPABASE_URL manquant')
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  }
  
  if (!supabaseAnonKey) {
    console.error('❌ [SUPABASE-CLIENT] NEXT_PUBLIC_SUPABASE_ANON_KEY manquant')
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }
  
  const client = createBrowserClient(supabaseUrl, supabaseAnonKey)
  console.log('✅ [SUPABASE-CLIENT] Client créé avec succès')
  
  return client
}

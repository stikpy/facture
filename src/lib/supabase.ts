import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://demo.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'demo_key'

// Singleton pattern pour éviter les instances multiples
let supabaseInstance: ReturnType<typeof createClient> | null = null
let supabaseAdminInstance: ReturnType<typeof createClient> | null = null

// Client-side Supabase client (singleton)
export const supabase = (() => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  }
  return supabaseInstance
})()

// Service role client for admin operations (singleton)
export const supabaseAdmin = (() => {
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'demo_service_key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }
  return supabaseAdminInstance
})()

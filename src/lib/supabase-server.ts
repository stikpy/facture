import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Server-side Supabase client selon les bonnes pratiques
export const createServerSupabaseClient = async () => {
  const cookieStore = await cookies()
  
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch (error) {
          // Les cookies sont déjà définis
        }
      },
      deleteAll(cookiesToDelete) {
        try {
          cookiesToDelete.forEach(({ name, options }) => {
            cookieStore.set(name, '', { ...options, maxAge: 0 })
          })
        } catch (error) {
          // Les cookies sont déjà supprimés
        }
      },
    },
  })
}

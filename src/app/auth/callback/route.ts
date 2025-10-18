import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import type { Session } from '@supabase/supabase-js'

interface AuthCallbackPayload {
  event: string
  session: Session | null
}

// Gestion du retour du magic link
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Redirection vers la page principale après connexion réussie
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // En cas d'erreur, rediriger vers la page de connexion
  return NextResponse.redirect(new URL('/auth', request.url))
}

// Callback pour les événements d'authentification côté client
export async function POST(request: Request) {
  const supabase = await createClient()
  const { event, session }: AuthCallbackPayload = await request.json()

  if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
  }

  if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
    await supabase.auth.signOut()
  }

  return NextResponse.json({ success: true })
}

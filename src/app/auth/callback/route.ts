import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { Session } from '@supabase/supabase-js'

interface AuthCallbackPayload {
  event: string
  session: Session | null
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
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

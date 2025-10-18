import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const { data: { user } } = await supabase.auth.getUser()

  console.log('🔍 [MIDDLEWARE] Path:', request.nextUrl.pathname)
  console.log('🔍 [MIDDLEWARE] User:', user ? `${user.email} (${user.id})` : 'Non connecté')

  // Note: La redirection vers /auth est maintenant gérée par la page principale
  // Le middleware se contente de vérifier l'authentification sans rediriger

  // Si l'utilisateur est connecté et est sur la page d'auth, rediriger vers le dashboard
  if (
    user &&
    request.nextUrl.pathname.startsWith('/auth')
  ) {
    console.log('🔄 [MIDDLEWARE] Redirection vers / (utilisateur connecté)')
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // This ensures proper cookie handling and session management.
  return supabaseResponse
}

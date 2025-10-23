import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Éviter les 405 sur la racine: répondre 204 pour POST / (bruit de certains navigateurs/extensions)
  if (request.method === 'POST' && request.nextUrl.pathname === '/') {
    return new NextResponse(null, { status: 204 })
  }

  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options?: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options?: CookieOptions) {
          response.cookies.set({ name, value: '', ...options, maxAge: 0 })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  console.log('🔍 [MIDDLEWARE] Path:', request.nextUrl.pathname)
  console.log('🔍 [MIDDLEWARE] User:', user ? `${user.email} (${user.id})` : 'Non connecté')

  if (user && request.nextUrl.pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

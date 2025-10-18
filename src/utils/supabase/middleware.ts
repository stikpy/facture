import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options?: CookieOptions) {
          try {
            request.cookies.set(name, value)
            supabaseResponse = NextResponse.next({ request })
            supabaseResponse.cookies.set(name, value, options)
          } catch {
            // ignore if called in server component
          }
        },
        remove(name: string, options?: CookieOptions) {
          try {
            request.cookies.set(name, '')
            supabaseResponse = NextResponse.next({ request })
            supabaseResponse.cookies.set(name, '', { ...options, maxAge: 0 })
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  console.log('🔍 [MIDDLEWARE] Path:', request.nextUrl.pathname)
  console.log('🔍 [MIDDLEWARE] User:', user ? `${user.email} (${user.id})` : 'Non connecté')

  if (user && request.nextUrl.pathname.startsWith('/auth')) {
    console.log('🔄 [MIDDLEWARE] Redirection vers / (utilisateur connecté)')
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: 'i-home' },
  { href: '/invoices', label: 'Mes factures', icon: 'i-file-text' },
  { href: '/suppliers', label: 'Fournisseurs', icon: 'i-users' },
  { href: '/products', label: 'Produits', icon: 'i-package' },
  { href: '/stats', label: 'Stats', icon: 'i-chart' },
  { href: '/chat', label: 'Assistant', icon: 'i-message-circle' },
  { href: '/org', label: 'Organisation', icon: 'i-building' },
]

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const hideSidebar = pathname?.startsWith('/auth')

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }

  const linkClass = (href: string, opts: { collapsed?: boolean; extra?: string } = {}) => {
    const { collapsed: isCollapsed = false, extra = '' } = opts
    return `flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
      isCollapsed ? 'justify-center text-gray-700 hover:bg-gray-100' :
      `${isActive(href) ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-500 font-medium' : 'text-gray-700 hover:bg-gray-100'}`
    } ${extra}`
  }

  const renderLinks = (opts?: { collapsed?: boolean; extra?: string }) => (
    navItems.map(item => (
      <Link key={item.href} href={item.href} className={linkClass(item.href, opts)}>
        <span className={`${item.icon} w-4 h-4`} aria-hidden="true" />
        {!(opts?.collapsed) && <span>{item.label}</span>}
      </Link>
    ))
  )

  return (
    <div className="min-h-screen flex">
      {!hideSidebar && (
        <>
          <aside className={`hidden md:flex flex-col border-r bg-white ${collapsed ? 'w-14' : 'w-56'} transition-all`}>
            <div className="p-2 md:p-4 font-semibold text-gray-900 flex items-center justify-between">
              <div className={`${collapsed ? 'hidden' : 'block'}`}>Facture AI<OrgBadge /></div>
              <button
                aria-label="Réduire la barre latérale"
                className="text-gray-500 hover:text-gray-800 rounded px-2 py-1 border"
                onClick={() => setCollapsed(v => !v)}
                title={collapsed ? 'Déplier' : 'Replier'}
              >
                {collapsed ? '»' : '«'}
              </button>
            </div>
            <nav className={`px-2 space-y-1 flex flex-col ${collapsed ? 'items-center' : ''}`}>
              {renderLinks({ collapsed })}
            </nav>
          </aside>

          <aside
            className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-white border-r shadow-lg transition-transform duration-200 ease-in-out md:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            aria-hidden={!mobileOpen}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="font-semibold text-gray-900">Facture AI<OrgBadge /></div>
              <button
                aria-label="Fermer le menu"
                className="p-2 rounded text-gray-500 hover:text-gray-800"
                onClick={() => setMobileOpen(false)}
              >
                <span className="sr-only">Fermer</span>
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="px-4 py-4 space-y-1">
              {renderLinks({ extra: 'w-full' })}
            </nav>
          </aside>
          {mobileOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/30 md:hidden"
              role="button"
              aria-label="Fermer le menu"
              onClick={() => setMobileOpen(false)}
            />
          )}
        </>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        {!hideSidebar && (
          <header className="flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
            <button
              aria-label="Ouvrir le menu"
              className="p-2 rounded text-gray-600 hover:text-gray-900"
              onClick={() => setMobileOpen(true)}
            >
              <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
            <div className="flex flex-col text-sm font-semibold text-gray-900">
              <span>Facture AI</span>
              <OrgBadge />
            </div>
            <div className="w-8" aria-hidden="true" />
          </header>
        )}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  )
}

function OrgBadge() {
  const [name, setName] = useState<string>('')
  useEffect(() => {
    let mounted = true
    fetch('/api/orgs').then(r => r.json()).then(d => {
      if (!mounted) return
      const org = (d.organizations || []).find((o: any) => o.id === d.activeOrganizationId)
      setName(org?.name || '')
    }).catch(()=>{})
    return () => { mounted = false }
  }, [])
  if (!name) return null
  return <div className="text-xs text-gray-500 font-normal">{name}</div>
}



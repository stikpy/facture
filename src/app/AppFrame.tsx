'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const hideSidebar = pathname?.startsWith('/auth')
  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname?.startsWith(href)
  }
  const linkClass = (href: string) => `flex items-center gap-2 px-3 py-2 text-sm rounded ${
    collapsed ? 'justify-center text-gray-700 hover:bg-gray-100' :
    `${isActive(href) ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-500 font-medium' : 'text-gray-700 hover:bg-gray-100'}`
  }`

  return (
    <div className="min-h-screen flex">
      {!hideSidebar && (
        <aside className={`hidden md:flex flex-col border-r bg-white ${collapsed ? 'w-14' : 'w-56'} transition-all`}>
          <div className="p-2 md:p-4 font-semibold text-gray-900 flex items-center justify-between">
            <div className={`${collapsed ? 'hidden' : 'block'}`}>Facture AI<OrgBadge /></div>
            <button
              aria-label="Toggle sidebar"
              className="text-gray-500 hover:text-gray-800 rounded px-2 py-1 border"
              onClick={() => setCollapsed(v => !v)}
              title={collapsed ? 'Déplier' : 'Replier'}
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>
          <nav className={`px-2 space-y-1 flex flex-col ${collapsed ? 'items-center' : ''}`}>
            <Link href="/" className={linkClass('/')}
            >
              <span className="i-home w-4 h-4" />
              {!collapsed && <span>Dashboard</span>}
            </Link>
            <Link href="/invoices" className={linkClass('/invoices')}>
              <span className="i-file-text w-4 h-4" />
              {!collapsed && <span>Mes factures</span>}
            </Link>
            <Link href="/suppliers" className={linkClass('/suppliers')}>
              <span className="i-users w-4 h-4" />
              {!collapsed && <span>Fournisseurs</span>}
            </Link>
            <Link href="/stats" className={linkClass('/stats')}>
              <span className="i-chart w-4 h-4" />
              {!collapsed && <span>Stats</span>}
            </Link>
            <Link href="/org" className={linkClass('/org')}>
              <span className="i-building w-4 h-4" />
              {!collapsed && <span>Organisation</span>}
            </Link>
          </nav>
        </aside>
      )}
      <main className="flex-1 min-w-0">
        {children}
      </main>
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



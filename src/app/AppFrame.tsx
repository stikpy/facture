'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const hideSidebar = pathname?.startsWith('/auth')

  return (
    <div className="min-h-screen flex">
      {!hideSidebar && (
        <aside className={`hidden md:flex flex-col border-r bg-white ${collapsed ? 'w-12' : 'w-56'} transition-all`}>
          <div className="p-2 md:p-4 font-semibold text-gray-900 flex items-center justify-between">
            <div className={`${collapsed ? 'hidden' : 'block'}`}>Facture AI<OrgBadge /></div>
            <button
              aria-label="Toggle sidebar"
              className="text-gray-500 hover:text-gray-800 rounded px-2 py-1 border"
              onClick={() => setCollapsed(v => !v)}
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>
          <nav className={`px-2 space-y-1 ${collapsed ? 'items-center' : ''}`}>
            <Link href="/" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Dashboard</Link>
            <Link href="/invoices" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Mes factures</Link>
            <Link href="/suppliers" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Fournisseurs</Link>
            <Link href="/stats" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Stats</Link>
            <Link href="/org" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Organisation</Link>
          </nav>
        </aside>
      )}
      <main className="flex-1">
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



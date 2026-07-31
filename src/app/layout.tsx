import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Cormorant_Garamond, Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-display',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'BidSmart — Trust Tai',
  description: 'DNA-based job scoring and proposal pipeline for Upwork',
  icons: {
    icon: [
      { url: '/favicons/favicon-32x32.png?v=4', type: 'image/png', sizes: '32x32' },
      { url: '/favicons/favicon-16x16.png?v=4', type: 'image/png', sizes: '16x16' },
    ],
    shortcut: '/favicons/favicon.ico?v=4',
    apple: '/favicons/apple-touch-icon.png?v=4',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${cormorantGaramond.variable} ${jetBrainsMono.variable} min-h-screen bg-[#FCFAF6] text-[#01051B] antialiased`}>
        <div className="flex min-h-screen">
          {/* Desktop Sidebar */}
          <aside className="hidden md:flex w-60 border-r border-[#DADEE5] bg-[#01051B] fixed inset-y-0 left-0 z-40 flex-col">
            {/* Logo block */}
            <div className="px-6 py-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Image
                  src="/brand/trust-tai-logo-white.png"
                  alt="Trust Tai"
                  width={534}
                  height={97}
                  className="h-7 w-auto"
                  priority
                />
                <div>
                  <p className="text-white/40 text-[10px] font-mono uppercase tracking-wider leading-tight">Bid Smart</p>
                </div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              <NavLink href="/" label="Dashboard" icon="layout" />
              <NavLink href="/jobs" label="Job Feed" icon="briefcase" />
              <NavLink href="/paste" label="Paste a Job" icon="clipboard" />
              <NavLink href="/proposals" label="Proposals" icon="send" />
              <NavLink href="/dna" label="Job DNA" icon="dna" />
              <NavLink href="/contracts" label="History" icon="archive" />
              <NavLink href="/settings" label="Settings" icon="cog" />
            </nav>

            {/* User */}
            <div className="px-4 py-4 border-t border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white">
                  TS
                </div>
                <div>
                  <p className="text-white text-xs font-medium">Tai Shobajo</p>
                  <p className="text-white/40 text-[10px] font-mono uppercase tracking-wider">Admin</p>
                </div>
              </div>
            </div>
          </aside>

          {/* Mobile top bar */}
          <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#01051B] border-b border-white/10">
            <div className="px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5 mb-2">
                <Image
                  src="/brand/trust-tai-logo-white.png"
                  alt="Trust Tai"
                  width={534}
                  height={97}
                  className="h-5 w-auto shrink-0"
                  priority
                />
                <span className="truncate text-white/40 font-mono text-[10px] uppercase tracking-wider">Bid Smart</span>
              </div>
              <nav className="grid grid-cols-4 gap-1">
                <MobileNav href="/" label="Home" />
                <MobileNav href="/jobs" label="Jobs" />
                <MobileNav href="/paste" label="Paste" />
                <MobileNav href="/proposals" label="Proposals" />
                <MobileNav href="/dna" label="DNA" />
                <MobileNav href="/contracts" label="History" />
                <MobileNav href="/settings" label="Settings" />
              </nav>
            </div>
          </div>

          {/* Main */}
          <main className="flex-1 md:ml-60 pt-28 md:pt-0">
            <div className="px-4 py-6 sm:px-5 md:px-10 md:py-10 max-w-[1280px] mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const icons: Record<string, string> = {
    layout: '⊞',
    briefcase: '◈',
    clipboard: '⊡',
    send: '↗',
    dna: '⬡',
    archive: '▤',
    cog: '⚙',
  }
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-[13px] text-white/50 hover:text-white hover:bg-white/5 transition-colors"
    >
      <span className="text-sm w-4 text-center opacity-60">{icons[icon] || '•'}</span>
      <span>{label}</span>
    </Link>
  )
}

function MobileNav({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-center text-[11px] font-medium text-white/70 transition-colors hover:border-white/20 hover:text-white">
      {label}
    </Link>
  )
}

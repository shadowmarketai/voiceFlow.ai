/**
 * DashboardLayout — VoiceFlow AI (Light Theme)
 * Premium SaaS layout inspired by Linear / Vercel / Stripe
 * - Clean white sidebar with indigo accent
 * - Glass header with subtle blur
 * - Smooth transitions, subtle 3D accents
 * - NO dark mode — light-only
 */

import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import GlobalSearch from '../components/GlobalSearch';
import NotificationsPanel from '../components/NotificationsPanel';
import HeaderWalletPill from '../components/HeaderWalletPill';
import ErrorBoundary from '../components/ErrorBoundary';
import { defaultTheme } from '../config/theme';
import {
  LayoutDashboard, Bot, Wand2, BookOpen, Mic, Globe,
  PhoneOutgoing, MessageSquare, Radio, BarChart3, FileAudio,
  FlaskConical, Gauge, Puzzle, Code, CreditCard, Wallet, Settings, Users,
  Search, Menu, LogOut, User, HelpCircle,
  ChevronDown, ChevronsLeft, ChevronsRight, Command, KeyRound, Sparkles,
  Bell, X,
} from 'lucide-react';

/* ─── Navigation definition ─────────────────────────────────────────── */

const navSections = [
  {
    label: 'MAIN',
    items: [
      { icon: LayoutDashboard, name: 'Dashboard',  path: '/voice/dashboard-v2' },
      { icon: Bot,             name: 'Agents',      path: '/voice/agents-list' },
      { icon: Radio,           name: 'Live Calls',  path: '/voice/live-calls' },
    ],
  },
  {
    label: 'BUILD',
    items: [
      { icon: BookOpen, name: 'Knowledge Base',       path: '/voice/knowledge' },
      { icon: Mic,      name: 'Voice Library & Studio', path: '/voice/studio' },
    ],
  },
  {
    label: 'DEPLOY',
    items: [
      { icon: Globe,         name: 'Channels',       path: '/voice/channels' },
      { icon: PhoneOutgoing, name: 'Campaigns',      path: '/voice/campaigns' },
    ],
  },
  {
    label: 'MONITOR',
    items: [
      { icon: MessageSquare, name: 'Conversations', path: '/voice/call-logs' },
      { icon: FileAudio,     name: 'Recordings',     path: '/voice/recordings' },
      { icon: FlaskConical,  name: 'Testing',        path: '/voice/testing' },
      { icon: Gauge,         name: 'Quality',        path: '/voice/quality', superAdminOnly: true },
    ],
  },
  {
    label: 'CONNECT',
    items: [
      { icon: Puzzle, name: 'Integrations',    path: '/voice/integrations' },
      // API & Developer merged into Channels page — user menu link below still works via redirect.
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { icon: Wallet,     name: 'Wallet',     path: '/voice/wallet' },
      { icon: CreditCard, name: 'My Pricing', path: '/voice/tenant-pricing', tenantOnly: true },
      { icon: Users,      name: 'Team',       path: '/voice/team',           tenantOnly: true },
    ],
  },
];

/** Flat list for breadcrumb / title lookup */
const allNavItems = navSections.flatMap((s) => s.items);

/* ─── Context ────────────────────────────────────────────────────────── */

export const AppContext = createContext();
export const useApp = () => useContext(AppContext);

/* ─── Utility ────────────────────────────────────────────────────────── */

const cn = (...c) => c.filter(Boolean).join(' ');

/* ─── Layout ─────────────────────────────────────────────────────────── */

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const theme = defaultTheme;

  /* ── State ──────────────────────────────────────────────────── */

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('voiceflow_sidebar_collapsed') === 'true'
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  /* ── Derived ────────────────────────────────────────────────── */

  const currentNavItem = useMemo(() => {
    let best = null;
    for (const item of allNavItems) {
      if (location.pathname.startsWith(item.path)) {
        if (!best || item.path.length > best.path.length) {
          best = item;
        }
      }
    }
    return best;
  }, [location.pathname]);

  const currentSection = useMemo(() => {
    if (!currentNavItem) return null;
    return navSections.find((s) => s.items.includes(currentNavItem));
  }, [currentNavItem]);

  /* ── Tenant branding ────────────────────────────────────────── */

  const tb = user?.tenant || {};
  const brandName = tb.app_name || tb.name || 'VoiceFlow AI';
  const brandTagline = tb.tagline || 'Voice AI Platform';
  const brandLogo = tb.logo_url || '';
  const brandPrimary = tb.primary_color || '#6366f1';
  const brandSecondary = tb.secondary_color || '#1e293b';
  const brandAccent = tb.accent_color || '#8b5cf6';
  const brandFont = tb.font_family || 'Inter';

  /* ── Effects ────────────────────────────────────────────────── */

  useEffect(() => {
    localStorage.setItem('voiceflow_sidebar_collapsed', collapsed);
  }, [collapsed]);

  useEffect(() => {
    if (brandName) document.title = brandName;
    if (tb.favicon_url) {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = tb.favicon_url;
    }
  }, [brandName, tb.favicon_url]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', brandPrimary);
    root.style.setProperty('--brand-secondary', brandSecondary);
    root.style.setProperty('--brand-accent', brandAccent);
    root.style.setProperty('--brand-font', brandFont);
    // Remove dark class to ensure light-only
    root.classList.remove('dark');
  }, [brandPrimary, brandSecondary, brandAccent, brandFont]);

  // Keyboard shortcuts: Cmd+K search, Cmd+[ collapse
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    if (userMenuOpen) {
      const handler = () => setUserMenuOpen(false);
      setTimeout(() => document.addEventListener('click', handler), 0);
      return () => document.removeEventListener('click', handler);
    }
  }, [userMenuOpen]);

  // Close mobile drawer on route change
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';

  /* ── Sidebar nav item ───────────────────────────────────────── */

  const SidebarNavItem = ({ item, mobile = false }) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
    const isCollapsedDesktop = collapsed && !mobile;

    return (
      <Link
        to={item.path}
        title={isCollapsedDesktop ? item.name : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-200',
          isCollapsedDesktop ? 'justify-center h-10 w-10 mx-auto' : 'h-9 px-3',
          isActive
            ? 'text-white'
            : 'text-slate-500 hover:text-slate-800 hover:bg-indigo-50/60'
        )}
        style={
          isActive
            ? {
                background: `linear-gradient(135deg, var(--brand-primary), var(--brand-accent, var(--brand-primary)))`,
                boxShadow: '0 4px 12px -2px rgba(99, 102, 241, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
              }
            : undefined
        }
      >
        <Icon
          className="w-[17px] h-[17px] flex-shrink-0 relative z-10"
          strokeWidth={isActive ? 2.4 : 1.8}
        />
        {!isCollapsedDesktop && (
          <span className="truncate relative z-10">{item.name}</span>
        )}
        {isActive && !isCollapsedDesktop && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80 relative z-10" />
        )}
      </Link>
    );
  };

  /* ── Sidebar component ──────────────────────────────────────── */

  const Sidebar = ({ mobile = false }) => {
    const isCollapsedDesktop = collapsed && !mobile;

    return (
      <aside
        className={cn(
          'flex flex-col bg-white border-r border-slate-100',
          mobile
            ? 'w-72 h-full'
            : cn('hidden lg:flex h-screen sticky top-0', collapsed ? 'w-[68px]' : 'w-60'),
          'transition-[width] duration-200 ease-out'
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            'flex items-center h-[60px] border-b border-slate-100',
            isCollapsedDesktop ? 'justify-center px-2' : 'px-4 gap-3'
          )}
        >
          <Link to="/" className="flex items-center gap-2.5 min-w-0" title={brandTagline}>
            {brandLogo ? (
              <img
                src={brandLogo}
                alt={brandName}
                className="w-8 h-8 rounded-lg object-contain"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${brandPrimary}, ${brandAccent})`,
                  boxShadow: `0 4px 12px -2px ${brandPrimary}40`,
                }}
              >
                <Sparkles className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
            )}
            {!isCollapsedDesktop && (
              <div className="min-w-0">
                <div
                  className="text-sm font-semibold tracking-tight text-slate-900 truncate"
                  style={{ fontFamily: brandFont }}
                >
                  {brandName}
                </div>
                {brandTagline && (
                  <div className="text-[10px] text-slate-400 truncate leading-tight">
                    {brandTagline}
                  </div>
                )}
              </div>
            )}
          </Link>
        </div>

        {/* Quick search trigger */}
        {!isCollapsedDesktop && (
          <div className="px-3 pt-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-150 text-[12px] text-slate-400 hover:border-slate-300 hover:bg-slate-100/60 transition-all duration-150"
              style={{ borderColor: 'rgba(0,0,0,0.06)' }}
            >
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">Search...</span>
              <kbd className="hidden sm:flex items-center gap-0.5 text-[9px] font-mono text-slate-300 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                <Command className="w-2.5 h-2.5" />K
              </kbd>
            </button>
          </div>
        )}
        {isCollapsedDesktop && (
          <div className="px-2 pt-4 flex justify-center">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              title="Search (Cmd+K)"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Section-based navigation */}
        <nav
          className={cn(
            'flex-1 overflow-y-auto py-4 space-y-4',
            isCollapsedDesktop ? 'px-2' : 'px-3'
          )}
        >
          {navSections.map((section) => (
            <div key={section.label}>
              {/* Section header */}
              {!isCollapsedDesktop && (
                <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-300 select-none">
                  {section.label}
                </div>
              )}
              {isCollapsedDesktop && (
                <div className="w-5 mx-auto mb-2 border-t border-slate-100" />
              )}
              <div className="space-y-0.5">
                {section.items
                  .filter((item) => {
                    if (item.tenantOnly && !user?.tenant_id) return false;
                    if (item.superAdminOnly && !user?.is_super_admin) return false;
                    return true;
                  })
                  .map((item) => (
                    <SidebarNavItem key={item.path} item={item} mobile={mobile} />
                  ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer actions — fixed at sidebar bottom */}
        <div
          className={cn(
            'border-t border-slate-100 py-2.5 space-y-1',
            isCollapsedDesktop ? 'px-2' : 'px-3'
          )}
        >
          {/* Settings — fixed bottom link (matches Collapse styling) */}
          <Link
            to="/settings"
            title="Settings"
            className={cn(
              'flex items-center gap-3 rounded-lg text-[13px] font-medium transition-colors',
              location.pathname === '/settings'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50',
              isCollapsedDesktop ? 'justify-center h-9 w-9 mx-auto' : 'h-9 px-3 w-full'
            )}
          >
            <Settings className="w-[17px] h-[17px]" strokeWidth={1.8} />
            {!isCollapsedDesktop && <span>Settings</span>}
          </Link>

          {/* Collapse toggle */}
          {!mobile && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex items-center gap-3 rounded-lg text-[13px] font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors',
                isCollapsedDesktop ? 'justify-center h-9 w-9 mx-auto' : 'h-9 px-3 w-full'
              )}
            >
              {collapsed ? (
                <ChevronsRight className="w-[17px] h-[17px]" />
              ) : (
                <ChevronsLeft className="w-[17px] h-[17px]" />
              )}
              {!isCollapsedDesktop && <span>Collapse</span>}
            </button>
          )}
        </div>
      </aside>
    );
  };

  /* ── User menu items ────────────────────────────────────────── */

  const userMenuItems = [
    { icon: User,       label: 'Profile',  path: '/settings' },
    { icon: KeyRound,   label: 'API Keys', path: '/voice/api' },
    { icon: CreditCard, label: 'Billing',  path: '/voice/billing' },
    { icon: HelpCircle, label: 'Support',  path: '/platform-support' },
  ];

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <AppContext.Provider value={{ theme, user }}>
      <div className="min-h-screen" style={{ fontFamily: brandFont }}>
        <div className="relative min-h-screen text-slate-900 flex" style={{ background: 'var(--bg-primary)' }}>
          <div className="relative flex w-full">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Mobile Drawer */}
            {mobileOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <div
                  className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-fade-in"
                  onClick={() => setMobileOpen(false)}
                />
                <div className="absolute left-0 top-0 bottom-0 animate-slide-up" style={{ animation: 'slideRight 0.2s ease-out both' }}>
                  <Sidebar mobile />
                </div>
              </div>
            )}

            {/* Main column */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header */}
              <header
                className="sticky top-0 z-40 border-b border-slate-100"
                style={{
                  background: 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                <div className="flex items-center justify-between h-[60px] px-4 lg:px-6">
                  {/* Left: Hamburger + Breadcrumbs */}
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => setMobileOpen(true)}
                      className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                    <nav className="flex items-center gap-2 text-sm min-w-0">
                      {currentSection && (
                        <>
                          <span className="text-slate-300 hidden sm:inline text-xs font-medium">
                            {currentSection.label}
                          </span>
                          <span className="text-slate-200 hidden sm:inline">/</span>
                        </>
                      )}
                      <span className="font-semibold text-slate-800 truncate">
                        {currentNavItem?.name || 'Dashboard'}
                      </span>
                    </nav>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-1">
                    {/* Search — desktop */}
                    <button
                      onClick={() => setSearchOpen(true)}
                      className="hidden md:flex items-center gap-2 h-8 px-3 rounded-lg text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                    >
                      <Search className="w-3.5 h-3.5" />
                      <kbd className="text-[10px] font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 text-slate-300">
                        ⌘K
                      </kbd>
                    </button>
                    {/* Search — mobile */}
                    <button
                      onClick={() => setSearchOpen(true)}
                      className="md:hidden p-2 rounded-lg hover:bg-slate-50 text-slate-400 transition-colors"
                    >
                      <Search className="w-5 h-5" />
                    </button>

                    {/* Wallet pill — balance + minutes remaining */}
                    <HeaderWalletPill />

                    {/* Notifications */}
                    <NotificationsPanel />

                    {/* User menu */}
                    <div className="relative ml-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setUserMenuOpen(!userMenuOpen);
                        }}
                        className="flex items-center gap-2 p-1 pr-2 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                          style={{
                            background: `linear-gradient(135deg, ${brandPrimary}, ${brandAccent})`,
                            boxShadow: `0 2px 8px -2px ${brandPrimary}50`,
                          }}
                        >
                          {initials}
                        </div>
                        <ChevronDown
                          className={cn(
                            'w-3.5 h-3.5 text-slate-300 hidden sm:block transition-transform duration-200',
                            userMenuOpen && 'rotate-180'
                          )}
                        />
                      </button>

                      {/* User dropdown */}
                      {userMenuOpen && (
                        <div
                          className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-slate-100 py-1.5 z-50 animate-scale-in"
                          style={{
                            boxShadow: '0 12px 40px -8px rgba(0,0,0,0.12), 0 4px 12px -4px rgba(0,0,0,0.06)',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* User info */}
                          <div className="px-4 py-3 border-b border-slate-100">
                            <p className="font-semibold text-sm text-slate-900 truncate">
                              {user?.name || 'User'}
                            </p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {user?.email}
                            </p>
                            <span
                              className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                              style={{
                                background: `${brandPrimary}10`,
                                color: brandPrimary,
                              }}
                            >
                              {user?.role || 'user'}
                            </span>
                          </div>
                          {/* Menu items */}
                          {userMenuItems.map((item) => (
                            <Link
                              key={item.label}
                              to={item.path}
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                            >
                              <item.icon className="w-4 h-4 text-slate-400" />
                              {item.label}
                            </Link>
                          ))}
                          {/* Sign out */}
                          <div className="border-t border-slate-100 mt-1 pt-1">
                            <button
                              onClick={handleLogout}
                              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-rose-500 hover:bg-rose-50 transition-colors"
                            >
                              <LogOut className="w-4 h-4" />
                              Sign Out
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </header>

              {/* Main content */}
              <main className="flex-1 px-4 lg:px-6 py-6 lg:py-8">
                <div className="max-w-[1600px] mx-auto w-full">
                  <ErrorBoundary>
                    <Outlet />
                  </ErrorBoundary>
                </div>
              </main>

              {/* Footer */}
              <footer className="px-6 py-4 border-t border-slate-100 text-center text-xs text-slate-300">
                &copy; 2026 {brandName}. Crafted with care.
              </footer>
            </div>
          </div>
        </div>

        {/* Global search modal */}
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </AppContext.Provider>
  );
}

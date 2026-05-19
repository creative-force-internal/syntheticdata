import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

interface SidebarProps {
  onNewProject?: () => void;
}

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/', icon: 'folder_open', label: 'Projects' },
  { href: '/single', icon: 'table_chart', label: 'Single Table' },
  { href: '/profile', icon: 'settings', label: 'Settings' },
  { href: '/help', icon: 'help_outline', label: 'Help' },
];

export function Sidebar({ onNewProject }: SidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer whenever route changes (e.g. user taps a nav link)
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  function handleNewProject() {
    setMobileOpen(false);
    if (onNewProject) {
      onNewProject();
    } else {
      navigate('/');
    }
  }

  return (
    <>
      {/* Mobile-only hamburger / close button — fixed top-left */}
      <button
        onClick={() => setMobileOpen(o => !o)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 bg-surface-container border border-outline-variant/30 rounded-md text-on-surface hover:bg-surface-bright transition-colors shadow"
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile-only backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          aria-hidden="true"
        />
      )}

      <aside
        className={`flex flex-col h-screen w-64 border-r border-surface-container bg-surface py-6 fixed left-0 top-0 overflow-y-auto shrink-0 z-50 transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* Logo */}
        <div className="px-6 mb-8 pl-14 md:pl-6">
          <div className="text-xl font-bold tracking-tighter text-studio-blue font-headline">Synthetic Studio</div>
          <div className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mt-1">Data Engine v2.4</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={
                isActive(item.href)
                  ? 'flex items-center gap-3 px-4 py-3 bg-surface-container text-studio-blue border-l-2 border-studio-blue font-bold transition-all'
                  : 'flex items-center gap-3 px-4 py-3 text-on-surface-variant font-medium hover:text-on-surface hover:bg-surface-bright rounded-md transition-colors duration-200'
              }
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-label uppercase tracking-widest text-[10px]">{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* CTA + User */}
        <div className="px-4 mt-auto">
          <button
            onClick={handleNewProject}
            className="w-full py-3 bg-primary text-on-primary-fixed font-bold text-xs uppercase tracking-widest rounded-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            New Project
          </button>
          <div className="mt-6 flex items-center gap-3 p-2 bg-surface-container rounded-lg border border-outline-variant/20">
            <div className="w-8 h-8 rounded bg-surface-variant flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
              SY
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold truncate text-on-surface">Admin_01</div>
              <div className="text-[9px] text-on-surface-variant font-label truncate">LOCAL INSTANCE</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

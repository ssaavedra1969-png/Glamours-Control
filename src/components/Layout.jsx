import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import {
  LayoutDashboard, Wallet, ShoppingCart, Upload, FileBarChart,
  Settings, Lock, ShieldCheck, Menu, X
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/caja', label: 'Libro de Caja', icon: Wallet },
  { path: '/ventas', label: 'Libro de Ventas', icon: ShoppingCart },
  { path: '/carga', label: 'Carga Masiva', icon: Upload },
  { path: '/reportes', label: 'Reportes', icon: FileBarChart },
  { path: '/cierres', label: 'Cierres de Caja', icon: Lock },
  { path: '/configuracion', label: 'Configuracion', icon: Settings },
  { path: '/auditoria', label: 'Auditoria', icon: ShieldCheck },
];

const SECTION_TITLES = {
  '/': 'Dashboard',
  '/caja': 'Libro de Caja',
  '/ventas': 'Libro de Ventas',
  '/carga': 'Carga Masiva',
  '/reportes': 'Reportes y Estadisticas',
  '/cierres': 'Cierres de Caja',
  '/configuracion': 'Configuracion del Sistema',
  '/auditoria': 'Registro de Auditoria',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div className="app-layout">
      {/* Ambient background */}
      <div className="ambient-bg" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="noise-overlay" />

      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 150 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`sidebar nav-fx ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">G</div>
          <div className="sidebar-brand">
            <h2>GLAMOUR'S</h2>
            <span>Sistema de Gestion</span>
          </div>
        </div>

        <nav className="nav-menu">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <a
              key={path}
              className={`nav-item ${location.pathname === path ? 'active' : ''}`}
              onClick={() => navigate(path)}
            >
              <Icon className="nav-icon" size={18} />
              <span className="nav-label">{label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">{user?.nombre?.[0] || 'U'}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user?.nombre}</div>
              <div className="sidebar-user-role">{user?.rol}</div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={() => { navigate('/login'); logout(); }}>
            Cerrar Sesion
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="topbar-toggle" onClick={() => {
              if (window.innerWidth <= 768) setMobileOpen(!mobileOpen);
              else setCollapsed(!collapsed);
            }}>
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <h1 className="topbar-title">{SECTION_TITLES[location.pathname] || 'GLAMOUR\'S'}</h1>
          </div>
          <div className="topbar-right">
            <div className="topbar-datetime">
              <span className="topbar-date">{format(now, 'dd/MM/yyyy')}</span>
              <span className="topbar-sep" />
              <span className="topbar-time">{format(now, 'HH:mm:ss')}</span>
            </div>
          </div>
        </header>

        <div className="content-area">
          <div className="page-enter" key={location.pathname}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

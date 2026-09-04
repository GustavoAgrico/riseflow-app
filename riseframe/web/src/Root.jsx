import React, { useState } from 'react';
import { C, GRAD, FONT_DISPLAY } from './theme.js';
import Icon, { Logo } from './components/Icon.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import Settings from './pages/Settings.jsx';
import Editor from './App.jsx';

const NAV = [
  { id: 'dashboard', label: 'Produtividade', icon: 'grid' },
  { id: 'library', label: 'Biblioteca', icon: 'folder' },
  { id: 'editor', label: 'Novo vídeo', icon: 'sparkles', cta: true },
];

function NavItem({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left', fontSize: 14, fontWeight: 600, transition: 'all .15s',
        background: item.cta
          ? GRAD
          : active ? 'rgba(255,107,53,0.12)' : 'transparent',
        color: item.cta ? '#fff' : active ? C.text : C.muted,
        boxShadow: item.cta ? '0 8px 20px -8px rgba(255,107,53,0.55)' : 'none',
      }}
    >
      {active && !item.cta && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: GRAD }} />}
      <Icon name={item.icon} size={18} strokeWidth={1.9} color={item.cta ? '#fff' : active ? C.orangeSoft : 'currentColor'} />
      {item.label}
    </button>
  );
}

function Sidebar({ user, view, onView, onLogout }) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <aside className="rf-sidebar" style={{ width: 244, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: 'rgba(10,10,15,0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', padding: '18px 14px', position: 'sticky', top: 0, height: '100vh' }}>
      <button onClick={() => onView('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 16px' }}>
        <Logo size={32} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: FONT_DISPLAY, letterSpacing: -0.4, color: C.text }}>Riseframe</div>
          <div style={{ fontSize: 10.5, color: C.faint, letterSpacing: 0.2 }}>Editor de vídeo IA</div>
        </div>
      </button>

      <div style={{ display: 'grid', gap: 4 }}>
        {NAV.map((n) => <NavItem key={n.id} item={n} active={view === n.id} onClick={() => onView(n.id)} />)}
      </div>

      <div style={{ marginTop: 20, marginBottom: 8, fontSize: 10.5, color: C.faint, letterSpacing: 1.2, fontWeight: 700, padding: '0 8px' }}>CONTA</div>
      <div style={{ display: 'grid', gap: 4 }}>
        <NavItem item={{ id: 'settings', label: 'Configurações', icon: 'gear' }} active={view === 'settings'} onClick={() => onView('settings')} />
        <NavItem item={{ id: 'logout', label: 'Sair', icon: 'logout' }} active={false} onClick={onLogout} />
      </div>

      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: GRAD, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 }}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || 'Você'}</div>
          <div style={{ fontSize: 11, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
        </div>
      </div>
    </aside>
  );
}

export default function Root() {
  const { user, ready, logout } = useAuth();
  const [publicRoute, setPublicRoute] = useState('landing');
  const [view, setView] = useState('dashboard');

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={26} color={C.orange} />
      </div>
    );
  }

  if (!user) {
    if (publicRoute === 'landing') {
      return <Landing onEnter={() => setPublicRoute('register')} onLogin={() => setPublicRoute('login')} />;
    }
    return <Auth initialMode={publicRoute === 'register' ? 'register' : 'login'} onDone={() => setView('dashboard')} onHome={() => setPublicRoute('landing')} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex' }}>
      <Sidebar user={user} view={view} onView={setView} onLogout={logout} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {view === 'dashboard' && <Dashboard user={user} onNewVideo={() => setView('editor')} onLibrary={() => setView('library')} onSettings={() => setView('settings')} />}
        {view === 'library' && <Library onNewVideo={() => setView('editor')} />}
        {view === 'settings' && <Settings onNewVideo={() => setView('editor')} />}
        {view === 'editor' && <Editor embedded onSettings={() => setView('settings')} />}
      </div>
      <style>{`
        @media (max-width: 820px){
          body{ }
          .rf-sidebar{ position: sticky; top: 0; width: 100% !important; height: auto !important; flex-direction: row !important; align-items: center; overflow-x: auto; padding: 10px 12px !important; }
          .rf-sidebar > div{ display: flex !important; }
        }
      `}</style>
    </div>
  );
}

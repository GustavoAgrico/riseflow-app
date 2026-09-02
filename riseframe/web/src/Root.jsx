import React, { useState } from 'react';
import { C, GRAD, FONT_DISPLAY } from './theme.js';
import { Logo } from './components/Icon.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Editor from './App.jsx';

function TopNav({ user, view, onView, onLogout }) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const link = (id, label) => (
    <button
      onClick={() => onView(id)}
      style={{
        background: view === id ? 'rgba(255,255,255,0.07)' : 'transparent',
        border: 'none', color: view === id ? C.text : C.muted, borderRadius: 9,
        padding: '8px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  );
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10, padding: '13px 22px', borderBottom: `1px solid ${C.border}`, background: 'rgba(8,8,12,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
      <button onClick={() => onView('dashboard')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9, padding: 0 }}>
        <Logo size={30} />
        <span style={{ fontWeight: 800, fontSize: 17, fontFamily: FONT_DISPLAY, letterSpacing: -0.4, color: C.text }}>Riseframe</span>
      </button>
      <div style={{ display: 'flex', gap: 2, marginLeft: 14 }}>
        {link('dashboard', 'Início')}
        {link('editor', 'Novo vídeo')}
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff' }}>{initial}</div>
          <span style={{ fontSize: 13.5, color: C.muted, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || user?.email}</span>
        </div>
        <button onClick={onLogout} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, borderRadius: 9, padding: '7px 13px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Sair
        </button>
      </div>
    </header>
  );
}

export default function Root() {
  const { user, ready, logout } = useAuth();
  const [publicRoute, setPublicRoute] = useState('landing'); // landing | login | register
  const [view, setView] = useState('dashboard'); // dashboard | editor

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={26} color={C.orange} />
      </div>
    );
  }

  // Não autenticado → landing ou tela de auth.
  if (!user) {
    if (publicRoute === 'landing') {
      return <Landing onEnter={() => setPublicRoute('register')} onLogin={() => setPublicRoute('login')} />;
    }
    return (
      <Auth
        initialMode={publicRoute === 'register' ? 'register' : 'login'}
        onDone={() => setView('dashboard')}
        onHome={() => setPublicRoute('landing')}
      />
    );
  }

  // Autenticado → app com barra de navegação.
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopNav user={user} view={view} onView={setView} onLogout={logout} />
      <div style={{ flex: 1 }}>
        {view === 'dashboard' ? (
          <Dashboard user={user} onNewVideo={() => setView('editor')} />
        ) : (
          <Editor embedded onHome={() => setView('dashboard')} />
        )}
      </div>
    </div>
  );
}

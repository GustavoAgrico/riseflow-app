import React, { useEffect, useState } from 'react';
import { C, GRAD, FONT_DISPLAY } from './theme.js';
import Icon, { Logo } from './components/Icon.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import Settings from './pages/Settings.jsx';
import Credits from './pages/Credits.jsx';
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

function CreditsCard({ billing, onOpen }) {
  if (!billing) return null;
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer', background: 'rgba(124,58,237,0.09)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 12, padding: 12, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.muted }}>
        <Icon name="zap" size={14} strokeWidth={2} color={C.purpleSoft} /> Créditos
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '4px 0 6px' }}>
        {billing.unlimited ? 'Ilimitado' : billing.credits.toLocaleString('pt-BR')}
      </div>
      {!billing.unlimited && <div style={{ fontSize: 12, fontWeight: 700, color: C.purpleSoft }}>+ Comprar créditos</div>}
    </button>
  );
}

function Sidebar({ user, billing, view, onView, onLogout }) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <aside className="rf-sidebar" style={{ width: 244, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: 'rgba(10,10,15,0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', padding: '18px 14px', position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box' }}>
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

      <div style={{ marginTop: 20 }}>
        <CreditsCard billing={billing} onOpen={() => onView('credits')} />
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

// ── Celular: barra superior (marca + saldo) e abas fixas embaixo ──
function MobileTopBar({ billing, onView }) {
  return (
    <header className="rf-mtop" style={{ position: 'sticky', top: 0, zIndex: 30, display: 'none', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 'calc(10px + env(safe-area-inset-top)) 16px 10px', background: 'rgba(8,8,12,0.82)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: `1px solid ${C.border}` }}>
      <button onClick={() => onView('dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
        <Logo size={28} />
        <span style={{ fontWeight: 800, fontSize: 16, fontFamily: FONT_DISPLAY, letterSpacing: -0.4, color: C.text }}>Riseframe</span>
      </button>
      {billing && (
        <button onClick={() => onView('credits')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 999, background: 'rgba(124,58,237,0.14)', border: '1px solid rgba(124,58,237,0.35)', color: C.text, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          <Icon name="zap" size={14} strokeWidth={2.2} color={C.purpleSoft} />
          {billing.unlimited ? 'Ilimitado' : billing.credits.toLocaleString('pt-BR')}
        </button>
      )}
    </header>
  );
}

const TABS = [
  { id: 'dashboard', label: 'Início', icon: 'grid' },
  { id: 'library', label: 'Biblioteca', icon: 'folder' },
  { id: 'editor', label: 'Novo', icon: 'sparkles', cta: true },
  { id: 'credits', label: 'Créditos', icon: 'zap' },
  { id: 'settings', label: 'Conta', icon: 'user' },
];

function MobileTabBar({ view, onView }) {
  return (
    <nav className="rf-mtabs" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40, display: 'none', justifyContent: 'space-around', alignItems: 'stretch', padding: '6px 6px calc(6px + env(safe-area-inset-bottom))', background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', borderTop: `1px solid ${C.border}` }}>
      {TABS.map((t) => {
        const on = view === t.id;
        return (
          <button key={t.id} onClick={() => onView(t.id)} aria-current={on ? 'page' : undefined} style={{ flex: 1, minWidth: 0, minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: on ? C.text : C.faint, fontSize: 10.5, fontWeight: 700 }}>
            {t.cta ? (
              <span style={{ width: 44, height: 32, borderRadius: 12, background: GRAD, display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px -6px rgba(255,107,53,0.6)' }}>
                <Icon name={t.icon} size={18} strokeWidth={2} color="#fff" />
              </span>
            ) : (
              <Icon name={t.icon} size={21} strokeWidth={on ? 2.2 : 1.8} color={on ? C.orangeSoft : 'currentColor'} />
            )}
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// Detecta ?reset=TOKEN no link de recuperação de senha vindo do e-mail.
function readResetToken() {
  try {
    const t = new URLSearchParams(window.location.search).get('reset');
    return t ? String(t) : '';
  } catch {
    return '';
  }
}
function clearResetToken() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('reset');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    /* ignora */
  }
}

// ?billing=return: volta do checkout da AbacatePay → abre a Assinatura e confere o pagamento.
function readBillingReturn() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('billing') !== 'return') return false;
    url.searchParams.delete('billing');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    return true;
  } catch {
    return false;
  }
}

export default function Root() {
  const { user, ready, logout, billing } = useAuth();
  const [resetToken] = useState(readResetToken);
  const [publicRoute, setPublicRoute] = useState(resetToken ? 'login' : 'landing');
  const [billingReturn] = useState(readBillingReturn);
  const [view, setView] = useState(billingReturn ? 'credits' : 'dashboard');
  // Intenção com que o editor abre: 'editor' (timeline) ou 'broll' (B-roll ligado).
  const [editorIntent, setEditorIntent] = useState(null);

  function go(next, intent = null) {
    setEditorIntent(next === 'editor' ? intent : null);
    setView(next);
    window.scrollTo(0, 0);
  }

  // Qualquer tela pode pedir a página de créditos (ex.: "saldo insuficiente").
  useEffect(() => {
    const open = () => go('credits');
    window.addEventListener('rf:open-credits', open);
    return () => window.removeEventListener('rf:open-credits', open);
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner size={26} color={C.orange} />
      </div>
    );
  }

  if (!user) {
    if (resetToken) {
      return (
        <Auth
          initialMode="reset"
          resetToken={resetToken}
          onDone={() => { clearResetToken(); setView('dashboard'); }}
          onHome={() => { clearResetToken(); setPublicRoute('landing'); }}
        />
      );
    }
    if (publicRoute === 'landing') {
      return <Landing onEnter={() => setPublicRoute('register')} onLogin={() => setPublicRoute('login')} />;
    }
    return <Auth initialMode={publicRoute === 'register' ? 'register' : 'login'} onDone={() => setView('dashboard')} onHome={() => setPublicRoute('landing')} />;
  }

  return (
    <div className="rf-root" style={{ minHeight: '100vh', display: 'flex' }}>
      <Sidebar user={user} billing={billing} view={view} onView={go} onLogout={logout} />
      <div className="rf-main" style={{ flex: 1, minWidth: 0 }}>
        <MobileTopBar billing={billing} onView={go} />
        {view === 'dashboard' && (
          <Dashboard
            user={user}
            onNewVideo={() => go('editor')}
            onEditVideo={() => go('editor', 'editor')}
            onBroll={() => go('editor', 'broll')}
            onLibrary={() => go('library')}
            onSettings={() => go('settings')}
          />
        )}
        {view === 'library' && <Library onNewVideo={() => go('editor')} />}
        {view === 'settings' && <Settings onNewVideo={() => go('editor')} onLogout={logout} />}
        {view === 'credits' && <Credits user={user} checkOnOpen={billingReturn} />}
        {view === 'editor' && <Editor key={editorIntent || 'new'} embedded intent={editorIntent} onSettings={() => go('settings')} />}
      </div>
      <MobileTabBar view={view} onView={go} />
      <style>{`
        @media (max-width: 820px){
          .rf-sidebar{ display: none !important; }
          .rf-mtop{ display: flex !important; }
          .rf-mtabs{ display: flex !important; }
          .rf-main{ padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
        }
      `}</style>
    </div>
  );
}

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { C, GRAD, FONT_DISPLAY } from './theme.js';
import Icon, { Logo, Wordmark } from './components/Icon.jsx';
import { Spinner } from './components/ui.jsx';
import { useAuth } from './AuthContext.jsx';
// Página inicial em pedaço separado (animações): quem já está logado não baixa.
const Landing = lazy(() => import('./pages/Landing.jsx'));
import Download from './pages/Download.jsx';
import Legal from './pages/Legal.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import Settings from './pages/Settings.jsx';
import Plans from './pages/Plans.jsx';
import Editor from './App.jsx';
import Templates from './pages/Templates.jsx';
import BrandKit from './pages/BrandKit.jsx';
import VerifyEmail from './pages/VerifyEmail.jsx';
import DeviceLogin from './pages/DeviceLogin.jsx';
import InstallApp from './components/InstallApp.jsx';

const NAV = [
  { id: 'dashboard', label: 'Início', icon: 'home' },
  { id: 'library', label: 'Meus projetos', icon: 'folder' },
  { id: 'templates', label: 'Templates', icon: 'layers' },
  { id: 'brand', label: 'Brand Kit', icon: 'brush' },
  { id: 'plans', label: 'Planos', icon: 'zap' },
  { id: 'settings', label: 'Configurações', icon: 'gear' },
];

function NavItem({ item, active, onClick, mini = false }) {
  return (
    <button
      onClick={onClick}
      title={mini ? item.label : undefined}
      aria-label={item.label}
      style={{
        position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12, justifyContent: mini ? 'center' : 'flex-start',
        padding: mini ? '11px 0' : '11px 14px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
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
      {!mini && item.label}
    </button>
  );
}

function CreditsCard({ billing, onOpen }) {
  if (!billing) return null;
  const title = billing.unlimited ? 'Uso ilimitado' : billing.plan ? `Plano ${billing.plan.name}` : billing.freeEdits > 0 ? 'Teste grátis' : 'Sem plano';
  const value = billing.unlimited
    ? 'Ilimitado'
    : !billing.plan && billing.freeEdits > 0
      ? `${billing.freeEdits} ${billing.freeEdits === 1 ? 'edição grátis' : 'edições grátis'}`
      : `${billing.credits.toLocaleString('pt-BR')} créditos`;
  return (
    <div style={{ borderRadius: 14, padding: 14, background: 'linear-gradient(160deg, rgba(255,107,53,0.12), rgba(194,65,12,0.12))', border: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700 }}>
        <Icon name="zap" size={14} strokeWidth={2.2} color={C.orangeSoft} /> {title}
      </div>
      <div style={{ fontSize: 12, color: C.muted, margin: '4px 0 10px' }}>{value}</div>
      {!billing.unlimited && (
        <button onClick={onOpen} style={{ width: '100%', minHeight: 34, borderRadius: 10, border: `1px solid ${C.borderStrong}`, background: 'rgba(255,255,255,0.06)', color: C.text, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {billing.plan ? 'Fazer upgrade' : 'Ver planos'}
        </button>
      )}
    </div>
  );
}

// Menu lateral recolhível: a escolha fica guardada; no editor ele já abre recolhido.
const SIDE_KEY = 'rf_sidebar';
function readSidePref() {
  try { return localStorage.getItem(SIDE_KEY) || 'auto'; } catch { return 'auto'; }
}

function Sidebar({ user, billing, view, onView, onLogout }) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  const [pref, setPref] = useState(readSidePref); // 'auto' | 'open' | 'mini'
  const mini = pref === 'mini' || (pref === 'auto' && view === 'editor');
  function toggle() {
    const next = mini ? 'open' : 'mini';
    setPref(next);
    try { localStorage.setItem(SIDE_KEY, next); } catch { /* ignora */ }
  }
  const credit = !billing ? null : billing.unlimited ? 'Ilimitado' : !billing.plan && billing.freeEdits > 0 ? `${billing.freeEdits} grátis` : `${billing.credits.toLocaleString('pt-BR')} créditos`;
  return (
    <aside className="rf-sidebar" style={{ width: mini ? 72 : 244, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: 'rgba(10,10,15,0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', padding: mini ? '18px 10px' : '18px 14px', position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box', transition: 'width .18s ease, padding .18s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexDirection: mini ? 'column' : 'row', gap: mini ? 10 : 4, padding: mini ? '4px 0 14px' : '4px 0 16px 8px' }}>
        <button onClick={() => onView('dashboard')} title="Início" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0, flex: mini ? 'none' : 1 }}>
          <Logo size={32} />
          {!mini && (
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div><Wordmark size={16} /></div>
              <div style={{ fontSize: 10.5, color: C.faint, letterSpacing: 0.2, whiteSpace: 'nowrap' }}>Editor de vídeo com IA</div>
            </div>
          )}
        </button>
        <button onClick={toggle} title={mini ? 'Abrir o menu' : 'Recolher o menu'} aria-label={mini ? 'Abrir o menu' : 'Recolher o menu'} aria-expanded={!mini} className="rf-side-toggle"
          style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.muted, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path d={mini ? 'M13 10l2 2-2 2' : 'M16 10l-2 2 2 2'} />
          </svg>
        </button>
      </div>

      <button onClick={() => onView('editor')} title={mini ? 'Criar vídeo' : undefined} aria-label="Criar vídeo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, borderRadius: 12, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16, boxShadow: '0 10px 24px -10px rgba(255,107,53,0.65)' }}>
        <Icon name="plus" size={17} strokeWidth={2.4} color="#fff" />{!mini && ' Criar vídeo'}
      </button>

      <div style={{ display: 'grid', gap: 3 }}>
        {NAV.map((n) => <NavItem key={n.id} item={n} mini={mini} active={view === n.id} onClick={() => onView(n.id)} />)}
      </div>

      <div style={{ marginTop: 'auto', display: 'grid', gap: 12 }}>
        {mini ? (
          credit && !billing.unlimited && (
            <button onClick={() => onView('plans')} title={`${credit} — ver planos`} aria-label={`${credit} — ver planos`} style={{ height: 40, borderRadius: 12, border: `1px solid ${C.border}`, background: 'linear-gradient(160deg, rgba(255,107,53,0.14), rgba(194,65,12,0.14))', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Icon name="zap" size={16} strokeWidth={2.2} color={C.orangeSoft} />
            </button>
          )
        ) : (
          <>
            <CreditsCard billing={billing} onOpen={() => onView('plans')} />
            {!inDesktopApp() && (
              <a href="/download" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, padding: '0 12px', borderRadius: 11, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.text, fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>
                <Icon name="download" size={16} strokeWidth={2} /> App para computador
              </a>
            )}
            <InstallApp />
          </>
        )}
        <NavItem item={{ id: 'logout', label: 'Sair', icon: 'logout' }} mini={mini} active={false} onClick={onLogout} />
      </div>

      <div title={mini ? `${user?.name || 'Você'} · ${user?.email || ''}` : undefined} style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: mini ? 'center' : 'flex-start', gap: 10, padding: mini ? '10px 0 0' : '10px 8px 0', borderTop: `1px solid ${C.border}` }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: GRAD, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 }}>{initial}</div>
        <div style={{ minWidth: 0, display: mini ? 'none' : 'block' }}>
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
        <Wordmark size={16} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <InstallApp compact />
      {billing && (
        <button onClick={() => onView('plans')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 999, background: 'rgba(194,65,12,0.14)', border: '1px solid rgba(194,65,12,0.35)', color: C.text, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
          <Icon name="zap" size={14} strokeWidth={2.2} color={C.purpleSoft} />
          {billing.unlimited ? 'Ilimitado' : !billing.plan && billing.freeEdits > 0 ? `${billing.freeEdits} grátis` : billing.credits.toLocaleString('pt-BR')}
        </button>
      )}
      </div>
    </header>
  );
}

const TABS = [
  { id: 'dashboard', label: 'Início', icon: 'home' },
  { id: 'library', label: 'Projetos', icon: 'folder' },
  { id: 'editor', label: 'Criar', icon: 'plus', cta: true },
  { id: 'templates', label: 'Templates', icon: 'layers' },
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

const inDesktopApp = () => typeof window !== 'undefined' && Boolean(window.electron);

/** App de PC/Mac sem plano (teste grátis usado): assinar ou renovar para continuar. */
function AppPaywall({ user, onRefresh, onLogout }) {
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    try { await onRefresh?.(); } finally { setBusy(false); }
  }
  return (
    <div style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '22px 24px', borderRadius: 18, border: `1px solid ${C.border}`, background: 'linear-gradient(135deg, rgba(255,107,53,0.14), rgba(194,65,12,0.14))' }}>
          <Logo size={40} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.4 }}>Assine para continuar usando o app</div>
            <div style={{ fontSize: 14, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
              Seu teste grátis acabou (ou o plano venceu). O app de computador fica liberado enquanto o plano mensal estiver ativo — seus projetos continuam salvos.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refresh} disabled={busy} style={{ minHeight: 40, padding: '0 16px', borderRadius: 11, border: 'none', background: GRAD, color: '#fff', fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' }}>
              {busy ? 'Conferindo…' : 'Já assinei — atualizar'}
            </button>
            <button onClick={onLogout} style={{ minHeight: 40, padding: '0 14px', borderRadius: 11, border: `1px solid ${C.borderStrong}`, background: 'transparent', color: C.text, fontWeight: 600, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' }}>Sair</button>
          </div>
        </div>
      </div>
      <Plans user={user} />
    </div>
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

// ?device=CÓDIGO: o app de PC/Mac abriu o site para entrar na conta. Guardado na sessão
// para sobreviver ao login (a pessoa pode precisar entrar primeiro).
function readDeviceCode() {
  try {
    const url = new URL(window.location.href);
    const c = url.searchParams.get('device');
    if (c) {
      sessionStorage.setItem('rf_device', c);
      url.searchParams.delete('device');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    return c || sessionStorage.getItem('rf_device') || '';
  } catch {
    return '';
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
  const { user, ready, logout, billing, refreshBilling } = useAuth();
  const [path, setPath] = useState(() => (typeof window !== 'undefined' ? window.location.pathname : '/'));
  const [resetToken] = useState(readResetToken);
  const [deviceCode, setDeviceCode] = useState(readDeviceCode);
  const [publicRoute, setPublicRoute] = useState(resetToken || deviceCode ? 'login' : 'landing');
  const [billingReturn] = useState(readBillingReturn);
  const [view, setView] = useState(billingReturn ? 'plans' : 'dashboard');
  // Intenção com que o editor abre: 'editor' (timeline), 'broll' (B-roll ligado) ou um
  // template por nicho ({ template }).
  const [editorIntent, setEditorIntent] = useState(null);

  function go(next, intent = null) {
    setEditorIntent(next === 'editor' ? intent : null);
    setView(next);
    window.scrollTo(0, 0);
  }

  // Voltar/avançar do navegador entre a página de download e o resto.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  // Qualquer tela pode pedir a página de planos (ex.: saldo insuficiente, recurso bloqueado).
  useEffect(() => {
    const open = () => go('plans');
    window.addEventListener('rf:open-plans', open);
    return () => window.removeEventListener('rf:open-plans', open);
  }, []);

  // Página de download do app de PC/Mac (pública; abre mesmo logado).
  if (path === '/download') {
    const leave = (route) => {
      window.history.pushState({}, '', '/');
      setPath('/');
      if (route) setPublicRoute(route);
      window.scrollTo(0, 0);
    };
    return <Download loggedIn={Boolean(user)} onHome={() => leave(null)} onEnter={() => leave('register')} onLogin={() => leave('login')} />;
  }

  // Páginas públicas de Termos e Privacidade (abrem mesmo logado).
  const legalPage = typeof window !== 'undefined' && ['/termos', '/privacidade'].includes(window.location.pathname)
    ? window.location.pathname.slice(1)
    : null;
  if (legalPage) {
    return <Legal page={legalPage} onHome={() => { window.location.href = '/'; }} />;
  }

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
      return (
        <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0c0c0c' }} />}>
          <Landing onEnter={() => setPublicRoute('register')} onLogin={() => setPublicRoute('login')} />
        </Suspense>
      );
    }
    return <Auth initialMode={publicRoute === 'register' ? 'register' : 'login'} onDone={() => setView('dashboard')} onHome={() => setPublicRoute('landing')} connectingApp={Boolean(deviceCode)} />;
  }

  // Conta nova ainda sem o e-mail confirmado: só entra depois do código.
  if (user.verified === false) {
    return <VerifyEmail user={user} onLogout={logout} />;
  }

  // Conectar o app de PC/Mac a esta conta (aberto pelo "Entrar pelo navegador").
  if (deviceCode) {
    const done = () => {
      try { sessionStorage.removeItem('rf_device'); } catch { /* ignora */ }
      setDeviceCode('');
    };
    return <DeviceLogin code={deviceCode} user={user} onDone={done} />;
  }

  // App de PC/Mac: acabou o teste grátis e não há plano mensal ativo → só a tela de planos.
  if (inDesktopApp() && billing?.appAccess === false) {
    return <AppPaywall user={user} onRefresh={refreshBilling} onLogout={logout} />;
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
            onTemplates={() => go('templates')}
            onOpen={(j) => go('editor', { reopen: j })}
            onFormat={(id) => go('editor', { format: id })}
          />
        )}
        {view === 'library' && <Library onNewVideo={() => go('editor')} onOpen={(j) => go('editor', { reopen: j })} />}
        {view === 'templates' && <Templates onUse={(t) => go('editor', { template: t })} onNewVideo={() => go('editor')} />}
        {view === 'brand' && <BrandKit onNewVideo={() => go('editor')} />}
        {view === 'settings' && <Settings onNewVideo={() => go('editor')} onLogout={logout} />}
        {view === 'plans' && <Plans user={user} checkOnOpen={billingReturn} />}
        {view === 'editor' && (
          <Editor
            key={typeof editorIntent === 'string' ? editorIntent : editorIntent?.template?.id || editorIntent?.reopen?.sourceId || editorIntent?.reopen?.id || editorIntent?.format || 'new'}
            embedded
            intent={typeof editorIntent === 'string' ? editorIntent : null}
            template={editorIntent?.template || (editorIntent?.format ? { id: editorIntent.format, format: editorIntent.format } : null)}
            reopen={editorIntent?.reopen || null}
            onSettings={() => go('settings')}
          />
        )}
      </div>
      <MobileTabBar view={view} onView={go} />
      <style>{`
        @media (max-width: 820px){
          .rf-sidebar{ display: none !important; }
          .rf-mtop{ display: flex !important; }
          .rf-mtabs{ display: flex !important; }
          .rf-main{ padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
        }
        .rf-side-toggle:hover{ color: #fff !important; background: rgba(255,255,255,0.08) !important; }
      `}</style>
    </div>
  );
}

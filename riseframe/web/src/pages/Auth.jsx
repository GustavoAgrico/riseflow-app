import React, { useEffect, useRef, useState } from 'react';
import { C, GRAD, gradientText, glass, FONT_DISPLAY } from '../theme.js';
import Icon, { Logo } from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';
import { useAuth } from '../AuthContext.jsx';
import { getHealth, forgotPassword } from '../api.js';

/** Carrega o script do Google Identity Services uma única vez. */
let gsiPromise = null;
function loadGsi() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (!gsiPromise) {
    gsiPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve(window.google);
      s.onerror = () => reject(new Error('não foi possível carregar o Google'));
      document.head.appendChild(s);
    });
  }
  return gsiPromise;
}

function Field({ label, type = 'text', value, onChange, placeholder, autoFocus, icon, autoComplete }) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  const t = isPass && show ? 'text' : type;
  return (
    <label style={{ display: 'block', marginBottom: 15 }}>
      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: C.muted, marginBottom: 7 }}>{label}</span>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {icon && (
          <span style={{ position: 'absolute', left: 13, color: C.faint, pointerEvents: 'none', display: 'flex' }}>
            <Icon name={icon} size={17} strokeWidth={1.7} />
          </span>
        )}
        <input
          type={t}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete || (isPass ? 'current-password' : 'on')}
          style={{
            width: '100%', boxSizing: 'border-box', background: '#101018', color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 12,
            padding: icon ? '13px 14px 13px 40px' : '13px 14px', paddingRight: isPass ? 42 : 14,
            fontSize: 14.5, fontFamily: 'inherit', outline: 'none', transition: 'border-color .15s, box-shadow .15s',
          }}
          onFocus={(e) => { e.target.style.borderColor = C.orange; e.target.style.boxShadow = '0 0 0 3px rgba(255,107,53,0.14)'; }}
          onBlur={(e) => { e.target.style.borderColor = C.border; e.target.style.boxShadow = 'none'; }}
        />
        {isPass && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'ocultar senha' : 'mostrar senha'}
            style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: C.faint, cursor: 'pointer', padding: 6, display: 'flex' }}
          >
            <Icon name={show ? 'eyeOff' : 'eye'} size={17} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </label>
  );
}

const GoogleG = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" style={{ display: 'block' }} aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5Z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.8 6.3 14.7Z" />
    <path fill="#4CAF50" d="M24 43.5c5.4 0 10.3-2 13.9-5.3l-6.4-5.4C29.4 34.5 26.9 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.6 39 16.2 43.5 24 43.5Z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.4 5.4C41.4 35.7 43.5 30.3 43.5 24c0-1.2-.1-2.3-.4-3.5Z" />
  </svg>
);

export default function Auth({ initialMode = 'login', resetToken, onDone, onHome }) {
  const { login, register, loginWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState(initialMode); // login | register | forgot | reset
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [gbusy, setGbusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [caps, setCaps] = useState({ googleReady: false, googleClientId: '', emailReady: false });
  const gbtnRef = useRef(null);

  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';

  // Carrega as capacidades (Google / e-mail) do backend.
  useEffect(() => {
    let alive = true;
    getHealth()
      .then((h) => { if (alive && h?.capabilities) setCaps(h.capabilities); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Inicializa o botão do Google quando disponível e no modo login/cadastro.
  useEffect(() => {
    if (!caps.googleReady || !caps.googleClientId) return;
    if (isForgot || isReset) return;
    let alive = true;
    loadGsi()
      .then((google) => {
        if (!alive || !gbtnRef.current) return;
        google.accounts.id.initialize({
          client_id: caps.googleClientId,
          callback: async (resp) => {
            setError('');
            setGbusy(true);
            try {
              await loginWithGoogle(resp.credential);
              onDone?.();
            } catch (err) {
              setError(err.message || 'falha no login com Google');
            } finally {
              setGbusy(false);
            }
          },
        });
        gbtnRef.current.innerHTML = '';
        google.accounts.id.renderButton(gbtnRef.current, {
          theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with',
          width: gbtnRef.current.offsetWidth || 340, logo_alignment: 'center',
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [caps.googleReady, caps.googleClientId, mode]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (isReset) {
        if (password !== password2) throw new Error('as senhas não coincidem');
        await resetPassword(resetToken, password);
        onDone?.();
      } else if (isForgot) {
        await forgotPassword(email);
        setNotice('Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.');
      } else if (isRegister) {
        await register(email, password, name);
        onDone?.();
      } else {
        await login(email, password);
        onDone?.();
      }
    } catch (err) {
      setError(err.message || 'não foi possível continuar');
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    login: { h: 'Bem-vindo de volta', s: 'Entre para continuar editando' },
    register: { h: 'Criar sua conta', s: 'Comece a editar vídeos com IA em segundos' },
    forgot: { h: 'Recuperar senha', s: 'Enviamos um link de redefinição para o seu e-mail' },
    reset: { h: 'Definir nova senha', s: 'Escolha uma senha nova para sua conta' },
  }[mode];

  const HIGHLIGHTS = [
    { icon: 'captions', t: 'Legendas dinâmicas', d: 'Palavra-chave destacada, estilos animados' },
    { icon: 'scissors', t: 'Cortes automáticos', d: 'Silêncios removidos e clipes prontos' },
    { icon: 'image', t: 'B-roll inteligente', d: 'Tela dividida e imagens no ritmo da fala' },
  ];

  return (
    <div className="rf-auth" style={{ minHeight: '100vh', display: 'flex', position: 'relative', background: C.bg }}>
      {/* halos de fundo */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-12%', left: '8%', width: 520, height: 520, borderRadius: '50%', background: C.orange, filter: 'blur(180px)', opacity: 0.13 }} />
        <div style={{ position: 'absolute', bottom: '-14%', right: '6%', width: 560, height: 560, borderRadius: '50%', background: C.purple, filter: 'blur(190px)', opacity: 0.16 }} />
      </div>

      {/* Painel de marca (esquerda) — some no mobile */}
      <aside className="rf-auth-brand" style={{ position: 'relative', flex: 1, minWidth: 0, padding: '56px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: `1px solid ${C.border}` }}>
        <button onClick={onHome} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Logo size={38} />
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 19, fontFamily: FONT_DISPLAY, letterSpacing: -0.5, color: C.text }}>Riseframe</div>
            <div style={{ fontSize: 11, color: C.faint, letterSpacing: 0.3 }}>Editor de vídeo com IA</div>
          </div>
        </button>

        <div style={{ maxWidth: 460 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, border: `1px solid ${C.border}`, background: C.panel, fontSize: 12.5, color: C.muted, marginBottom: 22 }}>
            <Icon name="sparkles" size={14} color={C.orangeSoft} /> Feito para criadores
          </div>
          <h2 style={{ fontSize: 38, lineHeight: 1.1, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1.2, margin: '0 0 16px' }}>
            Do bruto ao <span style={gradientText}>viral</span><br />em minutos.
          </h2>
          <p style={{ color: C.muted, fontSize: 15.5, lineHeight: 1.6, margin: '0 0 34px' }}>
            Suba um vídeo e deixe a IA legendar, cortar e turbinar automaticamente — com um editor completo para o toque final.
          </p>
          <div style={{ display: 'grid', gap: 14 }}>
            {HIGHLIGHTS.map((f) => (
              <div key={f.t} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: GRAD, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 8px 20px -8px rgba(255,107,53,0.5)' }}>
                  <Icon name={f.icon} size={19} color="#fff" strokeWidth={1.9} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>{f.t}</div>
                  <div style={{ fontSize: 13, color: C.faint }}>{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: C.faint }}>© {new Date().getFullYear()} Riseframe · Editor de vídeo IA</div>
      </aside>

      {/* Painel do formulário (direita) */}
      <main style={{ position: 'relative', width: '100%', maxWidth: 480, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 28px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* logo compacto — só aparece no mobile (painel de marca escondido) */}
          <button className="rf-auth-mlogo" onClick={onHome} style={{ display: 'none', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', margin: '0 auto 22px', padding: 0 }}>
            <Logo size={34} />
            <span style={{ fontWeight: 800, fontSize: 18, fontFamily: FONT_DISPLAY, letterSpacing: -0.4, color: C.text }}>Riseframe</span>
          </button>

          <div style={glass({ padding: '30px 28px' })}>
            <h1 style={{ fontSize: 23, fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -0.6, margin: '0 0 6px' }}>{titles.h}</h1>
            <p style={{ color: C.muted, fontSize: 14, margin: '0 0 22px' }}>{titles.s}</p>

            {/* Google (login/cadastro) */}
            {!isForgot && !isReset && caps.googleReady && (
              <>
                <div style={{ position: 'relative', minHeight: 44 }}>
                  <div ref={gbtnRef} style={{ colorScheme: 'light', display: 'flex', justifyContent: 'center', opacity: gbusy ? 0.5 : 1, pointerEvents: gbusy ? 'none' : 'auto' }} />
                  {gbusy && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><Spinner size={16} color={C.orange} /></div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 12, color: C.faint }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
              </>
            )}

            {/* Fallback estático do Google quando o script ainda não configurado no server */}
            {!isForgot && !isReset && !caps.googleReady && (
              <>
                <button
                  type="button"
                  onClick={() => setNotice('O login com Google ainda não está ativado neste ambiente. Use e-mail e senha por enquanto.')}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', color: '#1f1f1f', border: 'none', borderRadius: 999, padding: '12px', fontSize: 14.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <GoogleG size={18} /> Continuar com Google
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                  <span style={{ fontSize: 12, color: C.faint }}>ou</span>
                  <div style={{ flex: 1, height: 1, background: C.border }} />
                </div>
              </>
            )}

            <form onSubmit={submit}>
              {isRegister && (
                <Field label="Nome" value={name} onChange={setName} placeholder="Como quer ser chamado" icon="sparkles" autoComplete="name" autoFocus />
              )}
              {!isReset && (
                <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="voce@email.com" icon="mail" autoComplete="email" autoFocus={!isRegister} />
              )}
              {!isForgot && (
                <Field
                  label={isReset ? 'Nova senha' : 'Senha'}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Mínimo 6 caracteres"
                  icon="lock"
                  autoComplete={isReset || isRegister ? 'new-password' : 'current-password'}
                  autoFocus={isReset}
                />
              )}
              {isReset && (
                <Field label="Confirmar nova senha" type="password" value={password2} onChange={setPassword2} placeholder="Repita a senha" icon="lock" autoComplete="new-password" />
              )}

              {mode === 'login' && caps.emailReady && (
                <div style={{ textAlign: 'right', marginTop: -4, marginBottom: 14 }}>
                  <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0 }}>
                    Esqueci minha senha
                  </button>
                </div>
              )}

              {error && (
                <div style={{ background: 'rgba(240,82,107,0.1)', border: `1px solid ${C.red}55`, color: '#FCA5B4', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="alert" size={15} style={{ marginTop: 1 }} /> {error}
                </div>
              )}
              {notice && (
                <div style={{ background: 'rgba(46,212,122,0.1)', border: `1px solid ${C.green}55`, color: '#8FE9BC', borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <Icon name="check" size={15} style={{ marginTop: 1 }} /> {notice}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                style={{ width: '100%', background: GRAD, border: 'none', color: '#fff', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: '0 10px 28px -8px rgba(255,107,53,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}
              >
                {busy && <Spinner size={15} color="#fff" />}
                {isReset ? 'Salvar nova senha' : isForgot ? 'Enviar link de recuperação' : isRegister ? 'Criar conta grátis' : 'Entrar'}
              </button>
            </form>

            {/* rodapé do card — troca de modo */}
            <div style={{ textAlign: 'center', marginTop: 18, fontSize: 14, color: C.muted }}>
              {isForgot || isReset ? (
                <button onClick={() => { setMode('login'); setError(''); setNotice(''); }} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="arrowLeft" size={15} /> Voltar para o login
                </button>
              ) : (
                <>
                  {isRegister ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
                  <button onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); setNotice(''); }} style={{ background: 'none', border: 'none', color: C.orangeSoft, fontWeight: 700, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0 }}>
                    {isRegister ? 'Entrar' : 'Criar agora'}
                  </button>
                </>
              )}
            </div>
          </div>

          {(isRegister || mode === 'login') && (
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: C.faint, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Icon name="shield" size={13} /> Seus vídeos e dados ficam protegidos
            </p>
          )}

          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={onHome} style={{ background: 'none', border: 'none', color: C.faint, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Voltar para a página inicial
            </button>
          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 900px){
          .rf-auth-brand{ display: none !important; }
          .rf-auth main{ max-width: 100% !important; }
          .rf-auth-mlogo{ display: flex !important; }
        }
      `}</style>
    </div>
  );
}

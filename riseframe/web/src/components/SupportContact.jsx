import React, { useEffect, useState } from 'react';
import { C } from '../theme.js';
import { getPublicInfo } from '../api.js';

// Contato para dúvidas (o servidor pode trocar por SUPPORT_EMAIL / SUPPORT_WHATSAPP).
export const SUPPORT_DEFAULT = { email: 'contato@riseframe.com.br', whatsapp: '(11) 97421-6693' };
let cache = null;

export function useSupport() {
  const [s, setS] = useState(cache || SUPPORT_DEFAULT);
  useEffect(() => {
    if (cache) return;
    getPublicInfo()
      .then((i) => { cache = { email: i?.supportEmail || SUPPORT_DEFAULT.email, whatsapp: i?.supportWhatsapp || SUPPORT_DEFAULT.whatsapp }; setS(cache); })
      .catch(() => {});
  }, []);
  return s;
}

export const waHref = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d ? `https://wa.me/${d.startsWith('55') ? d : `55${d}`}` : null;
};

/** "Dúvidas? e-mail · WhatsApp" — links que abrem o e-mail e a conversa. */
export default function SupportContact({ style, compact = false }) {
  const s = useSupport();
  const link = { color: C.orangeSoft, fontWeight: 600, textDecoration: 'none' };
  return (
    <div style={{ fontSize: compact ? 12.5 : 13.5, color: C.muted, lineHeight: 1.6, ...style }}>
      Dúvidas? Fale com a gente: <a href={`mailto:${s.email}`} style={link}>{s.email}</a>
      {s.whatsapp && <> · WhatsApp <a href={waHref(s.whatsapp)} target="_blank" rel="noreferrer" style={link}>{s.whatsapp}</a></>}
    </div>
  );
}

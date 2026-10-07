import React, { useEffect, useState } from 'react';
import { C, glass, FONT_DISPLAY, gradientText } from '../theme.js';
import { Logo } from '../components/Icon.jsx';
import { getPublicInfo } from '../api.js';

// Termos de uso e Política de privacidade. Texto baseado no que o Riseframe faz de fato
// (provedores, retenção, pagamentos). Recomenda-se revisão jurídica antes de escalar.
const UPDATED = '7 de outubro de 2026';

function Section({ title, children }) {
  return (
    <section style={{ margin: '0 0 26px' }}>
      <h2 style={{ fontSize: 19, fontWeight: 800, fontFamily: FONT_DISPLAY, margin: '0 0 10px' }}>{title}</h2>
      <div style={{ color: C.muted, fontSize: 15, lineHeight: 1.7 }}>{children}</div>
    </section>
  );
}

function contactLine(info) {
  if (info?.supportEmail && info?.supportWhatsapp) return <>pelo e-mail <b style={{ color: C.text }}>{info.supportEmail}</b> ou WhatsApp <b style={{ color: C.text }}>{info.supportWhatsapp}</b></>;
  if (info?.supportEmail) return <>pelo e-mail <b style={{ color: C.text }}>{info.supportEmail}</b></>;
  if (info?.supportWhatsapp) return <>pelo WhatsApp <b style={{ color: C.text }}>{info.supportWhatsapp}</b></>;
  return <>pelos canais de suporte informados no site</>;
}

function Privacy({ info }) {
  const hours = info?.retentionHours;
  return (
    <>
      <Section title="Quais dados coletamos">
        <ul>
          <li><b>Conta:</b> nome, e-mail e senha (guardada só como código criptográfico, nunca em texto). Se você entrar com Google, recebemos nome e e-mail da sua conta Google.</li>
          <li><b>Vídeos e arquivos:</b> os vídeos, imagens e áudios que você envia para editar, e os vídeos prontos gerados.</li>
          <li><b>Pagamento:</b> nome e WhatsApp informados ao avisar um pagamento Pix (e CPF/CNPJ, se a cobrança for por intermediador de pagamento), para confirmar o pagamento e lembrar o vencimento do plano.</li>
          <li><b>Uso:</b> histórico de edições e créditos da sua conta, e registros técnicos (erros) para manter o serviço funcionando.</li>
        </ul>
      </Section>
      <Section title="Para que usamos">
        Para editar seus vídeos, manter sua conta, controlar créditos e planos, confirmar pagamentos e avisar sobre o
        vencimento do plano (por e-mail e WhatsApp). <b style={{ color: C.text }}>Não usamos seus vídeos para treinar modelos de IA</b> e não vendemos seus dados.
      </Section>
      <Section title="Quem processa os dados por nós">
        Para fazer a edição, partes do conteúdo passam por serviços especializados, só para executar a tarefa pedida:
        <ul>
          <li><b>Transcrição da fala</b> (legendas): o áudio do vídeo é enviado à Deepgram.</li>
          <li><b>Análise e limpeza da fala por IA</b>: o texto transcrito pode ser enviado à Anthropic (Claude).</li>
          <li><b>Imagens de apoio (B-roll)</b>: palavras-chave do vídeo são usadas para buscar imagens no Pexels, Openverse e Google — não enviamos seu vídeo a esses serviços.</li>
          <li><b>Hospedagem</b>: os arquivos ficam nos servidores onde o Riseframe roda durante o processamento.</li>
          <li><b>Pagamentos</b>: Pix pelo banco (link de pagamento) ou intermediador de pagamento, conforme o plano.</li>
        </ul>
      </Section>
      <Section title="Por quanto tempo guardamos">
        {hours
          ? <>Os vídeos enviados e os vídeos prontos são <b style={{ color: C.text }}>apagados automaticamente do servidor em até {hours} horas</b>. Baixe o resultado assim que ficar pronto.</>
          : <>Os vídeos enviados e os vídeos prontos são apagados periodicamente do servidor. Baixe o resultado assim que ficar pronto.</>}{' '}
        Dados da conta ficam enquanto a conta existir.
      </Section>
      <Section title="Seus direitos (LGPD)">
        Você pode pedir acesso, correção ou exclusão dos seus dados e da sua conta {contactLine(info)}.
      </Section>
    </>
  );
}

function Terms({ info }) {
  return (
    <>
      <Section title="O serviço">
        O Riseframe edita vídeos automaticamente (corte de pausas, legendas, cor, zoom, imagens de apoio e formatos). Os
        resultados dependem do vídeo enviado; revise o vídeo pronto antes de publicar. Não prometemos alcance,
        visualizações ou resultados nas redes sociais.
      </Section>
      <Section title="Seu conteúdo">
        Os vídeos continuam sendo seus. Você declara ter os direitos sobre o que envia (imagem, voz, música e marcas) e é
        responsável pelo que publica. Usamos o conteúdo só para fazer a edição que você pediu.
      </Section>
      <Section title="Imagens de apoio (B-roll)">
        As imagens e vídeos de apoio vêm de bancos de terceiros. Pexels e imagens em domínio público podem ser usados
        livremente; imagens Creative Commons podem exigir crédito ao autor; imagens do Google podem ter direitos autorais.
        Para uso comercial, prefira as fontes livres ou revise as imagens inseridas — a responsabilidade pelo uso é sua.
      </Section>
      <Section title="Teste grátis, planos e pagamento">
        {info?.freeEdits ? <>Cada conta nova tem {info.freeEdits} edições grátis com todos os recursos, sem cartão. </> : null}
        Os planos valem {info?.periodDays || 30} dias a partir da confirmação do pagamento e
        {info?.payment === 'pix-links' ? ' não renovam sozinhos: você recebe um lembrete antes do vencimento para renovar pelo Pix.' : ' seguem a forma de cobrança escolhida no pagamento.'}{' '}
        Créditos do mês não acumulam. Se um processamento falhar, os créditos (ou a edição grátis) voltam automaticamente.
      </Section>
      <Section title="Uso proibido">
        Não é permitido enviar conteúdo ilegal, que viole direitos de terceiros ou que exponha pessoas sem autorização,
        nem tentar burlar limites e pagamentos. Contas que fizerem isso podem ser suspensas.
      </Section>
      <Section title="Contato">Dúvidas, suporte e pedidos {contactLine(info)}.</Section>
    </>
  );
}

export default function Legal({ page, onHome }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    getPublicInfo().then(setInfo).catch(() => {});
    window.scrollTo(0, 0);
  }, [page]);
  const privacy = page === 'privacidade';
  return (
    <div style={{ minHeight: '100%', color: C.text }}>
      <nav style={{ borderBottom: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <a href="/" onClick={(e) => { e.preventDefault(); onHome(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.text, textDecoration: 'none' }}>
          <Logo size={28} />
          <span style={{ fontWeight: 800, fontSize: 17, fontFamily: FONT_DISPLAY }}>Riseframe</span>
        </a>
      </nav>
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px' }}>
        <h1 style={{ fontSize: 'clamp(28px,5vw,38px)', fontWeight: 800, fontFamily: FONT_DISPLAY, letterSpacing: -1, margin: '0 0 6px' }}>
          <span style={gradientText}>{privacy ? 'Política de privacidade' : 'Termos de uso'}</span>
        </h1>
        <p style={{ color: C.faint, fontSize: 13, margin: '0 0 30px' }}>Atualizado em {UPDATED}</p>
        <div style={glass({ padding: '26px 24px' })}>{privacy ? <Privacy info={info} /> : <Terms info={info} />}</div>
        <p style={{ color: C.faint, fontSize: 13, marginTop: 20 }}>
          Veja também: {privacy ? <a href="/termos" style={{ color: C.orangeSoft }}>Termos de uso</a> : <a href="/privacidade" style={{ color: C.orangeSoft }}>Política de privacidade</a>}
        </p>
      </main>
    </div>
  );
}

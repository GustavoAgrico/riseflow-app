import { useEffect, useState } from 'react';

/**
 * App instalável pelo navegador (PWA): no Android/Chrome/Edge aparece o pedido nativo
 * "Instalar"; no iPhone/iPad (Safari) a instalação é por Compartilhar → Adicionar à Tela de
 * Início, então mostramos o passo a passo. Nada disso no app de PC/Mac (Electron) nem
 * quando já está aberto como app instalado.
 */
let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());

const inElectron = () => typeof window !== 'undefined' && Boolean(window.electron);
export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Registra o service worker e escuta o pedido de instalação. Chamado uma vez no início. */
export function initInstall() {
  if (typeof window === 'undefined' || inElectron()) return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // o botão do app decide quando mostrar
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  const secure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  if (import.meta.env.PROD && secure && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}

/** Abre o pedido nativo de instalação. → 'accepted' | 'dismissed' | null */
export async function promptInstall() {
  if (!deferred) return null;
  const e = deferred;
  deferred = null;
  notify();
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  return choice?.outcome || null;
}

/** { show, native, ios }: mostrar o botão "Instalar app"? (pedido nativo ou passo a passo do iPhone) */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    subs.add(fn);
    return () => subs.delete(fn);
  }, []);
  if (inElectron() || isStandalone()) return { show: false, native: false, ios: false };
  const native = Boolean(deferred);
  const ios = !native && isIOS();
  return { show: native || ios, native, ios };
}

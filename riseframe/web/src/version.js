// Selo de versão visível na interface. Serve para confirmar rapidamente que o app
// no navegador está rodando o código mais novo (depois de atualizar + rebuild).
// Vem do riseframe/package.json no build (vite.config.js) — não edite à mão.
// eslint-disable-next-line no-undef
export const APP_VERSION = `v${typeof __RF_VERSION__ !== 'undefined' ? __RF_VERSION__ : '0.0.0'}`;

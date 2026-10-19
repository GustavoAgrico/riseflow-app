// Pix "copia e cola" (BR Code estático do Banco Central): o mesmo texto vira o QR Code que
// qualquer app de banco lê, já com a chave, o nome de quem recebe e o VALOR exato.
// Sem banco no meio: o site gera o código na hora, para cada plano/recarga.

const field = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF) — o verificador exigido pelo Pix. */
export function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Nome/cidade como o Pix aceita: sem acento, maiúsculas, só letras/números/espaço. */
const plain = (s, max) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, max);

/**
 * Chave Pix no formato do código: e-mail em minúsculas; telefone +55DDDNÚMERO; CPF/CNPJ só
 * números; chave aleatória como está. Telefone precisa vir com "+" (11 dígitos sem "+" é CPF).
 */
export function normalizePixKey(key) {
  const k = String(key || '').trim();
  if (!k) return '';
  if (k.includes('@')) return k.toLowerCase();
  if (/^\+/.test(k)) return `+${k.replace(/\D/g, '')}`;
  if (/^[\d.\-/ ]+$/.test(k)) return k.replace(/\D/g, '');
  return k.toLowerCase();
}

/** Identificador da cobrança (aparece no extrato do banco): letras e números, até 25. */
export const pixTxid = (s) => String(s || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';

/**
 * Monta o Pix copia e cola. amountCents opcional (sem valor, quem paga digita).
 * @returns {string}
 */
export function pixBrCode({ key, name, city, amountCents, txid, description = '' }) {
  const k = normalizePixKey(key);
  if (!k) throw new Error('chave Pix não configurada');
  const desc = String(description || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '').slice(0, Math.max(0, 72 - k.length));
  const account = field('00', 'br.gov.bcb.pix') + field('01', k) + (desc ? field('02', desc) : '');
  let out = field('00', '01')
    + field('26', account)
    + field('52', '0000')
    + field('53', '986')
    + (amountCents ? field('54', (Math.round(amountCents) / 100).toFixed(2)) : '')
    + field('58', 'BR')
    + field('59', plain(name, 25) || 'RECEBEDOR')
    + field('60', plain(city, 15) || 'BRASIL')
    + field('62', field('05', pixTxid(txid)));
  out += '6304';
  return out + crc16(out);
}

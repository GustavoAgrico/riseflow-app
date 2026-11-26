import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { extractContacts, cnpjValid, isPrivateIp, normalizeUrl } = require('./enrich')

describe('enriquecimento por site', () => {
  const html = `
    <a href="mailto:contato@clinicasorriso.com.br?subject=oi">Fale</a>
    <p>Suporte: suporte&#64;clinicasorriso.com.br · imagem logo@2x.png · user@example.com</p>
    <a href="https://www.instagram.com/clinicasorriso/">Insta</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
    <a href="https://facebook.com/clinicasorrisosp">Face</a>
    <a href="https://br.linkedin.com/company/clinica-sorriso">LinkedIn</a>
    <a href="https://wa.me/5511987654321">WhatsApp</a>
    <footer>CNPJ 11.222.333/0001-81 · 00.000.000/0000-00</footer>`

  it('acha e-mail do próprio domínio primeiro e descarta lixo', () => {
    const r = extractContacts(html, 'www.clinicasorriso.com.br')
    expect(r.emails).toEqual(['contato@clinicasorriso.com.br', 'suporte@clinicasorriso.com.br'])
  })

  it('acha redes sociais ignorando links de compartilhar', () => {
    const r = extractContacts(html, 'clinicasorriso.com.br')
    expect(r.instagram).toBe('https://www.instagram.com/clinicasorriso')
    expect(r.facebook).toBe('https://facebook.com/clinicasorrisosp')
    expect(r.linkedin).toBe('https://br.linkedin.com/company/clinica-sorriso')
    expect(r.whatsapp).toBe('5511987654321')
  })

  it('só aceita CNPJ com dígito verificador certo', () => {
    expect(cnpjValid('11.222.333/0001-81')).toBe(true)
    expect(cnpjValid('11.222.333/0001-82')).toBe(false)
    expect(cnpjValid('00000000000000')).toBe(false)
    expect(extractContacts(html).cnpj).toBe('11222333000181')
  })
})

describe('segurança da busca em sites', () => {
  it('bloqueia endereços internos e portas estranhas', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) expect(isPrivateIp(ip), ip).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(normalizeUrl('clinica.com.br').href).toBe('https://clinica.com.br/')
    expect(normalizeUrl('http://site.com:8080')).toBeNull()
    expect(normalizeUrl('ftp://site.com')).toBeNull()
    expect(normalizeUrl('https://user:pass@site.com')).toBeNull()
  })
})

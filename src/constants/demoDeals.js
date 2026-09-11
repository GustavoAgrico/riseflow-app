// Negócios de exemplo do modo demo — fonte ÚNICA compartilhada por Funil,
// Dashboard (e futuras telas), para que a demonstração seja coerente entre os
// módulos (roadmap Fase 1 · Entregável 3). Mesmo shape das linhas de `clients`
// que computeSalesMetrics consome: { stage, value, created_at, ... }.
// As chaves de etapa (lead/qual/prop/neg/closed/lost) casam com DEFAULT_STAGES.
export const DEMO_DEALS = (() => {
  const names = ['Ana Paula Silva', 'Carlos Eduardo', 'Marina Rodrigues', 'Roberto Santos', 'Julia Ferreira', 'Marcos Lima', 'Beatriz Costa', 'Felipe Almeida', 'Camila Souza', 'Rafael Nunes', 'Larissa Melo', 'Bruno Cardoso', 'Patrícia Gomes', 'Thiago Ramos', 'Aline Barbosa', 'Gustavo Pinto', 'Renata Dias', 'Diego Fernandes', 'Vanessa Lopes', 'Eduardo Rocha', 'Priscila Araújo', 'Leonardo Martins', 'Fernanda Castro', 'Rodrigo Teixeira']
  const chans = ['whatsapp', 'instagram', 'facebook', 'telegram']
  const dist = [['lead', 10], ['qual', 8], ['prop', 6], ['neg', 4], ['closed', 3], ['lost', 2]]
  const out = []
  let i = 0
  dist.forEach(([stage, n]) => {
    for (let k = 0; k < n; k++) {
      // Data descorrelacionada da etapa (passo primo em 90d) → cada período
      // recebe uma amostra de todas as etapas e o funil mantém a proporção.
      const daysBack = (i * 37) % 90
      out.push({
        id: 'demo-' + i,
        name: names[i % names.length],
        phone: '+55 11 9' + String(80000000 + i * 137013).slice(0, 8),
        channel: chans[i % chans.length],
        tags: [],
        stage,
        value: 800 + (i % 9) * 640,
        created_at: new Date(Date.now() - daysBack * 864e5).toISOString(),
      })
      i++
    }
  })
  return out
})()

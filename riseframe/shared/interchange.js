// Exportar a edição para outros editores (Premiere Pro, DaVinci Resolve, Final Cut Pro),
// como o FilmCraft e os editores profissionais fazem: os cortes do vídeo principal viram
// uma sequência que aponta para os arquivos ORIGINAIS (sem render), para a pessoa terminar
// lá (cor, mix, efeitos). Formatos:
//   - FCP 7 XML (.xml, xmeml v5): Premiere Pro e DaVinci Resolve;
//   - FCPXML 1.10 (.fcpxml): Final Cut Pro e DaVinci Resolve;
//   - CMX 3600 EDL (.edl): qualquer editor (o formato mais antigo e universal).
// Entrada: { title, fps, width, height, clips: [{ name, path, srcIn, srcOut, srcDuration,
// hasAudio, width, height }] } — os clipes em ordem, colados um depois do outro. Puro.

/** Quadros por segundo de verdade e a base inteira (29,97 → base 30, NTSC). Puro. */
export function rateOf(fps) {
  const f = Number(fps) > 0 ? Number(fps) : 30;
  const base = Math.round(f);
  const ntsc = Math.abs(f - (base * 1000) / 1001) < 0.02 && Math.abs(f - base) > 0.005;
  return { fps: ntsc ? (base * 1000) / 1001 : base, timebase: base, ntsc, num: ntsc ? 1001 : 1, den: ntsc ? base * 1000 : base };
}

/** Segundos → quadros (arredondado). Puro. */
export const framesOf = (sec, rate) => Math.max(0, Math.round(Number(sec || 0) * rate.fps));

/** Quadros → HH:MM:SS:FF (sem drop-frame, na base inteira). Puro. */
export function timecode(frames, timebase) {
  const tb = Math.max(1, Math.round(timebase));
  const f = Math.max(0, Math.round(frames));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(f / (tb * 3600)))}:${p(Math.floor(f / (tb * 60)) % 60)}:${p(Math.floor(f / tb) % 60)}:${p(f % tb)}`;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const baseName = (p) => String(p || '').split(/[\\/]/).pop() || 'video.mp4';

/** Caminho do arquivo → URL file:// (Windows: file://localhost/C:/…). Puro. */
export function fileUrl(p, { localhost = true } = {}) {
  let s = String(p || '').replace(/\\/g, '/');
  if (!s) return '';
  if (!s.startsWith('/')) s = `/${s}`; // C:/… → /C:/…
  const enc = s.split('/').map((seg, i) => (i === 1 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/');
  return `file://${localhost ? 'localhost' : ''}${enc}`;
}

/** Clipes válidos, em quadros, já posicionados na sequência. Puro. */
export function layoutClips(clips, rate) {
  let rec = 0;
  const out = [];
  for (const c of clips || []) {
    const a = framesOf(c.srcIn, rate);
    const b = framesOf(c.srcOut, rate);
    if (!c?.path || b - a < 1) continue;
    out.push({ ...c, name: c.name || baseName(c.path), inF: a, outF: b, recIn: rec, recOut: rec + (b - a), durF: Math.max(b, framesOf(c.srcDuration, rate)) });
    rec += b - a;
  }
  return out;
}

/** CMX 3600 EDL. Puro. */
export function toEdl({ title = 'Riseframe', fps = 30, clips = [] } = {}) {
  const rate = rateOf(fps);
  const list = layoutClips(clips, rate);
  const tc = (f) => timecode(f, rate.timebase);
  const lines = [`TITLE: ${String(title).replace(/[\r\n]+/g, ' ').slice(0, 70)}`, 'FCM: NON-DROP FRAME', ''];
  list.forEach((c, i) => {
    const n = String(i + 1).padStart(3, '0');
    const reel = 'AX';
    lines.push(`${n}  ${reel.padEnd(8)} ${c.hasAudio === false ? 'V    ' : 'AA/V '} C        ${tc(c.inF)} ${tc(c.outF)} ${tc(c.recIn)} ${tc(c.recOut)}`);
    lines.push(`* FROM CLIP NAME: ${c.name}`);
    lines.push(`* SOURCE FILE: ${c.path}`);
    lines.push('');
  });
  return `${lines.join('\r\n')}\r\n`;
}

/** FCP 7 XML (xmeml v5) — Premiere Pro (Arquivo › Importar) e DaVinci Resolve. Puro. */
export function toXmeml({ title = 'Riseframe', fps = 30, width = 1080, height = 1920, clips = [] } = {}) {
  const rate = rateOf(fps);
  const list = layoutClips(clips, rate);
  const rateXml = `<rate><timebase>${rate.timebase}</timebase><ntsc>${rate.ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
  const total = list.length ? list[list.length - 1].recOut : 0;
  const files = new Map(); // caminho → id
  const fileXml = (c) => {
    if (files.has(c.path)) return `<file id="${files.get(c.path)}"/>`;
    const id = `file-${files.size + 1}`;
    files.set(c.path, id);
    return `<file id="${id}"><name>${esc(c.name)}</name><pathurl>${esc(fileUrl(c.path))}</pathurl>${rateXml}<duration>${c.durF}</duration>`
      + `<media><video><samplecharacteristics>${rateXml}<width>${c.width || width}</width><height>${c.height || height}</height></samplecharacteristics></video>`
      + `${c.hasAudio === false ? '' : '<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>'}</media></file>`;
  };
  const vItems = [];
  const aItems = [];
  list.forEach((c, i) => {
    const common = `<name>${esc(c.name)}</name><enabled>TRUE</enabled><duration>${c.durF}</duration>${rateXml}<start>${c.recIn}</start><end>${c.recOut}</end><in>${c.inF}</in><out>${c.outF}</out>`;
    const link = c.hasAudio === false ? '' : `<link><linkclipref>v${i + 1}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${i + 1}</clipindex></link>`
      + `<link><linkclipref>a${i + 1}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${aItems.length + 1}</clipindex></link>`;
    vItems.push(`<clipitem id="v${i + 1}">${common}${fileXml(c)}${link}</clipitem>`);
    if (c.hasAudio !== false) aItems.push(`<clipitem id="a${i + 1}">${common}<file id="${files.get(c.path)}"/><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>${link}</clipitem>`);
  });
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="sequence-1">'
    + `<name>${esc(title)}</name><duration>${total}</duration>${rateXml}`
    + `<timecode>${rateXml}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>`
    + `<media><video><format><samplecharacteristics>${rateXml}<width>${width}</width><height>${height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>`
    + `<track>${vItems.join('')}</track></video>`
    + `<audio><numOutputChannels>2</numOutputChannels><track>${aItems.join('')}</track></audio></media>`
    + '</sequence></xmeml>\n';
}

/** FCPXML 1.10 — Final Cut Pro e DaVinci Resolve. Puro. */
export function toFcpxml({ title = 'Riseframe', fps = 30, width = 1080, height = 1920, clips = [] } = {}) {
  const rate = rateOf(fps);
  const list = layoutClips(clips, rate);
  const t = (frames) => (frames === 0 ? '0s' : `${frames * rate.num}/${rate.den}s`);
  const assets = new Map();
  for (const c of list) {
    if (!assets.has(c.path)) assets.set(c.path, { id: `r${assets.size + 2}`, c });
    else assets.get(c.path).c.durF = Math.max(assets.get(c.path).c.durF, c.durF);
  }
  const fmt = `<format id="r1" name="FFVideoFormatRateUndefined" frameDuration="${rate.num}/${rate.den}s" width="${width}" height="${height}"/>`;
  const res = [...assets.entries()].map(([p, { id, c }]) => `<asset id="${id}" name="${esc(c.name)}" start="0s" duration="${t(c.durF)}" hasVideo="1" format="r1"${c.hasAudio === false ? '' : ' hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000"'}><media-rep kind="original-media" src="${esc(fileUrl(p, { localhost: false }))}"/></asset>`).join('');
  const total = list.length ? list[list.length - 1].recOut : 0;
  const spine = list.map((c) => `<asset-clip ref="${assets.get(c.path).id}" name="${esc(c.name)}" offset="${t(c.recIn)}" start="${t(c.inF)}" duration="${t(c.outF - c.inF)}" format="r1" tcFormat="NDF"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n<fcpxml version="1.10">'
    + `<resources>${fmt}${res}</resources>`
    + `<library><event name="${esc(title)}"><project name="${esc(title)}"><sequence format="r1" duration="${t(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k"><spine>${spine}</spine></sequence></project></event></library>`
    + '</fcpxml>\n';
}

export const INTERCHANGE = {
  xml: { ext: 'xml', type: 'application/xml', build: toXmeml, label: 'Premiere Pro / DaVinci (.xml)' },
  fcpxml: { ext: 'fcpxml', type: 'application/xml', build: toFcpxml, label: 'Final Cut / DaVinci (.fcpxml)' },
  edl: { ext: 'edl', type: 'text/plain', build: toEdl, label: 'EDL (.edl)' },
};

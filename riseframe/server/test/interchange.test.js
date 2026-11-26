import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateOf, timecode, fileUrl, layoutClips, toEdl, toXmeml, toFcpxml } from '../../shared/interchange.js';

const clips = [
  { path: 'C:\\Users\\Ana\\Vídeos\\gravação 1.mp4', srcIn: 1, srcOut: 3.5, srcDuration: 60, hasAudio: true, width: 1080, height: 1920 },
  { path: 'C:\\Users\\Ana\\Vídeos\\gravação 1.mp4', srcIn: 10, srcOut: 12, srcDuration: 60, hasAudio: true },
  { path: '/x/b.mov', srcIn: 0, srcOut: 0.01 }, // curto demais: sai
];

test('taxas: 29,97 é NTSC base 30; 25 é inteira', () => {
  assert.deepEqual(rateOf(29.97), { fps: 30000 / 1001, timebase: 30, ntsc: true, num: 1001, den: 30000 });
  assert.equal(rateOf(25).ntsc, false);
  assert.equal(rateOf(60).timebase, 60);
  assert.equal(timecode(30 * 3661 + 5, 30), '01:01:01:05');
});

test('caminho do Windows vira file://localhost/C:/… com acentos e espaços codificados', () => {
  assert.equal(fileUrl('C:\\Users\\Ana\\gravação 1.mp4'), 'file://localhost/C:/Users/Ana/grava%C3%A7%C3%A3o%201.mp4');
  assert.equal(fileUrl('/home/a/b c.mp4', { localhost: false }), 'file:///home/a/b%20c.mp4');
});

test('clipes colados em sequência, em quadros', () => {
  const l = layoutClips(clips, rateOf(30));
  assert.equal(l.length, 2);
  assert.deepEqual([l[0].inF, l[0].outF, l[0].recIn, l[0].recOut], [30, 105, 0, 75]);
  assert.deepEqual([l[1].inF, l[1].outF, l[1].recIn, l[1].recOut], [300, 360, 75, 135]);
});

test('EDL CMX 3600 com os tempos de origem e da sequência', () => {
  const edl = toEdl({ title: 'Meu vídeo', fps: 30, clips });
  assert.match(edl, /^TITLE: Meu vídeo\r\nFCM: NON-DROP FRAME/);
  assert.match(edl, /001 {2}AX {7}AA\/V {2}C {8}00:00:01:00 00:00:03:15 00:00:00:00 00:00:02:15/);
  assert.match(edl, /002 .* 00:00:10:00 00:00:12:00 00:00:02:15 00:00:04:15/);
  assert.match(edl, /\* SOURCE FILE: C:\\Users\\Ana/);
});

test('FCP7 XML: um arquivo só (reusado), vídeo e áudio ligados', () => {
  const xml = toXmeml({ title: 'A & B', fps: 29.97, width: 1080, height: 1920, clips });
  assert.match(xml, /<xmeml version="5">/);
  assert.match(xml, /<name>A &amp; B<\/name>/);
  assert.equal((xml.match(/<pathurl>/g) || []).length, 1);
  assert.equal((xml.match(/<clipitem id="v/g) || []).length, 2);
  assert.equal((xml.match(/<clipitem id="a/g) || []).length, 2);
  assert.match(xml, /<ntsc>TRUE<\/ntsc>/);
});

test('FCPXML 1.10: tempos racionais e um asset por arquivo', () => {
  const x = toFcpxml({ title: 'T', fps: 29.97, clips });
  assert.match(x, /<fcpxml version="1.10">/);
  assert.match(x, /frameDuration="1001\/30000s"/);
  assert.equal((x.match(/<asset /g) || []).length, 1);
  assert.equal((x.match(/<asset-clip /g) || []).length, 2);
  assert.match(x, /offset="0s" start="30030\/30000s" duration="75075\/30000s"/);
  assert.match(x, /src="file:\/\/\/C:\/Users\/Ana\//);
});

// Ação: Enviar arquivo
import React, { memo, useRef } from 'react'
import { Paperclip, Upload, FileText, Image as ImageIcon, Video } from 'lucide-react'
import {
  NodeShell, Label, TextInput, TextArea, Slider, T, useUpdateNodeData,
} from './_shared'

const kindIcon = (mime = '') =>
  mime.startsWith('image') ? ImageIcon : mime.startsWith('video') ? Video : FileText

export default memo(function ActionSendFile({ id, data }) {
  const update = useUpdateNodeData(id)
  const fileRef = useRef(null)
  const delay = data.delay ?? 0

  const onPick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Só guardamos metadados no nó; o upload real acontece ao executar o funil.
    update({ fileName: file.name, fileType: file.type, fileSize: file.size, url: '' })
  }

  const KindIcon = kindIcon(data.fileType)

  return (
    <NodeShell id={id} color={T.blue} Icon={Paperclip} title="Ação · Enviar arquivo">
      <div>
        <Label>Arquivo (imagem / PDF / vídeo)</Label>
        <input ref={fileRef} type="file" accept="image/*,application/pdf,video/*"
          className="nodrag" style={{ display: 'none' }} onChange={onPick} />
        {data.fileName ? (
          <button className="nodrag" onClick={() => fileRef.current?.click()}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, background: T.field,
              border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 9px', color: T.text, fontSize: 11.5,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', textAlign: 'left' }}>
            <KindIcon size={14} color={T.blue} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.fileName}</span>
          </button>
        ) : (
          <button className="nodrag" onClick={() => fileRef.current?.click()}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'none', border: `1px dashed ${T.border}`, borderRadius: 8, padding: '9px', color: T.muted,
              fontSize: 11.5, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
            <Upload size={13} /> Escolher arquivo
          </button>
        )}
      </div>
      <div>
        <Label>Ou URL pública</Label>
        <TextInput placeholder="https://…/arquivo.pdf"
          value={data.url ?? ''} onChange={(e) => update({ url: e.target.value, fileName: '', fileType: '' })} />
      </div>
      <div>
        <Label>Legenda (opcional)</Label>
        <TextArea placeholder="Segue o material que combinamos 😉"
          value={data.caption ?? ''} onChange={(e) => update({ caption: e.target.value })} style={{ minHeight: 44 }} />
      </div>
      <div>
        <Label>Delay antes de enviar</Label>
        <Slider value={delay} onChange={(v) => update({ delay: v })} min={0} max={60} suffix="s" />
      </div>
    </NodeShell>
  )
})

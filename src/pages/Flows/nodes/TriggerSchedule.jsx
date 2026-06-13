// Gatilho: Horário específico
import React, { memo } from 'react'
import { Clock } from 'lucide-react'
import { NodeShell, Label, TextInput, SelectInput, TextArea, T, useUpdateNodeData } from './_shared'

const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default memo(function TriggerSchedule({ id, data }) {
  const update = useUpdateNodeData(id)
  const days = data.days ?? ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']
  const toggleDay = (d) => update({ days: days.includes(d) ? days.filter((x) => x !== d) : [...days, d] })

  return (
    <NodeShell id={id} color={T.green} Icon={Clock} title="Gatilho · Horário específico" hasInput={false}>
      <div>
        <Label>Dias da semana</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {DAYS.map((d) => {
            const on = days.includes(d)
            return (
              <button key={d} className="nodrag" onClick={() => toggleDay(d)}
                style={{ background: on ? T.green + '33' : T.field, color: on ? '#6EE7B7' : T.muted,
                  border: `1px solid ${on ? T.green : T.border}`, borderRadius: 6, padding: '4px 7px',
                  fontSize: 10.5, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                {d}
              </button>
            )
          })}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Label>Início</Label>
          <TextInput type="time" value={data.start ?? '08:00'} onChange={(e) => update({ start: e.target.value })} />
        </div>
        <div style={{ flex: 1 }}>
          <Label>Fim</Label>
          <TextInput type="time" value={data.end ?? '18:00'} onChange={(e) => update({ end: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Fora desse horário</Label>
        <SelectInput value={data.outOfHours ?? 'ignore'} onChange={(e) => update({ outOfHours: e.target.value })}
          options={[{ value: 'ignore', label: 'Ignorar' }, { value: 'reply', label: 'Responder mensagem padrão' }]} />
      </div>
      {data.outOfHours === 'reply' && (
        <div>
          <Label>Mensagem padrão (fora do horário)</Label>
          <TextArea placeholder="Estamos fora do horário de atendimento. Retornaremos em breve!"
            value={data.outOfHoursMessage ?? ''} onChange={(e) => update({ outOfHoursMessage: e.target.value })} />
        </div>
      )}
    </NodeShell>
  )
})

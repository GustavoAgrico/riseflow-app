// Registro central dos nós customizados do builder de funis.
// `nodeTypes` é passado direto para o <ReactFlow nodeTypes={...} />.
// `NODE_CATALOG` alimenta a paleta lateral (label, cor e categoria de cada nó).
import { Key, UserPlus, Clock, Tag, MessageSquare, Paperclip, Hourglass, Tags, Headphones, Webhook, Mail } from 'lucide-react'
import { T } from './_shared'

import TriggerKeyword from './TriggerKeyword'
import TriggerFirstContact from './TriggerFirstContact'
import TriggerSchedule from './TriggerSchedule'
import TriggerTag from './TriggerTag'
import ActionSendText from './ActionSendText'
import ActionSendFile from './ActionSendFile'
import ActionWaitReply from './ActionWaitReply'
import ActionApplyTag from './ActionApplyTag'
import ActionTransfer from './ActionTransfer'
import ActionWebhook from './ActionWebhook'
import ActionSendEmail from './ActionSendEmail'

/* Mapa type → componente — registrado no React Flow. */
export const nodeTypes = {
  triggerKeyword: TriggerKeyword,
  triggerFirstContact: TriggerFirstContact,
  triggerSchedule: TriggerSchedule,
  triggerTag: TriggerTag,
  actionSendText: ActionSendText,
  actionSendFile: ActionSendFile,
  actionWaitReply: ActionWaitReply,
  actionApplyTag: ActionApplyTag,
  actionTransfer: ActionTransfer,
  actionWebhook: ActionWebhook,
  actionSendEmail: ActionSendEmail,
}

/* Catálogo para a paleta (arrastar/soltar). */
export const NODE_CATALOG = [
  { group: 'Gatilhos', color: T.green, items: [
    { type: 'triggerKeyword',      Icon: Key,      label: 'Palavra-chave' },
    { type: 'triggerFirstContact', Icon: UserPlus, label: 'Primeiro contato' },
    { type: 'triggerSchedule',     Icon: Clock,    label: 'Horário específico' },
    { type: 'triggerTag',          Icon: Tag,      label: 'Tag aplicada' },
  ] },
  { group: 'Ações', color: T.orange, items: [
    { type: 'actionSendText',  Icon: MessageSquare, label: 'Enviar texto' },
    { type: 'actionSendFile',  Icon: Paperclip,     label: 'Enviar arquivo' },
    { type: 'actionWaitReply', Icon: Hourglass,     label: 'Aguardar resposta' },
    { type: 'actionApplyTag',  Icon: Tags,          label: 'Aplicar tag' },
    { type: 'actionTransfer',  Icon: Headphones,    label: 'Transferir p/ humano' },
    { type: 'actionWebhook',   Icon: Webhook,       label: 'Chamar webhook' },
    { type: 'actionSendEmail', Icon: Mail,          label: 'Enviar email' },
  ] },
]

export default nodeTypes

import React from 'react'
import { Facebook } from 'lucide-react'
import { MetaConnectModal } from './MetaConnectModal'

// Facebook Messenger — canal Meta (Graph API). Toda a lógica vive em
// MetaConnectModal; aqui só o visual do canal.
export const FacebookModal = ({ onClose, onSuccess }) => (
  <MetaConnectModal
    channel="facebook"
    title="Facebook Messenger"
    icon={<Facebook size={22} color="#1877F2" />}
    iconBg="rgba(24,119,242,0.15)"
    onClose={onClose}
    onSuccess={onSuccess}
  />
)

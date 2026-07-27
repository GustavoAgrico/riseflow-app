import React from 'react'
import { Instagram } from 'lucide-react'
import { MetaConnectModal } from './MetaConnectModal'

// Instagram DM — canal Meta (Graph API). Toda a lógica vive em MetaConnectModal;
// aqui só o visual do canal. Requer conta profissional vinculada a uma página.
export const InstagramModal = ({ onClose, onSuccess }) => (
  <MetaConnectModal
    channel="instagram"
    title="Instagram DM"
    icon={<Instagram size={22} color="#E1306C" />}
    iconBg="rgba(225,48,108,0.15)"
    onClose={onClose}
    onSuccess={onSuccess}
  />
)

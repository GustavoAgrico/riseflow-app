import React from 'react'

const WhatsAppIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.978-1.413A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
      fill="#25D366"
    />
    <path
      d="M17.07 14.47c-.27-.135-1.598-.788-1.845-.878-.248-.09-.428-.135-.608.135-.18.27-.698.878-.855 1.058-.158.18-.315.203-.585.068-.27-.135-1.14-.42-2.173-1.34-.803-.717-1.345-1.602-1.502-1.872-.158-.27-.017-.415.118-.55.121-.12.27-.315.405-.473.135-.157.18-.27.27-.45.09-.18.045-.337-.022-.472-.068-.135-.608-1.463-.833-2.003-.22-.525-.442-.453-.608-.462-.157-.007-.337-.009-.517-.009-.18 0-.472.068-.72.337-.247.27-.945.923-.945 2.25s.968 2.61 1.103 2.79c.135.18 1.905 2.91 4.62 4.08.645.278 1.148.443 1.54.568.647.205 1.236.176 1.702.107.52-.077 1.598-.653 1.823-1.283.225-.63.225-1.17.157-1.283-.067-.112-.247-.18-.517-.315z"
      fill="white"
    />
  </svg>
)

const InstagramIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#F58529" />
        <stop offset="50%" stopColor="#DD2A7B" />
        <stop offset="100%" stopColor="#8134AF" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)" />
    <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none" />
    <circle cx="17.2" cy="6.8" r="1.2" fill="white" />
  </svg>
)

const FacebookIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect width="24" height="24" rx="6" fill="#1877F2" />
    <path
      d="M15.5 8H13.5C13.2 8 13 8.2 13 8.5V10H15.5L15.2 12.5H13V20H10.5V12.5H9V10H10.5V8.5C10.5 6.6 11.8 5 13.7 5H15.5V8Z"
      fill="white"
    />
  </svg>
)

const TelegramIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#2AABEE" />
    <path
      d="M6.5 11.8L17.5 7.5L14.5 17L11.5 13.8L8.5 15.5L9.5 12L6.5 11.8Z"
      fill="white"
    />
    <path d="M11.5 13.8L14.5 17L11.5 13.5" fill="#C8DAEA" />
  </svg>
)

const EmailIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="2" y="5" width="20" height="15" rx="3" fill="#F59E0B" />
    <path d="M2 8L12 14L22 8" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
)

const AIIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#8B5CF6" />
    <path d="M12 6.5L13.2 9.8H16.7L13.9 11.8L15 15.1L12 13.1L9 15.1L10.1 11.8L7.3 9.8H10.8L12 6.5Z" fill="white" />
  </svg>
)

const ICON_MAP = {
  whatsapp: WhatsAppIcon,
  whatsapp_cloud: WhatsAppIcon,
  instagram: InstagramIcon,
  facebook: FacebookIcon,
  telegram: TelegramIcon,
  email: EmailIcon,
  ai: AIIcon,
}

export const BrandIcon = ({ id, size = 24 }) => {
  const Icon = ICON_MAP[id]
  if (!Icon) return null
  return <Icon size={size} />
}

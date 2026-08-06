// src/constants/config.js

export const APP_NAME = 'RiseFlow'
export const APP_VERSION = '1.0.0'
export const APP_TAGLINE = 'Automatize seus fluxos de vendas'

export const COLORS = {
  orange: '#FF6B35',
  orangeDark: '#E55100',
  blue: '#3B82F6',
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
}

export const INTEGRATIONS = [
  { id: 'whatsapp', name: 'WhatsApp', color: '#25D366', icon: 'MessageCircle', connected: true },
  { id: 'instagram', name: 'Instagram', color: '#E1306C', icon: 'Instagram', connected: false },
  { id: 'facebook', name: 'Facebook', color: '#1877F2', icon: 'Facebook', connected: true },
  { id: 'telegram', name: 'Telegram', color: '#2AABEE', icon: 'Send', connected: false },
]

export const PLANS = [
  { id: 'starter', name: 'Starter', price: 0, messages: 100, integrations: 1, users: 1 },
  { id: 'pro', name: 'Professional', price: 49, messages: 10000, integrations: 3, users: 5 },
  { id: 'enterprise', name: 'Enterprise', price: 199, messages: -1, integrations: -1, users: -1 },
]

export const MOCK_STATS = {
  totalMessages: 12847,
  activeFlows: 24,
  totalClients: 1382,
  conversionRate: 68.4,
  responseTime: '1.2min',
  satisfaction: 94.2,
}

export const MOCK_CLIENTS = [
  { id: 1, name: 'Ana Paula Silva', phone: '+55 11 9999-0001', channel: 'whatsapp', status: 'active', lastMessage: '2 min atrás', tag: 'Lead Quente' },
  { id: 2, name: 'Carlos Eduardo', phone: '+55 21 9999-0002', channel: 'instagram', status: 'pending', lastMessage: '15 min atrás', tag: 'Prospect' },
  { id: 3, name: 'Marina Rodrigues', phone: '+55 31 9999-0003', channel: 'facebook', status: 'active', lastMessage: '1h atrás', tag: 'Cliente' },
  { id: 4, name: 'Roberto Santos', phone: '+55 11 9999-0004', channel: 'whatsapp', status: 'closed', lastMessage: '3h atrás', tag: 'Inativo' },
  { id: 5, name: 'Julia Ferreira', phone: '+55 41 9999-0005', channel: 'instagram', status: 'active', lastMessage: '5min atrás', tag: 'Lead Quente' },
  { id: 6, name: 'Marcos Lima', phone: '+55 85 9999-0006', channel: 'whatsapp', status: 'active', lastMessage: '30min atrás', tag: 'VIP' },
]

export const MOCK_FLOWS = [
  { id: 1, name: 'Boas-vindas WhatsApp', channel: 'whatsapp', status: 'active', triggers: 847, conversions: 312, rate: 36.8 },
  { id: 2, name: 'Qualificação de Leads', channel: 'instagram', status: 'active', triggers: 1203, conversions: 891, rate: 74.1 },
  { id: 3, name: 'Follow-up Carrinho', channel: 'facebook', status: 'paused', triggers: 445, conversions: 189, rate: 42.5 },
  { id: 4, name: 'Pós-venda Satisfação', channel: 'whatsapp', status: 'active', triggers: 2891, conversions: 2341, rate: 81.0 },
]

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LayoutDashboard', path: '/dashboard' },
  { id: 'chat', label: 'Chat', icon: 'MessageSquare', path: '/chat' },
  { id: 'smart-attendant', label: 'Atendimento IA', icon: 'Bot', path: '/smart-attendant', badge: 'IA' },
  { id: 'flows', label: 'Funis', icon: 'GitBranch', path: '/flows', badge: 'NEW' },
  { id: 'crm', label: 'CRM', icon: 'Users', path: '/crm' },
  { id: 'clients', label: 'Clientes', icon: 'ContactRound', path: '/clients' },
  { id: 'analytics', label: 'Analytics', icon: 'BarChart3', path: '/analytics' },
  { id: 'funnel', label: 'Funil', icon: 'Filter', path: '/funnel' },
  { id: 'campaigns', label: 'Campanhas', icon: 'Megaphone', path: '/campaigns' },
  { id: 'schedules', label: 'Agendamentos', icon: 'Calendar', path: '/schedules' },
  { id: 'teams', label: 'Equipes', icon: 'UserCog', path: '/teams' },
  { id: 'templates', label: 'Templates', icon: 'FileText', path: '/templates' },
  { id: 'integrations', label: 'Integrações', icon: 'Plug', path: '/integrations' },
  { id: 'automation', label: 'Automação', icon: 'Zap', path: '/automation' },
  { id: 'plans', label: 'Planos', icon: 'Crown', path: '/plans' },
  { id: 'logs', label: 'Logs', icon: 'ClipboardList', path: '/activity-logs' },
  { id: 'settings', label: 'Configurações', icon: 'Settings', path: '/settings' },
]

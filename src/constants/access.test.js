import { describe, it, expect } from 'vitest'
import { ROLES, normalizeRole, canAccessPath, canManage } from './access'

describe('normalizeRole', () => {
  it('não-membro é sempre Owner', () => {
    expect(normalizeRole(null, { isMember: false })).toBe(ROLES.OWNER)
    expect(normalizeRole('Atendente', { isMember: false })).toBe(ROLES.OWNER)
  })
  it('mapeia cargos do membro (case-insensitive)', () => {
    expect(normalizeRole('Admin', { isMember: true })).toBe(ROLES.ADMIN)
    expect(normalizeRole('administrador', { isMember: true })).toBe(ROLES.ADMIN)
    expect(normalizeRole('SUPERVISOR', { isMember: true })).toBe(ROLES.SUPERVISOR)
    expect(normalizeRole('atendente', { isMember: true })).toBe(ROLES.ATENDENTE)
  })
  it('cargo desconhecido/vazio de membro cai em Atendente', () => {
    expect(normalizeRole('', { isMember: true })).toBe(ROLES.ATENDENTE)
    expect(normalizeRole('qualquer', { isMember: true })).toBe(ROLES.ATENDENTE)
  })
})

describe('canAccessPath', () => {
  it('Owner acessa tudo', () => {
    expect(canAccessPath(ROLES.OWNER, '/billing')).toBe(true)
    expect(canAccessPath(ROLES.OWNER, '/settings')).toBe(true)
  })
  it('Atendente: só operacional', () => {
    expect(canAccessPath(ROLES.ATENDENTE, '/chat')).toBe(true)
    expect(canAccessPath(ROLES.ATENDENTE, '/crm/board')).toBe(true) // sub-rota
    expect(canAccessPath(ROLES.ATENDENTE, '/teams')).toBe(false)
    expect(canAccessPath(ROLES.ATENDENTE, '/activity-logs')).toBe(false)
    expect(canAccessPath(ROLES.ATENDENTE, '/billing')).toBe(false)
  })
  it('Supervisor: operacional + monitoramento', () => {
    expect(canAccessPath(ROLES.SUPERVISOR, '/teams')).toBe(true)
    expect(canAccessPath(ROLES.SUPERVISOR, '/activity-logs')).toBe(true)
    expect(canAccessPath(ROLES.SUPERVISOR, '/integrations')).toBe(false)
    expect(canAccessPath(ROLES.SUPERVISOR, '/billing')).toBe(false)
  })
  it('Admin: gestão (menos financeiro/config do dono)', () => {
    expect(canAccessPath(ROLES.ADMIN, '/teams')).toBe(true)
    expect(canAccessPath(ROLES.ADMIN, '/integrations')).toBe(true)
    expect(canAccessPath(ROLES.ADMIN, '/billing')).toBe(false)
    expect(canAccessPath(ROLES.ADMIN, '/settings')).toBe(false)
    expect(canAccessPath(ROLES.ADMIN, '/plans')).toBe(false)
  })
})

describe('canManage', () => {
  it('só o dono edita telas de gestão', () => {
    expect(canManage(ROLES.OWNER)).toBe(true)
    expect(canManage(ROLES.ADMIN)).toBe(false)
    expect(canManage(ROLES.SUPERVISOR)).toBe(false)
  })
})

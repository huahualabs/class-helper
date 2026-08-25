import { OWNER_PARENT_PORTAL_ENABLED, requireOwnerIntegrationValue } from './deploymentProfile'

export const SHARED_CLASS_ID = OWNER_PARENT_PORTAL_ENABLED
  ? requireOwnerIntegrationValue('VITE_CENTRAL_PORTAL_CLASS_ID')
  : ''

export const CALENDAR_SOURCE_MODES = Object.freeze({
  CENTRAL: 'central',
  LEGACY: 'legacy',
})

const configuredSourceMode = String(import.meta.env.VITE_SHARED_CALENDAR_SOURCE_MODE || '').trim()

// Safe default: an explicit opt-in is required before this app can use central Firestore.
// This keeps production untouched while local Emulator work uses `central` via .env.local.
export const CALENDAR_SOURCE_MODE = OWNER_PARENT_PORTAL_ENABLED
  && configuredSourceMode === CALENDAR_SOURCE_MODES.CENTRAL
  ? CALENDAR_SOURCE_MODES.CENTRAL
  : CALENDAR_SOURCE_MODES.LEGACY

export function isSharedClassId(classId) {
  return classId === SHARED_CLASS_ID
}

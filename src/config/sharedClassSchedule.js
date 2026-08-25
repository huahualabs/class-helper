import { SHARED_CLASS_ID } from './sharedClassEvents'
import { OWNER_PARENT_PORTAL_ENABLED } from './deploymentProfile'

export { SHARED_CLASS_ID }

export const SCHEDULE_SOURCE_MODES = Object.freeze({
  CENTRAL: 'central',
  LEGACY: 'legacy',
})

const configuredSourceMode = String(import.meta.env.VITE_SHARED_SCHEDULE_SOURCE_MODE || '').trim()

export const SCHEDULE_SOURCE_MODE = OWNER_PARENT_PORTAL_ENABLED
  && configuredSourceMode === SCHEDULE_SOURCE_MODES.CENTRAL
  ? SCHEDULE_SOURCE_MODES.CENTRAL
  : SCHEDULE_SOURCE_MODES.LEGACY

export function isSharedScheduleClassId(classId) {
  return classId === SHARED_CLASS_ID
}

export function isScheduleImportEnabled(env = import.meta.env) {
  const ownerProfile = env.VITE_CLASS_HELPER_DEPLOYMENT_PROFILE === 'owner-parent-portal'
  if (!ownerProfile) return false
  const isolatedEmulator = Boolean(env.DEV) && env.VITE_CENTRAL_USE_FIREBASE_EMULATORS === 'true'
  const explicitProductionImport = env.VITE_ENABLE_PRODUCTION_SCHEDULE_IMPORT === 'true'
  return isolatedEmulator || explicitProductionImport
}

// This flag controls only the one-time import flow. It does not enable the
// normal central schedule/calendar source modes or relax their Emulator guard.
export const SCHEDULE_IMPORT_ENABLED = OWNER_PARENT_PORTAL_ENABLED && isScheduleImportEnabled()

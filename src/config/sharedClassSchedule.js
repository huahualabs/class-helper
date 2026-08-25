import { SHARED_CLASS_ID } from './sharedClassEvents'

export { SHARED_CLASS_ID }

export const SCHEDULE_SOURCE_MODES = Object.freeze({
  CENTRAL: 'central',
  LEGACY: 'legacy',
})

const configuredSourceMode = String(import.meta.env.VITE_SHARED_SCHEDULE_SOURCE_MODE || '').trim()

export const SCHEDULE_SOURCE_MODE = configuredSourceMode === SCHEDULE_SOURCE_MODES.CENTRAL
  ? SCHEDULE_SOURCE_MODES.CENTRAL
  : SCHEDULE_SOURCE_MODES.LEGACY

export function isSharedScheduleClassId(classId) {
  return classId === SHARED_CLASS_ID
}

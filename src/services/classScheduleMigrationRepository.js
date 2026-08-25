import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { isScheduleImportEnabled, SHARED_CLASS_ID, isSharedScheduleClassId } from '../config/sharedClassSchedule'
import { assembleSchedule } from './classScheduleRepository'
import { getCentralPortalServices } from './centralPortalFirebase'

export const LEGACY_SCHEDULE_STORAGE_KEY = 'classHelperWeeklyScheduleV1'
export const SCHEDULE_DAYS = Object.freeze(['mon', 'tue', 'wed', 'thu', 'fri'])

const VALID_KINDS = new Set(['morning', 'class', 'recess', 'cleaning', 'lunch', 'assembly', 'other'])
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const defaultFirestoreApi = { collection, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp }

export class ScheduleImportError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ScheduleImportError'
    this.code = code
  }
}

function fail(code, message) {
  throw new ScheduleImportError(code, message)
}

function isMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value, allowed) {
  return Object.keys(value).every(key => allowed.includes(key))
}

function validText(value, maxLength, { required = false } = {}) {
  return typeof value === 'string'
    && value.length <= maxLength
    && (!required || value.trim().length > 0)
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export function validateLegacySchedule(value) {
  if (!isMap(value) || !hasOnlyKeys(value, ['version', 'periods', 'weekdays', 'halfDayCutoffs'])) {
    fail('invalid-schema', '舊課表格式不正確。')
  }
  if (value.version !== 2 || !Array.isArray(value.periods) || value.periods.length < 1 || value.periods.length > 31) {
    fail('invalid-schema', '舊課表版本或節次格式不正確。')
  }

  const periodIds = new Set()
  for (const period of value.periods) {
    if (!isMap(period) || !hasOnlyKeys(period, ['id', 'label', 'kind', 'start', 'end'])) {
      fail('invalid-schema', '舊課表節次包含不支援的欄位。')
    }
    if (!ID_PATTERN.test(period.id || '') || periodIds.has(period.id)) {
      fail('invalid-schema', '舊課表節次代碼不正確或重複。')
    }
    if (!validText(period.label, 40, { required: true }) || !VALID_KINDS.has(period.kind)) {
      fail('invalid-schema', '舊課表節次名稱或類型不正確。')
    }
    if (!TIME_PATTERN.test(period.start || '') || !TIME_PATTERN.test(period.end || '') || minutes(period.end) <= minutes(period.start)) {
      fail('invalid-schema', '舊課表節次時間不正確。')
    }
    periodIds.add(period.id)
  }

  if (!isMap(value.weekdays)
    || !hasOnlyKeys(value.weekdays, SCHEDULE_DAYS)
    || !SCHEDULE_DAYS.every(day => isMap(value.weekdays[day]))) {
    fail('invalid-schema', '舊課表星期資料不完整。')
  }

  for (const day of SCHEDULE_DAYS) {
    const entries = value.weekdays[day]
    if (Object.keys(entries).length !== periodIds.size || !Object.keys(entries).every(periodId => periodIds.has(periodId))) {
      fail('invalid-schema', '舊課表星期資料與節次不一致。')
    }
    for (const periodId of periodIds) {
      const entry = entries[periodId]
      if (!isMap(entry)
        || !hasOnlyKeys(entry, ['subject', 'icon', 'message'])
        || !validText(entry.subject, 80)
        || !validText(entry.icon, 8)
        || !validText(entry.message, 500)) {
        fail('invalid-schema', '舊課表科目、圖示或提醒內容不正確。')
      }
    }
  }

  if (!isMap(value.halfDayCutoffs)
    || !hasOnlyKeys(value.halfDayCutoffs, SCHEDULE_DAYS)
    || !SCHEDULE_DAYS.every(day => Object.prototype.hasOwnProperty.call(value.halfDayCutoffs, day))) {
    fail('invalid-schema', '舊課表半天設定不完整。')
  }
  for (const day of SCHEDULE_DAYS) {
    const cutoff = value.halfDayCutoffs[day]
    if (cutoff !== null && !periodIds.has(cutoff)) {
      fail('invalid-schema', '舊課表半天設定指向不存在的節次。')
    }
  }

  return structuredClone(value)
}

export function parseLegacySchedule(rawText) {
  if (typeof rawText !== 'string' || rawText.trim() === '') {
    fail('missing-legacy', '找不到舊課表，無法匯入。')
  }
  let value
  try {
    value = JSON.parse(rawText)
  } catch {
    fail('invalid-json', '舊課表資料無法解析，已停止匯入。')
  }
  return validateLegacySchedule(value)
}

export function readLegacySchedule(storage = window.localStorage) {
  return parseLegacySchedule(storage.getItem(LEGACY_SCHEDULE_STORAGE_KEY))
}

export function createLegacyScheduleImportPlan(schedule, classId = SHARED_CLASS_ID) {
  const validSchedule = validateLegacySchedule(schedule)
  if (!isSharedScheduleClassId(classId)) fail('wrong-class', '匯入目標班級不正確。')

  const periods = validSchedule.periods.map((period, sortOrder) => ({
    id: period.id,
    classId,
    periodId: period.id,
    label: period.label,
    kind: period.kind,
    startTime: period.start,
    endTime: period.end,
    sortOrder,
  }))
  const entries = []
  for (const day of SCHEDULE_DAYS) {
    for (const period of validSchedule.periods) {
      const source = validSchedule.weekdays[day][period.id]
      const entry = {
        id: `${day}_${period.id}`,
        classId,
        day,
        periodId: period.id,
        subject: source.subject,
      }
      if (source.icon) entry.icon = source.icon
      if (source.message) entry.message = source.message
      entries.push(entry)
    }
  }

  return {
    classId,
    schedule: validSchedule,
    root: {
      classId,
      visibility: 'public',
      schemaVersion: 1,
      dayCutoffs: Object.fromEntries(SCHEDULE_DAYS.map(day => [day, validSchedule.halfDayCutoffs[day] || ''])),
    },
    periods,
    entries,
    counts: { root: 1, periods: periods.length, entries: entries.length },
  }
}

function comparableSchedule(schedule) {
  if (!schedule) return null
  return {
    version: 2,
    periods: schedule.periods.map(({ id, label, kind, start, end }) => ({ id, label, kind, start, end })),
    weekdays: Object.fromEntries(SCHEDULE_DAYS.map(day => [day, Object.fromEntries(
      schedule.periods.map(period => {
        const entry = schedule.weekdays?.[day]?.[period.id] || {}
        return [period.id, {
          subject: entry.subject || '',
          icon: entry.icon || '',
          message: entry.message || '',
        }]
      }),
    )])),
    halfDayCutoffs: Object.fromEntries(SCHEDULE_DAYS.map(day => [day, schedule.halfDayCutoffs?.[day] || null])),
  }
}

export function schedulesMatch(expected, actual) {
  return JSON.stringify(comparableSchedule(expected)) === JSON.stringify(comparableSchedule(actual))
}

export function createClassScheduleMigrationRepository(
  services = getCentralPortalServices(),
  { importEnabled = isScheduleImportEnabled() } = {},
) {
  const { db, auth, firestoreApi = defaultFirestoreApi } = services

  function assertImportEnabled() {
    if (!importEnabled) fail('import-disabled', '共享課表匯入功能目前未啟用。')
  }

  async function requireTeacher(classId) {
    assertImportEnabled()
    if (!isSharedScheduleClassId(classId)) fail('wrong-class', '匯入目標班級不正確。')
    const uid = auth?.currentUser?.uid
    if (!uid) fail('unauthenticated', '請先登入中央班級平台教師帳號。')
    const profile = await firestoreApi.getDoc(firestoreApi.doc(db, 'users', uid))
    const data = profile.exists() ? profile.data() : null
    if (data?.role !== 'teacher' || !Array.isArray(data.classIds) || !data.classIds.includes(classId)) {
      fail('permission-denied', '目前中央帳號沒有此班級的教師權限。')
    }
    return uid
  }

  function refsFor(classId) {
    const root = firestoreApi.doc(db, 'classSchedules', classId)
    return {
      root,
      periods: firestoreApi.collection(root, 'periods'),
      entries: firestoreApi.collection(root, 'entries'),
    }
  }

  async function inspectCanonicalSchedule(classId = SHARED_CLASS_ID) {
    await requireTeacher(classId)
    const refs = refsFor(classId)
    const [rootSnapshot, periodsSnapshot, entriesSnapshot] = await Promise.all([
      firestoreApi.getDoc(refs.root),
      firestoreApi.getDocs(refs.periods),
      firestoreApi.getDocs(refs.entries),
    ])
    const result = {
      rootExists: rootSnapshot.exists(),
      periodCount: periodsSnapshot.size ?? periodsSnapshot.docs.length,
      entryCount: entriesSnapshot.size ?? entriesSnapshot.docs.length,
    }
    return { ...result, empty: !result.rootExists && result.periodCount === 0 && result.entryCount === 0 }
  }

  async function importLegacyScheduleOnce(classId = SHARED_CLASS_ID, schedule) {
    const plan = createLegacyScheduleImportPlan(schedule, classId)
    const before = await inspectCanonicalSchedule(classId)
    if (!before.empty) fail('canonical-exists', '共享課表已存在，禁止匯入。')

    const refs = refsFor(classId)
    await firestoreApi.runTransaction(db, async transaction => {
      const periodRefs = plan.periods.map(period => firestoreApi.doc(refs.periods, period.id))
      const entryRefs = plan.entries.map(entry => firestoreApi.doc(refs.entries, entry.id))
      const snapshots = await Promise.all([
        transaction.get(refs.root),
        ...periodRefs.map(ref => transaction.get(ref)),
        ...entryRefs.map(ref => transaction.get(ref)),
      ])
      if (snapshots.some(snapshot => snapshot.exists())) {
        fail('canonical-race', '共享課表已由其他操作建立，匯入已停止。')
      }

      const now = firestoreApi.serverTimestamp()
      transaction.set(refs.root, { ...plan.root, createdAt: now, updatedAt: now })
      plan.periods.forEach((period, index) => {
        const { id, ...data } = period
        transaction.set(periodRefs[index], { ...data, createdAt: now, updatedAt: now })
      })
      plan.entries.forEach((entry, index) => {
        const { id, ...data } = entry
        transaction.set(entryRefs[index], { ...data, createdAt: now, updatedAt: now })
      })
    })
    return plan
  }

  async function loadPortalScheduleProjection(classId = SHARED_CLASS_ID) {
    await requireTeacher(classId)
    const refs = refsFor(classId)
    const metadataSnapshot = await firestoreApi.getDoc(refs.root)
    if (!metadataSnapshot.exists()) return null
    const [periods, entries] = await Promise.all([
      firestoreApi.getDocs(firestoreApi.query(refs.periods, firestoreApi.orderBy('sortOrder', 'asc'))),
      firestoreApi.getDocs(refs.entries),
    ])
    return assembleSchedule(
      metadataSnapshot.data(),
      periods.docs.map(item => item.data()),
      entries.docs.map(item => item.data()),
    )
  }

  return {
    requireTeacher,
    inspectCanonicalSchedule,
    importLegacyScheduleOnce,
    loadPortalScheduleProjection,
  }
}

export const classScheduleMigrationRepository = {
  requireTeacher: (...args) => createClassScheduleMigrationRepository().requireTeacher(...args),
  inspectCanonicalSchedule: (...args) => createClassScheduleMigrationRepository().inspectCanonicalSchedule(...args),
  importLegacyScheduleOnce: (...args) => createClassScheduleMigrationRepository().importLegacyScheduleOnce(...args),
  loadPortalScheduleProjection: (...args) => createClassScheduleMigrationRepository().loadPortalScheduleProjection(...args),
}

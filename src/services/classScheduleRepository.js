import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { SHARED_CLASS_ID, isSharedScheduleClassId } from '../config/sharedClassSchedule'
import { getCentralPortalServices } from './centralPortalFirebase'

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri']
const VALID_KINDS = new Set(['morning', 'class', 'recess', 'cleaning', 'lunch', 'assembly', 'other'])
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const defaultFirestoreApi = { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, writeBatch }

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength)

function validateSchedule(schedule) {
  if (!schedule || !Array.isArray(schedule.periods) || schedule.periods.length > 31) {
    throw new Error('課表時段格式不正確。')
  }
  const ids = new Set()
  for (const period of schedule.periods) {
    const id = cleanText(period?.id, 128)
    if (!id || ids.has(id) || !TIME_PATTERN.test(period?.start || '') || !TIME_PATTERN.test(period?.end || '')) {
      throw new Error('課表時段格式不正確。')
    }
    ids.add(id)
  }
}

function assembleSchedule(metadata, periodDocs, entryDocs) {
  const periods = periodDocs
    .sort((left, right) => left.sortOrder - right.sortOrder || left.periodId.localeCompare(right.periodId))
    .map((period) => ({
      id: period.periodId,
      label: period.label,
      kind: period.kind,
      start: period.startTime,
      end: period.endTime,
    }))
  const periodIds = new Set(periods.map((period) => period.id))
  const weekdays = Object.fromEntries(DAY_KEYS.map((day) => [day, {}]))
  for (const entry of entryDocs) {
    if (!DAY_KEYS.includes(entry.day) || !periodIds.has(entry.periodId)) continue
    weekdays[entry.day][entry.periodId] = {
      subject: entry.subject || '',
      icon: entry.icon || '',
      message: entry.message || '',
    }
  }
  const halfDayCutoffs = Object.fromEntries(DAY_KEYS.map((day) => {
    const cutoff = metadata.dayCutoffs?.[day]
    return [day, periodIds.has(cutoff) ? cutoff : null]
  }))
  return { version: 2, periods, weekdays, halfDayCutoffs }
}

export function createClassScheduleRepository(services = getCentralPortalServices()) {
  const { db, auth, firestoreApi = defaultFirestoreApi } = services

  async function requireOwnClass(classId) {
    if (!isSharedScheduleClassId(classId)) throw new Error(`未設定共享班級：${classId}`)
    const uid = auth?.currentUser?.uid
    if (!uid) throw new Error('請先登入中央班級平台教師帳號。')
    const profile = await firestoreApi.getDoc(firestoreApi.doc(db, 'users', uid))
    const data = profile.exists() ? profile.data() : null
    if (data?.role !== 'teacher' || !Array.isArray(data.classIds) || !data.classIds.includes(classId)) {
      throw new Error('目前中央帳號沒有此班級的教師權限。')
    }
  }

  async function loadClassSchedule(classId = SHARED_CLASS_ID) {
    await requireOwnClass(classId)
    const root = firestoreApi.doc(db, 'classSchedules', classId)
    const metadataSnapshot = await firestoreApi.getDoc(root)
    if (!metadataSnapshot.exists()) return null
    const metadata = metadataSnapshot.data()
    if (metadata?.classId !== classId || metadata?.visibility !== 'public') return null

    const [periods, entries] = await Promise.all([
      firestoreApi.getDocs(firestoreApi.query(
        firestoreApi.collection(root, 'periods'),
        firestoreApi.orderBy('sortOrder', 'asc'),
      )),
      firestoreApi.getDocs(firestoreApi.collection(root, 'entries')),
    ])
    return assembleSchedule(
      metadata,
      periods.docs.map((item) => item.data()),
      entries.docs.map((item) => item.data()),
    )
  }

  async function saveClassSchedule(classId = SHARED_CLASS_ID, schedule) {
    await requireOwnClass(classId)
    validateSchedule(schedule)

    const root = firestoreApi.doc(db, 'classSchedules', classId)
    const periodsRef = firestoreApi.collection(root, 'periods')
    const entriesRef = firestoreApi.collection(root, 'entries')
    const [rootSnapshot, currentPeriods, currentEntries] = await Promise.all([
      firestoreApi.getDoc(root),
      firestoreApi.getDocs(periodsRef),
      firestoreApi.getDocs(entriesRef),
    ])
    const now = firestoreApi.serverTimestamp()
    const batch = firestoreApi.writeBatch(db)
    const rootCreatedAt = rootSnapshot.exists() ? (rootSnapshot.data()?.createdAt || now) : now
    const currentPeriodData = new Map(currentPeriods.docs.map((item) => [item.id, item.data()]))
    const currentEntryData = new Map(currentEntries.docs.map((item) => [item.id, item.data()]))
    const nextPeriodIds = new Set(schedule.periods.map((period) => cleanText(period.id, 128)))

    batch.set(root, {
      classId,
      visibility: 'public',
      schemaVersion: 1,
      dayCutoffs: Object.fromEntries(DAY_KEYS.map((day) => {
        const cutoff = schedule.halfDayCutoffs?.[day]
        return [day, nextPeriodIds.has(cutoff) ? cutoff : '']
      })),
      createdAt: rootCreatedAt,
      updatedAt: now,
    })

    schedule.periods.forEach((period, sortOrder) => {
      const periodId = cleanText(period.id, 128)
      const existing = currentPeriodData.get(periodId)
      batch.set(firestoreApi.doc(periodsRef, periodId), {
        classId,
        periodId,
        label: cleanText(period.label, 40) || '未命名時段',
        kind: VALID_KINDS.has(period.kind) ? period.kind : 'other',
        startTime: period.start,
        endTime: period.end,
        sortOrder,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      })
    })

    for (const current of currentPeriods.docs) {
      if (!nextPeriodIds.has(current.id)) batch.delete(current.ref)
    }

    const nextEntryIds = new Set()
    for (const day of DAY_KEYS) {
      for (const periodId of nextPeriodIds) {
        const entryId = `${day}_${periodId}`
        nextEntryIds.add(entryId)
        const entry = schedule.weekdays?.[day]?.[periodId] || {}
        const existing = currentEntryData.get(entryId)
        const payload = {
          classId,
          day,
          periodId,
          subject: cleanText(entry.subject, 80),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        }
        const icon = cleanText(entry.icon, 8)
        const message = cleanText(entry.message, 500)
        if (icon) payload.icon = icon
        if (message) payload.message = message
        batch.set(firestoreApi.doc(entriesRef, entryId), payload)
      }
    }

    for (const current of currentEntries.docs) {
      if (!nextEntryIds.has(current.id)) batch.delete(current.ref)
    }

    await batch.commit()
  }

  return { loadClassSchedule, saveClassSchedule }
}

export const classScheduleRepository = {
  loadClassSchedule: (...args) => createClassScheduleRepository().loadClassSchedule(...args),
  saveClassSchedule: (...args) => createClassScheduleRepository().saveClassSchedule(...args),
}

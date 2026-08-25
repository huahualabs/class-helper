import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { SHARED_CLASS_ID, isSharedClassId } from '../config/sharedClassEvents'
import { getCentralPortalServices } from './centralPortalFirebase'

const defaultFirestoreApi = {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
}

const editableFields = [
  'title', 'date', 'startTime', 'endTime', 'category', 'location',
  'description', 'published',
]

const optionalEditableFields = new Set([
  'startTime', 'endTime', 'category', 'location', 'description',
])

function cleanPayload(payload, allowedFields = editableFields) {
  return Object.fromEntries(
    allowedFields
      .filter(field => Object.prototype.hasOwnProperty.call(payload || {}, field))
      .map(field => [field, payload[field]])
      .filter(([, value]) => value !== undefined),
  )
}

function eventRows(snapshot) {
  return snapshot.docs.map(snapshotDoc => ({ eventId: snapshotDoc.id, ...snapshotDoc.data() }))
}

export function createClassEventsRepository(services = getCentralPortalServices()) {
  const { db, auth, firestoreApi = defaultFirestoreApi } = services
  const {
    addDoc: addEventDoc,
    collection: eventCollection,
    deleteDoc: removeEventDoc,
    deleteField: removeEventField,
    doc: eventDoc,
    getDoc: readEventDoc,
    getDocs: readEventDocs,
    orderBy: orderEventsBy,
    query: eventQuery,
    serverTimestamp: eventServerTimestamp,
    updateDoc: writeEventUpdate,
    where: eventWhere,
  } = firestoreApi

  async function requireOwnSharedClass(classId) {
    if (!isSharedClassId(classId)) throw new Error(`未設定共享班級：${classId}`)
    const uid = auth?.currentUser?.uid
    if (!uid) throw new Error('請先登入中央班級平台教師帳號。')
    const profile = await readEventDoc(eventDoc(db, 'users', uid))
    const data = profile.exists() ? profile.data() : null
    if (data?.role !== 'teacher' || !Array.isArray(data.classIds) || !data.classIds.includes(classId)) {
      throw new Error('目前中央帳號沒有此班級的教師權限。')
    }
  }

  async function listClassEvents(classId = SHARED_CLASS_ID, range = {}) {
    await requireOwnSharedClass(classId)
    const constraints = [eventWhere('classId', '==', classId)]
    if (range.startDate) constraints.push(eventWhere('date', '>=', range.startDate))
    if (range.endDate) constraints.push(eventWhere('date', '<=', range.endDate))
    constraints.push(orderEventsBy('date'))
    return eventRows(await readEventDocs(eventQuery(eventCollection(db, 'classEvents'), ...constraints)))
  }

  async function verifyTeacherAccess(classId = SHARED_CLASS_ID) {
    await requireOwnSharedClass(classId)
    return true
  }

  async function createClassEvent(classId = SHARED_CLASS_ID, payload = {}) {
    await requireOwnSharedClass(classId)
    const now = eventServerTimestamp()
    const reference = await addEventDoc(eventCollection(db, 'classEvents'), {
      ...cleanPayload(payload, editableFields.filter(field => field !== 'published')),
      classId,
      visibility: 'public',
      published: false,
      createdAt: now,
      updatedAt: now,
    })
    return reference.id
  }

  async function updateClassEvent(eventId, payload = {}) {
    const reference = eventDoc(db, 'classEvents', eventId)
    const snapshot = await readEventDoc(reference)
    if (!snapshot.exists()) throw new Error('找不到班級行事曆事件。')
    await requireOwnSharedClass(snapshot.data().classId)
    const changes = cleanPayload(payload)
    for (const field of optionalEditableFields) {
      if (changes[field] === '') changes[field] = removeEventField()
    }
    if (Object.keys(changes).length === 0) throw new Error('沒有可更新的事件欄位。')
    await writeEventUpdate(reference, { ...changes, updatedAt: eventServerTimestamp() })
  }

  async function deleteClassEvent(eventId) {
    const reference = eventDoc(db, 'classEvents', eventId)
    const snapshot = await readEventDoc(reference)
    if (!snapshot.exists()) throw new Error('找不到班級行事曆事件。')
    await requireOwnSharedClass(snapshot.data().classId)
    await removeEventDoc(reference)
  }

  return {
    verifyTeacherAccess,
    listClassEvents,
    createClassEvent,
    updateClassEvent,
    deleteClassEvent,
  }
}

export const classEventsRepository = {
  verifyTeacherAccess: (...args) => createClassEventsRepository().verifyTeacherAccess(...args),
  listClassEvents: (...args) => createClassEventsRepository().listClassEvents(...args),
  createClassEvent: (...args) => createClassEventsRepository().createClassEvent(...args),
  updateClassEvent: (...args) => createClassEventsRepository().updateClassEvent(...args),
  deleteClassEvent: (...args) => createClassEventsRepository().deleteClassEvent(...args),
}

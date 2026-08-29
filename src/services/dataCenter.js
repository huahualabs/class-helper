// ✅ HUA_CLASS_DATA_SYNC_MANIFEST_20260712：班級資料白名單、備份、結束班級與個人 Firebase 同步共用核心。
// ✅ HUA_FIREBASE_CONFIG_FULL_SNIPPET_PARSER_20260712：可直接貼上 Firebase 完整 SDK 程式碼，自動找出 firebaseConfig。
// ✅ HUA_APP_CHECK_PERSONAL_SITE_KEY_STORAGE_20260712：每位老師可在自己的裝置保存自己的 App Check Site Key，不集中代管、不納入班級備份。
// ✅ HUA_FIREBASE_ACCOUNT_BOUNDARY_GUARD_20260712：記住上一個雲端身分，避免同一裝置切換帳號時誤把班級資料上傳到別人的 Firebase。
// ✅ HUA_APP_CHECK_CONFIG_META_PRESERVE_FIX_20260713：只變更 App Check Site Key 時保留既有同步版本資訊，並通知同步服務安全重新連線。
export const STORAGE_MODE_KEY = 'classHelperStorageModeV3'
export const CLASS_PROFILE_KEY = 'classHelperClassProfileV1'
export const LEGACY_CLASS_ARCHIVES_KEY = 'classHelperClassArchivesV1'
export const FIREBASE_CONFIG_KEY = 'classHelperPersonalFirebaseConfigV1'
export const FIREBASE_WIZARD_KEY = 'classHelperFirebaseWizardV1'
export const FIREBASE_TEST_KEY = 'classHelperFirebaseTestV1'
export const LOCAL_RISK_ACK_KEY = 'classHelperLocalRiskAcknowledgedV1'
export const LAST_CLOUD_IDENTITY_KEY = 'classHelperLastCloudIdentityV1'
export const PERSONAL_FIREBASE_CONFIG_CHANGED_EVENT = 'class-helper-personal-firebase-config-changed'

const MAX_BACKUP_FILE_BYTES = 8 * 1024 * 1024

// 這些是「目前班級是誰、發生過什麼」的資料；結束班級時會清除或重設。
const EXACT_CLASS_DATA_KEYS = new Set([
  'students',
  'className',
  CLASS_PROFILE_KEY,
  'classHelperCalendarEvents',
  'classHelperContactBook',
  'classHelperWeeklyScheduleV1',
  'classHelperStatusSchedule',
  'notebookBoardsV2',
  'notebookWeeklyRecordsV2',
  'notebookNotifiedV2',
  'toothbrushRecords',
  'classAssistantPointRecordsV1',
  'classHelperSeatGroupsForPoints',
  'classHelperSeatPlan',
  'classAssistantSeatGroupsV1',
  'classAssistantSeatAssignmentsV1',
  'classAssistantSeatPlanV1',
  'classAssistantSeatsV1',
  'classAssistantSeatMapV1',
  'seatGroups',
  'seatAssignments',
  'seats',
  'classHelperCleaningAssignments',
  'classHelperJobAssignments',
  'classHelperLibraryLoans',
  'classHelperLibraryHistory'
])

// 座位功能曾有數個版本，名稱可能不同；只針對座位資料做窄範圍相容。
const CLASS_DATA_KEY_PATTERNS = [
  /^classHelperSeat/i,
  /^classAssistantSeat/i,
  /^seat(?:Groups|Assignments|Plan|Map|s)$/i
]

const END_ONLY_KEYS = new Set([LEGACY_CLASS_ARCHIVES_KEY])

const TEMPLATE_PRESERVING_KEYS = new Set([
  'classHelperCleaningAssignments',
  'classHelperJobAssignments',
  'classHelperWeeklyScheduleV1'
])

export function todayText() {
  return new Date().toISOString().slice(0, 10)
}

export function defaultClassProfile(name = localStorage.getItem('className') || '') {
  const now = new Date()
  const year = now.getFullYear()
  return {
    id: `class-${Date.now()}`,
    name,
    startDate: `${year}-08-01`,
    endDate: `${year + 1}-07-31`,
    cycleType: 'one-year',
    reminderDays: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function safeJson(raw, fallback) {
  try {
    const value = JSON.parse(raw || '')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function getStorageMode() {
  return localStorage.getItem(STORAGE_MODE_KEY) === 'firebase' ? 'firebase' : 'local'
}

export function setStorageMode(mode) {
  const normalized = mode === 'firebase' ? 'firebase' : 'local'
  localStorage.setItem(STORAGE_MODE_KEY, normalized)
  return normalized
}

export function getLastCloudIdentity() {
  const saved = safeJson(localStorage.getItem(LAST_CLOUD_IDENTITY_KEY), null)
  if (!saved || typeof saved !== 'object') return null
  const uid = String(saved.uid || '').trim()
  const projectId = String(saved.projectId || '').trim()
  if (!uid || !projectId) return null
  return { uid, projectId, updatedAt: String(saved.updatedAt || '') }
}

export function saveLastCloudIdentity(identity) {
  const uid = String(identity?.uid || '').trim()
  const projectId = String(identity?.projectId || '').trim()
  if (!uid || !projectId) return null
  const clean = { uid, projectId, updatedAt: new Date().toISOString() }
  localStorage.setItem(LAST_CLOUD_IDENTITY_KEY, JSON.stringify(clean))
  return clean
}

export function getClassProfile() {
  const saved = safeJson(localStorage.getItem(CLASS_PROFILE_KEY), null)
  if (saved && typeof saved === 'object') return { ...defaultClassProfile(), ...saved }
  const profile = defaultClassProfile()
  saveClassProfile(profile)
  return profile
}

export function saveClassProfile(profile) {
  const normalized = {
    ...defaultClassProfile(),
    ...profile,
    reminderDays: Math.max(1, Number(profile?.reminderDays) || 30),
    updatedAt: new Date().toISOString()
  }
  setJson(CLASS_PROFILE_KEY, normalized)
  if (normalized.name) localStorage.setItem('className', normalized.name)
  else localStorage.removeItem('className')
  return normalized
}

export function classLifecycleStatus(profile = getClassProfile()) {
  const end = new Date(`${profile.endDate}T23:59:59`)
  const now = new Date()
  if (Number.isNaN(end.getTime())) return { state: 'unknown', days: null, message: '尚未設定有效的結束日期' }
  const days = Math.ceil((end.getTime() - now.getTime()) / 86400000)
  if (days < 0) return { state: 'ended', days, message: `班級週期已結束 ${Math.abs(days)} 天，可延長日期或結束班級。` }
  if (days <= Number(profile.reminderDays || 30)) return { state: 'ending', days, message: `距離班級結束還有 ${days} 天，請決定延長或結束。` }
  return { state: 'active', days, message: `班級使用中，距離預計結束還有 ${days} 天。` }
}

export function isClassDataKey(key) {
  if (!key) return false
  if (EXACT_CLASS_DATA_KEYS.has(key)) return true
  return CLASS_DATA_KEY_PATTERNS.some(pattern => pattern.test(key))
}

function isEndClassDataKey(key) {
  return isClassDataKey(key) || END_ONLY_KEYS.has(key)
}

export function getClassDataKeys() {
  const keys = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (isClassDataKey(key)) keys.push(key)
  }
  return keys.sort((a, b) => a.localeCompare(b))
}

export function readClassData() {
  const data = {}
  for (const key of getClassDataKeys()) {
    const value = localStorage.getItem(key)
    if (value !== null) data[key] = value
  }
  return data
}

export function sanitizeClassData(rawData) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return {}
  return Object.fromEntries(
    Object.entries(rawData)
      .filter(([key, value]) => isClassDataKey(key) && typeof value === 'string')
  )
}

function hasAssignedTemplateData(key, rawValue) {
  if (!TEMPLATE_PRESERVING_KEYS.has(key)) return true
  const value = safeJson(rawValue, null)

  if (key === 'classHelperCleaningAssignments' || key === 'classHelperJobAssignments') {
    return Array.isArray(value) && value.some(item => Array.isArray(item?.students) && item.students.length > 0)
  }

  if (key === 'classHelperWeeklyScheduleV1') {
    if (!value || typeof value !== 'object') return false
    return Object.values(value.weekdays || {}).some(day => (
      Object.values(day || {}).some(entry => {
        if (!entry || typeof entry !== 'object') return false
        return Boolean(String(entry.subject || '').trim() || String(entry.message || '').trim())
      })
    ))
  }

  return false
}

function isMeaningfulStoredValue(key, rawValue) {
  if (key === CLASS_PROFILE_KEY) return false
  if (TEMPLATE_PRESERVING_KEYS.has(key)) return hasAssignedTemplateData(key, rawValue)
  if (rawValue === null || rawValue === undefined) return false
  const text = String(rawValue).trim()
  if (!text || text === '[]' || text === '{}' || text === 'null') return false
  return true
}

export function getClassDataSummaryFromObject(rawData) {
  const data = sanitizeClassData(rawData)
  const students = String(data.students || '')
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean)
  const profile = safeJson(data[CLASS_PROFILE_KEY], {})
  const meaningfulDataKeys = Object.entries(data)
    .filter(([key, value]) => isMeaningfulStoredValue(key, value))
    .map(([key]) => key)

  return {
    className: String(data.className || profile?.name || ''),
    studentCount: students.length,
    dataKeyCount: meaningfulDataKeys.length,
    hasCalendar: Boolean(data.classHelperCalendarEvents),
    hasSchedule: Boolean(data.classHelperWeeklyScheduleV1),
    hasPointRecords: Boolean(data.classAssistantPointRecordsV1)
  }
}

export function hasMeaningfulClassData(rawData = readClassData()) {
  const summary = getClassDataSummaryFromObject(rawData)
  return Boolean(summary.className.trim() || summary.studentCount || summary.dataKeyCount)
}

export function replaceClassData(rawData) {
  const cleanData = sanitizeClassData(rawData)
  removeClassDataRaw()
  for (const [key, value] of Object.entries(cleanData)) localStorage.setItem(key, value)

  if (!localStorage.getItem(CLASS_PROFILE_KEY)) {
    const className = String(localStorage.getItem('className') || '').trim()
    setJson(CLASS_PROFILE_KEY, defaultClassProfile(className))
  }

  window.dispatchEvent(new CustomEvent('class-helper-data-imported'))
  return cleanData
}

// 保留舊函式名稱，避免既有程式碼失效；現在只讀取班級資料，不再把 Firebase Config 或裝置偏好打包。
export function readAllLocalData() {
  return readClassData()
}

export function getClassDataSummary() {
  return getClassDataSummaryFromObject(readClassData())
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function exportFullBackup() {
  const profile = getClassProfile()
  const safeName = (profile.name || '未命名班級').replace(/[\\/:*?"<>|]/g, '-')
  const classData = readClassData()
  const payload = {
    format: 'class-helper-class-backup',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    classProfile: profile,
    classData,
    // 同時保留欄位名稱，讓舊版匯入流程仍能辨識；內容仍只包含班級資料。
    localStorage: classData,
    excludes: ['Firebase Config', 'Google 登入狀態', '儲存模式', '設定精靈進度', '裝置與介面偏好']
  }
  downloadJson(payload, `${safeName}_班級備份_${todayText()}.json`)
  return payload
}

function removeClassDataRaw() {
  const keys = []
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!isEndClassDataKey(key)) continue
    keys.push(key)
    localStorage.removeItem(key)
  }
  return keys
}

function sanitizeImportedClassData(rawData) {
  return sanitizeClassData(rawData)
}

export async function importFullBackup(file, { replace = false } = {}) {
  if (typeof File !== 'undefined' && !(file instanceof File)) throw new Error('請選擇有效的備份檔')
  if (!file || typeof file.text !== 'function') throw new Error('請選擇有效的備份檔')
  if (Number(file.size || 0) > MAX_BACKUP_FILE_BYTES) throw new Error('備份檔超過 8 MB，為避免瀏覽器卡住，請確認檔案是否正確')

  const parsed = safeJson(await file.text(), null)
  const acceptedFormat = parsed?.format === 'class-helper-class-backup' || parsed?.format === 'class-helper-backup'
  const sourceData = parsed?.classData || parsed?.localStorage
  if (!parsed || !acceptedFormat || !sourceData) throw new Error('這不是班級助手的班級備份檔')

  const cleanData = sanitizeImportedClassData(sourceData)
  if (!Object.keys(cleanData).length) throw new Error('備份檔中找不到可還原的班級資料')

  if (replace) removeClassDataRaw()
  for (const [key, value] of Object.entries(cleanData)) localStorage.setItem(key, value)

  // 舊備份可能只把 profile 放在外層，仍安全地補回班級資料。
  if (!localStorage.getItem(CLASS_PROFILE_KEY) && parsed.classProfile && typeof parsed.classProfile === 'object') {
    saveClassProfile(parsed.classProfile)
  }

  window.dispatchEvent(new CustomEvent('class-helper-data-imported'))
  return { ...parsed, importedKeys: Object.keys(cleanData) }
}

function preserveCleaningTemplate(raw) {
  const value = safeJson(raw, null)
  if (!Array.isArray(value)) return null
  return value.map(area => ({ ...area, students: [] }))
}

function preserveJobTemplate(raw) {
  const value = safeJson(raw, null)
  if (!Array.isArray(value)) return null
  return value.map(job => ({ ...job, students: [] }))
}

function preserveScheduleTemplate(raw) {
  const value = safeJson(raw, null)
  if (!value || typeof value !== 'object' || !Array.isArray(value.periods) || !value.weekdays) return null

  const periodMap = new Map(value.periods.map(period => [period.id, period]))
  const weekdays = {}

  for (const [dayKey, dayValue] of Object.entries(value.weekdays || {})) {
    weekdays[dayKey] = {}
    for (const [periodId, entry] of Object.entries(dayValue || {})) {
      const period = periodMap.get(periodId)
      if (period?.kind === 'class') {
        weekdays[dayKey][periodId] = { subject: '', icon: '📖', message: '' }
      } else {
        // 早修、打掃、午休等教師慣用流程保留，正式課程內容清空。
        weekdays[dayKey][periodId] = entry && typeof entry === 'object' ? { ...entry } : {}
      }
    }
  }

  return { ...value, weekdays }
}

export function endCurrentClass() {
  const previousProfile = getClassProfile()
  const templates = {
    cleaning: preserveCleaningTemplate(localStorage.getItem('classHelperCleaningAssignments')),
    jobs: preserveJobTemplate(localStorage.getItem('classHelperJobAssignments')),
    schedule: preserveScheduleTemplate(localStorage.getItem('classHelperWeeklyScheduleV1'))
  }

  const removedKeys = removeClassDataRaw()

  if (templates.cleaning) setJson('classHelperCleaningAssignments', templates.cleaning)
  if (templates.jobs) setJson('classHelperJobAssignments', templates.jobs)
  if (templates.schedule) setJson('classHelperWeeklyScheduleV1', templates.schedule)

  const nextProfile = defaultClassProfile('')
  setJson(CLASS_PROFILE_KEY, nextProfile)
  localStorage.removeItem('className')
  localStorage.removeItem('students')

  window.dispatchEvent(new CustomEvent('class-helper-data-imported'))
  window.dispatchEvent(new CustomEvent('class-helper-class-ended', {
    detail: { previousProfile, nextProfile, removedKeys }
  }))

  return {
    previousProfile,
    profile: nextProfile,
    removedKeys,
    preservedTemplateKeys: Object.entries(templates)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key)
  }
}

export function getEndClassPreservedSettings() {
  return [
    'Firebase 連線設定與 Google 登入測試結果',
    '本機／個人 Firebase 儲存模式',
    '側欄排序與首頁顯示方式',
    '積分獎勵品項、音效與小組人數偏好',
    '作息時段，以及打掃區域與職務名稱模板'
  ]
}

export function getEndClassClearedData() {
  return [
    '學生名單與班級名稱',
    '簿本繳交、潔牙消毒與借閱紀錄',
    '積分紀錄、座位與分組',
    '行事曆事項與聯絡簿內容',
    '正式課表科目、打掃與職務的學生分配'
  ]
}

function extractBalancedObject(text, openingBraceIndex) {
  if (openingBraceIndex < 0 || text[openingBraceIndex] !== '{') return ''
  let depth = 0
  let quote = ''
  let escaped = false

  for (let index = openingBraceIndex; index < text.length; index += 1) {
    const character = text[index]

    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }

    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return text.slice(openingBraceIndex, index + 1)
    }
  }

  return ''
}

function extractFirebaseStringFields(text) {
  const allowed = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'appCheckSiteKey']
  const result = {}

  for (const key of allowed) {
    const pattern = new RegExp(`(?:^|[,{\\s])${key}\\s*:\\s*([\"'\`])([\\s\\S]*?)\\1`)
    const match = text.match(pattern)
    if (match) result[key] = match[2].trim()
  }

  return result
}

export function parseFirebaseConfig(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) return input
  let text = String(input || '').trim()
  if (!text) throw new Error('請貼上 Firebase Config')
  text = text.replace(/^```(?:js|javascript|json)?/i, '').replace(/```$/i, '').trim()

  // 優先精準尋找「firebaseConfig = { ... }」，避免誤抓 import { initializeApp } 的大括號。
  const assignmentMatch = /\bfirebaseConfig\s*=\s*\{/i.exec(text)
  let objectText = assignmentMatch
    ? extractBalancedObject(text, text.indexOf('{', assignmentMatch.index))
    : ''

  // 也接受純 JSON 或只貼大括號內容。
  if (!objectText) {
    const firstBrace = text.indexOf('{')
    objectText = extractBalancedObject(text, firstBrace)
  }

  const candidate = objectText || text

  try {
    return JSON.parse(candidate)
  } catch {
    // Firebase 的 Config 欄位值皆為字串；直接擷取可同時支援單引號、雙引號、完整 SDK 程式碼與尾逗號。
    const fields = extractFirebaseStringFields(candidate)
    if (Object.keys(fields).length) return fields

    const converted = candidate
      .replace(/([,{]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
    try {
      return JSON.parse(converted)
    } catch {
      throw new Error('無法辨識 Firebase Config。可直接貼上 Firebase 提供的整段 SDK 程式碼，系統會自動擷取 firebaseConfig。')
    }
  }
}

export function getPersonalFirebaseConfig() {
  return safeJson(localStorage.getItem(FIREBASE_CONFIG_KEY), null)
}

export function normalizeAppCheckSiteKey(value) {
  const siteKey = String(value ?? '').trim()
  if (!siteKey) return ''

  if (siteKey.length > 2048) {
    throw new Error('App Check Site Key 長度不合理')
  }

  const containsMarkupOrCode = /<[^>]+>|javascript\s*:|(?:^|[;\n\r])\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=|(?:initializeAppCheck|ReCaptcha(?:Enterprise)?Provider)\s*\(/i
  if (containsMarkupOrCode.test(siteKey)) {
    throw new Error('請只貼 App Check Site Key，不要貼 script、HTML 或 JavaScript 程式碼')
  }

  if (/\s|[\u0000-\u001f\u007f]/.test(siteKey)) {
    throw new Error('App Check Site Key 不可包含內部空白、換行或控制字元')
  }

  return siteKey
}

export function savePersonalFirebaseConfig(configOrText, options = {}) {
  const parsed = parseFirebaseConfig(configOrText)
  const config = {
    ...parsed,
    appCheckSiteKey: normalizeAppCheckSiteKey(options?.appCheckSiteKey || parsed?.appCheckSiteKey || '')
  }
  const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId']
  const missing = required.filter(key => !String(config?.[key] || '').trim())
  if (missing.length) throw new Error(`Firebase 設定缺少：${missing.join('、')}`)

  const allowed = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'appCheckSiteKey']
  const clean = Object.fromEntries(
    allowed
      .filter(key => config[key] !== undefined && config[key] !== null && String(config[key]).trim())
      .map(key => [key, String(config[key]).trim()])
  )
  clean.databaseURL = clean.databaseURL.replace(/\/$/, '')

  if (!/^[a-z0-9-]+$/i.test(clean.projectId)) throw new Error('projectId 格式不正確')
  if (!/^[a-z0-9.-]+$/i.test(clean.authDomain)) throw new Error('authDomain 格式不正確')
  if (/\s/.test(clean.apiKey) || /\s/.test(clean.appId)) throw new Error('Firebase Config 內含不應出現的空白')
  let databaseUrl
  try {
    databaseUrl = new URL(clean.databaseURL)
  } catch {
    throw new Error('databaseURL 格式不正確')
  }
  const validDatabaseHost = /\.(firebaseio\.com|firebasedatabase\.app)$/i.test(databaseUrl.hostname)
  if (databaseUrl.protocol !== 'https:' || !validDatabaseHost) {
    throw new Error('databaseURL 必須是 Firebase Realtime Database 的 https 網址')
  }

  const previous = getPersonalFirebaseConfig()
  const changedProject = previous && (
    previous.projectId !== clean.projectId ||
    previous.appId !== clean.appId ||
    previous.databaseURL !== clean.databaseURL
  )
  const changedAppCheck = Boolean(
    previous && String(previous.appCheckSiteKey || '') !== String(clean.appCheckSiteKey || '')
  )

  // 只有 Firebase 專案／App／Database 身分真的改變時，才清除雲端版本資訊。
  // App Check Site Key 只影響請求驗證方式，不代表換了一份雲端資料；若在此清除
  // classHelperCloudSyncMetaV1，既有連線下一次寫入會誤判成未知版本衝突而停止同步。
  if (changedProject) {
    localStorage.removeItem(FIREBASE_TEST_KEY)
    localStorage.removeItem('classHelperCloudSyncMetaV1')
    localStorage.removeItem('classHelperCloudForceUploadPendingV1')
    // LAST_CLOUD_IDENTITY_KEY 刻意保留：下次登入時用來阻止跨帳號資料誤上傳。
  } else if (changedAppCheck) {
    localStorage.removeItem(FIREBASE_TEST_KEY)
  }

  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(clean))

  if (previous && (changedProject || changedAppCheck) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PERSONAL_FIREBASE_CONFIG_CHANGED_EVENT, {
      detail: { changedProject: Boolean(changedProject), changedAppCheck }
    }))
  }

  return clean
}

export function removePersonalFirebaseConfig() {
  localStorage.removeItem(FIREBASE_CONFIG_KEY)
  localStorage.removeItem(FIREBASE_TEST_KEY)
  localStorage.removeItem('classHelperCloudSyncMetaV1')
  localStorage.removeItem('classHelperCloudForceUploadPendingV1')
  setStorageMode('local')
}

export function defaultWizardProgress() {
  return { currentStep: 1, completedSteps: [], acknowledged: false, updatedAt: '' }
}

export function getFirebaseWizardProgress() {
  const saved = safeJson(localStorage.getItem(FIREBASE_WIZARD_KEY), null)
  return { ...defaultWizardProgress(), ...(saved || {}) }
}

export function saveFirebaseWizardProgress(progress) {
  const clean = {
    ...defaultWizardProgress(),
    ...progress,
    currentStep: Math.min(7, Math.max(1, Number(progress?.currentStep) || 1)),
    completedSteps: Array.from(new Set((progress?.completedSteps || []).map(Number).filter(step => step >= 1 && step <= 7))),
    updatedAt: new Date().toISOString()
  }
  localStorage.setItem(FIREBASE_WIZARD_KEY, JSON.stringify(clean))
  return clean
}

export function getFirebaseTestResult() {
  return safeJson(localStorage.getItem(FIREBASE_TEST_KEY), null)
}

export function saveFirebaseTestResult(result) {
  const clean = { ...result, testedAt: new Date().toISOString() }
  localStorage.setItem(FIREBASE_TEST_KEY, JSON.stringify(clean))
  return clean
}

// 此常數只供測試與文件顯示，避免未來把教師偏好誤當班級資料。
export const TEMPLATE_KEYS_PRESERVED_ON_END = Array.from(TEMPLATE_PRESERVING_KEYS)

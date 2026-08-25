<script setup>
// ✅ HUA_SUBJECT_TOOL_UNIFORM_SIZE_20260711：科目分類框與科目按鍵統一尺寸，長科目名稱也能穩定置中顯示。
// ✅ HUA_SCHEDULE_IOS_TIME_FIT_20260712：修正 iPhone Safari 作息起訖與快速設定時間欄超出卡片。
import { computed, onMounted, ref, watch } from 'vue'
import ScheduleImportPanel from '@owner-schedule-import'
import {
  REQUIRE_EXISTING_CENTRAL_SCHEDULE,
  SCHEDULE_IMPORT_ENABLED,
  SCHEDULE_SOURCE_MODE,
  SCHEDULE_SOURCE_MODES,
  SHARED_CLASS_ID,
} from '../config/sharedClassSchedule'
import { classScheduleRepository } from '@owner-class-schedule-repository'
import { createLatestScheduleSaveQueue } from '../services/latestScheduleSaveQueue'
import { signInCentralPortalTeacher, waitForCentralPortalSession } from '@owner-central-firebase'

const STORAGE_KEY = 'classHelperWeeklyScheduleV1'

const days = [
  { key: 'mon', label: '週一', short: '一', dayIndex: 1 },
  { key: 'tue', label: '週二', short: '二', dayIndex: 2 },
  { key: 'wed', label: '週三', short: '三', dayIndex: 3 },
  { key: 'thu', label: '週四', short: '四', dayIndex: 4 },
  { key: 'fri', label: '週五', short: '五', dayIndex: 5 }
]

const defaultPeriods = [
  { id: 'morning', label: '早修', kind: 'morning', start: '07:50', end: '08:35' },
  { id: 'cleaning-am', label: '上午打掃', kind: 'cleaning', start: '08:35', end: '08:40' },
  { id: 'p1', label: '第一節', kind: 'class', start: '08:40', end: '09:20' },
  { id: 'p2', label: '第二節', kind: 'class', start: '09:30', end: '10:10' },
  { id: 'p3', label: '第三節', kind: 'class', start: '10:30', end: '11:10' },
  { id: 'p4', label: '第四節', kind: 'class', start: '11:20', end: '12:00' },
  { id: 'lunch', label: '午餐／午休', kind: 'lunch', start: '12:00', end: '13:20' },
  { id: 'p5', label: '第五節', kind: 'class', start: '13:30', end: '14:10' },
  { id: 'p6', label: '第六節', kind: 'class', start: '14:20', end: '15:00' },
  { id: 'cleaning-pm', label: '下午打掃', kind: 'cleaning', start: '15:00', end: '15:20' },
  { id: 'p7', label: '第七節', kind: 'class', start: '15:20', end: '16:00' }
]

const kindOptions = [
  { value: 'morning', label: '早修／晨光' },
  { value: 'class', label: '正式課程' },
  { value: 'recess', label: '下課／休息' },
  { value: 'cleaning', label: '打掃' },
  { value: 'lunch', label: '午餐／午休' },
  { value: 'assembly', label: '集會／朝會' },
  { value: 'other', label: '其他活動' }
]

const kindDefaults = {
  morning: { subject: '早修', icon: '🌞', message: '請安靜進教室，完成早修任務與作業繳交。' },
  class: { subject: '', icon: '📖', message: '' },
  recess: { subject: '下課時間', icon: '🔔', message: '請完成喝水、上廁所與下節課準備。' },
  cleaning: { subject: '打掃', icon: '🧹', message: '請到自己的打掃區，完成整理後請幹部檢查。' },
  lunch: { subject: '午餐／午休', icon: '🌙', message: '用餐後整理座位，午休時間保持安靜。' },
  assembly: { subject: '集合時間', icon: '📣', message: '請依老師指示安靜集合。' },
  other: { subject: '', icon: '🌿', message: '' }
}


const subjectGroups = [
  {
    label: '語文',
    subjects: [
      { name: '國語', icon: '📖' },
      { name: '本土語', icon: '🗣️' },
      { name: '英語', icon: '🔤' }
    ]
  },
  {
    label: '數理與社會',
    subjects: [
      { name: '數學', icon: '🔢' },
      { name: '自然', icon: '🔬' },
      { name: '社會', icon: '🌏' }
    ]
  },
  {
    label: '生活與活動',
    subjects: [
      { name: '生活', icon: '🌱' },
      { name: '綜合', icon: '🧩' },
      { name: '健康', icon: '💚' },
      { name: '體育', icon: '🏃' }
    ]
  },
  {
    label: '藝術與科技',
    subjects: [
      { name: '音樂', icon: '🎵' },
      { name: '美勞', icon: '🎨' },
      { name: '資訊', icon: '💻' }
    ]
  },
  {
    label: '校訂課程',
    subjects: [
      { name: '彈性', icon: '🌿' },
      { name: '校本課程', icon: '🏫' }
    ]
  }
]

const subjectIconMap = Object.fromEntries(
  subjectGroups.flatMap(group => group.subjects.map(subject => [subject.name, subject.icon]))
)

const clearSubjectTool = { name: '清除格子', icon: '✕', clear: true }

function defaultEntry(kind) {
  return { ...(kindDefaults[kind] || kindDefaults.other) }
}

function makeDefaultData() {
  const weekdays = {}
  days.forEach(day => {
    weekdays[day.key] = {}
    defaultPeriods.forEach(period => {
      weekdays[day.key][period.id] = defaultEntry(period.kind)
    })
  })

  return {
    version: 2,
    periods: defaultPeriods.map(period => ({ ...period })),
    weekdays,
    halfDayCutoffs: Object.fromEntries(days.map(day => [day.key, null]))
  }
}

function normalizeData(raw) {
  const fallback = makeDefaultData()
  if (!raw || !Array.isArray(raw.periods) || !raw.periods.length || !raw.weekdays) return fallback

  const usedIds = new Set()
  const periods = raw.periods.map((period, index) => {
    let id = String(period?.id || `period-${index + 1}`)
    while (usedIds.has(id)) id = `${id}-${index + 1}`
    usedIds.add(id)
    const kind = kindOptions.some(option => option.value === period?.kind) ? period.kind : 'other'
    return {
      id,
      label: String(period?.label || `時段 ${index + 1}`),
      kind,
      start: String(period?.start || '08:00'),
      end: String(period?.end || '08:40')
    }
  })

  const weekdays = {}
  days.forEach(day => {
    weekdays[day.key] = {}
    periods.forEach(period => {
      const saved = raw.weekdays?.[day.key]?.[period.id]
      weekdays[day.key][period.id] = saved && typeof saved === 'object'
        ? { ...defaultEntry(period.kind), ...saved }
        : defaultEntry(period.kind)
    })
  })

  const halfDayCutoffs = {}
  const validIds = new Set(periods.map(period => period.id))
  days.forEach(day => {
    const cutoff = raw.halfDayCutoffs?.[day.key]
    halfDayCutoffs[day.key] = validIds.has(cutoff) ? cutoff : null
  })

  return { version: 2, periods, weekdays, halfDayCutoffs }
}

function migrateLegacySchedule() {
  let legacy
  try {
    legacy = JSON.parse(localStorage.getItem('classHelperStatusSchedule') || 'null')
  } catch {
    return null
  }
  if (!Array.isArray(legacy) || !legacy.length) return null

  const migrated = makeDefaultData()
  const matchers = [
    ['morning', item => item.type === 'morning'],
    ['p1', item => String(item.title || '').includes('第一節')],
    ['p2', item => String(item.title || '').includes('第二節')],
    ['p3', item => String(item.title || '').includes('第三節')],
    ['p4', item => String(item.title || '').includes('第四節')],
    ['p5', item => String(item.title || '').includes('第五節')],
    ['p6', item => String(item.title || '').includes('第六節')],
    ['p7', item => String(item.title || '').includes('第七節')],
    ['lunch', item => String(item.title || '').includes('午休') || String(item.title || '').includes('午餐')],
    ['cleaning-pm', item => item.type === 'cleaning']
  ]

  matchers.forEach(([periodId, matcher]) => {
    const oldPeriod = legacy.find(matcher)
    const period = migrated.periods.find(item => item.id === periodId)
    if (!oldPeriod || !period) return
    if (oldPeriod.start) period.start = oldPeriod.start
    if (oldPeriod.end) period.end = oldPeriod.end

    days.forEach(day => {
      const entry = migrated.weekdays[day.key][periodId]
      if (oldPeriod.message) entry.message = oldPeriod.message
    })
  })

  return migrated
}

function loadSchedule() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return normalizeData(JSON.parse(saved))

    const migrated = migrateLegacySchedule()
    if (migrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      return migrated
    }

    return makeDefaultData()
  } catch (error) {
    console.warn('課表資料讀取失敗，已恢復預設值。', error)
    return makeDefaultData()
  }
}

function currentTimeValue() {
  return new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function currentDayKey() {
  return days.find(day => day.dayIndex === new Date().getDay())?.key || 'mon'
}

const isCentralMode = SCHEDULE_SOURCE_MODE === SCHEDULE_SOURCE_MODES.CENTRAL
const data = ref(isCentralMode ? makeDefaultData() : loadSchedule())
const activeTab = ref('week')
const mobileDay = ref(currentDayKey())
const selected = ref({ dayKey: currentDayKey(), periodId: data.value.periods[0]?.id || '' })
const savedText = ref(isCentralMode ? '正在載入共享課表…' : '已自動儲存')
const centralReady = ref(!isCentralMode)
const centralState = ref(isCentralMode ? 'loading' : 'ready')
const centralMessage = ref('')
const hydratingCentralSchedule = ref(false)
const showQuickSetup = ref(false)
const showHalfDaySettings = ref(false)
const isEditingTimetable = ref(false)
const selectedSubjectTool = ref(null)
const draggedSubjectTool = ref(null)
const subjectUndoStack = ref([])
const previewDay = ref(currentDayKey())
const previewTime = ref(currentTimeValue())
const quick = ref({
  firstStart: '08:40',
  duration: 40,
  breakMinutes: 10,
  morningCount: 4,
  longBreakAfter: 2,
  longBreakMinutes: 20,
  afternoonStart: '13:30',
  afternoonCount: 3,
  afternoonBreakMinutes: 10,
  applyMode: 'preserve'
})
let saveTimer = null
const centralSaveQueue = createLatestScheduleSaveQueue(schedule => (
  classScheduleRepository.saveClassSchedule(SHARED_CLASS_ID, schedule)
))

watch(data, value => {
  window.clearTimeout(saveTimer)
  if (isCentralMode && (!centralReady.value || hydratingCentralSchedule.value)) return
  savedText.value = '儲存中…'
  saveTimer = window.setTimeout(async () => {
    if (isCentralMode) {
      try {
        await centralSaveQueue.enqueue(value)
        window.dispatchEvent(new CustomEvent('class-helper-central-schedule-updated'))
        centralState.value = 'ready'
        centralMessage.value = '共享課表已儲存。'
        savedText.value = `已儲存至中央 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`
      } catch (error) {
        centralState.value = 'save-failed'
        centralMessage.value = '課表儲存失敗，請稍後再試。'
        savedText.value = '儲存失敗'
        if (import.meta.env.DEV) console.error('[class-helper schedule] save failed', error)
      }
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('class-helper-schedule-updated'))
    savedText.value = `已自動儲存 ${new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }, 250)
}, { deep: true })

async function loadCentralSchedule() {
  if (!isCentralMode) return
  centralReady.value = false
  centralState.value = 'loading'
  centralMessage.value = '正在載入中央共享課表…'
  savedText.value = '正在載入共享課表…'
  try {
    const user = await waitForCentralPortalSession()
    if (!user) {
      centralState.value = 'auth-required'
      centralMessage.value = '請先登入中央班級平台教師帳號。'
      savedText.value = '需要登入'
      return
    }
    const loaded = await classScheduleRepository.loadClassSchedule(SHARED_CLASS_ID)
    if (!loaded && REQUIRE_EXISTING_CENTRAL_SCHEDULE) {
      centralState.value = 'empty'
      centralMessage.value = '共享課表尚未完成匯入；中央模式不會建立或覆蓋預設課表。'
      savedText.value = '等待共享課表匯入'
      return
    }
    hydratingCentralSchedule.value = true
    data.value = normalizeData(loaded || makeDefaultData())
    selected.value = { dayKey: currentDayKey(), periodId: data.value.periods[0]?.id || '' }
    centralReady.value = true
    centralState.value = 'ready'
    centralMessage.value = loaded ? '已載入中央共享課表。' : '尚未建立共享課表，首次編輯後會建立。'
    savedText.value = loaded ? '已載入中央共享課表' : '尚未建立共享課表'
  } catch (error) {
    const permissionDenied = error?.code === 'permission-denied' || String(error?.message || '').includes('權限')
    centralState.value = permissionDenied ? 'permission' : 'load-failed'
    centralMessage.value = permissionDenied
      ? `目前帳號沒有 ${SHARED_CLASS_ID} 的教師權限。`
      : '暫時無法載入共享課表，請稍後再試。'
    savedText.value = '載入失敗'
    if (import.meta.env.DEV) console.error('[class-helper schedule] load failed', error)
  } finally {
    hydratingCentralSchedule.value = false
  }
}

async function loginCentralSchedule() {
  centralState.value = 'loading'
  centralMessage.value = '正在登入中央班級平台…'
  try {
    await signInCentralPortalTeacher()
    await loadCentralSchedule()
  } catch (error) {
    centralState.value = 'auth-required'
    centralMessage.value = '登入失敗，請稍後再試。'
    if (import.meta.env.DEV) console.error('[class-helper schedule] sign in failed', error)
  }
}

onMounted(loadCentralSchedule)

const selectedDay = computed(() => days.find(day => day.key === selected.value.dayKey) || days[0])
const selectedPeriod = computed(() => data.value.periods.find(period => period.id === selected.value.periodId) || data.value.periods[0])
const selectedEntry = computed(() => data.value.weekdays[selected.value.dayKey]?.[selected.value.periodId])

const timeWarnings = computed(() => {
  const warnings = []
  const periods = data.value.periods

  periods.forEach((period, index) => {
    const start = toMinutes(period.start)
    const end = toMinutes(period.end)
    if (start >= end) warnings.push(`${period.label}的結束時間必須晚於開始時間。`)

    const next = periods[index + 1]
    if (next && end > toMinutes(next.start)) {
      warnings.push(`${period.label}與${next.label}的時間重疊，或排列順序需要調整。`)
    }
  })

  return warnings
})

const quickPreview = computed(() => {
  const periods = []
  let current = toMinutes(quick.value.firstStart)
  const morningCount = clampNumber(quick.value.morningCount, 1, 8)
  const afternoonCount = clampNumber(quick.value.afternoonCount, 0, 8)
  const duration = clampNumber(quick.value.duration, 1, 120)
  const normalBreak = clampNumber(quick.value.breakMinutes, 0, 60)
  const longBreak = clampNumber(quick.value.longBreakMinutes, 0, 90)
  const longAfter = clampNumber(quick.value.longBreakAfter, 0, morningCount)

  for (let index = 1; index <= morningCount; index += 1) {
    const end = current + duration
    periods.push(makeClassPeriod(index, current, end))
    current = end + (index === longAfter && longAfter > 0 ? longBreak : normalBreak)
  }

  current = toMinutes(quick.value.afternoonStart)
  for (let offset = 1; offset <= afternoonCount; offset += 1) {
    const number = morningCount + offset
    const end = current + duration
    periods.push(makeClassPeriod(number, current, end))
    current = end + clampNumber(quick.value.afternoonBreakMinutes, 0, 60)
  }

  return periods
})

const previewStatus = computed(() => getStatusFor(previewDay.value, toMinutes(previewTime.value)))
const previewHalfDay = computed(() => Boolean(data.value.halfDayCutoffs[previewDay.value]))
const halfDaySummary = computed(() => {
  const halfDays = days.filter(day => isHalfDay(day.key)).map(day => day.label)
  return halfDays.length ? halfDays.join('、') : '目前皆為全天'
})

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0))
}

function toMinutes(time) {
  const [hour, minute] = String(time || '00:00').split(':').map(Number)
  return hour * 60 + minute
}

function toTime(minutes) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

function addMinutes(time, minutes) {
  return toTime(toMinutes(time) + minutes)
}

function chineseNumber(number) {
  const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  if (number <= 10) return map[number]
  if (number < 20) return `十${map[number - 10]}`
  return String(number)
}

function makeClassPeriod(number, startMinutes, endMinutes) {
  return {
    id: `p${number}`,
    label: `第${chineseNumber(number)}節`,
    kind: 'class',
    start: toTime(startMinutes),
    end: toTime(endMinutes)
  }
}

function selectCell(dayKey, periodId) {
  if (!isPeriodVisibleForDay(dayKey, periodId)) return
  selected.value = { dayKey, periodId }
  mobileDay.value = dayKey
}

function cellTitle(dayKey, period) {
  const entry = entryFor(dayKey, period.id)
  return entry?.subject?.trim() || period.label
}

function entryDisplayIcon(entry, kind) {
  const subject = entry?.subject?.trim()
  const presetIcon = subjectIconMap[subject]
  if (kind === 'class' && presetIcon && (!entry?.icon?.trim() || entry.icon.trim() === '📖')) return presetIcon
  return entry?.icon?.trim() || defaultIcon(kind)
}

function cellIcon(dayKey, period) {
  return entryDisplayIcon(entryFor(dayKey, period.id), period.kind)
}

function entryFor(dayKey, periodId) {
  return data.value.weekdays[dayKey]?.[periodId]
}

function isHalfDay(dayKey) {
  return Boolean(data.value.halfDayCutoffs[dayKey])
}

function defaultHalfDayCutoffId() {
  const classPeriods = data.value.periods.filter(period => period.kind === 'class')
  return classPeriods[Math.min(3, classPeriods.length - 1)]?.id || data.value.periods[0]?.id || null
}

function toggleHalfDay(dayKey, enabled) {
  data.value.halfDayCutoffs[dayKey] = enabled ? defaultHalfDayCutoffId() : null
  ensureSelectionVisible()
}

function isPeriodVisibleForDay(dayKey, periodId) {
  const cutoffId = data.value.halfDayCutoffs[dayKey]
  if (!cutoffId) return true
  const cutoffIndex = data.value.periods.findIndex(period => period.id === cutoffId)
  const periodIndex = data.value.periods.findIndex(period => period.id === periodId)
  if (cutoffIndex < 0 || periodIndex < 0) return true
  return periodIndex <= cutoffIndex
}

function visiblePeriodsForDay(dayKey) {
  return data.value.periods.filter(period => isPeriodVisibleForDay(dayKey, period.id))
}

function sortedVisiblePeriodsForDay(dayKey) {
  return [...visiblePeriodsForDay(dayKey)].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
}

function ensureSelectionVisible() {
  if (selected.value.periodId && isPeriodVisibleForDay(selected.value.dayKey, selected.value.periodId)) return
  const first = visiblePeriodsForDay(selected.value.dayKey)[0] || data.value.periods[0]
  selected.value.periodId = first?.id || ''
}

function toggleTimetableEditing() {
  isEditingTimetable.value = !isEditingTimetable.value
  if (!isEditingTimetable.value) {
    selectedSubjectTool.value = null
    draggedSubjectTool.value = null
  }
}

function chooseSubjectTool(tool) {
  isEditingTimetable.value = true
  selectedSubjectTool.value = selectedSubjectTool.value?.name === tool.name ? null : tool
}

function pushSubjectUndo(dayKey, periodId) {
  const current = data.value.weekdays?.[dayKey]?.[periodId]
  if (!current) return
  subjectUndoStack.value.push({ dayKey, periodId, entry: { ...current } })
  if (subjectUndoStack.value.length > 40) subjectUndoStack.value.shift()
}

function applySubjectTool(dayKey, period, tool = selectedSubjectTool.value) {
  if (!tool || period.kind !== 'class' || !isPeriodVisibleForDay(dayKey, period.id)) {
    selectCell(dayKey, period.id)
    return
  }

  pushSubjectUndo(dayKey, period.id)
  if (tool.clear) {
    data.value.weekdays[dayKey][period.id] = defaultEntry('class')
  } else {
    data.value.weekdays[dayKey][period.id] = {
      ...data.value.weekdays[dayKey][period.id],
      subject: tool.name,
      icon: tool.icon,
      message: ''
    }
  }
  selected.value = { dayKey, periodId: period.id }
  mobileDay.value = dayKey
}

function handleCellClick(dayKey, period) {
  if (isEditingTimetable.value && selectedSubjectTool.value && period.kind === 'class') {
    applySubjectTool(dayKey, period)
    return
  }
  selectCell(dayKey, period.id)
}

function handleSubjectDragStart(tool, event) {
  isEditingTimetable.value = true
  draggedSubjectTool.value = tool
  selectedSubjectTool.value = tool
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', JSON.stringify(tool))
  }
}

function handleSubjectDragEnd() {
  draggedSubjectTool.value = null
}

function handleSubjectDrop(dayKey, period, event) {
  if (period.kind !== 'class' || !isPeriodVisibleForDay(dayKey, period.id)) return
  let tool = draggedSubjectTool.value
  if (!tool && event?.dataTransfer) {
    try {
      tool = JSON.parse(event.dataTransfer.getData('text/plain'))
    } catch {
      tool = null
    }
  }
  if (tool) applySubjectTool(dayKey, period, tool)
  draggedSubjectTool.value = null
}

function undoLastSubjectChange() {
  const last = subjectUndoStack.value.pop()
  if (!last || !data.value.weekdays?.[last.dayKey]) return
  data.value.weekdays[last.dayKey][last.periodId] = { ...last.entry }
  selected.value = { dayKey: last.dayKey, periodId: last.periodId }
  mobileDay.value = last.dayKey
}

function clearClassSubjects() {
  const accepted = window.confirm('要清空週一到週五所有正式課程的科目與提醒嗎？其他活動會保留。')
  if (!accepted) return

  days.forEach(day => {
    data.value.periods
      .filter(period => period.kind === 'class')
      .forEach(period => {
        data.value.weekdays[day.key][period.id] = defaultEntry('class')
      })
  })
}

function resetTimes() {
  const accepted = window.confirm('要把作息恢復為預設時段嗎？這會移除自行新增的時段，但相同節次已填的科目會盡量保留。')
  if (!accepted) return
  replacePeriods(defaultPeriods.map(period => ({ ...period })))
}

function addPeriod() {
  const last = data.value.periods[data.value.periods.length - 1]
  const start = last?.end || '08:00'
  const id = `custom-${Date.now()}`
  const period = {
    id,
    label: '新時段',
    kind: 'other',
    start,
    end: addMinutes(start, 20)
  }
  data.value.periods.push(period)
  days.forEach(day => {
    data.value.weekdays[day.key][id] = defaultEntry('other')
  })
  selected.value = { dayKey: mobileDay.value, periodId: id }
}

function deletePeriod(index) {
  const period = data.value.periods[index]
  if (!period) return
  const accepted = window.confirm(`確定刪除「${period.label}」嗎？這個時段在週一到週五填寫的內容也會一起刪除。`)
  if (!accepted) return

  const previous = data.value.periods[index - 1] || data.value.periods[index + 1] || null
  data.value.periods.splice(index, 1)
  days.forEach(day => {
    delete data.value.weekdays[day.key][period.id]
    if (data.value.halfDayCutoffs[day.key] === period.id) {
      data.value.halfDayCutoffs[day.key] = previous?.id || null
    }
  })

  if (selected.value.periodId === period.id) {
    selected.value.periodId = previous?.id || data.value.periods[0]?.id || ''
  }
}

function movePeriod(index, direction) {
  const target = index + direction
  if (target < 0 || target >= data.value.periods.length) return
  const next = [...data.value.periods]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  data.value.periods = next
}

function handleKindChange(period) {
  days.forEach(day => {
    const entry = data.value.weekdays[day.key][period.id]
    if (!entry) {
      data.value.weekdays[day.key][period.id] = defaultEntry(period.kind)
      return
    }
    const defaults = defaultEntry(period.kind)
    if (!entry.icon?.trim()) entry.icon = defaults.icon
    if (!entry.subject?.trim()) entry.subject = defaults.subject
    if (!entry.message?.trim()) entry.message = defaults.message
  })
}

function replacePeriods(nextPeriods) {
  const oldWeekdays = data.value.weekdays
  const nextWeekdays = {}
  days.forEach(day => {
    nextWeekdays[day.key] = {}
    nextPeriods.forEach(period => {
      nextWeekdays[day.key][period.id] = oldWeekdays?.[day.key]?.[period.id]
        ? { ...defaultEntry(period.kind), ...oldWeekdays[day.key][period.id] }
        : defaultEntry(period.kind)
    })
  })

  const validIds = new Set(nextPeriods.map(period => period.id))
  const fallbackCutoff = nextPeriods.filter(period => period.kind === 'class')[3]?.id
    || nextPeriods.filter(period => period.kind === 'class').at(-1)?.id
    || null

  days.forEach(day => {
    if (data.value.halfDayCutoffs[day.key] && !validIds.has(data.value.halfDayCutoffs[day.key])) {
      data.value.halfDayCutoffs[day.key] = fallbackCutoff
    }
  })

  data.value.periods = nextPeriods
  data.value.weekdays = nextWeekdays
  data.value.version = 2
  if (!validIds.has(selected.value.periodId)) selected.value.periodId = nextPeriods[0]?.id || ''
}

function applyQuickSetup() {
  if (!quickPreview.value.length) return
  const rebuild = quick.value.applyMode === 'rebuild'
  const message = rebuild
    ? '將重新建立標準早修、打掃、午休與正式課程；原有自訂時段會被移除。確定套用嗎？'
    : '將以預覽時間取代所有正式課程，早修、打掃、午休與其他自訂時段會保留。確定套用嗎？'
  if (!window.confirm(message)) return

  const specialPeriods = rebuild
    ? defaultPeriods.filter(period => period.kind !== 'class').map(period => ({ ...period }))
    : data.value.periods.filter(period => period.kind !== 'class').map(period => ({ ...period }))

  const nextPeriods = [...specialPeriods, ...quickPreview.value.map(period => ({ ...period }))]
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  replacePeriods(nextPeriods)
  showQuickSetup.value = false
}

function useCurrentPreviewTime() {
  previewDay.value = currentDayKey()
  previewTime.value = currentTimeValue()
}

function defaultIcon(kind) {
  return defaultEntry(kind).icon || '🌿'
}

function defaultMessage(kind, title) {
  const messages = {
    morning: '請安靜進教室，完成早修任務與作業繳交。',
    class: `現在是${title}，請準備好課本用品並專心上課。`,
    recess: '請完成喝水、上廁所與下節課準備。',
    cleaning: '請到自己的打掃區，完成整理後請幹部檢查。',
    lunch: '用餐後整理座位，午休時間保持安靜。',
    assembly: '請依老師指示安靜集合。',
    other: '請看老師指示，完成現在的任務。'
  }
  return messages[kind] || messages.other
}

function makeNextInfo(period, dayEntries) {
  if (!period) return null
  const entry = dayEntries[period.id] || defaultEntry(period.kind)
  return {
    periodLabel: period.label,
    title: entry.subject?.trim() || period.label,
    icon: entryDisplayIcon(entry, period.kind),
    start: period.start
  }
}

function getStatusFor(dayKey, minute) {
  const day = days.find(item => item.key === dayKey) || days[0]
  const periods = sortedVisiblePeriodsForDay(day.key)
  const dayEntries = data.value.weekdays[day.key] || {}

  if (!periods.length) {
    return {
      mode: 'after', kind: 'other', icon: '🌿', title: '尚未設定作息',
      periodLabel: day.label, message: '請先新增今天要使用的時段。', minutesLeft: null, next: null
    }
  }

  const activeIndex = periods.findIndex(period => minute >= toMinutes(period.start) && minute < toMinutes(period.end))
  if (activeIndex >= 0) {
    const period = periods[activeIndex]
    const entry = dayEntries[period.id] || defaultEntry(period.kind)
    const title = entry.subject?.trim() || period.label
    return {
      mode: 'active', kind: period.kind,
      icon: entryDisplayIcon(entry, period.kind),
      title,
      periodLabel: `${period.label}・${period.start}–${period.end}`,
      message: entry.message?.trim() || defaultMessage(period.kind, title),
      minutesLeft: Math.max(0, toMinutes(period.end) - minute),
      next: makeNextInfo(periods[activeIndex + 1], dayEntries)
    }
  }

  const nextIndex = periods.findIndex(period => minute < toMinutes(period.start))
  if (nextIndex === 0) {
    const next = makeNextInfo(periods[0], dayEntries)
    return {
      mode: 'before', kind: 'other', icon: '🌿', title: '到校準備',
      periodLabel: `${day.label}課表尚未開始`,
      message: `第一個時段是${next.title}，請先完成到校準備。`,
      minutesLeft: Math.max(0, toMinutes(periods[0].start) - minute), next
    }
  }

  if (nextIndex > 0) {
    const nextPeriod = periods[nextIndex]
    const next = makeNextInfo(nextPeriod, dayEntries)
    const minutesLeft = Math.max(0, toMinutes(nextPeriod.start) - minute)
    const warning = minutesLeft <= 2
    return {
      mode: 'gap', kind: 'recess', icon: warning ? '⏰' : '🔔',
      title: warning ? '準備上課' : '下課時間',
      periodLabel: `下一個時段 ${nextPeriod.start} 開始`,
      message: warning
        ? `倒數兩分鐘，下一個是${next.title}，請收拾物品並回座位。`
        : `下一個是${next.title}，請在 ${nextPeriod.start} 前完成下課活動。`,
      minutesLeft, next
    }
  }

  const halfDayText = isHalfDay(day.key) ? '今天是半天課，' : ''
  return {
    mode: 'after', kind: 'dismissal', icon: '🎒', title: '放學時間',
    periodLabel: `${day.label}${isHalfDay(day.key) ? '半天課' : '課表'}已結束`,
    message: `${halfDayText}整理書包、桌面與抽屜，依老師指示準備放學。`,
    minutesLeft: null, next: null
  }
}
</script>


<template>
  <div class="page wide-page weekly-schedule-page">
    <div class="page-title-row schedule-title-row">
      <div>
        <h2>📅 課表與作息</h2>
        <p>用科目工具盤快速排課；「現在狀態」會共用同一份資料。</p>
      </div>
      <span class="schedule-save-state">{{ savedText }}</span>
    </div>

    <section v-if="isCentralMode" class="card compact-card central-schedule-state" :data-state="centralState">
      <div><strong>中央共享課表 · {{ SHARED_CLASS_ID }}</strong><p>{{ centralMessage }}</p></div>
      <button v-if="centralState === 'auth-required'" type="button" @click="loginCentralSchedule">登入中央教師帳號</button>
      <button v-else-if="centralState === 'load-failed' || centralState === 'permission'" type="button" @click="loadCentralSchedule">重新載入</button>
    </section>

    <ScheduleImportPanel v-if="!isCentralMode && SCHEDULE_IMPORT_ENABLED" />

    <div v-if="!isCentralMode || centralReady" class="schedule-tabs" role="tablist" aria-label="課表設定頁籤">
      <button type="button" :class="{ active: activeTab === 'week' }" @click="activeTab = 'week'">本週課表</button>
      <button type="button" :class="{ active: activeTab === 'times' }" @click="activeTab = 'times'">作息時間</button>
      <button type="button" :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">狀態預覽</button>
    </div>

    <template v-if="(!isCentralMode || centralReady) && activeTab === 'week'">
      <section class="half-day-collapsible">
        <button
          type="button"
          class="half-day-summary-button"
          :aria-expanded="showHalfDaySettings"
          @click="showHalfDaySettings = !showHalfDaySettings"
        >
          <span><b>⚙️ 半天課設定：</b>{{ halfDaySummary }}</span>
          <span class="half-day-chevron">{{ showHalfDaySettings ? '收起 ▲' : '展開 ▼' }}</span>
        </button>

        <div v-if="showHalfDaySettings" class="half-day-panel">
          <p>勾選半天課並指定上到哪個時段；下午內容只會隱藏，不會被刪除。</p>
          <div class="half-day-grid">
            <div v-for="day in days" :key="day.key" class="half-day-item" :class="{ active: isHalfDay(day.key) }">
              <label class="half-day-toggle">
                <input
                  type="checkbox"
                  :checked="isHalfDay(day.key)"
                  @change="toggleHalfDay(day.key, $event.target.checked)"
                />
                <strong>{{ day.label }}</strong>
                <span>{{ isHalfDay(day.key) ? '半天課' : '全天課' }}</span>
              </label>
              <label v-if="isHalfDay(day.key)" class="half-day-cutoff">
                <span>上到</span>
                <select v-model="data.halfDayCutoffs[day.key]" @change="ensureSelectionVisible">
                  <option v-for="period in data.periods" :key="period.id" :value="period.id">{{ period.label }}</option>
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section class="card compact-card schedule-main-card">
        <div class="schedule-card-head">
          <div>
            <h3>週一至週五</h3>
            <p v-if="!isEditingTimetable">課表以學生閱讀為主；需要排課時，再開啟編輯模式。</p>
            <p v-else>先點選科目，再連續點課表格子；桌機也能直接拖曳科目。</p>
          </div>
          <div class="schedule-tools">
            <button
              type="button"
              :class="['schedule-edit-toggle', { active: isEditingTimetable }]"
              @click="toggleTimetableEditing"
            >
              {{ isEditingTimetable ? '✓ 完成編輯' : '✏️ 編輯課表' }}
            </button>
            <button
              v-if="isEditingTimetable"
              type="button"
              class="schedule-soft-button"
              :disabled="!subjectUndoStack.length"
              @click="undoLastSubjectChange"
            >
              ↶ 復原
            </button>
            <button
              v-if="isEditingTimetable"
              type="button"
              class="schedule-soft-button danger"
              @click="clearClassSubjects"
            >
              清空全部科目
            </button>
          </div>
        </div>

        <div v-if="isEditingTimetable" class="subject-palette" aria-label="科目工具盤">
          <div class="subject-palette-head">
            <div>
              <strong>科目工具盤</strong>
              <span>
                {{ selectedSubjectTool ? `目前選擇：${selectedSubjectTool.icon} ${selectedSubjectTool.name}` : '點選一個科目後，即可像蓋章一樣連續填入。' }}
              </span>
            </div>
            <button
              type="button"
              class="subject-tool clear-tool"
              :class="{ selected: selectedSubjectTool?.clear }"
              @click="chooseSubjectTool(clearSubjectTool)"
            >
              <span class="subject-tool-icon" aria-hidden="true">✕</span>
              <span class="subject-tool-name">清除格子</span>
            </button>
          </div>

          <div class="subject-group-grid">
            <div v-for="group in subjectGroups" :key="group.label" class="subject-group">
              <small>{{ group.label }}</small>
              <div class="subject-tools">
                <button
                  v-for="subject in group.subjects"
                  :key="subject.name"
                  type="button"
                  class="subject-tool"
                  :class="{ selected: selectedSubjectTool?.name === subject.name }"
                  draggable="true"
                  @click="chooseSubjectTool(subject)"
                  @dragstart="handleSubjectDragStart(subject, $event)"
                  @dragend="handleSubjectDragEnd"
                >
                  <span class="subject-tool-icon" aria-hidden="true">{{ subject.icon }}</span>
                  <span class="subject-tool-name">{{ subject.name }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="desktop-week-table" aria-label="本週課表">
          <div class="week-grid week-grid-head">
            <div class="period-heading">時段</div>
            <div v-for="day in days" :key="day.key" class="day-heading">
              {{ day.label }}
              <small v-if="isHalfDay(day.key)">半天</small>
            </div>
          </div>

          <div
            v-for="period in data.periods"
            :key="period.id"
            class="week-grid week-grid-row"
            :class="`period-kind-${period.kind}`"
          >
            <div class="period-cell">
              <strong>{{ period.label }}</strong>
              <span>{{ period.start }}–{{ period.end }}</span>
            </div>
            <template v-for="day in days" :key="`${day.key}-${period.id}`">
              <button
                v-if="isPeriodVisibleForDay(day.key, period.id)"
                type="button"
                class="subject-cell"
                :class="{
                  selected: selected.dayKey === day.key && selected.periodId === period.id,
                  editable: isEditingTimetable && period.kind === 'class',
                  'stamp-ready': isEditingTimetable && selectedSubjectTool && period.kind === 'class'
                }"
                @click="handleCellClick(day.key, period)"
                @dragover="period.kind === 'class' && $event.preventDefault()"
                @drop.prevent="handleSubjectDrop(day.key, period, $event)"
              >
                <span class="subject-icon">{{ cellIcon(day.key, period) }}</span>
                <strong>{{ cellTitle(day.key, period) }}</strong>
                <small v-if="isEditingTimetable && period.kind === 'class'" class="cell-edit-hint">
                  {{ selectedSubjectTool ? '點一下填入' : '可拖曳科目到這裡' }}
                </small>
              </button>
              <div v-else class="subject-cell half-day-empty" aria-label="半天課下午留白"></div>
            </template>
          </div>
        </div>

        <div class="mobile-week-editor">
          <div class="mobile-day-picker" aria-label="選擇星期">
            <button
              v-for="day in days"
              :key="day.key"
              type="button"
              :class="{ active: mobileDay === day.key }"
              @click="mobileDay = day.key; ensureSelectionVisible()"
            >
              週{{ day.short }}<small v-if="isHalfDay(day.key)">半天</small>
            </button>
          </div>

          <div v-if="isHalfDay(mobileDay)" class="mobile-half-day-note">今天是半天課，下午時段已隱藏。</div>

          <div class="mobile-period-list">
            <button
              v-for="period in visiblePeriodsForDay(mobileDay)"
              :key="period.id"
              type="button"
              class="mobile-period-card"
              :class="[
                `period-kind-${period.kind}`,
                {
                  selected: selected.dayKey === mobileDay && selected.periodId === period.id,
                  'stamp-ready': isEditingTimetable && selectedSubjectTool && period.kind === 'class'
                }
              ]"
              @click="handleCellClick(mobileDay, period)"
            >
              <span class="mobile-period-time">{{ period.start }}–{{ period.end }}</span>
              <span class="mobile-period-name">{{ period.label }}</span>
              <strong>{{ cellIcon(mobileDay, period) }} {{ cellTitle(mobileDay, period) }}</strong>
              <small v-if="isEditingTimetable && period.kind === 'class'">
                {{ selectedSubjectTool ? '點一下填入科目' : '請先從上方選科目' }}
              </small>
            </button>
          </div>
        </div>
      </section>

      <section v-if="selectedPeriod && selectedEntry" class="card compact-card schedule-detail-card">
        <div class="schedule-detail-heading">
          <div>
            <span>{{ selectedDay.label }}・{{ selectedPeriod.label }}</span>
            <h3>{{ selectedPeriod.start }}–{{ selectedPeriod.end }}</h3>
          </div>
          <span class="detail-live-hint">會立即連動「現在狀態」</span>
        </div>

        <div class="schedule-detail-grid">
          <label>
            <span>圖示</span>
            <input v-model="selectedEntry.icon" maxlength="4" :placeholder="defaultIcon(selectedPeriod.kind)" />
          </label>
          <label class="subject-field">
            <span>科目或活動名稱</span>
            <input v-model="selectedEntry.subject" :placeholder="selectedPeriod.label" />
          </label>
          <label class="message-field">
            <span>給學生看的提醒</span>
            <textarea v-model="selectedEntry.message" rows="3" placeholder="例如：請準備國語課本、習作與鉛筆盒。"></textarea>
          </label>
        </div>
      </section>
    </template>

    <template v-else-if="(!isCentralMode || centralReady) && activeTab === 'times'">
      <section class="card compact-card quick-setup-card">
        <div class="schedule-card-head">
          <div>
            <h3>✨ 40 分鐘快速建立</h3>
            <p>只要填第一節時間與下課長度，系統就會自動算出正式課程。</p>
          </div>
          <button type="button" class="schedule-soft-button" @click="showQuickSetup = !showQuickSetup">
            {{ showQuickSetup ? '收起快速設定' : '開啟快速設定' }}
          </button>
        </div>

        <div v-if="showQuickSetup" class="quick-setup-panel">
          <div class="quick-form-grid">
            <label><span>第一節開始</span><input v-model="quick.firstStart" type="time" class="schedule-time-input" /></label>
            <label><span>每節課</span><div class="number-with-unit"><input v-model.number="quick.duration" type="number" min="1" max="120" /><b>分鐘</b></div></label>
            <label><span>一般下課</span><div class="number-with-unit"><input v-model.number="quick.breakMinutes" type="number" min="0" max="60" /><b>分鐘</b></div></label>
            <label><span>上午節數</span><input v-model.number="quick.morningCount" type="number" min="1" max="8" /></label>
            <label><span>大下課在第幾節後</span><input v-model.number="quick.longBreakAfter" type="number" min="0" :max="quick.morningCount" /></label>
            <label><span>大下課</span><div class="number-with-unit"><input v-model.number="quick.longBreakMinutes" type="number" min="0" max="90" /><b>分鐘</b></div></label>
            <label><span>下午第一節開始</span><input v-model="quick.afternoonStart" type="time" class="schedule-time-input" /></label>
            <label><span>下午節數</span><input v-model.number="quick.afternoonCount" type="number" min="0" max="8" /></label>
            <label><span>下午下課</span><div class="number-with-unit"><input v-model.number="quick.afternoonBreakMinutes" type="number" min="0" max="60" /><b>分鐘</b></div></label>
          </div>

          <div class="quick-apply-mode">
            <strong>套用方式</strong>
            <label><input v-model="quick.applyMode" type="radio" value="preserve" /> 保留早修、打掃、午休及自訂時段，只重建正式課程</label>
            <label><input v-model="quick.applyMode" type="radio" value="rebuild" /> 全部恢復為標準國小時段後再套用</label>
          </div>

          <div class="quick-preview-box">
            <strong>套用前預覽</strong>
            <div class="quick-preview-grid">
              <span v-for="period in quickPreview" :key="period.id">
                <b>{{ period.label }}</b>{{ period.start }}–{{ period.end }}
              </span>
            </div>
          </div>

          <div class="quick-actions">
            <button type="button" class="schedule-soft-button" @click="showQuickSetup = false">取消</button>
            <button type="button" @click="applyQuickSetup">套用這組時間</button>
          </div>
        </div>
      </section>

      <section class="card compact-card time-settings-card">
        <div class="schedule-card-head">
          <div>
            <h3>全週共用作息時間</h3>
            <p>可新增、刪除與調整順序；未排入時段的空檔會自動顯示為下課時間。</p>
          </div>
          <div class="schedule-tools">
            <button type="button" class="schedule-soft-button" @click="addPeriod">＋ 新增時段</button>
            <button type="button" class="schedule-soft-button" @click="resetTimes">恢復預設時段</button>
          </div>
        </div>

        <div v-if="timeWarnings.length" class="time-warning" role="alert">
          <strong>請檢查時間設定：</strong>
          <span v-for="warning in timeWarnings" :key="warning">{{ warning }}</span>
        </div>

        <div class="time-setting-list">
          <div v-for="(period, index) in data.periods" :key="period.id" class="time-setting-row">
            <div class="period-order-buttons">
              <button type="button" :disabled="index === 0" title="上移" @click="movePeriod(index, -1)">↑</button>
              <button type="button" :disabled="index === data.periods.length - 1" title="下移" @click="movePeriod(index, 1)">↓</button>
            </div>
            <label class="period-name-field">
              <span>時段名稱</span>
              <input v-model="period.label" />
            </label>
            <label>
              <span>類型</span>
              <select v-model="period.kind" @change="handleKindChange(period)">
                <option v-for="option in kindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>開始</span>
              <input v-model="period.start" type="time" class="schedule-time-input" />
            </label>
            <label>
              <span>結束</span>
              <input v-model="period.end" type="time" class="schedule-time-input" />
            </label>
            <button type="button" class="delete-period-button" @click="deletePeriod(index)">刪除</button>
          </div>
        </div>

        <button type="button" class="add-period-bottom" @click="addPeriod">＋ 在最後新增時段</button>
      </section>
    </template>

    <template v-else-if="!isCentralMode || centralReady">
      <section class="card compact-card status-preview-settings">
        <div class="schedule-card-head">
          <div>
            <h3>現在狀態預覽</h3>
            <p>用任意星期與時間測試，確認半天課、下課倒數和放學切換是否符合需求。</p>
          </div>
          <button type="button" class="schedule-soft-button" @click="useCurrentPreviewTime">使用現在時間</button>
        </div>
        <div class="preview-controls">
          <label>
            <span>星期</span>
            <select v-model="previewDay">
              <option v-for="day in days" :key="day.key" :value="day.key">{{ day.label }}</option>
            </select>
          </label>
          <label>
            <span>時間</span>
            <input v-model="previewTime" type="time" class="schedule-time-input" />
          </label>
          <span v-if="previewHalfDay" class="preview-half-day-badge">半天課</span>
        </div>
      </section>

      <section class="card schedule-status-preview" :class="{ warning: previewStatus.mode === 'gap' && previewStatus.minutesLeft <= 2 }">
        <small>{{ previewStatus.periodLabel }}</small>
        <div class="preview-status-title">
          <span>{{ previewStatus.icon }}</span>
          <h1>{{ previewStatus.title }}</h1>
        </div>
        <p>{{ previewStatus.message }}</p>
        <div class="preview-status-badges">
          <strong v-if="previewStatus.minutesLeft !== null">剩下 {{ previewStatus.minutesLeft }} 分鐘</strong>
          <span v-if="previewStatus.next">下一個：{{ previewStatus.next.icon }} {{ previewStatus.next.title }}・{{ previewStatus.next.start }}</span>
        </div>
        <RouterLink class="button-link preview-open-status" to="/status">開啟完整「現在狀態」</RouterLink>
      </section>
    </template>
  </div>
</template>


<style scoped>
.weekly-schedule-page { display: flex; flex-direction: column; gap: 14px; }
.schedule-title-row { align-items: center; margin-bottom: 0; }
.schedule-save-state { flex: 0 0 auto; padding: 8px 12px; border-radius: 999px; background: #edf8f2; color: #2f6f57; font-size: 13px; font-weight: 900; }
.central-schedule-state { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.central-schedule-state p { margin: 4px 0 0; color: #667085; }
.central-schedule-state[data-state="save-failed"], .central-schedule-state[data-state="load-failed"], .central-schedule-state[data-state="permission"] { border-color: #efc7bf; background: #fff8f6; }
.schedule-tabs { display: inline-flex; align-self: flex-start; gap: 6px; padding: 5px; border-radius: 16px; background: #eaf4ef; }
.schedule-tabs button { padding: 9px 18px; border-radius: 12px; background: transparent; color: #567064; }
.schedule-tabs button.active { background: #fff; color: #2f6f57; box-shadow: 0 4px 14px rgba(47,111,87,.12); }
.schedule-main-card, .schedule-detail-card, .time-settings-card, .quick-setup-card, .status-preview-settings { margin-top: 0; }
.schedule-card-head, .schedule-detail-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
.schedule-card-head h3, .schedule-detail-heading h3 { margin: 0; }
.schedule-card-head p { margin: 5px 0 0; color: #667085; font-weight: 700; }
.schedule-tools { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.schedule-soft-button { background: #f3faf6; color: #2f6f57; border: 1px solid #cfe9dd; }
.schedule-soft-button:disabled { opacity: .42; cursor: not-allowed; }
.schedule-soft-button.danger { background: #fff5f3; color: #a74236; border-color: #f1d0ca; }
.schedule-edit-toggle { background: #6bbf95; color: #fff; border: 1px solid #6bbf95; }
.schedule-edit-toggle.active { background: #2f6f57; }

.half-day-collapsible { border: 1px solid #eadfc8; border-radius: 16px; background: rgba(255,255,255,.76); overflow: hidden; box-shadow: 0 5px 16px rgba(36,59,83,.05); }
.half-day-summary-button { width: 100%; min-height: 48px; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 11px 15px; border-radius: 0; background: transparent; color: #465668; text-align: left; }
.half-day-summary-button:hover { background: #fffaf0; }
.half-day-summary-button b { color: #2f6f57; }
.half-day-chevron { flex: 0 0 auto; color: #7b8794; font-size: 12px; }
.half-day-panel { padding: 0 14px 14px; border-top: 1px solid #eee5d7; }
.half-day-panel > p { margin: 11px 0; color: #667085; font-size: 13px; font-weight: 750; }
.half-day-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 9px; }
.half-day-item { min-width: 0; padding: 10px; border: 2px solid #e6eee9; border-radius: 14px; background: #fffdfa; }
.half-day-item.active { border-color: #e3bd69; background: #fff9e8; }
.half-day-toggle { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; align-items: center; cursor: pointer; }
.half-day-toggle input { grid-row: 1 / span 2; width: 18px; height: 18px; }
.half-day-toggle strong { color: #34495a; }
.half-day-toggle span { color: #7b8794; font-size: 12px; font-weight: 850; }
.half-day-cutoff { display: grid; gap: 5px; margin-top: 8px; color: #765816; font-size: 12px; font-weight: 900; }
.half-day-cutoff select { width: 100%; border: 1.5px solid #ead8a7; border-radius: 10px; padding: 7px; background: #fff; font: inherit; }

.subject-palette { display: grid; gap: 12px; margin-bottom: 14px; padding: 14px; border: 2px solid #cfe9dd; border-radius: 18px; background: linear-gradient(135deg,#f7fcf9,#fffdf8); }
.subject-palette-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.subject-palette-head > div { display: grid; gap: 4px; }
.subject-palette-head strong { color: #2f6f57; font-size: 17px; }
.subject-palette-head span { color: #667085; font-size: 13px; font-weight: 750; }
.subject-group-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); grid-auto-rows: 1fr; align-items: stretch; gap: 10px; }
.subject-group { min-width: 0; height: 100%; display: grid; grid-template-rows: auto 1fr; align-content: start; gap: 9px; padding: 11px; border-radius: 14px; background: rgba(255,255,255,.82); border: 1px solid #e2ece7; }
.subject-group small { min-height: 20px; display: flex; align-items: center; color: #74837b; font-weight: 900; line-height: 1.25; }
.subject-tools { min-width: 0; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); grid-auto-rows: 44px; align-content: start; gap: 8px; }
.subject-tool { width: 100%; min-width: 0; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 9px; border: 1.5px solid #d6e7de; border-radius: 999px; background: #fff; color: #34495a; font-size: 14px; line-height: 1.15; cursor: grab; white-space: nowrap; }
.subject-tool-icon { flex: 0 0 1.45em; width: 1.45em; display: inline-grid; place-items: center; font-size: 1.05em; line-height: 1; }
.subject-tool-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; }
.subject-tool:hover { background: #edf8f2; transform: translateY(-1px); }
.subject-tool.selected { background: #2f6f57; color: #fff; border-color: #2f6f57; box-shadow: 0 4px 12px rgba(47,111,87,.2); }
.subject-tool.clear-tool { width: auto; min-width: 132px; flex: 0 0 auto; cursor: pointer; background: #fff5f3; color: #a74236; border-color: #f1d0ca; }
.subject-tool.clear-tool.selected { background: #a74236; color: #fff; }

.desktop-week-table { overflow: hidden; border: 1px solid #dfeae4; border-radius: 18px; }
.week-grid { display: grid; grid-template-columns: minmax(118px,.9fr) repeat(5,minmax(120px,1fr)); }
.week-grid + .week-grid { border-top: 1px solid #e6eee9; }
.week-grid-head { background: #edf8f2; color: #2f6f57; font-weight: 950; }
.period-heading, .day-heading { padding: 12px 8px; text-align: center; }
.day-heading { display: flex; justify-content: center; align-items: center; gap: 5px; }
.day-heading small { padding: 2px 5px; border-radius: 999px; background: #fff1c7; color: #805716; font-size: 10px; }
.day-heading + .day-heading, .subject-cell, .period-cell + .subject-cell { border-left: 1px solid #e6eee9; }
.period-cell { display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; padding: 9px 10px; background: #fffaf3; text-align: center; }
.period-cell strong { color: #465668; }
.period-cell span { color: #7b8794; font-size: 12px; font-weight: 800; }
.subject-cell { min-height: 72px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; padding: 8px; border-radius: 0; background: #fff; color: #243b53; text-align: center; }
.subject-cell:hover, .subject-cell.selected { background: #f3faf6; }
.subject-cell.selected { box-shadow: inset 0 0 0 3px #6bbf95; }
.subject-cell.editable { cursor: copy; }
.subject-cell.stamp-ready { outline: 2px dashed rgba(107,191,149,.45); outline-offset: -5px; }
.subject-cell.stamp-ready:hover { background: #e8f7ef; }
.subject-cell.half-day-empty { display: block; background: #fffdf8 !important; background-image: repeating-linear-gradient(135deg,transparent 0,transparent 12px,rgba(227,189,105,.09) 13px,rgba(227,189,105,.09) 14px) !important; }
.subject-icon { font-size: 21px; line-height: 1; }
.subject-cell strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #2f4552; font-size: 17px; font-weight: 950; }
.cell-edit-hint { color: #7f8d85; font-size: 10px; font-weight: 800; }
.period-kind-lunch .period-cell, .period-kind-lunch .subject-cell { background: #fff4cf; }
.period-kind-lunch .subject-cell:hover, .period-kind-lunch .subject-cell.selected { background: #ffedb3; }
.period-kind-cleaning .period-cell, .period-kind-cleaning .subject-cell { background: #eaf7ef; }
.period-kind-recess .period-cell, .period-kind-recess .subject-cell { background: #edf6fb; }
.period-kind-assembly .period-cell, .period-kind-assembly .subject-cell { background: #f3effb; }
.period-kind-morning .period-cell, .period-kind-morning .subject-cell { background: #fff9eb; }
.mobile-week-editor { display: none; }

.schedule-detail-heading span:first-child { color: #2f6f57; font-weight: 950; }
.schedule-detail-heading h3 { margin-top: 4px; color: #667085; font-size: 17px; }
.detail-live-hint { padding: 7px 10px; border-radius: 999px; background: #fff3c9; color: #765816; font-size: 12px; font-weight: 900; }
.schedule-detail-grid { display: grid; grid-template-columns: 110px minmax(0,1fr); gap: 12px; }
.schedule-detail-grid label, .time-setting-row label, .quick-form-grid label, .preview-controls label { display: grid; gap: 6px; color: #55636f; font-weight: 900; }
.schedule-detail-grid input, .schedule-detail-grid textarea, .time-setting-row input, .time-setting-row select, .quick-form-grid input, .preview-controls input, .preview-controls select { width: 100%; border: 2px solid #dceee6; border-radius: 14px; padding: 10px 12px; background: #fff; color: #243b53; font: inherit; }
.message-field { grid-column: 1 / -1; }
.message-field textarea { resize: vertical; }

.quick-setup-panel { display: grid; gap: 14px; padding-top: 4px; }
.quick-form-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.number-with-unit { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 7px; }
.number-with-unit b { color: #7b8794; font-size: 13px; }
.quick-apply-mode { display: grid; gap: 8px; padding: 12px; border-radius: 15px; background: #f8fbf9; color: #465668; }
.quick-apply-mode label { display: flex; gap: 8px; align-items: flex-start; font-weight: 800; }
.quick-preview-box { display: grid; gap: 9px; padding: 13px; border: 1px solid #e4ece7; border-radius: 16px; background: #fffdfa; }
.quick-preview-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(165px,1fr)); gap: 7px; }
.quick-preview-grid span { display: flex; justify-content: space-between; gap: 7px; padding: 8px 10px; border-radius: 11px; background: #edf8f2; color: #53665d; font-size: 13px; font-weight: 800; }
.quick-preview-grid b { color: #2f6f57; }
.quick-actions { display: flex; justify-content: flex-end; gap: 8px; }

.time-warning { display: grid; gap: 4px; margin-bottom: 14px; padding: 12px 14px; border: 1px solid #f2c5bd; border-radius: 14px; background: #fff5f3; color: #9b392e; font-weight: 800; }
.time-setting-list { display: grid; gap: 9px; }
.time-setting-row { display: grid; grid-template-columns: 76px minmax(150px,1fr) minmax(130px,.8fr) 132px 132px auto; gap: 9px; align-items: end; padding: 12px; border: 1px solid #e4ece7; border-radius: 16px; background: #fffdfa; }
.period-order-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.period-order-buttons button { padding: 9px 6px; background: #f3faf6; color: #2f6f57; border: 1px solid #cfe9dd; }
.period-order-buttons button:disabled { opacity: .35; cursor: not-allowed; }
.delete-period-button { background: #fff1f2; color: #b42318; border: 1px solid #fecdd3; padding: 10px 12px; }
.add-period-bottom { width: 100%; margin-top: 10px; background: #f3faf6; color: #2f6f57; border: 1.5px dashed #a9d5bf; }

.preview-controls { display: flex; align-items: end; flex-wrap: wrap; gap: 10px; }
.preview-controls label { min-width: 170px; }
.preview-half-day-badge { align-self: center; padding: 8px 12px; border-radius: 999px; background: #fff1c7; color: #805716; font-weight: 950; }
.schedule-status-preview { margin-top: 0; padding: clamp(26px,4vw,48px); display: grid; justify-items: center; gap: 12px; text-align: center; background: linear-gradient(135deg,#fff,#f3faf6 62%,#fffaf2); }
.schedule-status-preview.warning { background: linear-gradient(135deg,#fff9e8,#fff0ed); }
.schedule-status-preview > small { color: #6b7a70; font-size: 15px; font-weight: 900; }
.preview-status-title { display: flex; align-items: center; gap: 14px; }
.preview-status-title span { font-size: clamp(3rem,7vw,5rem); }
.preview-status-title h1 { margin: 0; color: #2f6f57; font-size: clamp(2.2rem,5vw,4.4rem); }
.schedule-status-preview p { max-width: 800px; margin: 0; color: #34495a; font-size: clamp(1.1rem,2vw,1.55rem); line-height: 1.5; font-weight: 900; }
.preview-status-badges { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
.preview-status-badges strong, .preview-status-badges span { padding: 8px 14px; border-radius: 999px; font-weight: 900; }
.preview-status-badges strong { background: #fff0c2; color: #805716; }
.preview-status-badges span { background: #edf8f2; color: #2f6f57; }
.preview-open-status { margin-top: 4px; }

@media (max-width: 1100px) {
  .half-day-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .subject-group-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .time-setting-row { grid-template-columns: 70px minmax(150px,1fr) minmax(130px,1fr) 125px 125px; }
  .delete-period-button { grid-column: 2 / -1; }
}

@media (max-width: 980px) {
  .desktop-week-table { display: none; }
  .mobile-week-editor { display: block; }
  .mobile-day-picker { display: grid; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 7px; margin-bottom: 12px; }
  .mobile-day-picker button { display: grid; gap: 2px; padding: 9px 4px; background: #f5f8f6; color: #53665d; }
  .mobile-day-picker button.active { background: #6bbf95; color: #fff; }
  .mobile-day-picker small { font-size: 9px; }
  .mobile-half-day-note { margin-bottom: 10px; padding: 9px 11px; border-radius: 12px; background: #fff7d9; color: #765816; font-weight: 850; }
  .mobile-period-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
  .mobile-period-card { min-height: 98px; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 4px; padding: 11px; background: #fffdfa; color: #243b53; border: 2px solid #e5ece8; text-align: center; }
  .mobile-period-card.selected { border-color: #6bbf95; background: #f3faf6; }
  .mobile-period-card.stamp-ready { border-style: dashed; border-color: #6bbf95; }
  .mobile-period-card.period-kind-lunch { background: #fff4cf; }
  .mobile-period-card.period-kind-cleaning { background: #eaf7ef; }
  .mobile-period-card.period-kind-recess { background: #edf6fb; }
  .mobile-period-card.period-kind-assembly { background: #f3effb; }
  .mobile-period-time { color: #7b8794; font-size: 12px; font-weight: 800; }
  .mobile-period-name { color: #2f6f57; font-size: 13px; font-weight: 950; }
  .mobile-period-card strong { font-size: 17px; }
  .mobile-period-card small { color: #718078; font-weight: 800; }
  .quick-form-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
}

@media (max-width: 760px) {
  .schedule-title-row, .schedule-card-head, .schedule-detail-heading, .subject-palette-head { flex-direction: column; align-items: stretch; }
  .schedule-save-state, .detail-live-hint { align-self: flex-start; }
  .schedule-tabs { width: 100%; }
  .schedule-tabs button { flex: 1 1 0; padding-inline: 6px; font-size: 13px; }
  .schedule-tools, .quick-actions { width: 100%; }
  .schedule-tools button, .quick-actions button { flex: 1 1 130px; }
  .half-day-summary-button { align-items: flex-start; }
  .half-day-grid { grid-template-columns: 1fr; }
  .subject-palette { padding: 11px; }
  .subject-group-grid { grid-template-columns: 1fr; grid-auto-rows: auto; }
  .subject-group { min-height: 0; }
  .subject-tools { grid-template-columns: repeat(3,minmax(0,1fr)); grid-auto-rows: 44px; }
  .subject-tool { cursor: pointer; }
  .subject-tool.clear-tool { width: 100%; min-width: 0; }
  .mobile-period-list, .quick-form-grid { grid-template-columns: 1fr; }
  .mobile-period-card { min-height: 82px; }
  .schedule-detail-grid, .time-setting-row { grid-template-columns: 1fr; }
  .message-field, .delete-period-button { grid-column: auto; }
  .period-order-buttons { grid-template-columns: 1fr 1fr; }
  .quick-preview-grid { grid-template-columns: 1fr; }
  .preview-controls { align-items: stretch; }
  .preview-controls label { width: 100%; min-width: 0; }
  .preview-status-title { flex-direction: column; gap: 4px; }
  .preview-status-badges { width: 100%; }
  .preview-status-badges strong, .preview-status-badges span { width: 100%; border-radius: 14px; }
}


/* ✅ HUA_SCHEDULE_IOS_TIME_FIT_STYLE_20260712 */
.time-setting-row,
.time-setting-row > *,
.time-setting-row label,
.quick-form-grid,
.quick-form-grid > *,
.quick-form-grid label,
.preview-controls,
.preview-controls label {
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

.schedule-time-input {
  display: block;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
  font-variant-numeric: tabular-nums;
}

.schedule-time-input::-webkit-date-and-time-value {
  min-width: 0;
  text-align: center;
}

@media (max-width: 760px) {
  .time-setting-row,
  .quick-form-grid,
  .preview-controls {
    width: 100%;
    overflow: hidden;
  }

  .time-setting-row label,
  .quick-form-grid label,
  .preview-controls label {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .schedule-time-input {
    min-height: 52px;
    padding: 10px 12px;
    font-size: 16px;
    -webkit-appearance: none;
    appearance: none;
  }
}
</style>

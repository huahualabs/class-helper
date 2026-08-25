<script setup>
// ✅ HUA_STATUS_TIME_INPUT_MOBILE_FIT_20260712：現在狀態測試時間欄在手機 Safari 不再爆框。
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { SCHEDULE_SOURCE_MODE, SCHEDULE_SOURCE_MODES, SHARED_CLASS_ID } from '../config/sharedClassSchedule'
import { classScheduleRepository } from '../services/classScheduleRepository'
import { waitForCentralPortalSession } from '../services/centralPortalFirebase'

const STORAGE_KEY = 'classHelperWeeklyScheduleV1'
const router = useRouter()

const days = [
  { key: 'mon', dayIndex: 1, label: '週一' },
  { key: 'tue', dayIndex: 2, label: '週二' },
  { key: 'wed', dayIndex: 3, label: '週三' },
  { key: 'thu', dayIndex: 4, label: '週四' },
  { key: 'fri', dayIndex: 5, label: '週五' }
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

const validKinds = new Set(['morning', 'class', 'recess', 'cleaning', 'lunch', 'assembly', 'other'])
const kindDefaults = {
  morning: { subject: '早修', icon: '🌞', message: '請安靜進教室，完成早修任務與作業繳交。' },
  class: { subject: '', icon: '📖', message: '' },
  recess: { subject: '下課時間', icon: '🔔', message: '請完成喝水、上廁所與下節課準備。' },
  cleaning: { subject: '打掃', icon: '🧹', message: '請到自己的打掃區，完成整理後請幹部檢查。' },
  lunch: { subject: '午餐／午休', icon: '🌙', message: '用餐後整理座位，午休時間保持安靜。' },
  assembly: { subject: '集合時間', icon: '📣', message: '請依老師指示安靜集合。' },
  other: { subject: '', icon: '🌿', message: '' }
}


const subjectIconMap = {
  國語: '📖',
  數學: '🔢',
  社會: '🌏',
  自然: '🔬',
  本土語: '🗣️',
  綜合: '🧩',
  生活: '🌱',
  健康: '💚',
  體育: '🏃',
  資訊: '💻',
  音樂: '🎵',
  美勞: '🎨',
  英語: '🔤',
  彈性: '🌿',
  校本課程: '🏫'
}

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
    const kind = validKinds.has(period?.kind) ? period.kind : 'other'
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

  const validIds = new Set(periods.map(period => period.id))
  const halfDayCutoffs = {}
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
    console.warn('課表資料讀取失敗，已使用預設作息。', error)
    return makeDefaultData()
  }
}

const now = ref(new Date())
const isCentralScheduleMode = SCHEDULE_SOURCE_MODE === SCHEDULE_SOURCE_MODES.CENTRAL
const scheduleData = ref(isCentralScheduleMode ? makeDefaultData() : loadSchedule())
const customNow = ref('')
const customDay = ref('')
const showTestTools = ref(false)
let timer = null

async function refreshSchedule() {
  if (!isCentralScheduleMode) {
    scheduleData.value = loadSchedule()
    return
  }
  try {
    const user = await waitForCentralPortalSession()
    if (!user) return
    const loaded = await classScheduleRepository.loadClassSchedule(SHARED_CLASS_ID)
    scheduleData.value = normalizeData(loaded || makeDefaultData())
  } catch (error) {
    if (import.meta.env.DEV) console.error('[class-helper status] shared schedule load failed', error)
  }
}

function handleVisibilityChange() {
  if (!document.hidden) refreshSchedule()
}

onMounted(() => {
  timer = window.setInterval(() => { now.value = new Date() }, 1000)
  refreshSchedule()
  window.addEventListener('storage', refreshSchedule)
  window.addEventListener('focus', refreshSchedule)
  window.addEventListener('class-helper-schedule-updated', refreshSchedule)
  window.addEventListener('class-helper-central-schedule-updated', refreshSchedule)
  document.addEventListener('visibilitychange', handleVisibilityChange)
})

onUnmounted(() => {
  window.clearInterval(timer)
  window.removeEventListener('storage', refreshSchedule)
  window.removeEventListener('focus', refreshSchedule)
  window.removeEventListener('class-helper-schedule-updated', refreshSchedule)
  window.removeEventListener('class-helper-central-schedule-updated', refreshSchedule)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

const timeSource = computed(() => {
  if (customNow.value) return toMinutes(customNow.value)
  return now.value.getHours() * 60 + now.value.getMinutes()
})

const displayTimeText = computed(() => {
  if (customNow.value) return `${customNow.value}:00`
  return now.value.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
})

const activeDayIndex = computed(() => customDay.value ? Number(customDay.value) : now.value.getDay())
const activeDay = computed(() => days.find(day => day.dayIndex === activeDayIndex.value) || null)
const activeDayLabel = computed(() => activeDay.value?.label || (activeDayIndex.value === 0 ? '週日' : '週六'))
const activeDayIsHalfDay = computed(() => Boolean(activeDay.value && scheduleData.value.halfDayCutoffs?.[activeDay.value.key]))

function visiblePeriodsForDay(dayKey) {
  const periods = scheduleData.value.periods || []
  const cutoffId = scheduleData.value.halfDayCutoffs?.[dayKey]
  if (!cutoffId) return periods
  const cutoffIndex = periods.findIndex(period => period.id === cutoffId)
  if (cutoffIndex < 0) return periods
  return periods.slice(0, cutoffIndex + 1)
}

const activePeriods = computed(() => {
  if (!activeDay.value) return []
  return [...visiblePeriodsForDay(activeDay.value.key)].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
})

const currentStatus = computed(() => {
  if (!activeDay.value) {
    return {
      mode: 'weekend', kind: 'other', icon: '🌿', title: '非平日課表', periodLabel: '週末',
      message: '今天沒有套用週一至週五課表，請看老師指示。', minutesLeft: null, next: null
    }
  }

  const periods = activePeriods.value
  const minute = timeSource.value
  const dayEntries = scheduleData.value.weekdays[activeDay.value.key] || {}

  if (!periods.length) {
    return {
      mode: 'after', kind: 'other', icon: '🌿', title: '尚未設定作息', periodLabel: activeDay.value.label,
      message: '請到「課表與作息」新增今天要使用的時段。', minutesLeft: null, next: null
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
      periodLabel: `${activeDay.value.label}課表尚未開始`,
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

  return {
    mode: 'after', kind: 'dismissal', icon: '🎒', title: '放學時間',
    periodLabel: `${activeDay.value.label}${activeDayIsHalfDay.value ? '半天課' : '課表'}已結束`,
    message: `${activeDayIsHalfDay.value ? '今天是半天課，' : ''}整理書包、桌面與抽屜，依老師指示準備放學。`,
    minutesLeft: null, next: null
  }
})

const isTransitionWarning = computed(() => {
  return ['gap', 'before'].includes(currentStatus.value.mode)
    && currentStatus.value.minutesLeft !== null
    && currentStatus.value.minutesLeft <= 2
})

const statusRules = computed(() => {
  if (isTransitionWarning.value) {
    return ['結束喝水與上廁所', '拿出下節課用品', '安靜回到座位', '等待老師開始上課']
  }

  const rules = {
    morning: ['安靜進教室', '繳交作業與聯絡簿', '完成早修任務', '準備今天的學習'],
    class: ['專心聽講', '發言前先舉手', '備妥課本用品', '尊重正在說話的人'],
    recess: ['收拾桌面', '椅子靠好', '上廁所與裝水', '活動時注意安全'],
    cleaning: ['拿取掃具', '完成負責區域', '掃具正確歸位', '請幹部完成檢查'],
    lunch: ['安靜用餐', '整理桌面與餐具', '完成午間工作', '午休保持安靜'],
    assembly: ['安靜整隊', '依序前往', '專心聆聽', '遵守集合秩序'],
    dismissal: ['整理書包', '檢查抽屜與地面', '椅子靠好', '依路隊安靜離開'],
    other: ['看老師指示', '保持安靜', '完成手邊任務', '準備下一個活動']
  }

  return rules[currentStatus.value.kind] || rules.other
})


function entryDisplayIcon(entry, kind) {
  const subject = entry?.subject?.trim()
  const presetIcon = subjectIconMap[subject]
  if (kind === 'class' && presetIcon && (!entry?.icon?.trim() || entry.icon.trim() === '📖')) return presetIcon
  return entry?.icon?.trim() || defaultIcon(kind)
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

function toMinutes(time) {
  const [hour, minute] = String(time || '00:00').split(':').map(Number)
  return hour * 60 + minute
}

function resetTestTime() {
  customNow.value = ''
  customDay.value = ''
}

function openFullscreen() {
  document.documentElement.requestFullscreen?.()
}
</script>

<template>
  <div class="page wide-page linked-status-page">
    <div class="page-title-row linked-status-title-row">
      <div>
        <h2>🔔 現在狀態</h2>
        <p>{{ activeDayLabel }}<span v-if="activeDayIsHalfDay">・半天課</span>・依「課表與作息」自動切換</p>
      </div>
      <div class="linked-status-actions">
        <button type="button" class="status-soft-button" @click="router.push('/schedule')">📅 課表設定</button>
        <button type="button" class="status-soft-button" :class="{ active: showTestTools }" @click="showTestTools = !showTestTools">🧪 測試</button>
        <button type="button" @click="openFullscreen">全螢幕</button>
      </div>
    </div>

    <section v-if="showTestTools" class="status-test-panel card compact-card">
      <label>
        <span>測試星期</span>
        <select v-model="customDay">
          <option value="">今天</option>
          <option v-for="day in days" :key="day.key" :value="String(day.dayIndex)">{{ day.label }}</option>
        </select>
      </label>
      <label>
        <span>測試時間</span>
        <input v-model="customNow" type="time" />
      </label>
      <button type="button" class="status-soft-button" @click="resetTestTime">恢復現在時間</button>
    </section>

    <section class="linked-status-hero card" :class="{ warning: isTransitionWarning }">
      <div class="linked-status-clock">
        <span>現在時間</span>
        <strong>{{ displayTimeText }}</strong>
      </div>

      <div class="linked-status-main">
        <span class="linked-status-icon" aria-hidden="true">{{ currentStatus.icon }}</span>
        <div>
          <small>{{ currentStatus.periodLabel }}</small>
          <h1>{{ currentStatus.title }}</h1>
        </div>
      </div>

      <p class="linked-status-message">{{ currentStatus.message }}</p>

      <div class="status-info-row">
        <strong v-if="currentStatus.minutesLeft !== null" class="minutes-left-badge">
          剩下 {{ currentStatus.minutesLeft }} 分鐘
        </strong>
        <span v-if="currentStatus.next && currentStatus.mode === 'active'" class="next-period-badge">
          下一個：{{ currentStatus.next.icon }} {{ currentStatus.next.title }}・{{ currentStatus.next.start }}
        </span>
      </div>

      <div class="linked-rule-grid">
        <span v-for="rule in statusRules" :key="rule">{{ rule }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.linked-status-page {
  height: calc(100dvh - 56px);
  min-height: 620px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.linked-status-title-row {
  flex: 0 0 auto;
  align-items: center;
  margin-bottom: 0;
}

.linked-status-title-row p {
  margin-top: 4px;
}

.linked-status-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.status-soft-button {
  background: #f3faf6;
  color: #2f6f57;
  border: 1px solid #cfe9dd;
}

.status-soft-button.active {
  background: #dff3ea;
}

.status-test-panel {
  flex: 0 0 auto;
  display: flex;
  align-items: end;
  gap: 10px;
  margin-top: 0;
}

.status-test-panel label {
  display: grid;
  gap: 5px;
  color: #53665d;
  font-weight: 900;
}

.status-test-panel input,
.status-test-panel select {
  min-width: 150px;
  border: 2px solid #dceee6;
  border-radius: 13px;
  padding: 9px 11px;
  background: white;
  font: inherit;
}

.linked-status-hero {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 0;
  padding: clamp(18px, 2.4vw, 30px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: clamp(10px, 1.5vh, 16px);
  text-align: center;
  overflow: hidden;
  background: linear-gradient(135deg, #ffffff 0%, #f5fbf8 58%, #fffaf2 100%);
}

.linked-status-hero.warning {
  background: linear-gradient(135deg, #fff8e8 0%, #fff0ed 100%);
  animation: linkedStatusPulse 1s ease-in-out infinite alternate;
}

@keyframes linkedStatusPulse {
  from { box-shadow: 0 8px 24px rgba(0, 0, 0, .08); }
  to { box-shadow: 0 10px 34px rgba(230, 137, 126, .24); }
}

.linked-status-clock {
  display: grid;
  justify-items: center;
  gap: 2px;
  color: #6d7b73;
  font-weight: 900;
  letter-spacing: .08em;
}

.linked-status-clock strong {
  color: #2f6f57;
  font-size: clamp(2.9rem, 6.4vw, 5rem);
  line-height: 1;
  letter-spacing: .03em;
  font-variant-numeric: tabular-nums;
}

.linked-status-main {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}

.linked-status-icon {
  font-size: clamp(3.4rem, 7vw, 6.2rem);
  line-height: 1;
}

.linked-status-main small {
  display: block;
  margin-bottom: 4px;
  color: #6b7a70;
  font-size: clamp(.9rem, 1.4vw, 1.1rem);
  font-weight: 900;
}

.linked-status-main h1 {
  margin: 0;
  color: #2f6f57;
  font-size: clamp(2.4rem, 5.8vw, 5.2rem);
  line-height: 1.05;
  font-weight: 950;
}

.linked-status-message {
  max-width: 900px;
  margin: 0;
  color: #34495a;
  font-size: clamp(1.15rem, 2.2vw, 1.8rem);
  line-height: 1.5;
  font-weight: 900;
}

.status-info-row {
  min-height: 46px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}

.minutes-left-badge,
.next-period-badge {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: 8px 15px;
  border-radius: 999px;
  font-weight: 950;
}

.minutes-left-badge {
  background: #fff0c2;
  color: #805716;
  font-size: clamp(1.05rem, 1.8vw, 1.35rem);
}

.next-period-badge {
  background: #edf8f2;
  color: #2f6f57;
  font-size: clamp(.9rem, 1.35vw, 1.05rem);
}

.linked-rule-grid {
  width: min(100%, 900px);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.linked-rule-grid span {
  min-height: 58px;
  display: grid;
  place-items: center;
  padding: 9px 12px;
  border-radius: 17px;
  background: rgba(255, 255, 255, .82);
  color: #34495a;
  box-shadow: 0 5px 18px rgba(36, 59, 83, .07);
  font-size: clamp(1rem, 1.5vw, 1.25rem);
  line-height: 1.25;
  font-weight: 950;
}

@media (max-height: 760px) and (min-width: 901px) {
  .linked-status-page {
    min-height: 560px;
    gap: 8px;
  }

  .linked-status-hero {
    gap: 8px;
    padding-block: 14px;
  }

  .linked-status-clock strong {
    font-size: clamp(2.5rem, 5.2vw, 3.8rem);
  }

  .linked-status-main h1 {
    font-size: clamp(2rem, 4.6vw, 3.8rem);
  }

  .linked-status-icon {
    font-size: clamp(3rem, 5.5vw, 4.6rem);
  }

  .linked-status-message {
    font-size: clamp(1rem, 1.7vw, 1.35rem);
  }

  .linked-rule-grid span {
    min-height: 48px;
  }
}

@media (max-width: 900px) {
  .linked-status-page {
    height: auto;
    min-height: 0;
    overflow: visible;
  }

  .linked-status-title-row {
    align-items: stretch;
  }

  .linked-status-actions {
    justify-content: flex-start;
  }

  .linked-status-hero {
    min-height: 520px;
  }

  .linked-rule-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .linked-status-actions,
  .status-test-panel {
    width: 100%;
  }

  .linked-status-actions button {
    flex: 1 1 120px;
  }

  .status-test-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .status-test-panel input,
  .status-test-panel select {
    width: 100%;
  }

  .linked-status-hero {
    min-height: 0;
    padding: 22px 14px;
    overflow: visible;
  }

  .linked-status-main {
    flex-direction: column;
    gap: 6px;
  }

  .linked-status-clock strong {
    font-size: clamp(2.7rem, 14vw, 4rem);
  }

  .linked-status-icon {
    font-size: clamp(3.3rem, 18vw, 5rem);
  }

  .linked-status-main h1 {
    font-size: clamp(2.2rem, 12vw, 3.6rem);
  }

  .linked-status-message {
    font-size: clamp(1.05rem, 5vw, 1.35rem);
  }

  .status-info-row {
    width: 100%;
  }

  .minutes-left-badge,
  .next-period-badge {
    width: 100%;
    justify-content: center;
    border-radius: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .linked-status-hero.warning {
    animation: none;
  }
}


/* ✅ HUA_STATUS_TIME_INPUT_MOBILE_FIT_STYLE_20260712 */
.status-test-panel,
.status-test-panel label {
  min-width: 0;
}

.status-test-panel input[type="time"],
.status-test-panel select {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

@media (max-width: 760px) {
  .status-test-panel {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .status-test-panel input[type="time"],
  .status-test-panel select,
  .status-test-panel button {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }
}
</style>

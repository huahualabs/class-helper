<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import {
  CALENDAR_SOURCE_MODE,
  CALENDAR_SOURCE_MODES,
  SHARED_CLASS_ID,
} from '../config/sharedClassEvents'
import { OWNER_PARENT_PORTAL_ENABLED } from '../config/deploymentProfile'
import {
  signInCentralPortalTeacher,
  waitForCentralPortalSession,
} from '@owner-central-firebase'
import { classEventsRepository } from '@owner-class-events-repository'
import {
  composeClassEventTime,
  formatClassEventTime,
  parseClassEventTime,
  validateClassEventTimes,
} from '../utils/classEventTime'

const viewMode = ref(localStorage.getItem('calendarViewMode') || 'month')
const currentDate = ref(new Date())
const selectedDate = ref(toDateKey(new Date()))
const eventDraft = ref('')
const isCentralMode = CALENDAR_SOURCE_MODE === CALENDAR_SOURCE_MODES.CENTRAL
const savedEvents = ref(isCentralMode ? {} : loadEvents())
const centralEvents = ref([])
const loading = ref(isCentralMode)
const signingIn = ref(false)
const saving = ref(false)
const authRequired = ref(false)
const permissionDenied = ref(false)
const loadFailed = ref(false)
const saveMessage = ref('')
const editingEventId = ref('')
const editForm = ref(emptyEditForm())
const timeParts = ref(emptyTimeParts())
const timeRangeMessage = ref('')
const hourOptions = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'))
const standardMinuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

watch(viewMode, value => {
  localStorage.setItem('calendarViewMode', value)
})

if (!isCentralMode) {
  watch(savedEvents, value => {
    localStorage.setItem('classHelperCalendarEvents', JSON.stringify(value))
  }, { deep: true })
}

const weekLabelsMonth = ['日', '一', '二', '三', '四', '五', '六']
const weekLabelsWeek = ['一', '二', '三', '四', '五', '六', '日']

const fixedEvents = {
  '01-01': ['元旦'],
  '02-28': ['和平紀念日'],
  '04-04': ['兒童節'],
  '05-01': ['勞動節'],
  '09-28': ['教師節'],
  '10-10': ['國慶日'],
  '10-25': ['臺灣光復節'],
  '12-25': ['行憲紀念日']
}

const taiwan2026Events = {
  '2026-02-15': ['小年夜'],
  '2026-02-16': ['除夕'],
  '2026-02-17': ['春節 初一'],
  '2026-02-18': ['春節 初二'],
  '2026-02-19': ['春節 初三'],
  '2026-02-20': ['春節連假'],
  '2026-02-27': ['和平紀念日補假'],
  '2026-04-03': ['兒童節補假'],
  '2026-04-05': ['清明節'],
  '2026-04-06': ['清明節補假'],
  '2026-06-19': ['端午節'],
  '2026-09-25': ['中秋節'],
  '2026-10-09': ['國慶日補假'],
  '2026-10-26': ['光復節補假'],
  '2026-12-25': ['行憲紀念日']
}

const solarTerms2026 = {
  '2026-01-05': ['小寒'],
  '2026-01-20': ['大寒'],
  '2026-02-04': ['立春'],
  '2026-02-18': ['雨水'],
  '2026-03-05': ['驚蟄'],
  '2026-03-20': ['春分'],
  '2026-04-05': ['清明'],
  '2026-04-20': ['穀雨'],
  '2026-05-05': ['立夏'],
  '2026-05-21': ['小滿'],
  '2026-06-05': ['芒種'],
  '2026-06-21': ['夏至'],
  '2026-07-07': ['小暑'],
  '2026-07-23': ['大暑'],
  '2026-08-07': ['立秋'],
  '2026-08-23': ['處暑'],
  '2026-09-07': ['白露'],
  '2026-09-23': ['秋分'],
  '2026-10-08': ['寒露'],
  '2026-10-23': ['霜降'],
  '2026-11-07': ['立冬'],
  '2026-11-22': ['小雪'],
  '2026-12-07': ['大雪'],
  '2026-12-21': ['冬至']
}

const monthDays = computed(() => {
  const year = currentDate.value.getFullYear()
  const month = currentDate.value.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // 只顯示「有包含本月日期」的週，不再固定塞滿 6 排。
  // 例如 2026 年 7 月只會顯示 5 排，不會多出最下面整排 8 月。
  const start = new Date(firstDay)
  start.setDate(firstDay.getDate() - firstDay.getDay())

  const end = new Date(lastDay)
  end.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1

  return Array.from({ length: totalDays }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return createDayInfo(day, month)
  })
})

const weekDays = computed(() => {
  const base = new Date(currentDate.value)
  const day = base.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(base)
  monday.setDate(base.getDate() + diffToMonday)

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + index)
    return createDayInfo(date, date.getMonth())
  })
})

const titleText = computed(() => {
  if (viewMode.value === 'month') {
    const date = currentDate.value
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`
  }

  const start = weekDays.value[0].date
  const end = weekDays.value[6].date
  return `${formatMonthDay(start)}－${formatMonthDay(end)}`
})

const selectedDayInfo = computed(() => {
  const date = fromDateKey(selectedDate.value)
  return createDayInfo(date, date.getMonth())
})

const centralEventsByDate = computed(() => centralEvents.value.reduce((groups, event) => {
  if (typeof event?.date !== 'string') return groups
  if (!groups[event.date]) groups[event.date] = []
  groups[event.date].push(event)
  return groups
}, {}))

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem('classHelperCalendarEvents') || '{}')
  } catch {
    return {}
  }
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function weekName(date) {
  return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
}

function formatMonthDayWithWeek(date) {
  return `${date.getMonth() + 1}/${date.getDate()}（${weekName(date)}）`
}

function createDayInfo(date, currentMonth) {
  const key = toDateKey(date)
  const mmdd = key.slice(5)
  const builtIn = [
    ...(fixedEvents[mmdd] || []),
    ...(taiwan2026Events[key] || []),
    ...(solarTerms2026[key] || [])
  ]

  const custom = isCentralMode
    ? (centralEventsByDate.value[key] || [])
    : (savedEvents.value[key] || []).map((title, index) => ({
        eventId: `legacy-${key}-${index}`,
        title,
        date: key,
        legacyIndex: index,
        published: false,
      }))

  return {
    date,
    key,
    dayNumber: date.getDate(),
    isToday: key === toDateKey(new Date()),
    isSelected: key === selectedDate.value,
    isCurrentMonth: date.getMonth() === currentMonth,
    isSunday: date.getDay() === 0,
    isSaturday: date.getDay() === 6,
    builtIn,
    custom,
    allEvents: [...builtIn, ...custom.map(event => event.title)]
  }
}

function previousPeriod() {
  const next = new Date(currentDate.value)
  if (viewMode.value === 'month') next.setMonth(next.getMonth() - 1)
  else next.setDate(next.getDate() - 7)
  currentDate.value = next
}

function nextPeriod() {
  const next = new Date(currentDate.value)
  if (viewMode.value === 'month') next.setMonth(next.getMonth() + 1)
  else next.setDate(next.getDate() + 7)
  currentDate.value = next
}

function goToday() {
  const today = new Date()
  currentDate.value = today
  selectedDate.value = toDateKey(today)
}

function selectDate(day) {
  selectedDate.value = day.key
  currentDate.value = new Date(day.date)
}

function emptyEditForm() {
  return {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    category: '',
    location: '',
    description: '',
    published: false,
  }
}

function emptyTimeParts() {
  return {
    startTime: { hour: '', minute: '' },
    endTime: { hour: '', minute: '' },
  }
}

function logDiagnostic(context, error) {
  if (import.meta.env.DEV) console.error(`[central classEvents] ${context}`, error)
}

function isPermissionError(error) {
  return error?.code === 'permission-denied'
    || String(error?.message || '').includes('沒有此班級的教師權限')
}

function resetCentralStatus() {
  authRequired.value = false
  permissionDenied.value = false
  loadFailed.value = false
}

async function refreshCentralEvents() {
  const user = await waitForCentralPortalSession()
  if (!user) {
    centralEvents.value = []
    authRequired.value = true
    return false
  }

  await classEventsRepository.verifyTeacherAccess(SHARED_CLASS_ID)
  centralEvents.value = await classEventsRepository.listClassEvents(SHARED_CLASS_ID)
  return true
}

async function initializeCentralCalendar() {
  if (!isCentralMode) return
  loading.value = true
  resetCentralStatus()
  try {
    await refreshCentralEvents()
  } catch (error) {
    if (isPermissionError(error)) permissionDenied.value = true
    else loadFailed.value = true
    logDiagnostic('load failed', error)
  } finally {
    loading.value = false
  }
}

async function loginCentralTeacher() {
  // Start the popup synchronously from the click event for Safari compatibility.
  signingIn.value = true
  resetCentralStatus()
  try {
    const signInAttempt = signInCentralPortalTeacher()
    await signInAttempt
    loading.value = true
    await refreshCentralEvents()
  } catch (error) {
    if (isPermissionError(error)) permissionDenied.value = true
    else loadFailed.value = true
    logDiagnostic('sign in failed', error)
  } finally {
    signingIn.value = false
    loading.value = false
  }
}

async function runCentralSave(action, context) {
  saving.value = true
  saveMessage.value = ''
  try {
    await action()
    await refreshCentralEvents()
    return true
  } catch (error) {
    saveMessage.value = '儲存失敗，請稍後再試。'
    if (isPermissionError(error)) permissionDenied.value = true
    logDiagnostic(context, error)
    return false
  } finally {
    saving.value = false
  }
}

async function addEvent() {
  const text = eventDraft.value.trim()
  if (!text) return

  const key = selectedDate.value
  if (!isCentralMode) {
    if (!savedEvents.value[key]) savedEvents.value[key] = []
    savedEvents.value[key].push(text)
    eventDraft.value = ''
    return
  }

  const saved = await runCentralSave(
    () => classEventsRepository.createClassEvent(SHARED_CLASS_ID, { title: text, date: key }),
    'create failed',
  )
  if (saved) eventDraft.value = ''
}

function startEdit(event) {
  editingEventId.value = event.eventId
  editForm.value = {
    ...emptyEditForm(),
    ...Object.fromEntries(
      Object.keys(emptyEditForm()).map(field => [field, event[field] ?? emptyEditForm()[field]]),
    ),
  }
  timeParts.value = emptyTimeParts()
  hydrateTimeParts('startTime', event.startTime)
  hydrateTimeParts('endTime', event.endTime)
  resetTimeValidation()
}

function cancelEdit() {
  editingEventId.value = ''
  editForm.value = emptyEditForm()
  timeParts.value = emptyTimeParts()
  resetTimeValidation()
}

async function saveEdit() {
  if (!editingEventId.value || !editForm.value.title.trim() || !editForm.value.date) return
  const timeValidation = validateClassEventTimes(editForm.value.startTime, editForm.value.endTime)
  if (!timeValidation.valid) {
    timeRangeMessage.value = timeValidation.message
    return
  }
  const eventId = editingEventId.value
  const payload = {
    ...editForm.value,
    title: editForm.value.title.trim(),
    startTime: timeValidation.startTime,
    endTime: timeValidation.endTime,
  }
  const saved = await runCentralSave(
    () => classEventsRepository.updateClassEvent(eventId, payload),
    'update failed',
  )
  if (saved) {
    selectedDate.value = payload.date
    cancelEdit()
  }
}

function resetTimeValidation() {
  timeRangeMessage.value = ''
}

function updateTimeRangeMessage() {
  const validation = validateClassEventTimes(editForm.value.startTime, editForm.value.endTime)
  timeRangeMessage.value = validation.valid ? '' : validation.message
}

function hydrateTimeParts(field, value) {
  const parsed = parseClassEventTime(value)
  if (!parsed) {
    editForm.value[field] = ''
    return
  }
  timeParts.value[field] = { ...parsed }
  editForm.value[field] = value
}

function minuteOptionsFor(field) {
  const existingMinute = timeParts.value[field].minute
  return [...new Set([...standardMinuteOptions, existingMinute].filter(Boolean))].sort()
}

function updateTimePart(field, part, value) {
  if (value === '') {
    timeParts.value[field] = { hour: '', minute: '' }
    editForm.value[field] = ''
    updateTimeRangeMessage()
    return
  }

  timeParts.value[field][part] = value
  if (!timeParts.value[field].hour) timeParts.value[field].hour = '00'
  if (!timeParts.value[field].minute) timeParts.value[field].minute = '00'
  editForm.value[field] = composeClassEventTime(
    timeParts.value[field].hour,
    timeParts.value[field].minute,
  )
  updateTimeRangeMessage()
}

async function togglePublished(event) {
  await runCentralSave(
    () => classEventsRepository.updateClassEvent(event.eventId, { published: !event.published }),
    event.published ? 'unpublish failed' : 'publish failed',
  )
}

async function removeEvent(event) {
  if (!window.confirm(`確定刪除「${event.title}」嗎？`)) return

  if (!isCentralMode) {
    const key = event.date
    savedEvents.value[key].splice(event.legacyIndex, 1)
    if (savedEvents.value[key].length === 0) delete savedEvents.value[key]
    return
  }

  const deleted = await runCentralSave(
    () => classEventsRepository.deleteClassEvent(event.eventId),
    'delete failed',
  )
  if (deleted && editingEventId.value === event.eventId) cancelEdit()
}

function eventTimeLabel(event) {
  if (!event.startTime && !event.endTime) return ''
  return [event.startTime, event.endTime]
    .filter(Boolean)
    .map(time => formatClassEventTime(time))
    .join('–')
}

onMounted(initializeCentralCalendar)
</script>

<template>
  <div class="page calendar-page">
    <header class="calendar-header">
      <div>
        <h2>🗓️ 行事曆</h2>
        <p>月曆從週日開始，週曆從週一開始。節日、節氣與自訂事項會一起顯示。</p>
        <p class="source-mode" data-testid="calendar-source-mode">
          {{ isCentralMode ? `中央共享行事曆 · ${SHARED_CLASS_ID}` : '本機行事曆' }}
        </p>
      </div>

      <div class="mode-switch">
        <button :class="{ active: viewMode === 'month' }" @click="viewMode = 'month'">月</button>
        <button :class="{ active: viewMode === 'week' }" @click="viewMode = 'week'">週</button>
      </div>
    </header>

    <section class="calendar-shell" :class="viewMode">
      <main class="calendar-main">
        <div class="calendar-toolbar">
          <button @click="previousPeriod">←</button>
          <strong>{{ titleText }}</strong>
          <button @click="nextPeriod">→</button>
          <button class="today-btn" @click="goToday">今天</button>
        </div>

        <div v-if="viewMode === 'month'" class="month-view">
          <div
            class="weekday"
            :class="{ sunday: index === 0, saturday: index === 6 }"
            v-for="(label, index) in weekLabelsMonth"
            :key="label"
          >
            {{ label }}
          </div>

          <button
            v-for="day in monthDays"
            :key="day.key"
            class="day-cell"
            :class="{
              muted: !day.isCurrentMonth,
              today: day.isToday,
              selected: day.isSelected,
              hasEvent: day.allEvents.length,
              sunday: day.isSunday,
              saturday: day.isSaturday
            }"
            @click="selectDate(day)"
          >
            <span class="day-number">{{ day.dayNumber }}</span>

            <div class="event-list">
              <span
                v-for="event in day.allEvents.slice(0, 2)"
                :key="event"
                class="event-pill"
              >
                {{ event }}
              </span>

              <span v-if="day.allEvents.length > 2" class="more-pill">
                +{{ day.allEvents.length - 2 }}
              </span>
            </div>
          </button>
        </div>

        <!-- ✅ HUA_MOBILE_WEEK_SCROLL_ONLY_20260710：手機僅週曆卡片區可左右滑動，頁面本身不橫向滑。 -->
        <div v-else class="week-scroll-area" aria-label="週行事曆，可左右滑動查看七天">
          <div class="week-view">
          <button
            v-for="(day, index) in weekDays"
            :key="day.key"
            class="week-day"
            :class="{
              today: day.isToday,
              selected: day.isSelected,
              sunday: day.isSunday,
              saturday: day.isSaturday
            }"
            @click="selectDate(day)"
          >
            <h3>{{ formatMonthDayWithWeek(day.date) }}</h3>

            <div class="week-events">
              <span
                v-for="event in day.allEvents"
                :key="event"
                class="event-pill"
              >
                {{ event }}
              </span>

              <span v-if="day.allEvents.length === 0" class="empty-text">
                尚無事項
              </span>
            </div>
          </button>
          </div>
        </div>
      </main>

      <aside class="detail-panel">
        <h3>📌 {{ selectedDate }}</h3>

        <div v-if="isCentralMode && loading" class="state-box" data-testid="calendar-loading">
          正在載入共享行事曆…
        </div>

        <div v-else-if="isCentralMode && authRequired" class="state-box" data-testid="calendar-auth-required">
          <p>請先登入中央班級平台教師帳號，才能管理共享行事曆。</p>
          <button :disabled="signingIn" @click="loginCentralTeacher">
            {{ signingIn ? '登入中…' : '教師登入' }}
          </button>
        </div>

        <div v-else-if="isCentralMode && permissionDenied" class="state-box error" data-testid="calendar-permission-denied">
          <p>目前帳號沒有 {{ SHARED_CLASS_ID }} 的教師權限。</p>
          <button :disabled="signingIn" @click="loginCentralTeacher">重新登入教師帳號</button>
        </div>

        <div v-else-if="isCentralMode && loadFailed" class="state-box error" data-testid="calendar-load-failed">
          <p>暫時無法載入共享行事曆，請稍後再試。</p>
          <button @click="initializeCentralCalendar">重新載入</button>
        </div>

        <div v-if="selectedDayInfo.builtIn.length" class="built-in-box">
          <h4>節日／節氣</h4>
          <p v-for="event in selectedDayInfo.builtIn" :key="event">🌼 {{ event }}</p>
        </div>

        <div
          v-if="!isCentralMode || (!loading && !authRequired && !permissionDenied && !loadFailed)"
          class="custom-box"
        >
          <h4>手動事項</h4>

          <p v-if="!isCentralMode && OWNER_PARENT_PORTAL_ENABLED" class="rollback-note">
            目前使用保留的本機 rollback 資料；不會與中央行事曆合併或雙寫。
          </p>

          <p v-if="saveMessage" class="save-error" data-testid="calendar-save-failed">
            {{ saveMessage }}
          </p>

          <div
            v-for="event in selectedDayInfo.custom"
            :key="event.eventId"
            class="custom-event"
            :data-event-id="event.eventId"
          >
            <div class="event-summary">
              <strong>{{ event.title }}</strong>
              <small v-if="eventTimeLabel(event)">{{ eventTimeLabel(event) }}</small>
              <span v-if="isCentralMode" class="status-chip" :class="{ published: event.published }">
                {{ event.published ? '已發布' : '草稿' }}
              </span>
            </div>
            <div class="event-actions">
              <button v-if="isCentralMode" class="neutral" @click="startEdit(event)">編輯</button>
              <button
                v-if="isCentralMode"
                class="publish"
                :disabled="saving"
                @click="togglePublished(event)"
              >
                {{ event.published ? '取消發布' : '發布' }}
              </button>
              <button :disabled="saving" @click="removeEvent(event)">刪除</button>
            </div>
          </div>

          <p v-if="selectedDayInfo.custom.length === 0" class="empty-text">
            這天還沒有自訂事項。
          </p>

          <div class="add-row">
            <input
              v-model="eventDraft"
              placeholder="例如：校外教學、數學考試、交回條"
              @keyup.enter="addEvent"
            />
            <button :disabled="saving" data-testid="calendar-create" @click="addEvent">
              {{ saving ? '儲存中…' : '新增草稿' }}
            </button>
          </div>

          <form
            v-if="isCentralMode && editingEventId"
            class="edit-form"
            data-testid="calendar-edit-form"
            @submit.prevent="saveEdit"
          >
            <h4>編輯事件</h4>
            <label>標題<input v-model="editForm.title" required /></label>
            <div class="datetime-card" data-testid="calendar-datetime-card">
              <label class="date-row">
                <span>日期</span>
                <input v-model="editForm.date" type="date" required />
              </label>
              <div class="time-fields-row">
                <div class="compact-time-group" data-testid="calendar-start-group">
                  <strong>開始</strong>
                  <select
                    :value="timeParts.startTime.hour"
                    aria-label="開始時間 小時"
                    data-testid="calendar-start-hour"
                    @change="updateTimePart('startTime', 'hour', $event.currentTarget.value)"
                  >
                    <option value="">未設定</option>
                    <option v-for="hour in hourOptions" :key="hour" :value="hour">{{ hour }}</option>
                  </select>
                  <span>時</span>
                  <select
                    :value="timeParts.startTime.minute"
                    aria-label="開始時間 分鐘"
                    data-testid="calendar-start-minute"
                    @change="updateTimePart('startTime', 'minute', $event.currentTarget.value)"
                  >
                    <option value="">未設定</option>
                    <option v-for="minute in minuteOptionsFor('startTime')" :key="minute" :value="minute">{{ minute }}</option>
                  </select>
                  <span>分</span>
                </div>
                <div class="compact-time-group" data-testid="calendar-end-group">
                  <strong>結束</strong>
                  <select
                    :value="timeParts.endTime.hour"
                    aria-label="結束時間 小時"
                    data-testid="calendar-end-hour"
                    @change="updateTimePart('endTime', 'hour', $event.currentTarget.value)"
                  >
                    <option value="">未設定</option>
                    <option v-for="hour in hourOptions" :key="hour" :value="hour">{{ hour }}</option>
                  </select>
                  <span>時</span>
                  <select
                    :value="timeParts.endTime.minute"
                    aria-label="結束時間 分鐘"
                    data-testid="calendar-end-minute"
                    @change="updateTimePart('endTime', 'minute', $event.currentTarget.value)"
                  >
                    <option value="">未設定</option>
                    <option v-for="minute in minuteOptionsFor('endTime')" :key="minute" :value="minute">{{ minute }}</option>
                  </select>
                  <span>分</span>
                </div>
              </div>
            </div>
            <p v-if="timeRangeMessage" class="field-error" data-testid="calendar-time-error">
              {{ timeRangeMessage }}
            </p>
            <label>分類<input v-model="editForm.category" /></label>
            <label>地點<input v-model="editForm.location" /></label>
            <label>說明<textarea v-model="editForm.description" rows="3"></textarea></label>
            <label class="publish-check">
              <input v-model="editForm.published" type="checkbox" /> 已發布（家長平台未來可見）
            </label>
            <div class="form-actions">
              <button type="button" class="neutral" @click="cancelEdit">取消</button>
              <button type="submit" :disabled="saving">{{ saving ? '儲存中…' : '儲存' }}</button>
            </div>
          </form>
        </div>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.calendar-page {
  max-width: none;
  margin: 0;
}

.calendar-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: start;
  margin-bottom: 12px;
}

.calendar-header h2 {
  margin: 0 0 4px;
}

.calendar-header p {
  color: #5b6472;
  margin: 0;
}

.calendar-header .source-mode {
  display: inline-block;
  margin-top: 8px;
  padding: 4px 9px;
  border-radius: 999px;
  background: #e8f4ee;
  color: #2f6f57;
  font-size: 12px;
  font-weight: 850;
}

.mode-switch {
  display: flex;
  gap: 8px;
  background: white;
  padding: 8px;
  border-radius: 18px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .06);
}

.mode-switch button,
.calendar-toolbar button,
.add-row button {
  border: none;
  border-radius: 14px;
  padding: 10px 16px;
  font-weight: 900;
  cursor: pointer;
}

.mode-switch button {
  background: #f2f4f7;
  color: #345;
}

.mode-switch button.active,
.today-btn {
  background: #6bbf95;
  color: white;
}

.calendar-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(440px, 500px);
  gap: 14px;
  align-items: start;
}

/* 週檢視需要完整 7 欄，所以讓編輯面板移到下方，避免週日被擠出去。 */
.calendar-shell.week {
  grid-template-columns: 1fr;
}

.calendar-shell.week .detail-panel {
  max-width: none;
}

.calendar-main,
.detail-panel {
  background: white;
  border-radius: 24px;
  padding: 14px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .08);
}

.calendar-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.calendar-toolbar strong {
  font-size: 24px;
  margin-right: auto;
}

.calendar-toolbar button {
  background: #f4fbf7;
  color: #2f6f57;
}

.calendar-shell.month .calendar-main {
  min-height: calc(100vh - 170px);
  display: flex;
  flex-direction: column;
}

.month-view {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: 30px;
  grid-auto-rows: minmax(96px, 1fr);
  gap: 8px;
  flex: 1;
}

.weekday {
  text-align: center;
  font-weight: 900;
  color: #4e7c68;
  padding: 4px;
}

.weekday.sunday {
  color: #e85b5b;
}

.weekday.saturday {
  color: #3b82f6;
}

.day-cell {
  min-height: 96px;
  height: auto;
  border: 2px solid #edf1f5;
  background: #ffffff;
  color: #1f2937;
  border-radius: 13px;
  padding: 6px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 3px;
  overflow: hidden;
}

.day-cell.muted {
  opacity: 1;
  background: #f4f6f8;
}

.day-cell.muted .day-number {
  color: #9aa3af;
}

.day-cell.sunday {
  background: #fff1f2;
  border-color: #ffd6dc;
}

.day-cell.saturday {
  background: #eff6ff;
  border-color: #cfe3ff;
}

.day-cell.today {
  background: #ecfdf3;
  border-color: #30a46c;
  box-shadow: inset 0 0 0 2px #30a46c;
}

.day-cell.selected {
  box-shadow: 0 0 0 4px #dff3ea;
}

.day-cell.sunday .day-number,
.week-day.sunday h3 {
  color: #d7354a;
}

.day-cell.saturday .day-number,
.week-day.saturday h3 {
  color: #2563eb;
}

.day-cell.hasEvent:not(.today):not(.sunday):not(.saturday) {
  background: #fffdf7;
}

.day-number {
  display: block;
  font-size: 19px;
  font-weight: 950;
  line-height: 1;
  align-self: flex-start;
  color: #1f2937;
}

.event-list {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.week-events {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.event-pill,
.more-pill {
  background: #dff3ea;
  color: #2f6f57;
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 12px;
  font-weight: 850;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.more-pill {
  background: #fff1ce;
  color: #b46b00;
}

.week-view .event-pill {
  font-size: 15px;
  line-height: 1.25;
  padding: 5px 9px;
  white-space: normal;
  text-overflow: clip;
}

.week-view .empty-text {
  font-size: 15px;
  line-height: 1.4;
}

.week-view {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
}

.week-day {
  min-height: 300px;
  border: 2px solid #edf1f5;
  border-radius: 18px;
  padding: 10px;
  cursor: pointer;
  background: #ffffff;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
}

.week-day.sunday {
  background: #fff1f2;
  border-color: #ffd6dc;
}

.week-day.saturday {
  background: #eff6ff;
  border-color: #cfe3ff;
}

.week-day.today {
  border-color: #30a46c;
  box-shadow: inset 0 0 0 2px #30a46c;
  background: #ecfdf3;
}

.week-day.selected {
  box-shadow: 0 0 0 4px #dff3ea;
}

.week-day h3 {
  margin: 0 0 10px;
  font-size: 17px;
  white-space: nowrap;
  line-height: 1.2;
  align-self: flex-start;
}

.built-in-box,
.custom-box {
  background: #fff8f0;
  border-radius: 18px;
  padding: 14px;
  margin-top: 12px;
}

.built-in-box h4,
.custom-box h4 {
  margin: 0 0 8px;
}

.built-in-box p {
  margin: 6px 0;
}

.custom-event {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  background: white;
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.event-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 8px;
  min-width: 0;
}

.event-summary strong {
  width: 100%;
  overflow-wrap: anywhere;
}

.event-summary small {
  color: #667085;
}

.status-chip {
  border-radius: 999px;
  padding: 2px 7px;
  background: #fff0c7;
  color: #8a5700;
  font-size: 11px;
  font-weight: 900;
}

.status-chip.published {
  background: #dff3ea;
  color: #25634d;
}

.event-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.custom-event button {
  background: #e9897e;
  color: white;
  border: none;
  border-radius: 12px;
  padding: 8px 10px;
}

.custom-event button.neutral,
.form-actions button.neutral {
  background: #eef2f6;
  color: #344054;
}

.custom-event button.publish {
  background: #397d63;
}

.state-box {
  margin-top: 12px;
  padding: 14px;
  border-radius: 16px;
  background: #eef8f3;
  color: #315d4b;
}

.state-box.error,
.save-error {
  background: #fff0f0;
  color: #9b2c2c;
}

.field-error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff0f0;
  color: #9b2c2c;
  font-size: 13px;
  font-weight: 800;
}

.state-box p,
.save-error {
  margin: 0 0 10px;
}

.state-box button,
.form-actions button {
  border: 0;
  border-radius: 12px;
  padding: 9px 12px;
  background: #397d63;
  color: white;
  font-weight: 900;
  cursor: pointer;
}

.rollback-note {
  padding: 8px 10px;
  border-radius: 12px;
  background: #fff6d8;
  color: #765600;
  font-size: 12px;
}

.edit-form {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 2px solid #f0dfcc;
}

.edit-form h4 {
  margin: 0;
}

.edit-form label {
  display: grid;
  gap: 4px;
  color: #475467;
  font-size: 13px;
  font-weight: 850;
}

.edit-form input,
.edit-form select,
.edit-form textarea {
  min-width: 0;
  border: 2px solid #dceee6;
  border-radius: 11px;
  padding: 9px;
  font: inherit;
}

.datetime-card {
  display: grid;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 14px;
  background: #fffdf8;
  border: 1px solid #eadfce;
}

.edit-form .date-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.date-row input {
  width: min(180px, 100%);
}

.time-fields-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}

.compact-time-group {
  display: grid;
  grid-template-columns: auto minmax(58px, 1fr) auto minmax(58px, 1fr) auto;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.compact-time-group strong,
.compact-time-group span {
  color: #475467;
  font-size: 13px;
  white-space: nowrap;
}

.compact-time-group select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 7px 5px;
  background: white;
}

@media (max-width: 620px) {
  .time-fields-row {
    grid-template-columns: 1fr;
  }

  .datetime-card,
  .compact-time-group {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
}

.edit-form .publish-check {
  display: flex;
  align-items: center;
}

.edit-form .publish-check input {
  width: auto;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

button:disabled {
  cursor: wait;
  opacity: .6;
}

.add-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-top: 12px;
}

.add-row input {
  border: 2px solid #dceee6;
  border-radius: 14px;
  padding: 12px;
  font-size: 15px;
  min-width: 0;
}

.empty-text {
  color: #7b8492;
}

@media (max-width: 1100px) {
  .calendar-shell {
    grid-template-columns: 1fr;
  }

  .calendar-shell.month .calendar-main {
    min-height: calc(100vh - 185px);
  }

  .month-view {
    grid-template-rows: 28px;
    grid-auto-rows: minmax(82px, 1fr);
    gap: 6px;
  }

  .day-cell {
    min-height: 82px;
  }
}

@media (max-width: 900px) {
  .week-view {
    grid-template-columns: repeat(7, minmax(84px, 1fr));
    overflow-x: auto;
    padding-bottom: 6px;
  }

  .week-day {
    min-height: 220px;
  }
}

@media (max-width: 760px) {
  .calendar-header {
    flex-direction: column;
  }

  .calendar-toolbar strong {
    font-size: 20px;
  }

  .calendar-shell.month .calendar-main {
    min-height: auto;
  }

  .month-view {
    grid-template-rows: 26px;
    grid-auto-rows: minmax(64px, auto);
    gap: 4px;
    flex: initial;
  }

  .day-cell {
    min-height: 64px;
    padding: 5px;
  }

  .event-pill,
  .more-pill {
    font-size: 10px;
    padding: 1px 5px;
  }

  .week-view .event-pill {
    font-size: 13px;
    padding: 4px 7px;
  }
}

/* 教室大螢幕修正：週行事曆日期顏色加深，避免淡底看不清楚 */
.week-day h3,
.day-number {
  color: #243b53;
  font-weight: 900;
}
.week-day.sunday h3,
.day-cell.sunday .day-number { color: #b42318; }
.week-day.saturday h3,
.day-cell.saturday .day-number { color: #1d4ed8; }
.week-day.today h3,
.day-cell.today .day-number { color: #14532d; }
.week-day.selected h3 { color: #1f5c47; }


/* ✅ HUA_CALENDAR_MOBILE_DESKTOP_REVIEW_20260710：桌機盡量一頁式，手機可美觀滑動並方便編輯。 */
.calendar-main {
  min-width: 0;
}

.detail-panel {
  position: sticky;
  top: 16px;
}

.calendar-shell.week .detail-panel {
  position: static;
}

@media (min-width: 1101px) and (max-height: 760px) {
  .calendar-header {
    margin-bottom: 8px;
  }

  .calendar-header p {
    font-size: 14px;
  }

  .calendar-main,
  .detail-panel {
    padding: 12px;
    border-radius: 20px;
  }

  .calendar-shell.month .calendar-main {
    min-height: calc(100svh - 150px);
  }

  .month-view {
    grid-template-rows: 26px;
    grid-auto-rows: minmax(78px, 1fr);
    gap: 6px;
  }

  .day-cell {
    min-height: 78px;
  }

  .event-pill,
  .more-pill {
    font-size: 11px;
    padding: 2px 6px;
  }
}

@media (max-width: 1100px) {
  .detail-panel {
    position: static;
  }
}

@media (max-width: 760px) {
  .calendar-page {
    min-width: 0;
  }

  .calendar-header p {
    font-size: 14px;
    line-height: 1.5;
  }

  .mode-switch,
  .calendar-toolbar {
    width: 100%;
  }

  .mode-switch button {
    flex: 1;
  }

  .calendar-toolbar {
    flex-wrap: wrap;
  }

  .calendar-toolbar strong {
    flex: 1 1 100%;
    order: -1;
  }

  .calendar-main {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .month-view {
    min-width: 620px;
  }

  .week-view {
    min-width: 620px;
  }

  .detail-panel {
    padding: 14px;
  }

  .custom-event {
    align-items: flex-start;
  }

  .custom-event span {
    line-height: 1.5;
  }

  .add-row {
    grid-template-columns: 1fr;
  }

  .add-row button {
    width: 100%;
  }
}


/* ✅ HUA_MOBILE_WEEK_SCROLL_ONLY_20260710 */
.week-scroll-area { width: 100%; min-width: 0; }
@media (max-width: 760px) {
  .calendar-main { overflow-x: hidden !important; }
  .month-view { min-width: 0 !important; }
  .week-scroll-area {
    width: 100%;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 10px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
  }
  .week-scroll-area::-webkit-scrollbar { height: 6px; }
  .week-scroll-area::-webkit-scrollbar-thumb { background: #cfe9dd; border-radius: 999px; }
  .week-view {
    width: max-content !important;
    max-width: none !important;
    min-width: 700px !important;
    grid-template-columns: repeat(7, 94px) !important;
    overflow: visible !important;
  }
  .week-day { min-width: 94px !important; min-height: 240px; }
  .week-day.today::before {
    content: "⭐ 今天";
    display: block;
    margin-bottom: 6px;
    color: #2f6f57;
    font-size: 12px;
    font-weight: 950;
  }
}
</style>

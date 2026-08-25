<script setup>
// ✅ HUA_POINTS_2_NOTEBOOK_INTEGRATION_20260710：簿本全班完成會先慶祝，再由老師選擇是否全班 +1。
// ✅ HUA_NOTEBOOK_ONE_SCREEN_MOBILE_REVIEW_20260710：簿本頁已補桌機一頁式壓縮與手機不卡片切半。
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CLOUD_DATA_UPDATED_EVENT } from '../services/cloudSync'
import { parseStudentRoster } from '../domain/studentRoster'

const homeworkOptions = [
  '聯絡簿', '甲本', '乙本', '國習', '數習', '社習',
  '國作', '數作', '社作', '作文', '學習單', '回條', '考卷', '自訂'
]

const subjects = ['國語', '數學', '社會', '自然', '英語']

const STORAGE_KEY = 'notebookBoardsV2'
const WEEKLY_KEY = 'notebookWeeklyRecordsV2'
const NOTIFIED_KEY = 'notebookNotifiedV2'
const cloudRefreshSeed = ref(0)

const roster = computed(() => {
  cloudRefreshSeed.value
  return parseStudentRoster(localStorage.getItem('students') || '')
})
const students = computed(() => roster.value.map(student => student.raw))

const className = computed(() => {
  cloudRefreshSeed.value
  return localStorage.getItem('className') || '三年○班'
})

// ✅ HUA_COMPLETION_CLASS_ONLY_REWARD_20260710：全班完成後由老師決定是否加分，不自動發放。
const COMPLETION_POINT_RECORDS_KEY = 'classAssistantPointRecordsV1'
const COMPLETION_GROUPS_KEY = 'classHelperSeatGroupsForPoints'
const completionRewardOpen = ref(false)
const completionRewardSource = ref('')
const completionRewardTitle = ref('')
const completionRewardMessage = ref('')
const completionRewardIcon = ref('🌟')
const completionPrompted = reactive({})

function parseCompletionStudent(line, index) {
  const text = String(line || '').trim()
  const match = text.match(/^(\d{1,2})[\s、.．,\-]+(.+)$/)
  return match
    ? { seatNo: Number(match[1]), name: match[2].trim(), key: `${Number(match[1])}__${match[2].trim()}` }
    : { seatNo: index + 1, name: cleanStudentName(text), key: `${index + 1}__${cleanStudentName(text)}` }
}

const completionStudents = computed(() => roster.value)


function normalizedCompletionName(value) {
  return String(value || '').replace(/^\s*(?:座號)?\d{1,2}[.、．)）\- ]+/, '').replace(/[\s　]/g, '').trim()
}

function loadCompletionPointRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(COMPLETION_POINT_RECORDS_KEY) || '[]')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function playCompletionCelebrationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((frequency, index) => {
      const start = ctx.currentTime + index * 0.1
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.18)
    })
  } catch (error) {
    console.warn('完成慶祝音效無法播放：', error)
  }
}

function saveCompletionPoints(targetStudents, reason, type, extra = {}) {
  const records = loadCompletionPointRecords()
  const now = new Date().toISOString()
  targetStudents.forEach((student, index) => {
    records.push({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
      studentKey: student.key,
      seatNo: student.seatNo,
      name: student.name,
      delta: 1,
      reason,
      note: '由全班完成鼓勵視窗發放',
      type,
      createdAt: now,
      source: completionRewardSource.value,
      ...extra
    })
  })
  localStorage.setItem(COMPLETION_POINT_RECORDS_KEY, JSON.stringify(records))
  window.dispatchEvent(new CustomEvent('class-helper-points-updated'))
  playCompletionCelebrationSound()
}

function openCompletionReward({ source, title, message, icon = '🌟', promptKey }) {
  if (completionPrompted[promptKey]) return
  completionPrompted[promptKey] = true
  completionRewardSource.value = source
  completionRewardTitle.value = title
  completionRewardMessage.value = message
  completionRewardIcon.value = icon
  playCompletionCelebrationSound()
  setTimeout(() => { completionRewardOpen.value = true }, 650)
}

function closeCompletionReward() {
  completionRewardOpen.value = false
}

function rewardWholeClass() {
  if (!completionStudents.value.length) return
  saveCompletionPoints(
    completionStudents.value,
    `${completionRewardTitle.value}｜全班完成`,
    'completion-class'
  )
  showToast(`⭐ 已替全班 ${completionStudents.value.length} 位學生各加 1 分`, 2200)
  closeCompletionReward()
}



function cleanStudentName(name = '') {
  return String(name)
    .replace(/^\s*(?:座號)?\d{1,2}[.、．)）\- ]+/, '')
    .trim()
}

function studentNumber(index) {
  return String(roster.value[index]?.seatNo || index + 1).padStart(2, '0')
}

function studentDisplayName(index) {
  return roster.value[index]?.name || `學生${index + 1}`
}

function studentKey(index) {
  return roster.value[index]?.key || `legacy-index-${index}`
}

function studentStatus(board, index) {
  const key = studentKey(index)
  return board.statuses[key] ?? board.statuses[index] ?? 'none'
}


function createBoard(title = '聯絡簿') {
  return {
    id: Date.now() + Math.random(),
    title,
    customTitle: '',
    subject: '國語',
    round: '',
    statuses: {},
    sparkle: {}
  }
}

function createDefaultBoards() {
  return [createBoard('聯絡簿')]
}

function loadBoards() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (Array.isArray(saved) && saved.length) {
      return saved.map((board, index) => ({
        ...createBoard(index === 0 ? '聯絡簿' : '自訂'),
        ...board,
        id: board.id ?? Date.now() + index,
        sparkle: {}
      }))
    }
  } catch (error) {
    console.warn('簿本資料讀取失敗：', error)
  }
  return createDefaultBoards()
}

const boards = reactive(loadBoards())

// Legacy boards used array indexes. Convert them once while the current roster
// still supplies the identity mapping; later roster reordering will not move a
// status to another student.
boards.forEach(board => {
  roster.value.forEach((student, index) => {
    if (board.statuses[student.key] === undefined && board.statuses[index] !== undefined) {
      board.statuses[student.key] = board.statuses[index]
      delete board.statuses[index]
    }
  })
})
localStorage.setItem(STORAGE_KEY, JSON.stringify(boards.map(board => ({
  id: board.id,
  title: board.title,
  customTitle: board.customTitle,
  subject: board.subject,
  round: board.round,
  statuses: board.statuses,
}))))
const toast = ref('')
const reminderText = ref('')
const isReminderOpen = ref(false)
const isClearOpen = ref(false)
const clearTarget = ref(null)
const clearConfirm = ref(false)
const isWeeklyOpen = ref(false)
const selectedWeeklyStudent = ref(null)

watch([isReminderOpen, isWeeklyOpen, isClearOpen], ([reminderOpen, weeklyOpen, clearOpen]) => {
  const locked = reminderOpen || weeklyOpen || clearOpen
  document.body.style.overflow = locked ? 'hidden' : ''
  document.documentElement.style.overflow = locked ? 'hidden' : ''
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  window.removeEventListener(CLOUD_DATA_UPDATED_EVENT, refreshNotebookFromCloud)
})

const weeklyRecords = ref(loadJson(WEEKLY_KEY, []))
const notifiedMap = ref(loadJson(NOTIFIED_KEY, {}))


// ✅ HUA_FIREBASE_NOTEBOOK_LIVE_SYNC_20260711：手機登記缺交／訂正後，前方桌機簿本頁立即更新。
function refreshNotebookFromCloud(event) {
  const keys = new Set(event?.detail?.keys || [])

  if (keys.size === 0 || keys.has('students') || keys.has('className')) {
    cloudRefreshSeed.value += 1
  }

  if (keys.size === 0 || keys.has(STORAGE_KEY)) {
    const nextBoards = loadBoards()
    boards.splice(0, boards.length, ...nextBoards)
  }

  if (keys.size === 0 || keys.has(WEEKLY_KEY)) {
    weeklyRecords.value = loadJson(WEEKLY_KEY, [])
  }

  if (keys.size === 0 || keys.has(NOTIFIED_KEY)) {
    notifiedMap.value = loadJson(NOTIFIED_KEY, {})
  }
}

onMounted(() => {
  window.addEventListener(CLOUD_DATA_UPDATED_EVENT, refreshNotebookFromCloud)
})

const visibleBoards = computed(() => boards)

const notebookGridClass = computed(() => ({
  single: visibleBoards.value.length === 1,
  double: visibleBoards.value.length === 2,
  triple: visibleBoards.value.length === 3,
  compact: visibleBoards.value.length >= 3
}))


watch(
  boards,
  () => {
    const clean = boards.map(board => ({
      id: board.id,
      title: board.title,
      customTitle: board.customTitle,
      subject: board.subject,
      round: board.round,
      statuses: board.statuses
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
  },
  { deep: true }
)

watch(weeklyRecords, () => {
  localStorage.setItem(WEEKLY_KEY, JSON.stringify(weeklyRecords.value))
}, { deep: true })

watch(notifiedMap, () => {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notifiedMap.value))
}, { deep: true })

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || fallback
  } catch {
    return fallback
  }
}

function showToast(message, duration = 1600) {
  toast.value = message
  setTimeout(() => {
    if (toast.value === message) toast.value = ''
  }, duration)
}

function playRewardSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    const audio = new AudioContextClass()
    const osc = audio.createOscillator()
    const gain = audio.createGain()

    osc.connect(gain)
    gain.connect(audio.destination)

    osc.frequency.setValueAtTime(660, audio.currentTime)
    osc.frequency.setValueAtTime(880, audio.currentTime + 0.08)

    gain.gain.setValueAtTime(0.08, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25)

    osc.start()
    osc.stop(audio.currentTime + 0.25)
  } catch (error) {
    console.warn('音效播放失敗：', error)
  }
}

function getTitle(board) {
  if (board.title === '自訂') return board.customTitle || '自訂作業'
  if (board.title === '考卷') {
    return `${board.subject}考卷${board.round ? `第${board.round}回` : ''}`
  }
  return board.title
}

function studentLabel(index) {
  return `${studentNumber(index)} ${studentDisplayName(index)}`
}

function todayKey() {
  const date = new Date()
  return toDateKey(date)
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekStart(date = new Date()) {
  const copy = new Date(date)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  copy.setHours(0, 0, 0, 0)
  return toDateKey(copy)
}

const currentWeekStart = computed(() => getWeekStart())

function setAll(board, status) {
  students.value.forEach((_, index) => {
    updateStudentStatus(board, index, status)
  })

  if (status === 'ok') {
    checkAllDone(board)
  }
}

function toggleStatus(board, index) {
  const current = studentStatus(board, index)
  const nextMap = {
    none: 'missing',
    missing: 'fix',
    fix: 'ok',
    ok: 'none'
  }
  const next = nextMap[current]

  updateStudentStatus(board, index, next, current)

  if (next === 'ok') {
    playRewardSound()
    showReward(board, index)
  }

  checkAllDone(board)
}

function updateStudentStatus(board, index, next, previous = studentStatus(board, index)) {
  board.statuses[studentKey(index)] = next
  delete board.statuses[index]

  if (previous === 'missing' || previous === 'fix') {
    resolveWeeklyRecord(board, index, previous)
  }

  if (next === 'missing' || next === 'fix') {
    addWeeklyRecord(board, index, next)
  }
}

function addWeeklyRecord(board, index, status) {
  const title = getTitle(board)
  const identity = studentKey(index)
  const recordKey = `${currentWeekStart.value}|${todayKey()}|${board.id}|${title}|${identity}|${status}`
  const exists = weeklyRecords.value.some(record => record.key === recordKey)
  if (exists) return

  weeklyRecords.value.push({
    key: recordKey,
    weekStart: currentWeekStart.value,
    date: todayKey(),
    boardId: board.id,
    title,
    studentIndex: index,
    studentKey: identity,
    studentName: studentDisplayName(index),
    status,
    resolved: false,
    notified: false,
    createdAt: new Date().toISOString()
  })
}

function resolveWeeklyRecord(board, index, status) {
  const title = getTitle(board)
  weeklyRecords.value.forEach(record => {
    if (
      record.weekStart === currentWeekStart.value &&
      record.boardId === board.id &&
      record.title === title &&
      (record.studentKey ? record.studentKey === studentKey(index) : record.studentIndex === index) &&
      record.status === status &&
      !record.resolved
    ) {
      record.resolved = true
      record.resolvedAt = new Date().toISOString()
    }
  })
}

function showReward(board, index) {
  board.sparkle[index] = true
  showToast(`🌟 ${studentLabel(index)} 完成了！`)

  setTimeout(() => {
    board.sparkle[index] = false
  }, 1000)
}

function isAllOk(board) {
  return students.value.length > 0 && students.value.every((_, index) => studentStatus(board, index) === 'ok')
}

function checkAllDone(board) {
  if (!students.value.length) return
  const promptKey = `notebook-${todayKey()}-${board.id}`

  if (isAllOk(board)) {
    showToast(`🎉 ${getTitle(board)} 全班完成！`, 2200)
    playRewardSound()
    openCompletionReward({
      source: 'notebook',
      title: `${getTitle(board)}全班完成！`,
      message: '今天大家都很可靠，繳交與訂正都完成了！',
      icon: '📚',
      promptKey
    })
  } else {
    completionPrompted[promptKey] = false
  }
}

function statusIcon(status) {
  if (status === 'ok') return '✅'
  if (status === 'fix') return '⚠️'
  if (status === 'missing') return '❌'
  return '－'
}

function statusText(status) {
  if (status === 'ok') return 'OK'
  if (status === 'fix') return '需訂正'
  if (status === 'missing') return '缺交'
  return '未設定'
}

function statusClass(status) {
  return {
    ok: status === 'ok',
    fix: status === 'fix',
    missing: status === 'missing'
  }
}

function getReminderItems(board, status) {
  return students.value
    .map((name, index) => ({
      name,
      number: index + 1,
      label: studentLabel(index),
      status: studentStatus(board, index)
    }))
    .filter(item => item.status === status)
}

function reminderCount(board) {
  return getReminderItems(board, 'fix').length + getReminderItems(board, 'missing').length
}

function reminderButtonText(board) {
  if (isAllOk(board)) return '✅ 全數完成'
  const count = reminderCount(board)
  return count === 0 ? '✅ 無需催繳' : `📋 LINE催繳（${count}）`
}

function boardStats(board) {
  return {
    ok: students.value.filter((_, index) => studentStatus(board, index) === 'ok').length,
    fix: students.value.filter((_, index) => studentStatus(board, index) === 'fix').length,
    missing: students.value.filter((_, index) => studentStatus(board, index) === 'missing').length,
    none: students.value.filter((_, index) => studentStatus(board, index) === 'none').length
  }
}


function addBoard() {
  boards.push(createBoard('聯絡簿'))
  showToast(`➕ 已新增第 ${boards.length} 個簿本品項`)
}

function removeBoard(target = boards[boards.length - 1]) {
  if (boards.length <= 1) {
    showToast('至少要保留 1 個簿本品項')
    return
  }

  const index = boards.findIndex(board => board.id === target.id)
  if (index === -1) return

  const title = getTitle(target)
  const ok = window.confirm(`確定要刪除「${title}」這個品項框格嗎？這會移除目前畫面上的狀態紀錄。`)
  if (!ok) return

  boards.splice(index, 1)
  showToast(`➖ 已刪除「${title}」`)
}

function openClearDialog(board) {
  clearTarget.value = board
  clearConfirm.value = false
  isClearOpen.value = true
}

function closeClearDialog() {
  isClearOpen.value = false
  clearConfirm.value = false
  clearTarget.value = null
}

function clearBoardRecords() {
  if (!clearTarget.value || !clearConfirm.value) return

  clearTarget.value.statuses = {}
  clearTarget.value.sparkle = {}

  showToast(`🧹 已清除「${getTitle(clearTarget.value)}」紀錄`)
  closeClearDialog()
}

function makeReminder(board) {
  const title = getTitle(board)
  const fixList = getReminderItems(board, 'fix')
  const missingList = getReminderItems(board, 'missing')
  const total = fixList.length + missingList.length

  if (total === 0) {
    showToast('🟢 沒有需要催繳的學生！')
    return
  }

  const missingText = missingList.length
    ? `❌ 缺交\n${missingList.map(item => item.label).join('\n')}`
    : ''

  const fixText = fixList.length
    ? `⚠️ 需訂正\n${fixList.map(item => item.label).join('\n')}`
    : ''

  reminderText.value =
`【${className.value} 簿本提醒】

家長您好：

今日「${title}」尚未完成如下
${[missingText, fixText].filter(Boolean).join('\n\n')}

麻煩協助提醒孩子完成訂正或補交。
謝謝您的配合！`

  copyReminder()
  isReminderOpen.value = true
  showToast(`📋 已建立催繳訊息（${total}人）`)
}

function copyReminder() {
  navigator.clipboard?.writeText(reminderText.value)
  showToast('📋 已複製，可直接貼到 LINE')
}

const activeWeeklyRecords = computed(() => {
  return weeklyRecords.value.filter(record => record.weekStart === currentWeekStart.value && !record.resolved)
})

const weeklySummary = computed(() => {
  return students.value.map((name, index) => {
    const displayName = studentDisplayName(index)
    const records = activeWeeklyRecords.value.filter(record => (
      record.studentKey ? record.studentKey === studentKey(index) : record.studentIndex === index
    ))
    const missing = records.filter(record => record.status === 'missing')
    const fix = records.filter(record => record.status === 'fix')
    return {
      index,
      name: displayName,
      label: studentLabel(index),
      missingCount: missing.length,
      fixCount: fix.length,
      total: missing.length + fix.length,
      missing,
      fix,
      records,
      notified: Boolean(notifiedMap.value[`${currentWeekStart.value}-${index}`])
    }
  })
})

const studentsNeedNotify = computed(() => weeklySummary.value.filter(item => item.total > 0))
const zeroProblemStudents = computed(() => weeklySummary.value.filter(item => item.total === 0))
const topProblemStudents = computed(() => [...studentsNeedNotify.value].sort((a, b) => b.total - a.total).slice(0, 5))

const selectedWeekly = computed(() => {
  if (selectedWeeklyStudent.value === null) return studentsNeedNotify.value[0] || null
  return weeklySummary.value.find(item => item.index === selectedWeeklyStudent.value) || null
})

function openWeeklyPanel() {
  selectedWeeklyStudent.value = studentsNeedNotify.value[0]?.index ?? null
  isWeeklyOpen.value = true
}

function weeklyMessage(item = selectedWeekly.value) {
  if (!item) return ''

  const missingLines = item.missing.length
    ? `❌ 缺交（${item.missing.length}次）\n${item.missing.map(record => `・${formatDate(record.date)} ${record.title}`).join('\n')}`
    : ''

  const fixLines = item.fix.length
    ? `⚠️ 未訂正（${item.fix.length}次）\n${item.fix.map(record => `・${formatDate(record.date)} ${record.title}`).join('\n')}`
    : ''

  return `家長您好：

這裡是${className.value}本週簿本提醒。

${item.name}本週目前尚有：
${[missingLines, fixLines].filter(Boolean).join('\n\n')}

麻煩您協助提醒孩子完成補交與訂正，讓孩子養成每日整理簿本的好習慣。
謝謝您的配合！`
}

function copyWeeklyMessage(item = selectedWeekly.value) {
  if (!item) return
  const text = weeklyMessage(item)
  navigator.clipboard?.writeText(text)
  showToast(`📋 已複製 ${item.label} 的家長訊息`)
}

function copyAllWeeklyMessages() {
  const text = studentsNeedNotify.value
    .map(item => `【${item.label}】\n${weeklyMessage(item)}`)
    .join('\n\n--------------------\n\n')

  if (!text) {
    showToast('本週沒有需要通知的學生')
    return
  }

  navigator.clipboard?.writeText(text)
  showToast('📋 已複製本週全部通知')
}

function toggleNotified(item) {
  const key = `${currentWeekStart.value}-${item.index}`
  if (notifiedMap.value[key]) {
    delete notifiedMap.value[key]
  } else {
    notifiedMap.value[key] = new Date().toISOString()
  }
}

function resetWeeklyRecords() {
  const ok = window.confirm('確定要清除本週簿本通知紀錄嗎？這不會清除目前畫面上的簿本狀態。')
  if (!ok) return
  weeklyRecords.value = weeklyRecords.value.filter(record => record.weekStart !== currentWeekStart.value)
  Object.keys(notifiedMap.value).forEach(key => {
    if (key.startsWith(currentWeekStart.value)) delete notifiedMap.value[key]
  })
  showToast('🧹 已清除本週通知紀錄')
}

function formatDate(dateText) {
  const [, month, day] = dateText.split('-')
  return `${Number(month)}/${Number(day)}`
}
</script>

<template>
  <div class="page notebook-page">
    <div class="page-header">
      <div>
        <h2>📚 簿本繳交</h2>
        <p>用學生姓名快速追蹤 OK、需訂正、缺交，並累計本週家長通知。</p>
      </div>

      <div class="header-actions">
        <button class="weekly-btn" @click="openWeeklyPanel">
          📩 本週通知（{{ studentsNeedNotify.length }}）
        </button>
        <div class="item-controls" aria-label="簿本品項增減">
          <span>品項：{{ boards.length }}</span>
          <button class="add-item-btn" @click="addBoard">＋ 新增品項</button>
        </div>
      </div>
    </div>

    <div v-if="students.length === 0" class="card empty-card">
      <h3>尚未建立學生名單</h3>
      <p>請先到「學生管理」貼上學生名單。</p>
    </div>

    <div v-else class="layout-grid">
      <aside class="weekly-overview">
        <div class="overview-card highlight">
          <span>本週需通知</span>
          <strong>{{ studentsNeedNotify.length }}</strong>
          <small>位學生</small>
        </div>
        <div class="overview-card">
          <span>未完成總次數</span>
          <strong>{{ activeWeeklyRecords.length }}</strong>
          <small>缺交＋未訂正</small>
        </div>
        <div class="overview-list">
          <h3>📊 本週關注</h3>
          <p v-if="topProblemStudents.length === 0">本週目前很穩定，沒有需要通知的學生。</p>
          <button
            v-for="item in topProblemStudents"
            :key="item.index"
            class="rank-row"
            @click="selectedWeeklyStudent = item.index; isWeeklyOpen = true"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.total }}次</strong>
          </button>
        </div>
        <div class="overview-list zero-list">
          <h3>🌟 零缺交未訂正</h3>
          <p v-if="zeroProblemStudents.length === 0">目前沒有零紀錄名單。</p>
          <div class="zero-tags">
            <span v-for="item in zeroProblemStudents.slice(0, 12)" :key="item.index">
              {{ item.name }}
            </span>
          </div>
          <small v-if="zeroProblemStudents.length > 12">還有 {{ zeroProblemStudents.length - 12 }} 位</small>
        </div>
      </aside>

      <div class="notebook-main">
        <div class="notebook-grid" :class="notebookGridClass">
          <section
            v-for="board in visibleBoards"
            :key="board.id"
            class="notebook-card"
            :class="{ compact: visibleBoards.length >= 3 }"
          >
            <div class="board-toolbar">
              <select v-model="board.title">
                <option v-for="option in homeworkOptions" :key="option">
                  {{ option }}
                </option>
              </select>

              <button class="missing-btn" @click="setAll(board, 'missing')">❌ 全缺</button>
              <button class="fix-btn" @click="setAll(board, 'fix')">⚠️ 全訂正</button>
              <button class="ok-btn" @click="setAll(board, 'ok')">✅ 全OK</button>
              <button
                class="copy-btn"
                :class="{ done: reminderCount(board) === 0 }"
                @click="makeReminder(board)"
              >
                {{ reminderButtonText(board) }}
              </button>
              <button class="remove-board-btn" @click="removeBoard(board)" :disabled="boards.length <= 1">－ 品項</button>
            </div>

            <div v-if="board.title === '考卷'" class="exam-row">
              <select v-model="board.subject">
                <option v-for="subject in subjects" :key="subject">
                  {{ subject }}
                </option>
              </select>
              <input v-model="board.round" placeholder="回次，例如：2" />
            </div>

            <input
              v-if="board.title === '自訂'"
              v-model="board.customTitle"
              placeholder="請輸入作業名稱，例如：閱讀單、自然習作"
            />

            <div class="board-title-line">
              <strong>{{ getTitle(board) }}</strong>
              <span>點擊順序：－ → ❌ → ⚠️ → ✅</span>
            </div>

            <div class="seat-grid">
              <button
                v-for="(student, index) in students"
                :key="studentKey(index)"
                class="seat"
                :class="statusClass(studentStatus(board, index))"
                @click="toggleStatus(board, index)"
                :title="`${studentLabel(index)}：${statusText(studentStatus(board, index))}`"
              >
                <strong>{{ studentNumber(index) }}</strong>
                <small>{{ studentDisplayName(index) }}</small>
                <span>{{ statusIcon(studentStatus(board, index)) }}</span>
                <em v-if="board.sparkle[index]">✨</em>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div v-if="isReminderOpen" class="modal-backdrop" @click.self="isReminderOpen = false">
      <div class="reminder-modal">
        <div class="modal-header">
          <h3>📋 催繳訊息</h3>
          <button class="close-btn" @click="isReminderOpen = false">×</button>
        </div>

        <pre>{{ reminderText }}</pre>

        <div class="modal-actions">
          <button class="copy-again-btn" @click="copyReminder">再複製一次</button>
          <button class="ok-close-btn" @click="isReminderOpen = false">關閉</button>
        </div>
      </div>
    </div>

    <div v-if="isWeeklyOpen" class="modal-backdrop" @click.self="isWeeklyOpen = false">
      <div class="weekly-modal weekly-modal-compact">
        <div class="modal-header">
          <div>
            <h3>📩 本週家長通知中心</h3>
            <p>週起始：{{ currentWeekStart }}｜先複製 LINE 訊息，不自動發送。</p>
          </div>
          <button class="close-btn" @click="isWeeklyOpen = false">×</button>
        </div>

        <div class="weekly-modal-grid">
          <div class="student-summary-list">
            <button
              v-for="item in studentsNeedNotify"
              :key="item.index"
              class="summary-student"
              :class="{ active: selectedWeekly?.index === item.index, notified: item.notified }"
              @click="selectedWeeklyStudent = item.index"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.total }}次</strong>
              <small>{{ item.notified ? '已通知' : '未通知' }}</small>
            </button>
            <p v-if="studentsNeedNotify.length === 0" class="empty-weekly">本週目前沒有需要通知的學生。</p>
          </div>

          <div class="weekly-message-panel">
            <template v-if="selectedWeekly">
              <div class="selected-student-header">
                <h4>{{ selectedWeekly.label }}</h4>
                <button
                  class="notified-toggle"
                  :class="{ done: selectedWeekly.notified }"
                  @click="toggleNotified(selectedWeekly)"
                >
                  {{ selectedWeekly.notified ? '✅ 已通知' : '□ 標記已通知' }}
                </button>
              </div>

              <div class="detail-columns">
                <div>
                  <h5>❌ 缺交</h5>
                  <p v-if="selectedWeekly.missing.length === 0">無</p>
                  <ul>
                    <li v-for="record in selectedWeekly.missing" :key="record.key">
                      {{ formatDate(record.date) }}｜{{ record.title }}
                    </li>
                  </ul>
                </div>
                <div>
                  <h5>⚠️ 未訂正</h5>
                  <p v-if="selectedWeekly.fix.length === 0">無</p>
                  <ul>
                    <li v-for="record in selectedWeekly.fix" :key="record.key">
                      {{ formatDate(record.date) }}｜{{ record.title }}
                    </li>
                  </ul>
                </div>
              </div>

              <pre>{{ weeklyMessage(selectedWeekly) }}</pre>

              <div class="modal-actions">
                <button class="copy-again-btn" @click="copyWeeklyMessage(selectedWeekly)">複製此生訊息</button>
                <button class="copy-all-btn" @click="copyAllWeeklyMessages">複製全部通知</button>
                <button class="clear-btn" @click="resetWeeklyRecords">清除本週紀錄</button>
              </div>
            </template>
            <template v-else>
              <div class="empty-weekly-large">🎉 本週沒有需要通知的孩子。</div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isClearOpen && clearTarget" class="modal-backdrop" @click.self="closeClearDialog">
      <div class="reminder-modal clear-modal">
        <div class="modal-header">
          <h3>🧹 開始新的紀錄</h3>
          <button class="close-btn" @click="closeClearDialog">×</button>
        </div>

        <p class="clear-warning">
          確定要清除「<strong>{{ getTitle(clearTarget) }}</strong>」的學生狀態嗎？
          <br>
          作業名稱會保留，只會清除這一項作業的 OK／需訂正／缺交紀錄。
        </p>

        <div class="clear-stats">
          <div>✅ OK：{{ boardStats(clearTarget).ok }} 位</div>
          <div>⚠️ 需訂正：{{ boardStats(clearTarget).fix }} 位</div>
          <div>❌ 缺交：{{ boardStats(clearTarget).missing }} 位</div>
          <div>－ 未設定：{{ boardStats(clearTarget).none }} 位</div>
        </div>

        <label class="confirm-check">
          <input type="checkbox" v-model="clearConfirm">
          我確認要清除這項作業紀錄
        </label>

        <div class="modal-actions">
          <button class="ok-close-btn" @click="closeClearDialog">取消</button>
          <button
            class="danger-confirm-btn"
            :disabled="!clearConfirm"
            @click="clearBoardRecords"
          >
            確認清除
          </button>
        </div>
      </div>
    </div>


    <div v-if="completionRewardOpen" class="completion-reward-overlay" @click.self="closeCompletionReward">
      <section class="completion-reward-modal" role="dialog" aria-modal="true" aria-labelledby="completionRewardTitle">
        <div class="completion-stars" aria-hidden="true">⭐ ✨ ⭐</div>
        <div class="completion-icon">{{ completionRewardIcon }}</div>
        <h3 id="completionRewardTitle">{{ completionRewardTitle }}</h3>
        <p class="completion-message">{{ completionRewardMessage }}</p>
        <p class="completion-thanks">謝謝大家一起讓班級變得更好。❤️</p>

        <div class="completion-reward-actions">
          <button type="button" class="reward-class-button" @click="rewardWholeClass">👍 全班 +1</button>
          <button type="button" class="reward-skip-button" @click="closeCompletionReward">❤️ 今天不用</button>
        </div>
      </section>
    </div>

    <div v-if="toast" class="toast">
      {{ toast }}
    </div>
  </div>
</template>

<style scoped>
.notebook-page {
  max-width: none;
  margin: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.page-header h2 {
  margin-bottom: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.weekly-btn {
  background: linear-gradient(135deg, #ff8a3d, #f4bd28);
  color: white;
  font-weight: 900;
  box-shadow: 0 8px 18px rgba(255, 138, 61, .25);
}

.item-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, .7);
  padding: 10px;
  border-radius: 18px;
}

.item-controls span {
  font-weight: 900;
  color: #475569;
  white-space: nowrap;
}

.item-controls button {
  padding: 10px 14px;
  border-radius: 14px;
}

.add-item-btn {
  background: #6bbf95;
}

.remove-board-btn {
  background: #e9897e;
}

.item-controls button:disabled,
.remove-board-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}

.empty-card {
  max-width: 600px;
}

.layout-grid {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.notebook-main {
  min-width: 0;
  overflow: visible;
}

.weekly-overview {
  display: grid;
  gap: 12px;
  position: sticky;
  top: 12px;
}

.overview-card,
.overview-list {
  background: white;
  border-radius: 22px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .08);
}

.overview-card {
  display: grid;
  gap: 3px;
}

.overview-card span,
.overview-card small {
  color: #64748b;
  font-weight: 800;
}

.overview-card strong {
  font-size: 42px;
  line-height: 1;
  color: #2f6f57;
}

.overview-card.highlight {
  background: #fff7dc;
  border: 2px solid #f1d9b8;
}

.overview-list h3 {
  margin: 0 0 10px;
  font-size: 18px;
}

.overview-list p {
  color: #64748b;
  line-height: 1.6;
  margin: 0;
}

.rank-row {
  width: 100%;
  background: #f8fafc;
  color: #334155;
  border: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 10px;
  border-radius: 14px;
}

.zero-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.zero-tags span {
  background: #e9faef;
  color: #1f8f48;
  border-radius: 999px;
  padding: 6px 10px;
  font-weight: 800;
  font-size: 13px;
}

.notebook-grid {
  display: grid;
  gap: 16px;
}

.notebook-grid.single {
  grid-template-columns: minmax(0, 1fr);
}

.notebook-grid.double {
  grid-template-columns: repeat(2, minmax(360px, 1fr));
}

.notebook-grid.compact,
.notebook-grid.compact.triple {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.notebook-card {
  background: white;
  border-radius: 24px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .08);
  min-width: 0;
}

.notebook-card.compact {
  padding: 12px;
  border-radius: 18px;
}

.board-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
}

.board-toolbar select {
  min-width: 104px;
  flex: 1 1 100px;
}

select,
input {
  border: 2px solid #f1d9b8;
  border-radius: 14px;
  padding: 10px;
  font-size: 15px;
  min-width: 0;
}

.board-toolbar button {
  padding: 10px 12px;
  font-size: 13px;
  white-space: nowrap;
}

.notebook-card.compact .board-toolbar {
  gap: 6px;
  margin-bottom: 8px;
}

.notebook-card.compact .board-toolbar button,
.notebook-card.compact .board-toolbar select,
.notebook-card.compact input {
  padding: 7px 8px;
  font-size: 13px;
  border-radius: 12px;
}

.exam-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}

.board-title-line {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  color: #64748b;
  margin: 6px 0 10px;
  font-size: 13px;
}

.board-title-line strong {
  font-size: 18px;
  color: #334155;
}

.missing-btn { background: #f35f64; }
.fix-btn { background: #f4bd28; color: #333; }
.ok-btn { background: #45c96b; }
.copy-btn { background: #ff8a3d; }
.copy-btn.done { background: #45c96b; }
.clear-btn { background: #9ca3af; }
.copy-all-btn { background: #8b7cf6; }

.seat-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 9px;
  margin-top: 10px;
}

.notebook-card.compact .seat-grid {
  grid-template-columns: repeat(4, minmax(72px, 1fr));
  gap: 8px;
}


.seat {
  min-height: 78px;
  background: #f2f4f7;
  color: #374151;
  border: 2px solid #dde2ea;
  border-radius: 16px;
  display: grid;
  grid-template-rows: auto auto auto;
  place-items: center;
  position: relative;
  padding: 6px 4px;
}


.seat strong {
  font-size: 18px;
  line-height: 1.1;
  font-weight: 950;
}

.seat small {
  font-size: 15px;
  opacity: .9;
  font-weight: 850;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seat span {
  font-size: 20px;
}

.notebook-card.compact .seat {
  min-height: 70px;
  padding: 6px 4px;
}

.notebook-card.compact .seat strong {
  font-size: 15px;
}

.notebook-card.compact .seat small {
  font-size: 12px;
}

.notebook-card.compact .seat span {
  font-size: 17px;
}

.seat em {
  position: absolute;
  right: 6px;
  top: 4px;
  font-style: normal;
  animation: pop .8s ease;
}

.seat.ok {
  background: #e9faef;
  border-color: #8ce0a4;
  color: #1f8f48;
}

.seat.fix {
  background: #fff7dc;
  border-color: #f4d56d;
  color: #d37a00;
}

.seat.missing {
  background: #ffe8e8;
  border-color: #ff9a9a;
  color: #c62828;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, .62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  z-index: 120;
  padding: 14px;
}

.reminder-modal,
.weekly-modal {
  width: min(820px, 92vw);
  max-height: none;
  overflow: visible;
  background: linear-gradient(180deg, #fffdf8 0%, #fff7ed 100%);
  border-radius: 24px;
  padding: 18px;
  box-shadow: 0 24px 70px rgba(15, 23, 42, .42);
  border: 4px solid #ffffff;
  outline: 3px solid #f1d9b8;
  color: #1f2937;
}

.reminder-modal {
  width: min(700px, 92vw);
}

.weekly-modal {
  width: min(720px, 88vw);
  padding: 14px;
  display: block;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  background: #ffffff;
  border: 2px solid #f1d9b8;
  border-radius: 16px;
  padding: 8px 10px;
  margin-bottom: 8px;
  box-shadow: 0 8px 24px rgba(100, 116, 139, .12);
  flex: 0 0 auto;
}

.modal-header h3 {
  margin: 0;
  color: #1e293b;
  font-size: 20px;
  font-weight: 950;
}

.modal-header p {
  margin: 4px 0 0;
  color: #475569;
  font-weight: 700;
  font-size: 14px;
}

.close-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #334155;
  border: 2px solid #d9e2ec;
  font-size: 24px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 38px;
  padding: 0;
  flex: 0 0 38px;
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  text-align: center;
}

.reminder-modal pre,
.weekly-message-panel pre {
  white-space: pre-wrap;
  background: #fffbeb;
  border: 3px dashed #f59e0b;
  border-radius: 20px;
  padding: 16px;
  font-size: 16px;
  line-height: 1.65;
  color: #1f2937;
  font-weight: 750;
}

.weekly-message-panel pre {
  min-height: 0;
  overflow: visible;
  margin: 6px 0 8px;
  font-size: 13px;
  line-height: 1.38;
  padding: 10px 12px;
  border-radius: 14px;
}

.weekly-modal-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 0;
  align-items: stretch;
}

.student-summary-list {
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.7), 0 8px 18px rgba(100,116,139,.10);
  display: flex;
  flex-direction: row;
  gap: 7px;
  min-height: 0;
}

.summary-student {
  min-width: 128px;
  flex: 0 0 auto;
  background: #f8fafc;
  color: #334155;
  border: 2px solid #cbd5e1;
  border-radius: 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1px 6px;
  text-align: left;
  margin-bottom: 0;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 900;
}

.summary-student small {
  grid-column: 1 / 3;
  color: #64748b;
}

.summary-student.active {
  border-color: #22c55e;
  background: #dcfce7;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, .18);
}

.summary-student.notified {
  opacity: .68;
}

.weekly-message-panel {
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 16px;
  padding: 10px;
  box-shadow: 0 8px 18px rgba(100, 116, 139, .10);
  min-height: 0;
  overflow: visible;
  display: block;
}

.selected-student-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.selected-student-header h4 {
  margin: 0;
  font-size: 18px;
}

.notified-toggle {
  background: #f4bd28;
  color: #334155;
}

.notified-toggle.done {
  background: #45c96b;
  color: white;
}

.detail-columns {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin: 6px 0;
  flex: 0 0 auto;
}

.detail-columns > div {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 14px;
  padding: 8px;
  color: #1f2937;
}

.detail-columns h5 {
  margin: 0 0 4px;
  font-size: 14px;
}

.detail-columns p {
  margin: 0;
}

.detail-columns ul {
  margin: 0;
  padding-left: 16px;
  line-height: 1.35;
  font-size: 13px;
}

.empty-weekly,
.empty-weekly-large {
  color: #64748b;
  line-height: 1.7;
}

.empty-weekly-large {
  background: #e9faef;
  border-radius: 18px;
  padding: 28px;
  font-size: 24px;
  font-weight: 900;
  text-align: center;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  flex: 0 0 auto;
}

.weekly-modal .modal-actions button {
  padding: 8px 12px;
  font-size: 13px;
}

.copy-again-btn {
  background: #ff8a3d;
  color: white;
  box-shadow: 0 8px 18px rgba(255, 138, 61, .28);
}

.copy-all-btn {
  background: #22c55e;
  color: white;
  box-shadow: 0 8px 18px rgba(34, 197, 94, .24);
}

.ok-close-btn {
  background: #6bbf95;
  color: white;
}

.clear-warning {
  background: #fff7dc;
  border: 2px solid #f1d9b8;
  border-radius: 16px;
  padding: 14px;
  line-height: 1.7;
}

.clear-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin: 16px 0;
}

.clear-stats div {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 12px;
  font-weight: 800;
}

.confirm-check {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
  font-weight: 800;
}

.confirm-check input {
  width: 22px;
  height: 22px;
}

.danger-confirm-btn {
  background: #e9897e;
}

.danger-confirm-btn:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}


/* 品項卡片一列最多兩個，三個以上自動換到下一排，避免右側被切到。 */

@media (max-width: 900px) {
  .notebook-grid.compact.triple,
  .notebook-grid.compact {
    grid-template-columns: 1fr;
  }

  .weekly-modal {
    width: min(680px, 92vw);
  }
}

@media (max-height: 760px) {
  .weekly-modal {
    transform: scale(.92);
    transform-origin: center center;
  }
}

.toast {
  position: fixed;
  right: 28px;
  bottom: 28px;
  background: #2f6f57;
  color: white;
  padding: 18px 24px;
  border-radius: 20px;
  font-size: 20px;
  font-weight: 800;
  box-shadow: 0 10px 30px rgba(0,0,0,.2);
  z-index: 150;
}

@keyframes pop {
  0% { transform: scale(.3); opacity: 0; }
  50% { transform: scale(1.4); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}

@media (max-width: 1200px) {
  .layout-grid {
    grid-template-columns: 1fr;
  }

  .weekly-overview {
    position: static;
    grid-template-columns: repeat(2, 1fr);
  }

  .zero-list {
    grid-column: 1 / 3;
  }
}

@media (max-width: 1100px) {
  .notebook-grid.double,
  .notebook-grid.compact:not(.triple) {
    grid-template-columns: 1fr;
  }

  .seat-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .page-header {
    display: block;
  }

  .header-actions {
    justify-content: flex-start;
  }

  .item-controls {
    margin-top: 12px;
    overflow-x: auto;
    width: 100%;
  }

  .weekly-overview {
    grid-template-columns: 1fr;
  }

  .zero-list {
    grid-column: auto;
  }

  .seat-grid,
  .notebook-card.compact .seat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .notebook-grid,
  .notebook-grid.single,
  .notebook-grid.double,
  .notebook-grid.compact {
    grid-template-columns: minmax(0, 1fr);
  }

  .weekly-modal {
    width: min(94vw, 760px);
    max-height: calc(100vh - 40px);
    padding: 14px;
  }

  .weekly-modal-grid,
  .detail-columns {
    grid-template-columns: 1fr;
  }

  .student-summary-list {
    max-height: none;
  }
}

/* 2026-07-06 refinement: keep weekly notification light and prevent awkward compact-card clipping */
.modal-backdrop {
  overflow: hidden !important;
  align-items: center !important;
  justify-items: center !important;
}

.weekly-modal.weekly-modal-compact {
  width: min(560px, 90vw) !important;
  max-width: 560px !important;
  max-height: 86vh !important;
  overflow: visible !important;
  padding: 10px !important;
  border-radius: 18px !important;
  outline-width: 2px !important;
  border-width: 3px !important;
  box-shadow: 0 18px 48px rgba(15, 23, 42, .34) !important;
}

.weekly-modal-compact .modal-header {
  padding: 8px 10px !important;
  margin-bottom: 8px !important;
  border-radius: 14px !important;
  gap: 8px !important;
}

.weekly-modal-compact .modal-header h3 {
  font-size: 18px !important;
  line-height: 1.15 !important;
}

.weekly-modal-compact .modal-header p {
  font-size: 12px !important;
  line-height: 1.25 !important;
  margin-top: 2px !important;
}

.weekly-modal-compact .close-btn {
  width: 34px !important;
  height: 34px !important;
  flex-basis: 34px !important;
  font-size: 22px !important;
  line-height: 1 !important;
  display: inline-grid !important;
  place-items: center !important;
}

.weekly-modal-compact .weekly-modal-grid {
  gap: 8px !important;
}

.weekly-modal-compact .student-summary-list {
  padding: 6px !important;
  gap: 6px !important;
  border-radius: 13px !important;
}

.weekly-modal-compact .summary-student {
  min-width: 112px !important;
  padding: 5px 7px !important;
  border-radius: 10px !important;
  font-size: 11px !important;
}

.weekly-modal-compact .weekly-message-panel {
  padding: 8px !important;
  border-radius: 13px !important;
}

.weekly-modal-compact .selected-student-header h4 {
  font-size: 17px !important;
}

.weekly-modal-compact .notified-toggle {
  padding: 8px 10px !important;
  border-radius: 12px !important;
  font-size: 13px !important;
}

.weekly-modal-compact .detail-columns {
  gap: 6px !important;
  margin: 6px 0 !important;
}

.weekly-modal-compact .detail-columns > div {
  padding: 7px 8px !important;
  border-radius: 12px !important;
}

.weekly-modal-compact .detail-columns h5 {
  font-size: 13px !important;
  margin-bottom: 3px !important;
}

.weekly-modal-compact .detail-columns ul,
.weekly-modal-compact .detail-columns p {
  font-size: 12px !important;
  line-height: 1.25 !important;
}

.weekly-modal-compact .weekly-message-panel pre {
  margin: 6px 0 8px !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
  border-width: 2px !important;
  font-size: 12.5px !important;
  line-height: 1.42 !important;
  max-height: none !important;
  overflow: visible !important;
}

.weekly-modal-compact .modal-actions {
  gap: 6px !important;
}

.weekly-modal-compact .modal-actions button {
  padding: 7px 10px !important;
  border-radius: 12px !important;
  font-size: 12.5px !important;
}

.notebook-grid.compact,
.notebook-grid.compact.triple {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  align-items: start !important;
}

.notebook-card.compact {
  overflow: visible !important;
  align-self: start !important;
}

.notebook-card.compact .seat-grid {
  grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)) !important;
  gap: 6px !important;
  align-items: stretch !important;
}

.notebook-card.compact .seat {
  min-height: 54px !important;
  border-radius: 13px !important;
  padding: 5px 3px !important;
  grid-template-rows: auto auto auto !important;
}

.notebook-card.compact .seat strong {
  font-size: 14px !important;
  line-height: 1 !important;
}

.notebook-card.compact .seat small {
  font-size: 11px !important;
  line-height: 1.05 !important;
}

.notebook-card.compact .seat span {
  font-size: 15px !important;
  line-height: 1 !important;
}

@media (max-width: 1100px) {
  .notebook-grid.compact.triple {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 760px) {
  .weekly-modal.weekly-modal-compact {
    width: min(94vw, 560px) !important;
    max-height: 88vh !important;
    transform: none !important;
  }
  .weekly-modal-compact .detail-columns {
    grid-template-columns: 1fr !important;
  }
}


/* 2026-07-06 final tightening: compact weekly modal + clean triple-board cards */
html:has(.modal-backdrop),
body:has(.modal-backdrop) {
  overflow: hidden !important;
}

.weekly-modal.weekly-modal-compact {
  width: min(720px, 84vw) !important;
  max-width: 720px !important;
  max-height: none !important;
  overflow: visible !important;
  padding: 10px !important;
  border-radius: 18px !important;
  border-width: 2px !important;
  outline-width: 2px !important;
}

.weekly-modal-compact .modal-header {
  padding: 7px 10px !important;
  margin-bottom: 8px !important;
  border-radius: 14px !important;
}

.weekly-modal-compact .modal-header h3 {
  font-size: 18px !important;
}

.weekly-modal-compact .modal-header p {
  font-size: 12px !important;
}

.weekly-modal-compact .close-btn {
  width: 32px !important;
  height: 32px !important;
  flex: 0 0 32px !important;
  font-size: 20px !important;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
}

.weekly-modal-compact .weekly-modal-grid {
  grid-template-columns: 150px minmax(0, 1fr) !important;
  gap: 8px !important;
  align-items: stretch !important;
}

.weekly-modal-compact .student-summary-list {
  flex-direction: column !important;
  overflow: visible !important;
  padding: 6px !important;
  gap: 5px !important;
}

.weekly-modal-compact .summary-student {
  min-width: 0 !important;
  width: 100% !important;
  padding: 5px 7px !important;
  font-size: 11px !important;
  border-radius: 10px !important;
}

.weekly-modal-compact .weekly-message-panel {
  padding: 8px !important;
  border-radius: 13px !important;
}

.weekly-modal-compact .selected-student-header h4 {
  font-size: 17px !important;
}

.weekly-modal-compact .notified-toggle {
  padding: 7px 10px !important;
  font-size: 12px !important;
  border-radius: 11px !important;
}

.weekly-modal-compact .detail-columns {
  gap: 6px !important;
  margin: 5px 0 !important;
}

.weekly-modal-compact .detail-columns > div {
  padding: 6px 8px !important;
  border-radius: 11px !important;
}

.weekly-modal-compact .detail-columns h5 {
  font-size: 13px !important;
  margin-bottom: 2px !important;
}

.weekly-modal-compact .detail-columns ul,
.weekly-modal-compact .detail-columns p {
  font-size: 12px !important;
  line-height: 1.22 !important;
}

.weekly-modal-compact .weekly-message-panel pre {
  margin: 5px 0 7px !important;
  padding: 8px 10px !important;
  border-width: 2px !important;
  border-radius: 12px !important;
  font-size: 12px !important;
  line-height: 1.32 !important;
  max-height: none !important;
  overflow: visible !important;
}

.weekly-modal-compact .modal-actions {
  gap: 6px !important;
}

.weekly-modal-compact .modal-actions button {
  padding: 7px 10px !important;
  font-size: 12px !important;
  border-radius: 11px !important;
}

.notebook-grid.compact,
.notebook-grid.compact.triple {
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  grid-auto-rows: auto !important;
  align-items: start !important;
}

.notebook-grid.compact .notebook-card,
.notebook-grid.compact.triple .notebook-card {
  align-self: start !important;
  height: auto !important;
  min-height: 0 !important;
  min-width: 0 !important;
  overflow: visible !important;
}

.notebook-grid.compact .seat-grid,
.notebook-grid.compact.triple .seat-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  gap: 7px !important;
  overflow: visible !important;
}

.notebook-grid.compact.triple .seat {
  min-height: 58px !important;
  height: auto !important;
  padding: 5px 3px !important;
  border-radius: 12px !important;
  grid-template-rows: auto auto auto !important;
}

.notebook-grid.compact.triple .seat strong { font-size: 14px !important; line-height: 1 !important; }
.notebook-grid.compact.triple .seat small { font-size: 11px !important; line-height: 1.05 !important; }
.notebook-grid.compact.triple .seat span { font-size: 15px !important; line-height: 1 !important; }

@media (max-width: 1180px) {
  .notebook-grid.compact,
  .notebook-grid.compact.triple {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 760px) {
  .weekly-modal.weekly-modal-compact {
    width: min(94vw, 560px) !important;
  }
  .weekly-modal-compact .weekly-modal-grid,
  .weekly-modal-compact .detail-columns {
    grid-template-columns: 1fr !important;
  }
  .weekly-modal-compact .student-summary-list {
    flex-direction: row !important;
    overflow-x: auto !important;
  }
  .weekly-modal-compact .summary-student {
    min-width: 108px !important;
  }
}



/* ✅ HUA_NOTEBOOK_ONE_SCREEN_MOBILE_REVIEW_20260710
   簿本繳交：桌機顯示盡量塞進一頁；手機改成單欄、卡片不被切到。 */
@media (min-width: 1181px) and (max-height: 860px) {
  .page-header {
    margin-bottom: 10px !important;
  }

  .page-header h2 {
    margin: 0 0 4px !important;
    font-size: 26px !important;
  }

  .page-header p {
    margin: 0 !important;
    font-size: 14px !important;
  }

  .layout-grid {
    grid-template-columns: 218px minmax(0, 1fr) !important;
    gap: 12px !important;
  }

  .weekly-overview {
    gap: 8px !important;
  }

  .overview-card,
  .overview-list {
    padding: 11px !important;
    border-radius: 18px !important;
  }

  .overview-card strong {
    font-size: 30px !important;
  }

  .overview-list h3 {
    font-size: 15px !important;
    margin-bottom: 6px !important;
  }

  .rank-row {
    padding: 7px 8px !important;
    margin-bottom: 5px !important;
  }

  .zero-tags span {
    padding: 4px 8px !important;
    font-size: 12px !important;
  }

  .notebook-grid,
  .notebook-grid.compact,
  .notebook-grid.compact.triple {
    gap: 10px !important;
  }

  .notebook-card,
  .notebook-card.compact {
    padding: 10px !important;
    border-radius: 18px !important;
  }

  .board-toolbar {
    gap: 6px !important;
    margin-bottom: 6px !important;
  }

  .board-toolbar button,
  .board-toolbar select,
  .notebook-card.compact .board-toolbar button,
  .notebook-card.compact .board-toolbar select {
    padding: 6px 7px !important;
    font-size: 12px !important;
    border-radius: 11px !important;
  }

  .board-title-line {
    margin: 4px 0 6px !important;
    font-size: 12px !important;
  }

  .board-title-line strong {
    font-size: 15px !important;
  }

  .seat-grid,
  .notebook-card.compact .seat-grid,
  .notebook-grid.compact .seat-grid,
  .notebook-grid.compact.triple .seat-grid {
    gap: 6px !important;
  }

  .seat,
  .notebook-card.compact .seat,
  .notebook-grid.compact.triple .seat {
    min-height: 56px !important;
    padding: 4px 3px !important;
    border-radius: 12px !important;
  }

  .seat strong,
  .notebook-card.compact .seat strong,
  .notebook-grid.compact.triple .seat strong {
    font-size: 13px !important;
  }

  .seat small,
  .notebook-card.compact .seat small,
  .notebook-grid.compact.triple .seat small {
    font-size: 11px !important;
  }

  .seat span,
  .notebook-card.compact .seat span,
  .notebook-grid.compact.triple .seat span {
    font-size: 15px !important;
  }
}

@media (max-width: 760px) {
  .page-header,
  .header-actions,
  .item-controls {
    flex-direction: column !important;
    align-items: stretch !important;
  }

  .layout-grid {
    grid-template-columns: 1fr !important;
  }

  .weekly-overview {
    position: static !important;
    grid-template-columns: 1fr 1fr !important;
  }

  .overview-list {
    grid-column: 1 / -1;
  }

  .notebook-grid,
  .notebook-grid.double,
  .notebook-grid.compact,
  .notebook-grid.compact.triple {
    grid-template-columns: 1fr !important;
  }

  .seat-grid,
  .notebook-card.compact .seat-grid,
  .notebook-grid.compact .seat-grid,
  .notebook-grid.compact.triple .seat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .seat,
  .notebook-card.compact .seat,
  .notebook-grid.compact.triple .seat {
    min-height: 70px !important;
  }
}

@media (max-width: 430px) {
  .weekly-overview {
    grid-template-columns: 1fr !important;
  }

  .seat-grid,
  .notebook-card.compact .seat-grid,
  .notebook-grid.compact .seat-grid,
  .notebook-grid.compact.triple .seat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}


/* ✅ HUA_POINTS_2_COMPLETION_REWARD_MODAL_20260710 */
.completion-reward-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(36, 59, 83, .34);
  backdrop-filter: blur(6px);
}
.completion-reward-modal {
  width: min(460px, 94vw);
  max-height: min(720px, 92svh);
  overflow-y: auto;
  padding: 28px;
  border: 1px solid #f2dfc9;
  border-radius: 30px;
  text-align: center;
  background: linear-gradient(145deg, #fff, #fff9ee 58%, #f2fbf6);
  box-shadow: 0 26px 80px rgba(36, 59, 83, .28);
  animation: completionRewardPop .3s ease-out;
}
@keyframes completionRewardPop {
  from { opacity: 0; transform: translateY(18px) scale(.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.completion-stars { font-size: 25px; letter-spacing: .16em; }
.completion-icon { margin: 8px 0 2px; font-size: 62px; line-height: 1; }
.completion-reward-modal h3 { margin: 8px 0; color: #2f6f57; font-size: 28px; }
.completion-message { margin: 0; color: #465668; font-size: 18px; font-weight: 800; line-height: 1.65; }
.completion-thanks { margin: 14px 0 20px; color: #8a5a44; font-weight: 900; }
.completion-reward-actions { display: grid; gap: 10px; }
.completion-reward-actions button { min-height: 48px; }
.reward-class-button { background: #55b98a; }
.reward-skip-button { background: #f6f3ef; color: #687386; border: 1px solid #e5e7eb; }
@media (max-width: 520px) {
  .completion-reward-overlay { align-items: end; padding: 10px; }
  .completion-reward-modal { width: 100%; padding: 22px 16px calc(18px + env(safe-area-inset-bottom)); border-radius: 26px 26px 18px 18px; }
  .completion-reward-modal h3 { font-size: 24px; }
  .completion-icon { font-size: 52px; }
}

</style>

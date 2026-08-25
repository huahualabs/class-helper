<script setup>
// ✅ HUA_POINTS_2_TOOTHBRUSH_INTEGRATION_20260710：全班潔牙完成會先慶祝，再由老師選擇是否全班 +1。
// ✅ HUA_TOOTHBRUSH_ONE_SCREEN_MOBILE_REVIEW_20260710：此頁已加入桌機一頁式與手機響應式檢查。
// CHECK_MARKER_20260707_NAME_CENTER_COMPACT: contains isTuesday + visibleStudents; completed cards auto-hide; centered compact student names.
import { computed, reactive, ref, watch } from 'vue'
import { parseStudentRoster } from '../domain/studentRoster'

const today = new Date()
const selectedDate = ref(toDateKey(today))
const toast = ref('')
const audioEnabled = ref(localStorage.getItem('toothbrushSoundEnabled') !== 'false')
const roster = computed(() => parseStudentRoster(localStorage.getItem('students') || ''))
const students = computed(() => roster.value.map(student => student.raw))
function cleanStudentName(name = '') {
  return String(name).replace(/^\s*(?:座號)?\d{1,2}[.、．)）\- ]+/, '').trim()
}

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


const records = reactive(loadRecords())
Object.values(records).forEach(day => {
  if (!day || typeof day !== 'object') return
  roster.value.forEach((student, index) => {
    if (day[student.key] === undefined && day[index] !== undefined) {
      day[student.key] = day[index]
      delete day[index]
    }
  })
})
localStorage.setItem('toothbrushRecords', JSON.stringify(records))
const weekdayNames = ['日', '一', '二', '三', '四', '五', '六']
const selectedDateObject = computed(() => parseDateKey(selectedDate.value))
const selectedDateText = computed(() => `${selectedDateObject.value.getMonth() + 1}/${selectedDateObject.value.getDate()}（${weekdayNames[selectedDateObject.value.getDay()]}）`)
const dayRecord = computed(() => records[selectedDate.value] ||= {})
const isTuesday = computed(() => selectedDateObject.value.getDay() === 2)
const mouthHint = computed(() => isTuesday.value
  ? '今天是週二漱口日：左鍵第一下是 🦷 刷牙，第二下是 💧 漱口；完成漱口與消毒後，卡片會自動收起。'
  : '今天是一般潔牙日：只需完成 🦷 刷牙與 🧽 桌面消毒；兩項完成後，卡片會自動收起。'
)
const dayModeLabel = computed(() => isTuesday.value ? '週二：刷牙＋漱口＋消毒' : '一般日：刷牙＋消毒')
const visibleStudents = computed(() => students.value
  .map((student, index) => ({ student, index }))
  .filter(({ index }) => !isStudentComplete(index))
)
const remainingText = computed(() => students.value.length
  ? `尚有 ${visibleStudents.value.length} 位學生未完成；完成者會自動收起`
  : ''
)

watch(records, () => localStorage.setItem('toothbrushRecords', JSON.stringify(records)), { deep: true })
watch(audioEnabled, value => localStorage.setItem('toothbrushSoundEnabled', String(value)))

watch([visibleStudents, selectedDate], ([visible]) => {
  const promptKey = `toothbrush-${selectedDate.value}`
  if (students.value.length > 0 && visible.length === 0) {
    openCompletionReward({
      source: 'toothbrush',
      title: '全班潔牙完成！',
      message: isTuesday.value ? '刷牙、漱口與桌面消毒都完成，準備香香地休息！' : '刷牙與桌面消毒都完成，準備香香地休息！',
      icon: '🦷',
      promptKey
    })
  } else {
    completionPrompted[promptKey] = false
  }
}, { deep: true })

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem('toothbrushRecords') || '{}')
  } catch {
    return {}
  }
}
function toDateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
function parseDateKey(dateKey) { const [y, m, d] = dateKey.split('-').map(Number); return new Date(y, m - 1, d) }
function ensureStudent(index) {
  const key = roster.value[index]?.key || `legacy-index-${index}`
  if (!dayRecord.value[key] && dayRecord.value[index]) {
    dayRecord.value[key] = dayRecord.value[index]
    delete dayRecord.value[index]
  }
  const item = dayRecord.value[key] ||= { mouth: 'none', desk: false }
  if (!item.mouth) {
    const hadBrushed = !!(item.tooth || item.brushed || item.brush || item.toothbrush)
    item.mouth = hadBrushed ? 'tooth' : 'none'
  }
  if (typeof item.desk !== 'boolean') {
    item.desk = !!(item.sanitized || item.disinfected || item.disinfect || item.clean)
  }
  return item
}
function moveDate(offset) {
  const date = new Date(selectedDateObject.value)
  date.setDate(date.getDate() + offset)
  selectedDate.value = toDateKey(date)
}
function goToday() { selectedDate.value = toDateKey(new Date()) }
function beep(type = 'tooth') {
  if (!audioEnabled.value) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = type === 'desk' ? 620 : type === 'rinse' ? 760 : 880
    gain.gain.setValueAtTime(0.001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.16)
  } catch {}
}
function mouthState(index) {
  const key = roster.value[index]?.key || `legacy-index-${index}`
  const item = dayRecord.value[key] || dayRecord.value[index]
  if (!item) return 'none'
  return item.mouth || (item.tooth ? 'tooth' : 'none')
}
function mouthButtonText(index) {
  const state = mouthState(index)
  if (isTuesday.value) {
    if (state === 'rinse') return '✅ 漱口'
    if (state === 'tooth') return '💧 漱口'
    return '🦷 刷牙'
  }
  return state === 'none' ? '🦷 刷牙' : '✅ 刷牙'
}
function mouthButtonTitle(index) {
  const state = mouthState(index)
  if (isTuesday.value) {
    if (state === 'rinse') return '再按一次可取消潔牙紀錄'
    if (state === 'tooth') return '再按一次改成漱口完成'
    return '按一次記錄刷牙'
  }
  return state === 'none' ? '按一次記錄刷牙' : '再按一次取消刷牙紀錄'
}
function isMouthComplete(index) {
  const state = mouthState(index)
  return isTuesday.value ? state === 'rinse' : state !== 'none'
}
function isStudentComplete(index) {
  const key = roster.value[index]?.key || `legacy-index-${index}`
  const item = dayRecord.value[key] || dayRecord.value[index]
  return isMouthComplete(index) && !!item?.desk
}
function toggleMouth(index) {
  const item = ensureStudent(index)
  const current = mouthState(index)
  const next = isTuesday.value
    ? current === 'none' ? 'tooth' : current === 'tooth' ? 'rinse' : 'none'
    : current === 'none' ? 'tooth' : 'none'
  item.mouth = next
  item.tooth = next !== 'none'
  item.brushed = next !== 'none'
  item.rinsed = next === 'rinse'
  if (next !== 'none') beep(next)
  showToast(`${students.value[index]}：${next === 'rinse' ? '💧 漱口完成' : next === 'tooth' ? '🦷 刷牙完成' : '已取消潔牙紀錄'}`)
}
function toggleDesk(index) {
  const item = ensureStudent(index)
  item.desk = !item.desk
  item.sanitized = item.desk
  item.disinfected = item.desk
  if (item.desk) beep('desk')
  showToast(`${students.value[index]}：🧽 桌面消毒${item.desk ? '完成' : '取消'}`)
}
function showToast(message) {
  toast.value = message
  setTimeout(() => { if (toast.value === message) toast.value = '' }, 1200)
}
</script>

<template>
  <!-- CHECK_MARKER_20260707_CARD_AUTO_HIDE_VISIBLESTUDENTS_BIG_NAME -->
  <div class="page wide-page toothbrush-page">
    <div class="page-title-row toothbrush-title-row">
      <div>
        <h2>🦷 潔牙與桌面消毒</h2>
        <p>一個畫面完成中午潔牙與飯後桌面消毒追蹤，點學生卡片按鍵即可切換。</p>
      </div>
      <div class="date-controls compact-date-controls">
        <button @click="moveDate(-1)">◀</button>
        <button @click="goToday">今天</button>
        <button @click="moveDate(1)">▶</button>
      </div>
    </div>

    <section class="card toothbrush-card">
      <div class="tracking-top">
        <div>
          <h3 class="tracking-date-line">
            <span>{{ selectedDateText }}</span>
            <span class="mode-pill">{{ dayModeLabel }}</span>
          </h3>
          <p class="hint">{{ mouthHint }}</p>
          <p v-if="remainingText" class="remaining-text">{{ remainingText }}</p>
        </div>
        <label class="sound-toggle"><input v-model="audioEnabled" type="checkbox" /> 音效</label>
      </div>

      <div v-if="students.length === 0" class="empty">尚未建立學生名單，請先到「學生名單」貼上名單。</div>
      <div v-else-if="visibleStudents.length === 0" class="all-done">
        <div class="all-done-icon">✅</div>
        <strong>今天全班都完成了！</strong>
        <span>{{ isTuesday ? '週二潔牙、漱口與桌面消毒都完成。' : '刷牙與桌面消毒都完成。' }}</span>
      </div>
      <div v-else class="tracking-grid">
        <article
          v-for="{ student, index } in visibleStudents"
          :key="student + index"
          class="tracking-card"
          :class="{
            brushed: mouthState(index) === 'tooth',
            rinsed: mouthState(index) === 'rinse',
            sanitized: dayRecord[index]?.desk
          }"
        >
          <span class="seat-badge">{{ index + 1 }}</span>
          <strong class="student-name">{{ student }}</strong>
          <div class="tracking-buttons">
            <button
              class="mouth-button"
              :class="mouthState(index)"
              :title="mouthButtonTitle(index)"
              @click="toggleMouth(index)"
            >
              {{ mouthButtonText(index) }}
            </button>
            <button
              class="desk-button"
              :class="{ active: dayRecord[index]?.desk }"
              title="桌面消毒"
              @click="toggleDesk(index)"
            >
              {{ dayRecord[index]?.desk ? '✅ 消毒' : '🧽 消毒' }}
            </button>
          </div>
        </article>
      </div>
    </section>

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

    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<style scoped>
.toothbrush-page {
  padding-bottom: 18px;
}

.toothbrush-title-row {
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 12px;
}

.toothbrush-title-row h2 {
  margin-bottom: 4px;
}

.toothbrush-title-row p {
  margin: 0;
  line-height: 1.35;
}

.compact-date-controls {
  flex-shrink: 0;
}

.compact-date-controls button {
  min-height: 38px;
  padding: 8px 12px;
}

.toothbrush-card {
  padding: 18px 20px 20px;
}

.tracking-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.tracking-top h3 {
  margin: 0 0 4px;
  color: #173653;
  font-size: 1.22rem;
}

.tracking-date-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.mode-pill {
  display: inline-flex;
  align-items: center;
  min-height: 27px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfbf4;
  color: #1f7a5d;
  font-size: 0.9rem;
  font-weight: 900;
}

.hint {
  margin: 0;
  color: #68758f;
  font-weight: 700;
  line-height: 1.4;
}

.remaining-text {
  margin: 6px 0 0;
  color: #1f7a5d;
  font-weight: 900;
}

.sound-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1f7a5d;
  font-weight: 800;
  white-space: nowrap;
}

.tracking-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.tracking-card {
  position: relative;
  min-height: 94px;
  padding: 10px 9px 10px;
  border: 2px solid #e3e8ee;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 5px rgba(26, 58, 84, 0.04);
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  gap: 5px;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}

.tracking-card:hover {
  transform: translateY(-1px);
}

.tracking-card.brushed {
  border-color: #bfe4d7;
  background: #fbfffd;
}

.tracking-card.rinsed {
  border-color: #b9dbef;
  background: #f8fcff;
}

.tracking-card.sanitized {
  box-shadow: inset 0 0 0 2px rgba(107, 190, 151, 0.12);
}

.tracking-card.done {
  border-color: #78cba6;
  background: #f7fff9;
}

.seat-badge {
  position: absolute;
  top: 9px;
  left: 9px;
  width: 31px;
  height: 31px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #4fa881;
  color: #fff;
  font-weight: 900;
  font-size: 0.92rem;
}

.student-name {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  margin: 0;
  padding: 0 30px;
  color: #173653;
  font-size: 1.5rem;
  font-weight: 950;
  line-height: 1.12;
  text-align: center;
  letter-spacing: 0.02em;
  word-break: keep-all;
}

.tracking-buttons {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px;
}

.tracking-buttons button {
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid #dfe6ee;
  border-radius: 11px;
  background: #f8fafc;
  color: #173653;
  font-weight: 900;
  font-size: 0.94rem;
  line-height: 1;
  white-space: nowrap;
}

.tracking-buttons button:hover {
  filter: brightness(0.99);
}

.mouth-button.tooth {
  border-color: #bfe4d7;
  background: #ecfbf4;
  color: #1f7a5d;
}

.mouth-button.rinse {
  border-color: #b9dbef;
  background: #edf8ff;
  color: #256987;
}

.desk-button.active {
  border-color: #d6c8b7;
  background: #fff8ed;
  color: #7b5a2e;
}

.empty,
.all-done {
  padding: 24px;
  border: 2px dashed #e6dccf;
  border-radius: 16px;
  color: #68758f;
  text-align: center;
  font-weight: 800;
}

.all-done {
  min-height: 210px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  background: #fbfffd;
  border-color: #bfe4d7;
}

.all-done-icon {
  width: 52px;
  height: 52px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #ecfbf4;
  font-size: 1.55rem;
}

.all-done strong {
  color: #173653;
  font-size: 1.25rem;
}

.all-done span {
  color: #68758f;
  line-height: 1.45;
}

@media (max-width: 1180px) {
  .tracking-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .tracking-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .toothbrush-title-row,
  .tracking-top {
    flex-direction: column;
  }

  .compact-date-controls {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
  }

  .tracking-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .toothbrush-card {
    padding: 14px;
  }

  .student-name {
    padding: 0 24px;
    font-size: 1.4rem;
  }
}

@media (max-width: 430px) {
  .tracking-grid {
    grid-template-columns: 1fr;
  }
}


/* ✅ HUA_TOOTHBRUSH_ONE_SCREEN_MOBILE_REVIEW_20260710
   潔牙消毒：桌機 29 人盡量一頁式，手機兩欄好點擊、不切卡。 */
@media (min-width: 981px) and (max-height: 820px) {
  .toothbrush-page .card {
    padding: 14px !important;
  }

  .tracking-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 9px !important;
  }

  .toothbrush-card {
    min-height: 78px !important;
    padding: 10px !important;
  }

  .student-name {
    font-size: 1.25rem !important;
    margin-bottom: 7px !important;
  }

  .tracking-buttons button {
    min-height: 32px !important;
    padding: 5px 6px !important;
    font-size: 0.86rem !important;
  }
}

@media (max-width: 760px) {
  .tracking-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .student-name {
    text-align: center !important;
    padding: 0 !important;
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

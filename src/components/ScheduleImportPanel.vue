<script setup>
import { computed, onMounted, ref } from 'vue'
import { SHARED_CLASS_ID } from '../config/sharedClassSchedule'
import { classScheduleRepository } from '../services/classScheduleRepository'
import {
  classScheduleMigrationRepository,
  createLegacyScheduleImportPlan,
  LEGACY_SCHEDULE_STORAGE_KEY,
  parseLegacySchedule,
  schedulesMatch,
} from '../services/classScheduleMigrationRepository'
import {
  getCurrentCentralPortalUser,
  signInCentralPortalTeacher,
  waitForCentralPortalSession,
} from '../services/centralPortalFirebase'

const days = [
  { key: 'mon', label: '星期一' },
  { key: 'tue', label: '星期二' },
  { key: 'wed', label: '星期三' },
  { key: 'thu', label: '星期四' },
  { key: 'fri', label: '星期五' },
]

const accessState = ref('checking')
const step = ref('closed')
const message = ref('')
const legacySchedule = ref(null)
const importPlan = ref(null)
const originalLegacyRaw = ref(null)
const importing = ref(false)

const nonEmptyMessages = computed(() => {
  if (!legacySchedule.value) return []
  return days.flatMap(day => legacySchedule.value.periods.flatMap(period => {
    const entry = legacySchedule.value.weekdays[day.key][period.id]
    return entry.message ? [{ day: day.label, period: period.label, message: entry.message }] : []
  }))
})

function friendlyError(error) {
  const known = new Set([
    'missing-legacy', 'invalid-json', 'invalid-schema', 'canonical-exists', 'canonical-race',
    'wrong-class', 'unauthenticated', 'permission-denied', 'import-disabled',
  ])
  if (known.has(error?.code)) return error.message
  return '共享課表匯入失敗，請稍後再試。'
}

async function checkAccess() {
  accessState.value = 'checking'
  try {
    const user = getCurrentCentralPortalUser() || await waitForCentralPortalSession()
    if (!user) {
      accessState.value = 'signed-out'
      return
    }
    await classScheduleMigrationRepository.requireTeacher(SHARED_CLASS_ID)
    accessState.value = 'ready'
  } catch (error) {
    accessState.value = error?.code === 'unauthenticated' ? 'signed-out' : 'unauthorized'
    message.value = friendlyError(error)
    if (import.meta.env.DEV) console.error('[schedule import] access check failed', error)
  }
}

async function login() {
  message.value = ''
  accessState.value = 'checking'
  try {
    await signInCentralPortalTeacher()
    await checkAccess()
  } catch (error) {
    accessState.value = 'signed-out'
    message.value = '中央教師帳號登入失敗，請稍後再試。'
    if (import.meta.env.DEV) console.error('[schedule import] sign in failed', error)
  }
}

async function openPreview() {
  message.value = ''
  step.value = 'loading'
  try {
    const raw = window.localStorage.getItem(LEGACY_SCHEDULE_STORAGE_KEY)
    const parsed = parseLegacySchedule(raw)
    const canonical = await classScheduleMigrationRepository.inspectCanonicalSchedule(SHARED_CLASS_ID)
    if (!canonical.empty) {
      step.value = 'blocked'
      message.value = '共享課表已存在，禁止匯入。'
      return
    }
    originalLegacyRaw.value = raw
    legacySchedule.value = parsed
    importPlan.value = createLegacyScheduleImportPlan(parsed, SHARED_CLASS_ID)
    step.value = 'preview'
  } catch (error) {
    step.value = 'error'
    message.value = friendlyError(error)
    if (import.meta.env.DEV) console.error('[schedule import] preview failed', error)
  }
}

function confirmPreview() {
  step.value = 'confirm'
  message.value = ''
}

async function importSchedule() {
  if (importing.value) return
  importing.value = true
  message.value = ''
  try {
    const currentRaw = window.localStorage.getItem(LEGACY_SCHEDULE_STORAGE_KEY)
    if (currentRaw !== originalLegacyRaw.value) {
      step.value = 'error'
      message.value = '舊課表在預覽後已有變更，請重新預覽再匯入。'
      return
    }
    const currentLegacy = parseLegacySchedule(currentRaw)
    await classScheduleMigrationRepository.importLegacyScheduleOnce(SHARED_CLASS_ID, currentLegacy)

    const [helperRead, portalRead] = await Promise.all([
      classScheduleRepository.loadClassSchedule(SHARED_CLASS_ID),
      classScheduleMigrationRepository.loadPortalScheduleProjection(SHARED_CLASS_ID),
    ])
    const legacyUnchanged = window.localStorage.getItem(LEGACY_SCHEDULE_STORAGE_KEY) === originalLegacyRaw.value
    if (!legacyUnchanged || !schedulesMatch(currentLegacy, helperRead) || !schedulesMatch(currentLegacy, portalRead)) {
      step.value = 'warning'
      message.value = '匯入已寫入，但回讀比對未通過。舊課表仍保留，請勿切換中央共享模式。'
      return
    }

    step.value = 'complete'
    message.value = '匯入完成。舊課表仍保留，可供回復。請另行確認後再切換中央共享模式。'
  } catch (error) {
    step.value = error?.code === 'canonical-exists' || error?.code === 'canonical-race' ? 'blocked' : 'error'
    message.value = friendlyError(error)
    if (import.meta.env.DEV) console.error('[schedule import] import failed', error)
  } finally {
    importing.value = false
  }
}

function closeFlow() {
  step.value = 'closed'
  message.value = ''
  legacySchedule.value = null
  importPlan.value = null
  originalLegacyRaw.value = null
}

onMounted(checkAccess)
</script>

<template>
  <section class="card compact-card schedule-import-panel" aria-labelledby="schedule-import-title">
    <div class="import-heading">
      <div>
        <h3 id="schedule-import-title">一次性共享課表匯入</h3>
        <p>只讀取目前瀏覽器的舊課表；預覽與再次確認完成前不會寫入 Firestore。</p>
      </div>
      <span class="legacy-badge">目前：舊課表模式</span>
    </div>

    <p v-if="accessState === 'checking'" class="import-state" role="status">正在確認中央教師權限…</p>
    <div v-else-if="accessState === 'signed-out'" class="import-state">
      <p>請先登入中央班級平台教師帳號，才能使用匯入工具。</p>
      <button type="button" @click="login">登入中央教師帳號</button>
    </div>
    <p v-else-if="accessState === 'unauthorized'" class="import-state error" role="alert">
      {{ message || `目前帳號沒有 ${SHARED_CLASS_ID} 的教師權限。` }}
    </p>

    <template v-else>
      <button v-if="step === 'closed'" type="button" class="import-entry" @click="openPreview">匯入共享課表</button>
      <p v-else-if="step === 'loading'" class="import-state" role="status">正在讀取舊課表並確認共享資料為空…</p>

      <div v-else-if="step === 'preview' || step === 'confirm'" class="import-preview">
        <div class="target-box">
          <span>目標文件</span>
          <strong>classSchedules/{{ SHARED_CLASS_ID }}</strong>
          <small>預計建立：root 1、periods {{ importPlan.counts.periods }}、entries {{ importPlan.counts.entries }}</small>
        </div>

        <section>
          <h4>節次與時間</h4>
          <div class="period-preview-grid">
            <article v-for="period in legacySchedule.periods" :key="period.id">
              <strong>{{ period.label }}</strong>
              <span>{{ period.start }}–{{ period.end }}</span>
              <small>{{ period.kind }} · {{ period.id }}</small>
            </article>
          </div>
        </section>

        <section>
          <h4>星期一～五科目與圖示</h4>
          <div class="schedule-preview-scroll">
            <table>
              <thead><tr><th>節次</th><th v-for="day in days" :key="day.key">{{ day.label }}</th></tr></thead>
              <tbody>
                <tr v-for="period in legacySchedule.periods" :key="period.id">
                  <th>{{ period.label }}</th>
                  <td v-for="day in days" :key="day.key">
                    <span>{{ legacySchedule.weekdays[day.key][period.id].icon || '—' }}</span>
                    {{ legacySchedule.weekdays[day.key][period.id].subject || '未設定' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h4>半天設定</h4>
          <div class="cutoff-grid">
            <span v-for="day in days" :key="day.key">
              <b>{{ day.label }}</b>{{ legacySchedule.halfDayCutoffs[day.key] || '全天' }}
            </span>
          </div>
        </section>

        <section class="message-warning">
          <h4>公開提醒內容</h4>
          <strong>此內容匯入後可被家長端讀取，請確認不含教師私人備註。</strong>
          <p v-if="!nonEmptyMessages.length">目前沒有非空提醒內容。</p>
          <ul v-else>
            <li v-for="item in nonEmptyMessages" :key="`${item.day}-${item.period}`">
              <b>{{ item.day }} · {{ item.period }}</b>{{ item.message }}
            </li>
          </ul>
        </section>

        <div v-if="step === 'preview'" class="import-actions">
          <button type="button" class="secondary" @click="closeFlow">取消</button>
          <button type="button" @click="confirmPreview">我已檢查預覽</button>
        </div>
        <div v-else class="final-confirm">
          <strong>最終確認</strong>
          <p>系統會再次確認 canonical schedule 仍完全為空，再以單一 transaction 建立。無法覆蓋、合併或刪除既有資料。</p>
          <div class="import-actions">
            <button type="button" class="secondary" :disabled="importing" @click="step = 'preview'">返回預覽</button>
            <button type="button" :disabled="importing" @click="importSchedule">{{ importing ? '匯入中…' : '最終確認並匯入' }}</button>
          </div>
        </div>
      </div>

      <div v-else-if="step === 'blocked' || step === 'error' || step === 'warning' || step === 'complete'" :class="['import-result', step]" :role="step === 'complete' ? 'status' : 'alert'">
        <strong>{{ step === 'complete' ? '匯入與回讀驗證完成' : step === 'warning' ? '需要人工檢查' : '匯入已停止' }}</strong>
        <p>{{ message }}</p>
        <button v-if="step === 'error'" type="button" @click="openPreview">重新預覽</button>
        <button type="button" class="secondary" @click="closeFlow">關閉</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.schedule-import-panel{display:grid;gap:14px;border:2px solid #d8e9df;background:#fbfefc}.import-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.import-heading h3{margin:0;color:#2f6f57}.import-heading p{margin:5px 0 0;color:#667085;font-weight:700}.legacy-badge{flex:0 0 auto;padding:7px 10px;border-radius:999px;background:#fff3c9;color:#765816;font-size:12px;font-weight:900}.import-state,.import-result{margin:0;padding:13px;border-radius:14px;background:#f4f8f6;color:#465668}.import-state p,.import-result p{margin:0 0 10px}.import-state.error,.import-result.error,.import-result.blocked,.import-result.warning{background:#fff5f3;color:#963c32}.import-result.complete{background:#edf8f2;color:#2f6f57}.import-result button+button{margin-left:8px}.import-entry{justify-self:start;min-height:44px}.import-preview{display:grid;gap:18px}.import-preview section h4{margin:0 0 9px;color:#40564c}.target-box{display:grid;gap:4px;padding:13px;border-radius:14px;background:#edf8f2}.target-box span,.target-box small{color:#60756a}.target-box strong{overflow-wrap:anywhere;color:#2f6f57}.period-preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.period-preview-grid article{display:grid;gap:3px;padding:10px;border:1px solid #e1ebe6;border-radius:12px;background:white}.period-preview-grid span,.period-preview-grid small{color:#667085}.schedule-preview-scroll{max-width:100%;overflow-x:auto;border:1px solid #e1ebe6;border-radius:14px}.schedule-preview-scroll table{width:100%;min-width:760px;border-collapse:collapse;background:white}.schedule-preview-scroll th,.schedule-preview-scroll td{padding:9px;border-bottom:1px solid #edf1ef;text-align:left}.schedule-preview-scroll td span{margin-right:4px}.cutoff-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.cutoff-grid span{display:grid;gap:3px;padding:9px;border-radius:11px;background:#fff9e8}.message-warning{padding:13px;border:2px solid #e9bd63;border-radius:14px;background:#fff9e8;color:#765816}.message-warning>strong{display:block}.message-warning ul{display:grid;gap:7px;margin:10px 0 0;padding-left:20px}.message-warning li b{display:block}.import-actions{display:flex;justify-content:flex-end;gap:9px}.import-actions button{min-height:44px}.secondary{background:#f3faf6;color:#2f6f57;border:1px solid #cfe9dd}.final-confirm{padding:14px;border-radius:14px;background:#f7faf8}.final-confirm>p{color:#667085}.import-result button{min-height:44px}
@media(max-width:760px){.import-heading{flex-direction:column}.legacy-badge{align-self:flex-start}.cutoff-grid{grid-template-columns:1fr}.import-actions{display:grid;grid-template-columns:1fr}.import-result button,.import-result button+button{width:100%;margin:8px 0 0}}
</style>

<script setup>
// ✅ HUA_GLOBAL_SYNC_CONFLICT_FALLBACK_20260713：資料中心保留內嵌衝突工具，並由 App.vue 提供全站選擇視窗。
// ✅ HUA_FIRST_RUN_FIREBASE_WIZARD_AUTO_OPEN_20260712：首次選擇個人 Firebase 後直接開啟設定精靈。
// ✅ HUA_SAFARI_FIREBASE_POPUP_FEEDBACK_20260712：登入按下後立即顯示狀態，並清楚回報 Safari 彈窗阻擋。
// ✅ HUA_FIREBASE_SETUP_SMOOTH_FLOW_20260712：整段 Config 可直接貼、已登入不重複跳窗、成功後清楚引導同步驗收。
// ✅ HUA_APP_CHECK_SETUP_UI_20260712：個人 Firebase 設定可保存自己的 App Check Site Key，並顯示權杖測試結果。
import { computed, onMounted, reactive, ref } from 'vue'
import {
  classLifecycleStatus,
  endCurrentClass,
  exportFullBackup,
  getClassDataSummary,
  getClassProfile,
  getEndClassClearedData,
  getEndClassPreservedSettings,
  getFirebaseTestResult,
  getFirebaseWizardProgress,
  getPersonalFirebaseConfig,
  getStorageMode,
  importFullBackup,
  removePersonalFirebaseConfig,
  saveClassProfile,
  saveFirebaseTestResult,
  saveFirebaseWizardProgress,
  savePersonalFirebaseConfig,
  setStorageMode
} from '../services/dataCenter'
import {
  getTeacherAppCheckSource,
  hasTeacherAppCheckConfig,
  testTeacherFirebase
} from '../services/firebase'
import {
  chooseLocalStorageMode,
  cloudState,
  enableCloudSync,
  resolveSyncConflict,
  retryCloudSync,
  signInCloud,
  signOutCloud,
  syncNow
} from '../services/cloudSync'
import FIREBASE_RULES from '../../firebase/database.rules.template.json?raw'

// ✅ HUA_FIREBASE_WIZARD_FEEDBACK_FIX_20260712：移除重複入口、補上前置檢查與精靈內錯誤提示。
// ✅ HUA_SYNC_STATUS_CONFLICT_UI_20260712：正式個人 Firebase 同步狀態、手動同步與衝突選擇介面。
const profile = reactive(getClassProfile())
const storageMode = ref(getStorageMode())
const classSummary = ref(getClassDataSummary())
const localRiskAccepted = ref(localStorage.getItem('classHelperLocalRiskAcknowledgedV1') === 'true')
const notice = ref('')
const importInput = ref(null)
const endClassOpen = ref(false)
const endClassConfirmText = ref('')
const endClassAcknowledged = ref(false)
const endClassBackupDownloaded = ref(false)
const endClassBusy = ref(false)
const clearedDataItems = getEndClassClearedData()
const preservedSettingItems = getEndClassPreservedSettings()
const initialFirebaseConfig = getPersonalFirebaseConfig()
function configForTextarea(config) {
  if (!config) return ''
  const { appCheckSiteKey, ...firebaseConfig } = config
  return JSON.stringify(firebaseConfig, null, 2)
}
const activeFirebaseConfig = ref(initialFirebaseConfig)
const firebaseConfigText = ref(configForTextarea(initialFirebaseConfig))
const appCheckSiteKeyText = ref(initialFirebaseConfig?.appCheckSiteKey || '')
const firebaseConfigured = ref(Boolean(initialFirebaseConfig))
const wizardOpen = ref(false)
const wizardBusy = ref(false)
const wizard = reactive(getFirebaseWizardProgress())
const testResult = ref(getFirebaseTestResult())
const rulesCopied = ref(false)
const syncBusy = ref(false)
const wizardMessage = ref('')
const appCheckConfigured = computed(() => hasTeacherAppCheckConfig(activeFirebaseConfig.value || {}))
const appCheckSource = computed(() => getTeacherAppCheckSource(activeFirebaseConfig.value || {}))
const appCheckStatusText = computed(() => {
  if (testResult.value?.appCheckTokenVerified) return testResult.value.appCheckDebug ? '🛡️ App Check Debug 驗證成功' : '🛡️ App Check 驗證成功'
  if (appCheckConfigured.value) return '🛡️ App Check 已設定，請重新測試連線'
  return 'App Check 尚未設定（啟用強制執行前必須完成）'
})

const steps = [
  { number: 1, title: '建立自己的 Firebase 專案', short: '建立專案' },
  { number: 2, title: '登記班級助手網頁', short: '建立 Web App' },
  { number: 3, title: '建立雲端資料庫', short: '建立 Database' },
  { number: 4, title: '啟用 Google 登入', short: '啟用登入' },
  { number: 5, title: '設定資料安全規則', short: '安全規則' },
  { number: 6, title: '貼上專案連線設定', short: '貼上 Config' },
  { number: 7, title: '登入並測試連線', short: '測試連線' }
]

const lifecycle = computed(() => classLifecycleStatus(profile))
const lifecycleClass = computed(() => `lifecycle-${lifecycle.value.state}`)
const currentStepInfo = computed(() => steps.find(item => item.number === wizard.currentStep) || steps[0])
const wizardProgressText = computed(() => `${wizard.completedSteps.length} / ${steps.length} 已完成`)
const cycleLabel = computed(() => ({
  'one-semester': '一學期',
  'one-year': '一年',
  'two-years': '兩年',
  custom: '自訂日期'
}[profile.cycleType] || '自訂日期'))
const endClassConfirmPhrase = computed(() => profile.name.trim() || '結束班級')
const canEndClass = computed(() => (
  endClassAcknowledged.value &&
  endClassConfirmText.value.trim() === endClassConfirmPhrase.value &&
  !endClassBusy.value
))

const firebaseDisplayStatus = computed(() => (
  firebaseConfigured.value ? cloudState.status : 'setup-required'
))
const syncStatusClass = computed(() => `sync-state-${firebaseDisplayStatus.value}`)
const syncStatusTitle = computed(() => ({
  'local-only': '本機模式',
  'setup-required': '尚未完成設定',
  'sign-in-required': '等待登入',
  connecting: '正在連線',
  syncing: '正在同步',
  synced: '同步完成',
  offline: '目前離線',
  conflict: '需要選擇資料',
  error: '同步發生問題'
}[firebaseDisplayStatus.value] || '同步狀態'))
const syncStatusMessage = computed(() => (
  firebaseConfigured.value
    ? cloudState.message
    : '請先完成設定精靈；貼上 Firebase Config 後才會顯示登入與同步狀態。'
))
const lastSyncText = computed(() => {
  if (!cloudState.lastSyncAt) return '尚未完成同步'
  const date = new Date(cloudState.lastSyncAt)
  if (Number.isNaN(date.getTime())) return '尚未完成同步'
  return `最後同步：${date.toLocaleString('zh-TW', { hour12: false })}`
})
const conflictCloudTime = computed(() => {
  if (!cloudState.conflictCloudUpdatedAt) return '時間不明'
  const date = new Date(cloudState.conflictCloudUpdatedAt)
  return Number.isNaN(date.getTime()) ? '時間不明' : date.toLocaleString('zh-TW', { hour12: false })
})

function showNotice(message) {
  notice.value = message
  window.setTimeout(() => { if (notice.value === message) notice.value = '' }, 3000)
}

function persistWizard() {
  const saved = saveFirebaseWizardProgress(wizard)
  Object.assign(wizard, saved)
}

function openWizard(reset = false) {
  wizardMessage.value = ''
  if (reset && !confirm('要重新開始設定精靈嗎？已保存的 Firebase Config 不會被刪除。')) return
  if (reset) Object.assign(wizard, { currentStep: 1, completedSteps: [], acknowledged: false })
  persistWizard()
  wizardOpen.value = true
}

function closeWizard() {
  if (wizardBusy.value) return
  persistWizard()
  wizardOpen.value = false
}

const FIRST_RUN_WIZARD_FLAG = 'classHelperOpenFirebaseWizardV1'

onMounted(() => {
  if (localStorage.getItem(FIRST_RUN_WIZARD_FLAG) !== 'true') return
  localStorage.removeItem(FIRST_RUN_WIZARD_FLAG)
  wizard.currentStep = firebaseConfigured.value ? 7 : Math.max(1, wizard.currentStep || 1)
  persistWizard()
  wizardOpen.value = true
})

function goToStep(step) {
  wizardMessage.value = ''
  wizard.currentStep = step
  persistWizard()
}

function completeCurrentStep() {
  if (!wizard.completedSteps.includes(wizard.currentStep)) wizard.completedSteps.push(wizard.currentStep)
  if (wizard.currentStep < 7) wizard.currentStep += 1
  persistWizard()
}

function previousStep() {
  if (wizard.currentStep > 1) wizard.currentStep -= 1
  persistWizard()
}

function applyCyclePreset() {
  if (profile.cycleType === 'custom') return
  const start = new Date(`${profile.startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return
  const end = new Date(start)
  if (profile.cycleType === 'one-semester') end.setMonth(end.getMonth() + 6)
  if (profile.cycleType === 'one-year') end.setFullYear(end.getFullYear() + 1)
  if (profile.cycleType === 'two-years') end.setFullYear(end.getFullYear() + 2)
  end.setDate(end.getDate() - 1)
  profile.endDate = end.toISOString().slice(0, 10)
}

function saveProfile() {
  Object.assign(profile, saveClassProfile(profile))
  classSummary.value = getClassDataSummary()
  showNotice('班級週期已儲存')
}

async function selectLocalMode() {
  if (!localRiskAccepted.value) return showNotice('請先勾選已了解本機模式風險')
  localStorage.setItem('classHelperLocalRiskAcknowledgedV1', 'true')
  syncBusy.value = true
  try {
    await chooseLocalStorageMode()
    storageMode.value = getStorageMode()
    showNotice('已使用本機模式；雲端資料不會被刪除')
  } finally {
    syncBusy.value = false
  }
}

async function selectFirebaseMode() {
  if (!testResult.value?.ok) {
    wizardOpen.value = true
    showNotice('請先完成設定精靈與連線測試')
    return
  }
  syncBusy.value = true
  try {
    storageMode.value = setStorageMode('firebase')
    const connected = await enableCloudSync({ interactive: true })
    storageMode.value = getStorageMode()
    showNotice(connected ? '個人 Firebase 同步已啟動' : cloudState.message)
  } catch (error) {
    showNotice(error?.message || '無法啟動個人 Firebase 同步')
  } finally {
    syncBusy.value = false
  }
}

function handleExport() {
  exportFullBackup()
  showNotice('班級備份已下載')
}

function openImportPicker() { importInput.value?.click() }

async function handleImport(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const replace = confirm('要以備份內容取代目前資料嗎？\n\n確定：先清除目前資料再還原。\n取消：保留目前資料並合併。')
    await importFullBackup(file, { replace })
    showNotice('備份已匯入，頁面即將重新整理')
    window.setTimeout(() => window.location.reload(), 800)
  } catch (error) {
    showNotice(error?.message || '匯入失敗')
  }
}

function openEndClassDialog() {
  endClassConfirmText.value = ''
  endClassAcknowledged.value = false
  endClassBackupDownloaded.value = false
  endClassOpen.value = true
}

function closeEndClassDialog() {
  if (endClassBusy.value) return
  endClassOpen.value = false
}

function handleEndClassBackup() {
  exportFullBackup()
  endClassBackupDownloaded.value = true
  showNotice('班級備份已下載；是否保留由老師自行決定')
}

async function handleEndClass() {
  if (!canEndClass.value) return
  if (storageMode.value === 'firebase' && cloudState.conflictPending) {
    showNotice('請先處理本機與雲端的資料衝突，再結束班級')
    return
  }
  endClassBusy.value = true
  try {
    endCurrentClass()
    const cloudSynced = storageMode.value === 'firebase' ? await syncNow({ force: true }) : true
    showNotice(storageMode.value === 'firebase'
      ? (cloudSynced ? '本機與雲端班級資料已清除，教師設定已保留' : '本機班級資料已清除；雲端會在恢復連線後更新')
      : '班級資料已清除，教師設定已保留')
    endClassOpen.value = false
    window.setTimeout(() => window.location.reload(), 900)
  } catch (error) {
    console.error(error)
    showNotice(error?.message || '結束班級失敗，資料尚未清除')
    endClassBusy.value = false
  }
}

function saveFirebaseConfigOnly() {
  try {
    const clean = savePersonalFirebaseConfig(firebaseConfigText.value, {
      appCheckSiteKey: appCheckSiteKeyText.value
    })
    activeFirebaseConfig.value = clean
    firebaseConfigText.value = configForTextarea(clean)
    appCheckSiteKeyText.value = clean.appCheckSiteKey || ''
    firebaseConfigured.value = true
    testResult.value = getFirebaseTestResult()
    if (!wizard.completedSteps.includes(6)) wizard.completedSteps.push(6)
    wizard.currentStep = 7
    wizardMessage.value = appCheckConfigured.value
      ? '✅ Firebase Config 與 App Check 設定已保存。現在可以登入 Google 並測試權杖與資料庫連線。'
      : '✅ Firebase Config 已保存。若日後啟用 App Check 強制執行，請先補上 Site Key；現在可以登入 Google 並測試連線。'
    persistWizard()
    showNotice(appCheckConfigured.value ? 'Firebase 與 App Check 設定已儲存在這台裝置' : '個人 Firebase 設定已儲存在這台裝置')
    return clean
  } catch (error) {
    const message = error?.message || 'Firebase Config 格式錯誤'
    wizardMessage.value = `⚠️ ${message}`
    showNotice(message)
    return null
  }
}

async function runConnectionTest() {
  wizardMessage.value = ''
  if (!firebaseConfigText.value.trim()) {
    wizardMessage.value = '⚠️ 尚未貼上 Firebase Config。請先回到第 6 步貼上並保存設定。'
    return
  }
  const config = saveFirebaseConfigOnly()
  if (!config) return
  wizardBusy.value = true
  wizardMessage.value = '正在確認 Google 登入與資料庫連線…'
  try {
    const result = await testTeacherFirebase(config)
    testResult.value = saveFirebaseTestResult(result)
    firebaseConfigured.value = true
    if (!wizard.completedSteps.includes(7)) wizard.completedSteps.push(7)
    wizard.currentStep = 7
    persistWizard()
    storageMode.value = setStorageMode('firebase')
    await enableCloudSync({ interactive: false })
    storageMode.value = getStorageMode()
    wizardMessage.value = result.reusedSession
      ? `✅ 已沿用目前登入帳號並完成測試：${result.email || result.displayName || 'Google 帳號'}。請按右下角「完成設定」，回到卡片確認同步狀態。`
      : `✅ 登入與連線測試成功：${result.email || result.displayName || 'Google 帳號'}。請按右下角「完成設定」，回到卡片確認同步狀態。`
    showNotice(`連線成功並已啟動同步：${result.email || result.displayName || 'Google 帳號'}`)
  } catch (error) {
    console.error(error)
    const messages = {
      'auth/unauthorized-domain': '目前網址尚未加入 Firebase 授權網域，請回到第 4 步設定。',
      'auth/operation-not-allowed': '尚未啟用 Google 登入，請回到第 4 步。',
      'auth/popup-closed-by-user': '你關閉了 Google 登入視窗，資料沒有變動。',
      'auth/popup-blocked': 'Safari 阻擋了 Google 登入視窗。請允許 localhost 的彈出式視窗後再試。',
      'auth/cancelled-popup-request': '上一個登入視窗尚未完成，請稍等一下再按一次。',
      'PERMISSION_DENIED': '資料庫拒絕存取，請檢查第 5 步安全規則與 App Check 強制狀態。',
      'appCheck/recaptcha-error': 'App Check 無法驗證目前網域，請檢查 reCAPTCHA Enterprise 網域與 Site Key。',
      'appCheck/fetch-status-error': 'App Check 無法取得權杖，請稍後重試並檢查 Site Key。'
    }
    const message = messages[error?.code] || messages[error?.message] || error?.message || '連線測試失敗'
    wizardMessage.value = `⚠️ ${message}`
    showNotice(message)
  } finally {
    wizardBusy.value = false
  }
}

async function copyRules() {
  try {
    await navigator.clipboard.writeText(FIREBASE_RULES)
    rulesCopied.value = true
    showNotice('安全規則已複製')
    setTimeout(() => { rulesCopied.value = false }, 1800)
  } catch { showNotice('無法自動複製，請手動選取規則') }
}

async function removeFirebaseConfig() {
  if (!confirm('移除這台裝置上的 Firebase 設定？這不會刪除 Firebase 專案中的資料。')) return
  syncBusy.value = true
  try {
    await signOutCloud()
    await chooseLocalStorageMode()
    removePersonalFirebaseConfig()
    storageMode.value = 'local'
    activeFirebaseConfig.value = null
    firebaseConfigText.value = ''
    appCheckSiteKeyText.value = ''
    firebaseConfigured.value = false
    testResult.value = null
    Object.assign(wizard, { currentStep: 1, completedSteps: [], acknowledged: false })
    persistWizard()
    showNotice('已移除個人 Firebase 設定並改回本機模式')
  } finally {
    syncBusy.value = false
  }
}

async function handleRetrySync() {
  syncBusy.value = true
  try {
    const connected = await retryCloudSync()
    showNotice(connected ? '已重新連接個人 Firebase' : cloudState.message)
  } finally {
    syncBusy.value = false
  }
}

async function handleSignInCloud() {
  syncBusy.value = true
  try {
    const connected = await signInCloud()
    storageMode.value = getStorageMode()
    showNotice(connected ? '登入成功，已啟動同步' : cloudState.message)
  } catch (error) {
    showNotice(error?.message || 'Google 登入失敗')
  } finally {
    syncBusy.value = false
  }
}

async function handleSyncNow() {
  syncBusy.value = true
  try {
    const synced = await syncNow()
    showNotice(synced ? '已完成同步' : cloudState.message)
  } finally {
    syncBusy.value = false
  }
}

async function handleSignOutCloud() {
  syncBusy.value = true
  try {
    await signOutCloud()
    showNotice('已登出；這台裝置的本機資料仍保留')
  } finally {
    syncBusy.value = false
  }
}

async function chooseConflictVersion(strategy) {
  syncBusy.value = true
  try {
    const resolved = await resolveSyncConflict(strategy)
    classSummary.value = getClassDataSummary()
    showNotice(resolved ? (strategy === 'cloud' ? '已使用雲端資料' : '已用這台裝置的資料更新雲端') : '尚未處理資料衝突')
  } catch (error) {
    showNotice(error?.message || '無法處理資料衝突')
  } finally {
    syncBusy.value = false
  }
}

</script>

<template>
  <div class="page wide-page data-center-page">
    <div class="page-title-row">
      <div>
        <h2>💾 資料與同步</h2>
        <p>老師永遠擁有自己的資料。這裡管理儲存方式、個人 Firebase、班級備份與班級週期。</p>
      </div>
      <span class="data-owner-badge">🔒 開發者不保存班級資料</span>
    </div>

    <section class="data-principle-card">
      <strong>班級助手的資料原則</strong>
      <p>預設使用本機模式；需要跨裝置時，由老師連接自己建立的 Firebase。切換模式不會偷偷刪除資料；只有老師主動完成「結束班級」確認時，才會清除目前班級資料。</p>
    </section>

    <div class="data-center-grid">
      <section class="card data-section storage-section">
        <div class="data-section-head">
          <div><span class="data-kicker">資料儲存方式</span><h3>選擇適合自己的模式</h3></div>
          <span class="mode-pill">目前：{{ storageMode === 'firebase' ? '個人 Firebase' : '本機模式' }}</span>
        </div>
        <div class="storage-mode-grid">
          <article class="mode-card" :class="{ active: storageMode === 'local' }">
            <div class="mode-card-title-row">
              <span class="mode-icon">💻</span>
              <h4>本機模式</h4>
              <span v-if="storageMode === 'local'" class="mode-selected-badge">✓ 目前使用</span>
            </div>
            <p>立即可用，不需登入；資料只存在目前瀏覽器與裝置。</p>
            <ul><li>適合單一裝置使用</li><li>不需設定 Firebase</li><li>應定期下載班級備份</li></ul>
            <label class="risk-check"><input v-model="localRiskAccepted" type="checkbox" /><span>我了解清除瀏覽器資料、重灌或換裝置可能造成資料無法復原。</span></label>
            <button type="button" class="data-primary mode-select-button" :disabled="syncBusy" @click="selectLocalMode">選擇本機模式</button>
          </article>
          <article class="mode-card firebase-mode-card" :class="{ active: storageMode === 'firebase' }">
            <div class="mode-card-title-row">
              <span class="mode-icon">☁️</span>
              <h4>個人 Firebase 模式</h4>
              <span v-if="storageMode === 'firebase'" class="mode-selected-badge">✓ 目前使用</span>
            </div>
            <p>資料存放在老師自己建立、自己管理的 Firebase 專案。</p>
            <ul><li>可跨電腦與手機同步</li><li>容量與權限由老師本人管理</li><li>開發者無法查看或復原資料</li></ul>
            <span class="setup-state" :class="{ ready: testResult?.ok }">{{ testResult?.ok ? `✅ 已連線：${testResult.projectId}` : firebaseConfigured ? '設定已保存，尚未測試' : '尚未完成設定' }}</span>
            <span class="app-check-state" :class="{ ready: testResult?.appCheckTokenVerified, pending: appCheckConfigured && !testResult?.appCheckTokenVerified }">{{ appCheckStatusText }}</span>

            <div class="firebase-sync-status" :class="syncStatusClass">
              <div class="firebase-sync-status-head">
                <span class="firebase-sync-dot" aria-hidden="true"></span>
                <div>
                  <strong>{{ syncStatusTitle }}</strong>
                  <span>{{ syncStatusMessage }}</span>
                </div>
              </div>
              <div class="firebase-sync-meta">
                <span>{{ lastSyncText }}</span>
                <span v-if="cloudState.email">{{ cloudState.email }}</span>
              </div>
              <div class="firebase-sync-actions">
                <button v-if="cloudState.status === 'sign-in-required'" type="button" class="data-primary" :disabled="syncBusy" @click="handleSignInCloud">登入 Google 並同步</button>
                <button v-if="['offline', 'error', 'setup-required'].includes(cloudState.status)" type="button" class="data-secondary" :disabled="syncBusy" @click="handleRetrySync">重新連線</button>
                <button v-if="storageMode === 'firebase' && cloudState.user && !cloudState.conflictPending" type="button" class="data-secondary" :disabled="syncBusy || cloudState.status === 'syncing'" @click="handleSyncNow">立即同步</button>
                <button v-if="cloudState.user" type="button" class="data-text-button" :disabled="syncBusy" @click="handleSignOutCloud">登出 Google</button>
              </div>
            </div>

            <div v-if="cloudState.conflictPending" class="firebase-conflict-box">
              <strong>⚠️ 本機與雲端都有不同資料</strong>
              <p>系統不會自行覆蓋。請先下載備份，再選擇要保留哪一份。</p>
              <div class="firebase-conflict-summary">
                <span>這台裝置：{{ cloudState.conflictLocalCount }} 組資料</span>
                <span>雲端：{{ cloudState.conflictCloudCount }} 組資料<br><small>{{ conflictCloudTime }}</small></span>
              </div>
              <div class="firebase-conflict-actions">
                <button type="button" class="data-secondary" @click="handleExport">先下載完整備份</button>
                <button type="button" class="data-secondary" :disabled="syncBusy" @click="chooseConflictVersion('cloud')">使用雲端資料</button>
                <button type="button" class="data-primary" :disabled="syncBusy" @click="chooseConflictVersion('local')">使用這台裝置</button>
              </div>
            </div>

            <div class="mode-card-actions">
              <button
                v-if="!testResult?.ok"
                type="button"
                class="data-primary"
                @click="openWizard(false)"
              >
                {{ firebaseConfigured ? '繼續設定精靈' : '開始設定精靈' }}
              </button>
              <button
                v-else-if="storageMode !== 'firebase'"
                type="button"
                class="data-primary"
                :disabled="syncBusy"
                @click="selectFirebaseMode"
              >
                啟用個人 Firebase
              </button>
              <button v-else type="button" class="data-secondary" disabled>✓ 個人 Firebase 已啟用</button>
            </div>
            <div v-if="firebaseConfigured" class="firebase-card-tools">
              <button type="button" class="data-text-button" @click="openWizard(true)">重新設定</button>
              <button type="button" class="data-text-button danger" @click="removeFirebaseConfig">移除這台裝置的設定</button>
            </div>
          </article>
        </div>
      </section>

      <section class="card data-section backup-section">
        <div class="data-section-head"><div><span class="data-kicker">可選安全網</span><h3>班級備份與還原</h3></div><span class="data-icon">💾</span></div>
        <p>備份只包含目前班級資料；不會收入 Firebase Config、登入測試、儲存模式或裝置偏好。</p>
        <div class="backup-actions"><button type="button" class="data-primary" @click="handleExport">下載班級備份</button><button type="button" class="data-secondary" @click="openImportPicker">匯入備份</button><input ref="importInput" class="sr-only" type="file" accept="application/json,.json" @change="handleImport" /></div>
        <p class="data-warning">備份完全自願。匯入時只處理班級資料，不會覆蓋老師的 Firebase 與介面設定。</p>
      </section>
    </div>

    <section class="card data-section lifecycle-section">
      <div class="data-section-head"><div><span class="data-kicker">班級生命週期</span><h3>依實際任教期間提醒</h3></div><span class="lifecycle-status" :class="lifecycleClass">{{ lifecycle.message }}</span></div>
      <div class="lifecycle-form">
        <label><span>班級名稱</span><input v-model.trim="profile.name" placeholder="例如：三年一班" /></label>
        <label><span>開始日期</span><input v-model="profile.startDate" type="date" @change="applyCyclePreset" /></label>
        <label><span>任教週期</span><select v-model="profile.cycleType" @change="applyCyclePreset"><option value="one-semester">一學期</option><option value="one-year">一年</option><option value="two-years">兩年</option><option value="custom">自訂日期</option></select></label>
        <label><span>預計結束日期</span><input v-model="profile.endDate" type="date" :disabled="profile.cycleType !== 'custom'" /></label>
        <label><span>提前提醒</span><select v-model.number="profile.reminderDays"><option :value="14">14 天前</option><option :value="30">30 天前</option><option :value="60">60 天前</option><option :value="90">90 天前</option></select></label>
      </div>
      <div class="lifecycle-footer"><span>目前設定：{{ cycleLabel }}。到期只提醒「延長」或「結束班級」，絕不自動刪除。</span><button type="button" class="data-primary" @click="saveProfile">儲存班級週期</button></div>
    </section>

    <section class="card data-section end-class-section">
      <div class="data-section-head">
        <div><span class="data-kicker">換班時使用</span><h3>結束目前班級</h3></div>
        <span class="end-class-count">{{ classSummary.studentCount }} 位學生・{{ classSummary.dataKeyCount }} 組班級資料</span>
      </div>
      <p>不建立站內歷史封存。老師換班時，可直接清除目前班級資料；需要留存的人，再自行下載一份班級備份。</p>
      <div class="end-class-choice-grid">
        <div class="end-class-list clear-list">
          <strong>結束後清除</strong>
          <span v-for="item in clearedDataItems" :key="item">✕ {{ item }}</span>
        </div>
        <div class="end-class-list keep-list">
          <strong>仍會保留</strong>
          <span v-for="item in preservedSettingItems" :key="item">✓ {{ item }}</span>
        </div>
      </div>
      <div class="end-class-actions">
        <button type="button" class="data-secondary" @click="handleExport">先下載班級備份（可選）</button>
        <button type="button" class="data-danger end-class-open-button" @click="openEndClassDialog">結束這個班級</button>
      </div>
      <p class="data-warning">班級助手不會替老師保留歷屆學生資料。清除完成後無法從網站內復原，除非老師先前自行保存備份檔。</p>
    </section>

    <div v-if="endClassOpen" class="end-class-overlay" @click.self="closeEndClassDialog">
      <section class="end-class-modal" role="dialog" aria-modal="true" aria-labelledby="endClassTitle">
        <button class="end-class-close" type="button" :disabled="endClassBusy" @click="closeEndClassDialog">×</button>
        <div class="end-class-modal-icon">🧹</div>
        <h2 id="endClassTitle">確定結束「{{ profile.name || '目前班級' }}」？</h2>
        <p>這會清除學生名單與目前班級的操作紀錄，但保留 Firebase、介面偏好，以及可重複使用的作息與工作模板。</p>

        <div class="end-class-backup-box">
          <div>
            <strong>備份不是必填</strong>
            <span>平常不需要保留舊班資料，可以直接略過。</span>
          </div>
          <button type="button" class="data-secondary" @click="handleEndClassBackup">{{ endClassBackupDownloaded ? '✓ 已下載一份備份' : '下載備份（可選）' }}</button>
        </div>

        <label class="end-class-acknowledge">
          <input v-model="endClassAcknowledged" type="checkbox" />
          <span>我了解這些班級資料將永久清除，且網站內沒有封存可供還原。</span>
        </label>

        <label class="end-class-confirm-field">
          <span>請輸入「<strong>{{ endClassConfirmPhrase }}</strong>」確認</span>
          <input v-model="endClassConfirmText" :placeholder="endClassConfirmPhrase" autocomplete="off" />
        </label>

        <div class="end-class-modal-actions">
          <button type="button" class="data-secondary" :disabled="endClassBusy" @click="closeEndClassDialog">取消</button>
          <button type="button" class="data-danger" :disabled="!canEndClass" @click="handleEndClass">{{ endClassBusy ? '正在清除…' : '永久清除並建立空白班級' }}</button>
        </div>
      </section>
    </div>

    <div v-if="wizardOpen" class="firebase-wizard-overlay" @click.self="closeWizard">
      <section class="firebase-wizard-modal" role="dialog" aria-modal="true" aria-label="Firebase 設定精靈">
        <button class="wizard-close" type="button" :disabled="wizardBusy" @click="closeWizard">×</button>
        <header class="wizard-header"><div><span>☁️ 個人雲端設定</span><h2>{{ currentStepInfo.number }}. {{ currentStepInfo.title }}</h2><p>設定只保存在這台裝置，班級助手開發者不會收到你的 Firebase Config 或班級資料。</p></div><strong>{{ wizardProgressText }}</strong></header>
        <div class="wizard-steps"><button v-for="step in steps" :key="step.number" type="button" :disabled="step.number === 7 && !firebaseConfigured" :title="step.number === 7 && !firebaseConfigured ? '請先完成第 6 步並保存 Firebase Config' : ''" :class="{ done: wizard.completedSteps.includes(step.number), active: wizard.currentStep === step.number }" @click="goToStep(step.number)"><span>{{ wizard.completedSteps.includes(step.number) ? '✓' : step.number }}</span>{{ step.short }}</button></div>

        <div class="wizard-content">
          <div v-if="wizardMessage" class="wizard-inline-message" role="status">{{ wizardMessage }}</div>
          <template v-if="wizard.currentStep === 1"><h3>建立老師自己的雲端專案</h3><ol><li>開啟 Firebase Console，使用老師自己的 Google 帳號。</li><li>按「建立專案」，名稱可用「班級助手－班級名稱」。</li><li>Google Analytics 可依需求選擇，不影響班級助手同步。</li></ol><a class="wizard-link" href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">開啟 Firebase Console ↗</a></template>
          <template v-else-if="wizard.currentStep === 2"><h3>新增 Web App</h3><ol><li>在專案總覽按 Web 圖示「&lt;/&gt;」。</li><li>暱稱可填「班級助手」。</li><li>不必勾選 Firebase Hosting；完成註冊即可。</li><li>先保留畫面中的 <code>firebaseConfig</code>，第 6 步會使用。</li></ol></template>
          <template v-else-if="wizard.currentStep === 3"><h3>建立 Realtime Database</h3><ol><li>左側「建構」→「Realtime Database」。</li><li>按「建立資料庫」，地區選離自己較近的位置。</li><li>可先選鎖定模式；第 5 步會貼上正式安全規則。</li><li>建立後確認 Web App 設定中出現 <code>databaseURL</code>。</li></ol></template>
          <template v-else-if="wizard.currentStep === 4"><h3>啟用 Google 登入</h3><ol><li>左側「建構」→「Authentication」→「開始使用」。</li><li>在登入方式啟用「Google」。</li><li>填入專案支援信箱並儲存。</li><li>到「設定」→「已授權的網域」，加入你實際使用班級助手的網域；本機測試請加入 <code>localhost</code>（只填 localhost，不要貼完整網址或路徑）。</li></ol></template>
          <template v-else-if="wizard.currentStep === 5"><h3>貼上安全規則</h3><p>這份規則只允許已登入的老師讀寫自己 UID 路徑下的資料。</p><pre class="rules-box">{{ FIREBASE_RULES }}</pre><button type="button" class="data-secondary" @click="copyRules">{{ rulesCopied ? '✓ 已複製' : '複製安全規則' }}</button><ol><li>Realtime Database →「規則」。</li><li>全選舊內容，貼上上方規則。</li><li>確認沒有紅色錯誤後按「發布」。</li></ol></template>
          <template v-else-if="wizard.currentStep === 6">
            <h3>貼上 Firebase Config 與 App Check</h3>
            <p>可直接按 Firebase 右下角的複製按鈕，將包含 <code>import</code>、<code>firebaseConfig</code> 與 <code>initializeApp</code> 的整段程式碼全部貼上；班級助手會自動找出正確設定。</p>
            <textarea v-model="firebaseConfigText" class="wizard-config-textarea" spellcheck="false" placeholder="const firebaseConfig = {\n  apiKey: '...',\n  authDomain: '...',\n  databaseURL: '...',\n  projectId: '...',\n  appId: '...'\n}"></textarea>
            <div class="wizard-app-check-box">
              <div>
                <strong>🛡️ reCAPTCHA Enterprise Site Key</strong>
                <span>啟用 App Check 時使用。這是可放在網頁前端的公開 Site Key，不是 Secret Key。</span>
              </div>
              <input v-model.trim="appCheckSiteKeyText" autocomplete="off" spellcheck="false" placeholder="例如：6Lc...（未啟用 App Check 可先留空）" />
              <small v-if="appCheckSource === 'built-in'">此部署已由管理者設定對應 Site Key，這一欄可留空。</small>
              <small v-else>其他老師若使用自己的 Firebase，必須在自己的 App Check 建立 Site Key，並貼在這裡。</small>
            </div>
            <button type="button" class="data-primary" @click="saveFirebaseConfigOnly">檢查並保存設定</button>
          </template>
          <template v-else><h3>登入並做一次安全測試</h3><p>首次登入可能會開啟 Google 帳號視窗；完成一次後，後續測試與同步會優先沿用目前登入狀態，不再反覆跳窗。測試會暫時在 <code>users／你的 UID／systemChecks</code> 寫入資料、讀回後立即刪除。</p><div v-if="testResult?.ok" class="wizard-success"><strong>✅ 測試成功</strong><span>{{ testResult.email }}</span><span>專案：{{ testResult.projectId }}</span><span>UID：{{ testResult.uid }}</span><span>App Check：{{ testResult.appCheckTokenVerified ? (testResult.appCheckDebug ? 'Debug 權杖有效' : '正式權杖有效') : appCheckConfigured ? '尚未驗證' : '未設定' }}</span><small>下一步：按右下角「完成設定」，再回到個人 Firebase 卡片確認「同步完成」。</small></div><button type="button" class="data-primary" :disabled="wizardBusy" @click="runConnectionTest">{{ wizardBusy ? '正在確認連線…' : testResult?.ok ? '再次驗證連線' : '登入 Google 並測試' }}</button></template>
        </div>

        <footer class="wizard-footer"><button type="button" class="data-secondary" :disabled="wizard.currentStep === 1 || wizardBusy" @click="previousStep">上一步</button><span>可以關閉精靈，進度會保留。</span><button v-if="wizard.currentStep < 7" type="button" class="data-primary" :disabled="wizardBusy" @click="completeCurrentStep">我已完成，下一步</button><button v-else type="button" class="data-primary" :disabled="!testResult?.ok || wizardBusy" @click="closeWizard">完成設定</button></footer>
      </section>
    </div>

    <div v-if="notice" class="data-center-toast" role="status">{{ notice }}</div>
  </div>
</template>

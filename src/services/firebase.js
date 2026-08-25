// ✅ HUA_APP_CHECK_ENTERPRISE_INTEGRATION_20260712：在存取 Authentication 與 Realtime Database 前啟動 App Check，正式站使用 reCAPTCHA Enterprise、本機使用 Debug Provider。
// ✅ HUA_FIREBASE_APP_INSTANCE_ISOLATION_20260712：不同 Firebase 專案使用不同 App 實例，避免切換設定時發生舊連線殘留或重複初始化。
// ✅ HUA_SAFARI_FIREBASE_POPUP_DIRECT_FIX_20260712：Google 登入視窗必須在按鍵事件中立即開啟，避免 Safari 將它判定為非使用者操作而阻擋。
// ✅ HUA_FIREBASE_EXISTING_SESSION_NO_POPUP_20260712：已登入時直接測試，不再重複開啟帳號視窗。
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth'
import { get, getDatabase, ref, remove, set } from 'firebase/database'

const APP_NAME_PREFIX = 'class-helper-personal-'
function builtInAppCheckSiteKey(config) {
  const configuredProject = String(import.meta.env.VITE_PERSONAL_FIREBASE_BUILTIN_APPCHECK_PROJECT_ID || '').trim()
  const configuredKey = String(import.meta.env.VITE_PERSONAL_FIREBASE_BUILTIN_APPCHECK_SITE_KEY || '').trim()
  return configuredProject && configuredKey && configuredProject === String(config?.projectId || '').trim()
    ? configuredKey
    : ''
}
const appCheckInstances = new Map()
let currentAppName = ''

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : {}
  return {
    apiKey: String(source.apiKey || '').trim(),
    authDomain: String(source.authDomain || '').trim(),
    databaseURL: String(source.databaseURL || '').trim().replace(/\/$/, ''),
    projectId: String(source.projectId || '').trim(),
    storageBucket: String(source.storageBucket || '').trim(),
    messagingSenderId: String(source.messagingSenderId || '').trim(),
    appId: String(source.appId || '').trim(),
    measurementId: String(source.measurementId || '').trim(),
    appCheckSiteKey: String(source.appCheckSiteKey || '').trim()
  }
}

function validateConfig(config) {
  const clean = normalizeConfig(config)
  const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'appId']
  const missing = required.filter(key => !clean[key])
  if (missing.length) throw new Error(`Firebase 設定缺少：${missing.join('、')}`)
  if (!/^[a-z0-9-]+$/i.test(clean.projectId)) throw new Error('projectId 格式不正確')
  if (!/^[a-z0-9.-]+$/i.test(clean.authDomain)) throw new Error('authDomain 格式不正確')
  if (!/^https:\/\/.+\.(firebaseio\.com|firebasedatabase\.app)$/i.test(clean.databaseURL)) {
    throw new Error('databaseURL 格式不正確，請從 Firebase 的 Web App 設定完整複製')
  }
  return clean
}

function signature(config) {
  const clean = normalizeConfig(config)
  return JSON.stringify({
    apiKey: clean.apiKey,
    authDomain: clean.authDomain,
    databaseURL: clean.databaseURL,
    projectId: clean.projectId,
    appId: clean.appId,
    appCheckSiteKey: resolveTeacherAppCheckSiteKey(clean)
  })
}


export function resolveTeacherAppCheckSiteKey(config) {
  const source = config && typeof config === 'object' ? config : {}
  const custom = String(source.appCheckSiteKey || '').trim()
  if (custom) return custom
  return builtInAppCheckSiteKey(source)
}

export function hasTeacherAppCheckConfig(config) {
  return Boolean(resolveTeacherAppCheckSiteKey(config))
}

export function getTeacherAppCheckSource(config) {
  if (String(config?.appCheckSiteKey || '').trim()) return 'personal'
  return builtInAppCheckSiteKey(config) ? 'built-in' : 'none'
}

function shouldUseDebugProvider() {
  if (typeof window === 'undefined') return false
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
}

function initializeTeacherAppCheck(app, config) {
  const siteKey = resolveTeacherAppCheckSiteKey(config)
  if (!siteKey) return { appCheck: null, appCheckEnabled: false, appCheckDebug: false }

  const cached = appCheckInstances.get(app.name)
  if (cached) return cached

  const debug = shouldUseDebugProvider()
  if (debug && typeof globalThis !== 'undefined') {
    // Firebase 會在瀏覽器 Console 顯示一次性 Debug Token；
    // 將該 Token 登記到自己的 Firebase App Check 後，本機開發才能在強制模式下使用。
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }

  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true
  })
  const services = { appCheck, appCheckEnabled: true, appCheckDebug: debug }
  appCheckInstances.set(app.name, services)
  return services
}

function shortHash(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function appNameFor(config) {
  return `${APP_NAME_PREFIX}${shortHash(signature(config))}`
}

// 這個函式刻意保持同步：登入按鍵觸發後，不能先等待其他 Promise，
// 否則 Safari 可能失去「使用者主動點擊」狀態並封鎖彈出視窗。
export function initializeTeacherFirebase(config) {
  const clean = validateConfig(config)
  const appName = appNameFor(clean)
  const existing = getApps().find(app => app.name === appName)
  const { appCheckSiteKey, ...firebaseOptions } = clean
  const app = existing || initializeApp(firebaseOptions, appName)
  currentAppName = appName

  const appCheckServices = initializeTeacherAppCheck(app, clean)
  const auth = getAuth(app)
  const provider = new GoogleAuthProvider()
  const database = getDatabase(app)
  return { app, auth, database, provider, config: clean, ...appCheckServices }
}

export function waitForTeacherAuth(auth) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)
  return new Promise(resolve => {
    let stop = () => {}
    stop = onAuthStateChanged(auth, user => {
      stop()
      resolve(user || null)
    }, () => {
      stop()
      resolve(null)
    })
  })
}

export async function signInTeacherFirebase(config, { forceChooser = false } = {}) {
  const services = initializeTeacherFirebase(config)

  // 已有有效登入狀態時直接沿用，不再打斷老師操作。
  if (services.auth.currentUser && !forceChooser) {
    return { ...services, user: services.auth.currentUser, reusedSession: true }
  }

  if (forceChooser) services.provider.setCustomParameters({ prompt: 'select_account' })

  // 首次登入仍必須立刻呼叫 signInWithPopup；不可在這之前 await。
  const credential = await signInWithPopup(services.auth, services.provider)
  if (!credential.user?.uid) throw new Error('Google 登入未完成')
  return { ...services, user: credential.user, reusedSession: false }
}

export async function testTeacherFirebase(config) {
  const services = await signInTeacherFirebase(config, { forceChooser: false })
  const user = services.user
  if (!user?.uid) throw new Error('Google 登入未完成')

  let appCheckTokenVerified = false
  if (services.appCheck) {
    const tokenResult = await getToken(services.appCheck, false)
    if (!tokenResult?.token) throw new Error('App Check 無法取得有效權杖')
    appCheckTokenVerified = true
  }

  const checkRef = ref(services.database, `users/${user.uid}/systemChecks/wizard`)
  const testValue = {
    ok: true,
    checkedAt: new Date().toISOString(),
    projectId: services.config.projectId
  }

  await set(checkRef, testValue)
  const snapshot = await get(checkRef)
  if (!snapshot.exists() || snapshot.val()?.ok !== true) {
    throw new Error('已登入，但無法讀回測試資料，請檢查 Database 與規則')
  }
  await remove(checkRef)

  return {
    ok: true,
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    projectId: services.config.projectId,
    appCheckEnabled: Boolean(services.appCheckEnabled),
    appCheckTokenVerified,
    appCheckDebug: Boolean(services.appCheckDebug),
    reusedSession: Boolean(services.reusedSession)
  }
}

export async function signOutTeacherFirebase(config) {
  const { auth } = initializeTeacherFirebase(config)
  await signOut(auth)
}

export function hasTeacherFirebaseApp() {
  return getApps().some(app => app.name.startsWith(APP_NAME_PREFIX))
}

export function getTeacherFirebaseApp() {
  if (currentAppName && getApps().some(app => app.name === currentAppName)) return getApp(currentAppName)
  return getApps().find(app => app.name.startsWith(APP_NAME_PREFIX)) || null
}

import { getApps, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const CENTRAL_APP_NAME = 'class-helper-optional-central-integration'
let centralServices
let emulatorConnected = false

function requiredEnv(name, env = import.meta.env) {
  const value = String(env[name] || '').trim()
  if (!value) throw new Error(`缺少班級平台中央 Firebase 設定：${name}`)
  return value
}

export function resolveCentralPortalConfig(env = import.meta.env) {
  const ownerEnabled = env.VITE_CLASS_HELPER_DEPLOYMENT_PROFILE === 'owner-parent-portal'
  if (!ownerEnabled) {
    throw new Error('安全停止：generic class-helper 不可初始化 owner central integration。')
  }
  const useEmulators = Boolean(env.DEV) && env.VITE_CENTRAL_USE_FIREBASE_EMULATORS === 'true'
  const centralCalendarEnabled = env.VITE_SHARED_CALENDAR_SOURCE_MODE === 'central'
  const centralScheduleEnabled = env.VITE_SHARED_SCHEDULE_SOURCE_MODE === 'central'
  if ((centralCalendarEnabled || centralScheduleEnabled) && !useEmulators) {
    throw new Error('安全停止：中央共享資料目前只允許連線到中央 Firebase Emulator。')
  }
  return {
    useEmulators,
    firebase: {
      apiKey: useEmulators ? 'demo-api-key' : requiredEnv('VITE_CENTRAL_FIREBASE_API_KEY', env),
      authDomain: useEmulators ? 'localhost' : requiredEnv('VITE_CENTRAL_FIREBASE_AUTH_DOMAIN', env),
      projectId: useEmulators
        ? (env.VITE_CENTRAL_FIREBASE_EMULATOR_PROJECT_ID || 'demo-class-helper-class-events')
        : requiredEnv('VITE_CENTRAL_FIREBASE_PROJECT_ID', env),
      storageBucket: useEmulators ? 'demo.invalid' : requiredEnv('VITE_CENTRAL_FIREBASE_STORAGE_BUCKET', env),
      messagingSenderId: useEmulators ? '000000000000' : requiredEnv('VITE_CENTRAL_FIREBASE_MESSAGING_SENDER_ID', env),
      appId: useEmulators ? '1:000000000000:web:class-helper-central' : requiredEnv('VITE_CENTRAL_FIREBASE_APP_ID', env),
    },
  }
}

export function getCentralPortalServices() {
  if (centralServices) return centralServices

  const config = resolveCentralPortalConfig()
  const app = getApps().find(candidate => candidate.name === CENTRAL_APP_NAME)
    || initializeApp(config.firebase, CENTRAL_APP_NAME)
  const auth = getAuth(app)
  const db = getFirestore(app)

  if (config.useEmulators && !emulatorConnected) {
    const authPort = Number(import.meta.env.VITE_CENTRAL_AUTH_EMULATOR_PORT || 9499)
    const firestorePort = Number(import.meta.env.VITE_CENTRAL_FIRESTORE_EMULATOR_PORT || 8580)
    if (authPort === 9099 || firestorePort === 8080) {
      throw new Error('安全停止：中央班級平台測試不得使用人工 Emulator 9099/8080。')
    }
    connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true })
    connectFirestoreEmulator(db, '127.0.0.1', firestorePort)
    emulatorConnected = true
  }

  centralServices = { app, auth, db, provider: new GoogleAuthProvider() }
  return centralServices
}

export function signInCentralPortalTeacher() {
  const { auth, provider } = getCentralPortalServices()
  if (import.meta.env.DEV && import.meta.env.VITE_CENTRAL_USE_FIREBASE_EMULATORS === 'true') {
    const email = import.meta.env.VITE_CENTRAL_EMULATOR_TEACHER_EMAIL || 'calendar.teacher@demo.invalid'
    const password = import.meta.env.VITE_CENTRAL_EMULATOR_TEACHER_PASSWORD || 'calendar-emulator-only'
    return signInWithEmailAndPassword(auth, email, password)
  }
  return signInWithPopup(auth, provider)
}

export function getCurrentCentralPortalUser() {
  return getCentralPortalServices().auth.currentUser
}

export function waitForCentralPortalSession() {
  const { auth } = getCentralPortalServices()
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  return new Promise(resolve => {
    let unsubscribe = () => {}
    unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe()
      resolve(user)
    })
  })
}

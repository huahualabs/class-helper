import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const profile = env.VITE_CLASS_HELPER_DEPLOYMENT_PROFILE || 'generic'
  if (!['generic', 'owner-parent-portal'].includes(profile)) {
    throw new Error(`Unknown class-helper deployment profile: ${profile}`)
  }
  if (profile === 'owner-parent-portal' && !String(env.VITE_CENTRAL_PORTAL_CLASS_ID || '').trim()) {
    throw new Error('Owner parent-portal integration requires VITE_CENTRAL_PORTAL_CLASS_ID.')
  }
  const ownerEnabled = profile === 'owner-parent-portal'
  const integrationTarget = (ownerPath, disabledPath) => fileURLToPath(new URL(
    ownerEnabled ? ownerPath : disabledPath,
    import.meta.url,
  ))
  return {
    plugins: [vue()],
    base: env.VITE_CLASS_HELPER_BASE_PATH || '/class-helper/',
    resolve: {
      alias: {
        '@owner-central-firebase': integrationTarget(
          './src/services/centralPortalFirebase.js',
          './src/integrations/disabled/centralPortalFirebase.js',
        ),
        '@owner-class-events-repository': integrationTarget(
          './src/services/classEventsRepository.js',
          './src/integrations/disabled/classEventsRepository.js',
        ),
        '@owner-class-schedule-repository': integrationTarget(
          './src/services/classScheduleRepository.js',
          './src/integrations/disabled/classScheduleRepository.js',
        ),
        '@owner-schedule-import': integrationTarget(
          './src/components/ScheduleImportPanel.vue',
          './src/integrations/disabled/OwnerScheduleImport.vue',
        ),
      },
    },
  }
})

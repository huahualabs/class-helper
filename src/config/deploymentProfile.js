export const DEPLOYMENT_PROFILES = Object.freeze({
  GENERIC: 'generic',
  OWNER_PARENT_PORTAL: 'owner-parent-portal',
})

export function resolveDeploymentProfile(env = import.meta.env) {
  return env.VITE_CLASS_HELPER_DEPLOYMENT_PROFILE === DEPLOYMENT_PROFILES.OWNER_PARENT_PORTAL
    ? DEPLOYMENT_PROFILES.OWNER_PARENT_PORTAL
    : DEPLOYMENT_PROFILES.GENERIC
}

export function requireOwnerIntegrationValue(name, env = import.meta.env) {
  if (resolveDeploymentProfile(env) !== DEPLOYMENT_PROFILES.OWNER_PARENT_PORTAL) return ''
  const value = String(env[name] || '').trim()
  if (!value) throw new Error(`Owner parent-portal integration 缺少必要設定：${name}`)
  return value
}

export const DEPLOYMENT_PROFILE = resolveDeploymentProfile()
export const OWNER_PARENT_PORTAL_ENABLED = DEPLOYMENT_PROFILE === DEPLOYMENT_PROFILES.OWNER_PARENT_PORTAL

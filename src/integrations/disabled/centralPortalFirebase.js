function disabled() {
  throw new Error('Owner parent-portal integration is disabled in the generic profile.')
}

export const getCentralPortalServices = disabled
export const getCurrentCentralPortalUser = () => null
export const waitForCentralPortalSession = disabled
export const signInCentralPortalTeacher = disabled

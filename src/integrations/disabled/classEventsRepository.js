function disabled() {
  throw new Error('Shared classEvents are disabled in the generic profile.')
}

export const classEventsRepository = Object.freeze({
  listClassEvents: disabled,
  createClassEvent: disabled,
  updateClassEvent: disabled,
  deleteClassEvent: disabled,
  verifyTeacherAccess: disabled,
})

function disabled() {
  throw new Error('Shared classSchedules are disabled in the generic profile.')
}

export const classScheduleRepository = Object.freeze({
  loadClassSchedule: disabled,
  saveClassSchedule: disabled,
})

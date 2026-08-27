export const MAX_ATTENDANCE_PERIODS = 7

const LABELS = Object.freeze(['第一節', '第二節', '第三節', '第四節', '第五節', '第六節', '第七節'])

export function isAttendancePeriod(period) {
  return period?.kind === 'class'
}

export function attendancePeriods(allPeriods = []) {
  return allPeriods.filter(isAttendancePeriod).slice(0, MAX_ATTENDANCE_PERIODS)
}

export function getAttendancePeriodNumber(period, allPeriods = []) {
  const index = attendancePeriods(allPeriods).findIndex((item) => item.id === period?.id)
  return index < 0 ? null : index + 1
}

export function attendancePeriodLabel(period, allPeriods = []) {
  const number = getAttendancePeriodNumber(period, allPeriods)
  if (number) return LABELS[number - 1]
  return isAttendancePeriod(period) ? '超出正式節次' : (period?.label || period?.id || '')
}

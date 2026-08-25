const CLASS_EVENT_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

export function parseClassEventTime(value) {
  if (value == null || value === '') return ''
  if (typeof value !== 'string') return ''
  if (!CLASS_EVENT_TIME_PATTERN.test(value)) return ''
  const [hour, minute] = value.split(':')
  return { hour, minute }
}

export function composeClassEventTime(hour, minute) {
  if (hour === '' && minute === '') return ''
  const value = `${hour}:${minute}`
  return CLASS_EVENT_TIME_PATTERN.test(value) ? value : ''
}

export function formatClassEventTime(value, locale = undefined) {
  const parts = parseClassEventTime(value)
  if (!parts) return ''
  const date = new Date(2000, 0, 1, Number(parts.hour), Number(parts.minute))
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function validateClassEventTimes(startTime, endTime) {
  const parsedStart = parseClassEventTime(startTime)
  const parsedEnd = parseClassEventTime(endTime)

  if ((startTime && !parsedStart) || (endTime && !parsedEnd)) return { valid: false, message: '' }
  if (parsedStart && parsedEnd && endTime < startTime) {
    return { valid: false, message: '結束時間不能早於開始時間。' }
  }

  return {
    valid: true,
    message: '',
    startTime,
    endTime,
  }
}

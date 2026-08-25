function cleanStudentName(value = '') {
  return String(value).replace(/^\s*(?:座號)?\d{1,2}[.、．)）\- ]+/, '').trim()
}

export function parseStudentLine(line, index) {
  const raw = String(line || '').trim()
  const match = raw.match(/^(\d{1,2})[\s、.．,\-]+(.+)$/)
  const seatNo = match ? Number(match[1]) : index + 1
  const name = match ? match[2].trim() : cleanStudentName(raw)
  return {
    key: `${seatNo}__${name}`,
    seatNo,
    name,
    raw,
  }
}

export function parseStudentRoster(value = '') {
  return String(value)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(parseStudentLine)
}

export function rosterIdentityIssues(roster = []) {
  const seenKeys = new Set()
  const seenSeats = new Set()
  const issues = []
  for (const student of roster) {
    if (seenKeys.has(student.key)) issues.push(`重複學生：${student.seatNo} ${student.name}`)
    else seenKeys.add(student.key)
    if (seenSeats.has(student.seatNo)) issues.push(`重複座號：${student.seatNo}`)
    else seenSeats.add(student.seatNo)
  }
  return [...new Set(issues)]
}

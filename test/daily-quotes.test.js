import { createHash } from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/Dashboard.vue', import.meta.url), 'utf8')
const block = source.match(/const dailyMessages = (\[[\s\S]*?\n\])/)[1]
const messages = JSON.parse(block.replace(/,? \/\/ 原始 [^\n]+/g, ',').replace(/,\s*\]/, ']'))
const provenance = [...block.matchAll(/\/\/ 原始 (\d+)｜([^｜\n]+)｜([^\n]+)/g)]
  .map(([, id, topic, family]) => ({ id: Number(id), topic, family: family.trim() }))
const chinese = text => [...text.matchAll(/\p{Script=Han}/gu)].map(match => match[0]).join('')
const normalize = text => text.replace(/[\p{P}\p{Z}\s]/gu, '')
const grams = text => new Set(Array.from({ length: text.length - 1 }, (_, i) => text.slice(i, i + 2)))
function similarity(a, b) {
  const left = grams(normalize(a)), right = grams(normalize(b))
  return 2 * [...left].filter(part => right.has(part)).length / (left.size + right.size)
}

function editSimilarity(a, b) {
  a = normalize(a)
  b = normalize(b)
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + Number(a[i - 1] !== b[j - 1]))
    }
    previous = next
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length)
}

test('daily messages contain exactly 365 complete, unique pairs with unchanged fields', () => {
  assert.equal(messages.length, 365)
  for (const message of messages) {
    assert.deepEqual(Object.keys(message).sort(), ['question', 'quote'])
    assert.ok(message.quote.trim())
    assert.ok(message.question.trim().endsWith('？'))
  }
  for (const field of ['quote', 'question']) {
    assert.equal(new Set(messages.map(message => normalize(message[field]))).size, 365)
  }
})

test('all 365 original IDs survive; the original 53 themes each retain five pairs', () => {
  assert.deepEqual(provenance.map(item => item.id).sort((a, b) => a - b), Array.from({ length: 365 }, (_, i) => i + 1))
  const topics = new Set()
  for (let first = 101; first <= 361; first += 5) {
    const group = provenance.filter(item => item.id >= first && item.id < first + 5)
    assert.equal(group.length, 5)
    assert.equal(new Set(group.map(item => item.topic)).size, 1)
    topics.add(group[0].topic)
  }
  assert.equal(topics.size, 53)
})

test('review table preserves each edited quote/question pairing and original source ID', () => {
  const review = readFileSync(new URL('../docs/daily-quotes-review.md', import.meta.url), 'utf8')
  const rows = review.split('\n').filter(line => /^\| \d+ \|/.test(line))
  assert.equal(rows.length, 365)
  for (const row of rows) {
    const [id, day, topic, oldQuote, quote, oldQuestion, question] = row.split('|').slice(1, -1).map(s => s.trim())
    assert.equal(provenance[Number(day) - 1].id, Number(id))
    assert.equal(provenance[Number(day) - 1].topic, topic)
    assert.deepEqual(messages[Number(day) - 1], { quote, question })
    assert.ok(oldQuote && oldQuestion)
  }
})

test('repeated original templates do not return; length remains editorial guidance', () => {
  for (const message of messages) {
    assert.doesNotMatch(message.quote, /真正的|練習一點|放進今天的行動裡|不是一句口號|常常藏在/)
  }
})

test('near-duplicate wording and concentrated sentence openings are flagged for review', () => {
  for (const field of ['quote', 'question']) {
    const starts = new Map(), ends = new Map()
    messages.forEach(message => {
      const text = chinese(message[field])
      starts.set(text.slice(0, 4), (starts.get(text.slice(0, 4)) || 0) + 1)
      ends.set(text.slice(-4), (ends.get(text.slice(-4)) || 0) + 1)
    })
    assert.ok(Math.max(...starts.values()) <= 6, `${field}: repeated openings`)
    assert.ok(Math.max(...ends.values()) <= 8, `${field}: repeated endings`)
    for (let i = 0; i < messages.length; i++) {
      for (let j = i + 1; j < messages.length; j++) {
        assert.ok(similarity(messages[i][field], messages[j][field]) < .65,
          `${field}: review days ${i + 1}/${j + 1}: ${messages[i][field]} / ${messages[j][field]}`)
        assert.ok(editSimilarity(messages[i][field], messages[j][field]) < .8,
          `${field}: nearly identical wording on days ${i + 1}/${j + 1}`)
      }
    }
  }
})

test('topics and related families stay separated including the year boundary', () => {
  for (let day = 0; day < 365; day++) {
    for (let gap = 1; gap <= 14; gap++) {
      const other = (day + gap) % 365
      assert.notEqual(provenance[day].topic, provenance[other].topic, `topic at ${day + 1}/${other + 1}`)
      if (gap <= 2) assert.notEqual(provenance[day].family, provenance[other].family, `family at ${day + 1}/${other + 1}`)
    }
  }
})

test('existing date function visits all 365 pairs in common years and wraps on leap day 366', () => {
  const indexFunction = source.match(/function getDailyQuoteIndex\(date\) \{[\s\S]*?\n\}/)[0]
  const stripFunction = source.match(/function stripTime\(date\) \{[\s\S]*?\n\}/)[0]
  const getIndex = new Function('dailyMessages', `${stripFunction}\n${indexFunction}\nreturn getDailyQuoteIndex`)(messages)
  for (const year of [2026, 2027, 2029]) {
    const indexes = Array.from({ length: 365 }, (_, day) => getIndex(new Date(year, 0, day + 1)))
    assert.deepEqual(indexes, Array.from({ length: 365 }, (_, i) => i))
    assert.equal(getIndex(new Date(year, 11, 31, 23, 59)), 364)
  }
  const leap = Array.from({ length: 366 }, (_, day) => getIndex(new Date(2028, 0, day + 1)))
  assert.equal(new Set(leap).size, 365)
  assert.equal(leap[365], 0)
  assert.equal(getIndex(new Date(2028, 11, 31, 23, 59)), 0)
})

// DAILY_QUOTES_REFINEMENT_SCOPE: freeze the 250 pairs outside this approved edit.
test('115-pair refinement leaves the other 250 pairs and their order unchanged', () => {
  const approved = new Set([1,4,9,10,13,18,21,23,30,33,36,37,39,43,48,49,51,52,57,59,63,65,66,68,69,71,72,73,77,79,81,93,94,96,98,101,102,104,111,112,113,114,124,128,129,132,134,138,140,143,144,150,154,156,158,165,184,186,191,192,197,198,200,201,203,204,208,213,214,215,216,218,223,228,234,235,238,241,247,248,250,251,257,258,261,265,266,268,271,272,273,276,286,290,292,295,296,297,298,299,302,303,310,311,324,325,331,333,337,344,346,359,360,361,363])
  const untouched = messages.map((message, index) => ({ ...provenance[index], ...message })).filter(item => !approved.has(item.id))
  assert.equal(untouched.length, 250)
  assert.equal(createHash('sha256').update(JSON.stringify(untouched)).digest('hex'), '6229aaa0442161c47247be7b9099f90f66d1faf9f65f0af0bdf764fcb16f733c')
  assert.equal(messages[provenance.findIndex(item => item.id === 51)].quote, '勇敢不是不害怕，而是害怕時還願意試試看。')
})

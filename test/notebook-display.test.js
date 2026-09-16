import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { computed, reactive, ref, watch, nextTick, effectScope } from 'vue'
import { parseStudentRoster } from '../src/domain/studentRoster.js'

// Run the actual component logic with memory-only storage; never load cloudSync.
function componentLogic(file, exports, values = {}) {
  const source = readFileSync(new URL(`../src/views/${file}.vue`, import.meta.url), 'utf8')
    .match(/<script setup>([\s\S]*?)<\/script>/)[1]
    .replace(/^import .*$/gm, '')
  const data = new Map(Object.entries(values))
  const dependencies = {
    computed, reactive, ref, watch, onMounted() {}, onBeforeUnmount() {},
    parseStudentRoster, CLOUD_DATA_UPDATED_EVENT: 'test-cloud-refresh',
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
    window: { dispatchEvent() {} },
    document: { body: { style: {} }, documentElement: { style: {} } },
    setTimeout() {},
    console: { warn() {} }
  }
  const scope = effectScope()
  const api = scope.run(() => new Function(...Object.keys(dependencies), `${source}\nreturn {${exports}}`)(...Object.values(dependencies)))
  return { ...api, data, stop: () => scope.stop() }
}

function notebook(t) {
  const api = componentLogic('Notebook', 'boards,hiddenCompleted,undoSteps,visibleStudentIndexes,studentStatus,boardStats,toggleStatus,setAll,undoBoardStep,canUndoBoard,weeklyRecords,refreshNotebookFromCloud', {
    students: '1 王小明\n2 林小安\n3 陳小美\n4 李小文'
  })
  t.after(api.stop)
  return api
}

test('filter preserves identities, unconfigured students, and stored data', async t => {
  const n = notebook(t), board = n.boards[0]
  n.toggleStatus(board, 0) // missing
  n.toggleStatus(board, 1); n.toggleStatus(board, 1) // fix
  n.toggleStatus(board, 2); n.toggleStatus(board, 2); n.toggleStatus(board, 2) // ok
  await nextTick()
  const before = JSON.stringify([...n.data])
  n.hiddenCompleted[board.id] = true
  assert.deepEqual(n.visibleStudentIndexes(board), [0, 1, 3])
  assert.deepEqual(n.boardStats(board), { missing: 1, fix: 1, ok: 1, none: 1 })
  await nextTick()
  assert.equal(JSON.stringify([...n.data]), before)
  n.hiddenCompleted[board.id] = false
  assert.deepEqual(n.visibleStudentIndexes(board), [0, 1, 2, 3])
})

test('undo completed student restores pending status and weekly record through existing persistence', async t => {
  const n = notebook(t), board = n.boards[0]
  n.toggleStatus(board, 0); n.toggleStatus(board, 0)
  const pending = n.weeklyRecords.value.find(r => r.status === 'fix')
  n.toggleStatus(board, 0)
  n.hiddenCompleted[board.id] = true
  assert.equal(pending.resolved, true)
  n.undoBoardStep(board)
  assert.equal(n.studentStatus(board, 0), 'fix')
  assert.equal(pending.resolved, false)
  assert.ok(n.visibleStudentIndexes(board).includes(0))
  assert.equal(n.canUndoBoard(board), false)
  await nextTick()
  assert.ok(Object.values(JSON.parse(n.data.get('notebookBoardsV2'))[0].statuses).includes('fix'))
  assert.equal(JSON.parse(n.data.get('notebookWeeklyRecordsV2')).find(r => r.status === 'fix').resolved, false)
})

test('undo to unset keeps history and later pending status reopens the same record', t => {
  const n = notebook(t), board = n.boards[0]
  n.toggleStatus(board, 0)
  n.undoBoardStep(board)
  assert.equal(n.studentStatus(board, 0), 'none')
  assert.equal(n.weeklyRecords.value.length, 1)
  assert.equal(n.weeklyRecords.value[0].resolved, true)
  n.toggleStatus(board, 0)
  assert.equal(n.weeklyRecords.value.length, 1)
  assert.equal(n.weeklyRecords.value[0].resolved, false)
})

test('batch completion is one undo step; filtering all completed allows recovery', t => {
  const n = notebook(t), board = n.boards[0]
  n.toggleStatus(board, 0)
  n.setAll(board, 'ok')
  n.hiddenCompleted[board.id] = true
  assert.deepEqual(n.visibleStudentIndexes(board), [])
  n.undoBoardStep(board)
  assert.equal(n.studentStatus(board, 0), 'missing')
  assert.equal(n.studentStatus(board, 1), 'none')
  assert.deepEqual(n.visibleStudentIndexes(board), [0, 1, 2, 3])
})

test('related cloud updates invalidate undo; unrelated updates do not', t => {
  const n = notebook(t), board = n.boards[0]
  n.toggleStatus(board, 0)
  n.refreshNotebookFromCloud({ detail: { keys: ['className'] } })
  assert.equal(n.canUndoBoard(board), true)
  n.refreshNotebookFromCloud({ detail: { keys: ['students'] } })
  assert.equal(n.canUndoBoard(board), false)
})

test('vertical contact rendering keeps all consecutive digits together without changing text', t => {
  const d = componentLogic('Dashboard', 'contactTextParts')
  t.after(d.stop)
  for (const [text, groups] of [
    ['數重第2、3頁', ['2', '3']],
    ['數重第12、13頁', ['12', '13']],
    ['習作第24、25頁', ['24', '25']],
    ['第10、11、35、100頁', ['10', '11', '35', '100']],
    ['第１２、１００頁', ['１２', '１００']],
    ['<b>第12頁</b>', ['12']]
  ]) {
    const parts = d.contactTextParts(text)
    assert.equal(parts.map(p => p.text).join(''), text)
    assert.deepEqual(parts.filter(p => p.digits).map(p => p.text), groups)
  }
})

test('page abbreviations form a single group without matching inside English words', t => {
  const d = componentLogic('Dashboard', 'contactTextParts')
  t.after(d.stop)
  for (const reference of ['p.2', 'p.12', 'p.87', 'p.100', 'P.12']) {
    const text = `作業${reference}`
    const parts = d.contactTextParts(text)
    assert.equal(parts.map(part => part.text).join(''), text)
    assert.deepEqual(parts.filter(part => part.pageReference).map(part => part.text), [reference])
    assert.equal(parts.some(part => part.digits), false)
  }
  for (const text of ['stop.87', 'help.12', 'P.12abc', 'apple', 'pencil', 'p.', 'p.abc']) {
    const parts = d.contactTextParts(text)
    assert.equal(parts.map(part => part.text).join(''), text)
    assert.equal(parts.some(part => part.pageReference), false)
  }
  const parts = d.contactTextParts('作業p.87，第12、13頁與第24、25頁')
  assert.deepEqual(parts.filter(part => part.digits).map(part => part.text), ['12', '13', '24', '25'])
})

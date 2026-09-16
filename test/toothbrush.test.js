import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { renderToString } from 'vue/server-renderer'
import { parseStudentRoster } from '../src/domain/studentRoster.js'

const source = readFileSync(new URL('../src/views/Toothbrush.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const template = source.match(/<template>([\s\S]*?)<\/template>/)[1]
const render = new Function('Vue', compile(template, { mode: 'function', prefixIdentifiers: true }).code)(Vue)
const names = [...script.matchAll(/^(?:const|let|function) (\w+)/gm)].map(m => m[1])

function page(t) {
  const data = new Map([['students', '3 王小明\n8 林小安'], ['toothbrushSoundEnabled', 'false']])
  const mounted = [], unmounted = [], intervals = new Map()
  const dependencies = {
    ...Vue, parseStudentRoster,
    onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => unmounted.push(fn),
    localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) },
    window: {
      setInterval(fn, delay) { assert.equal(delay, 1000); intervals.set(1, fn); return 1 },
      clearInterval(id) { intervals.delete(id) }
    },
    setTimeout() {}, console: { warn() {} }
  }
  const scope = Vue.effectScope()
  const api = scope.run(() => new Function(...Object.keys(dependencies), script + '\nreturn {' + names.join(',') + '}')(...Object.values(dependencies)))
  mounted.forEach(fn => fn())
  const stop = () => { unmounted.forEach(fn => fn()); scope.stop() }
  t.after(stop)
  return { ...api, data, intervals, stop, html: () => renderToString(Vue.createSSRApp({ setup: () => api, render })) }
}

test('ordinary day toggles preserve keyed records, fixed seats and all completed cards', async t => {
  const p = page(t)
  p.selectedDate.value = '2026-09-16'
  const order = p.visibleStudents.value.map(s => s.key)
  p.toggleMouth(0)
  assert.equal(p.mouthState(0), 'tooth')
  p.toggleMouth(0)
  assert.equal(p.mouthState(0), 'none')
  p.toggleDesk(0)
  assert.equal(p.isDeskComplete(0), true)
  p.toggleDesk(0)
  assert.equal(p.isDeskComplete(0), false)
  for (let i = 0; i < 2; i++) { p.toggleMouth(i); p.toggleDesk(i) }
  await Vue.nextTick()
  assert.equal(p.remainingCount.value, 0)
  assert.equal(p.completionPrompted['toothbrush-2026-09-16'], true)
  assert.deepEqual(p.visibleStudents.value.map(s => s.key), order)
  const html = await p.html()
  assert.equal((html.match(/class="tracking-card /g) || []).length, 2)
  assert.equal((html.match(/✅ 已完成/g) || []).length, 2)
  assert.equal((html.match(/✅ 消毒/g) || []).length, 2)
  assert.ok(html.includes('>3</span>') && html.includes('>8</span>'))
  assert.ok(html.indexOf('王小明') < html.indexOf('林小安'))
  const saved = JSON.parse(p.data.get('toothbrushRecords'))['2026-09-16']
  assert.equal(saved['3__王小明'].desk, true)
  assert.equal(saved[0], undefined)
  p.toggleDesk(0)
  await Vue.nextTick()
  assert.equal(p.remainingCount.value, 1)
  assert.equal(p.isStudentComplete(0), false)
  assert.equal(p.visibleStudents.value.length, 2)
})

test('Tuesday requires rinse and disinfection and retains the existing three-state cycle', async t => {
  const p = page(t)
  p.selectedDate.value = '2026-09-15'
  p.toggleDesk(0)
  assert.equal(p.mouthState(0), 'none')
  p.toggleMouth(0)
  assert.equal(p.mouthState(0), 'tooth')
  assert.equal(p.isStudentComplete(0), false)
  p.toggleMouth(0)
  assert.equal(p.mouthState(0), 'rinse')
  assert.equal(p.isStudentComplete(0), true)
  p.toggleDesk(0)
  assert.equal(p.isStudentComplete(0), false)
  p.toggleDesk(0)
  assert.equal(p.isStudentComplete(0), true)
  p.toggleMouth(0)
  assert.equal(p.mouthState(0), 'none')
  assert.equal(p.isStudentComplete(0), false)
  assert.equal(p.visibleStudents.value.length, 2)
})

test('local clock and rendered reminders obey every boundary without changing stored records', async t => {
  const p = page(t)
  p.selectedDate.value = '2020-01-01'
  await Vue.nextTick()
  await p.html()
  await Vue.nextTick()
  const before = JSON.stringify([...p.data])
  for (const [time, phase] of [['11:49', ''], ['11:50', 'prepare'], ['11:59', 'prepare'], ['12:00', ''], ['12:19', ''], ['12:20', 'finish'], ['12:29', 'finish'], ['12:30', '']]) {
    const [h, m] = time.split(':').map(Number)
    p.now.value = new Date(2026, 8, 16, h, m)
    assert.equal(p.clockText.value, time + ':00')
    assert.equal(p.lunchPhase.value, phase, time)
    const html = await p.html()
    assert.equal(html.includes('安靜坐好、洗手、準備餐具、打菜'), phase === 'prepare', time)
    assert.equal(html.includes('謝謝所有努力工作，讓我們吃到這餐的人！'), phase === 'prepare', time)
    assert.equal(html.includes('刷牙、消毒、抬餐'), phase === 'finish', time)
    assert.equal(html.includes('準備開飯囉！'), phase === 'prepare', time)
    assert.equal(html.includes('收尾時間，把握速度！'), phase === 'finish', time)
  }
  await Vue.nextTick()
  assert.equal(JSON.stringify([...p.data]), before)
  for (const [h, m, s, expected] of [[5, 2, 7, '05:02:07'], [15, 29, 37, '15:29:37'], [15, 29, 59, '15:29:59'], [15, 30, 0, '15:30:00']]) {
    p.now.value = new Date(2026, 8, 16, h, m, s)
    assert.equal(p.clockText.value, expected)
  }
  p.intervals.get(1)()
  assert.ok(Math.abs(p.now.value.getTime() - Date.now()) < 1000)
  p.stop()
  assert.equal(p.intervals.size, 0)
})

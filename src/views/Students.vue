<script setup>
// ✅ HUA_STUDENTS_ONE_SCREEN_MOBILE_REVIEW_20260710：此頁已加入桌機一頁式與手機響應式檢查。
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { CLOUD_DATA_UPDATED_EVENT } from '../services/cloudSync'
import { parseStudentRoster, rosterIdentityIssues } from '../domain/studentRoster'

const className = ref(localStorage.getItem('className') || '')
const studentText = ref(localStorage.getItem('students') || '')


// ✅ HUA_FIREBASE_STUDENTS_LIVE_SYNC_20260711：名單與班級名稱可在手機、桌機共用。
function refreshStudentsFromCloud(event) {
  const keys = new Set(event?.detail?.keys || [])
  if (keys.size === 0 || keys.has('className')) {
    className.value = localStorage.getItem('className') || ''
  }
  if (keys.size === 0 || keys.has('students')) {
    studentText.value = localStorage.getItem('students') || ''
  }
}

onMounted(() => {
  window.addEventListener(CLOUD_DATA_UPDATED_EVENT, refreshStudentsFromCloud)
})

onBeforeUnmount(() => {
  window.removeEventListener(CLOUD_DATA_UPDATED_EVENT, refreshStudentsFromCloud)
})

const students = computed(() => parseStudentRoster(studentText.value))
const identityIssues = computed(() => rosterIdentityIssues(students.value))

const seatSummary = computed(() => {
  if (students.value.length === 0) return '尚未建立名單'
  const seatNos = students.value.map(student => student.seatNo)
  const min = Math.min(...seatNos)
  const max = Math.max(...seatNos)
  return `${min}～${max} 號，共 ${students.value.length} 位學生`
})

watch(className, value => {
  localStorage.setItem('className', value)
})

watch(studentText, value => {
  localStorage.setItem('students', value)
})

function clearStudents() {
  if (confirm('確定要清空學生名單嗎？')) {
    studentText.value = ''
  }
}

function loadExampleWithEmptyNumbers() {
  studentText.value = [
    '1 王小明',
    '2 李小華',
    '3 陳小安',
    '15 張小宇',
    '21 林小美',
    '22 黃小晴'
  ].join('\n')
}
</script>

<template>
  <div class="page students-page">
    <div class="page-title-row">
      <div>
        <h2>👨‍🎓 學生管理</h2>
        <p>建立全班共用名單。座號可以不連續，空號不會影響後續功能。</p>
      </div>
    </div>

    <div class="student-editor-grid">
      <section class="card compact-card">
        <h3>🏫 班級名稱</h3>
        <input v-model="className" placeholder="例如：三年五班" />
      </section>

      <section class="card compact-card student-import-card">
        <div class="section-head">
          <div>
            <h3>📋 學生名單</h3>
            <p class="hint">可輸入「座號＋姓名」，例如：1 王小明、21 林小美。</p>
          </div>
          <button class="tiny soft-button" @click="loadExampleWithEmptyNumbers">範例</button>
        </div>

        <textarea
          v-model="studentText"
          placeholder="1 王小明&#10;2 李小華&#10;15 張小宇&#10;21 林小美"
        ></textarea>

        <div v-if="identityIssues.length" class="identity-warning" role="alert">
          <strong>名單中有重複識別，請先修正：</strong>
          <span v-for="issue in identityIssues" :key="issue">{{ issue }}</span>
        </div>

        <div class="student-actions">
          <p class="count">{{ seatSummary }}</p>
          <button class="danger" @click="clearStudents">清空名單</button>
        </div>
      </section>
    </div>

    <section class="card" v-if="students.length > 0">
      <div class="section-head">
        <div>
          <h3>✅ 名單預覽</h3>
          <p class="hint">以一致、溫暖的姓名卡片呈現，全班名單一眼就能確認。</p>
        </div>
        <span class="student-total">{{ students.length }} 位</span>
      </div>

      <div class="student-card-grid">
        <article
          v-for="student in students"
          :key="student.seatNo + student.name"
          class="student-card"
        >
          <span class="seat-number">{{ String(student.seatNo).padStart(2, '0') }}</span>
          <strong class="student-name">{{ student.name }}</strong>
        </article>
      </div>
    </section>

    <section class="card empty-state" v-else>
      <div>🌱</div>
      <h3>名單可以先空著</h3>
      <p>等分班名單確定後，再一次貼上即可。</p>
    </section>
  </div>
</template>

<style scoped>
.students-page {
  max-width: 1100px;
}

.identity-warning {
  display: grid;
  gap: 4px;
  margin-top: 10px;
  padding: 12px;
  border-radius: 14px;
  background: #fff1f2;
  color: #9f2d24;
}

.student-editor-grid {
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  gap: 18px;
  align-items: start;
}

input,
textarea {
  width: 100%;
  border: 2px solid #dceee6;
  border-radius: 16px;
  padding: 14px;
  font-size: 16px;
  margin-top: 10px;
  background: #fffdfa;
  color: #243b53;
}

textarea {
  min-height: 170px;
  resize: vertical;
  line-height: 1.7;
}

h3 {
  margin-top: 0;
}

.count {
  font-weight: 900;
  color: #2f6f57;
}

.student-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.danger {
  background: #e9897e;
}

.soft-button {
  background: #f4fbf7;
  color: #2f6f57;
  border: 1px solid #cfe9dd;
}

.student-total {
  background: #dff3ea;
  color: #2f6f57;
  border-radius: 999px;
  padding: 8px 12px;
  font-weight: 900;
  white-space: nowrap;
}

.student-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.student-card {
  min-height: 86px;
  background: #fffaf2;
  border: 1px solid #eadfce;
  border-radius: 20px;
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  box-shadow: 0 6px 18px rgba(92, 74, 49, 0.08);
}

.student-card:hover {
  transform: translateY(-2px);
  transition: 0.18s ease;
  box-shadow: 0 10px 24px rgba(92, 74, 49, 0.12);
}

.seat-number {
  min-width: 42px;
  height: 28px;
  background: #efe2cc;
  color: #6a5538;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.04em;
}

.student-name {
  display: block;
  width: 100%;
  font-size: 18px;
  color: #263238;
  margin-top: 8px;
  line-height: 1.25;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.empty-state {
  text-align: center;
  color: #667085;
}

.empty-state div {
  font-size: 52px;
}

@media (max-width: 900px) {
  .student-editor-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .students-page {
    max-width: 100%;
  }

  .student-actions,
  .section-head {
    align-items: stretch;
    flex-direction: column;
  }

  .student-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .student-card {
    min-height: 80px;
    border-radius: 18px;
    padding: 12px 10px;
  }

  .student-name {
    font-size: 16px;
  }

  .seat-number {
    min-width: 38px;
    height: 26px;
    font-size: 13px;
  }
}


/* ✅ HUA_STUDENTS_ONE_SCREEN_MOBILE_REVIEW_20260710
   學生名單：桌機方格可讀、手機兩欄不爆版。 */
@media (min-width: 981px) and (max-height: 820px) {
  .student-editor-grid {
    gap: 14px !important;
  }

  .student-card-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)) !important;
    gap: 10px !important;
  }

  .student-card {
    min-height: 74px !important;
    padding: 10px 8px !important;
  }

  .student-name {
    font-size: 16px !important;
    margin-top: 6px !important;
  }
}

@media (max-width: 420px) {
  .student-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }
}

</style>

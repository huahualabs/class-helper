<script setup>
// ✅ HUA_CONTACT_DATE_IN_HEADING_20260710：日期移到「聯絡簿」標題後方，並移除中央分隔線。
// ✅ HUA_VERTICAL_BOOK_DATE_NOTE_LINES_FIX_20260710：日期重排、提示放大置底、移除聯絡簿分隔線。
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { CLOUD_DATA_UPDATED_EVENT } from '../services/cloudSync'

const className = ref(localStorage.getItem('className') || '')
const studentSource = ref(localStorage.getItem('students') || '')


// ✅ HUA_HOME_CONTACT_BOOK_OPTIONAL_20260710：可選的直式聯絡事項，手機可直接編輯。
const showHomeSettings = ref(false)
const isEditingContactBook = ref(false)
const homeDisplay = ref(loadJson('classHelperHomeDisplay', {
  contactBook: true,
  dailyQuote: true,
  reflection: true,
  contactLayout: 'horizontal'
}))
const contactBook = ref(loadJson('classHelperContactBook', {
  homework: '',
  carry: '',
  reminder: ''
}))


// ✅ HUA_FIREBASE_DASHBOARD_LIVE_SYNC_20260711：手機編修聯絡簿後，教室桌機首頁立即更新。
function refreshDashboardFromCloud(event) {
  const keys = new Set(event?.detail?.keys || [])
  if (keys.size === 0 || keys.has('className')) {
    className.value = localStorage.getItem('className') || ''
  }
  if (keys.size === 0 || keys.has('students')) {
    studentSource.value = localStorage.getItem('students') || ''
  }
  if (keys.size === 0 || keys.has('classHelperHomeDisplay')) {
    homeDisplay.value = loadJson('classHelperHomeDisplay', {
      contactBook: true,
      dailyQuote: true,
      reflection: true,
      contactLayout: 'horizontal'
    })
  }
  if (keys.size === 0 || keys.has('classHelperContactBook')) {
    contactBook.value = loadJson('classHelperContactBook', {
      homework: '',
      carry: '',
      reminder: ''
    })
  }
}

onMounted(() => {
  window.addEventListener(CLOUD_DATA_UPDATED_EVENT, refreshDashboardFromCloud)
})

onBeforeUnmount(() => {
  window.removeEventListener(CLOUD_DATA_UPDATED_EVENT, refreshDashboardFromCloud)
})

const contactSections = computed(() => [
  { key: 'homework', icon: '📚', title: '作業', items: toLines(contactBook.value.homework) },
  { key: 'carry', icon: '🎒', title: '攜帶物品', items: toLines(contactBook.value.carry) },
  { key: 'reminder', icon: '📌', title: '提醒', items: toLines(contactBook.value.reminder) }
])

const mergedContactItems = computed(() =>
  contactSections.value.flatMap(section => section.items)
)

const isVerticalContactLayout = computed(() =>
  homeDisplay.value.contactLayout === 'vertical'
)

const verticalDateParts = computed(() => {
  const date = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return {
    year: `${date.getFullYear()}年`,
    monthDay: `${date.getMonth() + 1}月${date.getDate()}日`,
    week: `星期${week}`
  }
})

watch(homeDisplay, value => {
  localStorage.setItem('classHelperHomeDisplay', JSON.stringify(value))
}, { deep: true })

watch(contactBook, value => {
  localStorage.setItem('classHelperContactBook', JSON.stringify(value))
}, { deep: true })

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '')
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback
  } catch {
    return fallback
  }
}

function toLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

// CONTACT_DIGIT_GROUPS：數字、p. 頁碼、單字母課次只在顯示時分組，原始文字保持不變。
function contactTextParts(value) {
  return String(value).split(/((?<![A-Za-z0-9_])(?:[pP]\.[0-9]+|[A-Za-z][0-9]+)(?![A-Za-z0-9_])|[0-9０-９]+)/u).filter(Boolean).map(text => ({
    text,
    digits: /^[0-9０-９]+$/u.test(text),
    pageReference: /^[pP]\.[0-9]+$/u.test(text),
    lessonReference: /^[A-Za-z][0-9]+$/u.test(text)
  }))
}

function finishContactBookEditing() {
  isEditingContactBook.value = false
}

// DAILY_QUOTES_GRADE3：365 組以 3771583 原始配對逐句修訂；原始編號與主題供追溯。
const dailyMessages = [
  {"quote":"答案和大家不同，也說說你的理由。","question":"你願意怎麼說明自己的想法？"}, // 原始 300｜自信｜學習探索
  {"quote":"螢幕時間到了，和它說聲明天見。","question":"關掉螢幕後，你想做什麼？"}, // 原始 135｜自律｜自我管理
  {"quote":"把機會留給別人，也可能聽到沒想過的答案。","question":"哪次換別人試試看，結果讓你很驚喜？"}, // 原始 333｜輪流｜生活日常
  {"quote":"溫柔也有力量，能讓難過的人安心。","question":"照顧別人時，哪件事不容易？"}, // 原始 094｜同理｜相處理解
  {"quote":"累了看看身旁，我們一起努力。","question":"誰陪你完成過一件難事？"}, // 原始 089｜合作｜互助感謝
  {"quote":"有人記得你愛吃什麼，心裡甜甜的。","question":"誰記得你的一個小喜好？"}, // 原始 357｜幸福｜勇氣期待
  {"quote":"從一數到十，給心情轉個彎。","question":"慢慢數數後，你的呼吸有變嗎？"}, // 原始 289｜冷靜｜心情照顧
  {"quote":"葉子背面，也有值得看的小祕密。","question":"一片葉子的兩面有什麼不同？"}, // 原始 207｜好奇｜學習探索
  {"quote":"每個人都不一樣，才有這麼多故事可聽。","question":"朋友和你哪裡不同，卻讓你很喜歡？"}, // 原始 165｜接納｜相處理解
  {"quote":"事情沒做好，原因值得找一找。","question":"這次不順利，是哪一步卡住？"}, // 原始 169｜反省｜自我管理
  {"quote":"有禮貌的人，會讓身邊的人感到舒服。","question":"別人怎麼對待你，會讓你覺得很舒服？"}, // 原始 033｜禮貌｜生活日常
  {"quote":"偷偷做好事，心裡也會亮亮的。","question":"你做過什麼好事，當時沒讓別人知道？"}, // 原始 079｜服務｜互助感謝
  {"quote":"努力暫時看不見，別急著灰心。","question":"什麼事練了一陣子才有進步？"}, // 原始 003｜學習｜學習探索
  {"quote":"多聽一句話，可能少一場誤會。","question":"哪次多聽一下就明白了？"}, // 原始 136｜耐心｜勇氣期待
  {"quote":"氣還沒消，可以說我需要一點時間。","question":"別人道歉後，你還難過怎麼辦？"}, // 原始 343｜原諒｜心情照顧
  {"quote":"長大也包括，知道什麼時候該求助。","question":"哪次求助讓你學會新的事？"}, // 原始 220｜成長｜學習探索
  {"quote":"想偷看答案時，先試著自己想。","question":"忍不住想看答案時，能先做什麼？"}, // 原始 133｜自律｜自我管理
  {"quote":"作品不像你的，也有他的用心。","question":"同學的作品哪裡和你的不同？"}, // 原始 125｜尊重｜相處理解
  {"quote":"上課專心一點點，收穫就會多一點點。","question":"有哪次你認真聽了，發現原來這麼有趣？"}, // 原始 021｜專注｜學習探索
  {"quote":"晚上早點睡，明早眼睛不賴床。","question":"睡前做什麼有助於按時睡覺？"}, // 原始 275｜健康｜生活日常
  {"quote":"笑話好不好笑，也看看別人的臉。","question":"有人笑不出來時，該怎麼辦？"}, // 原始 108｜同理｜相處理解
  {"quote":"多一點關心，班級更像個家。","question":"在班上，什麼事讓你覺得溫暖？"}, // 原始 058｜關懷｜互助感謝
  {"quote":"約定臨時做不到，提早讓對方知道。","question":"約好的事突然改變，你心裡會怎樣？"}, // 原始 265｜信用｜自我管理
  {"quote":"想種一片花園，先種好一盆花。","question":"為了願望，你願意開始哪個行動？"}, // 原始 365｜夢想｜勇氣期待
  {"quote":"一句道歉，不一定很長，卻可以很真心。","question":"哪一次道歉，讓你覺得對方很在乎你？"}, // 原始 337｜道歉｜心情照顧
  {"quote":"先想好從哪裡開始，事情就沒那麼難了。","question":"你喜歡先想好再做，還是一邊做一邊想？"}, // 原始 234｜規劃｜學習探索
  {"quote":"小事做仔細，大事也能放心交給你。","question":"你願意接下哪件新任務？"}, // 原始 017｜責任｜自我管理
  {"quote":"會整理、會負責，就是長大的證明。","question":"哪樣物品已經由你自己整理？"}, // 原始 048｜生活習慣｜生活日常
  {"quote":"一句好話，能讓別人開心很久。","question":"你收過哪句暖暖的話？"}, // 原始 024｜友善｜相處理解
  {"quote":"心情不只一種，期待也可能緊張。","question":"你曾同時有哪兩種心情？"}, // 原始 285｜情緒｜心情照顧
  {"quote":"慢慢來也沒關係，穩穩地做，就會越來越好。","question":"哪件事讓你覺得，慢慢來反而做得更好？"}, // 原始 001｜學習｜學習探索
  {"quote":"圖書排整齊，借書的人好找書。","question":"怎樣排書能幫大家找到想看的？"}, // 原始 199｜服務｜互助感謝
  {"quote":"漏做了願意補上，別人也會看見你的用心。","question":"有沒有哪件漏掉的事，你後來主動補好了？"}, // 原始 258｜承擔｜自我管理
  {"quote":"需要的幫忙不同，公平也有不同做法。","question":"受傷的人多一點幫助，公平嗎？"}, // 原始 181｜公平｜相處理解
  {"quote":"同學說得慢，也讓他說完整。","question":"你說話時，有人一直催你，你會有什麼感覺？"}, // 原始 138｜耐心｜勇氣期待
  {"quote":"爬坡會喘，停一下還能接著走。","question":"繼續努力前，你需要哪種休息？"}, // 原始 225｜堅持｜學習探索
  {"quote":"答應自己的事，也算是一個約定。","question":"你和自己約定過什麼？"}, // 原始 134｜自律｜自我管理
  {"quote":"大家守規矩，玩起來才安心。","question":"遊戲少了規矩，會發生什麼事？"}, // 原始 029｜守序｜生活日常
  {"quote":"想想誰為你多做了一點，心裡會暖暖的。","question":"別人照顧你時，你能回應什麼？"}, // 原始 143｜感恩｜互助感謝
  {"quote":"故事聽到最後，也許答案不一樣。","question":"哪個故事的結尾讓你意外？"}, // 原始 155｜傾聽｜相處理解
  {"quote":"桌上少一樣玩具，心思多留一點。","question":"你的桌上有什麼可以先收起來？"}, // 原始 202｜專注｜學習探索
  {"quote":"請、謝謝、對不起，讓相處更舒服。","question":"哪句禮貌用語你最想多練習？"}, // 原始 316｜禮貌｜生活日常
  {"quote":"答應的事情努力做到，會讓人更信任你。","question":"有人把重要的事交給你時，你有什麼感覺？"}, // 原始 111｜責任｜自我管理
  {"quote":"球沒進籃框，姿勢卻比上次穩。","question":"沒成功的嘗試裡，你看見什麼進步？"}, // 原始 352｜樂觀｜勇氣期待
  {"quote":"合作時，不用每一步都照自己的意思。","question":"和別人一起做事，你最不習慣的是什麼？"}, // 原始 128｜合作｜互助感謝
  {"quote":"把會做的列出來，你比想的能幹。","question":"有什麼事是你做起來很有把握的？"}, // 原始 298｜自信｜學習探索
  {"quote":"心裡還有誤會，找個時間好好談。","question":"在哪裡談心比較不受打擾？"}, // 原始 174｜修復｜心情照顧
  {"quote":"說好會做到的事，對方會放在心上。","question":"別人記得和你的約定時，你有什麼感覺？"}, // 原始 093｜信用｜自我管理
  {"quote":"學習卡住了，可以換個方向想。","question":"哪題換個想法就懂了？"}, // 原始 047｜彈性｜學習探索
  {"quote":"和你不一樣，不代表有什麼不好。","question":"遇到不熟悉的習慣，你想問什麼？"}, // 原始 186｜包容｜相處理解
  {"quote":"看書久了，讓眼睛望望遠方。","question":"窗外最遠的東西是什麼？"}, // 原始 277｜休息｜心情照顧
  {"quote":"還不熟的動作，可以多練幾回。","question":"哪個動作你想再練一次？"}, // 原始 211｜練習｜學習探索
  {"quote":"走廊慢慢走，轉角先看一眼。","question":"在轉角跑太快，可能發生什麼？"}, // 原始 267｜安全｜生活日常
  {"quote":"想變成怎樣的人，從今天做起。","question":"你欣賞的人有哪個好習慣？"}, // 原始 055｜選擇｜自我管理
  {"quote":"緊張也沒關係，先跨出一步。","question":"有什麼事讓你緊張，卻又很想試？"}, // 原始 101｜勇氣｜勇氣期待
  {"quote":"午餐能上桌，背後有好多雙手。","question":"一份午餐需要哪些人的幫忙？"}, // 原始 142｜感恩｜互助感謝
  {"quote":"不喜歡被碰，可以清楚說請停下。","question":"別人不停手時，你可以找誰幫忙？"}, // 原始 177｜界線｜相處理解
  {"quote":"心思跑遠了，發現它跑去哪裡也很有趣。","question":"最近什麼事，讓你想著想著就忘了身邊的事？"}, // 原始 201｜專注｜學習探索
  {"quote":"自己按時做完，就能安心去玩。","question":"你想讓大人少催哪件事？"}, // 原始 085｜自律｜自我管理
  {"quote":"種子還沒發芽，再給它幾天。","question":"等發芽時，你可以觀察什麼？"}, // 原始 137｜耐心｜勇氣期待
  {"quote":"安靜聽一分鐘，教室有什麼聲音？","question":"你聽到平常沒注意的哪種聲音？"}, // 原始 330｜安靜｜生活日常
  {"quote":"送同學一個微笑，陪他放輕鬆。","question":"什麼時候一個微笑能幫上忙？"}, // 原始 046｜友善｜相處理解
  {"quote":"心情有起伏，也能好好說出來。","question":"你會用哪個詞形容現在的心情？"}, // 原始 095｜情緒｜心情照顧
  {"quote":"影子忽長忽短，是誰在變魔術？","question":"你發現過影子做出什麼有趣的樣子？"}, // 原始 208｜好奇｜學習探索
  {"quote":"願意守信用的人，會讓人放心。","question":"你最放心把東西交給誰？"}, // 原始 082｜信用｜自我管理
  {"quote":"大家的點子拼一拼，作品更有趣。","question":"兩個不同點子能怎麼合在一起？"}, // 原始 130｜合作｜互助感謝
  {"quote":"不會沒關係，願意學就有機會。","question":"有沒有什麼事，你原本不會，後來卻學會了？"}, // 原始 077｜學習｜學習探索
  {"quote":"遊戲換個玩法，讓走得慢的人也能玩。","question":"怎麼調整遊戲，大家才玩得到？"}, // 原始 189｜包容｜相處理解
  {"quote":"適當休息不是偷懶，而是讓自己恢復力量。","question":"累的時候，你怎麼休息最舒服？"}, // 原始 276｜休息｜心情照顧
  {"quote":"時間留給重要的事，不必一直趕。","question":"哪些事重要，哪些事可以晚點做？"}, // 原始 236｜時間｜自我管理
  {"quote":"練習不只是多做幾次，也要想想哪裡能改。","question":"你試過換個方法，反而更順手嗎？"}, // 原始 215｜練習｜學習探索
  {"quote":"想當畫家，先把眼前的小花畫下來。","question":"想做的工作需要練哪些本領？"}, // 原始 362｜夢想｜勇氣期待
  {"quote":"替同學扶住門，也是貼心的幫忙。","question":"什麼時候扶住門能幫到人？"}, // 原始 041｜服務｜互助感謝
  {"quote":"我不喜歡這樣，可以平靜說出口。","question":"哪種情況需要說出你的感受？"}, // 原始 160｜表達｜相處理解
  {"quote":"進門先敲敲，等人回應再進去。","question":"哪些地方進去前需要敲門？"}, // 原始 317｜禮貌｜生活日常
  {"quote":"清單寫三件，做完一件畫個勾。","question":"你的三件事清單會寫什麼？"}, // 原始 233｜規劃｜學習探索
  {"quote":"球打到別人，停下來看看他。","question":"玩球碰傷人時，該怎麼處理？"}, // 原始 260｜承擔｜自我管理
  {"quote":"圖書館裡，腳步也輕一點。","question":"除了說話，哪些動作會發出聲音？"}, // 原始 327｜安靜｜生活日常
  {"quote":"別人提醒你，先聽再想有沒有道理。","question":"哪種提醒最容易讓你不想聽？"}, // 原始 308｜謙虛｜學習探索
  {"quote":"困難像陰天，雲也會慢慢散。","question":"心情低落時，什麼能帶來一點希望？"}, // 原始 348｜希望｜勇氣期待
  {"quote":"吵完架後，想想自己說了什麼。","question":"哪句話是你希望當時沒說的？"}, // 原始 167｜反省｜自我管理
  {"quote":"班級變好，是靠每個人一點一點做到的。","question":"你喜歡班上的哪個地方？"}, // 原始 030｜合作｜互助感謝
  {"quote":"別人誠心改過，可以再給一次機會。","question":"什麼行動會讓你願意重新相信？"}, // 原始 342｜原諒｜心情照顧
  {"quote":"讓你害怕的秘密，要找信任的大人說。","question":"你信任、也找得到的大人有哪些？"}, // 原始 180｜界線｜相處理解
  {"quote":"去年的衣服短了，本領也長了嗎？","question":"和去年相比，你多會了什麼？"}, // 原始 217｜成長｜學習探索
  {"quote":"承認自己做錯，需要一點勇氣。","question":"承認錯誤時，最擔心什麼？"}, // 原始 034｜誠實｜自我管理
  {"quote":"聽聽別人說，也會有新發現。","question":"誰的說法讓你想到新點子？"}, // 原始 022｜傾聽｜相處理解
  {"quote":"看懂問題，有時比急著找到答案更重要。","question":"你曾經急著回答，後來才發現聽錯問題嗎？"}, // 原始 059｜學習｜學習探索
  {"quote":"物品各有家，用完送回去。","question":"哪樣東西最容易在教室迷路？"}, // 原始 075｜整理｜生活日常
  {"quote":"朋友請假回來，告訴他漏了什麼。","question":"你能幫請假的同學補上哪些消息？"}, // 原始 193｜關懷｜互助感謝
  {"quote":"勇敢不是不害怕，而是害怕時還願意試試看。","question":"害怕的時候，誰陪著你會讓你安心一點？"}, // 原始 051｜勇氣｜勇氣期待
  {"quote":"先停一下再回應，常常能做出更好的決定。","question":"你曾經太快回答，後來又改變想法嗎？"}, // 原始 286｜冷靜｜心情照顧
  {"quote":"把時間用好，就是送給自己的禮物。","question":"你最希望把時間留給什麼事？"}, // 原始 081｜時間｜自我管理
  {"quote":"同學輸了球，先陪他坐一會。","question":"朋友輸球難過，你會說什麼？"}, // 原始 107｜同理｜相處理解
  {"quote":"你可以不快，但要記得不要放棄。","question":"做得慢時，什麼能鼓勵你？"}, // 原始 020｜堅持｜學習探索
  {"quote":"大家都想玩得開心，規則也要照顧每個人。","question":"你玩過讓人覺得不公平的遊戲嗎？"}, // 原始 324｜守序｜生活日常
  {"quote":"陽光曬暖了背，停一下感受看看。","question":"你喜歡曬太陽，還是吹涼涼的風？"}, // 原始 359｜幸福｜勇氣期待
  {"quote":"抱怨先放一旁，動手做一點。","question":"你嫌麻煩的事，能先做哪一步？"}, // 原始 045｜自律｜自我管理
  {"quote":"留意別人的長處，會發現身邊有好多厲害的人。","question":"有誰的本領是你後來才發現的？"}, // 原始 302｜欣賞｜互助感謝
  {"quote":"贏了說聲謝謝，別笑輸的人。","question":"比賽贏了，你想對對手說什麼？"}, // 原始 307｜謙虛｜學習探索
  {"quote":"不熟悉的節日，請同學說給你聽。","question":"你想認識哪個家庭的節日活動？"}, // 原始 190｜包容｜相處理解
  {"quote":"放下不開心，不必一直綁住自己。","question":"哪件小事你想慢慢放下？"}, // 原始 341｜原諒｜心情照顧
  {"quote":"讀得快不一定懂得多，讀懂更有意思。","question":"你有沒有讀第二次，才發現有趣地方的經驗？"}, // 原始 203｜專注｜學習探索
  {"quote":"好的習慣，是每天小小選擇累積出來的。","question":"有哪個好習慣已經不用人催？"}, // 原始 037｜生活習慣｜生活日常
  {"quote":"照顧班上的盆栽，別只記得第一天。","question":"怎樣提醒自己持續照顧植物？"}, // 原始 115｜責任｜自我管理
  {"quote":"記不住的時候，也是在發現自己還不熟的地方。","question":"哪樣東西你以前老是忘，現在卻記得很清楚？"}, // 原始 213｜練習｜學習探索
  {"quote":"等火氣小一點，再談怎麼解決。","question":"不生氣以後，你對同一件事的想法有變嗎？"}, // 原始 290｜冷靜｜心情照顧
  {"quote":"多一個人幫忙，班上更輕鬆。","question":"班上哪件工作需要幫手？"}, // 原始 014｜服務｜互助感謝
  {"quote":"好好聽、慢慢想，再清楚說。","question":"聽、想、說，你最想練哪一步？"}, // 原始 086｜學習｜學習探索
  {"quote":"夢想可以慢慢變，認識自己多一點。","question":"你以前和現在的夢想一樣嗎？"}, // 原始 364｜夢想｜勇氣期待
  {"quote":"說到做到，會讓別人放心把事情交給你。","question":"哪個約定會影響到別人？"}, // 原始 261｜信用｜自我管理
  {"quote":"午休有人睡了，聊天留到醒來。","question":"別人休息時，你可以安靜做什麼？"}, // 原始 329｜安靜｜生活日常
  {"quote":"跑得快和唱得好，都是拿手本領。","question":"除了功課，你還擅長什麼？"}, // 原始 040｜接納｜相處理解
  {"quote":"十分鐘不算多，也能讀完幾頁書。","question":"一小段空檔，你想用來做什麼？"}, // 原始 237｜時間｜自我管理
  {"quote":"笑一笑不是裝沒事，是給自己喘口氣。","question":"什麼笑話能讓你放鬆又不傷人？"}, // 原始 355｜樂觀｜勇氣期待
  {"quote":"好好對待別人，也照顧彼此心情。","question":"你喜歡別人怎麼對待你？"}, // 原始 042｜尊重｜相處理解
  {"quote":"吵架以後，還能慢慢把關係修好。","question":"和朋友鬧彆扭後，你想先做什麼？"}, // 原始 171｜修復｜心情照顧
  {"quote":"先做手上能做的，再看看下一步。","question":"現在能開始的是哪一件事？"}, // 原始 092｜規劃｜學習探索
  {"quote":"寫張小卡，把感謝交到他手裡。","question":"你的感謝卡想畫上什麼？"}, // 原始 145｜感恩｜互助感謝
  {"quote":"今天也一起把班級變成更溫暖的地方。","question":"你想為同學留下什麼好心情？"}, // 原始 098｜友善｜相處理解
  {"quote":"心裡知道對的事，就照著做。","question":"沒人看見時，你會怎麼做？"}, // 原始 090｜誠實｜自我管理
  {"quote":"答案查到了，還想追問什麼呢？","question":"一個答案又讓你想到哪個問題？"}, // 原始 210｜好奇｜學習探索
  {"quote":"說好不再取笑，就從下一句話改起。","question":"怎樣讓別人看見你的道歉是認真的？"}, // 原始 340｜道歉｜心情照顧
  {"quote":"小心一點，是在保護自己，也保護別人。","question":"哪一次你多注意了一下，讓大家平安沒事？"}, // 原始 268｜安全｜生活日常
  {"quote":"好玩的遊戲規則，教給還不會的人。","question":"教別人玩遊戲，要從哪裡說起？"}, // 原始 315｜分享｜互助感謝
  {"quote":"別人的成績，不會改變你學會了什麼。","question":"不看分數時，你會怎麼發現自己的進步？"}, // 原始 073｜自律｜自我管理
  {"quote":"期待的那一天，可以先做點準備。","question":"你正期待什麼？能先準備哪一件？"}, // 原始 350｜希望｜勇氣期待
  {"quote":"別人的一次評語，不是你的全部。","question":"別人說你做得不好時，你心裡是什麼感覺？"}, // 原始 299｜自信｜學習探索
  {"quote":"分點心前，先數清楚有幾個人。","question":"點心不夠一人一份時，怎麼分？"}, // 原始 182｜公平｜相處理解
  {"quote":"做得順的時候，也想想用了什麼方法。","question":"哪個好方法值得留到下次？"}, // 原始 170｜反省｜自我管理
  {"quote":"不用樣樣都會，還能慢慢學。","question":"有什麼是你還想學的？"}, // 原始 012｜學習｜學習探索
  {"quote":"把事情說清楚，比大聲生氣有用。","question":"生氣時，怎樣說出發生的事？"}, // 原始 044｜表達｜相處理解
  {"quote":"需要安靜時，把聲音照顧好。","question":"什麼時候降低音量能幫到別人？"}, // 原始 326｜安靜｜生活日常
  {"quote":"看見同學認真，也想跟著努力。","question":"哪位同學曾讓你也想跟著努力？"}, // 原始 057｜合作｜互助感謝
  {"quote":"下課走出座位，換口新鮮空氣。","question":"走出座位活動後，有比較舒服嗎？"}, // 原始 279｜休息｜心情照顧
  {"quote":"看見有人被欺負，找大人幫忙。","question":"同學被欺負時，可以找誰？"}, // 原始 103｜勇氣｜勇氣期待
  {"quote":"別小看今天的一點努力，它正在幫你前進。","question":"哪件小事，讓你發現自己的努力有用？"}, // 原始 018｜成長｜學習探索
  {"quote":"忘了寫作業，照實說明原因。","question":"沒完成作業時，可以怎樣誠實說明？"}, // 原始 120｜誠實｜自我管理
  {"quote":"一起守約定，大家心裡有底。","question":"哪個班級約定讓你覺得安心？"}, // 原始 321｜守序｜生活日常
  {"quote":"今天沒做好，不用把自己說得很差。","question":"失手後，怎樣對自己說話比較公平？"}, // 原始 164｜接納｜相處理解
  {"quote":"兩個都想要，想想哪個比較適合。","question":"遇到兩難時，你會怎麼比較？"}, // 原始 255｜選擇｜自我管理
  {"quote":"碰到難的地方，停一停不代表放棄。","question":"遇到卡住的地方，你通常想繼續還是先歇一下？"}, // 原始 223｜堅持｜學習探索
  {"quote":"再厲害的人，也會需要鼓勵。","question":"你想為哪位同學打氣？"}, // 原始 078｜關懷｜互助感謝
  {"quote":"有人看不到黑板，換個位置幫幫他。","question":"你曾經需要一點和別人不同的幫助嗎？"}, // 原始 184｜公平｜相處理解
  {"quote":"跌了一跤爬起來，看看還能做什麼。","question":"小挫折之後，有哪件事還做得到？"}, // 原始 354｜樂觀｜勇氣期待
  {"quote":"願意輪流，大家才都有參與的機會。","question":"等了很久終於輪到你，是什麼心情？"}, // 原始 331｜輪流｜生活日常
  {"quote":"下雨不能跑操場，教室也能找樂趣。","question":"雨天的下課，你想怎麼安排？"}, // 原始 227｜彈性｜學習探索
  {"quote":"不是故意的，也可能讓別人難過。","question":"沒惡意的話為什麼也可能傷人？"}, // 原始 338｜道歉｜心情照顧
  {"quote":"沒人提醒，也把事情做好。","question":"哪件事你想改成自己主動做？"}, // 原始 131｜自律｜自我管理
  {"quote":"有人畫圖，有人寫字，合成一張海報。","question":"做海報時，工作怎麼分比較合適？"}, // 原始 127｜合作｜互助感謝
  {"quote":"先放下自己的答案，聽聽他的話。","question":"聽人說話時，腦中急著想什麼？"}, // 原始 151｜傾聽｜相處理解
  {"quote":"不必裝得很厲害，也能大方做自己。","question":"和誰在一起時，你最自在？"}, // 原始 297｜自信｜學習探索
  {"quote":"願望還有點遠，練過的本領會幫忙。","question":"為了想做的事，你已經做了什麼？"}, // 原始 091｜夢想｜勇氣期待
  {"quote":"分到的工作不大，也會影響大家。","question":"哪件小工作，少了它會讓大家不方便？"}, // 原始 112｜責任｜自我管理
  {"quote":"平平安安回來，等你的人才放心。","question":"誰總是提醒你要小心？"}, // 原始 266｜安全｜生活日常
  {"quote":"心裡靜一點，做事也順一點。","question":"哪種聲音能讓你安靜下來？"}, // 原始 038｜冷靜｜心情照顧
  {"quote":"說話以前，想想對方的心情。","question":"同一句話，聽的人可能怎麼想？"}, // 原始 106｜同理｜相處理解
  {"quote":"有些工作不起眼，少了它卻不行。","question":"你注意過誰在做不容易被看見的事？"}, // 原始 200｜服務｜互助感謝
  {"quote":"比昨天多會一點，就很不錯。","question":"最近學會了哪個小本領？"}, // 原始 006｜成長｜學習探索
  {"quote":"玩得開心時，時間好像跑得特別快。","question":"做什麼事時，你最容易忘了時間？"}, // 原始 238｜時間｜自我管理
  {"quote":"話出口前想一下，誤會少一點。","question":"哪句話換個說法會更清楚？"}, // 原始 083｜表達｜相處理解
  {"quote":"小同學也知道一些你不懂的事。","question":"你從年紀小的人身上學過什麼？"}, // 原始 309｜謙虛｜學習探索
  {"quote":"找一件還不錯的事，替心情加點力。","question":"現在想到哪件小事會開心？"}, // 原始 351｜樂觀｜勇氣期待
  {"quote":"不知道就說不知道，不必裝懂。","question":"裝懂可能會遇到什麼麻煩？"}, // 原始 117｜誠實｜自我管理
  {"quote":"書包倒出來，看看藏了什麼寶。","question":"書包裡有哪樣東西早該拿出來？"}, // 原始 242｜整理｜生活日常
  {"quote":"記得別人的付出，心裡暖暖的。","question":"最近誰花時間幫了你？"}, // 原始 141｜感恩｜互助感謝
  {"quote":"提早準備好，上場更安心。","question":"明天要用的東西，哪些能先準備？"}, // 原始 246｜準備｜學習探索
  {"quote":"難過可以流淚，不用急著藏起來。","question":"難過時，怎樣的陪伴讓你舒服？"}, // 原始 282｜情緒｜心情照顧
  {"quote":"吃飯不只是填飽肚子，也讓身體有力氣。","question":"吃得舒服的一餐，對你來說是什麼樣子？"}, // 原始 273｜健康｜生活日常
  {"quote":"事情不必排得滿滿的，也留點時間歇一歇。","question":"一天裡，你最想留一段時間做什麼？"}, // 原始 235｜規劃｜學習探索
  {"quote":"遊戲開始前，問問誰還沒加入。","question":"怎樣讓害羞的同學也能參加？"}, // 原始 149｜友善｜相處理解
  {"quote":"遇到困難找人幫，也是在照顧自己。","question":"有煩惱時，你願意向誰開口？"}, // 原始 291｜求助｜心情照顧
  {"quote":"約好幾點見，提早一點等。","question":"遲到會讓等你的人有什麼感受？"}, // 原始 262｜信用｜自我管理
  {"quote":"看看成果，也記得自己的努力。","question":"結果以外，哪段努力值得記住？"}, // 原始 056｜成長｜學習探索
  {"quote":"同伴還沒收好，給他時間別催促。","question":"等同伴收拾時，你能做什麼？"}, // 原始 061｜耐心｜勇氣期待
  {"quote":"朋友的秘密，先問能不能告訴別人。","question":"什麼事情分享前要先得到同意？"}, // 原始 178｜界線｜相處理解
  {"quote":"該做的先完成，休息更自在。","question":"休息前，你想先做完什麼？"}, // 原始 032｜時間｜自我管理
  {"quote":"和好需要兩個人，不必催著馬上好。","question":"朋友還不想和好時，你能怎麼做？"}, // 原始 175｜修復｜心情照顧
  {"quote":"想放棄時，想想當初為什麼開始。","question":"你一開始喜歡這件事的原因是什麼？"}, // 原始 224｜堅持｜學習探索
  {"quote":"有些勇敢，是把心裡的話說出來。","question":"哪句放在心裡的話，你希望有勇氣說出來？"}, // 原始 102｜勇氣｜勇氣期待
  {"quote":"做得好的地方，別忘了誇誇自己。","question":"你想誇自己哪件事？"}, // 原始 076｜欣賞｜互助感謝
  {"quote":"東西放回原位，下一個人好找。","question":"東西找不到時，你心裡通常在想什麼？"}, // 原始 241｜整理｜生活日常
  {"quote":"自信不是什麼都會，而是相信自己能學會。","question":"你想送自己哪句鼓勵？"}, // 原始 296｜自信｜學習探索
  {"quote":"有人一個人坐，陪伴不一定要說話。","question":"安靜陪著別人，可以做些什麼？"}, // 原始 194｜關懷｜互助感謝
  {"quote":"聽完兩邊的說法，再想怎麼處理。","question":"只聽一個人說，可能漏掉什麼？"}, // 原始 185｜公平｜相處理解
  {"quote":"回頭想一想，下次才知道怎麼改。","question":"哪件事你想重新想一遍？"}, // 原始 166｜反省｜自我管理
  {"quote":"別人幫你開門，抬頭說聲謝謝。","question":"接受幫忙時，除了說話還能怎麼回應？"}, // 原始 320｜禮貌｜生活日常
  {"quote":"有人愛跑步，有人愛畫圖，都很好。","question":"你和朋友的喜好差在哪裡？"}, // 原始 162｜接納｜相處理解
  {"quote":"每天多懂一點，過一陣子就會發現自己變了。","question":"最近有什麼事，讓你發現自己比以前熟練了？"}, // 原始 096｜成長｜學習探索
  {"quote":"有人需要多一點時間，大家一起等一等。","question":"一起做事時，你喜歡什麼樣的同伴？"}, // 原始 129｜合作｜互助感謝
  {"quote":"想到想做的事，連準備都變得有趣。","question":"想到哪件還沒做的事，你就覺得興奮？"}, // 原始 363｜夢想｜勇氣期待
  {"quote":"今天做的小決定，會慢慢成為習慣。","question":"哪個小決定你想繼續做下去？"}, // 原始 080｜選擇｜自我管理
  {"quote":"折錯的一角，也許能變新造型。","question":"一個小失誤能變成什麼新作品？"}, // 原始 230｜彈性｜學習探索
  {"quote":"怒氣快滿出來，先離開吵鬧的地方。","question":"你能去哪裡讓自己安靜一下？"}, // 原始 288｜冷靜｜心情照顧
  {"quote":"事情開了頭，也記得好好收尾。","question":"有哪件事做了一半還沒完成？"}, // 原始 028｜責任｜自我管理
  {"quote":"借書照順序，喜歡也不用搶。","question":"好幾人想借同一本書時，怎麼辦？"}, // 原始 322｜守序｜生活日常
  {"quote":"拒絕不舒服的玩笑，不用勉強笑。","question":"哪種玩笑讓你不舒服？"}, // 原始 179｜界線｜相處理解
  {"quote":"平常的努力，會讓你多一點把握。","question":"什麼準備讓你比較有把握？"}, // 原始 049｜自信｜學習探索
  {"quote":"心裡酸酸的，可能是有點羨慕。","question":"羨慕別人時，你在乎的是什麼？"}, // 原始 284｜情緒｜心情照顧
  {"quote":"答應太多做不完，趕快說明白。","question":"發現忙不過來時，要先告訴誰？"}, // 原始 259｜承擔｜自我管理
  {"quote":"裁判看同一條規則，不看是不是朋友。","question":"朋友犯規時，裁判該怎麼做？"}, // 原始 183｜公平｜相處理解
  {"quote":"不知道名字的小蟲，也值得觀察。","question":"觀察小蟲時，怎樣不傷到牠？"}, // 原始 209｜好奇｜學習探索
  {"quote":"會解的題目，講方法別只報答案。","question":"怎樣解釋，朋友才學得會？"}, // 原始 314｜分享｜互助感謝
  {"quote":"問問題不用怕丟臉，誰都有不懂的事。","question":"怕問錯時，你想對自己說什麼？"}, // 原始 104｜勇氣｜勇氣期待
  {"quote":"身體照顧好，玩和學才有精神。","question":"什麼時候，你會特別想好好照顧身體？"}, // 原始 271｜健康｜生活日常
  {"quote":"很想馬上說的話，也可以等別人說完。","question":"你有過太想說話，反而沒聽清楚的時候嗎？"}, // 原始 036｜自律｜自我管理
  {"quote":"有些成長很安靜，但它真的正在發生。","question":"哪個改變只有你自己先發現？"}, // 原始 072｜成長｜學習探索
  {"quote":"和好後再相處，也記得保護自己。","question":"和朋友和好以後，你還會擔心什麼？"}, // 原始 344｜原諒｜心情照顧
  {"quote":"叫對方喜歡的名字，少取笑綽號。","question":"怎麼知道對方喜不喜歡這個稱呼？"}, // 原始 122｜尊重｜相處理解
  {"quote":"等人的空檔，讓書陪你一下。","question":"等待時帶哪本書最合適？"}, // 原始 239｜時間｜自我管理
  {"quote":"跳繩多一下，記下今天的紀錄。","question":"練習了一陣子，你怎麼發現自己變厲害了？"}, // 原始 214｜練習｜學習探索
  {"quote":"主動做一件事，讓大家方便些。","question":"你願意替班級做哪件小工作？"}, // 原始 196｜服務｜互助感謝
  {"quote":"今天不順利，不代表明天沒有新的可能。","question":"今天不太順時，你會期待明天有什麼不同？"}, // 原始 346｜希望｜勇氣期待
  {"quote":"廢紙和課本分開，重要的別丟掉。","question":"整理紙張時，怎麼分辨要不要留？"}, // 原始 245｜整理｜生活日常
  {"quote":"順序先想好，做事少慌張。","question":"手邊三件事，你會怎麼排順序？"}, // 原始 231｜規劃｜學習探索
  {"quote":"自己的工作做好，大家少操心。","question":"你的工作會影響到誰？"}, // 原始 060｜責任｜自我管理
  {"quote":"口音跟你不一樣，話一樣值得聽。","question":"你聽過哪些不同的說話聲音？"}, // 原始 187｜包容｜相處理解
  {"quote":"看見自己的好，也找找別人的亮點。","question":"你想稱讚誰的哪個長處？"}, // 原始 301｜欣賞｜互助感謝
  {"quote":"鞋帶綁不會，請人帶著做一遍。","question":"遇到不會的事，你喜歡別人怎麼幫你？"}, // 原始 295｜求助｜心情照顧
  {"quote":"不擅長跳繩，也不妨礙交朋友。","question":"你交朋友時，最在意什麼？"}, // 原始 163｜接納｜相處理解
  {"quote":"照顧身體的小事，也值得每天記在心上。","question":"你做過什麼小改變，讓身體舒服一些？"}, // 原始 272｜健康｜生活日常
  {"quote":"學習的路很長，一步一步走。","question":"遇到難學的地方，你會怎麼陪自己？"}, // 原始 099｜學習｜學習探索
  {"quote":"說出原因，比一句不要更清楚。","question":"不想參加時，你會怎麼解釋？"}, // 原始 157｜表達｜相處理解
  {"quote":"不太想做的事，也許有值得試試看的地方。","question":"哪件事你本來不想做，做了卻覺得不錯？"}, // 原始 069｜自律｜自我管理
  {"quote":"今天先準備，明天就不必急急忙忙。","question":"哪一次提早準備，讓你輕鬆了不少？"}, // 原始 247｜準備｜學習探索
  {"quote":"一起完成，比獨自硬撐輕鬆。","question":"小組工作裡，你想負責哪一部分？"}, // 原始 126｜合作｜互助感謝
  {"quote":"輪到自己很開心，別人也是這樣想的。","question":"輪到你之前，你會期待什麼？"}, // 原始 043｜輪流｜生活日常
  {"quote":"放學有人聽你說話，是份小幸福。","question":"回家後，你想和誰聊今天的事？"}, // 原始 358｜幸福｜勇氣期待
  {"quote":"飯自己盛，碗自己收，一天天長大。","question":"今天哪件事讓你覺得自己長大了？"}, // 原始 100｜成長｜學習探索
  {"quote":"不要怕慢，只怕一直不開始。","question":"哪件事拖著拖著就忘了？"}, // 原始 066｜時間｜自我管理
  {"quote":"忙完一件事，閉眼讓腦袋歇一會。","question":"哪種休息能讓你上課更有精神？"}, // 原始 280｜休息｜心情照顧
  {"quote":"等得有點不耐煩，是很多人都有的心情。","question":"等人的時候，你最希望對方知道什麼？"}, // 原始 140｜耐心｜勇氣期待
  {"quote":"做好自己的事，別人就多一份安心。","question":"有誰曾經放心地把事情交給你？"}, // 原始 113｜責任｜自我管理
  {"quote":"耳朵在聽，手上的玩具也歇一歇。","question":"什麼東西會讓你聽不完整？"}, // 原始 152｜傾聽｜相處理解
  {"quote":"音量放合適，大家都舒服。","question":"在教室和操場，音量有什麼不同？"}, // 原始 084｜安靜｜生活日常
  {"quote":"犯錯沒關係，發現了就改。","question":"你怎麼發現自己的錯誤？"}, // 原始 008｜反省｜自我管理
  {"quote":"每次多練一點，以後更熟練。","question":"你想替以後的自己練什麼？"}, // 原始 067｜練習｜學習探索
  {"quote":"迷路先別亂跑，找可靠的大人幫忙。","question":"出門走散前，可以先約好什麼？"}, // 原始 294｜求助｜心情照顧
  {"quote":"失敗後還願意再試，需要不少勇氣。","question":"失敗時，是什麼讓你願意再試？"}, // 原始 004｜勇氣｜勇氣期待
  {"quote":"一次做一件，頭腦不用趕場。","question":"同時做兩件事，你容易漏掉哪件？"}, // 原始 205｜專注｜學習探索
  {"quote":"想法不同，也能聽完再說。","question":"不同意同學時，你會怎麼接話？"}, // 原始 121｜尊重｜相處理解
  {"quote":"實話不容易說，說完心裡輕一些。","question":"說實話需要鼓起勇氣的時候是什麼？"}, // 原始 116｜誠實｜自我管理
  {"quote":"有些努力沒人看見，自己卻知道沒有白費。","question":"哪件事你默默做了很久，卻很少告訴別人？"}, // 原始 009｜學習｜學習探索
  {"quote":"有趣的發現，畫下來給大家看。","question":"你想用圖畫分享哪個發現？"}, // 原始 313｜分享｜互助感謝
  {"quote":"玩具輪到別人，說好多久再交換。","question":"輪流玩之前，要先約好什麼？"}, // 原始 334｜輪流｜生活日常
  {"quote":"早上碰到同學，笑著打個招呼。","question":"你喜歡哪種早安問候？"}, // 原始 148｜友善｜相處理解
  {"quote":"準備也要看情況，不是東西帶越多越好。","question":"你帶過什麼東西，後來發現用不到？"}, // 原始 250｜準備｜學習探索
  {"quote":"還沒完成的事，明天接著試。","question":"明天你想接著完成什麼？"}, // 原始 349｜希望｜勇氣期待
  {"quote":"弄壞朋友的東西，陪他想辦法補好。","question":"東西壞了，有哪些補救方法？"}, // 原始 172｜修復｜心情照顧
  {"quote":"朋友都說好，你也可以有自己的想法。","question":"大家都選一樣時，你會跟著選嗎？"}, // 原始 253｜選擇｜自我管理
  {"quote":"欣賞別人，不會讓自己的優點變少。","question":"你曾經佩服過一個和你很不一樣的人嗎？"}, // 原始 303｜欣賞｜互助感謝
  {"quote":"椅子四腳站穩，別讓它學翹腳。","question":"坐椅子搖來搖去有什麼危險？"}, // 原始 270｜安全｜生活日常
  {"quote":"翻翻舊作業，找找變好的地方。","question":"舊作業和現在的作業差在哪？"}, // 原始 219｜成長｜學習探索
  {"quote":"把話好好說，把事慢慢做，今天就會更順利。","question":"你遇過好好說話以後，事情變順利的時候嗎？"}, // 原始 013｜表達｜相處理解
  {"quote":"謝謝說得真心，不必說得很漂亮。","question":"你最想認真謝謝誰？"}, // 原始 144｜感恩｜互助感謝
  {"quote":"紅筆圈的地方，藏著下一次的提醒。","question":"訂正後，你發現自己漏看了什麼？"}, // 原始 168｜反省｜自我管理
  {"quote":"開心像太陽，生氣像什麼天氣？","question":"用天氣形容你的心情，會是什麼？"}, // 原始 283｜情緒｜心情照顧
  {"quote":"漏聽的一句話，可能正是你想知道的事。","question":"你曾因為分心，錯過什麼有趣的事？"}, // 原始 204｜專注｜學習探索
  {"quote":"舉手說想法，讓大家聽見你。","question":"如果舉手了，你想說什麼？"}, // 原始 027｜勇氣｜勇氣期待
  {"quote":"別人正在說，留一點時間給他。","question":"有人沒等你說完就插話，你心裡會怎樣？"}, // 原始 124｜尊重｜相處理解
  {"quote":"事情做完以後，再看一眼也會有新發現。","question":"哪次回頭看自己的作品，發現了不一樣的地方？"}, // 原始 114｜責任｜自我管理
  {"quote":"難寫的國字，先看清楚再下筆。","question":"哪個字的哪一筆最容易寫錯？"}, // 原始 212｜練習｜學習探索
  {"quote":"水慢慢喝幾口，別等口渴才想起。","question":"一天裡哪些時候適合喝水？"}, // 原始 274｜健康｜生活日常
  {"quote":"每人都有長處，也都有不熟的事。","question":"你的長處和想練的事各是什麼？"}, // 原始 161｜接納｜相處理解
  {"quote":"新的一天，可以重新開始。","question":"明早你想怎麼開始？"}, // 原始 054｜希望｜勇氣期待
  {"quote":"隊友臨時請假，工作重新分一分。","question":"活動臨時改變，你會怎麼調整？"}, // 原始 229｜彈性｜學習探索
  {"quote":"一句對不起，能讓對方知道你在乎。","question":"道歉後還可以補做什麼？"}, // 原始 065｜道歉｜心情照顧
  {"quote":"座位收整齊，心情也清爽。","question":"整理前後，你的心情有差嗎？"}, // 原始 025｜整理｜生活日常
  {"quote":"鐘不會替你慢走，早一點出門吧。","question":"早上哪個步驟最容易拖到時間？"}, // 原始 240｜時間｜自我管理
  {"quote":"困難時再試一回，也許會有新發現。","question":"哪件難事你還想繼續挑戰？"}, // 原始 221｜堅持｜學習探索
  {"quote":"看見人家進步，替他拍拍手。","question":"誰的進步讓你想為他鼓掌？"}, // 原始 305｜欣賞｜互助感謝
  {"quote":"借書說好哪天還，就記在本子上。","question":"還書日期記在哪裡才不容易忘？"}, // 原始 263｜信用｜自我管理
  {"quote":"大作業分幾天做，別擠在最後一天。","question":"這份作業可以分幾天完成？"}, // 原始 232｜規劃｜學習探索
  {"quote":"聽不清楚，請對方再說一遍。","question":"沒聽清楚時，怎麼有禮貌地問？"}, // 原始 153｜傾聽｜相處理解
  {"quote":"受傷別忍著，告訴老師哪裡痛。","question":"身體不舒服時，該怎麼說明？"}, // 原始 293｜求助｜心情照顧
  {"quote":"打結的鞋帶，一個圈一個圈解。","question":"越急越打結時，怎麼慢下來？"}, // 原始 139｜耐心｜勇氣期待
  {"quote":"把事情做好，不用急著跟別人比。","question":"什麼時候你會忍不住和人比較？"}, // 原始 005｜自律｜自我管理
  {"quote":"把謝謝說出口，讓對方知道。","question":"哪句謝謝一直放在你心裡？"}, // 原始 064｜感恩｜互助感謝
  {"quote":"換你遇到這件事，心裡會怎樣？","question":"被誤會時，你希望別人先做什麼？"}, // 原始 109｜同理｜相處理解
  {"quote":"追球先停腳，馬路不是球場。","question":"球滾到馬路上時，應該找誰？"}, // 原始 269｜安全｜生活日常
  {"quote":"少了一樣東西，不一定就什麼也做不了。","question":"東西沒帶齊時，你想過什麼替代辦法？"}, // 原始 228｜彈性｜學習探索
  {"quote":"願意改一改，下次就有新做法。","question":"你下次想換掉哪個做法？"}, // 原始 088｜反省｜自我管理
  {"quote":"黑板擦乾淨，下一堂課看得清。","question":"你做過哪件小事，讓別人方便了一點？"}, // 原始 197｜服務｜互助感謝
  {"quote":"翻開課本，給自己一個認真的開始。","question":"做什麼事時，你會特別想認真一點？"}, // 原始 039｜學習｜學習探索
  {"quote":"抽屜留點空，找橡皮擦不用探險。","question":"怎樣整理抽屜能一眼找到東西？"}, // 原始 244｜整理｜生活日常
  {"quote":"拳頭鬆開來，慢慢吐一口氣。","question":"生氣時，哪裡會不自覺用力？"}, // 原始 287｜冷靜｜心情照顧
  {"quote":"每個人的速度不同，照自己的步子走。","question":"朋友做得比你快時，你會怎麼想？"}, // 原始 016｜接納｜相處理解
  {"quote":"原來要人幫忙的事，現在能自己完成了。","question":"哪件事你已經不需要大人代勞？"}, // 原始 218｜成長｜學習探索
  {"quote":"平常的小日子，也有值得開心的事。","question":"哪個平凡時刻讓你覺得幸福？"}, // 原始 356｜幸福｜勇氣期待
  {"quote":"看見別人需要幫忙時，一句詢問會讓人很溫暖。","question":"你想關心的人，現在需要什麼？"}, // 原始 191｜關懷｜互助感謝
  {"quote":"好好完成作業，是對自己負責。","question":"你做過哪件事，完成後特別替自己開心？"}, // 原始 068｜責任｜自我管理
  {"quote":"聲音大不等於清楚，重點慢慢講。","question":"你要怎麼把重點說給全班聽？"}, // 原始 159｜表達｜相處理解
  {"quote":"做得好，也不必把別人比下去。","question":"你最開心的一次稱讚，是誰給你的？"}, // 原始 310｜謙虛｜學習探索
  {"quote":"等一等，也是在練習耐心。","question":"等待的時候可以做些什麼？"}, // 原始 019｜耐心｜勇氣期待
  {"quote":"想買之前，分清想要和需要。","question":"哪樣東西很想買，其實還用不到？"}, // 原始 252｜選擇｜自我管理
  {"quote":"伸伸手轉轉肩，和僵硬說再見。","question":"久坐後，你想活動哪個部位？"}, // 原始 278｜休息｜心情照顧
  {"quote":"路上遇見熟人，別忘了親切問候。","question":"遇到誰時，你會特別想打招呼？"}, // 原始 150｜友善｜相處理解
  {"quote":"球傳出去，別人也有投籃的機會。","question":"打球時，你有注意誰還沒拿到球嗎？"}, // 原始 332｜輪流｜生活日常
  {"quote":"多問一個為什麼，就多一個發現。","question":"哪個日常現象讓你想問為什麼？"}, // 原始 206｜好奇｜學習探索
  {"quote":"你多做的一點，可能讓別人輕鬆很多。","question":"誰曾經幫了你一把，讓你輕鬆好多？"}, // 原始 198｜服務｜互助感謝
  {"quote":"今天也試著做一個讓人安心的同學。","question":"和誰在一起時，你覺得特別安心？"}, // 原始 023｜信用｜自我管理
  {"quote":"椅子輕輕放，地板不用哇哇叫。","question":"移椅子時，怎麼減少聲響？"}, // 原始 328｜安靜｜生活日常
  {"quote":"慢一點沒關係，重要的是有在前進。","question":"做得比別人慢時，你心裡通常怎麼想？"}, // 原始 052｜堅持｜學習探索
  {"quote":"別替道歉加個「但是」，先承認做錯。","question":"說對不起卻接著怪人，聽起來如何？"}, // 原始 339｜道歉｜心情照顧
  {"quote":"他說沒事，也許還想有人陪。","question":"怎麼問，才不會讓朋友有壓力？"}, // 原始 110｜同理｜相處理解
  {"quote":"眼前這件事，先用心做完。","question":"手上的工作還剩哪一步？"}, // 原始 007｜專注｜學習探索
  {"quote":"每片葉子的紋路，都值得仔細看。","question":"兩片不同的葉子，各有什麼特色？"}, // 原始 304｜欣賞｜互助感謝
  {"quote":"玩得開心，也能記得該做的事。","question":"有什麼事是你玩得很開心也不會忘的？"}, // 原始 132｜自律｜自我管理
  {"quote":"問題說出口，常比一個人苦想輕鬆。","question":"哪一次開口求助，讓你鬆了一口氣？"}, // 原始 292｜求助｜心情照顧
  {"quote":"夢想會從今天的一個小行動開始長大。","question":"為了心裡的願望，你想先試哪件事？"}, // 原始 361｜夢想｜勇氣期待
  {"quote":"保護自己，也尊重別人的不願意。","question":"聽到別人說不要時，該怎麼做？"}, // 原始 176｜界線｜相處理解
  {"quote":"報告先說一遍，嘴巴也要暖身。","question":"練報告時，你想請誰聽聽看？"}, // 原始 249｜準備｜學習探索
  {"quote":"過馬路等綠燈，也要看看車。","question":"綠燈亮了，還需要注意什麼？"}, // 原始 323｜守序｜生活日常
  {"quote":"聽進一句提醒，少走一次彎路。","question":"哪個提醒曾幫到你？"}, // 原始 053｜反省｜自我管理
  {"quote":"有一題寫錯，不會讓整天都變糟。","question":"不順利的一天裡，有什麼小收穫？"}, // 原始 087｜樂觀｜勇氣期待
  {"quote":"小小的進步，也值得被肯定。","question":"你想怎麼慶祝一點小進步？"}, // 原始 062｜成長｜學習探索
  {"quote":"快樂說出來，還能多一個人笑。","question":"你想分享哪件開心事？"}, // 原始 074｜分享｜互助感謝
  {"quote":"向人問路前，先說聲不好意思。","question":"向陌生的大人問路，你會怎麼開口？"}, // 原始 318｜禮貌｜生活日常
  {"quote":"做不到的承諾，別急著點頭。","question":"答應別人以前，要先想哪些事？"}, // 原始 264｜信用｜自我管理
  {"quote":"友善的眼神，讓新同學放心。","question":"新同學進教室時，你能做什麼？"}, // 原始 146｜友善｜相處理解
  {"quote":"同學趴著沒精神，問問他還好嗎。","question":"身體不舒服時，你最希望有人怎麼陪你？"}, // 原始 192｜關懷｜互助感謝
  {"quote":"碰到難題，先吸口氣再想。","question":"緊張時，你的身體有什麼感覺？"}, // 原始 011｜冷靜｜心情照顧
  {"quote":"任務有點難，就分成幾步做。","question":"這個任務能拆成哪幾步？"}, // 原始 031｜規劃｜學習探索
  {"quote":"撿到不是自己的錢，交給老師。","question":"撿到錢時，怎麼找到失主？"}, // 原始 118｜誠實｜自我管理
  {"quote":"事情照著先後說，別人比較容易聽懂。","question":"你說過哪件事，讓朋友也聽得很入迷？"}, // 原始 158｜表達｜相處理解
  {"quote":"一起吃飯聊聊天，平常的日子也很幸福。","question":"家人一起做什麼時，你最開心？"}, // 原始 360｜幸福｜勇氣期待
  {"quote":"帶隊也能輪流，試試不同人的方法。","question":"如果換你帶隊，你想怎麼做？"}, // 原始 335｜輪流｜生活日常
  {"quote":"眼睛跟著課本，耳朵跟著老師。","question":"你聽過什麼，讓你捨不得分心？"}, // 原始 071｜專注｜學習探索
  {"quote":"今天先做好一件小事，就是很棒的開始。","question":"你想先完成哪件小事？"}, // 原始 002｜責任｜自我管理
  {"quote":"道歉說清楚，也記得改做法。","question":"道歉時，除了對不起還要說什麼？"}, // 原始 336｜道歉｜心情照顧
  {"quote":"別急著說做不到，先試試看。","question":"哪件新事值得試一次？"}, // 原始 035｜勇氣｜勇氣期待
  {"quote":"有人吃的東西不同，不用說奇怪。","question":"同學的午餐有什麼讓你好奇？"}, // 原始 188｜包容｜相處理解
  {"quote":"已經做得好，還有新東西能學。","question":"你擅長的事，還能學哪一部分？"}, // 原始 306｜謙虛｜學習探索
  {"quote":"弄出了麻煩，也能試著把事情補好。","question":"你曾經怎麼補救自己不小心做錯的事？"}, // 原始 257｜承擔｜自我管理
  {"quote":"讀到好故事，說給朋友聽一段。","question":"哪段故事值得推薦給朋友？"}, // 原始 312｜分享｜互助感謝
  {"quote":"這條路不通，換個方法也能到。","question":"你試過哪個不同的解題方法？"}, // 原始 226｜彈性｜學習探索
  {"quote":"用心待人做事，每一份都算數。","question":"你記得別人對你的哪份好？"}, // 原始 015｜友善｜相處理解
  {"quote":"約定不合適，可以一起討論改。","question":"有哪個約定，你希望大家重新聊一聊？"}, // 原始 325｜守序｜生活日常
  {"quote":"有些東西平常不起眼，需要時卻很重要。","question":"哪樣小東西曾經幫了你大忙？"}, // 原始 248｜準備｜學習探索
  {"quote":"每一個小選擇，都在決定你想成為怎樣的人。","question":"哪個決定讓你覺得很滿意？"}, // 原始 251｜選擇｜自我管理
  {"quote":"昨天鬧不愉快，今天試著打招呼。","question":"重新開口時，可以說哪一句？"}, // 原始 173｜修復｜心情照顧
  {"quote":"先聽懂別人的想法，再說自己的也不遲。","question":"有人耐心聽你說完時，你有什麼感覺？"}, // 原始 154｜傾聽｜相處理解
  {"quote":"一點一滴做好的事，會讓人越來越信任你。","question":"你在什麼事情上，已經能讓人放心了？"}, // 原始 010｜成長｜學習探索
  {"quote":"大家一起想，難事也有辦法。","question":"你們一起解決過什麼難題？"}, // 原始 070｜合作｜互助感謝
  {"quote":"嘴裡還有飯，等吞下再說話。","question":"吃飯聊天時，有什麼禮貌要留意？"}, // 原始 319｜禮貌｜生活日常
  {"quote":"這次沒輪到，下次還有機會。","question":"這次沒被選上，下一次想怎麼準備？"}, // 原始 347｜希望｜勇氣期待
  {"quote":"不懂就問，問題不用藏心裡。","question":"哪個問題你一直想問？"}, // 原始 026｜好奇｜學習探索
  {"quote":"遊戲算錯分，對自己有利也要改。","question":"發現自己的分數多算了，怎麼說？"}, // 原始 119｜誠實｜自我管理
  {"quote":"下雨沒法打球，也能聽聽雨的歌。","question":"雨天有什麼和平常不同的趣味？"}, // 原始 353｜樂觀｜勇氣期待
  {"quote":"把需要說清楚，別人才知道怎麼幫你。","question":"有沒有一件事，你希望別人更懂你？"}, // 原始 156｜表達｜相處理解
  {"quote":"幫忙以前，先問對方需不需要。","question":"你想幫忙的方式，也是對方想要的嗎？"}, // 原始 195｜關懷｜互助感謝
  {"quote":"做錯願意負責，比找藉口有用。","question":"犯錯之後，你能做什麼來負責？"}, // 原始 256｜承擔｜自我管理
  {"quote":"心情像小信差，提醒你在意什麼。","question":"現在的心情想告訴你什麼？"}, // 原始 281｜情緒｜心情照顧
  {"quote":"專心做好一件事，心裡會有踏實的感覺。","question":"什麼東西最容易把你的注意力拉走？"}, // 原始 063｜專注｜學習探索
  {"quote":"教室舒不舒服，看看大家的小動作。","question":"哪個小動作能讓教室更舒服？"}, // 原始 097｜生活習慣｜生活日常
  {"quote":"簡單的事，也值得用心做。","question":"哪件小事容易被你忽略？"}, // 原始 050｜責任｜自我管理
  {"quote":"動別人的東西，先得到同意。","question":"如果對方不想借，你會怎麼回應？"}, // 原始 123｜尊重｜相處理解
  {"quote":"拼圖少一角，慢慢找別急著收。","question":"拼不出來時，你會從哪裡再找？"}, // 原始 222｜堅持｜學習探索
  {"quote":"分享不只分東西，也能分享方法與好心情。","question":"你曾和朋友分享過什麼開心的事？"}, // 原始 311｜分享｜互助感謝
  {"quote":"勇氣藏在哪？看看你試過的事。","question":"哪一次嘗試讓你佩服自己？"}, // 原始 105｜勇氣｜勇氣期待
  {"quote":"一件舊錯誤，不必每次都翻出來。","question":"一直提別人的舊錯，對方會怎麼想？"}, // 原始 345｜原諒｜心情照顧
  {"quote":"鉛筆回筆盒，別讓它睡地板。","question":"掉在地上的文具容易遇到什麼事？"}, // 原始 243｜整理｜生活日常
  {"quote":"進步不一定很大，但每天都可以有一點。","question":"最近哪個小進步，讓你自己也很開心？"}, // 原始 216｜成長｜學習探索
  {"quote":"先想後果，再決定要不要做。","question":"這個決定可能讓誰受到影響？"}, // 原始 254｜選擇｜自我管理
  {"quote":"空著的位子，也留給想加入的人。","question":"有人想坐過來，你會怎麼招呼？"}, // 原始 147｜友善｜相處理解
]

const students = computed(() => parseStudents(studentSource.value))
const todayKey = computed(() => toDateKey(new Date()))
const todayText = computed(() => formatToday(new Date()))
const todayEvents = computed(() => getTodayEvents(todayKey.value))
const dailyQuoteIndex = computed(() => getDailyQuoteIndex(new Date()))
const currentMessage = computed(() => dailyMessages[dailyQuoteIndex.value])
const currentQuote = computed(() => currentMessage.value.quote)
// DAILY_QUOTE_MEASURED_COLUMNS: use the visible writing space, not a fixed character threshold.
const quoteBlock = ref(null)
const quoteCapacity = ref(Infinity)
let quoteResizeObserver
let quoteMeasureFrame

function splitVerticalQuote(text, capacity) {
  const characters = Array.from(text)
  if (characters.length <= capacity) return [text]
  const closing = /^[，。！？、；：）」』】》〉…,.!?;:)]$/u
  const opening = /^[（「『【《〈(]$/u
  // Fill the column first; retreat only to avoid punctuation starts or a tiny tail.
  const columns = []
  const limit = Math.max(3, Math.floor(capacity))
  let remaining = characters
  while (remaining.length > limit) {
    let split = Math.min(limit, remaining.length - 3)
    while (split > 1 && (
      closing.test(remaining[split]) || opening.test(remaining[split - 1]) ||
      remaining.slice(split).filter(char => /\p{Script=Han}/u.test(char)).length < 3
    )) split--
    columns.push(remaining.slice(0, split).join(''))
    remaining = remaining.slice(split)
  }
  columns.push(remaining.join(''))
  return columns
}

const quoteColumns = computed(() => splitVerticalQuote(currentQuote.value, quoteCapacity.value))

function measureQuoteSpace() {
  const block = quoteBlock.value
  const text = block?.querySelector('strong')
  const label = block?.querySelector('.vertical-section-label')
  if (!text || !label) return
  const blockStyle = window.getComputedStyle(block)
  const textStyle = window.getComputedStyle(text)
  const padding = parseFloat(blockStyle.paddingTop) + parseFloat(blockStyle.paddingBottom)
  const heading = label.getBoundingClientRect().height + parseFloat(blockStyle.gap)
  const fontSize = parseFloat(textStyle.fontSize)
  const advance = fontSize + (parseFloat(textStyle.letterSpacing) || 0)
  const columnSpace = Math.min(block.clientHeight, parseFloat(blockStyle.maxHeight)) - padding - heading
  // Use the book column's height; the viewport edge is not the bottom of the column.
  quoteCapacity.value = Math.max(3, Math.floor(columnSpace / advance))
}

function scheduleQuoteMeasure() {
  window.cancelAnimationFrame(quoteMeasureFrame)
  quoteMeasureFrame = window.requestAnimationFrame(measureQuoteSpace)
}

watch(quoteBlock, block => {
  quoteResizeObserver?.disconnect()
  if (!block) return
  quoteResizeObserver = new ResizeObserver(scheduleQuoteMeasure)
  quoteResizeObserver.observe(block)
  scheduleQuoteMeasure()
}, { flush: 'post' })

onMounted(() => {
  window.addEventListener('resize', scheduleQuoteMeasure)
  document.fonts?.addEventListener('loadingdone', scheduleQuoteMeasure)
})
onBeforeUnmount(() => {
  quoteResizeObserver?.disconnect()
  window.cancelAnimationFrame(quoteMeasureFrame)
  window.removeEventListener('resize', scheduleQuoteMeasure)
  document.fonts?.removeEventListener('loadingdone', scheduleQuoteMeasure)
})
const currentQuestion = computed(() => currentMessage.value.question)

// ✅ HUA_HOME_QUOTE_SINGLE_LINE_20260712：桌機依句子長度自動縮放，讓完整「今日一句」盡量維持同一行。
const homeQuoteLengthClass = computed(() => {
  const length = Array.from(currentQuote.value || '').length
  if (length >= 24) return 'home-quote-extra-long'
  if (length >= 21) return 'home-quote-long'
  if (length >= 18) return 'home-quote-medium'
  return ''
})

function getDailyQuoteIndex(date) {
  const start = new Date(date.getFullYear(), 0, 1)
  const dayDiff = Math.floor((stripTime(date) - stripTime(start)) / (1000 * 60 * 60 * 24))
  return Math.abs(dayDiff) % dailyMessages.length
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function parseStudents(value) {
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed
        .map((student, index) => {
          if (typeof student === 'string') return { number: index + 1, name: student }
          return {
            number: student.number || student.no || student.id || index + 1,
            name: student.name || student.studentName || ''
          }
        })
        .filter(student => student.name)
    }
  } catch {}

  return value
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim()
      const match = trimmed.match(/^(\d+)\s*[\.、\- ]\s*(.+)$/)
      if (match) return { number: Number(match[1]), name: match[2].trim() }
      return { number: index + 1, name: trimmed }
    })
    .filter(student => student.name)
}

function getTodayEvents(key) {
  try {
    const saved = JSON.parse(localStorage.getItem('classHelperCalendarEvents') || '{}')
    return Array.isArray(saved[key]) ? saved[key] : []
  } catch {
    return []
  }
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatToday(date) {
  const week = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日（星期${week}）`
}
</script>

<template>
  <div class="dashboard home-dashboard">
    <div class="home-top-actions">
      <button class="home-settings-button" type="button" @click="showHomeSettings = !showHomeSettings">
        ⚙️ 首頁設定
      </button>
    </div>

    <section v-if="showHomeSettings" class="card home-settings-card">
      <div>
        <h3>⚙️ 首頁顯示</h3>
        <p>依照班級使用方式，選擇首頁要出現的內容。</p>
      </div>
      <label><input v-model="homeDisplay.contactBook" type="checkbox"> 📝 今日聯絡事項</label>
      <label><input v-model="homeDisplay.dailyQuote" type="checkbox"> 🌱 今日一句</label>
      <label><input v-model="homeDisplay.reflection" type="checkbox"> 💭 今天想一想</label>
      <div v-if="homeDisplay.contactBook" class="contact-layout-setting">
        <strong>聯絡簿版面</strong>
        <label><input v-model="homeDisplay.contactLayout" type="radio" value="horizontal"> 橫式</label>
        <label><input v-model="homeDisplay.contactLayout" type="radio" value="vertical"> 直式（由右往左）</label>
      </div>
    </section>

    <!-- ✅ HUA_CONTACT_DYNAMIC_FONT_MOBILE_FIX_20260710：聯絡事項依數量自動縮放字級，手機改為可讀的兩排直式卡片。 -->
    <section
      v-if="homeDisplay.contactBook && isVerticalContactLayout"
      class="card contact-book-card vertical-contact-card"
    >
      <header class="contact-book-header">
        <div>
          <span class="eyebrow">📝 今日聯絡事項</span>
          <h2>直式聯絡簿模式</h2>
        </div>
        <button v-if="!isEditingContactBook" type="button" class="contact-edit-button" @click="isEditingContactBook = true">✏️ 編輯</button>
        <button v-else type="button" class="contact-done-button" @click="finishContactBookEditing">✓ 完成</button>
      </header>

      <div v-if="isEditingContactBook" class="contact-book-editor">
        <label><span>📚 作業</span><textarea v-model="contactBook.homework" rows="4" placeholder="每一行輸入一項作業"></textarea></label>
        <label><span>🎒 攜帶物品</span><textarea v-model="contactBook.carry" rows="3" placeholder="每一行輸入一項攜帶物品"></textarea></label>
        <label><span>📌 提醒</span><textarea v-model="contactBook.reminder" rows="3" placeholder="每一行輸入一項提醒"></textarea></label>
      </div>

      <div v-else class="vertical-book-spread polished-vertical-book">
        <section class="vertical-book-left">
          <div class="book-page-heading">親師交流</div>
          <div v-if="homeDisplay.dailyQuote" class="vertical-sel-content">
            <div ref="quoteBlock" class="vertical-sel-block vertical-quote-block">
              <span class="vertical-section-label"><span>今日<br>一句</span></span>
              <strong class="quote-columns" :class="{ 'quote-two-columns': quoteColumns.length === 2 }" :aria-label="currentQuote"><span v-for="(column, index) in quoteColumns" :key="index" class="quote-column" aria-hidden="true">{{ column }}</span></strong>
            </div>
            <div v-if="homeDisplay.reflection" class="vertical-sel-block vertical-question-block">
              <span class="vertical-section-label">想一想</span>
              <strong>{{ currentQuestion }}</strong>
            </div>
          </div>
          <div v-if="homeDisplay.reflection" class="vertical-response-note">
            ✍️ 請在今天的聯絡簿空白處回答哦！
          </div>
        </section>

        <section class="vertical-book-right">
          <div class="book-page-heading contact-heading-with-date">
            <span>聯絡簿</span>
            <span class="contact-heading-date">
              {{ verticalDateParts.year }} {{ verticalDateParts.monthDay }}（{{ verticalDateParts.week }}）
            </span>
          </div>
          <div
            class="vertical-contact-columns"
            :style="{ '--contact-columns': Math.max(mergedContactItems.length, 1), '--contact-count': mergedContactItems.length }"
          >
            <div v-for="(item, index) in mergedContactItems" :key="`vertical-contact-${index}`" class="vertical-contact-item">
              <span class="vertical-contact-index">{{ index + 1 }}</span>
              <span class="vertical-contact-text"><span v-for="(part, partIndex) in contactTextParts(item)" :key="partIndex" :class="{ 'contact-digit-group': part.digits, 'contact-page-reference': part.pageReference || part.lessonReference }">{{ part.text }}</span></span>
            </div>
          </div>
        </section>
      </div>
    </section>

    <section v-if="homeDisplay.contactBook && !isVerticalContactLayout" class="card contact-book-card">
      <header class="contact-book-header">
        <div><span class="eyebrow">📝 今日聯絡事項</span><h2>請依序抄寫在聯絡簿上</h2></div>
        <button v-if="!isEditingContactBook" type="button" class="contact-edit-button" @click="isEditingContactBook = true">✏️ 編輯</button>
        <button v-else type="button" class="contact-done-button" @click="finishContactBookEditing">✓ 完成</button>
      </header>
      <div v-if="isEditingContactBook" class="contact-book-editor">
        <label><span>📚 作業</span><textarea v-model="contactBook.homework" rows="4" placeholder="每一行輸入一項作業"></textarea></label>
        <label><span>🎒 攜帶物品</span><textarea v-model="contactBook.carry" rows="3" placeholder="每一行輸入一項攜帶物品"></textarea></label>
        <label><span>📌 提醒</span><textarea v-model="contactBook.reminder" rows="3" placeholder="每一行輸入一項提醒"></textarea></label>
      </div>
      <div v-else class="contact-book-display">
        <section v-for="section in contactSections" :key="section.key" class="contact-section">
          <h3>{{ section.icon }} {{ section.title }}</h3>
          <ol><li v-for="(item, index) in section.items" :key="`${section.key}-${index}`">{{ item }}</li></ol>
        </section>
      </div>
    </section>

    <section v-if="homeDisplay.dailyQuote && !isVerticalContactLayout" class="home-hero card">
      <div class="home-hero-text">
        <span class="eyebrow">🌱 今日一句</span>
        <h2 :class="homeQuoteLengthClass">{{ currentQuote }}</h2>
        <p>第 {{ dailyQuoteIndex + 1 }} / {{ dailyMessages.length }} 則｜品格 × SEL</p>
        <div v-if="homeDisplay.reflection" class="daily-reflection">
          <span>💭 今天想一想</span>
          <strong class="daily-question">❓ {{ currentQuestion }}</strong>
          <small>✍️ 請在今天聯絡簿空白處回答哦！</small>
        </div>
      </div>
    </section>

    <section class="home-grid">
      <div class="card home-info-card">
        <h3>📚 班級資訊</h3>
        <div class="info-list">
          <p>
            <span>目前班級</span>
            <strong>{{ className || '尚未建立班級' }}</strong>
          </p>
          <p>
            <span>學生人數</span>
            <strong>{{ students.length }} 位</strong>
          </p>
          <p>
            <span>今天日期</span>
            <strong>{{ todayText }}</strong>
          </p>
        </div>
        <RouterLink class="button-link" to="/students">前往學生名單</RouterLink>
      </div>

      <div class="card home-info-card">
        <h3>📌 今日提醒</h3>
        <div v-if="todayEvents.length" class="today-events">
          <p v-for="(event, index) in todayEvents" :key="index">{{ event }}</p>
        </div>
        <div v-else class="empty-note">
          今天尚未新增提醒。<br>
          可以到行事曆寫下班級活動或重要事項。
        </div>
        <RouterLink class="button-link soft-link" to="/calendar">前往行事曆</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-dashboard {
  max-width: 1080px;
}

.home-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  min-height: clamp(190px, 28vh, 270px);
  padding: clamp(22px, 4vw, 38px);
  background: linear-gradient(135deg, #ffffff 0%, #f4fbf7 48%, #fff7e8 100%);
  border: 1px solid #f1e6d8;
}

/* ✅ HUA_HOME_HERO_FULL_WIDTH_20260712：今日一句內容填滿卡片寬度，不再在右側留下像缺漏的空白。 */
.home-hero-text {
  width: 100%;
  max-width: none;
  flex: 1 1 auto;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #4e7c68;
  font-weight: 900;
  margin-bottom: 10px;
}

.home-hero h2 {
  margin: 0;
  color: #243b53;
  font-size: clamp(28px, 4.4vw, 48px);
  line-height: 1.25;
  letter-spacing: .02em;
}

.home-hero p {
  margin: 12px 0 0;
  color: #667085;
  font-weight: 800;
}

.home-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  margin-top: 18px;
}

.home-info-card {
  margin-top: 0;
}

.home-info-card h3 {
  margin-top: 0;
  color: #2f6f57;
}

.info-list {
  display: grid;
  gap: 10px;
}

.info-list p {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 13px 14px;
  border-radius: 16px;
  background: #fff8f0;
}

.info-list span {
  color: #667085;
  font-weight: 800;
}

.info-list strong {
  text-align: right;
  color: #243b53;
}

.today-events {
  display: grid;
  gap: 10px;
}

.today-events p,
.empty-note {
  margin: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: #f4fbf7;
  color: #345;
  font-weight: 800;
  line-height: 1.7;
}

.empty-note {
  color: #667085;
}

.soft-link {
  background: #6bbf95;
}


/* ✅ HUA_HOME_QUOTE_SINGLE_LINE_STYLE_20260712
   桌機依句長微調字級，25 字以內的 365 句今日一句盡量完整排在同一行。 */
@media (min-width: 901px) {
  .home-hero h2 {
    white-space: nowrap;
  }

  .home-hero h2.home-quote-medium {
    font-size: clamp(30px, 3.35vw, 42px);
    letter-spacing: .01em;
  }

  .home-hero h2.home-quote-long {
    font-size: clamp(28px, 3.05vw, 39px);
    letter-spacing: 0;
  }

  .home-hero h2.home-quote-extra-long {
    font-size: clamp(26px, 2.7vw, 35px);
    letter-spacing: 0;
  }
}

@media (max-width: 980px) {
  .home-hero {
    min-height: auto;
  }

  .home-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .home-hero {
    align-items: stretch;
  }

  .info-list p {
    align-items: flex-start;
    flex-direction: column;
  }

  .info-list strong {
    text-align: left;
  }
}

@media (max-width: 520px) {
  .home-hero h2 {
    font-size: 28px;
  }

  .home-hero p {
    font-size: 14px;
  }
}

/* ✅ HUA_DAILY_SEL_365_CARD_20260710 */
.daily-reflection {
  display: grid;
  gap: 6px;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid #dceee6;
  border-radius: 18px;
  background: rgba(255,255,255,.78);
}
.daily-reflection span { color: #4e7c68; font-weight: 900; }
.daily-reflection strong { color: #345; font-size: clamp(17px, 2vw, 21px); line-height: 1.55; }
.daily-reflection small { color: #7b8492; font-weight: 800; }
@media (max-width: 760px) {
  .home-hero { min-height: auto; }
  .daily-reflection { padding: 12px; }
}


/* ✅ HUA_HOME_CONTACT_BOOK_LAYOUT_20260710：直式聯絡事項＋首頁顯示設定。 */
.home-top-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}

.home-settings-button,
.contact-edit-button,
.contact-done-button {
  padding: 9px 14px;
  border-radius: 13px;
  font-size: 14px;
}

.home-settings-card {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) repeat(3, auto);
  align-items: center;
  gap: 14px;
  margin-top: 0;
  margin-bottom: 18px;
  padding: 18px 20px;
}

.home-settings-card h3,
.home-settings-card p {
  margin: 0;
}

.home-settings-card p {
  margin-top: 5px;
  color: #667085;
  font-size: 14px;
}

.home-settings-card label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f4fbf7;
  color: #345;
  font-weight: 850;
  white-space: nowrap;
}

.contact-book-card {
  margin-top: 0;
  padding: clamp(20px, 3vw, 30px);
  background: linear-gradient(160deg, #fffefb, #fff8f0 56%, #f4fbf7);
  border: 1px solid #eadfce;
}

.contact-book-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.contact-book-header h2 {
  margin: 2px 0 0;
  color: #243b53;
  font-size: clamp(20px, 2.6vw, 29px);
}

.contact-book-display {
  display: grid;
  grid-template-columns: 1.2fr .9fr .9fr;
  gap: 16px;
}

.contact-section {
  min-width: 0;
  padding: 16px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, .88);
  border: 1px solid #e7eadf;
}

.contact-section h3 {
  margin: 0 0 10px;
  color: #2f6f57;
  font-size: 19px;
}

.contact-section ol {
  margin: 0;
  padding-left: 1.7em;
}

.contact-section li {
  margin: 8px 0;
  padding-left: 3px;
  color: #243b53;
  font-size: clamp(18px, 2.1vw, 25px);
  font-weight: 500;
  line-height: 1.5;
}

.contact-book-editor {
  display: grid;
  grid-template-columns: 1.2fr .9fr .9fr;
  gap: 14px;
}

.contact-book-editor label {
  display: grid;
  gap: 8px;
  color: #2f6f57;
  font-weight: 900;
}

.contact-book-editor textarea {
  width: 100%;
  min-height: 132px;
  resize: vertical;
  padding: 13px 14px;
  border: 2px solid #dceee6;
  border-radius: 16px;
  background: #fff;
  color: #243b53;
  font: inherit;
  font-size: 17px;
  line-height: 1.65;
}

.home-hero-text {
  width: 100%;
}

.home-hero h2 {
  max-width: 100%;
  font-size: clamp(27px, 4vw, 45px);
  line-break: strict;
  word-break: normal;
}

.daily-question {
  display: block;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff8dc;
  border: 1px solid #f2df9d;
}

.daily-reflection small {
  color: #2f6f57;
  font-size: 15px;
  font-weight: 900;
}

@media (max-width: 900px) {
  .home-settings-card,
  .contact-book-display,
  .contact-book-editor {
    grid-template-columns: 1fr;
  }

  .home-settings-card label {
    white-space: normal;
  }
}

@media (max-width: 760px) {
  .home-top-actions {
    justify-content: stretch;
  }

  .home-settings-button {
    width: 100%;
  }

  .contact-book-header {
    align-items: stretch;
    flex-direction: column;
  }

  .contact-edit-button,
  .contact-done-button {
    width: 100%;
  }

  .contact-section li {
    font-size: 18px;
  }

  .home-hero h2 {
    font-size: clamp(25px, 7.4vw, 34px);
    line-height: 1.34;
  }
}

</style>

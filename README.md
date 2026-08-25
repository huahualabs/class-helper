# Class Helper

Class Helper 是給導師日常使用的 Vue 工具。公開分享版採 **generic profile**：資料預設存在老師自己的瀏覽器；需要跨裝置時，由每位老師在「資料與同步」連接自己建立的 Firebase Authentication 與 Realtime Database。不同 Firebase project、帳號與 UID 的資料不會共用。

## Deployment profiles

### Generic distribution（預設）

- 不需要 central Firebase env。
- Calendar 與 Schedule 使用本機資料，並可由個人 RTDB 同步整份班級資料。
- 不會初始化 owner central Firebase、顯示共享課表匯入或要求登入 parent portal。
- 複製 `.env.example` 只需調整 Hosting base path；也可完全不建立 `.env.local`。

### Owner parent-portal integration（選用）

這是特定班級部署的附加 profile，用來連接該擁有者自己的 parent portal、共享 `classEvents` 與 `classSchedules`。它不是其他老師使用 Class Helper 的前置條件。

- 以 `.env.parent-portal-integration.example` 為欄位清單。
- 真實值只放在 gitignored 的 `.env.production.local`／`.env.local`。
- integration class ID 必填，沒有 fallback。
- 一般 central production mode 仍有程式 guard；不得為了 build 而移除。
- schedule import 是獨立、預設關閉的一次性工具，不會自動 migration 或切換 source。

## Personal Firebase data boundary

設定精靈會引導老師建立自己的 Firebase project、啟用 Google Auth 及 RTDB，並貼入自己的 Web config。班級資料寫在：

```text
users/{signed-in teacher UID}/classHelper/currentClass
```

`firebase/database.rules.template.json` 是精靈顯示的唯一 Rules 來源。規則拒絕未登入存取，並只允許登入者讀寫與自己 UID 相同的 path；不同帳號不能互讀。Firebase Web config 不是密碼，但仍只保存在該老師的瀏覽器，不會納入班級備份或上傳到 Class Helper 開發者的 project。

真實學生姓名、積分、借閱與簿本紀錄屬個資。一般開發、測試與示範只能使用假資料；下載的 JSON 備份也應妥善保管。

## Local development

```bash
npm install
npm run dev
npm run build
```

Owner integration 的 Emulator scripts 會明確啟用 owner profile，且使用獨立 Auth／Firestore ports。不要將 Emulator env 帶入 generic production build，也不要使用未指定 profile 與 target 的部署命令。

Owner production 使用獨立 mode：將 `.env.parent-portal-integration.example` 複製為 gitignored 的 `.env.owner-production.local`，再執行 `npm run build:owner`。Generic GitHub Pages 仍執行預設 `npm run build`，不會讀取 owner mode env。

共享課表上線必須依序維持三個人工階段：先以 `legacy` 顯示舊課表且 import flag 關閉；另次批准後短暫打開 import flag 並完成 read-back；最後才把 schedule source 改成 `central` 並重新 build。Production central schedule 若找不到 canonical document，會停止編輯，不會以預設課表建立或覆蓋資料。

## Deployment safety

- Generic public build 只使用 `VITE_CLASS_HELPER_DEPLOYMENT_PROFILE=generic`。
- Owner integration 使用獨立 deployment env 與人工確認流程。
- Owner production 還必須明確設定 `VITE_ENABLE_OWNER_CENTRAL_PRODUCTION=true`；此 flag 不會啟用 schedule migration。
- 不可使用 naked `firebase deploy`。
- 不可把 owner project ID、class ID、UID 或 production migration flag 加入 generic env 範本。
- `firebase.json` 只描述 owner 的 `class-helper-2026` Hosting site；generic GitHub Pages workflow 不使用它。
- 任何 owner central production guard 調整、schedule migration 或 production write 都必須另案人工確認。
- Generic 分享版由 GitHub Pages `/class-helper/` 發布；owner Firebase Hosting 使用 `class-helper-2026` site 與 `/` base。兩者不可互相覆蓋。

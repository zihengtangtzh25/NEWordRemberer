# 背诵日历（StatsCalendar）实现计划 — NEWordRemberer v1.0.2

> **计划目标**：新增「背诵日历」模块，按日期聚合每日背诵统计数据（只记**结果**不记单词），提供月视图日历 UI 与单日详情面板；首次背诵 / 重做今日计划（全部重开）完成时写入 / 更新当日记录。
> **设计原则**：与现有 5 大铁则完全对齐（零 innerHTML、try-catch、状态聚合、版本位点同步、schema 追加式升级）。

---

## 一、仓库调研结论

### 1.1 现有触发写入 / 重开流程收口（UIManager.finishReview L391）

```
finishReview(reviewResults)
├─ retryState.isRetry = true（三模式错题重测：chain / first / all）
│   └─ 仅写 retryState.xxxResult，**不**调 completeTask，**不**写 wordBank
│       → 本次结论：三模式错题重测**全部**不计入日历（包括 all 模式）
├─ else（首次背诵 / 重做今日计划 redoTodayTask）
│   └─ taskManager.completeTask(reviewResults)
│       → 写 wordBank rXR，保证每日一轮唯一性（Step A 清当日旧 → Step B 写新）
│       → 本次结论：**这是日历数据的唯一写入入口**（对应「首次背诵记录数据 + 重做今日计划=全部重开时更新」的需求）
```

### 1.2 redoTodayTask 语义

UIManager.js L603：`redoTodayTask()` 时会立即重置 `retryState = {...DEFAULT}`，`isRetry=false`，所以完整做完一轮后走入 `completeTask` 分支——刚好等于「全部重开完成→更新日历」。无需新增分支判断。

### 1.3 现有 4 页面（home / review / results / wordbank）+ 顶部导航

index.html `<nav>`：首页 / 词库 / 背诵结果。本次新增第 5 个 `#calendar-page` + 导航按钮「背诵日历」。

### 1.4 todayTask 已具备统计 API（getTaskStats）

TaskManager L145：返回 `{ newCount, reviewCount, completed, correctCount, wrongCount, unfamiliarCount }`，直接可用于日历数据聚合。正确率 = correctCount / (newCount + reviewCount)。

### 1.5 版本位点

APP_VERSION 将从 `1.0.1` → `1.0.2`。CURRENT_FORMAT_VERSION 保持 `1.0.0`（备份 schema 0 变动，calendarStats 属于本地派生数据，**初期不纳入备份**——见风险章节）。6 处位点照常一次性同步。

---

## 二、本地日历数据存储格式（schema 设计）

### 2.1 localStorage 新 key：`calendarStats`

```jsonc
// localStorage.getItem('calendarStats') → JSON 字符串
{
  "schemaVer": "1.0.0",           // 日历数据 schema 版本，未来字段扩展追加用
  "generatedByApp": "1.0.2",      // 写入时 APP_VERSION，仅调试展示
  "days": {
    // ===== key = YYYY-MM-DD，用 wordBank.getTodayDate() 返回值（含 customDate）=====
    "2026-08-21": {
      // ---- ① 写入时的「当日任务」单词量口径（来自 task.newWords.length / reviewWords.length）----
      "newCount": 25,             // number，当日计划新词数（含 redo 后新任务可能不同）
      "reviewCount": 75,          // number，当日计划复习词数
      "totalCount": 100,          // number = newCount + reviewCount，直接存免去每次算

      // ---- ② 计入 wordBank 的最终答题结果（来自 completeTask 的 results 聚合 = todayTask.results 最终值）----
      "correctCount": 82,         // 对
      "wrongCount": 10,           // 错
      "unfamiliarCount": 8,       // 不熟
      "answeredCount": 100,       // answeredCount = correct + wrong + unfamiliar（理论等于 totalCount，用户中途跳题才不等）
      "accuracyPct": 82.0,        // number 0~100，保留 1 位小数 = correctCount / answeredCount * 100；answeredCount=0 时写 0

      // ---- ③ 重开次数记录（均为「完成了一整轮」的次数，不记录单词）----
      "retryCounts": {
        "redoAll": 1,             // 「重新背诵今日计划」按钮完成的次数（≥1 说明当日有 redo）
        "chain": 0,               // 错题重测三模式完成次数：链式（完成了几轮就+几）
        "first": 0,               // 首次错题重测
        "all": 0                  // 今日全部错题（retryWrongByMode 'all'）
        // 注：三模式错题重测 UI 层完成时各自 +1，但不影响 ①② 数据
      },

      // ---- ④ 元数据 ----
      "updatedAt": 1724227200000  // 毫秒时间戳（Date.now()），用于 UI 显示「最后更新 HH:MM」
    }
  }
}
```

### 2.2 写入 / 更新规则（核心，与用户需求对齐）

| 场景 | 触发点 | 对 calendarStats["YYYY-MM-DD"] 的操作 |
|---|---|---|
| ① 首次背诵完整完成（今日任务从头背到尾） | `UIManager.finishReview` → else 分支 → `completeTask` 之后 | 新建或**整体覆盖**当日记录（new/review/correct/wrong/unfamiliar 全部重算）；`retryCounts.redoAll=0`；`updatedAt=now` |
| ② 重做今日计划（全部重开）完整完成 | 同上（redoTodayTask 后 isRetry=false，completeTask 会清当日旧 rXR→写新，与用户「全部重开完成更新数据」对齐） | **整体覆盖**当日的 new/review/correct/wrong/unfamiliar/accuracyPct；**`retryCounts.redoAll += 1`**；updatedAt=now |
| ③ 错题重测链式模式完成一整轮 | `UIManager.finishReview` → retryState.isRetry=true 分支（currentMode='chain'） | **不改** ①② 的任何数据；**仅** `retryCounts.chain += 1`；updatedAt=now；若当日记录不存在不创建（无 mainData 的纯 retry 记录不写入——避免用户只打开没背也污染日历） |
| ④ 错题重测首次错题模式完成一整轮 | 同上，currentMode='first' | 不改 ①②；仅 `retryCounts.first += 1`；当日记录不存在不写 |
| ⑤ 错题重测「全部错题」模式完成一整轮 | 同上，currentMode='all' | 不改 ①②；仅 `retryCounts.all += 1`；当日记录不存在不写 |
| ⑥ 紧急写库（onbeforeunload completeTask 成功） | `UIManager._emergencySaveBeforeUnload` 成功调 completeTask 后 | 同 ①：若当日无记录则新建，有则**整体覆盖** mainData |

> **铁则**：③④⑤ 如果当日没有 ①/②/⑥ 产生的主记录（days[key] 不存在），就**直接丢弃 retry 计数**——用户那天根本没真正「完成」当日任务，纯练了几轮错题不该在日历上出现「学习了」的绿点。

### 2.3 格式升级 / 兜底

- 读 `calendarStats` 时必须 `try-catch JSON.parse`，失败 fallback 到空 `{ schemaVer: '1.0.0', generatedByApp: ver, days: {} }`。
- 缺字段按默认补齐（retryCounts 缺子键补 0，correct/wrong/unfamiliar 缺补 0，accuracyPct 缺重算，缺 updatedAt 写 0）。
- `schemaVer` 预留未来字段扩展（如加「平均用时」「周 / 月聚合缓存」），严格追加，不删旧键。

---

## 三、UI 设计（背诵日历页面）

新增第 5 个 page：`#calendar-page`，顶部导航加「日历」按钮（位于「背诵结果」右侧）。

### 3.1 页面结构（自上而下）

```
┌──────────────────────────────────────────────────────────────┐
│ #calendar-page（.page，继承现有 .section 卡片阴影 + 圆角风格） │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [ 📅 月切换栏 ]  ◀ 上月   2026 年 8 月   下月 ▶      🔘 今天 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [ 日历表 - 月视图 ]  7 列 × 最多 6 行 = 42 格子              │
│                                                              │
│  日     一     二     三     四     五     六  ← week-header  │
│ ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐                    │
│ │26│  │27│  │28│  │29│  │30│  │31│  │ 1│ ← last-month + cur │
│ │· │  │· │  │· │  │· │  │· │  │· │  │🟩│  · = 无记录空点    │
│ └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  🟩正确率≥80% 深绿 │
│ ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐  ┌──┐                    │
│ │ 2│  │ 3│..│18│..│22│  │23│  │24│ ← 当前月                 │
│ │🟩│  │🟧│  │🟨│  │🟥│  │· │  │· │  🟧60≤acc<80 橙          │
│ └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  🟨正确率有但<60 黄       │
│ ... (最多 6 行)                                              │
│ │25│  │26│..│30│  │31│  │ 1│  │ 2│  │ 3│  🟥 answered>0      │
│ └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  └──┘  但正确率=0(全错)  │
│                                                              │
│ 每格内容：                                                   │
│   ┌─────────────────────┐                                   │
│   │ 右上角 日期数字  21  │ ← 今天加圈 #2196F3 淡蓝底         │
│   │ 中央 色点（16×16）● │ ← 按正确率染色；无数据·不显示点    │
│   │ 底部 小字「100」/「」 │ ← 当日 answeredCount（省空间）；无数据空 │
│   └─────────────────────┘                                   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [ 日详情面板 - DayDetailPanel ]  默认显示今天；点格子切换     │
│                                                              │
│ 📆 2026 年 8 月 21 日  星期五                                │
│ ─────────────────────────────────────────────────────        │
│ 📊 当日统计：                                                │
│   新词 25 个   复习词 75 个   共计 100 个                    │
│   ✅ 对 82 (82.0%)   🔶 不熟 8 (8.0%)   ❌ 错 10 (10.0%)     │
│   🎯 正确率：82.0%  ━━━━━━━━━━━━━━━━━━━━ 绿条（按比例宽）    │
│                                                              │
│ 🔁 重开记录：                                                │
│   重新背诵今日计划（全部重开）：1 次    ← retryCounts.redoAll │
│   错题·链式重测：0 次                                        │
│   错题·首次错题：0 次                                        │
│   错题·今日全部错题：0 次                                    │
│                                                              │
│ 🕐 最后更新：2026-08-21 22:30:00  (updatedAt 转本地时区)     │
│                                                              │
│ [若当天无记录] 显示：「当日未完成任何背诵任务 📝」（灰色小字）│
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ [ 月汇总卡片 - 固定底部 ]                                    │
│   📆 本月共 22 天中：15 天学习 / 7 天空白                    │
│   📚 累计背诵：1,423 词（新 375 / 复习 1,048）                │
│   🎯 月平均正确率：78.4%                                     │
│   🔥 最长连续打卡：7 天（2026/08/15 ~ 08/21）                 │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 交互细节

| 交互 | 行为 |
|---|---|
| ◀ 上月 / 下月 ▶ | ±1 月，越过年末自动 ±1 年；月标题更新；月汇总随之刷新 |
| 🔘 今天 | 月视图跳到当前真实日期所在月 + 选中今日（customDate 调试时仍然用真实日期做「今天」锚点，避免乱跳）|
| 点击日格 | ① 高亮该格（#2196F3 蓝色 3px 边框）；② 刷新日详情面板内容；③ 平滑滚动到面板（手机端自动滑入）|
| 响应式 | ≤768px：日格底部数字隐藏（仅留色点 + 日期），月汇总改纵向堆叠，日详情面板移到月表下方不并排 |
| 色点颜色规则 | 无 answeredCount→空；acc≥80 绿 #4CAF50；60≤acc<80 橙 #ff9800；acc<60 且 answered>0 黄 #FFC107；answered>0 且 acc=0 红 #f44336 |

### 3.3 渲染安全（铁则 4：零 innerHTML）

所有日期数字、统计数字、「正确率」、「最后更新时间」全部使用 `textContent` / `document.createTextNode`。颜色块用 `style.backgroundColor` 设置，绝不拼 HTML。

---

## 四、涉及文件 / 模块改动

| # | 文件 | 修改内容 |
|---|---|---|
| 1 | **新增** `modules/StatsCalendar.js` | 新模块：负责 `calendarStats` 的读写、校验、聚合查询（getDay / getMonthSummary / getStreak） |
| 2 | `modules/UIManager.js` | ① 构造函数注入 `statsCalendar`；② bindEvents 新增日历导航绑定；③ 新增 `showCalendarPage(year,month,selDay)` / `renderCalendarMonth(y,m)` / `renderDayDetail(dateStr)` / `renderCalendarMonthSummary(y,m)`；④ 在 `finishReview` 两处分支里**追加**日历写入调用（不干扰原有 completeTask 逻辑）；⑤ `_emergencySaveBeforeUnload` 成功后追加写日历；⑥ 遵循状态聚合：`this.calState = { curYear, curMonth, selDay, ...DEFAULT_CAL_STATE }` |
| 3 | `modules/SchemaRegistry.js` | ① `APP_VERSION: "1.0.1" → "1.0.2"`；② CUR_VER 保持 `1.0.0`（calendarStats 不进备份）；③ 可选：在 schemas["1.0.0"].dataKeys 之外，**追加**注释说明「calendarStats 是本地派生统计，不纳入备份范围，factoryReset 时一并清空」 |
| 4 | `modules/WordBank.js` | ① `factoryResetKeepDefaultWords()` 中追加 `localStorage.removeItem('calendarStats')`（恢复出厂时清日历）；② `clearReviewRecordsOnly() / clearAllRecords()` 不动日历（用户清 rXR 只是清 SRS 轮次，历史日历作为"学过了"的纪念理应保留——若用户反对此，再改，先按这个最保守语义） |
| 5 | `index.html` | ① `<nav>` 中加 `<button id="calendar-nav">日历</button>`（`results-nav` 右侧）；② 新增 `<div id="calendar-page" class="page" style="display:none;"> ...完整 UI 见 3.1 节... </div>`（wordbank-page 前） |
| 6 | `style.css` | 追加日历专属样式类（约 60~90 行）：`.cal-month-bar` / `.cal-grid-wrap` / `.cal-week-header` / `.cal-cell` / `.cal-cell.today` / `.cal-cell.has-data` / `.cal-cell.selected` / `.cal-dot` / `.day-detail-panel` / `.acc-bar` / `.cal-month-summary` / 移动端窄屏媒体查询 |
| 7 | `app.js` | ① 在 `var taskManager = ...` 后加 `var statsCalendar = new StatsCalendar(wordBank, taskManager);`；② 传入 `UIManager(wordBank, memoryCurve, taskManager, statsCalendar)`；③ 不变更 beforeunload 已有逻辑 |
| 8 | `README.md` | 顶部 banner 改为 v1.0.2 / 备份格式 v1.0.0 / 生效日期 2026-08-22；第 6 条版本位点清单更新；功能区追加「📅 背诵日历」小节简要说明 |
| 9 | `docs/format/BACKUP_FORMAT.md` | 顶部「应用版本」改为 v1.0.2（备份格式 v1.0.0 不变）；说明「calendarStats 本地派生统计不纳入备份」 |
| 10 | **新增** `docs/changelog/CHANGELOG_v1.0.2.md` | 本次迭代发布说明（可选，按之前惯例创建；如用户不要求可延后，但代码改完后至少在 critics.md 上勾掉新增项目） |

---

## 五、实现步骤（依赖顺序）

> 共 7 大步，全部基于「最小改动 + 每步可回滚」。

### Step 1：版本位点预留 + 数据层（StatsCalendar.js）

- APP_VERSION 先改成 `1.0.2`（SchemaRegistry.js L19），其余 5 处最后收尾 Step 7 统一做，避免中途分心漏改。
- 实现 `StatsCalendar` 类（纯数据层，**不依赖 DOM**，可 Console 自测）：
  - `constructor(wordBank, taskManager)` — 拿 getTodayDate() 口径；`STORAGE_KEY = 'calendarStats'`
  - `_load()`：try-catch 读 localStorage，缺字段补齐返回 `{ schemaVer, generatedByApp, days:{} }`
  - `_save(data)`：`localStorage.setItem(...)` 包 try-catch，QuotaExceededError 抛带标记的异常（按现有 WordBank.save 模式）
  - `recordMainSession(dateStr, task, results)`：从 task 拿 newWords/reviewWords 长度，从 results 聚合 correct/wrong/unfamiliar → 写 days[dateStr] 的 mainData；retryCounts 不丢（已存在 retryCounts 就 Object.assign 保留）
  - `recordRetryCompletion(dateStr, mode)`：mode ∈ `'chain'|'first'|'all'|'redoAll'`；**仅当 days[dateStr] 已有 mainData 记录时**才 `retryCounts[mode]++`，否则 return（防止纯 retry 产生空记录）
  - `getDay(dateStr)` → 返回展开对象（含所有默认值补 0，不含则返回 `null`，不是空对象——便于 UI 判空显示提示）
  - `getMonthSummary(year, month /* 1-12 */)` → 返回 `{ daysStudied, totalNew, totalReview, avgAccuracy, longestStreak, ... }`
  - `factoryClear()` → 直接 `localStorage.removeItem(STORAGE_KEY)`

### Step 2：写入时机接入（UIManager.finishReview + 紧急写库）

在 UIManager 现有逻辑**之后**（即原代码完成后）追加调用，**不改原有任何分支判断**：

```
// 位置 1：finishReview() L391，retryState.isRetry=true 分支末尾（三模式错题重测完成）
// 已写 retryState.xxxResult 之后，加：
const today = this.wordBank.getTodayDate();
this.statsCalendar.recordRetryCompletion(today, this.retryState.currentMode);

// 位置 2：finishReview() L416，else 分支（completeTask 之后）
// this.taskManager.completeTask(this.reviewResults); 之后加：
const task = this.taskManager.getTodayTask();
if (task) {
  const today = task.date;
  const isRedo = (this._justDidRedo === true);   // ← 新状态变量（Step 3 细讲）
  const wasExisting = !!this.statsCalendar.getDay(today);
  this.statsCalendar.recordMainSession(today, task, this.reviewResults);
  if (isRedo || wasExisting) { this.statsCalendar.recordRetryCompletion(today, 'redoAll'); }
  this._justDidRedo = false;
}

// 位置 3：redoTodayTask() L603 开头，设标记 _justDidRedo = true（因为 finishReview 时需要知道这次 complete 是 redo）
// 注：redoTodayTask 内部 retryState 被重置了，无法用 retryState 承载该标记，用 calState 里的布尔位最稳

// 位置 4：_emergencySaveBeforeUnload() L1330，this.taskManager.completeTask 成功后加：
// 与位置 2 相同的 recordMainSession 逻辑
```

### Step 3：UIManager 状态聚合 & 页面路由

- 新增 `DEFAULT_CAL_STATE = Object.freeze({ curYear, curMonth, selDay, _justDidRedo:false })`，构造函数里 `this.calState = { ...DEFAULT_CAL_STATE }`，初始化时 year/month/day = 真实今天日期拆分。
- `bindEvents()` 加：`document.getElementById('calendar-nav').addEventListener('click', () => this.showPage('calendar'));`
- `showPage(pageName)`：原 switch/case 加 `case 'calendar': this.renderCalendarPage(); break;`（注意保持现有 hide-all-then-show-one 逻辑）

### Step 4：index.html 加 nav 按钮 + #calendar-page DOM 骨架

严格按 3.1 节结构用静态 DOM 写出来，所有动态内容节点用带 id 的占位 `<span id="cal-month-title">` 等，方便 Step 5 UIManager 用 DOM API 填值。**所有 placeholder 文案（如「正确率：--」）一律 text 节点写，不用 `{{}}` 模板避免误操作 innerHTML**。

### Step 5：UI 渲染函数（UIManager 追加 ~300 行）

- `renderCalendarPage()`：读 calState.curYear/curMonth → `renderCalendarMonth(y,m)` → `renderDayDetail(calState.selDay)` → `renderCalendarMonthSummary(y,m)`
- `renderCalendarMonth(y,m)`：
  - 算月第一天星期几（`new Date(y,m-1,1).getUTCDay()` 用 UTC 防时区）；算 last day；生成 42 格二维数组。
  - 每格通过 `statsCalendar.getDay(dateStr)` 拿数据 → 按色点规则生成元素。
  - 每格 `addEventListener('click', () => { calState.selDay=dateStr; renderDayDetail(dateStr); 重新高亮 })`
  - 月切换栏「◀上月 / 下月▶ / 今天」按钮事件绑定（或在 bindEvents 统一绑，用 `data-cal-action` 属性分发）
- `renderDayDetail(dateStr)`：按 3.1 节面板 DOM API 填值；`accuracyPct` 用 `<div class="acc-bar"><div class="acc-bar-fill" style="width: X%"></div></div>` 实现进度条（style.width 安全，非 innerHTML）。
- `renderCalendarMonthSummary(y,m)`：调用 StatsCalendar.getMonthSummary → 填空

### Step 6：style.css 追加日历样式

按现有设计语言：主色 #2196F3（蓝，导航高亮 / 今日圈）、成功绿 #4CAF50、橙 #ff9800、黄 #FFC107、错 #f44336、卡片白 #fff 1px #e0e0e0 圆角 8px 阴影 0 2px 8px。

### Step 7：版本位点 + 文档同步（6 处）

1. SchemaRegistry.APP_VERSION ✅（Step 1 已改）
2. index.html `#app-version-badge` 默认兜底文本 `v1.0.1` → `v1.0.2`
3. README.md 顶部 banner 改成 v1.0.2 + 功能区加 1 段「📅 背诵日历」说明 + 版本位点清单 APP_VERSION 更新
4. docs/format/BACKUP_FORMAT.md 顶部应用版本 v1.0.1 → v1.0.2 + 备注 calendarStats 本地派生不进备份
5. changelog：docs/changelog/ 下新增 `CHANGELOG_v1.0.2.md`（沿用 v1.0.1 风格，简要列本版本新增功能 + 写入规则表）
6. grep 全仓库 `v1.0.1` 回归（除 CHANGELOG_v1.0.1.md、critics.md 这种历史文件不能改的，其余全改完）

---

## 六、依赖与注意事项

- **写入日期口径**：统一走 `wordBank.getTodayDate()`（即 customDate 或真实日期），保证用户设置 customDate 调试时，日历上也会记录到「调试日期」那一天，而不是真实今天——与词库 rXR 写入日期口径完全一致，避免"我调 8/20 背的，日历记在 8/22"。
- **真实今天锚点**：UI 的「🔘 今天」按钮、默认打开月 = 真实今天（`new Date()`），不受 customDate 影响。customDate 只影响「写入到哪一条 day key」。这是调试模式下让用户同时看清「真实世界日历 + 模拟写入落点」的最合理方案。
- **factoryReset 清 calendarStats**：WordBank.factoryResetKeepDefaultWords 必须清。清 rXR（clearReviewRecordsOnly）**不清**日历——与用户「学过的日子就是学过了」直觉一致。如果用户事后觉得该清，再补按钮。
- **三模式错题重测不触发主记录**：用户当天没背完首次任务（todayTask.completed=false）、但中途玩了 N 轮错题重开——日历那天**应该空着**。这点必须在 UI 空态文案里给个小提示，避免用户疑问「我背了 10 分钟怎么日历空白」——写在 renderDayDetail 空态文案：「当日未**完成**一次完整的首次背诵或重做今日计划（错题重测为练习模式，不计入日历主记录 🧘）」。
- **与 redoTodayTask 历史记录兼容**：v1.0.1 新增的 todayTask.history（redoTodayTask 备份首次成绩）—— calendarStats 只认「最终 completeTask 写入的那次成绩」，history 不计。与用户「记录最新计入数据库的结果」一致。

---

## 七、验证（按自测清单）

- [ ] 顶部导航有「日历」按钮，点进 #calendar-page 不白屏，默认显示本月 + 今日选中
- [ ] 月切换：◀ → 上月、▶ → 下月、🔘 → 回真实今天所在月
- [ ] **首次背诵完成后**（完成今日任务）：日历对应日期出现绿点，详情面板 correct/wrong/unfamiliar 与结果页完全一致，retryCounts.redoAll=0
- [ ] **重做今日计划（全部重开）完整完成后**：correct/wrong/unfamiliar 被新成绩**覆盖**，retryCounts.redoAll +=1，accuracyPct 同步更新
- [ ] 错题重测三模式各自完成一整轮后：retryCounts 对应项 +1，主数据（correct/wrong/unfamiliar/newCount）**丝毫不改**
- [ ] customDate 设置到 2026-08-20 → 创建任务 → 背完 → 日历 8/20 那天有记录（不是 8/22）；「今天」按钮仍然回 8/22
- [ ] F12 手改 localStorage.calendarStats 为坏 JSON → 刷新页面，日历页仍然正常显示（空态），不白屏
- [ ] localStorage 满 quota 时 recordMainSession 会抛异常（不会影响 completeTask 已经写好的 wordBank 结果——必须 try-catch 隔离，写库成功是优先级，日历只是锦上添花统计）
- [ ] factoryResetKeepDefaultWords() 后 calendarStats localStorage key 被移除
- [ ] 版本 6 处位点：badge / banner / BACKUP_FORMAT / APP_VAR / changelog / schemaVer 全部 v1.0.2（CURRENT_FORMAT_VERSION 仍 v1.0.0）
- [ ] grep `innerHTML` 全仓库新增 0 处（日历代码零 innerHTML）

---

## 八、风险与处理

| 风险 | 影响 | 处理方式 |
|---|---|---|
| ① **calendarStats 写库失败**（配额满）| 日历空了，但 wordBank 真实进度安全不影响 | `recordMainSession` / `recordRetryCompletion` 的 try-catch 中**只 console.warn + 返回 false，不向上抛**，绝对不阻断 completeTask 流程；保存失败时 UI 可在下次打开日历页时检测（数据没写入那一天）给一条柔和提示「本地存储不足，部分日历数据未写入 💾 请先导出备份清理空间」（不在背诵路径上打断用户）|
| ② **「重做今日计划」与首次背诵的区分不准**（redoAll 计数错）| 月汇总「平均正确率」不变，仅 redoAll 次数不准 | 用 calState._justDidRedo 布尔位标记（redoTodayTask 入口设 true → finishReview completeTask 后读 & 清），两处 setter/getter 都在同一文件，grep 好查；如未来再重构可改在 todayTask 里加标记，但 v1.0.2 先最小化侵入 |
| ③ **calendarStats 是否纳入备份？** | v1.0.2 先**不**纳入，换设备会丢日历记录 | CURRENT_FORMAT_VERSION 保持 v1.0.0，避免破坏升级路径；在 README / changelog 明确标注「本地派生统计不跨设备迁移」。如用户强烈需要，v1.1.0 可追加到 schema.dataKeys 里 + 提供 merge 逻辑（按日期 mainData 取更新时间靠前者，retryCounts 简单累加即可）|
| ④ **「月视图 42 格」移动端过窄** | 5 列之后挤换行 | style.css 用 CSS Grid `repeat(7, minmax(0,1fr))` + 字体用 clamp(10px, 2vw, 13px)；≤420px 时隐藏格底数字，仅保留日期和色点，保证不换行 |
| ⑤ **紧急写库 finishReview 时 finishReview 已经在 beforeunload 同步调用，statsCalendar._save 可能不完整** | 下次打开那一天无记录 | beforeunload 里的 statsCalendar 写入同样做 try-catch，失败静默；下次用户打开「结果页」或「日历页」时，UIManager 做一次「懒重建」——如果 todayTask.completed=true 且 calendarStats.getDay(today)===null，就从 todayTask.results 重建一条主记录。 |

---

## 九、范围外（明确不做）

- 不做「周视图 / 年视图」（v1.1 如有需求再加，本期只月视图）
- 不做「导出日历 CSV / PNG」（同上）
- 不把 calendarStats 纳入导入导出备份（风险 ③ 已说明，v1.0.2 只本地）
- 不改现有首页统计区（首页「词库简略」不动）
- 不做「自定义日期区间月汇总」（仅按自然月）

---

*计划版本：v1.0.2-draft · 生成日期：2026-08-22 · 基于 AI_QUICKSTART v1.0.1 Checklist 校验通过*

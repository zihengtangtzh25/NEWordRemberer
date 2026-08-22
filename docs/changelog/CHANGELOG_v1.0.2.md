# NEWordRemberer v1.0.2 发布说明（背诵日历功能）

- **程序版本**：v1.0.2
- **备份格式版本**：v1.0.0（与 v1.0.0 / v1.0.1 完全兼容；calendarStats 为本地衍生数据，不参与导入导出）
- **发布日期**：2026-08-22
- **代码基线**：在 v1.0.1 全部 25 项 bug 修复的基础上，新增「背诵日历」功能（零破坏性变更）

---

## 0. 一句话概览

> **新增第 4 大 localStorage 键 `calendarStats`，以"每日一条快照、只存汇总数字、不存具体单词、取最新一次词库写入结果"为原则，完整记录你的背诵旅途。**

---

## 1. 功能清单（用户视角）

### 1.1 入口
- 顶部导航栏新增 📅 **「日历」** 按钮（第 4 个主 Tab：首页 / 词库 / 结果 / **日历**）
- 点击后进入独立的日历页面，页面结构自上而下分 3 段：
  1. **月切换栏**：上月 / 📅 2026 年 8 月 / 下月 + 「回到今天」快捷按钮
  2. **月视图网格**：周日～周六、6 周 × 7 列标准日历布局（共 42 格）
  3. **日详情 + 月汇总**：左侧「选中日的详细统计卡片」右侧「当前月的汇总指标」

### 1.2 月视图（核心 UI）
每一个日历格子（cal-cell）包含三层信息：
- **右上角**：当月日期号（越月格子使用灰色数字，点击可切换月份）
- **中央**：色点（6 档正确率颜色编码）：
  | 正确率 | 颜色 |
  |---|---|
  | 未答题（0 题） | `#e0e0e0` 浅灰圆点 |
  | 0% < 正确率 < 40% | `#9c27b0` 紫 |
  | 40% ≤ 正确率 < 60% | `#f44336` 红 |
  | 60% ≤ 正确率 < 80% | `#ff9800` 橙 |
  | 80% ≤ 正确率 < 95% | `#4CAF50` 绿 |
  | 95% ≤ 正确率 ≤ 100% | `#2E7D32` 深绿 |
- **底部**：当日总答题数量（`newCount + reviewCount`）。窄屏（≤768px）自动隐藏。

额外视觉提示：
- 🟦 **今日格**：蓝色 2px 粗边框 + 浅蓝底
- 🟨 **有数据格**：暖黄背景色（`#fffef5`）
- 🟦 **选中格**：蓝色 3px outline 覆盖（选中后会显示在下方详情面板）
- 🟥 **周末表头**：周日 / 周六列标题红色
- 🔘 **越月日（非本月）**：浅灰底 + 灰日期数字，点击直接跳转对应月份

### 1.3 日详情面板（选中日）
点击任意日期 → 显示该日的**完整背诵快照**，包含 9 个指标卡片 + 1 条正确率进度条：

| 指标卡片 | 含义 | 对应 storage 字段 |
|---|---|---|
| 📚 背诵（新学）数量 | 当日新学单词数 | `calendarStats[date].newCount` |
| 🔁 复习数量 | 当日复习单词数 | `calendarStats[date].reviewCount` |
| ✅ 对 | 判为「对」的数量 | `calendarStats[date].correct` |
| ⚠️ 不熟 | 判为「不熟」的数量 | `calendarStats[date].unfamiliar` |
| ❌ 错 | 判为「错」的数量 | `calendarStats[date].wrong` |
| 🎯 正确率 | (对+不熟×0.5) / 总答题数×100% | 由 `accuracy` 字段 / 计算 |
| 📝 总答题数 | 当日背诵+复习总题数 | 聚合显示 |
| 📅 日期 | 选中的当日日期（YYYY-MM-DD）| key |
| ⏱️ 最近更新 | 最后一次写入日历的时间戳 | `calendarStats[date].updatedAt` |

以及**四档重开次数**（对应 `retryCounts` 4 个键）：
| 重开类型 | 含义 | storage 键 |
|---|---|---|
| 🔗 链式错题重开次数 | 错题重开按钮完成次数 | `chain` |
| 🟧 首次错题重开次数 | 首次错题重测完成次数 | `first` |
| 🟥 全部错题重开次数 | 全部错题重测完成次数 | `all` |
| 🔄 重做今日计划次数 | 「重新背诵今日计划」按钮完成后计数 | `redoAll` |

> 底部还有「最近更新时间」本地时间字符串展示。若选中日无数据，显示友好空状态提示（`cal-day-empty` 样式）。

### 1.4 月汇总卡片（当前月）
月视图下方右侧显示当月的**横向汇总统计**（6 张 stat-chip）：
| 指标 | 计算方式 |
|---|---|
| 📅 背诵天数 | 当月有数据的日期数（`Object.keys(calendarStats).filter(isInMonth).length`）|
| 📝 总答题数 | 当月所有 `newCount + reviewCount` 累加 |
| 🎯 月平均正确率 | `Σ(correctCount + 0.5*unfamiliarCount) / Σ answeredCount`（分子分母都按月汇总，避免单日 0 题除零）|
| 🔗 链式错题次数 | 当月 `retryCounts.chain` 累加 |
| 🟧 首次错题次数 | 当月 `retryCounts.first` 累加 |
| 🔥 连续打卡天数 | 从「今天」向前看，连续 `has-main-session-data` 的天数（遇空洞即截止；若今天无数据则从昨天往前算）|

---

## 2. 数据记录原则（写入铁则）

这是日历功能最关键的设计约束，请后续开发者严格遵守。

### 2.1 核心原则（一句话）
> **只记录「写入词库（wordBank.rXR）的主背诵结果」，绝不记录错题重测的单独练习结果；当日多次写入时，永远保存「最后一次原子写入的主会话结果」。**

### 2.2 四档写入触发 + 对应行为

| 触发场景 | 调用点 | 是否写主数据（覆盖当日）| 是否累加 retryCounts | 说明 |
|---|---|---|---|---|
| **① 首次完整背诵完成** | `UIManager.finishReview()` 主分支（retryState.isRetry=false + todayTask.completed=false → 走 completeTask + showPage('results')）| ✅ **创建**当日 DayStats 主数据 | 否（首次）| 写入 `newCount/reviewCount/totalCount/correctCount/unfamiliarCount/wrongCount/answeredCount/accuracy/updatedAt`，`retryCounts` 全部 0 |
| **② 重做今日计划 完成** | `UIManager.redoTodayTask()` 标 `_justDidRedo=true` → `finishReview()` 主分支检测 | ✅ **覆盖**当日主数据（与「总是取最新一次词库写入结果」一致）| ✅ `redoAll += 1` 同时触发条件：① redoTodayTask 标记 **或** ② 当日已有记录（用户连续多次完整背完也算一次重做）| 旧的当日 stats 被完整覆盖为**这一轮重做的新结果**，重做计数独立累加 |
| **③ 三模式错题重测 完成** | `UIManager.finishReview()` retryState.isRetry=true 分支；链式/首次/全部 3 个 mode | ❌ **绝不**改主数据（不碰 newCount/reviewCount/correctCount...，因为错题重测从不写 wordBank）| ✅ 只有当**当日已有主数据存在**时，对应 `mode` 计数 +1；**当日无主数据时静默丢弃**（铁则：先有主会话，才能有重开记录）| 满足用户要求：「错题链式重开无需计入日历，首次错题重开也不记录」→ 即**主数据**不变、仅统计次数（若当日已完成首次主背诵） |
| **④ 中途关浏览器（紧急写库）** | `UIManager._emergencySaveBeforeUnload()` beforeunload 回调 | 当且仅当「首次背诵进行中 + reviewResults.length>0 + 今日未 completed」→ 调 completeTask 成功后 **同步写入当日 stats 主数据**（和 finishReview 主分支一致）；当日若已存在主数据，redoAll 也 +1（因这是覆盖更新）| 三模式错题重测中途关闭 → `retryState.isRetry=true` → **跳过紧急写库**（skip，不碰 stats）| 保证「用户首次背诵做到一半断电 → 词库紧急保存成功了，但日历没记录」的漏洞不会出现 |

### 2.3 懒回填（Lazy Backfill）兜底机制
- **触发**：每次 `renderCalendarPage()` 调用时自动先执行 `_calLazyBackfill()`
- **条件**：`todayTask.completed === true` + `todayTask.results.length > 0` + `statsCalendar.getDay(today) === null`（今日日历还没记录）
- **动作**：调用 `recordMainSession(today, task, results)` 从 todayTask.results 重建当日一条主数据
- **不覆盖原则**：若当日 stats 已有（后来重做今日计划写过）→ 跳过。因为「stats 永远比 todayTask.results 新 / 等价」（重做今日计划时 both 会被更新）

### 2.4 彻底重置（factoryReset）
- `WordBank.factoryResetKeepDefaultWords()` 新增 `localStorage.removeItem('calendarStats')`，和词库 / customDate 一起被清空，三方一致。
- 仅清 rXR 的 `clearReviewRecordsOnly()` 不影响 calendarStats（日历只是快照，清 rXR 是用户「想重置 SRS 曲线」而不是删除历史记录——如果以后想连日历也清，可以再补一个独立的「清日历」按钮在设置页，本次 v1.0.2 先不做 UI）。

---

## 3. 本地存储格式（`calendarStats` storage 键）

### 3.1 顶层结构
```javascript
// localStorage.getItem('calendarStats') → JSON.parse 结果：
{
  "_schemaVer": "1.0",          // 日历结构版本，未来如果加字段可据此升级
  "days": {                     // 以 YYYY-MM-DD 为 key 的字典
    "2026-08-22": { DayStatsObject },
    "2026-08-21": { DayStatsObject },
    // ...
  }
}
```

### 3.2 DayStatsObject 字段定义
```typescript
interface DayStatsObject {
  // —— 主数据（由"首次/重做主会话"写入，错题重测绝不改这些）——
  newCount:         number;   // 当日计划的新学单词数（来自 todayTask.newWords.length）
  reviewCount:      number;   // 当日计划的复习单词数（来自 todayTask.reviewWords.length）
  totalCount:       number;   // newCount + reviewCount（写入时冗余，UI 读一个字段即可）
  correctCount:     number;   // 判为「对」的数量
  unfamiliarCount:  number;   // 判为「不熟」的数量
  wrongCount:       number;   // 判为「错」的数量
  answeredCount:    number;   // correctCount + unfamiliarCount + wrongCount
  accuracy:         number;   // 0~1 小数；(correctCount + 0.5 * unfamiliarCount) / answeredCount；0 题取 0
                             // 【v1.0.2 升级兼容注意】：
                             //   ① 归一化时若读到旧键 accuracyPct (百分比语义 0~100) → 自动 /100 迁移到此键
                             //   ② 归一化后 delete accuracyPct，保证只有 accuracy 单一键，避免漂移
                             //   ③ 若该值非法/缺 → 从 correct/unfamiliar/wrong 三档重新计算

  // —— 重开计数（4 档，独立累加）——
  retryCounts: {
    chain:    number;   // 链式错题重开完成次数（default 0）
    first:    number;   // 首次错题重测完成次数（default 0）
    all:      number;   // 全部错题重测完成次数（default 0）
    redoAll:  number;   // 重做今日计划完成次数（default 0）
  };

  // —— 时间戳（用于日详情面板「最近更新」展示 + 未来排错）——
  updatedAt: number;   // Date.now() 的毫秒时间戳
}
```

### 3.3 正确性校验（开发自查用）
- 不变式 1：`newCount + reviewCount === correct + unfamiliar + wrong`，二者相等（因为主会话里每一题都会对/错/不熟三选一，且 todayTask 的 totalWords === reviewResults.length 由 SM-2 流程保障）
- 不变式 2：`retryCounts.chain/first/all` 只会在当日**已有 DayStats**后才开始增长（StatsCalendar.recordRetryCompletion 无主记录时静默 return）
- 不变式 3：若用户未做「重做今日计划」也未紧急覆盖，则 `updatedAt` === 第一次 completeTask 时间；否则 === 最后一次覆盖时间

---

## 4. 涉及修改的文件与模块职责

| 文件 | 修改/新增 | 职责 |
|---|---|---|
| `modules/SchemaRegistry.js` | 改 | `APP_VERSION`: `"1.0.1"` → `"1.0.2"`；备份格式 `CURRENT_VERSION` 仍 `1.0.0`（无破坏性变更）|
| `modules/StatsCalendar.js` | **新增** | 日历数据层：calendarStats JSON 读写（懒加载 + 内存缓存 + try-catch 防 QuotaExceededError）；对外 API：`recordMainSession` / `recordRetryCompletion` / `getDay` / `getMonthSummary` / `clearAll` / `getAll` |
| `modules/WordBank.js` | 改 | `factoryResetKeepDefaultWords()` 追加 `localStorage.removeItem('calendarStats')` |
| `modules/UIManager.js` | 改 | ① 构造函数新增 `statsCalendar` 参数 + `DEFAULT_CAL_STATE`；② `showPage('calendar')` 路由；③ `bindEvents()` 新增日历导航绑定（prev/next/今天/nav 切换）；④ `finishReview()` 主分支 + 三模式分支分别写入日历；⑤ `redoTodayTask()` 标 `_justDidRedo`；⑥ `_emergencySaveBeforeUnload()` 紧急写库成功时同步写日历；⑦ 渲染函数：`renderCalendarPage` / `renderCalendarMonth` / `renderDayDetail` / `renderCalendarMonthSummary` / `_calLazyBackfill` / `_calShiftMonth`；⑧ DOM API + textContent 渲染，零 innerHTML 用户数据，防 XSS |
| `index.html` | 改 | ① 顶部导航新增「📅 日历」按钮（第 4 个主 Tab）；② 新增 `<section id="calendar-page">`（含月切换栏 / cal-grid-wrap / day-detail-panel / cal-month-summary 4 段）；③ `<script src="modules/StatsCalendar.js">` 引用；④ 默认版本徽章 `v1.0.2` 兜底文本 |
| `style.css` | 改 | 追加「背诵日历样式」段：`cal-month-bar / cal-grid / cal-cell(.today/.selected/.has-data/.out-of-month) / cal-dot / cal-cell-bottom / cal-stat-line / stat-chip / acc-bar / cal-updated / cal-summary-grid` + 768px / 420px 两档移动适配 |
| `app.js` | 改 | 实例化 `new StatsCalendar(wordBank)`，作为第 5 个参数注入 `new UIManager(...)` |
| `README.md` | 改 | 顶部版本 banner → v1.0.2；新增「📅 v1.0.2 背诵日历」功能章节；项目结构表新增 StatsCalendar.js、calendarStats 键；6 位点清单同步为 v1.0.2 实际值；技术栈 localStorage 改为 4 键 |
| `docs/format/BACKUP_FORMAT.md` | 改 | 应用版本→v1.0.2；补 §2.3「calendarStats 为本地衍生数据，不参与备份」详细说明；导入兼容性表 v1.0.1→v1.0.2；JSON 示例 appVersion 1.0.2 |
| `docs/changelog/CHANGELOG_v1.0.2.md` | **新增** | 本文件 |

---

## 5. StatsCalendar.js 公共 API（供后续功能复用）

```javascript
const cal = new StatsCalendar(wordBank); // 内部懒加载 calendarStats storage

cal.recordMainSession(date, todayTask, reviewResultsArray);
// —— 原子覆盖：把主会话统计写入 date（或创建）；retryCounts 已存在则保留，不存在则置 0；updatedAt = now

cal.recordRetryCompletion(date, mode);
// —— mode ∈ { 'chain' | 'first' | 'all' | 'redoAll' }
// —— 当日无主数据时静默 return（铁则 §2.2）；否则对应计数 +1，updatedAt=now

cal.getDay(date);                 // → DayStatsObject 或 null
cal.getAll();                     // → { _schemaVer, days } 全量
cal.getMonthSummary(year, month); // → { activeDays, totalAnswers, avgAccuracy, retries:{chain/first/all/redoAll}, currentStreak }
cal.clearAll();                   // → 清 localStorage.calendarStats
```

所有写入方法都会**先 try/catch 包一层 localStorage.setItem**：若报 `QuotaExceededError`（localStorage 5MB 满）→ 只 `console.warn` 不抛异常，绝不阻塞主背诵流程。

---

## 6. 与 v1.0.1 既有规则的兼容性（零破坏性）

背诵日历功能是「纯加性」的：
1. **备份格式 v1.0.0 不变**：导入/导出逻辑完全不变，v1.0.1 导出的 JSON 可以直接 v1.0.2 导入；v1.0.2 导出的 JSON 也可以直接 v1.0.1 导入（因为 v1.0.2 没改 `wordBank` / `customDate` 结构）
2. **todayTask 结构不变**：主会话 `completeTask()` 行为（包括每日一轮唯一性、重背原地覆盖）完全按 v1.0.1 语义走
3. **三模式错题重测（Bug 12 / A5 ②）** 语义不变：错题重测绝不写词库；日历也绝不改 stats 主数据（只加 retryCounts 当日已有记录的情况）
4. **紧急写库（歧义 3 / B4 规则 4）** 语义不变：retry=true 跳过，首次背诵保存；新增的是「保存成功后顺手也写 stats」

---

## 7. 已处理的边界 case

| # | 边界场景 | 处理方式 | 对应代码位置 |
|---|---|---|---|
| B1 | localStorage 配额不足（满 5MB）| 写 calendarStats 用 try-catch；失败时只 console.warn，绝不影响已经成功的词库写入 | `StatsCalendar._save()` |
| B2 | 用户开启自定义日期（customDate）| 所有 date key 均使用 `wordBank.getTodayDate()` → 今日任务的 `date` 字段，和 v1.0.1 跨模块日期语义保持一致 | 多个写入点 |
| B3 | 选中无数据日期（空态）| 日详情面板显示 `cal-day-empty` 友好说明；不抛异常不崩溃 | `renderDayDetail()` |
| B4 | 老用户升级到 v1.0.2（历史 day 缺失）| 历史日期的 stats 永远不会被补（因为 todayTask 是当日一次性产物，过期没了）；这是合理的——只有升级当天及之后的新背诵才会被日历记录。如果未来想补历史，可以写一个「从 wordBank.rXR 反推 DayStats」的重建脚本，本版本不提供（避免 O(N^2) 性能陷阱）| 懒回填只处理「今日」 |
| B5 | 紧急写库成功但随后又正常 finishReview | 两条路径都会走「当日已有记录则 redoAll 计数 +1」的分支 → 不会丢失覆盖语义；数据最终一致（因为二者写入的内容都来自 completeTask 的同一批 reviewResults）| `finishReview` 主分支 + `_emergencySaveBeforeUnload` |
| B6 | 用户 2 天前的备份导入今天 | calendarStats 会被清空（因 importBackupData 最后会 `removeItem('todayTask')` 触发安全重置）；导入后 v1.0.2 次日背诵会自动累积新记录——与 README「导入后请重新创建今日任务」语义一致 | BACKUP_FORMAT §2.3 |

---

## 8. 自测 CheckList（v1.0.2 发布回归）

- [ ] 顶部版本徽章显示 `v1.0.2`，悬停 tooltip「程序版本 v1.0.2 / 备份格式 v1.0.0」
- [ ] 顶部导航有 4 个 Tab：首页 / 词库 / 结果 / 日历，可切换
- [ ] 完成今日首次背诵 → 日历页显示当日 9 项指标 + 重开次数全 0 + updatedAt ≈ 完成时间
- [ ] 重做今日计划完成 → 日历主数据变为新的对/错/不熟；`redoAll += 1`
- [ ] 三模式错题重测各做一次 → 当日重开次数分别 `chain+1` / `first+1` / `all+1`；主数据的 correct/wrong/unfamiliar **不变**
- [ ] 当日无主数据时直接按错题重测 → 完成后 calendarStats 该日记录仍为 null（不创建空洞日）
- [ ] 首次背诵中途关闭浏览器 → 重新打开后 calendarStats 当日有数据（紧急写库）
- [ ] 三模式错题重测中途关浏览器 → 日历不写（符合 skip）
- [ ] 回到今天按钮可以跳回今天并选中今日；< > 月切换正常跨年/跨月
- [ ] 色点正确率颜色符合 6 档表；正确率进度条填充宽度正确
- [ ] 导出备份 JSON → 字段 appVersion=1.0.2，formatVersion=1.0.0，无 calendarStats 字段
- [ ] 导入 v1.0.0 / v1.0.1 备份 → 不报格式错误；导入后 calendarStats 为空，后续背诵自动累积
- [ ] factoryResetKeepDefaultWords → calendarStats 键被删除
- [ ] 手机窄屏：日历不溢出，底部数字隐藏，点击格子能看到详情；stat-chip 自动换行

---

## 9. 为 v1.0.3 及以后预留的钩子

1. **calendarStats 结构版本号**：`_schemaVer = "1.0"` 便于未来加新字段（如 mode、studyMinutes、错误最多的词性分布等）时增量升级
2. **factoryResetKeepDefaultWords 日历清理已接入**：未来设置页若加入「彻底重置」按钮，自动生效
3. **懒回填只处理当日**：未来可加 `StatsCalendar.rebuildFromWordBankHistory(startDate, endDate)` 从 wordBank.rXR 重建历史日（要注意「同日多次轮次」中只能取最后一条写入的那一轮，本版本没实现是为了性能 + 复杂度控制）

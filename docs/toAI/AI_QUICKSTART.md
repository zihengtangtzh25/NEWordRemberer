# NEWordRemberer AI 速查指南

> **文档目的**：让一个完全没看过此项目的 AI 在 10 分钟内快速理解程序结构、算法公式、数据流、CRUD 接口，能立即开始接手开发任务。
> **适用场景**：新 AI Agent 接手项目时的第一份必读文档
> **配套文档**：
> - 历史决策与经验：[dev_journey_v1.0.0_to_v1.0.1.md](dev_journey_v1.0.0_to_v1.0.1.md)
> - 完整 bug 修复清单：[docs/changelog/CHANGELOG_v1.0.1.md](../changelog/CHANGELOG_v1.0.1.md)
> - 残余问题排期：[docs/changelog/critics.md](../changelog/critics.md)
> - 备份格式定义：[docs/format/BACKUP_FORMAT.md](../format/BACKUP_FORMAT.md)

---

## 一、项目一句话定位

**纯前端英语单词背诵应用**（HTML/CSS/JS + localStorage，零依赖零构建），采用简化 SM-2 记忆曲线算法，双击 `index.html` 即可运行。

- 当前程序版本：**v1.0.1**
- 备份格式版本：**v1.0.0**（schema 结构自首发未变）
- 默认词库：3282 个单词（[data/defaultWords.js](../../data/defaultWords.js)）

---

## 二、项目结构（快速地图）

```
NEWordRemberer/
├── index.html                # 主页面（含导入弹窗 UI）
├── style.css                 # 样式
├── app.js                    # 应用入口：实例化 4 大模块 + UIManager.bindEvents()
├── README.md                 # 项目说明
│
├── data/
│   └── defaultWords.js       # 默认词库（3282 词）
│
├── docs/                     # 非代码数据文件
│   ├── changelog/            # CHANGELOG_v1.0.1.md、critics.md
│   ├── format/               # BACKUP_FORMAT.md
│   ├── toAI/                 # AI 指南（本文件所在目录）
│   └── other/                # 3500词.csv 等杂项
│
└── modules/                  # 4 大核心模块
    ├── SchemaRegistry.js     # 版本/格式注册中心（三边对照的"代码边"，唯一真相源）
    ├── WordBank.js           # 词库管理：CRUD + 导入导出 + localStorage 持久化
    ├── MemoryCurve.js        # 记忆曲线算法（easeFactor / due / 优先级，唯一算法真相源）
    ├── TaskManager.js        # 当日任务 todayTask：创建/完成/清除
    └── UIManager.js          # UI 调度 + 导入导出 UI + 快捷键 + 紧急写库
```

### 2.1 模块依赖关系

```
app.js
  ├─ new WordBank()                        ← 词库（无依赖，可独立）
  ├─ new MemoryCurve()                     ← 算法（无依赖）
  ├─ wordBank.memoryCurve = memoryCurve     ← 【关键】依赖注入，让 WordBank 委托 MC 算法
  ├─ new TaskManager(wordBank, memoryCurve) ← 任务（依赖两者）
  └─ new UIManager(wordBank, memoryCurve, taskManager)  ← UI（依赖三者）
```

实例化顺序见 [app.js](../../app.js)。

### 2.2 页面结构（4 个 page）

| page | DOM ID | 作用 |
|---|---|---|
| home | `#home-page` | 首页：统计、创建任务、搜索、系统设置 |
| review | `#review-page` | 背诵页：中译英 / 英译中 |
| results | `#results-page` | 结果页：首次背诵 + 各轮错题重开统计 |
| wordbank | `#wordbank-page` | 词库浏览 |

切换通过 `UIManager.showPage(pageName)`。

---

## 三、数据存储（localStorage 3 个 key）

### 3.1 三个键的 schema

#### `wordBank`（核心，长期数据）
```jsonc
[
  {
    "w": "abandon",                    // 单词（英文小写或原拼写，比较时不区分大小写）
    "m": "[{\"p\":\"v.\",\"c\":[\"放弃\",\"遗弃\"]}]",  // 释义序列化字符串
    "cAt": "2026-08-03",              // 创建日期 YYYY-MM-DD
    "r1D": "", "r1R": "",             // 第 1 轮复习日期 / 结果
    "r2D": "", "r2R": "",             // 第 2 轮
    // ... 省略 r3~r9
    "r10D": "", "r10R": ""            // 第 10 轮（最大轮次）
  }
  // ... 3282 个 WordObject
]
```

**rXR 枚举值**：`""`（未复习）/ `"对"` / `"错"` / `"不熟"`

**m 字段展开结构**：
```js
JSON.parse(word.m)
// => [{ p: "v.", c: ["放弃", "遗弃"] }, { p: "n.", c: ["放任"] }]
// p = 词性（string），c = 释义数组（string[]）
```

#### `todayTask`（当日临时，每日重建）
```jsonc
{
  "date": "2026-08-21",         // 任务创建日期，与 getTodayDate() 比对，不同则失效
  "newWords": ["abandon", ...], // 新词单词名数组
  "reviewWords": ["review", ...], // 复习词单词名数组
  "completed": false,           // 是否完成
  "results": [                  // 答题结果（每词最后一条为准）
    { "word": "abandon", "result": "对" }
  ]
}
```

#### `customDate`（调试用）
- 类型：`string(YYYY-MM-DD) | null`
- 语义：用户自定义"今日日期"用于模拟调试记忆曲线；`null` 表示使用真实系统日期

### 3.2 生命周期

| 键 | 写入时机 | 清除时机 |
|---|---|---|
| `wordBank` | addWord / updateWord / completeTask / importBackupData / save | 清浏览器缓存 / 恢复出厂 |
| `todayTask` | createTask / completeTask / clearTodayTask | clearTodayTask('full') / 跨日失效 / 导入备份后自动清 |
| `customDate` | setCustomDate | setCustomDate(null) / factoryReset |

---

## 四、记忆曲线算法（MemoryCurve）

> **铁则**：所有 SRS 计算只在 [MemoryCurve.js](../../modules/MemoryCurve.js) 里实现一份，其他模块代理调用。

### 4.1 核心常量

```js
baseInterval = 1         // 基础间隔天数
defaultEaseFactor = 1.5  // 初始 ef
minEaseFactor = 1.2      // ef 下限
maxEaseFactor = 2.5      // ef 上限
MIN_UNFAMILIAR_EASE = 1.3  // 「不熟」结果的下限（= min + 0.1）
minInterval = 1          // 下次复习最小天数
maxInterval = 100        // 下次复习最大天数（防 ef^9 爆炸到几百年）
```

### 4.2 easeFactor 计算公式

遍历 r1~r10 所有已复习轮次，累加 ef：

```
ef = 1.5  // 初始
for each (r{i}D 非空):
    if r{i}R == '对':    ef += 0.1
    if r{i}R == '错':    ef = max(1.2, ef - 0.2)
    if r{i}R == '不熟':  ef = max(1.3, ef - 0.1)
最后: ef = min(2.5, ef)
```

见 [MemoryCurve.getEaseFactor](../../modules/MemoryCurve.js#L26-L44)。

### 4.3 下次复习日期推算公式

```
days = ceil(baseInterval × ef^(reviewCount))   // reviewCount = 已复习轮次数
days = clamp(days, minInterval=1, maxInterval=100)
nextDate = lastReviewDate + days 天
```

**关键**：指数里的 `reviewCount` = `lastReviewIndex - 1`（因为第 1 轮复习时 ef 已经是初始 1.5，间隔 = 1×1.5^0 = 1 天）。

见 [calculateNextReviewDays](../../modules/MemoryCurve.js#L14-L17) / [calculateNextReviewDate](../../modules/MemoryCurve.js#L19-L24)。

### 4.4 关键方法签名

| 方法 | 签名 | 作用 |
|---|---|---|
| `getEaseFactor(word)` | `WordObject → number` | 计算当前 ef |
| `updateEaseFactor(word, result)` | `(WordObject, '对'\|'错'\|'不熟') → number` | 假设本次答题后 ef 会变成多少（用于预判） |
| `getLastReviewIndex(word)` | `WordObject → 0~10` | 最后一个非空 r{i}D 的索引 |
| `getNextReviewIndex(word)` | `WordObject → 1~10` | min(last+1, 10)，写到哪一轮 |
| `getReviewCount(word)` | `WordObject → 0~10` | 已复习轮次数 |
| `isDueForReview(word, today)` | `(WordObject, YYYY-MM-DD) → boolean` | 是否到期该复习 |
| `getReviewPriority(word, today)` | `(WordObject, YYYY-MM-DD) → number` | 优先级，**负数越小越优先**（逾期天数） |
| `getWordMasteryLevel(word)` | `WordObject → {level, score}` | 掌握度评级 |

### 4.5 掌握度评级规则

| level | 条件 |
|---|---|
| 未学习 | reviewCount = 0 |
| 初学 | reviewCount = 1 |
| 熟悉中 | reviewCount = 2 |
| 不稳定 | 连续对 < 2 或 ef < 1.5 |
| 掌握中 | 连续对 ≥ 2 且 ef ≥ 1.5 |
| 熟练 | 连续对 ≥ 3 且 ef ≥ 1.8 |
| 已掌握 | 连续对 ≥ 5 且 ef ≥ 2.0 |

---

## 五、数据流（端到端）

### 5.1 用户完整使用流程

```
1. 用户打开 index.html
   └─ DOMContentLoaded → app.js 实例化 4 大模块 + 注入 memoryCurve → UIManager.bindEvents()

2. 创建今日任务
   └─ UIManager.handleCreateTask() 
      └─ TaskManager.createTask(newCount, reviewCount)
         ├─ wordBank.getUnreviewedWords()    取未背过的词
         ├─ wordBank.getReviewDueWords()     取到期该复习的词
         │  └─ memoryCurve.isDueForReview(word, today)  委托 MC
         ├─ shuffledUnreviewed.slice(0, newCount)
         ├─ sortedReviewDue（按 getReviewPriority ASC 排序）.slice(0, reviewCount)
         └─ localStorage.setItem('todayTask', JSON.stringify(task))

3. 开始背诵
   └─ UIManager.startReview()
      └─ taskManager.getTaskWords() → reviewWords（new + review 打乱）
      └─ renderReviewWord() 渲染题目

4. 答题（每题循环）
   └─ reviewResults.push({ word, result: '对'/'错'/'不熟' })
   └─ 流式同步 todayTask.results 到 localStorage（防中途丢）

5. 完成背诵
   └─ UIManager.finishReview()
      └─ 判断 retryState.isRetry:
         ├─ 是（错题重测）：结果存入 retryState.xxxResult，**不写 wordBank**
         └─ 否（首次/重做）：taskManager.completeTask(reviewResults)

6. completeTask 写库（原子操作）
   ├─ Step A: 清该词所有 r{i}D === today 的旧记录（每日一轮唯一性红线）
   ├─ Step B: 写 r{nextIndex}D = today / r{nextIndex}R = result
   ├─ wordBank.save() 集中一次 IO
   └─ localStorage.setItem('todayTask', {completed:true, results})  最后写状态

7. 紧急写库（用户中途关浏览器）
   └─ window.beforeunload → UIManager._emergencySaveBeforeUnload()
      ├─ retryState.isRetry === true → skip（错题重测接受从头再来）
      └─ 否则：currentPage in [review,results] && reviewResults.length > 0 && !taskCompleted
         └─ completeTask(reviewResults) 紧急写库
```

### 5.2 错题重测三模式

`UIManager.retryWrongByMode(mode)` 统一入口，绝不写 wordBank：

| mode | 数据源 | 说明 |
|---|---|---|
| `chain` | 上一轮 chainRounds 的错题，没有则用 task.results（首轮错题） | 链式推进，可无限轮 |
| `first` | task.results（首次背诵全部错题） | 固定范围，可无限次重做 |
| `all` | task.results + chainRounds + firstResult 所有非"对"的词去重 | 今日全部错题合并 |

切换流程时：`retryState = { ...DEFAULT_RETRY_STATE }` 一次性重置。

---

## 六、CRUD 接口（WordBank）

> **铁则**：单词主键统一用 `w.w.toLowerCase()`，禁止 `=== word.w` 严格匹配。

### 6.1 增

```js
wordBank.addWord({ w: 'hello', m: '[{"p":"int.","c":["你好"]}]' })
//   → 已存在返回 false
//   → schema 校验失败返回 false
//   → 成功 push + save()
```

### 6.2 查

```js
wordBank.getWord(wordName)          // → WordObject | undefined（toLowerCase 匹配）
wordBank.hasWord(wordName)          // → boolean
wordBank.getAllWords()              // → WordObject[]（浅拷贝）
wordBank.searchWords(query)         // → WordObject[]（includes 模糊匹配）
wordBank.getWordCount()             // → number
wordBank.getUnreviewedWords()       // → WordObject[]（所有 r{i}D 都空的）
wordBank.getReviewDueWords()        // → WordObject[]（isDueForReview = true）
wordBank.getWordStats()             // → { total, unreviewed, reviewDue, mastered }
```

### 6.3 改

```js
wordBank.updateWord(word)
//   → 找不到（严格 === word.w 匹配，**遗留 bug**：大小写不一致会失败）
//   → 找到：this.words[index] = {...word}; save()
```

⚠️ `updateWord` 仍是严格匹配，是已知历史问题，新增功能避免依赖它。

### 6.4 删

```js
wordBank.clearReviewRecordsOnly()        // 只清 r1~r10（保留单词本身）
wordBank.clearAllRecords()                // 软别名 = clearReviewRecordsOnly
wordBank.factoryResetKeepDefaultWords()   // 真正恢复出厂：清词库 + 加载默认词 + 清 customDate
```

### 6.5 导入导出

```js
wordBank.exportBackupData()
//   → { wordBank: WordObject[](浅拷贝), customDate: string|null }

wordBank.importBackupData(backupData, mergeMode)
//   mergeMode: 'overwrite' | 'merge'
//   overwrite: 全清后写入
//   merge:     三级冲突优先级
//              ① 复习轮次更高者赢
//              ② 轮次相同 ef 更低者赢
//              ③ 都相同本地优先
//   → { importedCount, updatedCount, invalidCount, totalAfter }
```

### 6.6 持久化

```js
wordBank.save()
//   → try { localStorage.setItem } catch:
//     ├─ QuotaExceededError → alert 提示导出备份
//     └─ 其他异常 → alert + console.error
//   → 返回 true/false
```

---

## 七、任务管理（TaskManager）

### 7.1 todayTask 结构

```js
{
  date: '2026-08-21',          // 创建日期（getTodayDate 返回 customDate 或真实日期）
  newWords: ['word1', ...],    // 新词单词名数组
  reviewWords: ['word2', ...], // 复习词单词名数组
  completed: false,            // 是否完成
  results: [{ word: 'word1', result: '对' }]  // 答题结果（每词最后一条为准）
}
```

### 7.2 关键方法

| 方法 | 作用 |
|---|---|
| `createTask(newCount, reviewCount)` | 创建任务，写 localStorage |
| `getTodayTask()` | 读取任务，**跨日自动返回 null**（date !== today） |
| `isTaskCreated()` / `isTaskCompleted()` | 状态查询 |
| `completeTask(results)` | **原子操作**：清旧 rXR → 写新 rXR → save → 标记 completed |
| `clearTodayTask(mode)` | `mode='full'` 彻底删除；`mode='resultsOnly'` 保留 newWords/reviewWords 只清 results |
| `getTaskStats()` | 返回 { newCount, reviewCount, completed, correctCount, wrongCount, unfamiliarCount } |
| `getTaskWords()` | 返回 new + review 打乱后的 WordObject[]（带 type 标记） |

### 7.3 completeTask 时序（核心红线）

```
for each result:
    word = wordBank.getWord(result.word)       // 拿到内部引用
    Step A: 清该词所有 r{i}D === today 的旧记录   ← 每日一轮唯一性
    Step B: nextIndex = memoryCurve.getNextReviewIndex(word)
            word[r{nextIndex}D] = today
            word[r{nextIndex}R] = result.result
wordBank.save()                                 ← 集中一次 IO
localStorage.setItem('todayTask', {completed:true, results})  ← 最后写状态
```

⚠️ **不允许**在 completeTask 之外的地方写 wordBank 的 rXR 字段。

---

## 八、SchemaRegistry（版本/格式中心）

### 8.1 版本号

```js
APP_VERSION = '1.0.1'        // 程序版本（UI 徽章显示）
CURRENT_VERSION = '1.0.0'    // 备份格式版本（导入导出兼容判断基准）
FORMAT_IDENTIFIER = 'NEWordRemberer-Backup'  // 固定标识
```

### 8.2 validateWord 校验层级（第一道防线）

```
L1: typeof w === 'object' && w !== null
L2: typeof w.w === 'string' && w.w.length > 0 && !w.w.includes('<')  // XSS 防
L3: typeof w.m === 'string'
L4: JSON.parse(w.m) 成功 && 是数组 && 每项 {p:string, c:string[]} && p/c 无 '<'
L5: typeof w.cAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cAt)
L6: r1~r10 的 r{i}D 是 string（有值时必须是 YYYY-MM-DD）
L7: r1~r10 的 r{i}R 在 ['', '对', '错', '不熟'] 枚举内
```

### 8.3 三边对照原则

| 边 | 位置 | 生成方式 |
|---|---|---|
| 边1（代码） | `modules/SchemaRegistry.js` | 人工维护（唯一真相源） |
| 边2（JSON 内嵌） | 导出 JSON 的 `exportedFromFormat` 字段 | `generateEmbeddedFormatDoc()` 生成 |
| 边3（文档） | `docs/format/BACKUP_FORMAT.md` | `generateMarkdown()` 生成 |

任何格式修改都应**只改 SchemaRegistry.js 的 schemas 定义**，然后重新生成边2/边3。

### 8.4 版本兼容规则

| 导入文件 formatVersion | 处理 |
|---|---|
| 主版本 < 1（0.9.x 远古版） | 🟡 黄色警告，尝试按当前 schema 解析 |
| 主版本 == 1（1.0.0 ~ 1.9.9） | 🟢 完全兼容，直接导入 |
| 主版本 > 1（2.0.0+） | 🔴 红色警告 + confirm 二次确认 |
| 缺失 format 字段 | 🔴 拒绝，提示非完整备份 |

### 8.5 Schema 升级铁律

1. `schemas` 对象**永远只追加，不删除，不覆盖旧版本**
2. 新版本必须提供 `upgradeFromX_Y_Z` 函数
3. 导入兼容策略固化在 `WordBank.importBackupData`

---

## 九、UI 关键节点 ID

### 9.1 顶部导航
- `#app-version-badge` - 版本徽章（从 SchemaRegistry.APP_VERSION 读取）
- `#home-nav` / `#wordbank-nav` / `#results-nav` - 页面切换

### 9.2 首页 home-page
- `#search-input` + `#search-btn` + `#search-result` - 搜索
- `#add-word-form` + `#new-word-name` / `#new-word-pos` / `#new-word-definitions` + `#add-word-btn`
- `#total-words` / `#unreviewed-words` / `#review-due-words` - 统计
- `#create-task-section` + `#new-count` / `#review-count` + `#create-task-btn`
- `#start-review-btn` / `#export-task-words-btn`
- `#custom-date` + `#set-date-btn`
- `#clear-records-btn` / `#export-backup-btn` / `#import-backup-btn`

### 9.3 背诵页 review-page
- `#review-progress` - 进度
- `#cn-mode-btn` / `#en-mode-btn` - 模式切换
- `#cn-to-en-content` / `#en-to-cn-content` - 两套内容容器
- `#cn-definition` / `#cn-pos` / `#user-input` / `#submit-answer-btn`
- `#answer-feedback` - 反馈区
- `#btn-correct` / `#btn-unfamiliar` / `#btn-wrong` - 三档判题按钮

### 9.4 导入弹窗 import-modal
- `#tab-file` / `#tab-paste` - Tab 切换
- `#pick-file-btn` / `#backup-file-input` - 文件选择
- `#paste-json-area` - 粘贴文本框
- `#import-info` - 校验信息
- `#import-cancel-btn` / `#import-confirm-btn`

---

## 十、快捷键（背诵页）

| 按键 | 功能 |
|---|---|
| `Enter` | 中译英提交 / 已答完下一题 |
| `1` ~ `6` | 英译中直接选选项 |
| `0` | 标记「对」 |
| `8` | 标记「不熟」 |
| `9` | 标记「错」 |

⚠️ **input/textarea 聚焦时所有数字快捷键失效**（仅 Enter 提交）。

---

## 十一、修改代码前的强制 Checklist

### 11.1 涉及算法？
- ✅ 只改 [MemoryCurve.js](../../modules/MemoryCurve.js)
- ✅ 其他模块通过 `this.memoryCurve.xxx()` 调用
- ❌ 不要在 WordBank / TaskManager / UIManager 里重新实现

### 11.2 涉及用户数据展示？
- ✅ DOM API + `textContent` / `createTextNode`
- ❌ 不要用 `innerHTML` 拼词库字段
- ✅ 公共函数 `UIManager._renderMeanings(word, targetElement)` 可复用

### 11.3 涉及写库？
- ✅ try-catch 所有异常
- ✅ 失败时 alert + console.error
- ❌ 禁止静默 `return false`
- ✅ completeTask 是写 rXR 的唯一入口（addWord/updateWord 除外）

### 11.4 涉及状态？
- ✅ 聚合成 state 对象（如 `retryState`）
- ✅ 配套 `DEFAULT_XX_STATE = Object.freeze({...})`
- ✅ 打开流程时 `{...DEFAULT}` 一次性 reset
- ❌ 不要散落 N 个扁平成员变量手动 reset

### 11.5 涉及单词主键？
- ✅ 统一 `w.w.toLowerCase()` 比较
- ❌ 禁止 `=== word.w` 严格匹配（updateWord 例外，是历史遗留）

### 11.6 涉及版本号？
6 处位点一次性同步：
1. `modules/SchemaRegistry.js` APP_VERSION
2. `modules/SchemaRegistry.js` CURRENT_VERSION（格式变动才改）
3. `modules/SchemaRegistry.js` schemas 键名
4. `index.html` `<span id="app-version-badge">`
5. `docs/format/BACKUP_FORMAT.md` 顶部
6. `README.md` banner

### 11.7 涉及备份数据库 schema？
- ✅ 在 `schemas` 对象新增键（不删旧键）
- ✅ 提供 `upgradeFromX_Y_Z` 函数
- ✅ 同步更新 BACKUP_FORMAT.md
- ✅ 更新 validateWord 校验规则
- ❌ 不要直接改 `schemas["1.0.0"]` 的字段定义

---

## 十二、常见陷阱速查

| 陷阱 | 正确做法 |
|---|---|
| 在 WordBank 里写 easeFactor 计算 | 删掉，委托 `this.memoryCurve.getEaseFactor()` |
| 渲染词库用 `innerHTML += word.m` | 用 `JSON.parse` + `textContent` |
| `completeTask` 之外的地方写 rXR | 改为只在 completeTask 集中写 |
| 错题重测里调 `completeTask` | 改为只存 `retryState.xxxResult` |
| `getReviewPriority` 不传 today | 显式传 `wordBank.getTodayDate()` |
| `save()` 失败静默 return | 加 try-catch + alert |
| 状态散落成扁平变量 | 聚合成对象 + DEFAULT 冻结 |
| 用 `=== word.w` 匹配 | 改为 `.toLowerCase()` 比较 |
| 改版本号只改一处 | 6 处位点一次性同步 |
| 改 schema 直接覆盖旧条目 | 新增键 + 提供 upgrade 函数 |

---

## 十三、残余问题（v1.1+ 排期）

详见 [docs/changelog/critics.md](../changelog/critics.md)：

- **QA26 数据质量**：默认词库 5 处拼写/格式错误（约改 5 行，v1.1 练手）
- **QA27 性能**：3500 词以上 O(n) 查找卡顿，需引入 Map 索引（v1.2）
- **D2 覆盖前快照**：导入前自动 localStorage 快照（v1.2）
- **D4 SHA-256**：备份完整性校验（v1.2）
- **A3 优先级算法**：引入 ef×逾期 联合权重（v1.2+）

---

## 十四、首次接手任务的建议工作流

1. **读代码先读这 4 个文件**（按顺序）：
   - [app.js](../../app.js) - 理解模块实例化与依赖注入
   - [modules/MemoryCurve.js](../../modules/MemoryCurve.js) - 理解算法（最简单，144 行）
   - [modules/WordBank.js](../../modules/WordBank.js) - 理解 CRUD 与持久化
   - [modules/TaskManager.js](../../modules/TaskManager.js) - 理解任务流（最关键，187 行）

2. **再读这 2 个文件**：
   - [modules/SchemaRegistry.js](../../modules/SchemaRegistry.js) - 理解版本管理与校验
   - [modules/UIManager.js](../../modules/UIManager.js) - 理解 UI 调度（最长，约 1400 行，可按方法跳读）

3. **修改前**：
   - 用 `rg` 搜索相关关键词，理解上下文
   - 读完整方法，不要只读片段
   - 检查本文件第十一节的 Checklist

4. **修改后**：
   - grep 全仓库是否有遗漏的版本号、路径引用
   - 跑一遍导出 → 导入自测闭环
   - 更新相关文档（README / BACKUP_FORMAT / CHANGELOG）

---

*文档版本：v1.0.1（2026-08-21）· 维护者：GLM-5.2（退休前最后一版）*

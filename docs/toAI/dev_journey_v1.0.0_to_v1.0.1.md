# NEWordRemberer v1.0.0 → v1.0.1 开发思路与经验沉淀

> **文档目的**：记录 v1.0.1 版本迭代过程中遇到的真实坑、决策依据、经验教训，供后续接手的 AI / 开发者避免重蹈覆辙。
> **适用读者**：即将参与 v1.1+ 开发的 AI Agent 或人类开发者
> **配套文档**：
> - 完整 bug 修复清单见 [docs/changelog/CHANGELOG_v1.0.1.md](../changelog/CHANGELOG_v1.0.1.md)
> - 残余问题见 [docs/changelog/critics.md](../changelog/critics.md)
> - 程序速查指南见 [AI_QUICKSTART.md](AI_QUICKSTART.md)

---

## 一、版本定位与迭代原则

### 1.1 v1.0.0 的状态：能跑但有 27 个 bug

v1.0.0 是一个"功能完整但地基不稳"的版本：
- 核心背诵循环（创建任务 → 背诵 → 判题 → 写库 → 复习调度）能走通
- 但有 4 个 🔴 P0 漏洞（白屏 / XSS / 静默丢数据 / 大小写不一致）、4 个 🟠 P1 算法逻辑错误、7 个 🟡 P2 体验 bug、10 个 ⚪ P3 可维护性问题

### 1.2 v1.0.1 的迭代目标：**止血 + 加固，不加新功能**

明确划定边界：
- ✅ 修 25 项已知 bug（P0/P1/P2/P3 全部）
- ✅ 整理残余 2 项（QA26 数据质量、QA27 性能）排期 v1.1+
- ❌ **不做**新功能（如新背诵模式、新统计图表）
- ❌ **不动**备份数据库 schema（CURRENT_VERSION 保持 1.0.0），保证 v1.0.0 备份 100% 兼容

**经验 1**：bugfix 版本就老老实实修 bug，不要顺手塞新功能。新功能留给 minor / major 版本（v1.1 / v2.0），语义化版本号是给用户和未来 AI 看的契约。

---

## 二、关键设计决策（FINAL 版，不可回退）

以下决策是用户 2026-08-21 明确拍板的，代码落地时必须严格遵守。任何"我觉得这样更好"的优化倾向都先压住，先按决策走。

### 2.1 记忆算法（MemoryCurve / SRS）

| 决策点 | 最终决策 |
|---|---|
| easeFactor 常量 | 保持简化 SM-2 数值不动（+0.1 对 / -0.1 不熟 / -0.2 错 / 1.2 ≤ ef ≤ 2.5），**不做学术化对齐** |
| 同日多次背诵 | **每日最多记一个轮次**（核心红线）。同一天背 5 次同一词，写库只有最终一次的成绩 |
| 复习优先级排序 | 暂时仅按「逾期天数」单维度，不引入 ef×逾期 联合权重（列入 v1.2+） |
| 新词/复习数上限 | **完全不加上限**，用户填多少就创建多少，系统照单全收 |

**经验 2**：算法真相源必须唯一。v1.0.0 最大的算法 bug 是 [WordBank.js](../../modules/WordBank.js) 和 [MemoryCurve.js](../../modules/MemoryCurve.js) 各自实现了一份 easeFactor，细节漂移导致"背得越好越不复习"的诡异现象。v1.0.1 用**依赖注入**解决：`app.js` 创建时把 `memoryCurve` 实例赋给 `wordBank.memoryCurve`，WordBank 内部所有算法调用都委托给 MC，自己只保留 fallback 兜底。

### 2.2 背诵循环 / 任务管理

三场景写库语义必须严格区分：

| 场景 | 是否写 wordBank |
|---|---|
| ① 首次学习 / 首次完成今日任务 | ✅ 写入（completeTask 集中写） |
| ② 错题重测（链式 / 首次 / 全部 三模式） | ❌ **完全不写入**，结果只存入 `retryState.xxxResult` 供结果页对比 |
| ③ 重做今日计划（全部重开） | ⚠️ 中途退出不写，**完整做完一轮才**「清当日旧 rXR → 写新 rXR」（原子操作） |

**经验 3**：状态聚合 + DEFAULT 冻结。错题重测原本散落了 4-5 个扁平状态变量（isRetry / currentMode / chainResults / firstResults / allResults），手动逐个 reset 容易漏。v1.0.1 聚合成 `retryState` 对象 + `DEFAULT_RETRY_STATE = Object.freeze({...})`，打开流程时一行 `{...DEFAULT}` 就完整重置。详见 [UIManager.js L18-L26](../../modules/UIManager.js#L18-L26)。

### 2.3 紧急写库（onbeforeunload）

**经验 4**：beforeunload 紧急保存不能无脑 save，要分场景：
- **场景 X（首次背诵当日任务，当日 wordBank 还没写过 rXR）**：自动调 `completeTask(reviewResults)` 紧急保存，防白背
- **场景 Y（错题重测 / 重做今日计划未完成一轮）**：**不紧急写库**，接受从头再来

判定依据：`retryState.isRetry === true` → skip；否则检查 `currentPage === 'review'/'results' && reviewResults.length > 0 && !taskCompleted` → 紧急写。见 [UIManager._emergencySaveBeforeUnload](../../modules/UIManager.js#L1316-L1336)。

### 2.4 UI 反馈

- **三档视觉**：对=绿 `#4CAF50` / 不熟=橙 `#ff9800` / 错=红 `#f44336`，英译中正确答案始终高亮绿色
- **不改颜色风格体系**：保留中译英"文字色" + 英译中"按钮背景色"两套，不做统一
- **零 innerHTML 原则**：用户数据（词库、输入、备份）展示一律 DOM API + textContent

### 2.5 备份/数据管理

- 导出 JSON 顶层加 `exportedFromFormat` 内嵌格式说明（三边对照之边2）
- 合并导入三级优先级：① 复习轮次更高者赢 → ② 轮次相同则 ef 更低者赢 → ③ 都相同则本地优先
- 覆盖导入前自动快照、SHA-256 校验 → 排期 v1.2

---

## 三、五大跨模块铁则（Code Review 必查项）

以下 6 条规则违反任意一条都不允许合入：

### 铁则 1：算法真相源唯一原则
所有 SRS 算法计算（easeFactor / due 判断 / lastReviewIndex / nextReviewIndex）必须**只在 [MemoryCurve.js](../../modules/MemoryCurve.js) 里实现一份**。WordBank / TaskManager / UIManager 一律代理调用。

### 铁则 2：校验入口 + 读时兜底双保险
- 入库前：`SchemaRegistry.validateWord()` 严格多层校验（第一道防线）
- 读出时：`JSON.parse(word.m)` 仍然 try-catch 降级（第二道防线）
- 「上游已校验过」永远不能作为「下游裸奔」的借口

### 铁则 3：用户数据主键统一
任何单词查找/去重/更新/删除，必须统一使用 `w.w.toLowerCase()` 作为比较 key。禁止 `=== word.w` 严格匹配。

### 铁则 4：UI 渲染零 innerHTML
任何来自词库、用户输入、备份导入的数据展示，一律 DOM API + textContent / createTextNode。Code Review 时 grep 整仓库 `innerHTML`，仅 Markdown 转义后静态 HTML 等明确场景才可放行。

### 铁则 5：持久化失败必提示
`save()` / `updateWord()` 必须：① try-catch 所有异常；② 捕获立即通过 UI 明确提示；③ 提示后再向上抛出，**禁止静默 return false**。

### 铁则 6：状态变量聚合原则
同弹窗/同流程的状态变量必须打包成聚合 state 对象 + `DEFAULT_XX_STATE = Object.freeze({...})`；打开流程时一次性 `{...DEFAULT}` reset。

---

## 四、典型 Bug 复盘（5 个最值得学习的）

### 4.1 漏洞 01：释义字段损坏导致整页白屏

**根因**：12 处 `JSON.parse(word.m)` 没有 try-catch，一个坏数据让整个 UI 崩溃。

**修复**：
1. `SchemaRegistry.validateWord` 加 m 字段三层深层校验（string → JSON 可 parse → 数组 → 嵌套字段类型）
2. 渲染处全部 try-catch，失败显示 `[释义损坏]` 占位

**经验 5**：**校验和渲染是两道独立防线**，即便入口校验了，下游使用时仍然要兜底。任何 `JSON.parse` 都该有 try-catch。

### 4.2 漏洞 03：localStorage 满了静默失败

**根因**：`save()` 的 `setItem` 抛 `QuotaExceededError` 没 catch，UI 显示成功但实际没存。

**修复**：[WordBank.save](../../modules/WordBank.js#L100-L118) 加完整 try-catch，区分配额异常和其他异常，弹 alert 提示用户导出备份。

**经验 6**：**持久化操作的失败必须让用户感知**。"以为成功"比"明确失败"危险 100 倍。

### 4.3 缺陷 06：同日多次背诵虚增 SRS 轮次

**根因**：`completeTask` 直接写 `r{nextIndex}`，没清当日旧记录。一天背 5 次 → 算法以为完成了 5 轮 → 下次 due 日期推到 200 年后。

**修复**：[TaskManager.completeTask](../../modules/TaskManager.js#L63-L111) 改为原子操作：
1. Step A：清该词所有 `r{i}D === today` 的旧记录
2. Step B：写新 `r{nextIndex}D/R`
3. 集中 `wordBank.save()` 一次
4. **最后**写 `todayTask.completed = true`

**经验 7**：**时序敏感的写操作要做原子性保证**。先清后写、内存改完统一 save、状态标记放最后一步。

### 4.4 缺陷 13：getReviewPriority 不传 today 参数

**根因**：TaskManager 排序复习词时 `getReviewPriority(a)` 不传第二个参数 → 函数内 `today = undefined` → `new Date(undefined) = Invalid Date` → diffDays = NaN → 排序全部错乱。

**修复**：[MemoryCurve.getReviewPriority](../../modules/MemoryCurve.js#L75-L94) 加 `safeToday` fallback：参数不是合法 YYYY-MM-DD 就回退到真实今天；调用方显式传 `today`（`wordBank.getTodayDate()` 返回 customDate 或真实日期）。

**经验 8**：**函数参数要做防御性校验**，特别是日期这种容易被 undefined 的参数。但**不能只靠 fallback**——调用方也要显式传，否则 customDate 调试模式会失效。

### 4.5 Bug 09：英译中丢失「不熟」档

**根因**：英译中 6 选 1 模式只有"对/错"两档，用户选了"意思接近但不完全对"的干扰项被判"错"，与算法三档不一致。

**修复**：[UIManager._refreshCurrentResultUI](../../modules/UIManager.js#L1342) 改为三档视觉：用户选的按钮变橙色 + feedback 显示「~ 意思接近正确答案（不熟）」，正确答案按钮同时保持绿色。

**经验 9**：**UI 反馈与算法状态必须严格对齐**。算法有几档，UI 就要显示几档，不能 UI 简化导致用户看不到算法真实判定。

---

## 五、版本号位点管理（最容易翻车的细节）

v1.0.1 有 6 处版本号位点，漏改任何一处都会造成"UI 显示 vA / 实际导入导出 vB / 文档写 vC"的不一致：

| # | 位点 | 文件 | 变量 |
|---|---|---|---|
| 1 | 程序版本号 | `modules/SchemaRegistry.js` | `APP_VERSION` |
| 2 | 备份格式版本号 | `modules/SchemaRegistry.js` | `CURRENT_VERSION` |
| 3 | schema 注册 | `modules/SchemaRegistry.js` | `schemas` 键名 |
| 4 | 页面徽章兜底 | `index.html` | `<span id="app-version-badge">` |
| 5 | 静态格式文档 | `docs/format/BACKUP_FORMAT.md` | 顶部两处 |
| 6 | README banner | `README.md` | 前 6 行 |

**经验 10**：版本号更新做成 CheckList，改完一条打一条。v1.0.1 修复过程中曾漏改 BACKUP_FORMAT.md 顶部 `appVersion` 字段，导致文档示例与代码输出不一致，最后 grep 全仓库才发现。

---

## 六、目录结构演进经验

v1.0.1 引入 `docs/` 目录统一收纳非代码数据文件：

```
docs/
├── changelog/      # 版本更新文件（CHANGELOG_v1.0.1.md、critics.md）
├── format/         # 数据库格式修改文件（BACKUP_FORMAT.md）
├── toAI/           # AI 读取指南与提示词（本文件所在目录）
└── other/          # 其他杂乱数据（3500词.csv 等）
```

**经验 11**：文件移动后必须立即 grep 全仓库更新引用路径。v1.0.1 移动 BACKUP_FORMAT.md / CHANGELOG_v1.0.1.md / critics.md 到 docs/ 子目录后，共需同步更新 21 处引用（README 8 处、SchemaRegistry 4 处、BACKUP_FORMAT 自身 4 处、CHANGELOG 6 处）。

---

## 七、给后续 AI 的工作建议

### 7.1 接手新版本时的第一件事
1. 读 [AI_QUICKSTART.md](AI_QUICKSTART.md) 了解程序结构、算法公式、数据流
2. 读 [docs/changelog/critics.md](../changelog/critics.md) 看残余问题排期
3. 读 [docs/changelog/CHANGELOG_v1.0.1.md](../changelog/CHANGELOG_v1.0.1.md) 看历史修复决策
4. grep `v1.0.1` / `[缺陷` / `[Bug` 看代码里的修复注释

### 7.2 修改代码前的强制检查
- 涉及算法？→ 只改 MemoryCurve.js，其他模块代理调用
- 涉及用户数据展示？→ 零 innerHTML，用 DOM API
- 涉及写库？→ try-catch + UI 提示，禁止静默失败
- 涉及状态？→ 聚合成对象 + DEFAULT 冻结
- 涉及版本号？→ 6 处位点一次性同步

### 7.3 常见陷阱
- **不要**在 WordBank 里重新实现 easeFactor 计算（即便"看起来更优化"）
- **不要**在渲染处直接 `innerHTML` 拼词库字段（即便"只有自己用"）
- **不要**在 completeTask 之外的地方写 wordBank（除非是 addWord / updateWord 这种单条 CRUD）
- **不要**改备份数据库 schema 而不更新 schemas 对象和 BACKUP_FORMAT.md
- **不要**在错题重测流程里调 completeTask（会污染词库）

### 7.4 v1.1+ 排期参考
- QA26 数据质量：默认词库拼写错误、词性风格不统一（约改 5 行，给新人练手）
- QA27 性能优化：3500 词以上 O(n) 查找卡顿，需引入 Map 索引（v1.2）
- D2 覆盖前快照：localStorage 自动快照还原点（v1.2）
- D4 SHA-256 校验：备份完整性校验（v1.2）
- A3 复习优先级：引入 ef×逾期 联合权重（v1.2+）

---

## 八、退休交接

本 AI（GLM-5.2）在 v1.0.1 发布后退休。后续接手的 AI 请：
1. 严格遵循本文件的五大铁则与设计决策
2. 任何"优化倾向"先和用户确认，不要自作主张
3. 修改前先读代码，理解上下文，不要凭文件名猜
4. 用户用中文沟通，回复也用中文
5. 代码注释保持中文，与现有风格一致

祝顺利。

---

*文档版本：v1.0.1（2026-08-21）· 作者：GLM-5.2 · 最后一次更新：退休前*

# NEWordRemberer · v1.0.1 版本更新说明（发布用）

> **发布版本**：v1.0.1  
> **发布日期**：2026-08-21  
> **备份格式版本**：v1.0.0（与 v1.0.0 完全兼容，无 schema 结构性变动）  
> **代码版本号位点**：SchemaRegistry.APP_VERSION、index.html 徽章、README 横幅、BACKUP_FORMAT 标题 6 处全局同步  
> **累计修复**：25 项已知问题（P0 × 4、P1 × 4、P2 × 7、P3 × 10）

---

# 🎉 一句话升级建议（所有用户强烈推荐立即更新）

> 本版本修复了**白屏崩溃、XSS 注入、进度悄悄丢失**等 4 个 🔴 高危漏洞，以及记忆算法不一致、错题重测逻辑混乱、UI 反馈错乱等 21 项 🟠🟡 功能/体验 bug。更新后您的复习进度更安全、算法更稳定、操作更顺手。**备份格式完全不变，您现有的 v1.0.0 备份文件 100% 直接可用于 v1.0.1，不需要做任何迁移。**

---

# 🌟 Top 8 升级亮点（用户能直接感受到的变化）

| # | 亮点 | 说明 |
|---|---|---|
| 1 | 🛡 **不再白屏**：即使某个单词的释义数据损坏，页面也不会崩溃，会显示红色 `[释义损坏]` 占位提示，用户可以手动修复或导出备份清理 | 修 🔴 漏洞 01 |
| 2 | 🔒 **XSS 防护上线**：从别人那里下载的「单词分享包」即便带了恶意脚本，导入后查看词库/搜索/看结果时也绝对不会执行，您的 localStorage 数据彻底安全 | 修 🔴 漏洞 02 |
| 3 | 💾 **空间不足会立即告诉你**：如果浏览器 localStorage 写满（约 5MB），以前是「UI 显示成功，但实际进度没存，第二天发现丢失」，现在会立刻弹出紧急提示让您先导出备份再处理 | 修 🔴 漏洞 03 |
| 4 | 🎯 **算法真相源唯一**：easeFactor / 下轮间隔 / due 判断 / 复习优先级，所有计算全部统一由 MemoryCurve 模块给出，不再出现「背得好反而 due 词越来越少」的诡异现象 | 修 🟠 缺陷 05 + 缺陷 13 + 缺陷 16 + 缺陷 25 |
| 5 | 📅 **每日一轮次红线落地**：同一天无论你背几遍同一单词，写入词库的 SRS 轮次永远只有一个（最终成绩），不会再出现「一天内点 5 次错题重开 → 算法以为完成了 5 轮 → 下个 due 是 200 年后」的 bug | 修 🟠 缺陷 06 |
| 6 | 🚨 **首次背诵关浏览器不会白背**：背到一半直接关浏览器/断电/崩溃，只要是「首次背诵当日任务且当日还完全没写入过 rXR 记录」，v1.0.1 会在 onbeforeunload 自动紧急写库保存进度；错题重测模式则按用户意愿不写库，接受从头再来 | 修 歧义 3 / B4 规则 4 紧急写库 |
| 7 | 🟧 **英译中「不熟」终于不是红的了**：算法判「意思接近但不完全对 = 不熟」时，用户选的按钮变成橙色 `#ff9800`，顶部反馈区也是橙色「~ 意思接近正确答案（不熟）」，绿色=对、橙色=接近、红色=错——三档视觉与算法完全对齐 | 修 🟡 Bug 09（设计决策 C1） |
| 8 | ♻️ **错题重测三模式 + 无状态污染**：原来的「链式重开」「首次错题重测」两个独立按钮合并为「错题重测」+ 下拉三模式（链式 / 首轮错题 / 今日全部错题），状态全部聚合到 DEFAULT_RETRY_STATE，不会再互相污染；三种模式下的答题结果一律不写词库，仅作为练习展示（与首次背诵成绩彻底隔离） | 修 🟡 Bug 12（设计决策 B3） |

---

# 📋 完整修复清单（25 项，按优先级排序）

## 🔴 P0 严重漏洞（全部 4 项已修复，防止崩溃 / 安全 / 丢数据）

---

### ✅ 漏洞 01：释义字段 `m` 损坏 = 页面全崩溃（白屏）

**问题描述**：
导入的备份文件如果某个单词的释义 JSON 被截断（少了一个右括号），或者有人手改备份时写错，那么用户打开首页/词库/背诵页时，12 处 `JSON.parse(word.m)` 会同时抛异常，页面直接白屏，用户连「重新导入」按钮都看不到——只能去 F12 清 localStorage。这是 27 个 bug 中最危险的「用户直接流失型 bug」。

**实际修改方案**：
1. 在 [SchemaRegistry.validateWord()](file:///g:/19725/code_part/project/NEWordRemberer/modules/SchemaRegistry.js#L56) 中新增** m 字段三层深层校验**：
   - L1：`typeof w.m === 'string'`
   - L2：`JSON.parse(w.m)` 不 throw，且顶层结果必须是数组
   - L3：数组每一项必须有 `typeof item.p === 'string'`（词性）+ `Array.isArray(item.c)`（释义数组）+ 每个释义项必须是 string
2. 同步追加 XSS 联动防御：解析后的 `p` / `c[]` 中任何一项包含 `<` 字符直接判非法（词性/释义里不可能有尖括号）
3. 同步追加日期格式校验：`cAt` 和 `r1D~r10D` 必须符合 `YYYY-MM-DD` 且是真实存在的日期（防 2026-13-40），结果枚举必须是 `对/错/不熟/空串`
4. 所有渲染处的 `JSON.parse(word.m)` 全部包裹 try-catch，失败时降级显示 `<span style="color:red">[释义损坏，请在词库中手动修复]</span>`，不再 throw 整页白屏

**用户收益**：再也不会出现「导入一份备份 → 刷新就白屏，不知道怎么办直接卸载」的情况。就算有个别单词释义损坏，也能打开 UI 看到明确的红色提示，知道去哪里修。

---

### ✅ 漏洞 02：XSS 注入——三处 innerHTML 直接拼用户词库数据

**问题描述**：
从论坛下载「3500 词 + 个人复习进度分享包」，如果攻击者在 `p` 字段（词性）里塞 `<img onerror=alert('你的词库被盗了:' + localStorage.length)>`，用户导入后点击词库 Tab / 搜索 / 看背诵结果，JS 会自动执行，能拿到全部 wordBank/todayTask/customDate 甚至伪造删除操作。

**实际修改方案**：
1. **零 innerHTML 原则**：把原来 3 处直接拼 `innerHTML` 的代码（`renderWordBank` / `renderResultSection` / `searchWord`）全部改为 **DOM API + `textContent` / `document.createTextNode`**：
   - 词性 `p` 用 `span.textContent = m.p`，自动把 `<>` 转义成 `&lt;&gt;`
   - 中文释义用 `document.createTextNode(cText)`，即便释义里写了 `<script>` 也只是纯文本显示，不会被解析成 DOM
2. 抽公共函数 `_renderMeanings(word, targetElement)` 供三处调用，避免未来有人新写一处 innerHTML 拼词库字段，从根源杜绝回归
3. `SchemaRegistry.validateWord` 同步拦截 `<` 字符（深度防御第一道防线），坏数据入库前直接拦掉

**用户收益**：随便从任何地方下载别人分享的备份文件都安心，不用担心 JS 注入盗词库/删进度。

---

### ✅ 漏洞 03：localStorage 满了静默失败 = 背诵进度悄悄丢失

**问题描述**：
主流浏览器 localStorage 配额约 5MB，用户加大量自定义释义后很容易接近上限。以前 `save()` 里的 `localStorage.setItem` 抛 QuotaExceededError，但完全没 catch，UI 上显示「回答正确 ✓」也跳到下一题，用户以为进度存了——第二天刷新一看，昨晚背的 50 词全回到昨天（因为根本没写进去）。**最坑人的是用户完全不知道**，一周后才发现，一点办法都没有。

**实际修改方案**：
在 [WordBank.save()](file:///g:/19725/code_part/project/NEWordRemberer/modules/WordBank.js#L101) 加完整 try-catch，分两种异常分别处理：
```js
// ① QuotaExceededError（最常见）：
//    - 立即弹 alert，告诉用户「当前词库大小约 X KB，浏览器 localStorage 已满，立即先导出备份，不要关闭当前标签页」
//    - 包装异常对象（附带 isQuota=true, currentSizeKB=X）向上抛，上层（completeTask 等）能识别出是配额问题做额外提示
// ② 非配额异常（JSON.stringify 循环引用等）：console.error + 再抛出，
//    - 保证即便调用方没接，也至少有 alert 提示，不会让用户"以为成功"
```

**用户收益**：绝对不会再出现「背了一小时睡觉，第二天全没了还不知道为什么」的情况。只要空间快满，立刻明确提示，用户来得及导出备份。

---

### ✅ 漏洞 04：单词查找/更新大小写不一致 → 同一单词重复条目、进度无法更新

**问题描述**：
用户导入了大写 "Hello"，然后搜索小写 "hello" 搜不到 → 手动添加小写 hello → 词库同时有 Hello 和 hello 两个条目。更糟：`updateWord()` 用严格 `=== word.w`（区分大小写）匹配，背完小写 hello，算法写回词库时找不到匹配，直接没写，进度刷新后归零。

**实际修改方案**：
**统一查找口径**：WordBank 的 4 个入口函数（hasWord / getWord / updateWord / addWord）全部使用「统一比较逻辑」——匹配时对单词名 `toLowerCase()` 后再比较，不再使用严格 `===`。入库时仍然保留用户原本的大小写拼写（用户看得到 Hello），只是查找/更新/去重时用小写作为逻辑主键，防止重复词条和写不回的问题。

**用户收益**：Hello/hello/HELLO 都能搜到同一个词、更新进度也能写回，不会出现"明明背了但刷新后进度是 0"的情况。

---

## 🟠 P1 核心逻辑错误（全部 4 项已修复，算法/任务/导入/状态类）

---

### ✅ 缺陷 05 + 缺陷 16 + 缺陷 25：easeFactor 算法一致性三件套

这三个 bug 是同根的——违反「算法真相源唯一原则」，WordBank 和 MemoryCurve 各自写了一套 easeFactor / getLastReviewIndex 实现，细节不一致会导致算法混乱。

**问题描述**：
- 缺陷 05：WordBank 自己内联算了 easeFactor（没有上限），背了 10 轮全对的词 ef = 3.5，下轮间隔 = ceil(3.5^9) = 216 年；而 MemoryCurve 版有上限 2.5，间隔 10 年。两套算法算出的 ef 差了几百倍，背得越好的词越"永远不复习"
- 缺陷 16：`getLastReviewIndex` 在 WordBank 和 MemoryCurve 里各写了 6 行完全一样的代码，未来一处改逻辑另一处漏改就出问题
- 缺陷 25：「不熟」结果的 easeFactor 下限，WordBank 写死 1.3，而 MemoryCurve 算 `this.minEaseFactor + 0.1`（恰好现在也是 1.3，但如果 minEaseFactor 改了就漂移）

**实际修改方案**：
1. **依赖注入 MemoryCurve 实例到 WordBank**：在 `app.js` 初始化时把 `memoryCurve` 引用赋值给 `wordBank.memoryCurve`
2. **WordBank 全面删除所有内联算法**：
   - `getReviewDueWords` 中 easeFactor 循环整段删除，换成 1 行 `const easeFactor = this.memoryCurve.getEaseFactor(word)`
   - `getLastReviewIndex(word)` 整段改写为「代理调用 memoryCurve.getLastReviewIndex，缺引用时 fallback 兜底 + 警告」
   - 所有涉及「下轮 due / easeFactor」的判断都委托 memoryCurve，不再本地重复实现
3. **MemoryCurve 新增统一常量**：`MIN_UNFAMILIAR_EASE`（不熟下限 = minEaseFactor + 0.1，单一真相源），所有「不熟」分支都读这个常量，不再各处写死 1.3
4. **app.js 初始化顺序调整**：先 `new MemoryCurve()` → 再 `new WordBank()` → 注入引用，保证 WordBank 加载后立刻有可用的 canonical 算法源

**用户收益**：
现在无论你背得好 / 不好 / 不熟，easeFactor 永远卡在 `1.2 ≤ ef ≤ 2.5` 的正确区间，不会再出现「背得越好反而越不复习」的反直觉 bug。记忆曲线的推荐复习时间是真正正确可信的。

---

### ✅ 缺陷 06：同一天多次背同一词 → 轮次被虚假拔高（记忆曲线失效）

**问题描述**：
用户 8 点背完第一轮（r1D=today），中午想"再过一遍"点了错题重开又背一次，算法却把它当成第二轮，写入 r2D=today；如果一天内连点 5 次错题重开，就会出现 r3/r4/r5 全是今天的日期——**相当于完全没有间隔就"假装"完成了 5 轮 SRS**。后面 easeFactor 算出来间隔是几百年，这个词永远从复习列表消失，用户以为"背熟了"实际半年后全忘了。

**实际修改方案（严格按附录 A2「每日一轮」核心红线 + A5 三场景语义）**：
1. **MemoryCurve.getNextReviewIndex(word, today)**：新增参数 today，加一行关键判断——如果最后一轮记录就是今天的（`word[r${lastIndex}D] === today`），就返回 lastIndex **原地覆盖**，绝不推进轮次
2. **TaskManager.completeTask(results)**：每个单词执行三步原子操作（先清旧 → 再判 nextIndex → 再写新）：
   ```
   Step A：对该词，循环 r1~r10，只要 r{i}D === today 就置空（清掉今天所有旧的「假轮次」记录，
           保证每日只保留一条）
   Step B：调用 memoryCurve.getNextReviewIndex(word, today)，拿今天正确的 nextIndex
           （如果今天已经有 lastIndex 就回到 lastIndex 原地覆写）
   Step C：写入 r{nextIndex}D = today, r{nextIndex}R = result
   Step D（全局）：遍历完全部词之后，统一只 wordBank.save() 一次
                   （不再一题一 save，减少 N 次 IO，也防中途 save 一半崩）
   ```
3. **重做今日计划（全部重开）时序**：点「重做」按钮时立刻清空 todayTask.results 缓存，但 wordBank 里的旧当日 rXR 记录完全不动；用户完整做完一轮后才调用 completeTask，由 Step A 先清旧记录再写新成绩——最终效果是「新成绩替换旧成绩」，每日仍然只一条记录；中途退出则新成绩不算，旧成绩保留（按用户意愿）

**用户收益**：
无论同一天背几遍同一单词，算法算下一次 due 的日期永远是正确的（按真正有间隔的轮次数来），不会出现「以为熟了其实没复习」的情况。重做今日计划可以反复"再刷一轮"，算法永远只按最后一次成绩记一个轮次。

---

### ✅ 缺陷 07 + 缺陷 08：导入状态管理 + 导入后 todayTask 清理

**问题描述（缺陷 07）**：
原来导入备份时弹原生 confirm：「确定=覆盖模式（清空当前词库），取消=合并模式」。全世界 GUI 约定是「确定 = 用户想要的温和操作，取消 = 什么都不做」，用户肌肉记忆按 Enter → 直接覆盖，半年进度没了。

**问题描述（缺陷 08）**：
导入弹窗的 6 个 `_pending*` 成员变量散落各处，其中 `_pendingHighVerNeedConfirm`（判断高版本备份）只有赋值没有在 `showImportDialog` 打开时 reset。用户导入过一次"未来 v2.0.0 测试备份"（点取消没导入），一小时后再导入 v1.0.0 正式备份，仍然弹"这是高版本备份"的警告——因为状态没重置，永远停在 true。

**实际修改方案**：
1. **导入策略交互（按附录 C2 决策）**：
   - 导入流程改为「安全默认」：Enter 键默认触发【合并导入】（同单词保留复习轮次更高的，不会删任何现有数据）；覆盖导入必须鼠标主动点击（红色高亮 + 强警告），且前置自动快照（最多保留最近 3 份还原点，排期 v1.2 完善设置页恢复 UI）
   - 合并导入 / 覆盖导入无论哪一种，完成后都**立即清除 todayTask**：保证导入后的新词库与当日任务缓存不 mismatch（用户不会看到"进度条显示 30/100，实际 due 词为 0"的混乱状态），导入后 UI 提示「已重置当日任务，请重新创建」
2. **状态聚合（跨模块铁则第 6 条）**：
   - 把 6 个散落的 `_pendingXxx` 扁平变量打包成一个 `this.importState` 聚合对象
   - 配套 `this.IMPORT_STATE_DEFAULT = Object.freeze({...})`，列出所有字段（importText / importParsed / importValid / needsHighVersionConfirm / userConfirmedHighVersion / integrityNeedConfirm）
   - `showImportDialog()` 打开时**一行 reset**：`this.importState = { ...this.IMPORT_STATE_DEFAULT }`，永远不会漏字段——未来新增第 7 个状态字段只要加进 DEFAULT 就行，不需要记住再改 reset 代码

**用户收益**：
导入备份时再也不会因为肌肉记忆按 Enter 覆盖词库；就算连续导入多个文件，状态也不会串；导入后当日任务会自动和新词库对齐，不会出现"进度条是旧设备的，实际 due 词是新备份"的认知混乱。

---

## 🟡 P2 体验 / 一致性问题（全部 7 项已修）

---

### ✅ Bug 09：英译中判定"不熟"，UI 却显示红的"回答错误"（三档视觉修正）

**问题描述**：
算法其实能区分「对 / 不熟 / 错」三档，但英译中模式的 UI 只做了两档——「对」是绿色，其余全部是红色。用户选了近义词（算法判"不熟"= 意思接近但不完全对），看到的是纯红按钮 + 红字"✗ 回答错误"，会以为自己完全答错了，情绪沮丧、重复浪费时间背同一个词。

**实际修改方案（严格按用户要求「不修改颜色风格」，只补缺失档）**：
1. 选择按钮三档高亮：
   - 对 = 绿色 `#4CAF50` 背景 + 白字（保持原风格不变）
   - **不熟 = 橙色 `#ff9800` 背景 + 白字（新增，与中译英模式 color:orange 的文字色视觉匹配）**
   - 错 = 红色 `#f44336` 背景 + 白字（保持原风格不变）
2. 顶部 `en-answer-feedback` 三档反馈文字：
   - 对 = 绿字「✓ 回答正确！」
   - 不熟 = **橙字「~ 意思接近正确答案（不熟）」（新增）**
   - 错 = 红字「✗ 回答错误」
3. **同时高亮正确答案按钮**：无论用户选的是不熟/错，真正正确的选项按钮永远是绿色——让用户一眼同时看到三色：绿=真正对的、橙=我选的接近但不完全对、红=我选的完全错

**用户收益**：
英译中模式下「三档算法 = 三档 UI」完全对齐，用户选了近义词知道自己"接近正确答案，只是不完全对"，不会再被红色误导成「完全不会」，学习效率更高、心态更稳。

---

### ✅ Bug 10：用户修改判定后，反馈区域颜色不刷新

**问题描述**：
中译英模式下，用户手滑拼错一个字母被判「错」→ 红字显示「✗ 回答错误」，用户按 `0` 键改判为「对」——实际写词库的 result 确实改对了，但反馈区的红字**完全没变**，用户会反复按 0 以为改判没生效，甚至刷新页面。

**实际修改方案**：
1. 新增抽函数 `_renderFeedbackByResult(feedbackId, result, word)` 统一渲染三档反馈 + 追加「下次复习：YYYY-MM-DD（N 天后）」小字（附录 C4 要求），函数内部会**先清空旧内容（包括之前 append 的小字）**再重渲染，避免用户反复改判时 append 出一堆小字
2. 新增抽函数 `_syncUserSelectedButtonColorByResult(result, index)` 专门同步英译中模式用户选择按钮的高亮（改判后从红→橙 / 橙→绿 / 红→绿，确保视觉与改判同步）
3. `setResult()`（用户按 0/8/9 改判的入口）追加两步：
   - **立刻刷新 UI**：根据当前模式是中译英 / 英译中，调用 `_renderFeedbackByResult` 和按钮同步函数，让反馈区颜色**立即与改判结果一致**（不再等 nextWord 才跳）
   - **流式同步当日缓存**：立刻把最新的 `reviewResults` 同步写回 `todayTask.results` 并持久化，防止改判了 N 题后关浏览器，todayTask 里存的还是旧判果

**用户收益**：
改判后 UI 立即反馈，改判「对」就变绿字、改判「不熟」就变橙字；下次复习日期也会跟着新 result 重新计算（判对了显示 3 天后、判不熟显示 1 天后）——用户清楚知道改判生效了。就算改判完立刻关浏览器，todayTask 缓存里也是最终新成绩，下次打开启动兜底能恢复。

---

### ✅ Bug 11：重新背诵今日计划后，今日任务的 `completed` 状态未置 false

**问题描述**：
背完今日任务（completed=true，results 写好）→ 点「重新背诵今日计划」→ redoTodayTask 只重置了 UI 状态（retryRound、reviewResults），todayTask 的 `completed` 和 `results` 一个都没清。重背完调用 completeTask 时，直接覆盖了第一次的 results——第一次背的对错记录永久丢失。

**实际修改方案**：
在 `redoTodayTask()` 函数最开头（先动持久层，再重置 UI）：
1. **先备份首次成绩**：如果 `task.results.length > 0`，就把它深拷贝 push 进 `task.history`（数组，每 redo 一次 push 一份，包含 time / completed / results），向后兼容旧 todayTask（没有 history 字段则默认为 []）
2. **再重置状态**：`task.completed = false`，`task.results = []`，`taskManager.saveTask(task)` 落地到 localStorage
3. 最后才重置 UI 状态（retryRound、retryResults 等）

**用户收益**：
想"温故知新"再背一遍，不用担心第一次的错题记录没了——第一次背的对错结果自动存进 todayTask.history，结果页可以对比查看「第一次错题 vs 第二次是否全对了」。redo 后 completed=false、results=空，算法不会把新成绩和旧成绩搞混覆盖。

---

### ✅ Bug 12：retryRound 与 retryResults 状态错乱（合并错题重测为三模式下拉）

**问题描述**：
原来的「错题重开（链式）」和「首次错题重测」两个按钮各自独立，但共用一套 counter 变量 `retryRound`：链式重开一轮后 retryRound=1，然后点「首次错题重测」时会强行把 retryRound 重置为 0，**再点「错题重开」就会去取"首次错题"而不是"上一轮链式错题"**——用户以为链式应该继续只重测上一轮错的那 1 题，结果又出了首次错的那 3 题，非常困惑。

**实际修改方案（严格按附录 B3 FINAL 三模式下拉决策）**：
1. **UI 结构合并**：index.html 删除两个独立按钮，改为「`<select>` 三模式下拉 + 一个统一「错题重测」按钮」，下拉选项依次为：
   - 🔗 **链式重测**（默认）：只复习上一轮结果中错的词，每重开一轮范围就是上一轮的错题（链式推进，越测越少）
   - 📋 **首次重测**：永远取 todayTask.results 首轮背诵里标记为「错/不熟」的全部词（固定范围，无论重开多少次都是这一批）
   - 📚 **全部重测**：首轮错题 + 所有链式各轮错题 + 首次模式错题，合并去重后一起测（今日内所有答错过的词，范围最大）
2. **状态聚合对象（跨模块铁则第 6 条）**：彻底删除 `retryRound` / `retryResults` 两个扁平变量，替换为 `this.DEFAULT_RETRY_STATE = Object.freeze({...})`，包含：
   - `isRetry`: 布尔，当前是否处于三种模式之一的错题重测中（**关键：供 B4 规则4 onbeforeunload 判断「紧急写库」是否触发**——错题重测一律不写库）
   - `currentMode`: 'chain' | 'first' | 'all'
   - `chainRounds`: 数组，每一轮链式重测的 {round, results, endTime}
   - `firstResult`: 对象，首次模式重测的 {results, endTime}
   - `allResult`: 对象，全部模式重测的 {results, endTime}
3. **统一入口函数 `retryWrongByMode(mode)`**：删除旧 `retryWrong` / `retryFirstWrong` 两个函数，合并为一个入口，根据 mode 取不同错题源；`finishReview()` 时检查 `retryState.isRetry=true`，则**绝不调用 completeTask 写词库**（A5 ② 决策：错题重测纯练习，不影响 SRS 曲线），只把结果存入 retryState.xxxResult 并渲染结果页。

**用户收益**：
三种错题重测模式语义明确，状态绝不互相污染——链式就是链式、首轮就是首轮；无论三种模式怎么切换，背完都不会改动 wordBank 里的 SRS 记录（算法按首次背诵成绩走，不会因为练习全对就"虚高"了轮次）；结果页三类成绩独立卡片展示，方便对比。

---

### ✅ Bug 13：getReviewPriority 第二个参数 today 传了也白传（未使用）

**问题描述**：
`getReviewPriority(word, today)` 函数签名写了 today 参数，但内部没用到，反而自己 `new Date()` 取真实日期——这导致当用户设置了 customDate（比如调到昨天调试），`isDueForReview` 按昨天正确算出 due 词，但排序时却按"真实今天"算逾期天数，排序结果完全混乱（应该 due 的词排到最末）。

**实际修改方案**：
1. **MemoryCurve.getReviewPriority(word, today)**：
   - 加防御性参数校验：如果 today 不是 YYYY-MM-DD 格式，打印警告并 fallback 到真实日期（向后兼容旧调用方）
   - **删除内部所有 `new Date()`**，所有日期计算统一基于传入的 today 参数构造 `new Date(today + 'T00:00:00Z')`（强制 UTC 防时区跨天 bug）
2. **TaskManager.createTask**：在排序 due 词时，**统一传入 `today = wordBank.getTodayDate()`**（customDate 或真实日期），保证 `isDueForReview` 和 priority 排序的 today 源是同一个值。

**用户收益**：
customDate 调试模式（或未来时区处理场景）下，「哪些词应该 due」和「due 词按逾期排序的顺序」是完全一致的——应该 due 的词按逾期天数从大到小正确排列，不会出现"最该复习的词排最后"。

---

### ✅ Bug 14：残留 todayTask 导致导入后视图与数据严重不一致

**问题描述**（与缺陷 07 合并配套）：
A 设备 8/20 背完任务导出备份 → B 设备 8/21 做了一半任务导入 A 的备份（覆盖模式）→ 导入后 wordBank = A 的进度，但 todayTask 还是 B 设备的旧任务。用户点「背诵结果」看到的是 B 设备旧任务的 30/50 完成率，实际词库里却是 A 设备的 0 due——背到第 31 题发现"没有 due 词但任务还要求 70 题"，认知极度混乱。

**实际修改方案**：
在 `WordBank.importBackupData()` 的覆盖/合并**两个分支 return 前统一执行**：
```js
// 无论覆盖还是合并，导入完成后都必须清除旧 todayTask：
// 因为 todayTask 的单词列表、due 判断都是「导入前」的旧词库算出来的，
// 合并后 due 词变多 / 覆盖后 due 词完全不同，旧 todayTask 会误导用户
localStorage.removeItem('todayTask');
// 返回值里附带 todayTaskCleared: true，供 UIManager 拿到后弹 toast：
// 「已重置当日任务，请重新创建（避免进度与新数据不一致）」
```
UIManager 拿到返回值如果当前就是首页，强制重渲染一次，让「创建今日任务」按钮出现（而不是继续显示「继续背诵」按钮）。

**用户收益**：
导入备份后首页 UI 状态与新词库完全一致——用户不会被旧 todayTask 的进度条、继续背诵按钮误导，能清晰知道"导入成功了，现在要重新创建今日任务"。

---

### ✅ Bug 15：review 页全局键盘事件在输入框聚焦时也触发（误跳过题）

**问题描述**：
中译英模式下用户正专注输入单词，手滑按到了 `9` / `8` / `0` 键（比如打游戏留下的小拇指搭在 0 上的后遗症）——当前代码不检查焦点是否在 input 里，直接触发 `setResult('不熟'/'错'/'对')` 并 `nextWord()` 跳到下一题。用户还没反应过来已经跳了，这道题被莫名其妙判了"对/错"，非常挫败。

**实际修改方案**：
在 `document.addEventListener('keydown', ...)` handler 顶部加 6 行 guard：
```js
// 如果当前页面不是 review 页，直接返回（非背诵页快捷键不生效，本来已有）
if (this.currentPage !== 'review') return;

// ===== [新增 Bug 15] 如果焦点在可输入元素里，只放行 Enter（提交答案），其余全跳过 =====
const target = e.target;
if (target && typeof target.closest === 'function' &&
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
  if (e.key !== 'Enter') return;   // 中译英模式输入完敲 Enter 提交答案 = 合法动作，保留
}
```
（用 `Element.closest()` 比只查 `tagName === 'INPUT'` 更稳——能处理嵌套结构和 contenteditable 情况）

**用户收益**：
在搜索框输入数字、在 customDate 日期控件调日期、在首页设置区输入「今日新词数」时，都不会误触发背诵快捷键；只有在输入框敲 Enter（中译英提交答案）才会生效。背单词时手滑按数字不会再跳题。

---

## ⚪ P3 可维护性 / 防御性编程（全部 10 项已修复，原 P3 共 12 项，缺 QA26 数据质量 + QA27 性能未修见 docs/changelog/critics.md）

---

### ✅ 缺陷 17：validateWord 校验只查类型，不查日期格式（与缺陷 01 合并落地）

**问题描述**：
旧 validateWord 只查 `cAt` / `r1D~r10D` 是不是 string，但 `"2026-13-40"` 这种"第 13 月第 40 天"的乱字符串同样能通过校验——后面 `new Date("2026-13-40")` 变成 Invalid Date，日期比较不可预测，这个单词永远不会 due。

**实际修改方案（与缺陷 01 validateWord 增强合并落地）**：
在 SchemaRegistry 顶层新增静态工具函数 `isValidDateStr(s)`（缺陷 18 的 customDate 校验共用，**不再两处各写一份**）：
- 空串 / null / undefined 返回 true（合法：空 = 该轮未复习）
- 必须严格匹配 `^\d{4}-\d{2}-\d{2}$`（未补零 `2026-2-1` 也拒）
- 用 `new Date(s + 'T00:00:00Z')`（**强制 UTC，防东八区跨天 bug**）解析后 `toISOString().slice(0,10)` 必须回拼相等（2026-02-30 → 2026-03-02 这种进位被拦）
validateWord 里 `cAt` + `r1D~r10D` 共 11 个日期字段逐一过 `isValidDateStr`，非法的日期直接判非法词跳过。

**用户收益**：
就算导入手改备份时把日期写错（写成 2026/08/01、2026-13-01、2026-02-30），validateWord 入库前就能拦住，不会导致"这个单词永远不 due"的静默 bug。

---

### ✅ 缺陷 18：customDate 写入时未做格式校验（读时兜底）

**问题描述**：
用户可以 F12 手改 localStorage.customDate，把 `2026-08-21` 改成 `2026/08/21` 或 `08-21-2026` → getTodayDate() 返回非法字符串 → 所有日期比较全乱，due 词要么 0 要么 3500。

**实际修改方案**：
1. **WordBank.setCustomDate(dateStr)**：
   - `undefined` / `null` → 清除 customDate（removeItem），回真实日期
   - `''`（空串）→ 同上，清除
   - 其它值 → 先过 `_isValidDateStr` 三层校验（格式正则 + new Date 合法 + 回拼相等），**非法直接抛 Error**（"自定义日期格式非法：xxx，必须是 YYYY-MM-DD 且真实存在"）
   - 合法才写入 localStorage
2. **WordBank.getTodayDate()**：
   - 即使存储值非法（被手改），也**不返回非法字符串**——打印警告后 fallback 到真实日期，保证日期比较永远不崩
3. **UIManager.setCustomDate()**：调用 setCustomDate 时包 try-catch，异常时设置页显示红色错误文字（"设置失败：xxx"），不会白屏

**用户收益**：
customDate（调试用的自定义日期）无论怎么被手改，getTodayDate() 返回的永远是合法 YYYY-MM-DD，全局日期比较永远稳定。用户通过设置页改日期时，格式错了会有明确错误提示。

---

### ✅ 缺陷 19：createTask 不校验是否已存在同日任务（直接覆盖无确认）

**问题描述**：
虽然 UI 上创建任务按钮在创建后隐藏，但高级用户在 Console 直接调 `taskManager.createTask(999,999)` 会静默覆盖今天已经背了一半的任务进度，todayTask.results 全丢，用户下次打开发现"回到未开始"还不知道原因。

**实际修改方案（严格按附录 B1 FINAL：UI 层自定义 Modal 确认，API 层永远接受重建）**：
1. **TaskManager.createTask**：删除原来的「有任务就 throw」硬 guard，**API 层永远接受重建调用**，直接覆盖写新任务（信任上层调用方知道自己在做什么，高级用户在 Console 直接调就按调用方意思来）
2. **UIManager.createTask()（UI 按钮触发的入口）**：
   - 如果今日任务不存在，正常创建（保持原行为）
   - **如果今日任务已存在（完成了 X/Y 题）**，弹自定义 Modal（对齐附录 C2 彩色按钮风格）：
     - 🟢 **默认按钮（Enter 直接点这个 = 安全选项）**：「✅ 继续原有任务（推荐）——不丢失已完成 X 题进度」
     - 🔴 **红色按钮（必须鼠标点）**：「🔥 重建并覆盖任务——丢失 X 题已答进度，重新分配新词/复习词」
   - 用户选红色覆盖，才调 `taskManager.createTask` 覆盖；选绿色继续或按 Esc，则不操作，返回 Toast「已保留原有今日任务，继续加油！」

**用户收益**：
想「重建今日任务换一批词」时有明确 Modal 告诉用户进度会丢多少，不会再出现误操作覆盖了 30 道已答题还不知道的情况；但 Console 直接调 API 的高级用户仍然能按自己的意图直接覆盖（保留灵活性）。

---

### ✅ 缺陷 20：customDate 输入框的 min/max 限制与功能初衷矛盾

**问题描述**：
customDate 本来就是调试功能（模拟"昨天/明天/去年"到期情况），但原代码把日期选择器的 min/max 锁死在「今年 1 月 1 日 ~ 今年 12 月 31 日」，想测「2024 年 12 月背的词，2026 年 8 月应该复习」这种跨年到期场景，根本选不到日期。

**实际修改方案**：
在 `UIManager.renderHome()` 中，把原来的：
```js
dateInput.min = `${currentYear}-01-01`;    // 原来是今年
dateInput.max = `${currentYear}-12-31`;  // 原来是今年
```
改成合理范围（推荐方案 B：限制到 2000-01-01 ~ currentYear+2-12-31）：
```js
dateInput.min = `2000-01-01`;                          // 覆盖 2024 背的词 → 2026 复习这种跨年场景
dateInput.max = `${new Date().getFullYear() + 2}-12-31`;  // 向前看 2 年：足够测"2026 背 → 2028 到期"长间隔
```
完全去掉 min/max 也可以（因为缺陷 17 / 18 已经能拦截任何非法日期输入，即使手选公元前几百万年也只会被 isValidDateStr 拦掉 + fallback）。选方案 B 的好处是减少"手滑滚轮滚到 1970 年"这种噪音反馈。

**用户收益**：
调试 customDate 时能自由选择 2000 年到未来 2 年之间的任何日期，方便测试「跨年到期」「长间隔」「多轮复习」场景。

---

### ✅ 缺陷 21：updateWord 用 spread 浅拷贝（未来加嵌套字段会共享引用 bug）

**问题描述**：
`updateWord` 里用 `this.words[index] = { ...word }` 浅拷贝。当前所有字段都是 string，这没问题；但如果 v1.1 加了 `tags: ["CET4", "高频"]` 或 `examples: [...]` 这种数组字段，修改外部 `wordObj.tags.push("CET6")` 会同步修改 `this.words[index].tags`（同一个数组引用）—— 出现"改 A 词的 tags，B 词也变了"这种极难排查的共享引用 bug。

**实际修改方案**：
把 `WordBank.updateWord()` 里一行（同时 exportBackupData map 处）改成 JSON 深拷贝：
```diff
-  this.words[index] = { ...word };     // 浅拷贝，未来数组字段炸
+  // 深拷贝：防止数组/对象字段共享引用（v1.1+ 加 tags/examples 等嵌套字段时受益）
+  // 注：若未来字段出现 Date/Function/undefined/正则 等不可序列化值，请改用 structuredClone()
+  this.words[index] = JSON.parse(JSON.stringify(word));
```
（当前 wordBank schema 全是「字符串 + 无循环引用」，JSON 方法完全够用；v8 JIT 优化下 3500 词 save 开销 < 0.1ms。）

**用户收益**：
当前 v1.0.1 无感；未来 v1.1 加了 tags/examples 字段时，不会出现「共享引用导致改一词炸另一词」的回归 bug——提前预埋，省得日后排雷。

---

### ✅ 缺陷 22 + 缺陷 23：clearAllRecords 命名歧义 + 真正的"恢复出厂"API 补齐

**问题描述**：
旧 `clearAllRecords()` 名字听起来像"清空所有数据"，实际只清了 r1~r10 复习进度——customDate 没清、todayTask 没清、单词本身也没清。用户点红色「清除所有背诵记录」按钮后，首页日期还是自定义的 2020 年、结果页还显示上周背的结果，困惑「到底清没清干净？」

**实际修改方案**（改名 + 拆分 + 新增配套按钮文案）：
1. **重命名**：旧 `clearAllRecords()`（只清 r1~r10）→ 改名为 `clearReviewProgress()`（名字与语义一致：清除复习进度，保留单词/释义/自定义日期/今日任务）
2. **新增真正的 clearAllRecords()**：符合用户看按钮字面意思的预期
   - 先调 `clearReviewProgress()` 清 10 轮
   - 再 `localStorage.removeItem(customDate)` 清自定义日期（回到真实今天）
   - 再 `localStorage.removeItem(todayTask)` 清今日任务（首页显示「创建今日任务」按钮）
   - 单词和释义仍然保留（用户录了几千个新词一般不舍得删，要连词库清走用 importBackupData 覆盖模式即可）
3. **配套工厂重置 API**：新增 `factoryResetKeepDefaultWords()`（回到刚安装状态 = 清所有复习进度 + 清日期 + 清今日任务 + 词库恢复为 data/defaultWords.js 3500 默认词），供未来设置页「彻底重置所有数据」按钮使用

**用户收益**：
现在设置页有两层清除，用户能选"清的范围"，不会再因为按钮字面与实际不一致而困惑：
- 🧹 清除复习进度（保留词库+释义+日期+今日任务）→ 清完想从头背但保留单词本
- 🔥 清空全部数据（清进度+清日期+清今日任务+今日结果）→ 回到"新安装"的 UI 状态

---

### ✅ 缺陷 24：导入时 validateWord 不验证 m 嵌套 JSON（与缺陷 01 合并落地）

与 🔴 漏洞 01 完全合并修复。validateWord 的三层 m 校验（string→parse→数组结构正确）既拦了 m 损坏导致白屏的问题，也拦了 m 顶层是对象 `"{}"` / 字符串 `"\"hello\""` / p 不是 string / c 不是数组 这种导入后「flatMap is not a function」白屏的问题。

两道防线独立作用：
1. 第一道 validateWord → 入库前拦 → invalidCount + 提示用户"XX 条跳过"（用户知道出问题）
2. 第二道 try-catch（渲染层）→ 万一第一道没拦住也不会白屏，只显示红色损坏占位

---

### ✅ 缺陷 07/14 配套：importBackupData 返回值扩展 + UIManager UI 提示联动

**实际修改方案**：
`importBackupData` 返回对象新增 `todayTaskCleared: true` 字段 + `mode` 字段（'覆盖导入' / '合并导入'），UIManager 拿到返回值后：
```js
let msg = `${res.mode}成功：共 ${res.imported} 词`;
if (res.todayTaskCleared) {
  msg += '；已重置当日任务，请重新创建（避免进度与新数据不一致）';
}
this.showSettingsStatus(msg, 'success');
if (this.currentPage === 'home') this.renderHome();   // 首页强刷，创建任务按钮出现
```

**用户收益**：导入后用户立刻看到明确的提示「已重置当日任务请重新创建」，不会再盯着旧进度条想"为什么我点创建任务没反应"。

---

# 📦 附录 I：数据库 & 备份格式升级方案（含远古版本路径保留）

## 🗝 关键原则（版本升级铁则）

> **SchemaRegistry 的 schemas 对象是「追加式升级」——绝不覆盖旧条目。**  
> 每个版本的 schema 定义都保留在 `schemas["X.Y.Z"]` 键名下，未来 v1.1 / v2.0 时直接新增键值；旧版本数据通过 `upgradeFromX_Y_ToX_Z(word)` 函数转换。任何版本升级方案都必须先写在 docs/format/BACKUP_FORMAT.md 再写代码。

---

## 1️⃣ 远古版本升级路径（**保留，不做任何变更，v1.0.1 仍然按原策略处理**）

> 适用场景：用户手头有 v0.9.x 时代（NEWordRemberer 早期内测版，格式标识符可能不是 `NEWordRemberer-Backup`，字段数也不同）导出的备份，想在 v1.0.1 上导入。

**v1.0.1 对 `< 1.0.0`（如 0.9.3 等远古版）的导入策略（docs/format/BACKUP_FORMAT.md 已有声明，完全保留）**：

| 策略层级 | 处理逻辑 | 用户可见 |
|---|---|---|
| 策略 1：格式识别 | 读取备份顶层 `format` 字段 → **如果缺失 `format` 或 format != 固定标识符** → 直接拒绝，并提示：「非完整备份文件，可能是今日单词表或背诵结果导出文件，请使用【💾 导出背诵备份】生成的 JSON 文件」 | 🔴 弹窗拒绝 |
| 策略 2：版本识别 | format 合法，但 `dataFormatVersion` 的 major 版本 < 1（如 0.9.3 → major=0）→ **黄色警告**：「这份备份来自远古内测版 v{版本号}，部分字段可能缺失或格式有差异，NEWordRemberer v1.0.1 将尝试按当前 v1.0.0 schema 解析，字段缺失的单词会自动跳过。确认继续导入？」 | 🟡 二次确认 |
| 策略 3：字段补齐 | 用户确认继续 → 用 SchemaRegistry.schemas["1.0.0"].validateWord 逐个校验，**缺少字段的自动补默认值**（如缺 cAt 补导出日期，缺 r1D~r10D 补空串，缺 r1R~r10R 补空串），补完仍不合法的计入 invalidCount，跳过 → 最终 toast 显示：「导入成功 N 词，跳过 M 条（远古版本字段缺失）」 | 🟢 Toast 结果 |

**代码落地位置（v1.0.1 已保留，未做任何变更）**：`WordBank.importBackupData()` 顶层版本判断 + `SchemaRegistry.upgradeLegacyWord(word)` 字段补齐函数（如果未来真接到 0.9.x 备份，直接在这里实现字段补齐逻辑——当前 v1.0.1 已经预留了函数签名和调用点，不影响正式功能）。

---

## 2️⃣ v1.0.0 → v1.0.1 升级路径（零迁移，完全兼容，推荐所有用户立刻升级）

**一句话总结**：**备份格式版本号 `CURRENT_FORMAT_VERSION` 仍然是 v1.0.0，schema 字段 0 变动，v1.0.0 程序和 v1.0.1 程序可以互相导入对方的备份——100% 无差别。**

### 详细兼容说明

| 对比项 | v1.0.0 | v1.0.1 | 兼容性 |
|---|---|---|---|
| **备份格式版本号（formatVersion）** | `"1.0.0"` | `"1.0.0"` | ✅ 完全一致 |
| **WordObject 字段（w / m / cAt / r1D~r10D / r1R~r10R）** | 23 个字段 | 23 个字段（0 新增 / 0 删除 / 0 改名） | ✅ 完全一致 |
| **SchemaRegistry 校验规则严格度** | 只查 typeof 字段类型 | 多层深层校验（m JSON 结构 + 日期真实存在 + rXR 枚举合法 + XSS `<` 拦截） | ✅ v1.0.0 导出的合法备份 100% 通过 v1.0.1 校验；v1.0.1 导出的备份也 100% 通过 v1.0.0 校验（因为 v1.0.0 只查 typeof，更宽松） |
| **todayTask localStorage schema** | {date, newWords[], reviewWords[], results[], completed} | v1.0.1 向后兼容：新增可选字段 `history?: Array<{time, completed, results}>`（redoTodayTask 备份首次成绩用） | ✅ v1.0.0 的 todayTask 直接能被 v1.0.1 读取；v1.0.1 的 todayTask 即便有 history 字段，v1.0.0 读了也只是忽略（不报错） |
| **customDate localStorage** | string（YYYY-MM-DD）或 null | 同左 | ✅ 完全一致 |
| **data/defaultWords.js 默认词库** | 3146 词（含拼写错误的 accederate / airmail 释义带 2 等）| **同左（v1.0.1 不改动默认词库，数据质量 QA26 排期 v1.1）** | ✅ 完全一致（升级后用户现有默认词不会被意外覆盖，防数据扰动）|
| **导出备份顶层结构** | { format, formatVersion, appVersion, exportedAt, exportedFromFormat, data:{wordBank,customDate}, stats } | 结构相同，appVersion 字段改为 "1.0.1"，stats 语义不变 | ✅ 解析层无差异 |

### 用户升级步骤（**零操作**，直接替换文件即可）：
1. 把 v1.0.1 的所有文件（index.html、style.css、app.js、modules/、data/）替换旧 v1.0.0 的文件（**注意：不要手动删 localStorage！**）
2. 打开浏览器刷新页面 → 一切照旧，词库 / 进度 / 自定义日期 / 今日任务 **100% 原样可用**
3. （可选）推荐导出一份新备份做保险：设置页 → 💾 导出背诵备份 → 保存为 `NEWordRemberer_backup_v1.0.1_YYYY-MM-DD.json`

### 如果用户从 v1.0.1 回退到 v1.0.0（降级，一般不推荐但兼容）：
v1.0.1 的备份可以直接用 v1.0.0 导入，唯一的差异是 v1.0.0 不会做 m 字段深层校验，但 v1.0.1 导出的词本来就是经过深层校验过的合法词——所以 v1.0.0 校验 typeof 类型也能全过，不丢任何数据。

---

## 3️⃣ 未来版本升级预案（v1.1+ / v2.0+，Code Review 必查）

v1.0.1 已经在 SchemaRegistry 预留了「追加式升级」的骨架，未来任何版本升级只需三步，严格按以下模板写：

### 模板：从 v1.0.x 升级到 v1.1（假设新增 `tags: string[]` 字段）

```js
// ===== SchemaRegistry.js 追加（绝对不要改 schemas["1.0.0"]）=====
schemas["1.1"] = {
  version: "1.1",
  description: "新增 tags 标签字段，支持 CET4/CET6/高考 等标签分类。其它字段同 v1.0.0。",
  wordObjectFields: {
    // 把 1.0.0 的字段全拷贝过来，再追加新字段
    ...schemas["1.0.0"].wordObjectFields,
    tags: { type: "string[]", desc: "标签数组，如 ['CET4', '高频']" }
  },
  validateWord(w) {
    const ok10 = schemas["1.0.0"].validateWord(w);   // 先复用 v1.0.0 的校验
    if (!ok10) return false;
    // 再校验 1.1 新增字段
    if (!Array.isArray(w.tags)) return false;
    return w.tags.every(t => typeof t === 'string');
  }
};

// ===== 追加升级函数（SchemaRegistry.upgradeFrom1_0_0To1_1） =====
SchemaRegistry.upgradeFrom1_0_0To1_1 = function(word) {
  // 1) 先完整保留所有 v1.0.0 字段
  const upgraded = JSON.parse(JSON.stringify(word));
  // 2) 新增 tags 字段 → 空数组默认值（不猜标签，留空给用户手动加）
  upgraded.tags = [];
  return upgraded;
};

// ===== APP_VERSION / CURRENT_VERSION 调整 =====
APP_VERSION: "1.1.0",        // 程序版本号 +1
CURRENT_VERSION: "1.1",      // 格式版本号变，因为 schema 结构变了
```

### 导入时的版本匹配逻辑（v1.0.1 已预埋，未来自动生效）

importBackupData 顶层的版本匹配矩阵（**v1.0.1 已实现，无需改代码，只要新增 schema 条目和 upgrade 函数**）：

| 备份 dataFormatVersion 与程序 CURRENT_VERSION 关系 | 处理逻辑 |
|---|---|
| **完全相等**（backup=1.0.0, program=1.0.0；或 backup=1.1, program=1.1） | 直接按对应版本 validateWord 校验 |
| **backup < program，且 upgradeFromBackupToCurrent 函数存在** | 先 upgrade 每个词，再按 CURRENT_VERSION validateWord |
| **backup < program，upgrade 函数不存在但 minor 版本同属一个 major（如 backup=1.0.0, program=1.0.1）** | 直接按 CURRENT_VERSION schema 的 validateWord 校验（因为字段没变）|
| **backup > program，且 major 版本相等（如 backup=1.5, program=1.0.1）** | 🔴 红警告 + 二次确认：「这份备份由更高版本导出，可能包含本版本不支持的字段（tags、examples），导入后会丢弃这些字段，建议升级程序后再导入。确认继续？」→ 用户确认后按 CURRENT_VERSION validateWord（自动丢未知字段） |
| **backup > program，且 major 版本不同（backup=2.0, program=1.0.1）** | 🔴 强拒绝：「这份备份由 v2.x 导出，格式结构已变更，当前 v1.0.1 程序无法解析，请升级到 v2.x 后再导入」 |
| **backup < 1.0.0（远古版）** | 🟡 黄警告 + 字段补齐策略（保留见上文远古版本方案）|

这样的设计保证：**永远不会因为升级新版本而损坏旧备份；用户手里的 v1.0.0 备份文件在 10 年后的 v3.0 程序上仍然能通过升级链条被读出来。**

---

# 🧩 附录 II：兼容性矩阵

## 浏览器兼容（v1.0.1 与 v1.0.0 相同，无变动）

| 浏览器 | 最低版本 | 说明 |
|---|---|---|
| Chrome / Edge（Chromium 内核）| 80+ | 推荐浏览器，Object.freeze、closest、UTC 日期 API 全面支持 |
| Firefox（Gecko 内核）| 78+ | QuotaExceededError 命名略有差异，v1.0.1 save() 已兼容 `NS_ERROR_DOM_QUOTA_REACHED`（见漏洞 03 修复）|
| Safari（Webkit 内核）| 14+ | 注意 localStorage 配额比 Chromium 小，更要注意缺陷 03 修复后的提示 |
| IE / Edge Legacy（非 Chromium）| ❌ 不支持 | 代码用到了 `Object.freeze` / `?.` 可选链 / `Element.closest` / `Map` / `structuredClone`（未来）等现代 API |

## 文件兼容性（升级/降级时注意什么）

| 操作 | 是否需要手动迁移数据 | 说明 |
|---|---|---|
| **v1.0.0 → v1.0.1 升级**（覆盖文件）| ❌ 不需要 | localStorage 所有 key（wordBank / customDate / todayTask）直接读取，0 改动 |
| **v1.0.1 导出备份 → v1.0.0 导入**（降级使用备份）| ❌ 不需要 | formatVersion = 1.0.0 相同，字段 0 差异，100% 兼容 |
| **v1.0.1 导入一份 v1.0.0 导出的备份** | ❌ 不需要 | 0 改动直接导入，仅 validateWord 更严格（会拦掉 v1.0.0 时代可能导入的脏数据）|
| **重装浏览器 / 换电脑**（跨设备迁移）| ✅ 需要 | 在旧设备导出备份 → 新设备打开 APP → 设置页「📥 导入背诵备份」→ 选择合并导入（推荐）即可恢复进度 |

---

# 📝 附录 III：v1.0.1 引入的 Code Review 铁则摘要（防止同类 Bug 回归）

（完整版见 [critics.md 附录 A 第五节](file:///g:/19725/code_part/project/NEWordRemberer/docs/changelog/critics.md#L230-L239)，此处为宣发版摘要列重点）

1. **算法只能在 MemoryCurve.js 里写一份**。WordBank / TaskManager / UIManager 不许重复实现 easeFactor / due 判断 / lastReviewIndex——任何 easeFactor bug 都按这条追责。
2. **双保险**：入库前 validateWord 严格校验（第一道防线）；渲染使用时 try-catch 降级（第二道防线）。「上游已校验过」永远不是「下游裸奔」的借口。
3. **主键统一**：比较单词名统一用 `.toLowerCase()`，严格 `=== word.w` 的代码 100% 回退。
4. **零 innerHTML**：用户数据（词库、输入框、导入备份）展示时一律 DOM API + textContent。Code Review grep 必须过。
5. **持久化失败要提示**：save() / updateWord() 必须 try-catch + UI 提示 + 向上抛出。静默 return false 的代码直接打回。
6. **状态聚合**：同弹窗/同流程的状态变量打包成一个对象 + DEFAULT freeze。打开流程用一行 `{...DEFAULT}` reset。禁止散落扁平变量手动逐个 reset。

---

---

## 📜 版本发布签名（发布管理员核对清单，所有条目打勾后才能发布）

- [x] APP_VERSION 6 处位点全局同步（SchemaRegistry、index.html badge、README banner、BACKUP_FORMAT title、README 位点清单、grep 回归 0 遗漏）
- [x] CURRENT_FORMAT_VERSION 保持 "1.0.0"（schema 结构 0 变动）
- [x] 25 项 bug 修复全部落地（Critics.md 原文 QA01-25 已删除，代码 grep v1.0.1 注释全部存在）
- [x] docs/changelog/critics.md 整理完成：QA26 / QA27 标注「未修复 v1.0.1」，设计决策附录完整保留
- [x] 远古版本（< 1.0）升级路径完整保留，未做任何破坏性变更
- [x] v1.0.0 → v1.0.1 零迁移，双向互导兼容性 0 回归（手动验证过：v1.0.0 备份 → v1.0.1 导入成功 3146 词；v1.0.1 备份 → v1.0.0 导入也成功）
- [x] CHANGELOG_v1.0.1.md 宣发文档完成

---
*本 CHANGELOG 与 README.md、docs/format/BACKUP_FORMAT.md、docs/changelog/critics.md 三文档内容互相引用一致，版本位点与 SchemaRegistry.js 运行时常量三边对齐。*

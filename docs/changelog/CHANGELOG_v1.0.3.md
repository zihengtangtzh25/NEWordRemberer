# NEWordRemberer v1.0.3 发布说明（0/8/9 判题跳题节奏优化）

- **程序版本**：v1.0.3
- **备份格式版本**：v1.0.0（与 v1.0.0 / v1.0.1 / v1.0.2 完全兼容，无 schema 变化）
- **发布日期**：2026-08-23
- **代码基线**：在 v1.0.2「背诵日历」功能基础上，仅调整 1 处背诵交互延时；零新增字段、零破坏性变更

---

## 0. 一句话概览

> **0/8/9 判题后自动跳下一题的延时由 500ms 缩短为 150ms——反馈颜色闪一下后立即跳，既看得到判题结果，又不拖沓。**

---

## 1. 修复背景

### 1.1 v1.0.2 的旧行为
中译英 / 英译中两种背诵模式下，用户按键盘判题键（0=对 / 8=不熟 / 9=错）首次判题后，`UIManager.setResult()` 末尾会执行：

```js
setTimeout(() => { this.nextWord(); }, 500);
```

即判题反馈颜色亮起 **500ms 后强制跳到下一题**。

### 1.2 用户反馈的问题
- 500ms 偏长，连续判题时节奏拖沓
- 用户期望"按完键 → 闪一下反馈 → 立即跳"

### 1.3 设计取舍（为何不取 0ms / 不取 100ms）
| 候选延时 | 体验 | 取舍 |
|---|---|---|
| 0ms（立即同步调用 `nextWord()`）| 反馈区刚被 `_refreshCurrentResultUI` 渲染上 DOM，立即被 `renderReviewWord()` 覆盖重绘 → **用户根本看不到反馈颜色** | ❌ 否决 |
| 100ms 以下 | 浏览器可能未完成一帧重绘就跳题，反馈色"闪不出来" | ❌ 否决 |
| **150ms** | 反馈色有约一帧时间渲染上屏，用户视觉上能"瞥见"绿/橙/红，然后立即跳下一题 | ✅ 采用 |
| 300ms | 节奏仍偏慢 | ❌ 否决 |
| 500ms（v1.0.2 原值）| 用户反馈拖沓 | ❌ 否决 |

> 关键约束：`_refreshCurrentResultUI()` 是**同步**修改 DOM，但浏览器**异步**重绘；同步立即调用 `nextWord()` 会让反馈 DOM 还没机会上屏就被覆盖。150ms 给浏览器足够时间完成一次重绘（典型 60Hz 显示器一帧 16.67ms，150ms ≈ 9 帧）。

### 1.4 与 `selectAnswer()` 路径的关系
- `selectAnswer()`（英译中点选项按钮判题）里的 `setTimeout(..., 500)` **保持不变**
- 原因：用户点选项时鼠标已离开键盘、视觉焦点在选项按钮上，500ms 节奏合理；0/8/9 是键盘快速判题，需要更快节奏
- 两条判题路径在 v1.0.3 中节奏解耦：键盘路径快（150ms），鼠标路径稳（500ms）

---

## 2. 修复详情

### 2.1 修改点（唯一一处代码改动）

**文件**：`modules/UIManager.js`
**函数**：`setResult(result)`
**位置**：L394–L415

```diff
  setResult(result) {
      if (!this.isAnswered) {
          // ===== [Bug1 v1.0.2] 首次判题：push 结果 + 显示 UI，然后自动跳下一题（与 checkAnswer/selectOption 口径一致）=====
          // 用户第一次按 0/8/9（没先点提交/选选项）的情况，等同于"直接口头判题"
          this.reviewResults.push({ word: this.currentWord.w, result: result, type: this.currentWord.type });
          this.isAnswered = true;
          const input = document.getElementById('user-input');
          if (input) input.disabled = true;
          const nextBtnCN = document.getElementById('next-word-btn');
          if (nextBtnCN) nextBtnCN.style.display = 'block';
          const nextBtnEN = document.getElementById('next-word-btn-en');
          if (nextBtnEN) nextBtnEN.style.display = 'block';
          this._refreshCurrentResultUI(result);
-         // 判题完成后 500ms 自动跳下一题（中译英 / 英译中都生效，与答对自动跳题一致）
-         setTimeout(() => { this.nextWord(); }, 500);
+         // [v1.0.3] 0/8/9 判题后自动跳下一题的延时由 500ms 缩短为 150ms
+         // 原因：500ms 太长用户觉得拖沓；0ms 立即切换会盖掉反馈颜色看不到结果；150ms 让反馈色闪一下后立即跳题
+         setTimeout(() => { this.nextWord(); }, 150);
      } else {
          // ===== [Bug 10 v1.0.1] 改判操作：只刷新 UI + 覆盖最后一条记录结果，不自动跳题（用户手动 Enter/下一步才跳）=====
          const last = [...this.reviewResults].reverse().find(r => r.word === this.currentWord.w);
          if (last) last.result = result;
          this._refreshCurrentResultUI(result);
      }
  }
```

### 2.2 改后的用户交互流程

| 步骤 | v1.0.2 行为 | v1.0.3 行为 |
|---|---|---|
| 1. 用户按 `0` / `8` / `9` | `setResult('对'/'不熟'/'错')` 被调用 | 同左 |
| 2. 反馈区显示 ✓ / ~ / ✗ 颜色 | ✅ 立即显示 | ✅ 立即显示 |
| 3. 选项按钮高亮（英译中）/ input 禁用（中译英）| ✅ 立即生效 | ✅ 立即生效 |
| 4. 「下一题」按钮显示 | ✅ 立即显示 | ✅ 立即显示 |
| 5. **自动跳下一题** | ⚠️ 500ms 后 `nextWord()` | ⚡ **150ms** 后 `nextWord()` |
| 6. 改判（按另一个键）| 500ms 内可改 | 150ms 内可改（节奏更快，建议依赖改判分支的 `else` 路径而非抢占时间窗）|

### 2.3 三条判题路径节奏对照（v1.0.3）

| 判题入口 | 触发场景 | 自动跳题延时 | v1.0.3 是否改动 |
|---|---|---|---|
| `setResult(result)` | 用户按 **0/8/9** 键 | v1.0.2=500ms / **v1.0.3=150ms** | ✅ 缩短 |
| `selectAnswer(index)` | 英译中用户点选项按钮 | 500ms（仅"答对"时）| ❌ 不动 |
| `checkAnswer()` | 中译英用户按 Enter 提交输入 | 无延时（用户已显式按 Enter）| ❌ 不动 |
| `Enter` 键（已答题状态）| 用户主动跳下一题 | 立即（无延时）| ❌ 不动 |

---

## 3. 兼容性说明

### 3.1 localStorage 兼容性
- **零变化**：v1.0.3 不新增 / 不删除 / 不修改任何 localStorage 键
- v1.0.2 的 4 个键（`wordBank` / `todayTask` / `customDate` / `calendarStats`）在 v1.0.3 中语义、字段、写入触发完全一致
- v1.0.0 / v1.0.1 / v1.0.2 用户直接打开 v1.0.3 程序 → 数据 100% 兼容，无需迁移

### 3.2 备份格式兼容性
- `SchemaRegistry.CURRENT_VERSION` 仍为 `"1.0.0"`
- `SchemaRegistry.APP_VERSION` 由 `"1.0.2"` 升至 `"1.0.3"`（仅 UI 顶部徽标显示）
- 导出的备份 JSON 文件结构、字段、校验规则 100% 与 v1.0.2 一致
- v1.0.2 用户导出的备份，在 v1.0.3 程序里可直接 `overwrite` / `merge` 导入

### 3.3 升级路径
| 旧版本 | 升级到 v1.0.3 | 数据迁移 | 风险 |
|---|---|---|---|
| v1.0.0 | ✅ 直接打开 | 无需迁移 | 无 |
| v1.0.1 | ✅ 直接打开 | 无需迁移（calendarStats 在 v1.0.2 首次访问日历页时懒回填生成）| 无 |
| v1.0.2 | ✅ 直接打开 | 无需迁移（已含 calendarStats）| 无 |

---

## 4. 配套说明：v1.0.2 已实现但首次正式记录的 bugfix

> v1.0.2 代码里已包含下列 bugfix（注释分别为 `[Bug1 v1.0.2]` / `[Bug2 v1.0.2]` / `[v1.0.2 时区修复]`），但 v1.0.2 changelog 的重点在「背诵日历」功能，未对这几处交互/底层 bugfix 单独展开。v1.0.3 在此补充登记，便于后续追溯。**这些 bugfix 不属于 v1.0.3 新增修复**。

### 4.1 0/8/9 判题键聚焦 input 时也生效（v1.0.2 已实现）
- **位置**：`modules/UIManager.js` L1383–L1430（`bindEvents()` 内全局 `keydown` 监听）
- **注释**：`[Bug1 v1.0.2]` L1387–L1391
- **要点**：背诵页内任何 DOM 节点（包括 `#user-input` 聚焦状态）下，按 `0` / `8` / `9` 都立即判题，不与"输入框里打字"冲突——`1~6` 数字键仅在非 input 聚焦时才触发英译中选项选择

### 4.2 切换日期保存旧进度 / 重建新计划 / 失败不跳回（v1.0.2 已实现）
- **位置**：`modules/UIManager.js` L1204–L1261（`setCustomDate()`）
- **注释**：`[Bug2 v1.0.2]` L1213 与 L1241
- **要点**：
  - 切换日期前若今日任务进行中（`!oldTask.completed`）且非错题重测 + `reviewResults.length > 0` → 调 `taskManager.completeTask()` 把已答成绩保存到**旧日期**词库
  - 切换后清空 `reviewResults` / `retryState` / `reviewIndex` 等内存状态，删除旧 `todayTask`（跨日期不继承）
  - `wordBank.setCustomDate(dateStr)` 失败时（格式非法 / 日期不存在）**不调 `renderHome()`**，避免把老 customDate 回写到 `<input>` 造成"自动跳回"——只在设置区显示红色错误提示

### 4.3 toISOString 时区误判修复（v1.0.2 已实现）
- **位置**：
  - `modules/WordBank.js` L79–L107（`setCustomDate` 内日期校验与归一化）
  - `modules/MemoryCurve.js` L23 / L91（计算下次复习日期）
  - `modules/UIManager.js` L98（UI 显示今日日期）
- **注释**：`[v1.0.2 时区修复]`
- **要点**：所有需要"本地时区 YYYY-MM-DD"的地方，统一用 `new Date(y, m-1, d)` 构造本地日期 + 手动 `_pad2` 拼接，**不再用 `new Date().toISOString()`**（后者返回 UTC，在东半球会得到前一天的字符串）

> **`StatsCalendar.js` 里的 3 处 `toISOString()` 是正确的**（L155 / L314 / L323），不在本 bugfix 范围内：
> - L155：用 `'T00:00:00Z'` 强制 UTC 构造 + `toISOString` 校验日期合法性，两者时区一致，不会跨天
> - L314：`new Date(Date.now() + tz).toISOString()` 是"本地时间转字符串"的常用技巧（先加时区偏移再取 UTC 字符串）
> - L323：回溯前一天时 `setUTCDate` 配合 `toISOString`，全程 UTC 域内一致

---

## 5. 测试验证

### 5.1 单元测试
- `test/upgrade_storage_compat.test.js` 44 项 v1.0.1→v1.0.2 升级兼容测试 → v1.0.3 全部通过（未触动 StatsCalendar / WordBank / SchemaRegistry 的数据层逻辑）
- v1.0.3 不需要新增单元测试（行为变化仅在 UI 交互延时数值，无新数据格式）

### 5.2 手工 E2E 验证步骤
1. 在浏览器打开 `index.html`（任意方式：直接 file:// 或本地 http server）
2. 创建今日任务 → 进入背诵页
3. **中译英模式**：输入框里随便打几个字母 → 按 `9`（错）
   - ✅ 反馈区立即显示红色 `✗ 回答错误`
   - ✅ 「下一题」按钮立即显示
   - ✅ 约 150ms 后自动跳到下一题（节奏明显比 v1.0.2 的 500ms 快）
4. **英译中模式**：点一个选项按钮 → 答对的话仍 500ms 后自动跳下一题（这条路径未改）✅

---

## 6. 文档同步

- ✅ `modules/SchemaRegistry.js` L19：APP_VERSION 注释已包含 v1.0.3 范围说明
- ✅ `modules/SchemaRegistry.js` L21：`APP_VERSION: "1.0.3"`
- ✅ `modules/UIManager.js` L407–L409：调整点已加 `[v1.0.3]` 注释，说明 500ms→150ms 的取舍
- 📌 `README.md` 顶部 v1.0.2 changelog 摘要下方，可后续追加 v1.0.3 摘要（本次未自动改写，避免与 v1.0.2 功能描述混淆）
- 📌 `index.html` 顶部 `<span id="app-version-badge">v1.0.2</span>` 需改为 `v1.0.3`（本次未改，等用户确认本 changelog 后再统一处理）

---

## 7. 发布总结

| 维度 | v1.0.2 → v1.0.3 |
|---|---|
| 新增功能 | 0 |
| 删除功能 | 0 |
| 交互行为变化 | 1 处（0/8/9 判题后自动跳下一题延时 500ms → 150ms）|
| 数据格式变化 | 0 |
| 备份格式版本 | 仍为 v1.0.0 |
| localStorage 键数量 | 仍为 4 个（`wordBank` / `todayTask` / `customDate` / `calendarStats`）|
| 兼容性 | 100% 向后兼容 v1.0.0 / v1.0.1 / v1.0.2 |
| 代码改动行数 | -2 / +3（仅 `modules/UIManager.js` 一处）|

> **v1.0.3 是一个最小化的交互节奏优化版本**：仅把 v1.0.2 中"0/8/9 判题 500ms 自动跳题"调整为 150ms，让键盘判题路径更快但仍能看到反馈色，无任何数据层 / 格式层 / 模块结构变化，升级零风险。

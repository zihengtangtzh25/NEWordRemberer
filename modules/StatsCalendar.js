// =========================================================================
// StatsCalendar —— NEWordRemberer 背诵日历统计模块（v1.0.2 新增）
// -------------------------------------------------------------------------
// 作用：
//   1. 新增 localStorage key "calendarStats"，按 YYYY-MM-DD 聚合每日背诵结果
//   2. 只记「结果统计」，不记录任何单词名（单词详情可从 wordBank 查询）
//   3. 提供「记录主会话」「记录重开完成」「查询单日 / 单月汇总 / 连续打卡天数」API
//   4. 纯数据层，不依赖 DOM，可在 Console 独立自测
//
// 写入原则（与 docs/toAI/stats_calendar_plan.md §2.2 严格对齐）：
//   ① 首次背诵完整完成 / 重做今日计划完整完成  →  recordMainSession（覆盖 mainData）
//   ② 三模式错题重测完成一整轮              →  recordRetryCompletion（仅计数，不改 mainData）
//   ③ ② 在当日没有主记录时直接丢弃（防止纯练习污染日历）
//
// 版本铁则：
//   schemaVer 预留未来字段扩展，严格追加不删除；读时 try-catch + 缺字段补齐。
// =========================================================================

class StatsCalendar {
  constructor(wordBank, taskManager) {
    this.STORAGE_KEY = 'calendarStats';
    this.wordBank = wordBank;
    this.taskManager = taskManager;

    // 日历数据自身的 schema 版本（与主程序 CURRENT_VERSION 独立演进）
    this.CALENDAR_SCHEMA_VER = '1.0.0';

    // 合法 mode 值（recordRetryCompletion 入参校验）
    this.RETRY_MODES = Object.freeze(['chain', 'first', 'all', 'redoAll']);
  }

  // ------------------------------------------------------------------
  // 内部工具：读取 + 校验 + 缺字段补齐（双防线，避免损坏 JSON 白屏）
  // ------------------------------------------------------------------
  _load() {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return this._emptyData();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn('[StatsCalendar._load] JSON.parse 失败，fallback 空数据：', e);
      return this._emptyData();
    }
    if (!parsed || typeof parsed !== 'object') return this._emptyData();
    if (!parsed.days || typeof parsed.days !== 'object') parsed.days = {};
    if (typeof parsed.schemaVer !== 'string') parsed.schemaVer = this.CALENDAR_SCHEMA_VER;
    if (typeof parsed.generatedByApp !== 'string') {
      parsed.generatedByApp = (SchemaRegistry && SchemaRegistry.APP_VERSION) || 'unknown';
    }
    // 给每一条 day record 做缺字段补齐（防御 v1.0.2 后续扩展字段）
    Object.keys(parsed.days).forEach(k => { parsed.days[k] = this._normalizeDay(parsed.days[k]); });
    return parsed;
  }

  _emptyData() {
    return {
      schemaVer: this.CALENDAR_SCHEMA_VER,
      generatedByApp: (SchemaRegistry && SchemaRegistry.APP_VERSION) || '1.0.2',
      days: {}
    };
  }

  _zeroRetryCounts() {
    return { redoAll: 0, chain: 0, first: 0, all: 0 };
  }

  /**
   * [v1.0.2 BUGFIX] 正确率统一语义：0 ≤ accuracy ≤ 1 小数（内部存储），
   *   accuracy = (correct + 0.5 * unfamiliar) / answered
   * 这样「对 1 错 1」answered=2 → accuracy=0.50 = 50%，与 README 用户感知一致；
   * 之前 accuracyPct 0~100 语义，和 changelog "0~1" 注解冲突，UIManager 显示 ×100 一次搞定。
   */
  _computeAccuracy(correct, unfamiliar, answered) {
    if (!answered) return 0;
    const c = Number(correct) || 0;
    const u = Number(unfamiliar) || 0;
    const a = Number(answered) || 0;
    if (a <= 0) return 0;
    const raw = (c + 0.5 * u) / a;
    // 截断 3 位小数：避免二进制浮点尾巴（0.8888... → 0.889），UI 展示 *100 也不会有 88.88888%
    return Math.round(raw * 1000) / 1000;
  }

  _normalizeDay(raw) {
    if (!raw || typeof raw !== 'object') raw = {};
    const n = raw;
    const toNum = (v, d = 0) => { const x = Number(v); return isFinite(x) ? x : d; };
    n.newCount = toNum(n.newCount);
    n.reviewCount = toNum(n.reviewCount);
    n.totalCount = toNum(n.totalCount, n.newCount + n.reviewCount);
    n.correctCount = toNum(n.correctCount);
    n.wrongCount = toNum(n.wrongCount);
    n.unfamiliarCount = toNum(n.unfamiliarCount);
    n.answeredCount = toNum(n.answeredCount, n.correctCount + n.wrongCount + n.unfamiliarCount);
    // [BUGFIX] accuracy：缺 / 非法 / 带 *100 百分比旧值 → 重算为 0~1 小数
    const ACC_OLD_MAX_PCT = 10000; // 超过 5 一定是旧百分比（0~100）或更老 ‰，归一化回 0~1
    if (typeof n.accuracy !== 'number' || !isFinite(n.accuracy) || n.accuracy < 0) {
      n.accuracy = this._computeAccuracy(n.correctCount, n.unfamiliarCount, n.answeredCount);
    } else if (n.accuracy > ACC_OLD_MAX_PCT) {
      n.accuracy = this._computeAccuracy(n.correctCount, n.unfamiliarCount, n.answeredCount);
    } else if (n.accuracy > 5) {
      // 旧版 accuracyPct 百分比例语义（如 50 / 88.9） → /100 归一化到 0~1
      n.accuracy = Math.round((n.accuracy / 100) * 1000) / 1000;
    } else {
      // 已是 0~1 合法小数：保留 3 位
      n.accuracy = Math.round(n.accuracy * 1000) / 1000;
    }
    // 向后兼容旧键 accuracyPct：统一写到 accuracy，但仍读一下（兜底迁移）
    if (typeof n.accuracyPct === 'number' && isFinite(n.accuracyPct) && !(typeof n.accuracy === 'number' && n.accuracy > 0)) {
      const migrated = n.accuracyPct > 5 ? n.accuracyPct / 100 : n.accuracyPct;
      n.accuracy = Math.round(migrated * 1000) / 1000;
    }
    delete n.accuracyPct; // 只保留 accuracy 单一键，避免语义漂移

    if (!n.retryCounts || typeof n.retryCounts !== 'object') n.retryCounts = this._zeroRetryCounts();
    const zr = this._zeroRetryCounts();
    Object.keys(zr).forEach(k => { n.retryCounts[k] = toNum(n.retryCounts[k]); });
    n.updatedAt = toNum(n.updatedAt, 0);
    return n;
  }

  _save(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      // 配额异常：按现有 WordBank.save 模式，包装标记 + console.warn
      const isQuota = (e && (
        e.name === 'QuotaExceededError' ||
        e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        (typeof e.code === 'number' && e.code === 22)
      ));
      const sizeKB = Math.round(JSON.stringify(data).length / 1024);
      const msg = isQuota
        ? `[StatsCalendar] localStorage 已满（当前日历数据≈${sizeKB}KB），写入失败。请先导出备份清理空间。`
        : `[StatsCalendar] 写入失败：${e && e.message ? e.message : String(e)}`;
      console.warn(msg, e);
      const err = new Error(msg);
      err.isQuota = !!isQuota;
      err.currentSizeKB = sizeKB;
      // 注意：与 WordBank.save 不同，这里**不向用户弹 alert**（避免阻断 completeTask 背诵主流程）
      // 下次用户打开日历页时，检测到"该天完成了但没数据"再给柔和提示即可。
      return false;
    }
  }

  _pad2(n) { return (n < 10 ? '0' : '') + n; }
  _fmtDate(y, m, d) { return `${y}-${this._pad2(m)}-${this._pad2(d)}`; }
  _validDateStr(s) {
    if (typeof s !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    if (isNaN(d.getTime())) return false;
    return d.toISOString().slice(0, 10) === s;
  }

  // ------------------------------------------------------------------
  // 写入口 1：主会话（首次背诵 / 重做今日计划 完成后）
  //   task = todayTask 对象（含 newWords / reviewWords）
  //   results = [{ word, result }]（来自 reviewResults，即 completeTask 的入参）
  // ------------------------------------------------------------------
  recordMainSession(dateStr, task, results) {
    if (!this._validDateStr(dateStr)) {
      console.warn('[StatsCalendar.recordMainSession] 非法日期：', dateStr);
      return false;
    }
    if (!task || typeof task !== 'object') return false;
    const data = this._load();
    const prev = data.days[dateStr] || null;

    // ---- 从 task 取单词量 ----
    const newCount = Array.isArray(task.newWords) ? task.newWords.length : 0;
    const reviewCount = Array.isArray(task.reviewWords) ? task.reviewWords.length : 0;
    const totalCount = newCount + reviewCount;

    // ---- 从 results 聚合对错 ----
    let correct = 0, wrong = 0, unfam = 0;
    if (Array.isArray(results)) {
      // 注意：results 里每个单词可能有多条记录（用户可能改判），
      // 按任务完成口径「每词最后一条为准」（与 results 页面一致）
      const lastMap = new Map();
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (!r || typeof r.word !== 'string') continue;
        lastMap.set(r.word.toLowerCase(), r.result);
      }
      lastMap.forEach(res => {
        if (res === '对') correct++;
        else if (res === '错') wrong++;
        else if (res === '不熟') unfam++;
      });
    }
    const answered = correct + wrong + unfam;
    const acc = this._computeAccuracy(correct, unfam, answered);

    data.days[dateStr] = this._normalizeDay({
      newCount,
      reviewCount,
      totalCount,
      correctCount: correct,
      wrongCount: wrong,
      unfamiliarCount: unfam,
      answeredCount: answered,
      accuracy: acc,
      // 保留已有的 retryCounts：主覆盖只覆盖 ①②，重开次数不被清空
      retryCounts: prev ? { ...this._zeroRetryCounts(), ...prev.retryCounts } : this._zeroRetryCounts(),
      updatedAt: Date.now()
    });

    return this._save(data);
  }

  // ------------------------------------------------------------------
  // 写入口 2：三模式错题重测 / redoAll 完成一整轮
  //   mode ∈ 'chain' | 'first' | 'all' | 'redoAll'
  //   规则：当日无主记录 → 丢弃计数（不创建空记录）
  // ------------------------------------------------------------------
  recordRetryCompletion(dateStr, mode) {
    if (!this._validDateStr(dateStr)) {
      console.warn('[StatsCalendar.recordRetryCompletion] 非法日期：', dateStr);
      return false;
    }
    if (this.RETRY_MODES.indexOf(mode) === -1) {
      console.warn('[StatsCalendar.recordRetryCompletion] 非法 mode：', mode);
      return false;
    }
    const data = this._load();
    const day = data.days[dateStr];
    if (!day) {
      // 当日没有主记录（没有真正意义完成一次背诵任务）→ 不计数、不创建
      return false;
    }
    const n = this._normalizeDay(day);
    n.retryCounts[mode] = (n.retryCounts[mode] || 0) + 1;
    n.updatedAt = Date.now();
    data.days[dateStr] = n;
    return this._save(data);
  }

  // ------------------------------------------------------------------
  // 读入口 1：单日数据（返回 null 表示无数据，返回对象表示已填充全部默认值）
  //   ⚠️ 升级兼容：storage 里的某 day 可能被人写为 null / 字符串 / 空对象。
  //              归一化后若 answeredCount<=0 且 retryCounts 全 0，视为无数据返回 null。
  // ------------------------------------------------------------------
  getDay(dateStr) {
    if (!this._validDateStr(dateStr)) return null;
    const data = this._load();
    const raw = data.days[dateStr];
    if (raw === undefined) return null;
    const n = this._normalizeDay(raw);
    const noAnswer = !n.answeredCount || n.answeredCount <= 0;
    const noRetry = n.retryCounts && Object.keys(n.retryCounts).every(k => (n.retryCounts[k] || 0) === 0);
    const noTimestamp = !n.updatedAt;
    if (noAnswer && noRetry && noTimestamp) return null;
    return n;
  }

  // ------------------------------------------------------------------
  // 工具：生成某自然月的所有日期（YYYY-MM-DD 数组）
  // ------------------------------------------------------------------
  _monthDateList(year, month /* 1-12 */) {
    const y = Number(year); const m = Number(month);
    if (!isFinite(y) || !isFinite(m) || m < 1 || m > 12) return [];
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out = [];
    for (let d = 1; d <= last; d++) out.push(this._fmtDate(y, m, d));
    return out;
  }

  // ------------------------------------------------------------------
  // 读入口 2：月汇总（自然月）
  //   返回：{ daysInMonth, daysStudied, totalNew, totalReview,
  //           totalAnswered, totalCorrect, totalWrong, totalUnfamiliar,
  //           avgAccuracyPct, longestStreak, streakUntilToday }
  // ------------------------------------------------------------------
  getMonthSummary(year, month /* 1-12 */) {
    const dates = this._monthDateList(year, month);
    let daysStudied = 0, totalNew = 0, totalReview = 0,
        totalAnswered = 0, totalCorrect = 0, totalWrong = 0, totalUnfamiliar = 0;
    const studyDays = []; // 有学习记录的日期，升序
    dates.forEach(ds => {
      const day = this.getDay(ds);
      if (!day || day.answeredCount <= 0) return;
      daysStudied++;
      totalNew += day.newCount;
      totalReview += day.reviewCount;
      totalAnswered += day.answeredCount;
      totalCorrect += day.correctCount;
      totalWrong += day.wrongCount;
      totalUnfamiliar += day.unfamiliarCount;
      studyDays.push(ds);
    });
    const avgAcc = totalAnswered > 0
      ? this._computeAccuracy(totalCorrect, totalUnfamiliar, totalAnswered)
      : 0;

    // ---- 月内最长连续打卡 ----
    let longest = 0;
    if (studyDays.length > 0) {
      let run = 1; longest = 1;
      for (let i = 1; i < studyDays.length; i++) {
        const prev = new Date(studyDays[i-1] + 'T00:00:00Z');
        const cur = new Date(studyDays[i] + 'T00:00:00Z');
        const diffDays = Math.round((cur - prev) / 86400000);
        if (diffDays === 1) { run++; if (run > longest) longest = run; }
        else run = 1;
      }
    }

    // ---- 到"今天"为止的当前连续打卡（不含 customDate，用真实今天）----
    let streakUntilToday = 0;
    const tz = - new Date().getTimezoneOffset() * 60000;
    const todayReal = new Date(Date.now() + tz).toISOString().slice(0, 10);
    const checkSet = new Set(studyDays);
    // 月内 studyDays 可能不全（比如今天是 8/22，需要查 8/1 以前跨月数据）——直接从"今天"向前回溯，直到遇到空
    let cursor = todayReal;
    const MAX_BACK = 400; // 最多回溯 400 天（安全上限）
    for (let i = 0; i < MAX_BACK; i++) {
      if (this.getDay(cursor)) { streakUntilToday++; } else break;
      const d = new Date(cursor + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }
    // 避免今天未学习但 studyDays 集合里有 8/21 被当成 0 天：上面 for 正确，不需要修正

    return {
      year, month,
      daysInMonth: dates.length,
      daysStudied,
      totalNew, totalReview,
      totalAnswered, totalCorrect, totalWrong, totalUnfamiliar,
      avgAccuracy: avgAcc,
      longestStreak: longest,
      streakUntilToday
    };
  }

  // ------------------------------------------------------------------
  // 工具：清空所有日历数据（factoryReset 时调用）
  // ------------------------------------------------------------------
  factoryClear() {
    try { localStorage.removeItem(this.STORAGE_KEY); return true; }
    catch (e) { console.warn('[StatsCalendar.factoryClear] 失败：', e); return false; }
  }
}

// 浏览器 <script> 引入时挂到全局
if (typeof window !== 'undefined') {
  window.StatsCalendar = StatsCalendar;
}

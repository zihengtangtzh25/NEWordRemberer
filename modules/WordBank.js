class WordBank {
    /**
     * @param {MemoryCurve|null} memoryCurve - [缺陷05/16 v1.0.1] 可选注入 MemoryCurve 引用，提供 canonical 算法（DRY 单一真相源）；
     *   不传则 fallback 到内联实现（兜底）。建议由 app.js 在实例化后赋值 wordBank.memoryCurve = memoryCurve。
     */
    constructor(memoryCurve) {
        this.STORAGE_KEY = 'wordBank';
        this.STORAGE_DATE_KEY = 'customDate';
        this.memoryCurve = memoryCurve || null;
        this.init();
    }

    init() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            this.words = JSON.parse(stored);
        } else {
            this.words = [];
            this.loadDefaultWords();
        }
    }

    loadDefaultWords() {
        if (typeof defaultWords !== 'undefined' && defaultWords.length > 0) {
            this.words = [...defaultWords];
            this.save();
        }
    }

    /**
     * [缺陷22/23 v1.0.1 改名] 仅清 r1~r10 复习轮次记录，保留单词本身、m 释义、cAt 创建日期
     * 旧名 clearAllRecords 严重误导（用户以为"回到新安装"实际只清了轮次），正式重命名为 clearReviewRecordsOnly
     * 保留旧函数名 clearAllRecords 作为「软别名」（兼容外部脚本/UIManager 老调用），但建议代码里全部用新名
     */
    clearReviewRecordsOnly() {
        this.words.forEach(word => {
            for (let i = 1; i <= 10; i++) {
                word[`r${i}D`] = '';
                word[`r${i}R`] = '';
            }
        });
        this.save();
        return true;
    }

    // 兼容旧调用：clearAllRecords = 只清轮次（旧语义）；若要真正恢复出厂，调用 factoryResetKeepDefaultWords()
    clearAllRecords() { return this.clearReviewRecordsOnly(); }

    /**
     * [缺陷23 v1.0.1 新增] 真正的恢复出厂：词库回到默认词 + customDate 清除
     * **注意**：todayTask 属于 TaskManager 管，清除 todayTask 请调用方（UIManager 按钮处理）额外执行 taskManager.clearTodayTask('full')
     */
    factoryResetKeepDefaultWords() {
        this.words = [];
        this.loadDefaultWords();  // loadDefaultWords 内部会 save 一次
        localStorage.removeItem(this.STORAGE_DATE_KEY);
        // ===== [v1.0.2 背诵日历] 恢复出厂时一并清空本地日历统计（属于派生数据）=====
        try { localStorage.removeItem('calendarStats'); } catch (e) { console.warn('[factoryReset]清 calendarStats 失败：', e); }
        return true;
    }

    setCustomDate(dateStr) {
        // ===== [缺陷20 v1.0.1] customDate 严格三层校验：null/''清 → 正则 YYYY-MM-DD → 实际日历存在性（防进位 2026-02-30→3月2日）=====
        if (dateStr === null || dateStr === undefined || dateStr === '') {
            localStorage.removeItem(this.STORAGE_DATE_KEY);
            return true;
        }
        if (typeof dateStr !== 'string') {
            console.warn('[setCustomDate] 非字符串类型，拒绝写入：', dateStr);
            return false;
        }
        // 兼容历史脏格式：斜杠 / → 横杠 -（比如 "2026/08/21" 是旧代码允许写入的脏数据）
        const normalized = dateStr.replace(/\//g, '-').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            console.warn('[setCustomDate] 非法日期格式（需要 YYYY-MM-DD），拒绝写入：', dateStr);
            return false;
        }
        // [v1.0.2 Bug2 时区修复] new Date(normalized + 'T00:00:00') 按本地时区解析，
        //   toISOString() 返回的是 UTC 时间 → 在 UTC+X 时区（如北京=UTC+8），
        //   '2026-08-23T00:00:00 本地' 会变成 '2026-08-22T16:00:00Z UTC' → split 后日期不一致，
        //   导致所有合法日期都被误判成「自动进位」的假日期。
        // 修复：用「本地年月日分别取 + 左补零」拼出本地字符串做比对，不要经过 UTC 转换。
        const d = new Date(normalized + 'T00:00:00');
        if (isNaN(d.getTime())) {
            console.warn('[setCustomDate] 日历中不存在此日期，拒绝写入：', normalized);
            return false;
        }
        const pad2 = n => (n < 10 ? '0' : '') + n;
        const localYMD = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
        const reParseOk = localYMD === normalized;
        if (!reParseOk) {
            // 例：2026-02-30 → new Date 进位到 2026-03-02 → localYMD 回拼不相等 → 这是假日期
            console.warn('[setCustomDate] 日期非法（自动进位），拒绝写入：', normalized, '→实际解析为：', localYMD);
            return false;
        }
        localStorage.setItem(this.STORAGE_DATE_KEY, normalized);
        return true;
    }

    getCustomDate() {
        return localStorage.getItem(this.STORAGE_DATE_KEY);
    }

    getTodayDate() {
        const customDate = this.getCustomDate();
        if (customDate) return customDate;
        // [v1.0.2 时区修复] 不要用 toISOString()（返回 UTC），要本地时区拼 YYYY-MM-DD
        const d = new Date();
        const pad2 = n => (n < 10 ? '0' : '') + n;
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    save() {
        // ===== [缺陷03 v1.0.1] localStorage 满时不静默失败，弹 alert 提示用户导出备份 =====
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.words));
            return true;
        } catch (e) {
            const isQuota = (e && e.name === 'QuotaExceededError') ||
                            (e && typeof e.message === 'string' && e.message.toLowerCase().indexOf('quota') !== -1) ||
                            (e && typeof e.message === 'string' && e.message.toLowerCase().indexOf('storage') !== -1);
            const msg = isQuota
                ? '❌ 浏览器存储空间已满！无法保存新的背诵记录。\n\n👉 请立即点击【💾 导出背诵备份】保存当前进度，然后清除浏览器缓存或换用更大存储空间的浏览器。'
                : '❌ 数据保存失败：' + (e && e.message ? e.message : '未知错误');
            if (typeof window !== 'undefined' && typeof alert === 'function') {
                try { alert(msg); } catch (_) {}
            }
            console.error('[WordBank.save] 失败（容量满或其他异常）：', e);
            return false;
        }
    }

    addWord(word) {
        if (this.hasWord(word.w)) {
            return false;
        }
        // ===== [缺陷21 v1.0.1] 添加前先做 schema 级校验（复用 SchemaRegistry），防 w/m 脏数据导致后续 JSON.parse 崩 =====
        // [v1.0.2 时区修复] 本地时区 YMD
        const todayD = new Date();
        const pad2 = n => (n < 10 ? '0' : '') + n;
        const todayStr = todayD.getFullYear() + '-' + pad2(todayD.getMonth() + 1) + '-' + pad2(todayD.getDate());
        let mStr = typeof word.m === 'string' ? word.m : '';
        if (typeof word.m !== 'string') {
            try { mStr = JSON.stringify(word.m || []); } catch (_) { mStr = '[]'; }
        }
        const candidate = {
            w: word.w || '',
            m: mStr,
            cAt: word.cAt || todayStr,
            r1D: '', r1R: '', r2D: '', r2R: '', r3D: '', r3R: '', r4D: '', r4R: '', r5D: '', r5R: '',
            r6D: '', r6R: '', r7D: '', r7R: '', r8D: '', r8R: '', r9D: '', r9R: '', r10D: '', r10R: ''
        };
        if (typeof SchemaRegistry !== 'undefined' && SchemaRegistry.schemas) {
            const sch = SchemaRegistry.schemas[SchemaRegistry.CURRENT_VERSION];
            if (sch && typeof sch.validateWord === 'function' && !sch.validateWord(candidate)) {
                console.error('[WordBank.addWord] schema 校验失败，拒绝添加：', candidate);
                return false;
            }
        }
        this.words.push(candidate);
        this.save();
        return true;
    }

    getWord(wordName) {
        return this.words.find(w => w.w.toLowerCase() === wordName.toLowerCase());
    }

    getAllWords() {
        return [...this.words];
    }

    hasWord(wordName) {
        return this.words.some(w => w.w.toLowerCase() === wordName.toLowerCase());
    }

    updateWord(word) {
        const index = this.words.findIndex(w => w.w === word.w);
        if (index !== -1) {
            this.words[index] = { ...word };
            this.save();
            return true;
        }
        return false;
    }

    getWordCount() {
        return this.words.length;
    }

    getUnreviewedWords() {
        return this.words.filter(w => {
            for (let i = 1; i <= 10; i++) {
                if (w[`r${i}D`]) return false;
            }
            return true;
        });
    }

    getReviewDueWords() {
        const today = this.getTodayDate();
        return this.words.filter(word => {
            // ===== [缺陷05 v1.0.1] 注入了 memoryCurve 就完全委托 canonical 算法（DRY 单一真相源，MC 版已经有 easeFactor 上下限）=====
            if (this.memoryCurve && typeof this.memoryCurve.isDueForReview === 'function') {
                try {
                    return this.memoryCurve.isDueForReview(word, today);
                } catch (e) {
                    console.warn('[getReviewDueWords] MC.isDueForReview 异常，兜底内联实现：', e);
                    // 异常时 fallback 到内联实现
                }
            }
            // ===== Fallback（兜底）：旧内联实现 + 补 easeFactor Math.min(2.5) 上限，避免 easeFactor 无限飙升的历史 bug =====
            const lastReviewIndex = this.getLastReviewIndex(word);
            if (lastReviewIndex === 0) return false;
            const lastDate = word[`r${lastReviewIndex}D`];
            if (!lastDate) return false;
            let easeFactor = 1.5;
            for (let i = 1; i <= lastReviewIndex; i++) {
                const result = word[`r${i}R`];
                if (result === '对') easeFactor += 0.1;
                else if (result === '错') easeFactor = Math.max(1.2, easeFactor - 0.2);
                else if (result === '不熟') easeFactor = Math.max(1.3, easeFactor - 0.1);
            }
            easeFactor = Math.min(2.5, easeFactor);
            const nextDays = Math.ceil(1 * Math.pow(easeFactor, lastReviewIndex - 1));
            const lastDateObj = new Date(lastDate + 'T00:00:00');
            const nextDateObj = new Date(lastDateObj);
            nextDateObj.setDate(nextDateObj.getDate() + nextDays);
            // [v1.0.2 时区修复] lastDateObj 是本地 0 点构造，setDate 后仍为本地，回拼必须本地 YMD
            const pad2_2 = n => (n < 10 ? '0' : '') + n;
            const nextDate = nextDateObj.getFullYear() + '-' + pad2_2(nextDateObj.getMonth() + 1) + '-' + pad2_2(nextDateObj.getDate());
            return nextDate <= today;
        });
    }

    getLastReviewIndex(word) {
        // ===== [缺陷16 v1.0.1] 注入了 memoryCurve 就委托 MC.canonical 实现（DRY 单一真相源，改一处全局生效）=====
        if (this.memoryCurve && typeof this.memoryCurve.getLastReviewIndex === 'function') {
            return this.memoryCurve.getLastReviewIndex(word);
        }
        // Fallback（兜底）：与 MC 实现逐行一致，保证外部没传 memoryCurve 时行为不变
        for (let i = 10; i >= 1; i--) {
            if (word[`r${i}D`]) return i;
        }
        return 0;
    }

    calculateEaseFactor(word) {
        // ===== [缺陷05 v1.0.1] 注入了 memoryCurve 就完全委托 canonical 算法（单一真相源）=====
        if (this.memoryCurve && typeof this.memoryCurve.getEaseFactor === 'function') {
            return this.memoryCurve.getEaseFactor(word);
        }
        // Fallback（兜底）：与 MC.getEaseFactor 逐行一致 + 加 max 2.5 上限
        let easeFactor = 1.5;
        for (let i = 1; i <= 10; i++) {
            if (word[`r${i}D`]) {
                const result = word[`r${i}R`];
                if (result === '对') easeFactor += 0.1;
                else if (result === '错') easeFactor = Math.max(1.2, easeFactor - 0.2);
                else if (result === '不熟') easeFactor = Math.max(1.3, easeFactor - 0.1);
            }
        }
        return Math.min(2.5, easeFactor);
    }

    getWordStats() {
        const total = this.words.length;
        const unreviewed = this.getUnreviewedWords().length;
        const reviewDue = this.getReviewDueWords().length;
        const mastered = this.words.filter(w => {
            const lastIndex = this.getLastReviewIndex(w);
            if (lastIndex < 3) return false;
            let consecutiveCorrect = 0;
            for (let i = lastIndex; i >= 1; i--) {
                if (w[`r${i}R`] === '对') {
                    consecutiveCorrect++;
                } else {
                    break;
                }
            }
            return consecutiveCorrect >= 3;
        }).length;
        
        return { total, unreviewed, reviewDue, mastered };
    }

    searchWords(query) {
        const lowerQuery = query.toLowerCase();
        return this.words.filter(w => w.w.toLowerCase().includes(lowerQuery));
    }

    // ===== 导入/导出备份（仅背诵数据：词库 + 自定义日期，不含 todayTask）=====

    /**
     * 导出完整备份所需的原始数据（仅背诵相关，不含当日任务）
     * 返回对象交给上层组装 JSON（加上版本号、内嵌格式说明等）
     */
    exportBackupData() {
        return {
            wordBank: this.words.map(w => ({ ...w })), // 浅拷贝一份防止外部修改内部
            customDate: localStorage.getItem(this.STORAGE_DATE_KEY) || null
        };
    }

    /**
     * 校验单个 WordObject 是否符合当前 schema
     * 优先调用 SchemaRegistry；若 SchemaRegistry 未加载则做最小校验
     */
    _validateWordObj(word) {
        if (typeof SchemaRegistry !== 'undefined' && SchemaRegistry.schemas) {
            const sch = SchemaRegistry.schemas[SchemaRegistry.CURRENT_VERSION];
            if (sch && typeof sch.validateWord === 'function') {
                return sch.validateWord(word);
            }
        }
        // Fallback：最小校验
        if (!word || typeof word !== 'object') return false;
        if (typeof word.w !== 'string' || word.w.length === 0) return false;
        if (typeof word.m !== 'string') return false;
        if (typeof word.cAt !== 'string') return false;
        for (let i = 1; i <= 10; i++) {
            if (typeof word[`r${i}D`] !== 'string') return false;
            if (typeof word[`r${i}R`] !== 'string') return false;
        }
        return true;
    }

    /**
     * 导入备份数据到 localStorage
     * @param {object} backupData - 结构 { wordBank: WordObject[], customDate: string|null }
     * @param {'overwrite'|'merge'} mergeMode - 覆盖/合并策略
     * @returns {{importedCount:number, updatedCount:number, invalidCount:number, totalAfter:number}}
     */
    importBackupData(backupData, mergeMode) {
        mergeMode = mergeMode === 'merge' ? 'merge' : 'overwrite';
        const wordBank = Array.isArray(backupData.wordBank) ? backupData.wordBank : [];
        const { customDate } = backupData;

        let importedCount = 0; // 新增
        let updatedCount = 0;  // 合并时因进度更高而替换
        let invalidCount = 0;  // 字段校验失败被跳过

        if (mergeMode === 'overwrite') {
            const validWords = [];
            wordBank.forEach(w => {
                if (this._validateWordObj(w)) {
                    validWords.push(w);
                    importedCount++;
                } else {
                    invalidCount++;
                }
            });
            this.words = validWords;
        } else {
            // 合并：以 w 小写为 key
            const existingMap = new Map(this.words.map(w => [w.w.toLowerCase(), w]));
            wordBank.forEach(impWord => {
                if (!this._validateWordObj(impWord)) {
                    invalidCount++;
                    return;
                }
                const key = impWord.w.toLowerCase();
                const existing = existingMap.get(key);
                if (!existing) {
                    this.words.push(impWord);
                    existingMap.set(key, impWord);
                    importedCount++;
                } else {
                    const impLast = this.getLastReviewIndex(impWord);
                    const exLast = this.getLastReviewIndex(existing);
                    if (impLast > exLast) {
                        const idx = this.words.findIndex(w => w.w.toLowerCase() === key);
                        if (idx !== -1) {
                            this.words[idx] = impWord;
                            existingMap.set(key, impWord);
                            updatedCount++;
                        }
                    }
                }
            });
        }
        this.save();

        // ===== [缺陷04 v1.0.1] customDate 三分法：undefined/null 清 | '' 保留空 | 合法 YYYY-MM-DD 才写 =====
        if (customDate === undefined || customDate === null) {
            // 备份完全没提供此字段 → 清除自定义日期（回到真实日期）
            localStorage.removeItem(this.STORAGE_DATE_KEY);
        } else if (customDate === '') {
            // 备份明确提供了空字符串 → 显式保留字段但值为空（语义：用户设置过「使用真实日期」）
            localStorage.setItem(this.STORAGE_DATE_KEY, '');
        } else if (typeof customDate === 'string') {
            // 调用 setCustomDate，复用它的三层校验 + 历史格式兼容（斜杠归一化）
            const ok = this.setCustomDate(customDate);
            if (!ok) console.warn('[importBackupData] customDate 非法，跳过写入：', customDate);
        } else {
            console.warn('[importBackupData] customDate 非字符串类型，跳过：', typeof customDate, customDate);
        }

        return {
            importedCount,
            updatedCount,
            invalidCount,
            totalAfter: this.words.length
        };
    }
}

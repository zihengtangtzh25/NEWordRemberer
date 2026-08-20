class WordBank {
    constructor() {
        this.STORAGE_KEY = 'wordBank';
        this.STORAGE_DATE_KEY = 'customDate';
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

    clearAllRecords() {
        this.words.forEach(word => {
            for (let i = 1; i <= 10; i++) {
                word[`r${i}D`] = '';
                word[`r${i}R`] = '';
            }
        });
        this.save();
        return true;
    }

    setCustomDate(dateStr) {
        localStorage.setItem(this.STORAGE_DATE_KEY, dateStr);
    }

    getCustomDate() {
        return localStorage.getItem(this.STORAGE_DATE_KEY);
    }

    getTodayDate() {
        const customDate = this.getCustomDate();
        return customDate || new Date().toISOString().split('T')[0];
    }

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.words));
    }

    addWord(word) {
        if (this.hasWord(word.w)) {
            return false;
        }
        const newWord = {
            w: word.w,
            m: word.m,
            cAt: word.cAt || new Date().toISOString().split('T')[0],
            r1D: '', r1R: '',
            r2D: '', r2R: '',
            r3D: '', r3R: '',
            r4D: '', r4R: '',
            r5D: '', r5R: '',
            r6D: '', r6R: '',
            r7D: '', r7R: '',
            r8D: '', r8R: '',
            r9D: '', r9R: '',
            r10D: '', r10R: ''
        };
        this.words.push(newWord);
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
            const lastReviewIndex = this.getLastReviewIndex(word);
            if (lastReviewIndex === 0) return false;
            
            const lastDate = word[`r${lastReviewIndex}D`];
            
            if (!lastDate) return false;
            
            let easeFactor = 1.5;
            for (let i = 1; i <= lastReviewIndex; i++) {
                const result = word[`r${i}R`];
                if (result === '对') {
                    easeFactor += 0.1;
                } else if (result === '错') {
                    easeFactor = Math.max(1.2, easeFactor - 0.2);
                } else if (result === '不熟') {
                    easeFactor = Math.max(1.3, easeFactor - 0.1);
                }
            }
            
            const nextDays = Math.ceil(1 * Math.pow(easeFactor, lastReviewIndex - 1));
            
            const lastDateObj = new Date(lastDate);
            const nextDateObj = new Date(lastDateObj);
            nextDateObj.setDate(nextDateObj.getDate() + nextDays);
            const nextDate = nextDateObj.toISOString().split('T')[0];
            
            return nextDate <= today;
        });
    }

    getLastReviewIndex(word) {
        for (let i = 10; i >= 1; i--) {
            if (word[`r${i}D`]) return i;
        }
        return 0;
    }

    calculateEaseFactor(word) {
        let easeFactor = 1.5;
        let reviewCount = 0;
        
        for (let i = 1; i <= 10; i++) {
            if (word[`r${i}D`]) {
                reviewCount++;
                const result = word[`r${i}R`];
                if (result === '对') {
                    easeFactor += 0.1;
                } else if (result === '错') {
                    easeFactor = Math.max(1.2, easeFactor - 0.2);
                } else if (result === '不熟') {
                    easeFactor = Math.max(1.3, easeFactor - 0.1);
                }
            }
        }
        
        return easeFactor;
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

        // customDate：备份中提供了就写入，没提供就清除（回到真实日期）
        if (customDate !== undefined && customDate !== null && customDate !== '') {
            localStorage.setItem(this.STORAGE_DATE_KEY, customDate);
        } else {
            localStorage.removeItem(this.STORAGE_DATE_KEY);
        }

        return {
            importedCount,
            updatedCount,
            invalidCount,
            totalAfter: this.words.length
        };
    }
}

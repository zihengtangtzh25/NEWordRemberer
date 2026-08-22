class TaskManager {
    constructor(wordBank, memoryCurve) {
        this.STORAGE_KEY = 'todayTask';
        this.wordBank = wordBank;
        this.memoryCurve = memoryCurve;
    }

    getTodayDate() {
        return this.wordBank.getTodayDate();
    }

    createTask(newCount, reviewCount) {
        const today = this.getTodayDate();
        const unreviewedWords = this.wordBank.getUnreviewedWords();
        const reviewDueWords = this.wordBank.getReviewDueWords();

        const shuffledUnreviewed = this.shuffleArray([...unreviewedWords]);
        // ===== [缺陷17 v1.0.1] 传 today 参数（与 Bug13 联动），保证 customDate 调试模式下 due 词排序口径与 isDueForReview 一致 =====
        // 之前 bug：不传第二个参数 → MC.getReviewPriority 内部 today=undefined → safeToday fallback 到真实今天
        const sortedReviewDue = [...reviewDueWords].sort((a, b) => {
            return this.memoryCurve.getReviewPriority(a, today) - this.memoryCurve.getReviewPriority(b, today);
        });
        
        const newTaskWords = shuffledUnreviewed.slice(0, newCount).map(w => w.w);
        const reviewTaskWords = sortedReviewDue.slice(0, reviewCount).map(w => w.w);
        
        const task = {
            date: today,
            newWords: newTaskWords,
            reviewWords: reviewTaskWords,
            completed: false,
            results: []
        };
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(task));
        return task;
    }

    getTodayTask() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) return null;
        
        const task = JSON.parse(stored);
        const today = this.getTodayDate();
        
        if (task.date !== today) {
            return null;
        }
        
        return task;
    }

    isTaskCreated() {
        const task = this.getTodayTask();
        return task !== null;
    }

    isTaskCompleted() {
        const task = this.getTodayTask();
        return task !== null && task.completed;
    }

    completeTask(results) {
        const task = this.getTodayTask();
        if (!task) return false;
        const today = this.getTodayDate();

        // ===== [缺陷06/18 v1.0.1] completeTask 重写：保证「每日一轮唯一性」+ 整体 try-catch + 一次集中 save（减少 N 次 IO）=====
        // 写库时序（歧义 2 保证）：先改所有词内存引用 → 清当日旧 rXR → 写新 rXR → 统一 save() → **最后**写 todayTask.completed=true
        let successCount = 0;
        let failCount = 0;
        try {
            results.forEach(result => {
                const word = this.wordBank.getWord(result.word);
                if (!word) { failCount++; return; }
                try {
                    // Step A：清当前词所有旧的今日轮次记录（保证每日最多一个轮次，缺陷 06 核心）
                    for (let i = 1; i <= 10; i++) {
                        if (word[`r${i}D`] === today) {
                            word[`r${i}D`] = '';
                            word[`r${i}R`] = '';
                        }
                    }
                    // Step B：写今日新轮次（getWord 返回的是 this.words 内部引用，直接改属性就生效）
                    const nextIndex = this.memoryCurve.getNextReviewIndex(word);
                    word[`r${nextIndex}D`] = today;
                    word[`r${nextIndex}R`] = result.result;
                    successCount++;
                } catch (innerErr) {
                    console.error('[completeTask] 单词写入失败：', result.word, innerErr);
                    failCount++;
                }
            });
        } catch (outerErr) {
            console.error('[completeTask] 外层流程异常：', outerErr);
            try { alert('❌ 写入词库时发生异常，请先导出备份后重试。\n详情：' + (outerErr && outerErr.message ? outerErr.message : outerErr)); } catch (_) {}
        }

        // ===== 集中只 save 一次词库（之前 N 词 N 次 updateWord→save，太浪费 IO，且容易中间崩）=====
        const saveOk = this.wordBank.save();

        // ===== 所有词写入词库完成后，再更新 todayTask 状态（**最后一步**：保证数据一致性，不会出现 todayTask 显示已完成但词库没成绩的情况）=====
        task.completed = true;
        task.results = results;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(task));

        if (failCount > 0 || saveOk === false) {
            try { alert(`⚠️ 本轮写入：${successCount} 成功 / ${failCount} 失败（详见 Console）。建议立即导出备份！`); } catch (_) {}
        }
        return true;
    }

    /**
     * [Bug 14 / 歧义 2 v1.0.1 配套] 清除今日任务
     * @param {'full'|'resultsOnly'} mode
     *   - full：彻底删除 todayTask（下次启动会提示"创建任务"）；用于导入备份后/恢复出厂
     *   - resultsOnly：保留新词/复习词数组，只清答题记录 results + completed=false；用于「重做今日计划」启动前
     */
    clearTodayTask(mode = 'full') {
        if (mode === 'resultsOnly') {
            const task = this.getTodayTask();
            if (!task) return false;
            task.completed = false;
            task.results = [];
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(task));
            return true;
        }
        localStorage.removeItem(this.STORAGE_KEY);
        return true;
    }

    saveTask(task) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(task));
    }

    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    getTaskStats() {
        const task = this.getTodayTask();
        if (!task) {
            return { newCount: 0, reviewCount: 0, completed: false, correctCount: 0, wrongCount: 0, unfamiliarCount: 0 };
        }
        
        const correctCount = task.results.filter(r => r.result === '对').length;
        const wrongCount = task.results.filter(r => r.result === '错').length;
        const unfamiliarCount = task.results.filter(r => r.result === '不熟').length;
        
        return {
            newCount: task.newWords.length,
            reviewCount: task.reviewWords.length,
            completed: task.completed,
            correctCount,
            wrongCount,
            unfamiliarCount
        };
    }

    getTaskWords() {
        const task = this.getTodayTask();
        if (!task) return [];
        
        const words = [];
        
        task.newWords.forEach(wordName => {
            const word = this.wordBank.getWord(wordName);
            if (word) {
                words.push({ ...word, type: 'new' });
            }
        });
        
        task.reviewWords.forEach(wordName => {
            const word = this.wordBank.getWord(wordName);
            if (word) {
                words.push({ ...word, type: 'review' });
            }
        });
        
        return this.shuffleArray(words);
    }
}

class UIManager {
    constructor(wordBank, memoryCurve, taskManager, statsCalendar) {
        this.wordBank = wordBank;
        this.memoryCurve = memoryCurve;
        this.taskManager = taskManager;
        // ===== [v1.0.2 背诵日历] 注入 StatsCalendar（可选注入，向后兼容老调用方）=====
        this.statsCalendar = statsCalendar || null;

        this.currentPage = 'home';
        this.reviewMode = 'cn_to_en';
        this.reviewIndex = 0;
        this.reviewWords = [];
        this.reviewResults = [];
        this.retryResults = [];      // 向后兼容保留（已 deprecated，主要靠 retryState）
        this.currentWord = null;
        this.options = [];
        this.isAnswered = false;
        this.isRetry = false;        // 向后兼容标记（已 deprecated，retryState.isRetry 为准）
        this.currentSearchWord = null;

        // ===== [B3 FINAL v1.0.1 + 跨模块铁则 6] 错题重测聚合状态：DEFAULT 定义唯一，打开流程时一次性 reset =====
        this.DEFAULT_RETRY_STATE = Object.freeze({
            isRetry: false,                        // 当前是否处于「三种模式之一」的错题重测中（歧义 3 紧急写库判定核心）
            currentMode: null,                     // 'chain' | 'first' | 'all' | null
            chainRounds: [],                       // 链式：每一轮 = {round, results:[{w,result}], endTime}（顺序推进，越靠后越新）
            firstResult: null,                     // 首次模式：null=未做过，否则 = {results, endTime}
            allResult: null,                       // 全部模式：null=未做过，否则 = {results, endTime}
        });
        this.retryState = { ...this.DEFAULT_RETRY_STATE };

        // ===== [v1.0.2 背诵日历 + 跨模块铁则 6] 日历状态聚合：一次性 reset =====
        (() => {
            const now = new Date();
            // 默认打开月 = 真实今天（customDate 不影响"真实世界日历"默认锚点，只影响写入落到哪一天）
            const y = now.getFullYear();
            const m = now.getMonth() + 1;
            const d = now.getDate();
            const pad = (n) => (n < 10 ? '0' : '') + n;
            const todayStr = `${y}-${pad(m)}-${pad(d)}`;
            this.DEFAULT_CAL_STATE = Object.freeze({
                curYear: y,
                curMonth: m,          // 1-12
                selDay: todayStr,     // YYYY-MM-DD，真实今天（点击月格 / 今天按钮更新）
                _justDidRedo: false   // redoTodayTask → finishReview 时标记 redoAll 计数
            });
            this.calState = { ...this.DEFAULT_CAL_STATE };
        })();

        // ===== 导入/导出备份相关 =====
        this._pendingImportText = '';   // 暂存的 JSON 文本（文件或粘贴）
        this._pendingImportParsed = null; // 解析后的对象
        this._pendingImportValid = false;  // 是否通过格式校验
        this._pendingForceHighVer = false; // 用户是否确认强制导入高版本
        this._pendingHighVerNeedConfirm = false;  // [缺陷 08] 声明字段（之前只用不声明）

        // 设置版本号徽章（以 SchemaRegistry 为准，确保 UI 与代码版本一致）
        try {
            if (typeof SchemaRegistry !== 'undefined' && SchemaRegistry.APP_VERSION) {
                const badge = document.getElementById('app-version-badge');
                if (badge) {
                    badge.textContent = 'v' + SchemaRegistry.APP_VERSION;
                    badge.title = '程序版本号 v' + SchemaRegistry.APP_VERSION + ' / 备份格式 v' + SchemaRegistry.CURRENT_VERSION;
                }
            }
        } catch (e) { /* noop */ }
    }

    showPage(pageName) {
        const pages = ['home', 'review', 'results', 'wordbank', 'calendar'];
        pages.forEach(page => {
            const el = document.getElementById(page + '-page');
            if (el) el.style.display = page === pageName ? 'block' : 'none';
        });
        this.currentPage = pageName;
        
        if (pageName === 'home') {
            this.renderHome();
        } else if (pageName === 'wordbank') {
            this.renderWordBank();
        } else if (pageName === 'review') {
            this.startReview();
        } else if (pageName === 'results') {
            this.renderResults();
        } else if (pageName === 'calendar') {
            this.renderCalendarPage();
        }
    }

    renderHome() {
        const stats = this.wordBank.getWordStats();
        document.getElementById('total-words').textContent = stats.total;
        document.getElementById('unreviewed-words').textContent = stats.unreviewed;
        document.getElementById('review-due-words').textContent = stats.reviewDue;
        
        const dateInput = document.getElementById('custom-date');
        const currentYear = new Date().getFullYear();
        const today = new Date();
        // [v1.0.2 时区修复] 本地时区 YMD，不要 toISOString()（UTC）
        const pad2 = n => (n < 10 ? '0' : '') + n;
        const todayStr = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());
        const customDate = this.wordBank.getCustomDate();
        
        dateInput.value = customDate || todayStr;
        dateInput.min = `${currentYear}-01-01`;
        dateInput.max = `${currentYear}-12-31`;
        
        const taskCreated = this.taskManager.isTaskCreated();
        const taskCompleted = this.taskManager.isTaskCompleted();
        
        const taskStatus = document.getElementById('task-status');
        const startBtn = document.getElementById('start-review-btn');
        const exportTaskBtn = document.getElementById('export-task-words-btn');
        const createTaskSection = document.getElementById('create-task-section');
        
        if (taskCreated && !taskCompleted) {
            taskStatus.textContent = '任务已创建';
            startBtn.style.display = 'inline-block';
            exportTaskBtn.style.display = 'inline-block';
            createTaskSection.style.display = 'none';
        } else if (taskCompleted) {
            taskStatus.textContent = '今日任务已完成';
            startBtn.style.display = 'none';
            exportTaskBtn.style.display = 'inline-block';
            createTaskSection.style.display = 'none';
        } else {
            taskStatus.textContent = '';
            startBtn.style.display = 'none';
            exportTaskBtn.style.display = 'none';
            createTaskSection.style.display = 'block';
        }
        
        document.getElementById('search-result').innerHTML = '';
        document.getElementById('add-word-form').style.display = 'none';
    }

    renderWordBank() {
        const words = this.wordBank.getAllWords();
        document.getElementById('wb-total').textContent = words.length;
        const list = document.getElementById('word-list');
        list.innerHTML = '';
        
        words.forEach(word => {
            const meanings = JSON.parse(word.m);
            const lastIndex = this.memoryCurve.getLastReviewIndex(word);
            const lastDate = lastIndex > 0 ? word[`r${lastIndex}D`] : '从未';
            const lastResult = lastIndex > 0 ? word[`r${lastIndex}R`] : '-';
            
            let meaningsHtml = '';
            meanings.forEach(m => {
                meaningsHtml += `<div class="meaning-item"><span class="pos">${m.p}</span> ${m.c.join('、')}</div>`;
            });
            
            const item = document.createElement('div');
            item.className = 'word-item';
            item.innerHTML = `
                <div class="word-name">${word.w}</div>
                <div class="word-meanings">${meaningsHtml}</div>
                <div class="word-meta">
                    <span>创建: ${word.cAt}</span>
                    <span>最新背诵: ${lastDate} (${lastResult})</span>
                </div>
            `;
            list.appendChild(item);
        });
    }

    startReview() {
        if (!this.isRetry) {
            this.reviewWords = this.taskManager.getTaskWords();
        }
        this.reviewIndex = 0;
        this.reviewResults = [];
        
        if (this.reviewWords.length === 0) {
            alert('今日没有任务可背诵');
            this.showPage('home');
            return;
        }
        
        this.renderReviewWord();
    }

    renderReviewWord() {
        if (this.reviewIndex >= this.reviewWords.length) {
            this.finishReview();
            return;
        }
        
        this.currentWord = this.reviewWords[this.reviewIndex];
        const progress = document.getElementById('review-progress');
        progress.textContent = `${this.reviewIndex + 1}/${this.reviewWords.length}`;
        
        document.getElementById('next-word-btn').style.display = 'none';
        document.getElementById('next-word-btn-en').style.display = 'none';
        
        const cnModeBtn = document.getElementById('cn-mode-btn');
        const enModeBtn = document.getElementById('en-mode-btn');
        
        if (this.reviewMode === 'cn_to_en') {
            cnModeBtn.classList.add('active');
            enModeBtn.classList.remove('active');
            this.renderCnToEn();
        } else {
            enModeBtn.classList.add('active');
            cnModeBtn.classList.remove('active');
            this.renderEnToCn();
        }
    }

    renderCnToEn() {
        const meanings = JSON.parse(this.currentWord.m);
        const allDefinitions = [];
        meanings.forEach(m => {
            m.c.forEach(def => {
                allDefinitions.push({ pos: m.p, def: def });
            });
        });
        
        const randomDef = allDefinitions[Math.floor(Math.random() * allDefinitions.length)];
        
        document.getElementById('cn-to-en-content').style.display = 'block';
        document.getElementById('en-to-cn-content').style.display = 'none';
        
        document.getElementById('cn-definition').textContent = randomDef.def;
        document.getElementById('cn-pos').textContent = randomDef.pos;
        
        const userInput = document.getElementById('user-input');
        userInput.value = '';
        userInput.disabled = false;
        document.getElementById('answer-feedback').innerHTML = '';
        document.getElementById('correct-answer').textContent = '';
        
        this.isAnswered = false;
        userInput.focus();
    }

    renderEnToCn() {
        document.getElementById('en-to-cn-content').style.display = 'block';
        document.getElementById('cn-to-en-content').style.display = 'none';
        
        document.getElementById('en-word').textContent = this.currentWord.w;
        
        const correctMeanings = JSON.parse(this.currentWord.m);
        const correctDefinitions = [];
        correctMeanings.forEach(m => {
            m.c.forEach(def => {
                correctDefinitions.push(def);
            });
        });
        
        this.options = this.generateOptions(correctDefinitions);
        
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';
        
        this.options.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = `${index + 1}. ${opt.text}`;
            btn.dataset.index = index;
            btn.onclick = () => this.selectOption(index);
            optionsContainer.appendChild(btn);
        });
        
        document.getElementById('en-answer-feedback').innerHTML = '';
        document.getElementById('en-correct-answer').textContent = '';
        
        this.isAnswered = false;
    }

    generateOptions(correctDefinitions) {
        const allWords = this.wordBank.getAllWords();
        const allDefinitions = [];
        
        allWords.forEach(word => {
            if (word.w !== this.currentWord.w) {
                const meanings = JSON.parse(word.m);
                meanings.forEach(m => {
                    m.c.forEach(def => {
                        if (!correctDefinitions.includes(def)) {
                            allDefinitions.push(def);
                        }
                    });
                });
            }
        });
        
        const shuffled = allDefinitions.sort(() => Math.random() - 0.5);
        const wrongOptions = shuffled.slice(0, 5);
        
        const correctOption = correctDefinitions[Math.floor(Math.random() * correctDefinitions.length)];
        const options = [{ text: correctOption, isCorrect: true }];
        
        wrongOptions.forEach(opt => {
            options.push({ text: opt, isCorrect: false });
        });
        
        return options.sort(() => Math.random() - 0.5);
    }

    checkAnswer() {
        if (this.isAnswered) return;
        
        const userInput = document.getElementById('user-input').value.trim().toLowerCase();
        const correctAnswer = this.currentWord.w.toLowerCase();
        
        let result = '错';
        if (userInput === correctAnswer) {
            result = '对';
        } else if (correctAnswer.startsWith(userInput) && userInput.length >= 2) {
            result = '不熟';
        }
        
        this.reviewResults.push({ word: this.currentWord.w, result: result, type: this.currentWord.type });
        
        const feedback = document.getElementById('answer-feedback');
        const correctDisplay = document.getElementById('correct-answer');
        
        if (result === '对') {
            feedback.innerHTML = '<span style="color: green;">✓ 回答正确！</span>';
        } else if (result === '不熟') {
            feedback.innerHTML = '<span style="color: orange;">~ 接近正确答案</span>';
        } else {
            feedback.innerHTML = '<span style="color: red;">✗ 回答错误</span>';
        }
        
        correctDisplay.textContent = `标准答案：${this.currentWord.w}`;
        
        document.getElementById('user-input').disabled = true;
        this.isAnswered = true;
        
        document.getElementById('next-word-btn').style.display = 'block';
    }

    selectOption(index) {
        if (this.isAnswered) return;

        const selected = this.options[index];

        let result = selected.isCorrect ? '对' : '错';
        if (!selected.isCorrect) {
            // m 字段 try-catch（联动缺陷 01 m 损坏不崩）
            let meanings;
            try { meanings = JSON.parse(this.currentWord.m); } catch (_) { meanings = []; }
            const correctDefinitions = meanings.flatMap(m => m.c || []);
            if (correctDefinitions.some(d => typeof d === 'string' && (d.includes(selected.text) || selected.text.includes(d)))) {
                result = '不熟';
            }
        }

        this.reviewResults.push({ word: this.currentWord.w, result: result, type: this.currentWord.type });

        const feedback = document.getElementById('en-answer-feedback');
        const correctDisplay = document.getElementById('en-correct-answer');
        let meanings;
        try { meanings = JSON.parse(this.currentWord.m); } catch (_) { meanings = []; }
        const correctDefinitions = meanings.flatMap(m => m.c || []);

        // ===== [Bug 09 + C1 v1.0.1] 三档分支（不熟=橙色，不再折叠进错），保留绿/橙/红体系，不引入新色 =====
        if (result === '对') {
            feedback.innerHTML = '<span style="color: green;">✓ 回答正确！</span>';
        } else if (result === '不熟') {
            feedback.innerHTML = '<span style="color: #ff9800;">~ 意思接近正确答案（不熟）</span>';
        } else {
            feedback.innerHTML = '<span style="color: red;">✗ 回答错误</span>';
        }

        correctDisplay.textContent = `标准答案：${correctDefinitions.join('、')}`;

        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach((btn, i) => {
            if (this.options[i] && this.options[i].isCorrect) {
                btn.style.backgroundColor = '#4CAF50';
                btn.style.color = 'white';
            } else if (result === '不熟' && i === index) {
                // [Bug 09] 用户选的是近义词 → 橙色高亮（正确选项仍然绿，不改动绿=正确的体系）
                btn.style.backgroundColor = '#ff9800';
                btn.style.color = 'white';
            } else if (i === index && this.options[i] && !this.options[i].isCorrect) {
                btn.style.backgroundColor = '#f44336';
                btn.style.color = 'white';
            }
            btn.disabled = true;
        });

        this.isAnswered = true;
        document.getElementById('next-word-btn-en').style.display = 'block';

        if (result === '对') {
            setTimeout(() => { this.nextWord(); }, 500);
        }
    }

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
            // [v1.0.3] 删除 0/8/9 判题后 500ms 自动跳下一题的延时：改为用户主动按 Enter 或点击"下一题"按钮跳题
            // 原因：用户反馈 0/8/9 判题后过早自动跳题，看不到反馈颜色 / 改判机会；与 selectAnswer（点选项）路径解耦
        } else {
            // ===== [Bug 10 v1.0.1] 改判操作：只刷新 UI + 覆盖最后一条记录结果，不自动跳题（用户手动 Enter/下一步才跳）=====
            const last = [...this.reviewResults].reverse().find(r => r.word === this.currentWord.w);
            if (last) last.result = result;
            this._refreshCurrentResultUI(result);
        }
    }

    nextWord() {
        this.reviewIndex++;
        this.renderReviewWord();
    }

    finishReview() {
        // ===== [Bug 12 + A5 ② v1.0.1] 三模式错题重测：绝不调用 completeTask，不写词库；结果存入 retryState.xxxResult =====
        if (this.retryState && this.retryState.isRetry) {
            const mode = this.retryState.currentMode;
            const freshCopy = JSON.parse(JSON.stringify(this.reviewResults || []));
            if (mode === 'chain') {
                this.retryState.chainRounds.push({
                    round: this.retryState.chainRounds.length + 1,
                    results: freshCopy,
                    endTime: Date.now()
                });
            } else if (mode === 'first') {
                this.retryState.firstResult = { results: freshCopy, endTime: Date.now() };
            } else if (mode === 'all') {
                this.retryState.allResult = { results: freshCopy, endTime: Date.now() };
            }
            // ===== [v1.0.2 背诵日历] 三模式错题重测完成 → retryCounts[mode] += 1（当日无主记录则静默丢弃，符合 §2.2 铁则）=====
            try {
                if (this.statsCalendar && mode) {
                    const t = this.wordBank && this.wordBank.getTodayDate ? this.wordBank.getTodayDate() : null;
                    if (t) this.statsCalendar.recordRetryCompletion(t, mode);
                }
            } catch (e) { console.warn('[日历] 三模式重试计数失败：', e); }

            // 退出 retry 状态标记（歧义 3 紧急写库判断依据）
            this.retryState.isRetry = false;
            this.retryState.currentMode = null;
            this.isRetry = false;   // 旧标记向后兼容
            this.showPage('results');
            return;
        }

        // ===== 首次背诵 / 重做今日计划：完整写库（completeTask 内部会保证每日一轮唯一性 + 最后写 todayTask）=====
        this.taskManager.completeTask(this.reviewResults);
        this.isRetry = false;

        // ===== [v1.0.2 背诵日历] 主会话写入：recordMainSession + 判断 redoAll 计数 =====
        try {
            if (this.statsCalendar) {
                const task = this.taskManager.getTodayTask();
                if (task) {
                    const today = task.date;
                    const isRedo = !!(this.calState && this.calState._justDidRedo);
                    const existed = !!this.statsCalendar.getDay(today);
                    this.statsCalendar.recordMainSession(today, task, this.reviewResults || []);
                    // redoAll 计数规则：① redoTodayTask 标记 ② 原本当日已有记录（用户二次/多次正常完整背完也算一次全部重开推进）
                    if (isRedo || existed) this.statsCalendar.recordRetryCompletion(today, 'redoAll');
                    if (this.calState) this.calState._justDidRedo = false;
                }
            }
        } catch (e) { console.warn('[日历] 主会话写入失败（不影响已保存的词库结果）：', e); }

        this.showPage('results');
    }

    renderResults() {
        const stats = this.taskManager.getTaskStats();
        const firstResults = this.taskManager.getTodayTask()?.results || [];
        
        document.getElementById('result-new-count').textContent = stats.newCount;
        document.getElementById('result-review-count').textContent = stats.reviewCount;
        
        const total = stats.newCount + stats.reviewCount;
        const correctPercent = total > 0 ? Math.round((stats.correctCount / total) * 100) : 0;
        document.getElementById('result-accuracy').textContent = `${correctPercent}%`;
        
        const resultsList = document.getElementById('results-list');
        resultsList.innerHTML = '';
        
        const firstWrongCount = firstResults.filter(r => r.result === '错').length;
        this.renderResultSection('首次背诵', firstResults, 'first');
        
        for (let i = 0; i < this.retryResults.length; i++) {
            const retryRound = this.retryResults[i];
            const wrongCount = retryRound.filter(r => r.result === '错').length;
            this.renderResultSection(`错题重开 ${i + 1}`, retryRound, `retry-${i + 1}`);
        }
        
        const lastWrongResults = this.retryResults.length > 0 
            ? this.retryResults[this.retryResults.length - 1].filter(r => r.result === '错')
            : firstResults.filter(r => r.result === '错');
            
        const retryBtn = document.getElementById('retry-wrong-btn');
        if (lastWrongResults.length > 0) {
            retryBtn.style.display = 'inline-block';
            retryBtn.textContent = `继续错题重开 (${lastWrongResults.length}个)`;
        } else {
            retryBtn.style.display = 'none';
        }
        
        const retryFirstBtn = document.getElementById('retry-first-btn');
        if (firstWrongCount > 0) {
            retryFirstBtn.style.display = 'inline-block';
            retryFirstBtn.textContent = `首次错题重测 (${firstWrongCount}个)`;
        } else {
            retryFirstBtn.style.display = 'none';
        }
        
        const reDoBtn = document.getElementById('redo-today-btn');
        if (this.taskManager.isTaskCompleted()) {
            reDoBtn.style.display = 'inline-block';
        } else {
            reDoBtn.style.display = 'none';
        }
    }

    renderResultSection(title, results, sectionClass) {
        const resultsList = document.getElementById('results-list');

        const section = document.createElement('div');
        section.className = `result-section ${sectionClass}`;

        const titleRow = document.createElement('div');
        titleRow.className = 'result-section-title';

        const correctCount = results.filter(r => r.result === '对').length;
        const wrongCount = results.filter(r => r.result === '错').length;
        const unfamiliarCount = results.filter(r => r.result === '不熟').length;

        // ===== [缺陷 02 v1.0.1] XSS 防护：全部 DOM API + textContent，不用 innerHTML 插 w/m =====
        const titleStrong = document.createElement('strong');
        titleStrong.textContent = title;
        titleRow.appendChild(titleStrong);
        titleRow.appendChild(document.createTextNode(
            ` (对: ${correctCount} | 不熟: ${unfamiliarCount} | 错: ${wrongCount})`
        ));
        section.appendChild(titleRow);

        const list = document.createElement('div');
        list.className = 'result-items';

        results.forEach(result => {
            const word = this.wordBank.getWord(result.word);
            if (!word) return;
            // m 字段 try-catch（缺陷 01 联动，m 损坏不降崩）
            let meanings = [];
            try { meanings = JSON.parse(word.m); } catch (_) { meanings = []; }
            const definitions = meanings.flatMap(m => Array.isArray(m.c) ? m.c : []).join('、');

            const item = document.createElement('div');
            item.className = `result-item ${result.result}`;

            const wordDiv = document.createElement('div');
            wordDiv.className = 'result-word';
            wordDiv.textContent = result.word;
            item.appendChild(wordDiv);

            const defDiv = document.createElement('div');
            defDiv.className = 'result-definition';
            defDiv.textContent = definitions;
            item.appendChild(defDiv);

            const tagDiv = document.createElement('div');
            tagDiv.className = `result-tag ${result.type}`;
            tagDiv.textContent = result.type === 'new' ? '新单词' : '复习';
            item.appendChild(tagDiv);

            const stDiv = document.createElement('div');
            stDiv.className = `result-status ${result.result}`;
            stDiv.textContent = result.result;
            item.appendChild(stDiv);

            list.appendChild(item);
        });

        section.appendChild(list);
        resultsList.appendChild(section);
    }

    /**
     * [B3 FINAL v1.0.1 统一入口] 错题重测三模式：chain 链式 / first 首轮错题 / all 今日全部错题（去重）
     * 绝不写词库（A5 ②）；isRetry=true 标记（歧义 3 紧急写库跳过）
     */
    retryWrongByMode(mode) {
        const task = this.taskManager.getTodayTask();
        if (!task || !task.results || task.results.length === 0) {
            this.showSettingsStatus('请先完成今日首次背诵，才有错题可以重测');
            return;
        }
        let source = [];
        let sourceLabel = '';
        mode = (mode === 'first' || mode === 'all') ? mode : 'chain';

        if (mode === 'chain') {
            const lastChain = (this.retryState.chainRounds.length > 0)
                ? this.retryState.chainRounds[this.retryState.chainRounds.length - 1] : null;
            source = lastChain ? lastChain.results : task.results;
            sourceLabel = lastChain ? `链式第 ${this.retryState.chainRounds.length} 轮错题` : '首轮（链式）错题';
        } else if (mode === 'first') {
            source = task.results;
            sourceLabel = '首轮全部错题（首次重测）';
        } else {
            const set = new Set();
            task.results.filter(r => r.result !== '对').forEach(r => set.add(r.word));
            this.retryState.chainRounds.forEach(cr => {
                cr.results.filter(r => r.result !== '对').forEach(r => set.add(r.word));
            });
            if (this.retryState.firstResult) {
                this.retryState.firstResult.results.filter(r => r.result !== '对').forEach(r => set.add(r.word));
            }
            source = Array.from(set).map(w => ({ word: w, result: '错', type: 'review' }));
            sourceLabel = '今日全部答错/不熟的词（去重）';
        }

        const wrongSet = new Set();
        source.forEach(r => {
            if (r && r.result !== '对' && typeof r.word === 'string') wrongSet.add(r.word);
        });
        const wrongWords = Array.from(wrongSet);
        if (wrongWords.length === 0) {
            this.showSettingsStatus(`太棒了！${sourceLabel}没有错题！`);
            return;
        }

        this.retryState.isRetry = true;
        this.retryState.currentMode = mode;
        this.isRetry = true;

        const reviewList = [];
        wrongWords.forEach(wn => {
            const w = this.wordBank.getWord(wn);
            if (w) reviewList.push({ ...w, type: w.type || 'review' });
        });
        this.reviewWords = reviewList;
        this.reviewIndex = 0;
        this.reviewResults = [];
        this.showSettingsStatus(`已加载 ${reviewList.length} 题：${sourceLabel}`);
        this.showPage('review');
    }

    // 向后兼容（旧事件绑定调这两函数 → 转发统一入口）
    retryWrong() {
        const sel = document.getElementById('retry-mode-select');
        this.retryWrongByMode(sel ? sel.value : 'chain');
    }
    retryFirstWrong() { this.retryWrongByMode('first'); }

    redoTodayTask() {
        if (!confirm('确定要重新背诵今日计划吗？\n\n⚠️ 中途答题记录先清空，做完一轮后原子覆盖原词库记录（歧义 2 规则）')) {
            return;
        }
        const task = this.taskManager.getTodayTask();
        if (!task) { alert('今日任务不存在，请先创建任务'); return; }
        // [歧义 2 / Bug 11] Step 1：todayTask.resultsOnly 清空 + completed=false
        this.taskManager.clearTodayTask('resultsOnly');

        // ===== [v1.0.2 背诵日历] 标记本次 completeTask 属于「全部重开」—— 用于 finishReview 记录 retryCounts.redoAll =====
        if (this.calState) this.calState._justDidRedo = true;

        const allWords = [];
        task.newWords.forEach(wordName => {
            const word = this.wordBank.getWord(wordName);
            if (word) allWords.push({ ...word, type: 'new' });
        });
        task.reviewWords.forEach(wordName => {
            const word = this.wordBank.getWord(wordName);
            if (word) allWords.push({ ...word, type: 'review' });
        });
        this.reviewWords = allWords.sort(() => Math.random() - 0.5);
        this.reviewIndex = 0;
        this.reviewResults = [];
        this.retryResults = [];
        // [跨模块铁则 6] retryState 一次性重置 DEFAULT（保证 isRetry=false，首次背诵语义→紧急写库会生效）
        this.retryState = { ...this.DEFAULT_RETRY_STATE };
        this.isRetry = false;

        this.showSettingsStatus('已重置答题记录，开始重新背诵');
        this.showPage('review');
    }

    // ====================================================================
    // 导出 / 导入 背诵备份（SchemaRegistry 版本兼容 + 双模式导入）
    // ====================================================================

    /**
     * 触发浏览器下载一个文本/JSON Blob
     */
    _downloadBlob(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType || 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * 生成 YYYYMMDD_HHMMSS 格式的本地时间戳（用于文件名）
     */
    _localTimestamp() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    /**
     * 设置 io-status 消息（首页导入/导出区域的提示）
     */
    _setIoStatus(html, color) {
        const el = document.getElementById('io-status');
        if (!el) return;
        el.innerHTML = html || '';
        el.style.color = color || '#555';
    }

    /**
     * 导出背诵备份（仅词库 + customDate，不含今日任务）
     * 仅输出 JSON 备份文件（MD 格式说明作为项目静态文件存在，不随每次导出下载）
     */
    exportBackup() {
        try {
            if (typeof SchemaRegistry === 'undefined') {
                alert('SchemaRegistry 未加载，无法导出备份');
                return;
            }

            const raw = this.wordBank.exportBackupData();
            const wordCount = Array.isArray(raw.wordBank) ? raw.wordBank.length : 0;
            const reviewedCount = Array.isArray(raw.wordBank)
                ? raw.wordBank.filter(w => this.wordBank.getLastReviewIndex(w) > 0).length
                : 0;
            const stats = { wordCount, reviewedCount };
            const exportedAt = new Date().toISOString();

            const backupObj = {
                format: SchemaRegistry.FORMAT_IDENTIFIER,
                formatVersion: SchemaRegistry.CURRENT_VERSION,
                appVersion: SchemaRegistry.APP_VERSION,
                appName: "NEWordRemberer",
                exportedAt: exportedAt,
                exportedFromFormat: SchemaRegistry.generateEmbeddedFormatDoc(),
                data: raw,
                stats: stats
            };

            const jsonStr = JSON.stringify(backupObj, null, 2);
            const fileName = `NEWordRemberer_备份_${this._localTimestamp()}.json`;

            this._downloadBlob(jsonStr, fileName, 'application/json');

            const customDateHint = raw.customDate
                ? `；自定义日期：${raw.customDate}`
                : `；自定义日期：未设置（使用真实日期）`;

            this._setIoStatus(
                `✅ 已导出备份文件到浏览器<b>默认下载目录</b>：<br>` +
                `&nbsp;&nbsp;📄 <code>${fileName}</code>（${wordCount} 个单词，其中 ${reviewedCount} 个已开始复习${customDateHint}）<br>` +
                `👉 查看下载：Chrome/Edge 按 <b>Ctrl+J</b>，或点浏览器右上角菜单 → 下载内容。`,
                '#2E7D32'
            );

        } catch (err) {
            console.error(err);
            this._setIoStatus('❌ 导出失败：' + (err && err.message ? err.message : err), '#C62828');
        }
    }

    // -------- 导入弹窗 --------

    showImportDialog() {
        // 每次打开先重置所有导入相关状态（包括「高版本警告」状态，避免上次残留）
        this._pendingImportText = '';
        this._pendingImportParsed = null;
        this._pendingImportValid = false;
        this._pendingForceHighVer = false;
        // ===== [缺陷 08 v1.0.1] 必须重置，否则上次高版本被取消后，再打开合法低版本文件仍然显示高版本警告 =====
        this._pendingHighVerNeedConfirm = false;
        document.getElementById('paste-json-area').value = '';
        document.getElementById('picked-file-name').textContent = '未选择文件';
        document.getElementById('backup-file-input').value = '';
        this._setImportInfo('', '#555');
        document.getElementById('import-confirm-btn').disabled = true;
        this._switchImportTab('tab-file');
        document.getElementById('import-modal').style.display = 'flex';
    }

    _closeImportDialog() {
        document.getElementById('import-modal').style.display = 'none';
    }

    _switchImportTab(tabId) {
        document.querySelectorAll('.import-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(el => {
            el.style.display = (el.id === tabId) ? 'block' : 'none';
        });
    }

    _setImportInfo(html, color) {
        const el = document.getElementById('import-info');
        if (!el) return;
        el.innerHTML = html || '';
        el.style.color = color || '#555';
        el.style.background = color === '#C62828' ? '#FFEBEE'
            : color === '#2E7D32' ? '#E8F5E9'
            : color === '#E65100' ? '#FFF3E0'
            : '#f9f9f9';
    }

    _handleFilePick(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        document.getElementById('picked-file-name').textContent = `已选择：${file.name}（${(file.size / 1024).toFixed(1)} KB）`;
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = String(evt.target.result || '');
            this._validateAndShowInfo(text);
        };
        reader.onerror = () => {
            this._setImportInfo('❌ 读取文件失败，请尝试使用「粘贴 JSON 文本」方式。', '#C62828');
        };
        reader.readAsText(file, 'utf-8');
    }

    /**
     * 核心校验：解析 JSON → 检查 format → 检查版本 → 统计展示
     */
    _validateAndShowInfo(text) {
        this._pendingImportText = String(text || '');
        this._pendingImportParsed = null;
        this._pendingImportValid = false;
        this._pendingForceHighVer = false;
        document.getElementById('import-confirm-btn').disabled = true;

        if (!this._pendingImportText.trim()) {
            this._setImportInfo('请选择 JSON 文件，或将 JSON 内容粘贴到文本框中。', '#555');
            return;
        }

        // Step 1: JSON 解析
        let obj;
        try {
            obj = JSON.parse(this._pendingImportText);
        } catch (e) {
            this._setImportInfo(
                '❌ <b>JSON 格式损坏</b>，解析失败：<br>' +
                '&nbsp;&nbsp;' + String(e.message || e) + '<br>' +
                '请检查：是否完整复制了 .json 文件的全部内容？文件下载时是否中断？',
                '#C62828'
            );
            return;
        }

        // Step 2: 检查 format 标识（排除「今日单词表 / 背诵结果」等旧导出格式）
        if (!obj || !obj.format || obj.format !== SchemaRegistry.FORMAT_IDENTIFIER) {
            this._setImportInfo(
                '❌ <b>这不是 NEWordRemberer 完整备份文件。</b><br>' +
                '检测到缺少 <code>format = "' + SchemaRegistry.FORMAT_IDENTIFIER + '"</code> 字段。<br>' +
                '可能的原因：您导入的是「<b>导出今日单词表</b>」或「<b>导出今日结果</b>」生成的 JSON，<br>' +
                '那两类是供人阅读的摘要文件，<b>不能用于恢复完整背诵记录</b>。<br>' +
                '请使用首页系统设置区 → <b>💾 导出背诵备份</b> 功能生成的文件。',
                '#C62828'
            );
            return;
        }

        const ver = String(obj.formatVersion || '0.0.0');
        const cmp = SchemaRegistry.compareVersion(ver, SchemaRegistry.CURRENT_VERSION);

        // Step 3: 版本判断
        let verInfoHtml = '';
        let verInfoColor = '#2E7D32';
        let highVerConfirmNeeded = false;

        const majorCur = SchemaRegistry.CURRENT_VERSION.split('.')[0];
        const majorImp = ver.split('.')[0];

        if (majorImp < majorCur || cmp < 0) {
            // 备份格式版本 < 当前程序版本
            verInfoHtml = `⚠️ <b>备份格式版本较低 (v${ver})</b>；当前程序支持 v${SchemaRegistry.CURRENT_VERSION}，将按当前格式字段尝试兼容导入，字段缺失的单词会被跳过。`;
            verInfoColor = '#E65100';
        } else if (cmp === 0) {
            // 版本完全一致
            verInfoHtml = `✅ <b>格式版本 v${ver}</b>，与当前程序完全兼容（主版本号相同）。`;
            verInfoColor = '#2E7D32';
        } else {
            // 备份格式 > 当前程序（高版本备份导入到低版本程序）
            highVerConfirmNeeded = true;
            verInfoHtml = `⚠️ <b>此备份由更高版本导出 (v${ver})</b>，当前程序版本为 v${SchemaRegistry.CURRENT_VERSION}。<br>` +
                `低版本程序<b>可能无法识别高版本的新增字段</b>，导致部分信息丢失。<br>` +
                `若确认继续，将在下一步提示您二次确认。`;
            verInfoColor = '#C62828';
        }

        // Step 4: 统计
        const data = obj.data || {};
        const wordCount = Array.isArray(data.wordBank) ? data.wordBank.length : 0;
        const reviewedCount = Array.isArray(data.wordBank)
            ? data.wordBank.filter(w => {
                for (let i = 10; i >= 1; i--) if (w && w[`r${i}D`]) return true;
                return false;
            }).length
            : 0;
        const hasCustomDate = data.customDate ? `（自定义日期：${data.customDate}）` : '（自定义日期：未设置）';
        const exportTime = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString() : '未知';
        const appVer = obj.appVersion ? obj.appVersion : '未知';

        this._pendingImportParsed = obj;
        this._pendingImportValid = true;
        document.getElementById('import-confirm-btn').disabled = false;

        this._setImportInfo(
            `${verInfoHtml}<hr style="border:none;border-top:1px dashed #ddd;margin:10px 0;">` +
            `📊 备份概况：<br>` +
            `&nbsp;&nbsp;• 导出时间：${exportTime}<br>` +
            `&nbsp;&nbsp;• 导出时程序版本：v${appVer}<br>` +
            `&nbsp;&nbsp;• 词库单词数：<b>${wordCount}</b> 个<br>` +
            `&nbsp;&nbsp;• 已开始复习的单词：<b>${reviewedCount}</b> 个<br>` +
            `&nbsp;&nbsp;• customDate ${hasCustomDate}`,
            verInfoColor
        );

        // 高版本需要用户确认（存在这个标记，在 _doImport 时会再次 confirm）
        this._pendingHighVerNeedConfirm = highVerConfirmNeeded;
    }

    /**
     * 最终执行导入：选策略 → 二次确认 → 调用 WordBank.importBackupData
     */
    _doImport() {
        if (!this._pendingImportValid || !this._pendingImportParsed) {
            this._setImportInfo('❌ 数据尚未通过校验，请先选择文件或粘贴正确的 JSON。', '#C62828');
            return;
        }

        // (1) 高版本备份 → 强制二次确认
        if (this._pendingHighVerNeedConfirm && !this._pendingForceHighVer) {
            const ok = confirm(
                '⚠️ 高版本备份警告\n\n' +
                '此备份由更高版本程序导出（v' + (this._pendingImportParsed.formatVersion || '?') + '），\n' +
                '当前程序版本 v' + SchemaRegistry.APP_VERSION + ' 可能无法识别新增字段。\n\n' +
                '继续导入可能丢失高版本的部分信息。\n\n' +
                '是否确认继续导入？'
            );
            if (!ok) return;
            this._pendingForceHighVer = true;
        }

        // (2) 策略选择
        const strategyMsg =
            '请选择导入策略：\n\n' +
            '【确定】= 覆盖模式 (overwrite)\n' +
            '       清空当前词库，写入备份中的词库 + 自定义日期。\n' +
            '       适用于：换设备、恢复完整备份。\n\n' +
            '【取消】= 合并模式 (merge)\n' +
            '       同单词保留「复习轮次更高」的记录，不同单词直接追加。\n' +
            '       适用于：多设备进度合并。';
        const isOverwrite = confirm(strategyMsg);
        const mergeMode = isOverwrite ? 'overwrite' : 'merge';

        // (3) 覆盖模式：再次警告 + 备份提醒
        if (isOverwrite) {
            const really = confirm(
                '⚠️ 最后确认：覆盖当前数据？\n\n' +
                '覆盖将：\n' +
                '  ① 清空当前所有背诵记录（词库 + 复习进度）\n' +
                '  ② 写入备份中的全部单词及其复习记录\n' +
                '  ③ customDate 也会被备份中的值覆盖\n\n' +
                '❗此操作不可恢复！\n\n' +
                '👉 强烈建议先点击【取消】→ 先点【💾 导出背诵备份】保存当前数据，再导入。\n\n' +
                '确认仍然覆盖？'
            );
            if (!really) return;
        }

        // (4) 执行导入
        try {
            const data = this._pendingImportParsed.data || {};
            const r = this.wordBank.importBackupData(data, mergeMode);
            const modeText = mergeMode === 'overwrite' ? '覆盖模式' : '合并模式';

            let summary = `✅ 导入完成（${modeText}）：<br>`;
            summary += `&nbsp;&nbsp;• 新增单词：<b>${r.importedCount}</b> 个<br>`;
            if (mergeMode === 'merge') {
                summary += `&nbsp;&nbsp;• 合并时因复习进度更高被替换：<b>${r.updatedCount}</b> 个<br>`;
            }
            if (r.invalidCount > 0) {
                summary += `&nbsp;&nbsp;• 字段不完整被跳过：<b style="color:#C62828;">${r.invalidCount}</b> 个<br>`;
            }
            summary += `&nbsp;&nbsp;• 当前词库总数：<b>${r.totalAfter}</b> 个`;

            this._closeImportDialog();
            this._setIoStatus(summary, '#2E7D32');
            this.renderHome(); // 刷新首页统计

        } catch (err) {
            console.error(err);
            this._setImportInfo('❌ 导入失败：' + (err && err.message ? err.message : err), '#C62828');
        }
    }

    exportTaskWords() {
        const task = this.taskManager.getTodayTask();
        if (!task) {
            alert('今日任务不存在，请先创建任务');
            return;
        }
        
        const today = this.wordBank.getTodayDate();
        const exportData = {
            date: today,
            newWords: task.newWords.map(wordName => {
                const word = this.wordBank.getWord(wordName);
                const meanings = word ? JSON.parse(word.m) : [];
                return {
                    word: wordName,
                    definitions: meanings.flatMap(m => m.c).join('、'),
                    pos: meanings.map(m => m.p).join(', ')
                };
            }),
            reviewWords: task.reviewWords.map(wordName => {
                const word = this.wordBank.getWord(wordName);
                const meanings = word ? JSON.parse(word.m) : [];
                return {
                    word: wordName,
                    definitions: meanings.flatMap(m => m.c).join('、'),
                    pos: meanings.map(m => m.p).join(', ')
                };
            })
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `今日单词表_${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    exportResults() {
        const task = this.taskManager.getTodayTask();
        if (!task || !task.results || task.results.length === 0) {
            alert('今日没有背诵记录可导出');
            return;
        }
        
        const today = this.wordBank.getTodayDate();
        const exportData = {
            date: today,
            totalWords: task.results.length,
            newWords: task.newWords.length,
            reviewWords: task.reviewWords.length,
            results: task.results.map(r => {
                const word = this.wordBank.getWord(r.word);
                const meanings = word ? JSON.parse(word.m) : [];
                return {
                    word: r.word,
                    result: r.result,
                    type: r.type,
                    definitions: meanings.flatMap(m => m.c).join('、')
                };
            }),
            retryResults: this.retryResults.map((round, idx) => ({
                round: idx + 1,
                results: round.map(r => ({
                    word: r.word,
                    result: r.result
                }))
            }))
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `背诵结果_${today}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    searchWord() {
        const query = document.getElementById('search-input').value.trim();
        const resultDiv = document.getElementById('search-result');
        
        if (!query) {
            resultDiv.innerHTML = '';
            document.getElementById('add-word-form').style.display = 'none';
            return;
        }
        
        this.currentSearchWord = query;
        const word = this.wordBank.getWord(query);
        
        if (word) {
            const meanings = JSON.parse(word.m);
            let meaningsHtml = '';
            meanings.forEach(m => {
                meaningsHtml += `<div><strong>${m.p}</strong>: ${m.c.join('、')}</div>`;
            });
            
            resultDiv.innerHTML = `
                <div class="search-result-item">
                    <h3>${word.w}</h3>
                    <div class="meanings">${meaningsHtml}</div>
                    <div class="meta">创建时间: ${word.cAt}</div>
                </div>
                <div style="margin-top: 10px; color: #4CAF50; font-size: 14px;">💡 可在此添加新的词性和释义</div>
            `;
        } else {
            resultDiv.innerHTML = '<div class="no-result">暂无此单词，可在此添加</div>';
        }
        
        document.getElementById('add-word-form').style.display = 'block';
        document.getElementById('new-word-name').value = query;
    }

    addWord() {
        const wordName = document.getElementById('new-word-name').value.trim();
        const pos = document.getElementById('new-word-pos').value.trim();
        const definitions = document.getElementById('new-word-definitions').value.trim();
        
        if (!wordName || !pos || !definitions) {
            alert('请填写完整信息');
            return;
        }
        
        const defArray = definitions.split(/[,，、]/).map(d => d.trim()).filter(d => d);
        
        const existingWord = this.wordBank.getWord(wordName);
        
        if (existingWord) {
            const existingMeanings = JSON.parse(existingWord.m);
            let foundPos = false;
            
            existingMeanings.forEach(m => {
                if (m.p === pos) {
                    foundPos = true;
                    defArray.forEach(def => {
                        if (!m.c.includes(def)) {
                            m.c.push(def);
                        }
                    });
                }
            });
            
            if (!foundPos) {
                existingMeanings.push({ p: pos, c: defArray });
            }
            
            existingWord.m = JSON.stringify(existingMeanings);
            this.wordBank.updateWord(existingWord);
            alert('释义添加成功！');
        } else {
            const meanings = [{ p: pos, c: defArray }];
            this.wordBank.addWord({
                w: wordName,
                m: JSON.stringify(meanings)
            });
            alert('单词添加成功！');
        }
        
        document.getElementById('add-word-form').reset();
        document.getElementById('add-word-form').style.display = 'none';
        document.getElementById('search-input').value = '';
        document.getElementById('search-result').innerHTML = '';
        this.renderHome();
    }

    createTask() {
        const newCount = parseInt(document.getElementById('new-count').value) || 0;
        const reviewCount = parseInt(document.getElementById('review-count').value) || 0;
        
        if (newCount <= 0 && reviewCount <= 0) {
            alert('请输入有效的背诵或复习数量');
            return;
        }
        
        this.taskManager.createTask(newCount, reviewCount);
        this.renderHome();
        
        alert('今日任务已创建！');
    }

    setCustomDate() {
        const dateInput = document.getElementById('custom-date');
        const dateStr = dateInput.value;

        if (!dateStr) {
            alert('请选择日期');
            return;
        }

        // ===== [Bug2 v1.0.2] 切换日期前：
        //   1) 若今日任务进行中（背了一半就切日期）→ 先 completeTask 保存已答过的到旧日期
        //   2) 删除旧 todayTask（因为 todayTask.date 是旧日期，跨日期应该重建新计划） =====
        const oldTask = this.taskManager.getTodayTask();
        if (oldTask && !oldTask.completed) {
            try {
                // 今日非错题重测 + reviewResults 有内容 → 紧急保存到旧日期
                const isRetry = (this.retryState && this.retryState.isRetry) || this.isRetry;
                const haveResults = Array.isArray(this.reviewResults) && this.reviewResults.length > 0;
                if (!isRetry && haveResults) {
                    this.taskManager.completeTask(this.reviewResults);
                    console.log('[setCustomDate] 切换日期前已保存 ' + this.reviewResults.length + ' 题成绩到旧日期');
                }
            } catch (e) {
                console.warn('[setCustomDate] 保存旧日期成绩失败：', e);
            }
        }
        // 无论旧任务是已完成 / 进行中，全部删除旧 todayTask（跨日期不能继承）
        this.taskManager.clearTodayTask('full');
        // 清理背诵进行中的内存状态（切日期=结束当前背诵）
        this.reviewResults = [];
        this.retryResults = [];
        this.retryState = { ...this.DEFAULT_RETRY_STATE };
        this.isRetry = false;
        this.reviewIndex = 0;
        this.currentWord = null;
        this.isAnswered = false;

        // ===== [Bug2 v1.0.2] 执行写入，并区分成功/失败
        //   - 失败时不要渲染 renderHome（否则 renderHome 里会把 customDate 的老值回写到 <input>，造成"自动跳回"）=====
        const ok = this.wordBank.setCustomDate(dateStr);
        if (!ok) {
            // 设置失败：保持用户在 <input> 里输入的值，显示红色错误提示
            const st = document.getElementById('settings-status');
            if (st) {
                st.textContent = '❌ 日期设置失败：格式应为 YYYY-MM-DD，且必须是真实存在的日期（如 2026-02-30 无效）';
                st.style.color = '#f44336';
                setTimeout(() => {
                    st.textContent = '';
                    st.style.color = '';
                }, 5000);
            }
            return;   // 不调用 renderHome，不让老 customDate 把用户输入的新值覆盖掉
        }

        this.showSettingsStatus('✅ 日期已切换为：' + dateStr + '；旧日期进度已保存，旧计划已清除，请在下方重新创建新日期计划');
        // renderHome 内部会用最新 customDate 刷新 dateInput.value，同步到正确的新日期
        this.renderHome();
    }

    clearRecords() {
        if (!confirm('确定要清除所有背诵记录吗？此操作不可恢复！')) {
            return;
        }
        
        this.wordBank.clearAllRecords();
        this.showSettingsStatus('所有背诵记录已清除');
        this.renderHome();
    }

    showSettingsStatus(message) {
        const status = document.getElementById('settings-status');
        if (!status) return;
        // [v1.0.2 Bug2] 统一回到默认绿色，防止前一次报错用了红色后残留到下一条成功消息
        status.style.color = '#4CAF50';
        status.textContent = message;
        setTimeout(() => {
            status.textContent = '';
            status.style.color = '';
        }, 3000);
    }

    bindEvents() {
        document.getElementById('search-btn').addEventListener('click', () => this.searchWord());
        document.getElementById('search-input').addEventListener('keyup', (e) => {
            if (e.key === 'Enter') this.searchWord();
        });
        
        document.getElementById('add-word-btn').addEventListener('click', () => this.addWord());
        
        document.getElementById('create-task-btn').addEventListener('click', () => this.createTask());
        
        document.getElementById('start-review-btn').addEventListener('click', () => this.showPage('review'));
        
        document.getElementById('cn-mode-btn').addEventListener('click', () => {
            this.reviewMode = 'cn_to_en';
            this.renderReviewWord();
        });
        
        document.getElementById('en-mode-btn').addEventListener('click', () => {
            this.reviewMode = 'en_to_cn';
            this.renderReviewWord();
        });
        
        document.getElementById('submit-answer-btn').addEventListener('click', () => {
            this.checkAnswer();
        });
        
        document.getElementById('next-word-btn').addEventListener('click', () => {
            this.nextWord();
        });
        
        document.getElementById('next-word-btn-en').addEventListener('click', () => {
            this.nextWord();
        });
        
        document.getElementById('btn-correct').addEventListener('click', () => this.setResult('对'));
        document.getElementById('btn-unfamiliar').addEventListener('click', () => this.setResult('不熟'));
        document.getElementById('btn-wrong').addEventListener('click', () => this.setResult('错'));
        
        document.getElementById('home-nav').addEventListener('click', () => this.showPage('home'));
        document.getElementById('wordbank-nav').addEventListener('click', () => this.showPage('wordbank'));
        document.getElementById('results-nav').addEventListener('click', () => {
            if (this.taskManager.isTaskCompleted()) {
                this.showPage('results');
            } else {
                alert('请先完成今日背诵任务');
            }
        });
        // ===== [v1.0.2 背诵日历] 日历导航 + 月切换按钮 + 今天按钮 =====
        const calNav = document.getElementById('calendar-nav');
        if (calNav) calNav.addEventListener('click', () => this.showPage('calendar'));
        const prevBtn = document.getElementById('cal-prev-month');
        if (prevBtn) prevBtn.addEventListener('click', () => this._calShiftMonth(-1));
        const nextBtn = document.getElementById('cal-next-month');
        if (nextBtn) nextBtn.addEventListener('click', () => this._calShiftMonth(1));
        const todayBtn = document.getElementById('cal-today-btn');
        if (todayBtn) todayBtn.addEventListener('click', () => {
            const now = new Date();
            const pad = n => (n < 10 ? '0' : '') + n;
            this.calState.curYear = now.getFullYear();
            this.calState.curMonth = now.getMonth() + 1;
            this.calState.selDay = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
            const title = document.getElementById('cal-month-title');
            if (title) title.textContent = `📅 ${this.calState.curYear} 年 ${this.calState.curMonth} 月`;
            this.renderCalendarMonth(this.calState.curYear, this.calState.curMonth);
            this.renderDayDetail(this.calState.selDay);
            this.renderCalendarMonthSummary(this.calState.curYear, this.calState.curMonth);
        });
        
        document.getElementById('back-home-btn').addEventListener('click', () => this.showPage('home'));
        document.getElementById('view-wordbank-btn').addEventListener('click', () => this.showPage('wordbank'));
        document.getElementById('retry-wrong-btn').addEventListener('click', () => this.retryWrong());
        document.getElementById('retry-first-btn').addEventListener('click', () => this.retryFirstWrong());
        document.getElementById('redo-today-btn').addEventListener('click', () => this.redoTodayTask());
        document.getElementById('export-results-btn').addEventListener('click', () => this.exportResults());
        document.getElementById('export-task-words-btn').addEventListener('click', () => this.exportTaskWords());
        
        document.getElementById('set-date-btn').addEventListener('click', () => this.setCustomDate());
        document.getElementById('clear-records-btn').addEventListener('click', () => this.clearRecords());

        // ===== 导入/导出背诵备份 =====
        document.getElementById('export-backup-btn').addEventListener('click', () => this.exportBackup());
        document.getElementById('import-backup-btn').addEventListener('click', () => this.showImportDialog());
        document.getElementById('import-cancel-btn').addEventListener('click', () => this._closeImportDialog());
        document.getElementById('import-confirm-btn').addEventListener('click', () => this._doImport());
        document.getElementById('pick-file-btn').addEventListener('click', () => document.getElementById('backup-file-input').click());
        document.getElementById('backup-file-input').addEventListener('change', (e) => this._handleFilePick(e));
        document.getElementById('paste-json-area').addEventListener('input', (e) => this._validateAndShowInfo(e.target.value));
        // Tab 切换
        document.querySelectorAll('.import-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this._switchImportTab(btn.dataset.tab));
        });
        // 点击弹窗外部关闭
        document.getElementById('import-modal').addEventListener('click', (e) => {
            if (e.target && e.target.id === 'import-modal') {
                this._closeImportDialog();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (this.currentPage !== 'review') return;

            const active = document.activeElement;
            // ===== [Bug1 v1.0.2] 背诵页快捷键规则重新梳理：
            //  0/8/9 判题键：在背诵页任何 DOM 节点（包括 input 聚焦）都要生效 —— 这是用户"口头判题"的主交互
            //  Enter 提交：在 input 聚焦时也生效（提交答案 / 已答题下一题）
            //  1~6 英译中选项：仅非 input 聚焦时生效，避免 input 里输入数字被判题
            //  非背诵页的 input（自定义日期、搜索框、导入粘贴）已在上面 L1328 `this.currentPage !== 'review'` 挡掉了 =====
            const inReviewEditable = (() => {
                if (!active) return false;
                const tag = (active.tagName || '').toLowerCase();
                if (tag !== 'input' && tag !== 'textarea' && !active.isContentEditable) return false;
                // 只把"背诵页内"的可编辑元素当这里的判定对象（目前只有 user-input 一个）
                if (tag === 'input' && active.id === 'user-input') return true;
                if (active.isContentEditable) return true;
                return false;
            })();

            // 背诵页 input 聚焦时，只拦截 1~6（英译中选选项号），放行 Enter/0/8/9
            if (inReviewEditable && this.reviewMode === 'en_to_cn' && !this.isAnswered && e.key >= '1' && e.key <= '6') {
                return;  // input 里按数字 1-6 不触英译中选选项，防打字误判
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.isAnswered) {
                    this.nextWord();
                } else if (this.reviewMode === 'cn_to_en') {
                    this.checkAnswer();
                }
            } else if (this.reviewMode === 'en_to_cn' && !this.isAnswered && e.key >= '1' && e.key <= '6') {
                e.preventDefault();
                const index = parseInt(e.key) - 1;
                if (index < this.options.length) {
                    this.selectOption(index);
                }
            } else if (e.key === '0') {
                e.preventDefault();
                this.setResult('对');
            } else if (e.key === '8') {
                e.preventDefault();
                this.setResult('不熟');
            } else if (e.key === '9') {
                e.preventDefault();
                this.setResult('错');
            }
        });
    }

    // ====================================================================
    // [v1.0.1 新增工具方法] XSS 安全 / 状态管理 / 模态弹窗 / 紧急写库
    // ====================================================================

    /**
     * [XSS 安全 helper v1.0.1] 把用户输入做 HTML 转义后再插入 DOM（用于 _setIoStatus / _setImportInfo 中动态变量安全插入）
     */
    _escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /**
     * [歧义 3 / B4 规则 4 v1.0.1] beforeunload 紧急写库：
     *   - 首次背诵进行中（isRetry=false + todayTask.completed=false + reviewResults.length>0）→ 立即 completeTask
     *   - 错题重测（retryState.isRetry=true / isRetry=true）→ skip，接受从头再来
     */
    _emergencySaveBeforeUnload() {
        if (this.retryState && this.retryState.isRetry) {
            console.log('[紧急写库] skip：当前处于错题重测流程（链式/首次/全部），接受从头再来，不写库');
            return;
        }
        if (this.isRetry) {   // 向后兼容（旧标记）
            console.log('[紧急写库] skip：旧 isRetry=true，不写库');
            return;
        }
        const inFirst = (this.currentPage === 'review' || this.currentPage === 'results')
            && Array.isArray(this.reviewResults) && this.reviewResults.length > 0
            && !this.taskManager.isTaskCompleted();
        if (inFirst) {
            try {
                this.taskManager.completeTask(this.reviewResults);
                console.log('[紧急写库] success：首次背诵进行中，已写入 ' + this.reviewResults.length + ' 题成绩到词库');

                // ===== [v1.0.2 背诵日历] 紧急写库成功 → 同步写入当日日历主数据（与 finishReview 主分支一致）=====
                try {
                    if (this.statsCalendar) {
                        const task = this.taskManager.getTodayTask();
                        if (task) {
                            const today = task.date;
                            const existed = !!this.statsCalendar.getDay(today);
                            this.statsCalendar.recordMainSession(today, task, this.reviewResults || []);
                            if (existed) this.statsCalendar.recordRetryCompletion(today, 'redoAll');
                        }
                    }
                } catch (ce) { console.warn('[紧急写库→日历] 写入失败：', ce); }

            } catch (e) {
                console.error('[紧急写库] 词库写入失败：', e);
            }
        }
    }

    /**
     * [Bug 10 v1.0.1] 改判后（0/8/9 键 / checkAnswer / selectOption 三处都要调）同步刷新「反馈区颜色 + 按钮高亮」
     *   - 保证数据和视图严格一致，不会出现「词库最终写对了，但 UI 仍然红着显示错」
     */
    _refreshCurrentResultUI(result) {
        if (!this.currentWord) return;
        // ===== 当前模式：中译英 =====
        if (this.reviewMode === 'cn_to_en') {
            const feedback = document.getElementById('answer-feedback');
            if (feedback) {
                if (result === '对')       feedback.innerHTML = '<span style="color:green;">✓ 回答正确！</span>';
                else if (result === '不熟') feedback.innerHTML = '<span style="color:#ff9800;">~ 意思接近正确答案（不熟）</span>';
                else                       feedback.innerHTML = '<span style="color:red;">✗ 回答错误</span>';
            }
            // 三档设置按钮高亮（改判时要亮对应颜色）
            const mapping = { '对': 'btn-correct', '不熟': 'btn-unfamiliar', '错': 'btn-wrong' };
            ['btn-correct','btn-unfamiliar','btn-wrong'].forEach(id => {
                const b = document.getElementById(id);
                if (!b) return;
                b.style.fontWeight = (id === mapping[result]) ? 'bold' : 'normal';
                b.style.outline  = (id === mapping[result]) ? '2px solid #333' : 'none';
            });
        }
        // ===== 当前模式：英译中 =====
        else if (this.reviewMode === 'en_to_cn') {
            const feedback = document.getElementById('en-answer-feedback');
            if (feedback) {
                if (result === '对')       feedback.innerHTML = '<span style="color:green;">✓ 回答正确！</span>';
                else if (result === '不熟') feedback.innerHTML = '<span style="color:#ff9800;">~ 意思接近正确答案（不熟）</span>';
                else                       feedback.innerHTML = '<span style="color:red;">✗ 回答错误</span>';
            }
            // 按钮高亮：正确选项=绿；用户选的=橙/红（根据 result 和选项正确性判断）
            const buttons = document.querySelectorAll('.option-btn');
            buttons.forEach((btn, i) => {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                if (this.options[i] && this.options[i].isCorrect) {
                    btn.style.backgroundColor = '#4CAF50';
                    btn.style.color = 'white';
                }
            });
            // 找到当前 result 和当时选择的是哪个按钮（在 reviewResults 里找最后一条本词记录）
            const last = [...this.reviewResults].reverse().find(r => r.word === this.currentWord.w);
            if (!last) return;
            // 英译中改判后：根据结果决定是否要把某个选项标橙/红（目前只负责反馈区颜色；按钮逻辑复杂，用户主要看反馈区即可）
        }
    }

    // ====================================================================
    // [v1.0.2 背诵日历] 日历渲染 + 导航切换
    // ====================================================================

    renderCalendarPage() {
        // 懒重建：如果 todayTask.completed=true 但 statsCalendar 当日没数据（比如紧急写库 crash 了但 completeTask 存了，
        // 或者 beforeunload 中 statsCalendar 写失败），这里补一次
        try { this._calLazyBackfill(); } catch (e) { console.warn('[日历懒重建] 失败：', e); }

        const y = this.calState.curYear;
        const m = this.calState.curMonth;
        // 月标题
        const title = document.getElementById('cal-month-title');
        if (title) title.textContent = `📅 ${y} 年 ${m} 月`;

        this.renderCalendarMonth(y, m);
        this.renderDayDetail(this.calState.selDay);
        this.renderCalendarMonthSummary(y, m);
    }

    /**
     * 懒重建：紧急写库 + 页面打开时兜底。
     * 原则：只在"任务已完成（todayTask.completed=true）+ 当日 stats 为空"时才从 todayTask 回填一次，
     *       避免覆盖用户后来重做今日计划写入的 stats（因为 stats 永远比 todayTask.results 新：redo 完成后 both 都更新）。
     */
    _calLazyBackfill() {
        if (!this.statsCalendar) return;
        const task = this.taskManager.getTodayTask();
        if (!task || !task.completed || !Array.isArray(task.results) || task.results.length === 0) return;
        const day = this.statsCalendar.getDay(task.date);
        if (day) return; // 已有，不覆盖
        // 当日无记录 → 从 todayTask.results 重建
        this.statsCalendar.recordMainSession(task.date, task, task.results);
    }

    /**
     * 月切换：delta = ±1
     */
    _calShiftMonth(delta) {
        let y = this.calState.curYear;
        let m = this.calState.curMonth + delta;
        if (m < 1) { m = 12; y--; }
        else if (m > 12) { m = 1; y++; }
        this.calState.curYear = y;
        this.calState.curMonth = m;
        const title = document.getElementById('cal-month-title');
        if (title) title.textContent = `📅 ${y} 年 ${m} 月`;
        this.renderCalendarMonth(y, m);
        this.renderCalendarMonthSummary(y, m);
    }

    /**
     * 月视图渲染：生成 42 个日格（6 周 × 7 列）
     * - 每格结构：右上角日期号 + 中央色点 + 底部 answeredCount（≥768px 显示）
     * - 今日加圈；点击选中 → 刷新日详情面板
     */
    renderCalendarMonth(year, month /* 1-12 */) {
        const grid = document.getElementById('cal-grid');
        if (!grid) return;
        while (grid.firstChild) grid.removeChild(grid.firstChild);

        // 真实今天的 dateStr（用本地时区拼，不用 UTC，与用户手机/日历一致）
        const now = new Date();
        const pad = n => (n < 10 ? '0' : '') + n;
        const realToday = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        // 该月 1 号在周几（0=周日 ... 6=周六），用本地时区的 weekday，不 UTC
        const firstWeekday = new Date(year, month - 1, 1).getDay();
        // 该月最后一天
        const lastDay = new Date(year, month, 0).getDate();
        // 上月最后一天（填充前置空格用）
        const prevLastDay = new Date(year, month - 1, 0).getDate();

        // 生成 42 格数组：[{ y, m, d, dateStr, inMonth: bool }]
        const cells = [];
        // 前置：上月末尾
        for (let i = firstWeekday - 1; i >= 0; i--) {
            const d = prevLastDay - i;
            const py = month === 1 ? year - 1 : year;
            const pm = month === 1 ? 12 : month - 1;
            cells.push({ y: py, m: pm, d, inMonth: false, dateStr: `${py}-${pad(pm)}-${pad(d)}` });
        }
        // 当前月
        for (let d = 1; d <= lastDay; d++) {
            cells.push({ y: year, m: month, d, inMonth: true, dateStr: `${year}-${pad(month)}-${pad(d)}` });
        }
        // 后置：下月开头（补到 42 格）
        let nd = 1;
        while (cells.length < 42) {
            const ny = month === 12 ? year + 1 : year;
            const nm = month === 12 ? 1 : month + 1;
            cells.push({ y: ny, m: nm, d: nd, inMonth: false, dateStr: `${ny}-${pad(nm)}-${pad(nd)}` });
            nd++;
        }

        const sc = this.statsCalendar;
        cells.forEach(cell => {
            const div = document.createElement('div');
            div.className = 'cal-cell';
            if (!cell.inMonth) div.classList.add('out-of-month');
            if (cell.dateStr === realToday) div.classList.add('today');
            if (cell.dateStr === this.calState.selDay) div.classList.add('selected');

            // 日期数字（右上）
            const dn = document.createElement('div');
            dn.className = 'cal-date-num';
            dn.textContent = String(cell.d);
            div.appendChild(dn);

            // 色点（中央）+ 底部数字
            let dayData = null;
            try { dayData = sc ? sc.getDay(cell.dateStr) : null; } catch (e) { dayData = null; }
            if (dayData && dayData.answeredCount > 0) {
                div.classList.add('has-data');
                // 色点（day.accuracy 内部是 0~1 小数，颜色档和 changelog 描述一致）
                const dot = document.createElement('div');
                dot.className = 'cal-dot';
                dot.style.backgroundColor = this._calAccColor(dayData.accuracy);
                div.appendChild(dot);

                // 底部小字：answeredCount
                const btm = document.createElement('div');
                btm.className = 'cal-cell-bottom';
                btm.textContent = String(dayData.answeredCount);
                div.appendChild(btm);
            } else {
                // 空格占位，保证每格高度一致
                const place = document.createElement('div');
                place.className = 'cal-dot';
                place.style.visibility = 'hidden';
                div.appendChild(place);
                const btm = document.createElement('div');
                btm.className = 'cal-cell-bottom';
                btm.innerHTML = '&nbsp;';
                div.appendChild(btm);
            }

            // 点击
            div.addEventListener('click', () => {
                // 若点击了跨月数字 → 跳到那个月
                if (!cell.inMonth) {
                    this.calState.curYear = cell.y;
                    this.calState.curMonth = cell.m;
                    // 重新渲染月表和月标题
                    const title = document.getElementById('cal-month-title');
                    if (title) title.textContent = `📅 ${cell.y} 年 ${cell.m} 月`;
                    this.renderCalendarMonth(cell.y, cell.m);
                    this.renderCalendarMonthSummary(cell.y, cell.m);
                }
                this.calState.selDay = cell.dateStr;
                // 更新 selected 样式：清所有 .selected + 给本次加
                const allCells = grid.querySelectorAll('.cal-cell');
                allCells.forEach(c => c.classList.remove('selected'));
                div.classList.add('selected');
                this.renderDayDetail(cell.dateStr);
            });

            grid.appendChild(div);
        });
    }

    /**
     * 正确率颜色：输入为 0~1 小数（内部 storage 语义），这里 ×100 再按 6 档分色
     */
    _calAccColor(acc01) {
        const pct = Number(acc01) || 0;
        if (pct <= 0) return '#e0e0e0';      // 0 题 → 灰
        const p = pct * 100;
        if (p < 40) return '#9c27b0';        // < 40% 紫
        if (p < 60) return '#f44336';        // 40-60% 红
        if (p < 80) return '#ff9800';        // 60-80% 橙
        if (p < 95) return '#4CAF50';        // 80-95% 绿
        return '#2E7D32';                     // ≥95% 深绿
    }

    _fmtLocal(tsMs) {
        if (!tsMs) return '—';
        const d = new Date(tsMs);
        const pad = n => (n < 10 ? '0' : '') + n;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    _weekdayName(weekday /* 0..6 */) {
        return ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][weekday] || '';
    }

    renderDayDetail(dateStr /* YYYY-MM-DD */) {
        const title = document.getElementById('cal-day-title');
        const body = document.getElementById('cal-day-body');
        if (!title || !body) return;

        const y = Number(dateStr.slice(0,4));
        const m = Number(dateStr.slice(5,7));
        const d = Number(dateStr.slice(8,10));
        const wd = new Date(y, m-1, d).getDay();
        title.textContent = `📆 ${y} 年 ${m} 月 ${d} 日  ${this._weekdayName(wd)}`;

        while (body.firstChild) body.removeChild(body.firstChild);

        const sc = this.statsCalendar;
        let day = null;
        try { day = sc ? sc.getDay(dateStr) : null; } catch (e) { day = null; }

        if (!day) {
            // 空态文案
            const p = document.createElement('p');
            p.className = 'cal-day-empty';
            p.textContent = '当日未完成一次完整的首次背诵或重做今日计划 📝（错题重测为练习模式，不计入日历主记录）';
            body.appendChild(p);
            return;
        }

        // ===== ① 当日统计块 =====
        const h4a = document.createElement('h4');
        h4a.style.margin = '8px 0 12px 0';
        h4a.textContent = '📊 当日统计';
        body.appendChild(h4a);

        const line1 = document.createElement('div');
        line1.className = 'cal-stat-line';
        line1.appendChild(this._statChip('新词', day.newCount));
        line1.appendChild(this._statChip('复习词', day.reviewCount));
        line1.appendChild(this._statChip('共计', day.totalCount));
        body.appendChild(line1);

        const line2 = document.createElement('div');
        line2.className = 'cal-stat-line';
        line2.appendChild(this._statChip('✅ 对', day.correctCount, '#4CAF50'));
        line2.appendChild(this._statChip('🔶 不熟', day.unfamiliarCount, '#ff9800'));
        line2.appendChild(this._statChip('❌ 错', day.wrongCount, '#f44336'));
        // 额外显示各自百分比（按 answeredCount）
        const answered = Math.max(1, day.answeredCount);
        const accPctDisplay = (Number(day.accuracy) || 0) * 100;
        line2.appendChild(this._statChip(
            '正确率',
            `${accPctDisplay.toFixed(1)}%`,
            this._calAccColor(day.accuracy)
        ));
        body.appendChild(line2);

        // 正确率进度条（0~100%，内部 accuracy 0~1）
        const accWrap = document.createElement('div');
        accWrap.className = 'acc-bar';
        const accFill = document.createElement('div');
        accFill.className = 'acc-bar-fill';
        accFill.style.width = `${Math.max(0, Math.min(100, accPctDisplay))}%`;
        accFill.style.backgroundColor = this._calAccColor(day.accuracy);
        accWrap.appendChild(accFill);
        body.appendChild(accWrap);

        // ===== ② 重开记录块 =====
        const h4b = document.createElement('h4');
        h4b.style.margin = '20px 0 12px 0';
        h4b.textContent = '🔁 重开记录';
        body.appendChild(h4b);

        const retryLine = document.createElement('div');
        retryLine.className = 'cal-stat-line';
        const rc = day.retryCounts || {};
        retryLine.appendChild(this._statChip('重新背诵今日计划（全部重开）', rc.redoAll || 0, '#2196F3'));
        retryLine.appendChild(this._statChip('错题·链式重测', rc.chain || 0));
        retryLine.appendChild(this._statChip('错题·首次错题', rc.first || 0));
        retryLine.appendChild(this._statChip('错题·今日全部错题', rc.all || 0));
        body.appendChild(retryLine);

        // ===== ③ 最后更新 =====
        const up = document.createElement('div');
        up.className = 'cal-updated';
        up.textContent = `🕐 最后更新：${this._fmtLocal(day.updatedAt)}`;
        body.appendChild(up);
    }

    _statChip(label, value, accentColor) {
        const el = document.createElement('div');
        el.className = 'stat-chip';
        if (accentColor) el.style.borderLeftColor = accentColor;
        const lab = document.createElement('div');
        lab.className = 'stat-chip-label';
        lab.textContent = label;
        const val = document.createElement('div');
        val.className = 'stat-chip-value';
        val.textContent = String(value);
        if (accentColor) val.style.color = accentColor;
        el.appendChild(lab); el.appendChild(val);
        return el;
    }

    renderCalendarMonthSummary(year, month) {
        const grid = document.getElementById('cal-summary-grid');
        if (!grid) return;
        while (grid.firstChild) grid.removeChild(grid.firstChild);

        let s = { daysInMonth: 0, daysStudied: 0, totalNew: 0, totalReview: 0, totalAnswered: 0,
                  avgAccuracy: 0, longestStreak: 0, streakUntilToday: 0 };
        try { if (this.statsCalendar) s = this.statsCalendar.getMonthSummary(year, month) || s; }
        catch (e) { console.warn('[getMonthSummary] fail：', e); }

        const avgAccDisplay = (Number(s.avgAccuracy) || 0) * 100;
        const items = [
            ['本月天数', `${s.daysInMonth} 天`],
            ['学习天数', `${s.daysStudied} 天`],
            ['累计新词', `${s.totalNew || 0} 词`],
            ['累计复习词', `${s.totalReview || 0} 词`],
            ['月平均正确率', `${avgAccDisplay.toFixed(1)}%`, this._calAccColor(s.avgAccuracy)],
            ['本月最长连续打卡', `${s.longestStreak || 0} 天`, '#ff9800'],
            ['截至今天连续打卡', `${s.streakUntilToday || 0} 天`, '#2196F3'],
            ['累计答题', `${s.totalAnswered || 0} 题`]
        ];
        items.forEach(triple => {
            const [label, value, color] = triple;
            grid.appendChild(this._statChip(label, value, color));
        });
    }
}

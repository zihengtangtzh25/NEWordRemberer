class UIManager {
    constructor(wordBank, memoryCurve, taskManager) {
        this.wordBank = wordBank;
        this.memoryCurve = memoryCurve;
        this.taskManager = taskManager;
        this.currentPage = 'home';
        this.reviewMode = 'cn_to_en';
        this.reviewIndex = 0;
        this.reviewWords = [];
        this.reviewResults = [];
        this.retryResults = [];
        this.currentWord = null;
        this.options = [];
        this.isAnswered = false;
        this.isRetry = false;
        this.currentSearchWord = null;
        this.retryRound = 0;

        // ===== 导入/导出备份相关 =====
        this._pendingImportText = '';   // 暂存的 JSON 文本（文件或粘贴）
        this._pendingImportParsed = null; // 解析后的对象
        this._pendingImportValid = false;  // 是否通过格式校验
        this._pendingForceHighVer = false; // 用户是否确认强制导入高版本

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
        const pages = ['home', 'review', 'results', 'wordbank'];
        pages.forEach(page => {
            document.getElementById(page + '-page').style.display = page === pageName ? 'block' : 'none';
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
        const todayStr = today.toISOString().split('T')[0];
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
            const correctDefinitions = JSON.parse(this.currentWord.m).flatMap(m => m.c);
            if (correctDefinitions.some(d => d.includes(selected.text) || selected.text.includes(d))) {
                result = '不熟';
            }
        }
        
        this.reviewResults.push({ word: this.currentWord.w, result: result, type: this.currentWord.type });
        
        const feedback = document.getElementById('en-answer-feedback');
        const correctDisplay = document.getElementById('en-correct-answer');
        
        const correctDefinitions = JSON.parse(this.currentWord.m).flatMap(m => m.c);
        
        if (result === '对') {
            feedback.innerHTML = '<span style="color: green;">✓ 回答正确！</span>';
        } else {
            feedback.innerHTML = '<span style="color: red;">✗ 回答错误</span>';
        }
        
        correctDisplay.textContent = `标准答案：${correctDefinitions.join('、')}`;
        
        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach((btn, i) => {
            if (this.options[i].isCorrect) {
                btn.style.backgroundColor = '#4CAF50';
                btn.style.color = 'white';
            } else if (i === index && !this.options[i].isCorrect) {
                btn.style.backgroundColor = '#f44336';
                btn.style.color = 'white';
            }
            btn.disabled = true;
        });
        
        this.isAnswered = true;
        document.getElementById('next-word-btn-en').style.display = 'block';
        
        if (result === '对') {
            setTimeout(() => {
                this.nextWord();
            }, 500);
        }
    }

    setResult(result) {
        if (this.reviewResults.length === 0) {
            this.reviewResults.push({ word: this.currentWord.w, result: result, type: this.currentWord.type });
        } else {
            const lastResult = this.reviewResults[this.reviewResults.length - 1];
            if (lastResult && lastResult.word === this.currentWord.w) {
                lastResult.result = result;
            } else {
                this.reviewResults.push({ word: this.currentWord.w, result: result, type: this.currentWord.type });
            }
        }
        
        this.nextWord();
    }

    nextWord() {
        this.reviewIndex++;
        this.renderReviewWord();
    }

    finishReview() {
        if (!this.isRetry) {
            this.taskManager.completeTask(this.reviewResults);
        } else {
            this.retryResults.push([...this.reviewResults]);
        }
        this.isRetry = false;
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
        
        titleRow.innerHTML = `<strong>${title}</strong> (对: ${correctCount} | 不熟: ${unfamiliarCount} | 错: ${wrongCount})`;
        section.appendChild(titleRow);
        
        const list = document.createElement('div');
        list.className = 'result-items';
        
        results.forEach(result => {
            const word = this.wordBank.getWord(result.word);
            if (!word) return;
            
            const meanings = JSON.parse(word.m);
            const definitions = meanings.flatMap(m => m.c);
            
            const item = document.createElement('div');
            item.className = `result-item ${result.result}`;
            item.innerHTML = `
                <div class="result-word">${result.word}</div>
                <div class="result-definition">${definitions.join('、')}</div>
                <div class="result-tag ${result.type}">${result.type === 'new' ? '新单词' : '复习'}</div>
                <div class="result-status ${result.result}">${result.result}</div>
            `;
            list.appendChild(item);
        });
        
        section.appendChild(list);
        resultsList.appendChild(section);
    }

    retryWrong() {
        let wrongWords;
        
        if (this.retryRound === 0) {
            const firstResults = this.taskManager.getTodayTask()?.results || [];
            wrongWords = firstResults.filter(r => r.result === '错');
        } else {
            const lastRetry = this.retryResults[this.retryResults.length - 1];
            if (!lastRetry || lastRetry.length === 0) {
                alert('没有错题需要重开');
                return;
            }
            wrongWords = lastRetry.filter(r => r.result === '错');
        }
        
        if (wrongWords.length === 0) {
            alert('没有错题需要重开');
            return;
        }
        
        this.reviewWords = wrongWords.map(r => {
            const word = this.wordBank.getWord(r.word);
            return { ...word, type: r.type };
        });
        
        this.reviewIndex = 0;
        this.reviewResults = [];
        this.isRetry = true;
        this.retryRound++;
        
        this.showPage('review');
    }

    retryFirstWrong() {
        const firstResults = this.taskManager.getTodayTask()?.results || [];
        const wrongWords = firstResults.filter(r => r.result === '错');
        
        if (wrongWords.length === 0) {
            alert('没有首次错题需要重测');
            return;
        }
        
        this.reviewWords = wrongWords.map(r => {
            const word = this.wordBank.getWord(r.word);
            return { ...word, type: r.type };
        });
        
        this.reviewIndex = 0;
        this.reviewResults = [];
        this.isRetry = true;
        this.retryRound = 0;
        
        this.showPage('review');
    }

    redoTodayTask() {
        if (!confirm('确定要重新背诵今日计划吗？之前的背诵记录将被覆盖！')) {
            return;
        }
        
        const task = this.taskManager.getTodayTask();
        if (!task) {
            alert('今日任务不存在，请先创建任务');
            return;
        }
        
        const allWords = [];
        
        task.newWords.forEach(wordName => {
            const word = this.wordBank.getWord(wordName);
            if (word) {
                allWords.push({ ...word, type: 'new' });
            }
        });
        
        task.reviewWords.forEach(wordName => {
            const word = this.wordBank.getWord(wordName);
            if (word) {
                allWords.push({ ...word, type: 'review' });
            }
        });
        
        this.reviewWords = allWords.sort(() => Math.random() - 0.5);
        this.reviewIndex = 0;
        this.reviewResults = [];
        this.retryResults = [];
        this.isRetry = false;
        this.retryRound = 0;
        
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
        // 每次打开先重置状态
        this._pendingImportText = '';
        this._pendingImportParsed = null;
        this._pendingImportValid = false;
        this._pendingForceHighVer = false;
        document.getElementById('paste-json-area').value = '';
        document.getElementById('picked-file-name').textContent = '未选择文件';
        document.getElementById('backup-file-input').value = '';
        this._setImportInfo('', '#555');
        document.getElementById('import-confirm-btn').disabled = true;
        // 默认切回 Tab1
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
        
        const today = this.wordBank.getCustomDate() || new Date().toISOString().split('T')[0];
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
        
        const today = this.wordBank.getCustomDate() || new Date().toISOString().split('T')[0];
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
        
        this.wordBank.setCustomDate(dateStr);
        this.showSettingsStatus('日期已设置为：' + dateStr);
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
        status.textContent = message;
        setTimeout(() => {
            status.textContent = '';
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
}

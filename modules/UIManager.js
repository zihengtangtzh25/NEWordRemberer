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
        const createTaskSection = document.getElementById('create-task-section');
        
        if (taskCreated && !taskCompleted) {
            taskStatus.textContent = '任务已创建';
            startBtn.style.display = 'inline-block';
            createTaskSection.style.display = 'none';
        } else if (taskCompleted) {
            taskStatus.textContent = '今日任务已完成';
            startBtn.style.display = 'none';
            createTaskSection.style.display = 'none';
        } else {
            taskStatus.textContent = '';
            startBtn.style.display = 'none';
            createTaskSection.style.display = 'block';
        }
        
        document.getElementById('search-result').innerHTML = '';
        document.getElementById('add-word-form').style.display = 'none';
    }

    renderWordBank() {
        const words = this.wordBank.getAllWords();
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
        
        document.getElementById('set-date-btn').addEventListener('click', () => this.setCustomDate());
        document.getElementById('clear-records-btn').addEventListener('click', () => this.clearRecords());
        
        document.addEventListener('keydown', (e) => {
            if (this.currentPage !== 'review') return;
            
            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.isAnswered) {
                    this.nextWord();
                } else if (this.reviewMode === 'cn_to_en') {
                    this.checkAnswer();
                }
            } else if (e.key === '0') {
                this.setResult('对');
            } else if (e.key === '8') {
                this.setResult('不熟');
            } else if (e.key === '9') {
                this.setResult('错');
            }
        });
    }
}

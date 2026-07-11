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
        const sortedReviewDue = [...reviewDueWords].sort((a, b) => {
            return this.memoryCurve.getReviewPriority(a) - this.memoryCurve.getReviewPriority(b);
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
        
        task.completed = true;
        task.results = results;
        
        const today = this.getTodayDate();
        
        results.forEach(result => {
            const word = this.wordBank.getWord(result.word);
            if (word) {
                for (let i = 1; i <= 10; i++) {
                    if (word[`r${i}D`] === today) {
                        word[`r${i}D`] = '';
                        word[`r${i}R`] = '';
                    }
                }
                
                const nextIndex = this.memoryCurve.getNextReviewIndex(word);
                
                word[`r${nextIndex}D`] = today;
                word[`r${nextIndex}R`] = result.result;
                
                this.wordBank.updateWord(word);
            }
        });
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(task));
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

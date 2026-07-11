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
}

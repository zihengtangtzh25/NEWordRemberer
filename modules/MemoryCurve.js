class MemoryCurve {
    constructor() {
        this.baseInterval = 1;
        this.defaultEaseFactor = 1.5;
        this.minEaseFactor = 1.2;
        this.maxEaseFactor = 2.5;
        this.minInterval = 1;
        this.maxInterval = 100;
    }

    calculateNextReviewDays(reviewCount, easeFactor) {
        const days = Math.ceil(this.baseInterval * Math.pow(easeFactor, reviewCount));
        return Math.max(this.minInterval, Math.min(this.maxInterval, days));
    }

    calculateNextReviewDate(lastReviewDate, reviewCount, easeFactor) {
        const days = this.calculateNextReviewDays(reviewCount, easeFactor);
        const dateObj = new Date(lastReviewDate);
        dateObj.setDate(dateObj.getDate() + days);
        return dateObj.toISOString().split('T')[0];
    }

    getEaseFactor(word) {
        let easeFactor = this.defaultEaseFactor;
        
        for (let i = 1; i <= 10; i++) {
            if (word[`r${i}D`]) {
                const result = word[`r${i}R`];
                if (result === '对') {
                    easeFactor += 0.1;
                } else if (result === '错') {
                    easeFactor = Math.max(this.minEaseFactor, easeFactor - 0.2);
                } else if (result === '不熟') {
                    easeFactor = Math.max(this.minEaseFactor + 0.1, easeFactor - 0.1);
                }
            }
        }
        
        return Math.min(this.maxEaseFactor, easeFactor);
    }

    updateEaseFactor(word, result) {
        const currentEaseFactor = this.getEaseFactor(word);
        let newEaseFactor = currentEaseFactor;
        
        if (result === '对') {
            newEaseFactor += 0.1;
        } else if (result === '错') {
            newEaseFactor = Math.max(this.minEaseFactor, currentEaseFactor - 0.2);
        } else if (result === '不熟') {
            newEaseFactor = Math.max(this.minEaseFactor + 0.1, currentEaseFactor - 0.1);
        }
        
        return Math.min(this.maxEaseFactor, newEaseFactor);
    }

    isDueForReview(word, today) {
        const lastReviewIndex = this.getLastReviewIndex(word);
        if (lastReviewIndex === 0) return false;
        
        const lastDate = word[`r${lastReviewIndex}D`];
        if (!lastDate) return false;
        
        const easeFactor = this.getEaseFactor(word);
        const nextDate = this.calculateNextReviewDate(lastDate, lastReviewIndex - 1, easeFactor);
        
        return nextDate <= today;
    }

    getReviewPriority(word, today) {
        const lastReviewIndex = this.getLastReviewIndex(word);
        if (lastReviewIndex === 0) return 0;
        
        const lastDate = word[`r${lastReviewIndex}D`];
        const easeFactor = this.getEaseFactor(word);
        const nextDate = this.calculateNextReviewDate(lastDate, lastReviewIndex - 1, easeFactor);
        
        const todayObj = new Date(today);
        const nextDateObj = new Date(nextDate);
        const diffTime = nextDateObj - todayObj;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }

    getLastReviewIndex(word) {
        for (let i = 10; i >= 1; i--) {
            if (word[`r${i}D`]) return i;
        }
        return 0;
    }

    getNextReviewIndex(word) {
        const lastIndex = this.getLastReviewIndex(word);
        return Math.min(lastIndex + 1, 10);
    }

    getReviewCount(word) {
        let count = 0;
        for (let i = 1; i <= 10; i++) {
            if (word[`r${i}D`]) count++;
        }
        return count;
    }

    getWordMasteryLevel(word) {
        const reviewCount = this.getReviewCount(word);
        const easeFactor = this.getEaseFactor(word);
        const lastReviewIndex = this.getLastReviewIndex(word);
        
        if (reviewCount === 0) return { level: '未学习', score: 0 };
        if (reviewCount === 1) return { level: '初学', score: 1 };
        if (reviewCount === 2) return { level: '熟悉中', score: 2 };
        
        let consecutiveCorrect = 0;
        for (let i = lastReviewIndex; i >= 1; i--) {
            if (word[`r${i}R`] === '对') {
                consecutiveCorrect++;
            } else {
                break;
            }
        }
        
        if (consecutiveCorrect >= 5 && easeFactor >= 2.0) {
            return { level: '已掌握', score: 5 };
        } else if (consecutiveCorrect >= 3 && easeFactor >= 1.8) {
            return { level: '熟练', score: 4 };
        } else if (consecutiveCorrect >= 2 && easeFactor >= 1.5) {
            return { level: '掌握中', score: 3 };
        } else {
            return { level: '不稳定', score: 2 };
        }
    }
}

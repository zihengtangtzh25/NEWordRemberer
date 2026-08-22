document.addEventListener('DOMContentLoaded', function() {
    var wordBank = new WordBank();
    var memoryCurve = new MemoryCurve();
    // ===== [缺陷05/16 v1.0.1] 将 memoryCurve 引用注入 WordBank，让 getReviewDueWords/calculateEaseFactor/getLastReviewIndex 委托 MC 单一真相源 =====
    wordBank.memoryCurve = memoryCurve;
    var taskManager = new TaskManager(wordBank, memoryCurve);
    // ===== [v1.0.2 背诵日历] StatsCalendar 实例：纯数据层，负责 calendarStats 读写 + 聚合查询 =====
    var statsCalendar = new StatsCalendar(wordBank, taskManager);
    var uiManager = new UIManager(wordBank, memoryCurve, taskManager, statsCalendar);

    // ===== [歧义 3 / B4 规则 4 v1.0.1] 紧急写库：首次背诵 ✅ 关浏览器立即写词库；错题重测 ❌ 接受从头再来，不紧急写库 =====
    window.addEventListener('beforeunload', function() {
        try {
            if (uiManager && typeof uiManager._emergencySaveBeforeUnload === 'function') {
                uiManager._emergencySaveBeforeUnload();
            }
        } catch (e) {
            console.error('[紧急写库] 失败：', e);
        }
    });

    uiManager.bindEvents();
    uiManager.showPage('home');
});

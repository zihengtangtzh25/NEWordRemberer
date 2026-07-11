document.addEventListener('DOMContentLoaded', function() {
    var wordBank = new WordBank();
    var memoryCurve = new MemoryCurve();
    var taskManager = new TaskManager(wordBank, memoryCurve);
    var uiManager = new UIManager(wordBank, memoryCurve, taskManager);
    
    uiManager.bindEvents();
    uiManager.showPage('home');
});
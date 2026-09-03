/* ============================================================
 * plan1 一键设为当日计划（浏览器控制台脚本）
 * 用法：用浏览器打开应用页面 → 按 F12 → 切到 Console（控制台）
 *       → 粘贴本文件全部内容 → 回车执行 → 完成后按 F5 刷新页面
 * 功能：
 *   1. 词库补词：plan1 里的单词，词库已有的【不改动】，缺失的才新增
 *   2. 当日计划：把这 199 个单词全部设为今天计划的新词（覆盖 todayTask）
 *   3. 若今天已有背诵记录，会先弹确认框再覆盖
 * 说明：只写 localStorage，与 App 的 WordBank/TaskManager 数据格式完全一致
 * ============================================================ */
(function () {
  'use strict';
  var CSV = `单词,词性,中文
accomplishment,n.,成就
adolescent,adj.,青少年的
alert,adj.,警觉的
amazed,adj.,惊讶的
amid,prep.,在…之中
anchor,n.,锚
anniversary,n.,周年纪念
app,n.,应用程序
appliance,n.,器具
arouse,v.,激起
ash,n.,灰
basement,n.,地下室
beg,v.,乞求
besides,prep.,除…之外
bin,n.,垃圾箱
bind,v.,捆绑
blossom,n.,花
boom,n.,繁荣
burst,v.,爆发
bush,n.,灌木
capture,v.,捕获
casual,adj.,随意的
catalog,n.,目录
ceremony,n.,典礼
charm,n.,魅力
chase,v.,追赶
chip,n.,芯片
classify,v.,分类
code,n.,代码
command,n.,命令
compound,n.,化合物
conquer,v.,征服
conserve,v.,保护
controversial,adj.,有争议的
convey,v.,传达
counter,n.,柜台
craft,n.,工艺
crawl,v.,爬行
dawn,n.,黎明
dedicate,v.,奉献
deed,n.,行为
delight,n.,高兴
diagnose,v.,诊断
distracting,adj.,分心的
distressing,adj.,令人痛苦的
dot,n.,点
drown,v.,淹死
duly,adv.,适当地
enclose,v.,附上
endurance,n.,耐力
equivalent,adj.,等价的
evolve,v.,进化
exhaust,v.,耗尽
exploitation,n.,剥削
fade,v.,褪色
faint,adj.,微弱的
fake,adj.,假的
fare,n.,车费
farewell,n.,告别
fascinating,adj.,迷人的
fertilizer,n.,肥料
fierce,adj.,凶猛的
flame,n.,火焰
flesh,n.,肉
float,v.,漂浮
foolish,adj.,愚蠢的
freshman,n.,大一新生
frustrate,v.,使沮丧
fulfill,v.,实现
funeral,n.,葬礼
furthermore,adv.,此外
gesture,n.,手势
giant,adj.,巨大的
glance,v.,瞥一眼
gossip,n.,流言
graceful,adj.,优雅的
gratitude,n.,感激
grave,adj.,严重的
hardware,n.,硬件
harsh,adj.,严厉的
hazardous,adj.,危险的
highway,n.,公路
hint,n.,暗示
hook,n.,钩子
hop,v.,单脚跳
horizon,n.,地平线
horn,n.,号角
imitation,n.,模仿
inevitably,adv.,不可避免地
inform,v.,通知
ink,n.,墨水
insert,v.,插入
install,v.,安装
instinct,n.,本能
interval,n.,间隔
isolated,adj.,孤立的
jewellery,n.,珠宝
kidnap,v.,绑架
knit,v.,编织
patriotic,adj.,爱国的
souvenir,n.,纪念品
latest,adj.,最新的
pause,v.,暂停
spill,v.,溢出
laundry,n.,洗衣店
pave,v.,铺设
spit,v.,吐
lawn,n.,草坪
perseverance,n.,毅力
stationery,n.,文具
layer,n.,层
persist,v.,坚持
status,n.,地位
lean,v.,倾斜
perspective,n.,视角
steadily,adv.,稳定地
leap,v.,跳跃
pile,n.,堆
stock,n.,库存
locker,n.,储物柜
pin,n.,别针
strand,n.,缕
luggage,n.,行李
pizza,n.,披萨
supervisor,n.,主管
manual,adj.,手动的
portion,n.,部分
swallow,v.,吞咽
marine,adj.,海洋的
proportion,n.,比例
tap,v.,轻敲
marvel,v.,惊叹
publication,n.,出版物
teen,n.,青少年
mask,n.,面具
puppy,n.,小狗
tempt,v.,诱惑
masterpiece,n.,杰作
puzzle,n.,谜
tent,n.,帐篷
mayor,n.,市长
regulate,v.,调节
thread,n.,线
meanwhile,adv.,同时
reluctant,adj.,不情愿的
throat,n.,喉咙
melt,v.,融化
reverse,v.,反转
tide,n.,潮汐
miserable,adj.,悲惨的
rhythm,n.,节奏
tongue,n.,舌头
moderate,adj.,适度的
ritual,n.,仪式
trace,v.,追踪
modest,adj.,谦虚的
robber,n.,强盗
tragic,adj.,悲剧的
monument,n.,纪念碑
rough,adj.,粗糙的
transition,n.,过渡
mutual,adj.,相互的
rub,v.,摩擦
tremendous,adj.,巨大的
mysterious,adj.,神秘的
sacred,adj.,神圣的
triangle,n.,三角形
nap,n.,小睡
sacrifice,n.,牺牲
tribe,n.,部落
nasty,adj.,令人讨厌的
sauce,n.,酱汁
tunnel,n.,隧道
neutral,adj.,中立的
scale,n.,规模
undergo,v.,经历
nickname,n.,绰号
scan,v.,扫描
underlie,v.,构成…的基础
nonsense,n.,胡说
seal,n.,海豹
vocation,n.,职业
obstacle,n.,障碍
shrug,v.,耸肩
voyage,n.,航行
oral,adj.,口头的
sidewalk,n.,人行道
wilderness,n.,荒野
outlook,n.,观点
sigh,v.,叹息
willingly,adv.,愿意地
pajamas,n.,睡衣
slight,adj.,轻微的
pants,n.,裤子
slope,n.,斜坡
parade,n.,游行
smash,v.,打碎
pat,v.,轻拍
soap,n.,肥皂`;

  // ---- 1. 解析 CSV ----
  var rows = CSV.trim().split('\n').slice(1)
    .filter(function (l) { return l.trim() !== ''; })
    .map(function (l) {
      var p = l.replace(/\r$/, '').split(',');
      return { w: (p[0] || '').trim(), pos: (p[1] || '').trim(), cn: (p[2] || '').trim() };
    })
    .filter(function (r) { return r.w !== ''; });
  console.log('[plan1] CSV 解析到 ' + rows.length + ' 个单词');

  // ---- 2. 词库补词（原有的不改动，缺失的才新增）----
  var bank;
  try { bank = JSON.parse(localStorage.getItem('wordBank') || 'null'); } catch (e) { bank = null; }
  if (!Array.isArray(bank)) {
    console.error('[plan1] ❌ localStorage 中没有词库数据（wordBank 键不存在）。请先用浏览器正常打开一次应用页面（完成初始化）后再运行本脚本。');
    return;
  }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var d = new Date();
  var today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  var lowerSet = {};
  bank.forEach(function (w) { lowerSet[(w.w || '').toLowerCase()] = true; });
  var added = 0, exist = 0;
  rows.forEach(function (r) {
    if (lowerSet[r.w.toLowerCase()]) { exist++; return; }
    var obj = { w: r.w, m: JSON.stringify([{ p: r.pos, c: [r.cn] }]), cAt: today };
    for (var i = 1; i <= 10; i++) { obj['r' + i + 'D'] = ''; obj['r' + i + 'R'] = ''; }
    bank.push(obj);
    lowerSet[r.w.toLowerCase()] = true;
    added++;
  });
  try {
    localStorage.setItem('wordBank', JSON.stringify(bank));
  } catch (e) {
    console.error('[plan1] ❌ 词库保存失败（存储空间已满？请先导出备份）：', e);
    return;
  }
  console.log('[plan1] 词库补词完成：新增 ' + added + ' 个 / 已存在跳过 ' + exist + ' 个（原有词未做任何改动），词库现共 ' + bank.length + ' 词');

  // ---- 3. 设置当日计划 todayTask ----
  var cd = localStorage.getItem('customDate');            // 与 WordBank.getTodayDate() 口径一致
  var planDate = cd ? cd : today;
  var old = null;
  try { old = JSON.parse(localStorage.getItem('todayTask') || 'null'); } catch (e) { old = null; }
  if (old && old.date === planDate && ((old.results && old.results.length > 0) || old.completed)) {
    if (!confirm('[plan1] 检测到今天已有背诵记录/进行中任务。\n继续将覆盖当日任务（词库中已写入的轮次记录不受影响）。\n\n是否继续？')) {
      console.warn('[plan1] 已取消：词库补词已生效，但当日计划保持原样。');
      return;
    }
  }
  var task = {
    date: planDate,
    newWords: rows.map(function (r) { return r.w; }),
    reviewWords: [],
    completed: false,
    results: []
  };
  try {
    localStorage.setItem('todayTask', JSON.stringify(task));
  } catch (e) {
    console.error('[plan1] ❌ 当日计划保存失败：', e);
    return;
  }
  console.log('[plan1] ✅ 当日计划已设置：新词 ' + task.newWords.length + ' 个 ｜ 计划日期 ' + planDate + '（customDate=' + (cd || '未设置') + '）');
  console.log('[plan1] 👉 请按 F5 刷新页面，然后到首页点击「开始背诵」。');
})();

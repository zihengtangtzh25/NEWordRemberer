// =========================================================================
// SchemaRegistry —— NEWordRemberer 备份格式注册中心
// -------------------------------------------------------------------------
// 作用：
//   1. 记录当前程序版本 & 备份格式版本号（UI 上显示、导出 JSON 写入）
//   2. 定义各版本 schema（字段、类型、校验函数）
//   3. 提供版本比较、格式文档生成（JSON 内嵌 + MD 文档生成）
//
// 三边对照说明：
//   边1：本文件（SchemaRegistry.js）—— 代码中唯一真相源
//   边2：导出 JSON 的 exportedFromFormat 字段 —— generateEmbeddedFormatDoc()
//   边3：项目根目录 BACKUP_FORMAT.md —— generateMarkdown()
//   三者内容来源一致，确保格式定义不漂移。
// =========================================================================

const SchemaRegistry = {
  // -------- 程序版本号 & 备份格式版本号 --------
  // 程序版本号（UI 顶部 / 设置区展示）
  APP_VERSION: "1.0.1",

  // 备份格式版本号（写入导出 JSON，用于后续导入时做兼容判断）
  // v1.0.1 bugfix：格式字段未变，仅校验规则从严；v1.0.0 / v1.0.1 程序互导完全兼容
  CURRENT_VERSION: "1.0.0",

  // 固定格式标识（用于拒绝非备份文件的导入）
  FORMAT_IDENTIFIER: "NEWordRemberer-Backup",

  // -------- 各版本 schema 定义 --------
  // 未来版本在 schemas 中追加，并提供 upgradeFromX_Y_Z 转换函数即可。
  schemas: {
    "1.0.0": {
      version: "1.0.0",
      description: "初始版本。每词 10 轮复习记录（r1~r10），释义 m 为嵌套 JSON 字符串。",
      // 此版本包含的 localStorage key（不包含 todayTask，它属于当日临时数据）
      dataKeys: ["wordBank", "customDate"],

      // WordObject 字段说明（类型 + 描述，三边共用）
      wordObjectFields: {
        w:              { type: "string",                   desc: "单词本身（英文小写或原拼写，匹配时不区分大小写）" },
        m:              { type: "string(JSON)",              desc: "释义序列化字符串；JSON.parse 后结构为 [{p: string 词性, c: string[] 释义数组}]" },
        cAt:            { type: "string(YYYY-MM-DD)",        desc: "单词添加/创建日期" },
        "r1D~r10D":     { type: "string(YYYY-MM-DD) | ''",   desc: "第 N 轮复习日期；空字符串表示该轮尚未复习" },
        "r1R~r10R":     { type: "'' | '对' | '错' | '不熟'", desc: "第 N 轮复习结果；空字符串 = 未复习" }
      },

      // customDate 字段
      customDateField: {
        type: "string(YYYY-MM-DD) | null",
        desc: "用户自定义的「今日日期」（用于模拟/调试不同日期的复习）；null 表示使用真实系统日期"
      },

      // 复习结果枚举值（校验时用）
      reviewResultValues: ["", "对", "错", "不熟"],

      // WordObject 字段级校验（返回 true/false）
      // v1.0.1 bugfix（缺陷01）：多层校验 m 字段（string→JSON可parse→数组→嵌套字段），防白屏；加 < 字符拦截（XSS 联动缺陷02）
      validateWord: (w) => {
        if (!w || typeof w !== 'object') return false;
        if (typeof w.w !== 'string' || w.w.length === 0) return false;
        // XSS 防御：w 里禁止出现 '<'（防止恶意用户构造 <script> 作为单词名，渲染时注入）
        if (w.w.indexOf('<') !== -1) return false;
        if (typeof w.m !== 'string') return false;
        // ===== [缺陷01] m 字段多层深层校验 =====
        try {
          const parsed = JSON.parse(w.m);
          if (!Array.isArray(parsed)) return false;
          for (let i = 0; i < parsed.length; i++) {
            const it = parsed[i];
            if (!it || typeof it !== 'object') return false;
            if (typeof it.p !== 'string') return false;                // p = 词性必须 string
            if (it.p.indexOf('<') !== -1) return false;              // p 防 XSS
            if (!Array.isArray(it.c)) return false;                  // c = 释义数组
            for (let j = 0; j < it.c.length; j++) {
              if (typeof it.c[j] !== 'string') return false;         // c[] 每项必须 string
              if (it.c[j].indexOf('<') !== -1) return false;        // c[] 防 XSS
            }
          }
        } catch (e) {
          return false;   // JSON.parse 失败 → 不合法（m 损坏时直接拦住，避免后续 render 白屏）
        }
        // ===== cAt：必须是合法 YYYY-MM-DD =====
        if (typeof w.cAt !== 'string') return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(w.cAt)) return false;
        // ===== r1~r10 轮次：日期格式 + 结果枚举值 =====
        const validResults = ["", "对", "错", "不熟"];
        for (let i = 1; i <= 10; i++) {
          const d = w[`r${i}D`];
          const r = w[`r${i}R`];
          if (typeof d !== 'string') return false;
          if (typeof r !== 'string') return false;
          if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;   // rXR 有值时必须是合法日期
          if (validResults.indexOf(r) === -1) return false;         // rXR 结果必须在枚举里
        }
        return true;
      }
    }
  },

  // -------- 版本号比较工具 --------
  // 返回：-1 (a<b) / 0 (a==b) / 1 (a>b)
  compareVersion(a, b) {
    const pa = String(a).split('.').map(n => isNaN(Number(n)) ? 0 : Number(n));
    const pb = String(b).split('.').map(n => isNaN(Number(n)) ? 0 : Number(n));
    for (let i = 0; i < 3; i++) {
      const va = pa[i] || 0;
      const vb = pb[i] || 0;
      if (va > vb) return 1;
      if (va < vb) return -1;
    }
    return 0;
  },

  // 主版本号是否与当前兼容
  isMajorCompatible(importedVer) {
    if (!importedVer) return false;
    const curMajor = this.CURRENT_VERSION.split('.')[0];
    const impMajor = String(importedVer).split('.')[0];
    return impMajor === curMajor;
  },

  // -------- 生成 JSON 内嵌格式说明（三边对照之边2）--------
  // 导出 JSON 时，将返回对象写入 exportedFromFormat 字段
  generateEmbeddedFormatDoc() {
    const v = this.CURRENT_VERSION;
    const s = this.schemas[v];
    const wordFields = {};
    Object.keys(s.wordObjectFields).forEach(k => {
      const fd = s.wordObjectFields[k];
      wordFields[k] = `${fd.type} — ${fd.desc}`;
    });
    return {
      schemaVersion: v,
      description: s.description,
      storageKeysBackedUp: s.dataKeys.slice(),
      wordObjectFields: wordFields,
      customDateField: `${s.customDateField.type} — ${s.customDateField.desc}`,
      reviewResultEnum: s.reviewResultValues.slice(),
      trilateralNote: "此对象与 SchemaRegistry.js（代码）、项目 BACKUP_FORMAT.md（文档），三者内容来源一致，三边对照防止格式漂移。"
    };
  },

  // -------- 生成 Markdown 格式文档（三边对照之边3）--------
  // 用于生成项目根目录静态文件 BACKUP_FORMAT.md，供开发者查阅
  generateMarkdown() {
    const v = this.CURRENT_VERSION;
    const s = this.schemas[v];
    const appV = this.APP_VERSION;

    const wordFieldLines = Object.keys(s.wordObjectFields)
      .map(k => {
        const fd = s.wordObjectFields[k];
        return `| \`${k}\` | \`${fd.type}\` | ${fd.desc} |`;
      })
      .join('\n');

    const resultEnum = s.reviewResultValues.map(x => x === '' ? `\`""\` (空字符串，未复习)` : `\`"${x}"\``).join(' / ');

    return `# NEWordRemberer 背诵备份格式说明

- 应用版本（APP_VERSION）：v${appV}
- 备份格式版本（FORMAT_VERSION）：v${v}
- 格式标识（format 字段）：\`${this.FORMAT_IDENTIFIER}\`
- 本文档由 \`SchemaRegistry.generateMarkdown()\` 自动生成，作为「三边对照」之**文档边**。

---

## 三边对照原则

为避免后续版本迭代时格式定义不一致，三处格式定义必须保持同源：

| 边 | 位置 | 生成方式 |
|---|---|---|
| 边1（代码）| \`modules/SchemaRegistry.js\` | 人工维护（唯一真相源）|
| 边2（JSON内嵌）| 导出 JSON 的 \`exportedFromFormat\` 字段 | 程序调用 \`generateEmbeddedFormatDoc()\` 生成 |
| 边3（文档）| 本文件 \`BACKUP_FORMAT.md\` | 程序调用 \`generateMarkdown()\` 生成 |

任何格式修改都应**只修改 SchemaRegistry.js 中的 schemas 定义**，然后重新生成边2/边3，不要直接手改 JSON 内嵌说明或 MD 文档。

---

## 一、导出的 JSON 文件顶层结构

导出文件名为 \`NEWordRemberer_备份_YYYYMMDD_HHMMSS.json\`。

\`\`\`json
{
  "format": "${this.FORMAT_IDENTIFIER}",
  "formatVersion": "${v}",
  "appVersion": "${appV}",
  "appName": "NEWordRemberer",
  "exportedAt": "2026-08-21T10:30:00.000Z",
  "exportedFromFormat": {
    "schemaVersion": "${v}",
    "description": "...",
    "storageKeysBackedUp": ["wordBank", "customDate"],
    "wordObjectFields": { "...": "..." },
    "customDateField": "...",
    "reviewResultEnum": ["", "对", "错", "不熟"],
    "trilateralNote": "..."
  },
  "data": {
    "wordBank": [
      {
        "w": "abandon",
        "m": "[{\\"p\\":\\"v.\\",\\"c\\":[\\"放弃\\",\\"遗弃\\"]}]",
        "cAt": "2026-08-03",
        "r1D": "", "r1R": "",
        "...": "...",
        "r10D": "", "r10R": ""
      }
    ],
    "customDate": "2026-08-21"
  },
  "stats": {
    "wordCount": 3500,
    "reviewedCount": 1200
  }
}
\`\`\`

### 顶层字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| \`format\` | string | 固定值 \`${this.FORMAT_IDENTIFIER}\`，用于校验文件身份 |
| \`formatVersion\` | string | 备份格式语义化版本号（主版本号相同可直接导入） |
| \`appVersion\` | string | 生成此备份时的程序版本号，仅作展示 |
| \`exportedAt\` | string(ISO) | 导出时间 UTC ISO 格式 |
| \`exportedFromFormat\` | object | 内嵌格式文档（三边对照边2），与本文件内容一致 |
| \`data\` | object | 用户实际背诵数据，见第二节 |
| \`stats\` | object | 导出时的统计快照，供快速校验完整性 |

---

## 二、\`data\` 数据区结构

### 2.1 \`data.wordBank\` —— 词库（核心）

类型：\`WordObject[]\`，每个 \`WordObject\` 字段如下：

| 字段 | 类型 | 说明 |
|---|---|---|
${wordFieldLines}

#### \`m\` 字段嵌套 JSON 展开示例

\`\`\`json
// m 字段本身是一个字符串，需要再做一次 JSON.parse
// m = "[{\\"p\\":\\"v.\\",\\"c\\":[\\"放弃\\",\\"遗弃\\",\\"沉溺\\"]}]"
JSON.parse(word.m)
// 结果：
// [
//   { p: "v.",  c: ["放弃", "遗弃", "沉溺"] },
//   { p: "n.",  c: ["放任", "放纵"] }
// ]
\`\`\`

#### \`rXR\` 复习结果可选值

${resultEnum}

### 2.2 \`data.customDate\` —— 自定义日期

| 字段 | 类型 | 说明 |
|---|---|---|
| \`data.customDate\` | \`${s.customDateField.type}\` | ${s.customDateField.desc} |

> **注意**：\`todayTask\`（今日任务）不属于备份范围，每次进入程序时根据当日日期重新生成。

---

## 三、导入兼容性规则

| 导入文件 formatVersion | 当前程序 | 处理方式 |
|---|---|---|
| 主版本 < 1（如 0.9.x）| v${appV} | 黄色警告，尝试按当前 schema 解析，字段缺失的跳过 |
| 主版本 == 1（如 1.0.0 ~ 1.9.9）| v${appV} | 绿色，完全兼容，直接导入 |
| 主版本 > 1（如 2.0.0）| v${appV} | 红色警告 + confirm："此备份由更高版本导出，不保证新字段完整保留，是否继续？" |
| 缺失 \`format\` 字段 或 format != 标识 | v${appV} | 拒绝，提示"非完整备份文件，可能是今日单词表或背诵结果导出文件" |

## 四、导入策略（用户可选）

| 策略 | 含义 | 适用场景 |
|---|---|---|
| overwrite（覆盖）| 清空当前词库，写入备份中的词库 + customDate | 换设备、恢复完整备份 |
| merge（合并）| 同单词比较 getLastReviewIndex()，保留**复习轮次更高**的那条；不同单词直接追加 | 多设备合并进度 |

> todayTask（当日任务）无论何种策略都**不会**从备份中恢复，避免污染当日正在进行的任务。
`;
  }
};

// 浏览器 <script> 引入时挂到全局
if (typeof window !== 'undefined') {
  window.SchemaRegistry = SchemaRegistry;
}

# NEWordRemberer 背诵备份格式说明

- 应用版本（APP_VERSION）：v1.0.1
- 备份格式版本（FORMAT_VERSION）：v1.0.0（与 v1.0.0 完全兼容，schema 字段无增删）
- 格式标识（format 字段）：`NEWordRemberer-Backup`
- 本文档对应 `modules/SchemaRegistry.js` 中的 `generateMarkdown()`，作为「三边对照」之**文档边**。

---

## 三边对照原则

为避免后续版本迭代时格式定义不一致，三处格式定义必须保持同源：

| 边 | 位置 | 生成方式 |
|---|---|---|
| 边1（代码）| `modules/SchemaRegistry.js` | 人工维护（唯一真相源）|
| 边2（JSON内嵌）| 导出 JSON 的 `exportedFromFormat` 字段 | 程序调用 `SchemaRegistry.generateEmbeddedFormatDoc()` 生成 |
| 边3（文档）| 本文件 `BACKUP_FORMAT.md` | 对应 `SchemaRegistry.generateMarkdown()` 输出 |

任何格式修改都应**只修改 SchemaRegistry.js 中的 schemas 定义**，然后重新生成边2/边3，不要直接手改 JSON 内嵌说明或 MD 文档。

---

## 一、导出的 JSON 文件顶层结构

导出文件名为 `NEWordRemberer_备份_YYYYMMDD_HHMMSS.json`。

```json
{
  "format": "NEWordRemberer-Backup",
  "formatVersion": "1.0.0",
  "appVersion": "1.0.0",
  "appName": "NEWordRemberer",
  "exportedAt": "2026-08-21T10:30:00.000Z",
  "exportedFromFormat": {
    "schemaVersion": "1.0.0",
    "description": "初始版本。每词 10 轮复习记录（r1~r10），释义 m 为嵌套 JSON 字符串。",
    "storageKeysBackedUp": ["wordBank", "customDate"],
    "wordObjectFields": {
      "w": "string — 单词本身（英文小写或原拼写，匹配时不区分大小写）",
      "m": "string(JSON) — 释义序列化字符串；JSON.parse 后结构为 [{p: string 词性, c: string[] 释义数组}]",
      "cAt": "string(YYYY-MM-DD) — 单词添加/创建日期",
      "r1D~r10D": "string(YYYY-MM-DD) | '' — 第 N 轮复习日期；空字符串表示该轮尚未复习",
      "r1R~r10R": "'' | '对' | '错' | '不熟' — 第 N 轮复习结果；空字符串 = 未复习"
    },
    "customDateField": "string(YYYY-MM-DD) | null — 用户自定义的「今日日期」（用于模拟/调试不同日期的复习）；null 表示使用真实系统日期",
    "reviewResultEnum": ["", "对", "错", "不熟"],
    "trilateralNote": "此对象与 SchemaRegistry.js（代码）、项目 BACKUP_FORMAT.md（文档），三者内容来源一致，三边对照防止格式漂移。"
  },
  "data": {
    "wordBank": [
      {
        "w": "abandon",
        "m": "[{\"p\":\"v.\",\"c\":[\"放弃\",\"遗弃\",\"沉溺\"]}]",
        "cAt": "2026-08-03",
        "r1D": "", "r1R": "",
        "r2D": "", "r2R": "",
        "r3D": "", "r3R": "",
        "r4D": "", "r4R": "",
        "r5D": "", "r5R": "",
        "r6D": "", "r6R": "",
        "r7D": "", "r7R": "",
        "r8D": "", "r8R": "",
        "r9D": "", "r9R": "",
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
```

### 顶层字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `format` | string | 固定值 `NEWordRemberer-Backup`，用于校验文件身份 |
| `formatVersion` | string | 备份格式语义化版本号（主版本号相同可直接导入） |
| `appVersion` | string | 生成此备份时的程序版本号，仅作展示 |
| `exportedAt` | string(ISO) | 导出时间 UTC ISO 格式 |
| `exportedFromFormat` | object | 内嵌格式文档（三边对照边2），与本文件内容一致 |
| `data` | object | 用户实际背诵数据，见第二节 |
| `stats` | object | 导出时的统计快照，供快速校验完整性 |

---

## 二、`data` 数据区结构

### 2.1 `data.wordBank` —— 词库（核心）

类型：`WordObject[]`，每个 `WordObject` 字段如下：

| 字段 | 类型 | 说明 |
|---|---|---|
| `w` | `string` | 单词本身（英文小写或原拼写，匹配时不区分大小写） |
| `m` | `string(JSON)` | 释义序列化字符串；JSON.parse 后结构为 [{p: string 词性, c: string[] 释义数组}] |
| `cAt` | `string(YYYY-MM-DD)` | 单词添加/创建日期 |
| `r1D~r10D` | `string(YYYY-MM-DD) \| ''` | 第 N 轮复习日期；空字符串表示该轮尚未复习 |
| `r1R~r10R` | `'' \| '对' \| '错' \| '不熟'` | 第 N 轮复习结果；空字符串 = 未复习 |

#### `m` 字段嵌套 JSON 展开示例

```json
// m 字段本身是一个字符串，需要再做一次 JSON.parse
// m = "[{\"p\":\"v.\",\"c\":[\"放弃\",\"遗弃\",\"沉溺\"]}]"
JSON.parse(word.m)
// 结果：
// [
//   { p: "v.",  c: ["放弃", "遗弃", "沉溺"] },
//   { p: "n.",  c: ["放任", "放纵"] }
// ]
```

#### `rXR` 复习结果可选值

`""` (空字符串，未复习) / `"对"` / `"错"` / `"不熟"`

### 2.2 `data.customDate` —— 自定义日期

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.customDate` | `string(YYYY-MM-DD) | null` | 用户自定义的「今日日期」（用于模拟/调试不同日期的复习）；null 表示使用真实系统日期 |

> **注意**：`todayTask`（今日任务）不属于备份范围，每次进入程序时根据当日日期重新生成。

---

## 三、导入兼容性规则

| 导入文件 formatVersion | 当前 v1.0.x 系列程序（格式基准 v1.0.0）| 处理方式 |
|---|---|---|
| 主版本 < 1（如 0.9.x 远古版）| v1.0.1 | 黄色警告，尝试按当前 v1.0.0 schema 解析，字段缺失的跳过；**远古版本升级路径见 `CHANGELOG_v1.0.1.md` 附录** |
| 主版本 == 1（如 1.0.0 ~ 1.9.9，含 v1.0.0 互导 v1.0.1）| v1.0.1 | ✅ 绿色，完全兼容，直接导入（schema 字段完全一致，仅 v1.0.1 校验规则更严格）|
| 主版本 > 1（如 2.0.0 未来新版）| v1.0.1 | 🔴 红色警告 + 二次确认："此备份由更高版本导出，不保证新字段完整保留，是否继续？" |
| 缺失 `format` 字段 或 format != 标识 | v1.0.1 | 拒绝，提示"非完整备份文件，可能是今日单词表或背诵结果导出文件，请使用【💾 导出背诵备份】生成的 JSON 文件" |

## 四、导入策略（用户可选）

| 策略 | 含义 | 适用场景 |
|---|---|---|
| overwrite（覆盖）| 清空当前词库，写入备份中的词库 + customDate | 换设备、恢复完整备份 |
| merge（合并）| 同单词比较 getLastReviewIndex()，保留**复习轮次更高**的那条；不同单词直接追加 | 多设备合并进度 |

> todayTask（当日任务）无论何种策略都**不会**从备份中恢复，避免污染当日正在进行的任务。

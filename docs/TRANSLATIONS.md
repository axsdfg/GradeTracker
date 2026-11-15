# 翻译状态 · Translations

本文件记录各语言文档的状态、术语对照与新增语言的方法。

## 语言版本

| 语言 | 文件 | 状态 | 覆盖范围 |
|---|---|---|---|
| 简体中文 | [`README.md`](../README.md) | ✅ 基准版本 | 全量 |
| English | [`README.en.md`](../README.en.md) | ✅ 完整 | 全量 |
| 日本語 | [`README.ja.md`](../README.ja.md) | ✅ 完整 | 全量 |
| 한국어 | [`README.ko.md`](../README.ko.md) | ✅ 完整 | 全量 |
| Español | [`README.es.md`](../README.es.md) | ✅ 完整 | 全量 |
| Русский | [`README.ru.md`](../README.ru.md) | ✅ 完整 | 全量 |

**范围约定**：目前各语言只覆盖根目录 README。`docs/` 下的详细文档仅中文，这是有意为之——README 是入口，改功能时同步成本可控；docs 属于深度材料，优先保证中文的准确性。

## 同步规则

1. **中文版是基准**。功能、数字、命令有任何变化，先改 `README.md`，再同步其他语言。
2. 只改文案、不改技术内容时，可以只改中文版，但要在 PR 里说明「其他语言待同步」。
3. 章节结构必须对齐：各语言版本的章节顺序、表格列数、代码块、mermaid 图保持一致，方便逐段比对。
4. 新增语言时，六份 README 顶部的语言切换行都要追加，顺序固定为：简体中文 · English · 日本語 · 한국어 · Español · Русский。

## 术语对照

中国高考相关概念在非中文版本中保留原词并加注，避免直译造成误解。

| 中文 | English | 日本語 | 한국어 | Español | Русский |
|---|---|---|---|---|---|
| 一分一段 | score-segment table | 一分一段（スコア分布表） | 一分一段(점수 분포표) | tabla de segmentos por puntuación | таблица распределения баллов |
| 省控线 | provincial control line | 省控线（省の合格基準線） | 省控线(성의 합격 기준선) | línea de control provincial | провинциальная контрольная линия |
| 赋分 | grade conversion | 赋分（等級換算） | 赋分(등급 환산) | conversión de notas por niveles | пересчёт в уровневые баллы |
| 位次 | rank / percentile band | 順位帯 | 석차 구간 | banda de puestos | диапазон мест |
| 班排 / 年排 | class rank / grade rank | クラス順位 / 学年順位 | 반 석차 / 학년 석차 | puesto en clase / en curso | место в классе / в параллели |
| 错题本 | mistake notebook | 間違いノート | 오답 노트 | cuaderno de errores | тетрадь ошибок |

> **注意**：数据文件里的字段名（如 CSV 的 `日期,考试名称,科目…`、JSON 的 `province` / `controlLines` / `segments`）属于**程序读取的固定标识**，任何语言版本都不得翻译，示例代码块必须原样保留。

## 新增一种语言

1. 以 `README.en.md` 为模板复制为 `README.<语言代码>.md`（如 `README.de.md`），语言代码用 [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)。
2. 逐节翻译，保持章节数量、表格结构与代码块不变；技术标识符、文件名、命令一律不译。
3. 按下表更新六份 README 顶部的语言切换行（新增语言加在末尾，或在下方表格登记后统一排序）。
4. 在本文件的「语言版本」表中补一行，注明覆盖范围与维护者。
5. 提交 PR，标题用 `docs(i18n): add <语言> README`。

## 需要帮助

如果某个术语在你的语言里有更贴切的说法，或发现某版本与中文版已经脱节，直接开 issue 并附上所在行号即可，不必一次性提交完整 PR。

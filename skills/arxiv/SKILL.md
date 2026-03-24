---
name: arxiv
version: 1.0.0
description: Search, fetch, monitor, and analyse arXiv preprints for academic research
author: tzukwan
---

# arXiv 检索技能

## 描述

arXiv 技能提供对全球最大开放获取预印本平台 arXiv.org 的完整访问能力。支持全文搜索、元数据抓取、持续监控新论文、以及利用 LLM 对论文内容进行深度分析与摘要生成。无需 API 密钥，使用 arXiv 官方 API（atom/json 接口）和 HTML/PDF 抓取。

## 功能列表

- 按关键词、作者、分类、摘要、日期范围进行高级搜索
- 支持 arXiv 查询语法（`ti:`, `au:`, `abs:`, `cat:`, `all:` 等前缀）
- 批量抓取论文元数据（标题、作者、摘要、引用数、arXiv ID）
- 下载 PDF 全文并提取文本内容
- 监控指定查询条件，定期推送新增论文
- 使用 LLM 生成论文摘要、关键贡献列表、方法论分析
- 按 arXiv 分类（cs.AI, q-bio, stat.ML 等）筛选结果
- 导出检索结果为 JSON、CSV、BibTeX、Markdown 格式

## 命令

- `search`
- `fetch`
- `monitor`
- `analyze`

## 使用示例

### CLI 调用示例

```bash
# 搜索最近 30 天内关于 LLM 推理的论文，最多返回 20 篇
tzukwan arxiv search "large language model reasoning" --days 30 --limit 20

# 通过 arXiv ID 抓取指定论文完整元数据
tzukwan arxiv fetch 2401.12345

# 批量抓取多篇论文
tzukwan arxiv fetch 2401.12345 2312.09876 2401.00001

# 监控 cs.AI 类别中关于 multi-agent 的新论文，每天检查一次
tzukwan arxiv monitor "multi-agent" --category cs.AI --interval 24h

# 对抓取的论文进行 LLM 深度分析
tzukwan arxiv analyze 2401.12345 --aspects contributions,methods,limitations

# 将搜索结果导出为 BibTeX
tzukwan arxiv search "attention mechanism transformer" --format bibtex --output refs.bib
```

### 对话触发示例

```
用户：帮我在 arXiv 上搜索最近关于扩散模型的论文
用户：给我获取 arxiv 2401.12345 这篇论文的详情
用户：帮我分析这篇 arXiv 论文的主要贡献
用户：监控 cs.CV 下关于目标检测的新论文
用户：把这些论文导出成 BibTeX 格式
```

## 触发词

- `arxiv`
- `arXiv`
- `preprint`
- `预印本`
- `搜索论文`
- `查找论文`
- `检索论文`
- `fetch paper`
- `download paper`

## 数据源/API 依赖

| 服务 | 接口 | 用途 | 认证 |
|------|------|------|------|
| arXiv API | `https://export.arxiv.org/api/query` | 全文搜索与元数据 | 无需 |
| arXiv HTML | `https://arxiv.org/abs/{id}` | 补充元数据抓取 | 无需 |
| arXiv PDF | `https://arxiv.org/pdf/{id}` | PDF 全文下载 | 无需 |
| Semantic Scholar | `https://api.semanticscholar.org/graph/v1` | 引用数据增强 | 可选（API Key） |

**速率限制：** arXiv API 建议请求间隔 ≥3 秒，批量请求请分批处理。

## 输出格式

### search / fetch 默认输出（Markdown）

```markdown
## 检索结果：large language model reasoning（共 20 篇）

### 1. Chain-of-Thought Prompting Elicits Reasoning in Large Language Models
- **arXiv ID：** 2201.11903
- **作者：** Jason Wei, Xuezhi Wang, Dale Schuurmans, ...
- **分类：** cs.CL, cs.AI
- **发布日期：** 2022-01-28
- **摘要：** We explore how generating a chain of thought...
- **链接：** https://arxiv.org/abs/2201.11903
```

### analyze 输出（结构化 Markdown）

```markdown
## 论文分析：[论文标题]

### 核心贡献
1. 提出了 X 方法
2. 在 Y 数据集上取得 Z 的性能

### 方法论
...

### 局限性
...

### 与相关工作的关系
...
```

### BibTeX 导出格式

```bibtex
@article{wei2022chain,
  title={Chain-of-Thought Prompting Elicits Reasoning in Large Language Models},
  author={Wei, Jason and Wang, Xuezhi and ...},
  journal={arXiv preprint arXiv:2201.11903},
  year={2022}
}
```

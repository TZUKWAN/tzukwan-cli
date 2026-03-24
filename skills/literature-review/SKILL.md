---
name: literature-review
version: 1.0.0
description: 多源学术文献检索与结构化综述生成，支持 arXiv/PubMed/Semantic Scholar/OpenAlex
author: tzukwan
---

# Literature Review — 文献综述生成技能

## 描述

Literature Review 技能提供完整的文献综述自动化生成能力。通过同时检索 arXiv、PubMed、Semantic Scholar、OpenAlex 四大学术数据源，对检索结果去重、筛选、聚类，最终利用 LLM 生成具有学术严谨性的结构化综述文档。支持 Markdown 与 LaTeX 两种输出格式，引用格式涵盖 APA、MLA、Chicago、GB/T 7714 四大标准。

## 功能列表

- **多源并行检索**：同时查询 4 个学术数据库，自动对结果去重（基于 DOI、arXiv ID、标题相似度）
- **智能排序与筛选**：按引用数、发布日期、相关度的加权综合评分排序
- **自动聚类分析**：将文献按方法论、应用领域、时间阶段自动分组
- **研究趋势分析**：生成研究热度时间序列图（基于发表数量与引用增长）
- **研究空白识别**：通过文献覆盖密度分析，自动标注未被充分探索的研究方向
- **结构化综述生成**：按标准学术综述结构组织内容，LLM 负责写作与论证
- **引文格式化**：支持 APA 7th、MLA 9th、Chicago 17th、GB/T 7714-2015
- **导出**：Markdown + LaTeX 双格式同步输出，附完整 BibTeX 文件

## 命令

- `search`
- `generate`
- `cluster`
- `gaps`
- `export`

## 综述结构

生成的文献综述包含以下标准章节：

```
1. 引言（Introduction）
   - 研究背景与重要性
   - 综述范围与方法说明
   - 文章组织结构

2. 文献检索方法（Search Methodology）
   - 检索数据库列表
   - 检索关键词与布尔逻辑
   - 纳入/排除标准（Inclusion/Exclusion Criteria）
   - PRISMA 筛选流程图（可选）

3. 方法分类（Methodology Taxonomy）
   - 按技术路线/算法类别分小节
   - 各类方法的代表性工作摘要
   - 方法间的对比分析表格

4. 应用领域（Application Domains）
   - 各垂直应用场景的研究综述
   - 真实世界数据集与基准测试汇总

5. 研究趋势（Research Trends）
   - 近 5 年发表量趋势图
   - 主要技术方向演进时间线
   - 当前研究热点识别

6. 研究空白与未来方向（Research Gaps & Future Directions）
   - 现有工作的系统性局限
   - 值得探索的开放问题列表
   - 新兴交叉领域机遇

7. 结论（Conclusion）
   - 综述核心发现
   - 对领域发展的判断

参考文献（References）
```

## 使用示例

```bash
# 生成关于图神经网络的综述（默认检索近 5 年，最多 100 篇）
tzukwan literature-review generate "graph neural networks" --years 5 --limit 100

# 检索 PubMed 中关于 COVID-19 药物治疗的文献
tzukwan literature-review search "COVID-19 drug treatment" --sources pubmed --limit 50

# 对检索结果进行方法论聚类
tzukwan literature-review cluster --input results.json --method kmeans

# 识别某领域的研究空白
tzukwan literature-review gaps "explainable AI in healthcare"

# 导出为 LaTeX 格式，使用 IEEE 样式
tzukwan literature-review export --format latex --citation ieee --output review.tex

# 生成完整综述，使用 GB/T 7714 中文引用格式
tzukwan literature-review generate "量子计算机器学习" \
  --lang zh \
  --citation gbt7714 \
  --format markdown \
  --output ./review/
```

### 对话触发示例

```
用户：帮我做一个关于强化学习在机器人领域应用的文献综述
用户：检索最近 3 年关于 BERT 改进工作的文献
用户：这个研究领域有哪些研究空白？
用户：把文献综述导出成 LaTeX 格式
用户：用 APA 格式整理这些参考文献
```

## 触发词

- `literature review`
- `文献综述`
- `综述`
- `survey`
- `systematic review`
- `文献调研`
- `相关工作`
- `related work`
- `研究现状`
- `文献检索`

## 数据源/API 依赖

| 数据库 | API 端点 | 覆盖范围 | 认证要求 |
|--------|----------|----------|----------|
| arXiv | `https://export.arxiv.org/api/query` | CS, 物理, 数学, 统计, 生物 | 无需 |
| PubMed E-utilities | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` | 生物医学, 生命科学 | 无需（有速率限制） |
| Semantic Scholar | `https://api.semanticscholar.org/graph/v1/paper/search` | 全学科 | 可选（API Key 提升速率） |
| OpenAlex | `https://api.openalex.org/works` | 全学科开放引用数据 | 无需（邮箱 polite pool） |

**建议配置：**
```yaml
# ~/.tzukwan/config.yaml
apis:
  semantic_scholar_key: "your-key"   # 提升至每分钟 100 请求
  pubmed_api_key: "your-key"         # 提升至每秒 10 请求
  openalex_email: "you@example.com"  # 进入 polite pool
```

## 输出格式

### Markdown 输出结构

```markdown
# 文献综述：[主题]

**检索时间：** 2024-01-15
**文献数量：** 87 篇（初始检索 342 篇，筛选后 87 篇）
**数据来源：** arXiv (45), Semantic Scholar (28), PubMed (14)

## 1. 引言
...

## 2. 文献检索方法
...
```

### LaTeX 输出（适配 IEEEtran / ACM / Elsarticle）

```latex
\documentclass[journal]{IEEEtran}
\usepackage{cite}
...
\begin{document}
\section{Introduction}
...
\bibliographystyle{IEEEtran}
\bibliography{references}
\end{document}
```

### BibTeX 引用条目示例（GB/T 7714 风格）

```bibtex
@article{vaswani2017attention,
  author    = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and ...},
  title     = {Attention Is All You Need},
  journal   = {Advances in Neural Information Processing Systems},
  volume    = {30},
  year      = {2017},
  url       = {https://arxiv.org/abs/1706.03762}
}
```

### 引用格式对照

| 格式 | 示例 |
|------|------|
| APA 7th | Vaswani, A., et al. (2017). Attention is all you need. *NeurIPS*, 30. |
| MLA 9th | Vaswani, Ashish, et al. "Attention Is All You Need." *NeurIPS* 30 (2017). |
| Chicago 17th | Vaswani, Ashish, et al. "Attention Is All You Need." *NeurIPS* 30 (2017). |
| GB/T 7714-2015 | VASWANI A, SHAZEER N, et al. Attention is all you need[J]. NeurIPS, 2017, 30. |

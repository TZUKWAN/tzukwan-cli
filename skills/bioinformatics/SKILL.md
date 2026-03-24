---
name: bioinformatics
version: 1.0.0
description: 生物信息学分析技能，支持序列分析、单细胞RNA-seq、变异注释，集成主流生信数据库
author: tzukwan
---

# Bioinformatics — 生物信息学技能

## 描述

Bioinformatics 技能为计算生物学研究提供全面的分析支持。集成 BioPython、Scanpy、pysam、gget 等主流生物信息学工具库，连接 NCBI、Ensembl、ClinVar、GEO 等核心数据库，支持从基因组序列分析到单细胞转录组学的完整分析流程。配合 LLM 提供分析结果的生物学解释与文献联动，显著降低生物信息学研究的入门门槛。

## 功能列表

- **序列分析（Sequence Analysis）**：BLAST 搜索、序列比对、进化树构建、序列特征提取
- **单细胞 RNA-seq 分析（scRNA-seq）**：质控、降维（PCA/UMAP/t-SNE）、聚类、差异表达、细胞类型注释
- **变异注释（Variant Annotation）**：SNP/INDEL 功能注释、致病性预测、数据库交叉验证
- **基因组数据库查询**：NCBI Gene/Protein/Nucleotide、Ensembl 基因组浏览、GEO 数据集检索
- **通路富集分析（Pathway Enrichment）**：GO 富集、KEGG 通路分析、GSEA
- **蛋白质分析**：UniProt 查询、蛋白质结构预测调用（AlphaFold2/ESMFold API）
- **结果可视化**：热图、UMAP 图、火山图、Circos 图等生物信息学专用图表
- **生物学解释**：LLM 辅助生成分析结果的生物学意义解释与假设

## 命令

- `sequence`
- `scrna`
- `variant`
- `pathway`
- `query`

## 支持的分析类型

### 1. 序列分析（sequence 命令）

| 子功能 | 工具 | 描述 |
|--------|------|------|
| BLAST 搜索 | BioPython + NCBI API | 对核苷酸/蛋白质序列进行相似性搜索 |
| 多序列比对 | ClustalW / MUSCLE via BioPython | 构建多序列比对文件（FASTA / CLUSTAL） |
| 进化树构建 | BioPython Phylo | 邻接法/最大似然法构建系统发育树 |
| 序列特征提取 | BioPython SeqUtils | ORF 预测、CpG 岛检测、重复序列识别 |
| 引物设计 | Primer3 via Python wrapper | PCR 引物设计与评估 |

### 2. 单细胞 RNA-seq 分析（scrna 命令）

**支持输入格式：** 10x Genomics cellranger 输出、AnnData (.h5ad)、Seurat RDS、MEX 格式

**标准分析流程：**
```
原始计数矩阵
    │
    ▼
质控（QC）
    ├── 过滤低质量细胞（最小基因数、最大线粒体基因比例）
    └── 过滤低表达基因
    │
    ▼
数据标准化与对数变换（Scanpy: sc.pp.normalize_total + sc.pp.log1p）
    │
    ▼
高变基因选择（sc.pp.highly_variable_genes）
    │
    ▼
降维（PCA → UMAP / t-SNE）
    │
    ▼
聚类（Leiden / Louvain 算法）
    │
    ▼
差异表达分析（sc.tl.rank_genes_groups: Wilcoxon / t-test）
    │
    ▼
细胞类型注释（gget celltype / CellTypist / 手动标记）
    │
    ▼
轨迹推断（scVelo / PAGA）
    │
    ▼
可视化报告（UMAP + 热图 + 小提琴图）
```

### 3. 变异注释（variant 命令）

**输入格式：** VCF 文件、rsID 列表、HGVS 表示

| 注释来源 | 信息类型 |
|----------|----------|
| ClinVar | 临床致病性分类（Pathogenic/Likely Pathogenic/VUS/Benign） |
| dbSNP | rs ID 对应关系、等位基因频率（gnomAD） |
| Ensembl VEP | 功能效应预测（missense/nonsense/synonymous） |
| ClinGen | 基因-疾病关联证据强度 |
| COSMIC | 肿瘤体细胞突变数据库 |

## 使用示例

```bash
# BLAST 搜索一个核苷酸序列
tzukwan bioinformatics sequence blast \
  --input ATGCGATCGATCGATCGATCG \
  --database nt \
  --organism "Homo sapiens"

# 分析 10x scRNA-seq 数据
tzukwan bioinformatics scrna analyze \
  --input ./data/filtered_feature_bc_matrix/ \
  --min-genes 200 \
  --max-mito 0.2 \
  --resolution 0.5 \
  --output ./results/scrnaseq/

# 对 VCF 文件进行变异注释
tzukwan bioinformatics variant annotate \
  --input variants.vcf \
  --databases clinvar,gnomad,vep \
  --output annotated_variants.tsv

# 对差异表达基因列表进行 GO 富集分析
tzukwan bioinformatics pathway enrichment \
  --genes BRCA1,TP53,EGFR,KRAS,MYC \
  --analysis go,kegg \
  --organism human \
  --output pathway_results/

# 通过 gget 查询基因信息
tzukwan bioinformatics query gene BRCA1 \
  --databases ensembl,ncbi,uniprot \
  --include-orthologs

# 搜索 GEO 中的 scRNA-seq 数据集
tzukwan bioinformatics query geo \
  --query "single cell RNA-seq breast cancer" \
  --type Series \
  --limit 20
```

### 对话触发示例

```
用户：帮我用 BLAST 搜索这个序列：ATGCGATCG...
用户：分析一下这个 scRNA-seq 数据，找出不同的细胞亚型
用户：这些 SNP 位点的临床意义是什么？
用户：对这个差异表达基因列表做通路富集分析
用户：查询 TP53 基因的详细信息
用户：在 GEO 上找一些肿瘤免疫相关的单细胞数据集
```

## 触发词

- `bioinformatics`
- `生物信息`
- `scRNA-seq`
- `单细胞`
- `single cell`
- `BLAST`
- `序列比对`
- `基因组`
- `variant`
- `变异注释`
- `pathway enrichment`
- `通路富集`
- `KEGG`
- `Gene Ontology`
- `差异表达`

## 集成工具库

| 库名 | 版本要求 | 用途 |
|------|----------|------|
| BioPython | ≥1.81 | 序列处理、NCBI API 访问、进化树构建 |
| Scanpy | ≥1.9 | 单细胞 RNA-seq 分析全流程 |
| pysam | ≥0.21 | SAM/BAM/VCF 文件处理 |
| gget | ≥0.28 | 快速查询基因组数据库（Ensembl、UniProt、PDB） |
| pandas / numpy | ≥2.0 / ≥1.24 | 数据处理基础库 |
| matplotlib / seaborn | ≥3.8 / ≥0.13 | 可视化 |
| scipy / statsmodels | ≥1.11 / ≥0.14 | 统计检验 |

**安装命令：**
```bash
pip install biopython scanpy pysam gget pandas numpy matplotlib seaborn scipy statsmodels
```

## 连接的数据库

| 数据库 | 类型 | 访问方式 | 认证 |
|--------|------|----------|------|
| NCBI (Gene/Protein/Nucleotide) | 序列与基因信息 | NCBI E-utilities API | 可选 API Key（提升速率） |
| Ensembl | 基因组注释 | Ensembl REST API / gget | 无需 |
| ClinVar | 临床变异数据 | NCBI E-utilities / 本地 VCF | 无需 |
| GEO (Gene Expression Omnibus) | 基因表达数据集 | NCBI GEO API / GEOparse | 无需 |
| UniProt | 蛋白质数据 | UniProt REST API / gget | 无需 |
| KEGG | 代谢通路 | KEGG REST API | 无需（非商业） |
| Gene Ontology | 本体注释 | OBO / goatools | 无需 |
| gnomAD | 群体变异频率 | gnomAD API | 无需 |
| AlphaFold DB | 蛋白质结构 | AlphaFold API / gget alphafold | 无需 |

## 输出格式

### scRNA-seq 分析报告结构

```
results/scrnaseq/
├── qc_report.html          # 质控报告（细胞数、基因数分布图）
├── umap_clusters.png        # UMAP 聚类图
├── marker_genes_heatmap.png # 各 cluster 标记基因热图
├── cell_type_annotation.csv # 细胞类型注释结果
├── deg_results/             # 差异表达基因结果
│   ├── cluster0_vs_all.csv
│   └── ...
├── pathway_enrichment/      # 通路富集结果
│   ├── go_enrichment.csv
│   └── kegg_pathways.csv
├── adata_processed.h5ad     # 处理后的 AnnData 对象
└── analysis_summary.md      # LLM 生成的生物学解释摘要
```

### 变异注释输出（TSV）

```tsv
CHROM  POS       REF  ALT  rsID        ClinVar_Sig          gnomAD_AF   VEP_Effect
chr17  43044295  G    A    rs28897672  Pathogenic           0.000003    missense_variant
chr17  43091905  A    G    rs80357382  Likely_pathogenic    <0.0001     splice_donor_variant
```

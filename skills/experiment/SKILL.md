---
name: experiment
version: 1.0.0
description: 实验方案生成、代码骨架构建、自动化执行与 PIVOT/REFINE 决策的完整实验管理技能
author: tzukwan
---

# Experiment — 实验设计与执行技能

## 描述

Experiment 技能为学术研究提供端到端的实验管理能力。从研究假设出发，自动生成实验方案、代码骨架、配置文件，支持本地或远程执行，并在实验结束后利用 LLM 对结果进行深度分析。内置 **PIVOT/REFINE 决策引擎**：当主要实验结果不达预期时，自动评估是调整研究假设（PIVOT）还是优化当前方法（REFINE），为研究者提供有据可依的策略建议。

## 功能列表

- **实验方案生成（Design）**：给定研究问题，自动设计实验流程、基线对比、消融实验方案
- **代码骨架生成（Scaffold）**：生成 Python/R/Julia 实验代码骨架，含数据加载、模型定义、训练循环、评估模块
- **实验执行管理（Run）**：管理本地实验运行，追踪超参数与结果，支持并行实验配置
- **结果分析（Analyze）**：统计分析、图表生成、与基线对比的显著性检验
- **PIVOT/REFINE 决策（Decide）**：基于实验结果与预期目标，给出 PIVOT（改变方向）或 REFINE（优化迭代）的量化建议
- **实验日志（Log）**：结构化记录所有实验的超参数、环境信息、结果指标，支持回溯与复现
- **可复现性（Reproduce）**：生成 `requirements.txt`、`Dockerfile`、随机种子固定代码，确保实验可复现

## 命令

- `design`
- `scaffold`
- `run`
- `analyze`
- `decide`

## PIVOT / REFINE 决策逻辑

### 决策框架

当实验完成后，PIVOT/REFINE 引擎自动执行以下评估：

```
输入：
  - 目标指标（如：Accuracy ≥ 85%，F1 ≥ 0.8）
  - 当前实验结果
  - 已尝试的优化方向列表
  - 数据集特征分析
  - 相关文献基准值

评估维度：
  1. 性能差距（Gap）：当前结果与目标之间的差距大小
  2. 优化空间（Headroom）：当前方法在理论上的性能上界
  3. 已耗优化资源（Budget Used）：已尝试的配置数量与多样性
  4. 假设可信度（Hypothesis Validity）：文献支撑强度

决策规则：
  PIVOT 条件（满足任意一项）：
    - 性能差距 > 15% 且优化空间 < 5%
    - 已尝试 ≥ 10 种配置仍未改善
    - 消融实验显示核心假设与数据不符
    - 发现更新的竞争方法使原假设失效

  REFINE 条件（满足以下多项）：
    - 性能差距 < 15%
    - 优化空间 > 8%（通过模型容量分析估算）
    - 发现了明确的性能瓶颈（如过拟合、数据不平衡）
    - 超参数搜索尚未充分覆盖关键区间
```

### PIVOT 后的行动建议

```
PIVOT 建议通常包含：
1. 当前假设失败的根本原因分析
2. 2–3 个替代研究假设（按可行性排序）
3. 如何复用已有实验数据/代码
4. 预计各替代方向的工作量评估
```

### REFINE 后的行动建议

```
REFINE 建议通常包含：
1. 诊断出的具体瓶颈（附证据）
2. 优先级排序的优化策略列表：
   - 数据层面（增强/清洗/重采样）
   - 模型层面（架构调整/正则化）
   - 训练层面（学习率调度/批大小/优化器）
3. 建议的下一组实验配置（附超参数范围）
```

## 使用示例

```bash
# 为一个分类任务生成完整实验方案
tzukwan experiment design \
  --hypothesis "Transformer encoder outperforms BiLSTM on clinical NER" \
  --dataset MIMIC-III \
  --metric f1,accuracy \
  --baseline bert-base,roberta-base,biLSTM

# 生成 PyTorch 实验代码骨架
tzukwan experiment scaffold \
  --framework pytorch \
  --task text-classification \
  --model transformer \
  --output ./experiments/clinical_ner/

# 运行实验（本地，带实验追踪）
tzukwan experiment run ./experiments/clinical_ner/ \
  --config config.yaml \
  --seed 42,123,456 \
  --log mlflow

# 分析实验结果并生成报告
tzukwan experiment analyze ./experiments/clinical_ner/results/ \
  --baseline biLSTM \
  --significance-test wilcoxon \
  --plot boxplot,learning_curve

# 执行 PIVOT/REFINE 决策
tzukwan experiment decide \
  --results ./experiments/clinical_ner/results/summary.json \
  --target "f1 >= 0.85" \
  --budget 8
```

### 对话触发示例

```
用户：帮我设计一个对比实验，验证我的方法比 baseline 好
用户：生成一个 PyTorch 实验代码骨架，用于图像分类
用户：分析一下实验结果，为什么准确率只有 72%？
用户：实验结果没有达到预期，我应该继续优化还是换方向？
用户：帮我做消融实验分析
```

## 触发词

- `experiment`
- `实验`
- `实验设计`
- `baseline comparison`
- `消融实验`
- `ablation study`
- `PIVOT`
- `REFINE`
- `实验方案`
- `代码骨架`
- `scaffold`
- `实验结果`
- `reproduce`

## 数据源/API 依赖

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| Python ≥ 3.9 | 实验代码执行环境 | 系统预装 |
| PyTorch / TensorFlow / JAX | 深度学习框架 | pip（按需） |
| scikit-learn | 传统机器学习基线 | `pip install scikit-learn` |
| MLflow / Weights & Biases | 实验追踪（可选） | `pip install mlflow` |
| matplotlib / seaborn | 结果可视化 | `pip install matplotlib seaborn` |
| scipy / statsmodels | 统计检验 | `pip install scipy statsmodels` |

## 输出格式

### 实验方案文档

```markdown
# 实验方案：Transformer vs BiLSTM on Clinical NER

## 研究假设
Transformer encoder 在临床命名实体识别（NER）任务上优于双向 LSTM。

## 评估指标
- 主要指标：Entity-level F1 score（macro）
- 次要指标：Precision, Recall, Inference Time (ms)

## 实验配置矩阵

| 配置 ID | 模型 | 预训练权重 | Dropout | LR |
|---------|------|-----------|---------|-----|
| E01 | bert-base-uncased | bert-base | 0.1 | 2e-5 |
| E02 | roberta-base | roberta-base | 0.1 | 2e-5 |
| E03 | biLSTM (baseline) | GloVe-840B | 0.3 | 1e-3 |

## 消融实验
- ABlation-A：去除 CRF 层（验证序列标注头的重要性）
- Ablation-B：使用随机初始化（验证预训练的贡献）

## 统计检验方案
- 每个配置运行 3 次（seed=42,123,456）
- 使用 Wilcoxon 符号秩检验比较主要指标
- 显著性阈值 p < 0.05
```

### 生成的代码骨架结构

```
experiments/clinical_ner/
├── config.yaml              # 超参数配置
├── train.py                 # 主训练脚本
├── evaluate.py              # 评估脚本
├── model/
│   ├── __init__.py
│   ├── transformer_ner.py   # Transformer NER 模型
│   └── lstm_ner.py          # BiLSTM baseline 模型
├── data/
│   ├── __init__.py
│   └── mimic_dataset.py     # 数据加载器
├── utils/
│   ├── metrics.py           # 评估指标计算
│   └── logging_utils.py     # 实验日志工具
├── requirements.txt
├── Dockerfile
└── README.md
```

### PIVOT/REFINE 决策报告

```markdown
## PIVOT/REFINE 决策报告

**实验：** clinical_ner_transformer
**当前最佳结果：** F1 = 0.741
**目标：** F1 ≥ 0.850
**已尝试配置数：** 8

### 决策：**REFINE** ✓

**置信度：** 78%

**性能差距分析：**
- 当前差距：10.9%（0.850 - 0.741）
- 预估优化上界：F1 ≈ 0.87（基于领域内 SOTA 文献）
- 优化空间充足（12.9%）

**瓶颈诊断：**
1. 训练集医学实体注释密度不均衡（Disease:71%, Drug:18%, Gene:11%）
2. 当前学习率 2e-5 偏高，验证集 Loss 在 epoch 8 出现震荡
3. 未使用领域预训练模型（如 BioBERT, PubMedBERT）

**优先优化策略：**
1. [高优先级] 换用 BioBERT / PubMedBERT 预训练权重
2. [高优先级] 对少数类实体（Gene）使用类别加权损失
3. [中优先级] 学习率调整至 5e-6，配合 warmup
4. [低优先级] 增加训练数据集（NCBI-Disease, BC5CDR）

**建议下一组实验配置：**
| 配置 | 模型 | LR | 损失加权 |
|------|------|----|----------|
| E09 | biobert-v1.2 | 5e-6 | 是 |
| E10 | pubmedbert-base | 5e-6 | 是 |
| E11 | bert-base + BC5CDR | 2e-5 | 是 |
```

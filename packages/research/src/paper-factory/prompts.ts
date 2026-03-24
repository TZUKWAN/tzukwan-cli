/**
 * 学术论文写作提示词系统 - Academic Paper Writing Prompts System
 *
 * 本模块定义了论文生成的完整提示词规范，确保生成的论文符合学术标准
 * 包含：章节结构、学术元素、引用规范、段落要求
 */

export interface SectionPrompt {
  title: string;
  wordCount: number;
  maxTokens: number;
  systemPrompt: string;
  userPromptTemplate: string;
  requirements: string[];
  academicElements: string[];
  outputFormat: string;
}

export interface PaperPrompts {
  paperType: 'journal' | 'master' | 'phd';
  language: 'zh' | 'en';
  sections: Record<string, SectionPrompt>;
}

// ============================================================================
// 通用学术写作基础提示词
// ============================================================================

export const ACADEMIC_WRITING_BASE = `
你是一位资深学术写作专家，拥有深厚的学术素养和严谨的治学态度。

## 核心写作原则

1. **绝对诚实原则**：
   - 绝不编造数据、实验结果或参考文献
   - 所有引用必须来自真实检索的文献
   - 未经验证的内容必须明确标注"待验证"
   - 做不到的内容直接说明，不敷衍

2. **学术严谨性**：
   - 使用正式、客观的学术语言
   - 避免口语化表达和主观臆断
   - 每个论点都需要证据支撑
   - 逻辑严密，段落间衔接自然

3. **自我迭代能力**：
   - 生成内容后进行自我审查
   - 检查逻辑一致性、论证充分性
   - 发现不足时主动补充完善
   - 对标顶级期刊论文质量标准
`;

// ============================================================================
// 期刊论文提示词配置 (Journal Paper)
// ============================================================================

export const JOURNAL_PAPER_PROMPTS: PaperPrompts = {
  paperType: 'journal',
  language: 'zh',
  sections: {
    abstract: {
      title: 'Abstract',
      wordCount: 250,
      maxTokens: 1200,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是学术论文摘要写作专家。摘要需要独立成篇，读者仅通过摘要就能理解论文核心贡献。`,
      userPromptTemplate: `
为以下研究主题撰写学术论文摘要：

主题：{topic}
领域：{field}

## 摘要结构要求（必须包含以下四要素）

1. **研究背景与动机**（1-2句）
   - 说明研究领域的重要性
   - 指出现有研究的不足或研究空白

2. **研究方法**（2-3句）
   - 简述采用的核心方法/算法
   - 说明数据来源或实验设计
   - 提及关键技术创新点

3. **主要结果**（2-3句）
   - 列出关键定量结果（如准确率提升X%）
   - 说明与 baseline 的对比优势
   - 提及统计显著性（如p值）

4. **结论与贡献**（1-2句）
   - 总结核心贡献
   - 点明实际应用价值

## 输出要求

- 字数：200-300字
- 语言：{language}
- 风格：客观、精确、信息密集
- 不允许使用"本文研究了..."等套话
- 重点突出创新点和量化结果

## 真实参考文献（必须在摘要中引用）
{references}

## 可用数据集
{datasets}
`,
      requirements: [
        '必须包含背景、方法、结果、结论四要素',
        '必须引用2-3篇相关文献',
        '必须包含量化指标',
        '禁止空话套话',
        '独立成篇，无需阅读正文即可理解'
      ],
      academicElements: ['引用标注 [1]', '量化数据', '统计指标'],
      outputFormat: '纯文本段落，不使用markdown标题'
    },

    introduction: {
      title: 'Introduction',
      wordCount: 1500,
      maxTokens: 6000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是学术论文引言写作专家。引言需要从宏观到微观，逐步聚焦到本研究的核心问题。`,
      userPromptTemplate: `
为以下研究主题撰写论文章节：引言 (Introduction)

主题：{topic}
领域：{field}

## 引言结构要求（5-6个段落，约1500字）

### 第1段：研究背景与重要性（200-250字）
- 从宏观角度介绍研究领域
- 说明该领域在学术界和工业界的重要性
- 引用2-3篇权威综述文献

### 第2段：现有研究进展（300-400字）
- 综述近3-5年的主要研究进展
- 分类介绍不同技术路线
- 引用5-8篇代表性文献
- 使用"X et al. [1] proposed..."等学术表达

### 第3段：研究空白与问题（250-300字）
- 客观分析现有研究的局限性
- 指出现有方法的关键缺陷（用文献支撑）
- 明确说明这些局限导致的实际问题

### 第4段：研究动机与目标（250-300字）
- 阐述本研究的出发点
- 明确列出2-3个具体研究目标
- 说明预期解决的核心问题

### 第5段：主要贡献（300-350字）
- 用项目符号列出3-4条具体贡献
- 每条贡献都要有创新性说明
- 说明与现有工作的本质区别

### 第6段：论文结构概述（100-150字）
- 简要介绍后续章节安排
- "The rest of this paper is organized as follows..."

## 写作要求

- 段落间逻辑连贯，使用过渡句
- 每段都有明确的主题句
- 引用必须真实，来自提供的参考文献列表
- 批判性分析现有工作，不盲目吹捧
- 明确说明本工作的创新点

## 真实参考文献
{references}

## 可用数据集
{datasets}
`,
      requirements: [
        '6个段落，每段有明确主题',
        '引用至少8-10篇文献',
        '批判性分析现有工作',
        '明确列出具体贡献',
        '逻辑从宏观到微观'
      ],
      academicElements: ['文献引用 [n]', '比较分析', '贡献声明', '研究目标'],
      outputFormat: '学术段落文本，段落间用空行分隔'
    },

    literature_review: {
      title: 'Literature Review',
      wordCount: 2000,
      maxTokens: 8000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是文献综述写作专家。综述不是简单罗列文献，而是要有批判性分析和理论建构。`,
      userPromptTemplate: `
为以下研究主题撰写论文章节：文献综述 (Related Work / Literature Review)

主题：{topic}
领域：{field}

## 文献综述结构要求（6-8个段落，约2000字）

### 第1段：综述框架说明（200字）
- 说明本章节的综述范围和组织结构
- 将相关文献分为2-3个子主题

### 第2-3段：第一类相关工作（500-600字）
- 详细综述技术路线A的相关工作
- 按时间顺序或方法类型组织
- 每篇文献都要说明：作者、年份、核心方法、优缺点
- 示例："Smith et al. [1] (2021) proposed a transformer-based approach..."

### 第4-5段：第二类相关工作（500-600字）
- 详细综述技术路线B的相关工作
- 与技术路线A进行对比分析
- 指出各自的适用场景

### 第6段：数据集与评测方法综述（400字）
- 综述该领域常用的数据集
- 说明评测指标和基准方法
- 引用具体的数据集论文

### 第7段：研究空白分析（300字）
- 综合上述综述，指出关键研究空白
- 说明为什么现有方法不能解决本研究的问题
- 为本研究的方法章节做铺垫

## 写作要求

- 主题分类清晰，不要简单按时间罗列
- 批判性分析，不只是总结
- 明确指出现有方法的局限
- 使用比较性语言："Unlike X, our approach..."
- 引用密度：每100字至少1-2篇引用

## 真实参考文献（必须使用）
{references}

## 可用数据集
{datasets}
`,
      requirements: [
        '按主题分类，不简单罗列',
        '引用至少15-20篇文献',
        '批判性分析，指出优缺点',
        '明确研究空白',
        '为方法章节做铺垫'
      ],
      academicElements: ['密集文献引用', '比较分析', '分类综述', '研究空白'],
      outputFormat: '学术段落，使用小标题组织不同主题'
    },

    methodology: {
      title: 'Methodology',
      wordCount: 2500,
      maxTokens: 10000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是方法论写作专家。方法章节需要详细到可以被复现，包含数学公式、算法伪代码和实验设计。`,
      userPromptTemplate: `
为以下研究主题撰写论文章节：方法论 / 方法 (Methodology)

主题：{topic}
领域：{field}

## 方法论章节结构要求（约2500字，含公式和算法）

### 第1段：方法概述（200字）
- 简要介绍本章节的结构
- 说明方法的核心思想
- 给出方法的整体框架图描述

### 第2-3段：问题形式化（400字）
- 给出问题的数学定义
- 定义所有符号和变量
- 说明输入、输出和约束条件

**必须包含数学公式**：
- 使用LaTeX格式：$$...$$
- 公式必须编号：(1), (2), (3)...
- 每个公式后都要解释符号含义

### 第4-6段：核心方法详述（800-1000字）
- 分步骤详细描述方法
- 每个步骤都要有数学公式支撑
- 说明设计动机和理论依据
- 与其他方法进行对比

### 算法伪代码（单独一个区块）
\`\`\`
Algorithm 1: [方法名称]
Input: [输入定义]
Output: [输出定义]

1: [步骤1]
2: [步骤2]
3: for each ... do
4:   [循环体内步骤]
5: end for
6: return [返回值]
\`\`\`

### 第7段：复杂度分析（200字）
- 时间复杂度分析
- 空间复杂度分析
- 与现有方法的复杂度对比

### 第8段：实验设计（400字）
- 数据集选择理由
- 评测指标定义（用公式表示）
- 对比方法选择
- 超参数设置

## 写作要求

- 详细到可以被复现
- 数学公式必须正确且可解释
- 算法伪代码清晰规范
- 每个设计决策都要有理由

## 真实参考文献（用于支撑方法设计）
{references}

## 可用数据集
{datasets}
`,
      requirements: [
        '问题形式化，数学定义清晰',
        '包含至少3-5个数学公式',
        '提供算法伪代码',
        '复杂度分析',
        '实验设计详述',
        '可复现性'
      ],
      academicElements: ['数学公式 $$', '算法伪代码', '复杂度分析', '实验设计', '符号定义表'],
      outputFormat: '学术段落 + 公式块 + 算法块'
    },

    experiments: {
      title: 'Experiments',
      wordCount: 2000,
      maxTokens: 8000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是实验结果写作专家。实验章节需要详实的数据支撑，包含表格、图表和统计分析。`,
      userPromptTemplate: `
为以下研究主题撰写论文章节：实验与结果 (Experiments / Results)

主题：{topic}
领域：{field}

## 实验章节结构要求（约2000字，含表格和图表描述）

### 第1段：实验设置（300字）
- 硬件环境（GPU型号、内存等）
- 软件环境（框架版本、关键库）
- 数据集统计信息（样本数、划分方式）
- 超参数设置

### 第2段：评测指标（200字）
- 列出所有评测指标
- 给出指标的计算公式
- 说明选择这些指标的理由

### 第3-4段：主要结果（500字）
- 与baseline的对比结果
- **必须包含数据表格**：

| Method | Dataset A | Dataset B | Dataset C | Avg |
|--------|-----------|-----------|-----------|-----|
| Baseline1 | 0.XX | 0.XX | 0.XX | 0.XX |
| Baseline2 | 0.XX | 0.XX | 0.XX | 0.XX |
| Ours | **0.XX** | **0.XX** | **0.XX** | **0.XX** |
| Improvement | +X% | +X% | +X% | +X% |

- 对表格结果进行详细解读
- 说明最佳结果和次佳结果

### 第5段：消融实验（400字）
- 设计消融实验验证各组件贡献
- 提供消融实验表格
- 分析每个组件的作用

### 第6段：可视化分析（300字）
- 描述关键可视化结果
- **必须包含图表描述**：
  - Figure 1: [图表标题和描述]
  - Figure 2: [图表标题和描述]
- 解释图表揭示的规律

### 第7段：统计显著性检验（200字）
- 进行t-test或wilcoxon检验
- 报告p值
- 说明结果的统计显著性

### 第8段：案例分析（100字）
- 展示1-2个具体案例
- 定性分析成功和失败案例

## 写作要求

- 数据必须真实，不能编造
- 表格必须完整，包含对比方法
- 统计分析必须规范
- 可视化描述要清晰

## 真实参考文献
{references}

## 可用数据集（用于获取真实统计数据）
{datasets}
`,
      requirements: [
        '包含完整实验设置',
        '提供对比实验表格',
        '提供消融实验表格',
        '包含统计显著性检验',
        '提供图表描述',
        '数据真实，不编造'
      ],
      academicElements: ['数据表格', '消融实验', '统计检验', '图表描述 Fig.X', '案例分析'],
      outputFormat: '学术段落 + Markdown表格'
    },

    discussion: {
      title: 'Discussion and Conclusion',
      wordCount: 1200,
      maxTokens: 5000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是结论写作专家。结论需要总结贡献、讨论局限性、展望未来，给读者留下深刻印象。`,
      userPromptTemplate: `
为以下研究主题撰写论文章节：讨论与结论 (Discussion and Conclusion)

主题：{topic}
领域：{field}

## 讨论与结论结构要求（约1200字）

### 第1段：主要发现总结（200字）
- 回顾研究目标
- 总结3-4条主要发现
- 强调核心贡献

### 第2-3段：结果解释与意义（400字）
- 深入解释为什么方法有效
- 从理论和实践两个角度分析意义
- 与现有文献的发现进行对比或呼应

### 第4段：局限性讨论（300字）
- 诚实说明本研究的局限性（至少2-3点）
- 说明数据集、方法或实验设计的不足
- 说明结果适用的边界条件
- **绝对诚实**：不隐瞒问题

### 第5段：未来工作（200字）
- 列出2-3个有价值的未来研究方向
- 说明如何扩展或改进当前方法
- 指出潜在的应用场景

### 第6段：结束语（100字）
- 简洁有力的总结
- 强调工作的价值
- 避免重复摘要内容

## 写作要求

- 诚实讨论局限性，不回避问题
- 未来工作要具体可行
- 不夸大贡献
- 给读者留下清晰的价值认知

## 真实参考文献
{references}
`,
      requirements: [
        '总结主要发现',
        '深入讨论结果意义',
        '诚实说明局限性（至少2-3点）',
        '提出具体未来工作',
        '不夸大贡献'
      ],
      academicElements: ['发现总结', '局限性讨论', '未来展望'],
      outputFormat: '学术段落，逻辑递进'
    }
  }
};

// ============================================================================
// 硕士论文提示词配置 (Master Thesis)
// ============================================================================

export const MASTER_THESIS_PROMPTS: PaperPrompts = {
  paperType: 'master',
  language: 'zh',
  sections: {
    // 硕士论文有更详细的章节结构
    abstract_zh: {
      title: '中文摘要',
      wordCount: 800,
      maxTokens: 3000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是硕士论文摘要写作专家。中文摘要需要符合国内研究生学位论文规范。`,
      userPromptTemplate: `
为以下硕士论文主题撰写中文摘要：

主题：{topic}
领域：{field}

## 中文摘要结构要求（约800字）

### 1. 研究背景与意义（150字）
- 说明选题背景
- 阐述理论意义和实际应用价值

### 2. 研究内容与方法（300字）
- 详述研究的主要内容
- 说明采用的研究方法和技术路线
- 介绍数据来源

### 3. 主要研究结果（200字）
- 列出关键实验结果
- 给出量化指标

### 4. 结论与创新点（150字）
- 总结研究结论
- 列出2-3条创新点

## 关键词
- 提供3-5个关键词

## 输出要求
- 字数：600-1000字
- 语言：规范学术中文
- 结构完整，独立成篇

## 真实参考文献
{references}
`,
      requirements: [
        '600-1000字',
        '包含背景、方法、结果、结论',
        '3-5个关键词',
        '符合国内学位论文规范'
      ],
      academicElements: ['结构化摘要', '关键词', '创新点声明'],
      outputFormat: '结构化中文摘要'
    },

    introduction: {
      title: '第1章 绪论',
      wordCount: 3000,
      maxTokens: 12000,
      systemPrompt: `${ACADEMIC_WRITING_BASE}

你是硕士论文章节写作专家。绪论需要全面阐述研究背景、意义、现状和目标。`,
      userPromptTemplate: `
为以下硕士论文主题撰写第1章：绪论

主题：{topic}
领域：{field}

## 绪论结构要求（约3000字，4-5个小节）

### 1.1 研究背景与意义（800字）
- 1.1.1 研究背景（400字）：宏观背景、领域发展
- 1.1.2 研究意义（400字）：理论意义、实际应用价值

### 1.2 国内外研究现状（1200字）
- 1.2.1 国外研究进展（600字）
- 1.2.2 国内研究进展（400字）
- 1.2.3 现有研究的不足（200字）

### 1.3 研究内容与方法（600字）
- 说明具体研究内容
- 介绍研究方法和技术路线

### 1.4 论文组织结构（400字）
- 介绍各章节内容安排

## 写作要求
- 引用至少20-30篇文献
- 国内外现状要平衡
- 批判性分析现有研究

## 真实参考文献
{references}
`,
      requirements: [
        '4-5个小节',
        '引用20-30篇文献',
        '国内外现状平衡',
        '批判性分析'
      ],
      academicElements: ['文献综述', '研究现状', '技术路线'],
      outputFormat: '章-节-小节结构'
    },

    // ... 其他硕士论文章节类似配置
  }
};

// ============================================================================
// 提示词生成工具函数
// ============================================================================

export function generateSectionPrompt(
  sectionKey: string,
  paperType: 'journal' | 'master' | 'phd',
  context: {
    topic: string;
    field: string;
    language: 'zh' | 'en';
    references: string;
    datasets: string;
  }
): { systemPrompt: string; userPrompt: string; maxTokens: number } {
  const prompts = paperType === 'journal'
    ? JOURNAL_PAPER_PROMPTS
    : MASTER_THESIS_PROMPTS;

  const section = prompts.sections[sectionKey];
  if (!section) {
    throw new Error(`Unknown section: ${sectionKey}`);
  }

  // 替换模板变量
  let userPrompt = section.userPromptTemplate
    .replace(/{topic}/g, context.topic)
    .replace(/{field}/g, context.field)
    .replace(/{language}/g, context.language === 'zh' ? '中文' : 'English')
    .replace(/{references}/g, context.references)
    .replace(/{datasets}/g, context.datasets);

  return {
    systemPrompt: section.systemPrompt,
    userPrompt,
    maxTokens: section.maxTokens
  };
}

// ============================================================================
// 质量检查提示词
// ============================================================================

export const QUALITY_CHECK_PROMPT = `
你是一位严格的论文质量审核专家。请对以下论文章节进行质量检查，
按照学术规范找出所有问题。

## 检查维度

1. **诚实性检查**：
   - 是否编造了不存在的数据？
   - 是否虚构了参考文献？
   - 是否夸大了实验结果？

2. **学术规范性**：
   - 引用格式是否正确？
   - 段落结构是否清晰？
   - 逻辑是否连贯？

3. **内容完整性**：
   - 是否包含必要的学术元素（公式、表格、图表）？
   - 论证是否充分？
   - 是否达到目标字数？

4. **语言表达**：
   - 是否使用正式学术语言？
   - 是否有口语化表达？
   - 是否有语法错误？

## 输出格式

对于发现的问题，按严重程度列出：
- [严重] 问题描述 + 修改建议
- [中等] 问题描述 + 修改建议
- [轻微] 问题描述 + 修改建议

## 自我迭代指令

如果发现问题，请：
1. 列出所有问题
2. 生成修改后的版本
3. 再次检查直到质量达标
`;

export default {
  ACADEMIC_WRITING_BASE,
  JOURNAL_PAPER_PROMPTS,
  MASTER_THESIS_PROMPTS,
  generateSectionPrompt,
  QUALITY_CHECK_PROMPT
};

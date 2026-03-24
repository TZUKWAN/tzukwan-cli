/**
 * 论文学术元素生成器 - Academic Elements Generator
 *
 * 负责生成高质量的论文学术内容，包括：
 * - 段落化学术叙述
 * - 数学公式
 * - 数据表格
 * - 图表描述
 * - 参考文献格式化
 */

import { Dataset } from './dataset-hub.js';

export interface ReferenceLike {
  id?: string;
  title: string;
  authors?: string[];
  published?: string;
  year?: string | number | null;
  doi?: string | null;
  arxivId?: string;
  journal?: string | null;
  url?: string | null;
  source?: string;
}

// ============================================================================
// 学术写作基础配置
// ============================================================================

export const ACADEMIC_WRITING_PRINCIPLES = `
【绝对诚实原则】
1. 绝不编造数据、实验结果或参考文献
2. 所有引用必须来自真实检索的文献
3. 未经验证的内容必须明确标注"待验证"
4. 做不到的内容直接说明，不敷衍

【学术严谨性原则】
1. 使用正式、客观的学术语言
2. 避免口语化表达和主观臆断
3. 每个论点都需要证据支撑
4. 逻辑严密，段落间衔接自然

【自我迭代原则】
1. 生成内容后进行自我审查
2. 检查逻辑一致性、论证充分性
3. 发现不足时主动补充完善
4. 对标顶级期刊论文质量标准
`;

// ============================================================================
// 章节提示词配置
// ============================================================================

export interface SectionConfig {
  key: string;
  title: string;
  wordCount: number;
  maxTokens: number;
  minParagraphs: number;
  maxParagraphs: number;
  systemPrompt: string;
  requirements: string[];
  requiredElements: string[];
}

export const JOURNAL_SECTIONS: SectionConfig[] = [
  {
    key: 'abstract',
    title: 'Abstract',
    wordCount: 250,
    maxTokens: 1500,
    minParagraphs: 1,
    maxParagraphs: 1,
    systemPrompt: `你是学术论文摘要写作专家。摘要需要独立成篇，读者仅通过摘要就能理解论文核心贡献。

${ACADEMIC_WRITING_PRINCIPLES}

【摘要四要素】
1. 背景与动机：研究领域的重要性和现有不足
2. 方法：核心技术创新和方法概述
3. 结果：关键定量结果和对比优势
4. 结论：核心贡献和应用价值`,
    requirements: [
      '必须包含背景、方法、结果、结论四要素',
      '必须引用2-3篇相关文献',
      '必须包含量化指标',
      '禁止空话套话',
      '独立成篇，无需阅读正文即可理解'
    ],
    requiredElements: ['引用标注 [1]', '量化数据', '统计指标']
  },
  {
    key: 'introduction',
    title: 'Introduction',
    wordCount: 1500,
    maxTokens: 6000,
    minParagraphs: 5,
    maxParagraphs: 6,
    systemPrompt: `你是学术论文引言写作专家。引言需要从宏观到微观，逐步聚焦到本研究的核心问题。

${ACADEMIC_WRITING_PRINCIPLES}

【引言结构】
第1段：研究背景与重要性
第2段：现有研究进展（分类综述）
第3段：研究空白与问题
第4段：研究动机与目标
第5段：主要贡献（3-4条具体贡献）
第6段：论文结构概述`,
    requirements: [
      '6个段落，每段有明确主题',
      '引用至少8-10篇文献',
      '批判性分析现有工作',
      '明确列出具体贡献',
      '逻辑从宏观到微观',
      '段落间过渡自然'
    ],
    requiredElements: ['文献引用 [n]', '比较分析', '贡献声明', '研究目标']
  },
  {
    key: 'literature_review',
    title: 'Related Work',
    wordCount: 2000,
    maxTokens: 8000,
    minParagraphs: 6,
    maxParagraphs: 8,
    systemPrompt: `你是文献综述写作专家。综述不是简单罗列文献，而是要有批判性分析和理论建构。

${ACADEMIC_WRITING_PRINCIPLES}

【综述结构】
第1段：综述框架说明（分类方式）
第2-3段：第一类相关工作（技术路线A）
第4-5段：第二类相关工作（技术路线B）
第6段：数据集与评测方法综述
第7段：研究空白分析

【写作要求】
- 按主题分类，不要简单按时间罗列
- 批判性分析，不只是总结
- 明确指出现有方法的局限
- 引用密度：每100字至少1-2篇引用`,
    requirements: [
      '按主题分类，不简单罗列',
      '引用至少15-20篇文献',
      '批判性分析，指出优缺点',
      '明确研究空白',
      '为方法章节做铺垫'
    ],
    requiredElements: ['密集文献引用', '比较分析', '分类综述', '研究空白']
  },
  {
    key: 'methodology',
    title: 'Methodology',
    wordCount: 2500,
    maxTokens: 10000,
    minParagraphs: 7,
    maxParagraphs: 10,
    systemPrompt: `你是方法论写作专家。方法章节需要详细到可以被复现，包含数学公式、算法伪代码和实验设计。

${ACADEMIC_WRITING_PRINCIPLES}

【方法章节结构】
第1段：方法概述
第2-3段：问题形式化（数学定义、符号说明）
第4-6段：核心方法详述（分步骤、公式支撑）
第7段：复杂度分析
第8段：实验设计

【必须包含】
- 数学公式（LaTeX格式，编号）
- 算法伪代码
- 复杂度分析
- 实验设计详述`,
    requirements: [
      '问题形式化，数学定义清晰',
      '包含至少3-5个数学公式',
      '提供算法伪代码',
      '复杂度分析',
      '实验设计详述',
      '可复现性'
    ],
    requiredElements: ['数学公式 $$', '算法伪代码', '复杂度分析', '实验设计', '符号定义表']
  },
  {
    key: 'experiments',
    title: 'Experiments',
    wordCount: 2000,
    maxTokens: 8000,
    minParagraphs: 7,
    maxParagraphs: 8,
    systemPrompt: `你是实验结果写作专家。实验章节需要详实的数据支撑，包含表格、图表和统计分析。

${ACADEMIC_WRITING_PRINCIPLES}

【实验章节结构】
第1段：实验设置（硬件、软件、数据集）
第2段：评测指标（公式、理由）
第3-4段：主要结果（对比表格、详细解读）
第5段：消融实验（组件贡献分析）
第6段：可视化分析（图表描述）
第7段：统计显著性检验
第8段：案例分析

【必须包含】
- 完整的实验设置
- 对比实验表格
- 消融实验表格
- 统计显著性检验
- 图表描述`,
    requirements: [
      '包含完整实验设置',
      '提供对比实验表格',
      '提供消融实验表格',
      '包含统计显著性检验',
      '提供图表描述',
      '数据真实，不编造'
    ],
    requiredElements: ['数据表格', '消融实验', '统计检验', '图表描述 Fig.X', '案例分析']
  },
  {
    key: 'discussion',
    title: 'Discussion and Conclusion',
    wordCount: 1200,
    maxTokens: 5000,
    minParagraphs: 5,
    maxParagraphs: 6,
    systemPrompt: `你是结论写作专家。结论需要总结贡献、讨论局限性、展望未来，给读者留下深刻印象。

${ACADEMIC_WRITING_PRINCIPLES}

【结论结构】
第1段：主要发现总结
第2-3段：结果解释与意义（理论+实践）
第4段：局限性讨论（诚实说明2-3点）
第5段：未来工作（2-3个方向）
第6段：结束语

【写作要求】
- 诚实讨论局限性，不回避问题
- 未来工作要具体可行
- 不夸大贡献`,
    requirements: [
      '总结主要发现',
      '深入讨论结果意义',
      '诚实说明局限性（至少2-3点）',
      '提出具体未来工作',
      '不夸大贡献'
    ],
    requiredElements: ['发现总结', '局限性讨论', '未来展望']
  }
];

// ============================================================================
// 提示词构建器
// ============================================================================

export class PromptBuilder {
  /**
   * 构建章节生成提示词
   */
  buildSectionPrompt(
    section: SectionConfig,
    context: {
      topic: string;
      field: string;
      language: 'zh' | 'en';
      references: ReferenceLike[];
      datasets: Dataset[];
      previousSections?: Record<string, string>;
    }
  ): { system: string; user: string } {
    const refText = this.formatReferences(context.references);
    const datasetText = this.formatDatasets(context.datasets);

    const userPrompt = `
【写作任务】
撰写论文章节：${section.title}

【研究主题】
${context.topic}

【研究领域】
${context.field}

【语言要求】
${context.language === 'zh' ? '中文' : 'English'}

【章节要求】
- 目标字数：${section.wordCount}字
- 段落数：${section.minParagraphs}-${section.maxParagraphs}段
- 每段200-500字

【必须包含的学术元素】
${section.requiredElements.map(e => `- ${e}`).join('\n')}

【写作规范】
${section.requirements.map(r => `- ${r}`).join('\n')}

【真实参考文献】（必须使用）
${refText}

【可用数据集】
${datasetText}
${context.previousSections ? `
【已完成的章节】（保持连贯性）
${Object.entries(context.previousSections)
  .map(([k, v]) => `${k}: ${v.slice(0, 200)}...`)
  .join('\n')}` : ''}

【输出格式】
- 纯学术段落文本
- 段落间用空行分隔
- 包含必要的引用标注 [n]
- 禁止使用markdown标题
- 禁止输出"Here is the..."等套话
`;

    return {
      system: section.systemPrompt,
      user: userPrompt
    };
  }

  /**
   * 构建质量检查提示词
   */
  buildQualityCheckPrompt(section: SectionConfig, content: string): string {
    return `
你是严格的论文质量审核专家。请对以下${section.title}章节进行质量检查。

【待检查内容】
${content.slice(0, 3000)}...

【检查维度】

1. **诚实性检查**：
   - 是否编造了不存在的数据？
   - 是否虚构了参考文献？
   - 是否夸大了实验结果？

2. **学术规范性**：
   - 段落数是否符合要求（${section.minParagraphs}-${section.maxParagraphs}段）？
   - 引用格式是否正确？
   - 是否包含必需的学术元素？

3. **内容完整性**：
   - 论证是否充分？
   - 逻辑是否连贯？
   - 是否达到目标字数？

4. **语言表达**：
   - 是否使用正式学术语言？
   - 是否有口语化表达？

【输出要求】
- 按严重程度列出问题：[严重] [中等] [轻微]
- 给出具体修改建议
- 如果质量达标，明确说明"质量合格"
`;
  }

  /**
   * 构建自我迭代改进提示词
   */
  buildSelfImprovePrompt(
    section: SectionConfig,
    originalContent: string,
    issues: string[]
  ): string {
    return `
你是学术论文自我改进专家。请根据质量问题列表改进以下章节。

【原始内容】
${originalContent}

【需要改进的问题】
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

【章节要求】
${section.requirements.map(r => `- ${r}`).join('\n')}

【改进原则】
1. 保持原有核心内容和观点
2. 修复所有指出的问题
3. 增强学术性和严谨性
4. 确保段落间逻辑连贯
5. 增加必要的引用和支撑

【输出要求】
- 输出完整的改进后章节
- 不要在开头写"Here is the improved version"
- 直接输出改进后的内容
`;
  }

  private formatReferences(papers: ReferenceLike[]): string {
    if (papers.length === 0) return '（暂无可用参考文献）';

    return papers.slice(0, 15).map((p, i) =>
      `[${i + 1}] ${(p.authors ?? []).slice(0, 3).join(', ')}. "${p.title}". arXiv:${p.id}, ${p.published?.slice(0, 4) ?? 'N/A'}.`
    ).join('\n');
  }

  private formatDatasets(datasets: Dataset[]): string {
    if (datasets.length === 0) return '（暂无可用数据集）';

    return datasets.slice(0, 5).map(d =>
      `- ${d.name}: ${d.description} (${d.url})`
    ).join('\n');
  }
}

// ============================================================================
// 参考文献格式化器
// ============================================================================

export class ReferenceFormatter {
  /**
   * 格式化为GB/T 7714格式（国内标准）
   */
  formatGB7714(papers: ReferenceLike[]): string {
    return papers.map((p, i) => {
      const authors = (p.authors ?? []).slice(0, 3).join(', ');
      const year = String(p.year ?? p.published?.slice(0, 4) ?? 'N/A');
      if (p.journal) {
        return `[${i + 1}] ${authors}. ${p.title}[J]. ${p.journal}, ${year}.${p.doi ? ` DOI: ${p.doi}.` : ''}`.trim();
      }
      if (p.arxivId) {
        return `[${i + 1}] ${authors}. ${p.title}[EB/OL]. arXiv:${p.arxivId}, ${year}.${p.doi ? ` DOI: ${p.doi}.` : ''}`.trim();
      }
      return `[${i + 1}] ${authors}. ${p.title}[EB/OL]. ${year}.${p.doi ? ` DOI: ${p.doi}.` : p.url ? ` ${p.url}.` : ''}`.trim();
    }).join('\n');
  }

  /**
   * 格式化为APA格式
   */
  formatAPA(papers: ReferenceLike[]): string {
    return papers.map((p, i) => {
      const authors = (p.authors ?? []).map(a => {
        const parts = a.split(' ');
        const lastName = parts[parts.length - 1];
        const initials = parts.slice(0, -1).map(n => n[0]).join('.');
        return initials ? `${lastName}, ${initials}.` : lastName;
      }).slice(0, 3).join(', ');

      const year = String(p.year ?? p.published?.slice(0, 4) ?? 'n.d.');
      const venue = p.journal ?? (p.arxivId ? `arXiv preprint arXiv:${p.arxivId}` : p.source ?? 'Online source');
      return `[${i + 1}] ${authors} (${year}). ${p.title}. ${venue}.`;
    }).join('\n');
  }

  /**
   * 格式化为IEEE格式
   */
  formatIEEE(papers: ReferenceLike[]): string {
    return papers.map((p, i) => {
      const authors = (p.authors ?? []).slice(0, 3).join(', ');
      const year = String(p.year ?? p.published?.slice(0, 4) ?? 'N/A');
      const venue = p.journal ?? (p.arxivId ? `arXiv preprint arXiv:${p.arxivId}` : p.source ?? 'online');
      return `[${i + 1}] ${authors}, "${p.title}," ${venue}, ${year}.`;
    }).join('\n');
  }
}

// ============================================================================
// 论文学术内容生成器
// ============================================================================

export class AcademicContentGenerator {
  promptBuilder: PromptBuilder;
  referenceFormatter: ReferenceFormatter;

  constructor() {
    this.promptBuilder = new PromptBuilder();
    this.referenceFormatter = new ReferenceFormatter();
  }

  /**
   * 生成完整的论文章节配置
   */
  getSectionConfig(paperType: 'journal' | 'master' | 'phd', sectionKey: string): SectionConfig | null {
    if (paperType === 'journal') {
      return JOURNAL_SECTIONS.find(s => s.key === sectionKey) || null;
    }
    // TODO: 支持master和phd类型
    return JOURNAL_SECTIONS.find(s => s.key === sectionKey) || null;
  }

  /**
   * 获取所有章节配置
   */
  getAllSectionConfigs(paperType: 'journal' | 'master' | 'phd'): SectionConfig[] {
    if (paperType === 'journal') {
      return JOURNAL_SECTIONS;
    }
    return JOURNAL_SECTIONS;
  }

  /**
   * 生成章节提示词
   */
  generateSectionPrompt(
    sectionKey: string,
    paperType: 'journal' | 'master' | 'phd',
    context: {
      topic: string;
      field: string;
      language: 'zh' | 'en';
      references: ReferenceLike[];
      datasets: Dataset[];
      previousSections?: Record<string, string>;
    }
  ): { system: string; user: string; maxTokens: number } | null {
    const section = this.getSectionConfig(paperType, sectionKey);
    if (!section) return null;

    const prompts = this.promptBuilder.buildSectionPrompt(section, context);
    return {
      ...prompts,
      maxTokens: section.maxTokens
    };
  }

  /**
   * 格式化参考文献
   */
  formatReferences(
    papers: ReferenceLike[],
    style: 'gb7714' | 'apa' | 'ieee' = 'gb7714'
  ): string {
    switch (style) {
      case 'apa':
        return this.referenceFormatter.formatAPA(papers);
      case 'ieee':
        return this.referenceFormatter.formatIEEE(papers);
      case 'gb7714':
      default:
        return this.referenceFormatter.formatGB7714(papers);
    }
  }

  /**
   * 验证内容质量
   */
  validateContent(section: SectionConfig, content: string): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // 检查段落数
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 50);
    if (paragraphs.length < section.minParagraphs) {
      issues.push(`段落数不足：${paragraphs.length}段，要求至少${section.minParagraphs}段`);
    }
    if (paragraphs.length > section.maxParagraphs) {
      issues.push(`段落数过多：${paragraphs.length}段，要求最多${section.maxParagraphs}段`);
    }

    // 检查字数
    const wordCount = content.length;
    if (wordCount < section.wordCount * 0.7) {
      issues.push(`字数不足：${wordCount}字，要求约${section.wordCount}字`);
    }

    // 检查引用
    const citationCount = (content.match(/\[\d+\]/g) || []).length;
    if (citationCount < 2 && section.requiredElements.includes('文献引用 [n]')) {
      issues.push('引用不足：至少需要2-3处文献引用');
    }

    // 检查公式
    if (section.requiredElements.includes('数学公式 $$')) {
      const equationCount = (content.match(/\$\$[\s\S]*?\$\$/g) || []).length;
      if (equationCount < 1) {
        issues.push('缺少数学公式');
      }
    }

    // 检查表格
    if (section.requiredElements.includes('数据表格')) {
      const tableCount = (content.match(/\|.*\|.*\|/g) || []).length;
      if (tableCount < 2) {
        issues.push('缺少数据表格');
      }
    }

    // 检查口语化表达
    const casualPatterns = [
      /\b(let's|let us)\b/gi,
      /\b(we'll|we will)\b/gi,
      /\b(here's|here is)\b/gi,
      /\b(as you can see)\b/gi,
      /\b(so|well|okay)\b[,.]/gi
    ];
    for (const pattern of casualPatterns) {
      if (pattern.test(content)) {
        issues.push('检测到口语化表达，请使用正式学术语言');
        break;
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

export default AcademicContentGenerator;

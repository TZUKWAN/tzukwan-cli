import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import type { LLMClient } from './llm-client.js';

export type GrantType =
  | 'nsfc-youth'
  | 'nsfc-general'
  | 'nsfc-key'
  | 'provincial'
  | 'enterprise'
  | 'international';

export interface GrantSection {
  title: string;
  chineseTitle: string;
  content: string;
  wordCount: number;
  isRequired: boolean;
  tips: string[];
}

export interface BudgetItem {
  category: string;
  amount: number;
  justification: string;
}

export interface BudgetPlan {
  total: number;
  items: BudgetItem[];
}

export interface GrantProposal {
  id: string;
  title: string;
  grantType: GrantType;
  applicant: string;
  institution: string;
  sections: Record<string, GrantSection>;
  budget: BudgetPlan;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'in-review' | 'submitted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Budget templates per grant type (amounts in 万元 CNY)
// ─────────────────────────────────────────────────────────────────────────────
const BUDGET_TEMPLATES: Record<GrantType, { total: number; items: BudgetItem[] }> = {
  'nsfc-youth': {
    total: 30,
    items: [
      { category: '劳务费（研究生/博士后）', amount: 9, justification: '资助研究生3名每年共3万元×3年' },
      { category: '材料费', amount: 3, justification: '实验耗材及样品采购' },
      { category: '测试化验加工费', amount: 4, justification: '数据购买及仪器分析服务' },
      { category: '差旅费/会议费', amount: 5, justification: '参加国内外学术会议3次/年×3年' },
      { category: '出版/文献/信息传播费', amount: 4, justification: '论文版面费及数据库订阅' },
      { category: '设备费', amount: 3, justification: '计算服务器及软件许可（≤总经费15%）' },
      { category: '国际合作与交流费', amount: 2, justification: '邀请国际合作者来访及短期出访' },
    ],
  },
  'nsfc-general': {
    total: 58,
    items: [
      { category: '劳务费（研究生/博士后）', amount: 16, justification: '资助研究生4名及博士后1名' },
      { category: '材料费', amount: 6, justification: '实验耗材、试剂及样品' },
      { category: '测试化验加工费', amount: 8, justification: '大型仪器测试及数据服务' },
      { category: '燃料动力费', amount: 2, justification: '实验室日常能耗' },
      { category: '差旅费/会议费', amount: 8, justification: '国内外学术会议4次/年×4年' },
      { category: '出版/文献/信息传播费', amount: 6, justification: '论文版面费及文献数据库' },
      { category: '设备费', amount: 8, justification: '专用实验设备（≤总经费15%）' },
      { category: '国际合作与交流费', amount: 4, justification: '国际合作访问及邀请专家' },
    ],
  },
  'nsfc-key': {
    total: 250,
    items: [
      { category: '劳务费（研究生/博士后）', amount: 70, justification: '资助博士生6名、博士后3名、研究助理若干' },
      { category: '材料费', amount: 30, justification: '大规模实验耗材及高端试剂' },
      { category: '测试化验加工费', amount: 35, justification: '大科学装置使用费、专项测试服务' },
      { category: '燃料动力费', amount: 10, justification: '大型实验平台能耗' },
      { category: '差旅费/会议费', amount: 25, justification: '主办及参加国际顶级会议' },
      { category: '出版/文献/信息传播费', amount: 15, justification: '高质量期刊版面费及开放获取费用' },
      { category: '设备费', amount: 37, justification: '重大专用设备采购（≤总经费15%）' },
      { category: '国际合作与交流费', amount: 20, justification: '长期国际合作项目及联合实验室' },
      { category: '间接费用', amount: 8, justification: '项目管理及支撑服务' },
    ],
  },
  provincial: {
    total: 25,
    items: [
      { category: '劳务费（研究生）', amount: 7, justification: '资助研究生2名' },
      { category: '材料费', amount: 3, justification: '实验耗材' },
      { category: '测试化验加工费', amount: 4, justification: '数据购买及测试服务' },
      { category: '差旅费/会议费', amount: 5, justification: '省内外学术会议及调研' },
      { category: '出版/文献/信息传播费', amount: 3, justification: '论文版面费' },
      { category: '设备费', amount: 3, justification: '小型仪器设备' },
    ],
  },
  enterprise: {
    total: 50,
    items: [
      { category: '劳务费（研究人员）', amount: 15, justification: '项目组成员绩效及外聘专家咨询费' },
      { category: '数据采集与处理费', amount: 10, justification: '数据调研、清洗及标注服务' },
      { category: '软件开发与系统集成费', amount: 12, justification: '原型系统开发及测试' },
      { category: '差旅及会议费', amount: 5, justification: '与企业方沟通及阶段性汇报' },
      { category: '设备与云计算费', amount: 5, justification: '云服务及计算资源' },
      { category: '知识产权申报费', amount: 3, justification: '专利申请及维护' },
    ],
  },
  international: {
    total: 80,
    items: [
      { category: '劳务费（研究人员）', amount: 20, justification: '中外双方研究人员劳务' },
      { category: '材料费', amount: 8, justification: '实验材料及样品' },
      { category: '测试化验费', amount: 10, justification: '联合实验室测试' },
      { category: '国际合作与交流费', amount: 20, justification: '双方互访、联合研讨会' },
      { category: '差旅费', amount: 10, justification: '国际出差及会议参加' },
      { category: '出版/信息传播费', amount: 7, justification: '高影响力期刊开放获取' },
      { category: '设备费', amount: 5, justification: '联合实验室共享设备' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Section definitions per grant type
// ─────────────────────────────────────────────────────────────────────────────
function buildSections(grantType: GrantType): Record<string, GrantSection> {
  // Base sections shared across all NSFC types
  const nsfcBase: Record<string, GrantSection> = {
    background: {
      title: 'Research Background and Significance',
      chineseTitle: '研究背景与意义',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '从宏观政策/社会背景出发，引入研究领域的重要性',
        '引用权威数据（统计年鉴、政府报告）量化问题规模',
        '聚焦到具体的科学问题，展示研究缺口',
        '最后一段明确陈述本研究的必要性和意义',
      ],
    },
    literature: {
      title: 'Domestic and International Research Status and Trends',
      chineseTitle: '国内外研究现状与趋势',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '按主题/时间线/方法论分类梳理文献，体现全面性',
        '引用最近5年的高质量文献（顶级期刊/会议）',
        '明确指出现有研究的局限：受限于X，无法解决Y',
        '该部分直接为你的研究空白和创新点服务',
      ],
    },
    objectives: {
      title: 'Research Objectives and Contents',
      chineseTitle: '研究目标与研究内容',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '目标要具体可验证，使用"揭示""建立""验证"等动词，避免"探讨"',
        '内容分解为3-5个子课题，每个子课题一段话说明',
        '目标-内容-方案三者保持内在逻辑一致',
        '字数控制在800-1200字',
      ],
    },
    methodology: {
      title: 'Research Plan and Technical Approach',
      chineseTitle: '研究方案与技术路线',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '提供技术路线图（可用ASCII框图描述）',
        '每个研究内容写出：数据来源→分析方法→预期结果→验证方法',
        '主动预判难点并提供应对预案（体现严谨性）',
        '提及可行性依据：已有的数据/代码/实验基础',
      ],
    },
    innovations: {
      title: 'Innovation Points',
      chineseTitle: '创新点',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '严格限制在2-3个，每个独立成段',
        '首句直接点明创新所在，然后与现有工作对比',
        '三类创新：理论创新/方法创新/应用创新，至少一个实质性创新',
        '每个创新点要有文献依据证明"前人未做"',
        '禁忌：不要把"综合运用多种方法"当做创新点',
      ],
    },
    outcomes: {
      title: 'Expected Research Outcomes and Evaluation Indicators',
      chineseTitle: '预期研究成果与考核指标',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '成果要具体：论文篇数、目标期刊、专利类型和数量',
        '指标必须可量化：不要"若干篇"，要"不少于X篇SCI论文"',
        '匹配资助额度：青年2-3篇B刊，面上3-5篇含1-2篇A刊',
        '可添加：数据库/软件、政策报告、人才培养',
      ],
    },
    foundation: {
      title: 'Research Foundation and Working Conditions',
      chineseTitle: '研究基础与工作条件',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '列出与本项目直接相关的已发表论文（加粗期刊名）',
        '已掌握的数据来源和实验/计算设备',
        '机构平台优势（国家重点实验室、大数据中心等）',
        '合作者和国际合作基础',
      ],
    },
    team: {
      title: 'Research Team and Division of Labor',
      chineseTitle: '研究团队与人员分工',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '主持人：突出与本项目最相关的经历，简洁有力',
        '展示团队互补性：不同方法背景/数据专长/应用经验',
        '每人分工明确，避免职责重叠',
        '学生培养计划也可在此体现',
      ],
    },
    budget: {
      title: 'Budget Plan',
      chineseTitle: '经费预算',
      content: '',
      wordCount: 0,
      isRequired: true,
      tips: [
        '每一类经费都要有具体使用依据',
        '设备费不超过总经费15%（面上及以下）',
        '劳务费（研究生/博士后）可占25-35%',
        '差旅/会议费结合实际会议计划填写',
        '国际合作费要有具体计划',
      ],
    },
  };

  switch (grantType) {
    case 'nsfc-youth':
    case 'nsfc-general':
    case 'nsfc-key':
      return nsfcBase;

    case 'provincial': {
      // Same structure but add local relevance section
      const provincial = { ...nsfcBase };
      provincial['local_relevance'] = {
        title: 'Relevance to Local Development Strategy',
        chineseTitle: '与地方发展战略的关联性',
        content: '',
        wordCount: 0,
        isRequired: true,
        tips: [
          '明确说明研究如何支撑省/市"十四五"规划目标',
          '如有本地数据或案例，重点突出',
          '说明成果转化路径和本地应用前景',
        ],
      };
      return provincial;
    }

    case 'enterprise': {
      return {
        background: {
          title: 'Industry Problem and Business Value',
          chineseTitle: '行业痛点与商业价值',
          content: '',
          wordCount: 0,
          isRequired: true,
          tips: [
            '用商业语言描述问题，量化损失或潜在收益',
            '说明企业为什么需要学术研究而不是工程开发',
            '明确研究成果对企业的直接价值',
          ],
        },
        objectives: {
          title: 'Research Objectives and Deliverables',
          chineseTitle: '研究目标与可交付成果',
          content: '',
          wordCount: 0,
          isRequired: true,
          tips: [
            '成果必须具体：报告、专利、软件工具、数据库、算法模型',
            '每个交付成果对应验收指标',
            '分阶段规划：每季度一个里程碑',
          ],
        },
        methodology: {
          title: 'Technical Approach and Implementation Plan',
          chineseTitle: '技术方案与实施计划',
          content: '',
          wordCount: 0,
          isRequired: true,
          tips: [
            '提供清晰的技术架构图',
            '说明算法/方法的技术优势（相比现有方案提升X%）',
            '风险评估和应对措施',
          ],
        },
        team: {
          title: 'Project Team',
          chineseTitle: '项目团队',
          content: '',
          wordCount: 0,
          isRequired: true,
          tips: [
            '突出团队的工业界经验和技术落地能力',
            '列出与企业的合作历史',
            '知识产权归属说明',
          ],
        },
        budget: {
          title: 'Budget Plan',
          chineseTitle: '经费预算',
          content: '',
          wordCount: 0,
          isRequired: true,
          tips: [
            '按实际工作量分配，重点投入核心技术攻关',
            '知识产权申报费单独列项',
            '企业方配套资源也需说明',
          ],
        },
      };
    }

    case 'international': {
      const international = { ...nsfcBase };
      international['collaboration_plan'] = {
        title: 'International Collaboration Plan',
        chineseTitle: '国际合作方案',
        content: '',
        wordCount: 0,
        isRequired: true,
        tips: [
          '说明合作机构和合作者的权威性（排名/h-index）',
          '双方分工：各自承担哪些研究任务',
          '互访计划和联合培养学生安排',
          '合作的互补性：为什么需要这家机构/这位学者',
        ],
      };
      return international;
    }

    default:
      return nsfcBase;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing templates per section
// ─────────────────────────────────────────────────────────────────────────────
function buildSectionTemplate(
  sectionKey: string,
  grantType: GrantType
): { template: string; tips: string[]; wordLimit: number } {
  const templates: Record<string, { template: string; tips: string[]; wordLimit: number }> = {
    background: {
      template: `[研究背景与意义模板]

**宏观背景段（约200字）**
在[国家战略/社会问题]背景下，[研究领域]已成为[学科/政策]的核心议题。根据[权威来源]数据显示，[量化问题规模的统计数据]。这一现象深刻影响[X、Y、Z等方面]，迫切需要深入的学术研究。

**领域现状段（约200字）**
现有研究虽然在[已有贡献]方面取得了重要进展，但受限于[方法论局限/数据限制/理论空白]，尚无法有效解决[核心科学问题]。特别是，[具体问题描述]仍是领域内悬而未决的重要问题。

**本研究必要性段（约150字）**
本项目拟[研究主旨简述]，通过[研究路径]，揭示[核心研究问题]的[规律/机制/因果关系]，为[理论/实践]提供[贡献描述]。`,
      tips: [
        '从宏观到微观：国家战略→领域问题→科学问题',
        '引用权威统计数据量化问题规模',
        '每句话都要有依据，避免空洞表述',
      ],
      wordLimit: 600,
    },
    literature: {
      template: `[国内外研究现状与趋势模板]

**国际研究现状（约400字）**
自[时间段]以来，国际学界在[研究主题]领域取得了重要进展。[Author et al., Year]首先提出了[理论/方法]，奠定了该领域的理论基础。此后，[Author et al., Year]等学者通过[方法]发现了[重要结论]。近年来，随着[新技术/新数据]的出现，[Author et al., Year]进一步将研究扩展至[新方向]，取得了[具体成果]。

**国内研究现状（约300字）**
国内学界对该领域的研究起步于[时间]，[代表学者]等率先开展了[研究内容]。近年来，随着[国内数据/政策背景]的发展，国内研究逐渐聚焦于[本土化问题]，发表于[期刊名称]等高质量期刊上。

**现有研究局限（约200字）**
综合来看，现有研究存在以下不足：第一，[局限1：方法论层面]；第二，[局限2：数据层面]；第三，[局限3：理论层面]。这些局限制约了对[核心问题]的深入理解，亟需新的研究加以突破。`,
      tips: [
        '按主题/时间/方法分类，体现文献掌握的系统性',
        '国际+国内双线并行，展示全球视野',
        '局限部分要精确指出"受限于X，无法解决Y"',
        '引用50篇以上文献，重点引用近3年高质量成果',
      ],
      wordLimit: 1000,
    },
    objectives: {
      template: `[研究目标与研究内容模板]

**研究目标**
本项目的核心研究目标是：（1）揭示[科学问题A]的[机制/规律]；（2）建立[理论框架/方法体系]；（3）验证[假设]在[情景]下的适用性与边界条件。

**研究内容**
围绕上述目标，本项目拟开展以下[3/4/5]项研究内容：

**研究内容一：[标题]**
针对[问题]，本项目将[方法/数据]，分析[变量关系]，旨在[子目标]。

**研究内容二：[标题]**
在研究内容一的基础上，进一步[深化/扩展/验证]...

**研究内容三：[标题]**
综合前两项研究，[构建/检验/应用]...`,
      tips: [
        '目标使用"揭示""建立""验证"等强动词',
        '内容与目标一一对应，逻辑清晰',
        '内容分解为3-5个子课题，字数800-1200字',
      ],
      wordLimit: 1000,
    },
    methodology: {
      template: `[研究方案与技术路线模板]

**整体技术路线**
本项目采用"[方法A]→[方法B]→[方法C]"的渐进式研究路线：

[研究内容一] → [数据来源] → [分析方法] → [预期结果]
     ↓
[研究内容二] → [数据来源] → [分析方法] → [预期结果]
     ↓
[研究内容三] → [综合验证] → [结论]

**各部分详细方案**

**方案一：[研究内容一]**
数据来源：[具体数据库/数据集名称及规模]
分析方法：[具体方法及其适用性论证]
预期结果：[可量化的预期发现]
验证策略：[稳健性检验方案]

**方案二：[研究内容二]**
[同上格式]

**难点与挑战预判**
- 挑战1：[描述] → 应对方案：[具体预案]
- 挑战2：[描述] → 应对方案：[具体预案]`,
      tips: [
        '提供清晰的技术路线图（ASCII框图）',
        '每个方案包含：数据→方法→结果→验证四要素',
        '主动识别难点并提供应对预案',
        '说明方案可行性依据（已有数据/代码基础）',
      ],
      wordLimit: 1500,
    },
    innovations: {
      template: `[创新点模板]

**创新点一（理论/方法/应用创新）**
[直接点明创新所在，一句话]。现有研究[现状描述]，本项目首次[创新行动]，从而[理论/方法/应用价值]。与[最接近的文献Author et al., Year]相比，本项目的创新在于[具体差异]。

**创新点二（理论/方法/应用创新）**
[同上格式]

**创新点三（理论/方法/应用创新，可选）**
[同上格式]`,
      tips: [
        '严格限制在2-3个，每个独立成段',
        '首句直接点明创新，不要铺垫',
        '每个创新点必须有文献支撑证明"前人未做"',
        '禁止将"综合运用多种方法"当做创新点',
      ],
      wordLimit: 600,
    },
    outcomes: {
      template: `[预期研究成果与考核指标模板]

**学术成果**
- 发表SCI/SSCI论文不少于[X]篇，其中[Y]篇发表于[目标期刊名称]（IF>[Z]）
- 在[顶级会议名称]发表会议论文[X]篇
- 申请发明专利[X]项

**数据/软件成果**（如适用）
- 构建[数据集名称]，包含[规模描述]，向学界公开共享
- 开发[软件/工具]，并发布开源版本

**人才培养**
- 培养博士研究生[X]名，硕士研究生[Y]名
- 接收国内外访问学者[X]名

**年度考核指标**
- 第一年：[具体成果]
- 第二年：[具体成果]
- 第三年（结项）：[具体成果]`,
      tips: [
        '必须可量化，不要用"若干"等模糊词',
        '与资助额度和年限匹配',
        '期刊名称要具体，不要只写"SCI期刊"',
      ],
      wordLimit: 500,
    },
    foundation: {
      template: `[研究基础与工作条件模板]

**前期研究成果**
申请人在[研究领域]已有扎实的前期积累：
1. [Author et al., 期刊名称（加粗）Year]：[一句话描述与本项目的直接关联]
2. [Author et al., 期刊名称（加粗）Year]：[一句话描述]
3. [会议论文/工作论文]：[描述]

**已掌握的数据资源**
- [数据库名称]：包含[规模]，已获取使用授权
- [实验设备]：[规格描述]，可满足本项目需求

**工作条件与平台支撑**
申请人所在单位[机构名称]建有[实验室/研究中心名称]，配备[设备/数据平台]，为本项目提供[具体支撑]。

**合作基础**
申请人与[机构/学者]建立了长期合作关系，已开展[合作内容]，为本项目的顺利实施提供保障。`,
      tips: [
        '每篇前期论文都要写明与本项目的直接关联',
        '数据资源要具体：名称、规模、获取状态',
        '平台条件要突出独特性（国家重点实验室等）',
      ],
      wordLimit: 800,
    },
    team: {
      template: `[研究团队与人员分工模板]

**主持人**
[姓名]，[职称]，[单位]。主要从事[研究方向]研究，在[核心能力]方面具有丰富经验。近年来主持/参与国家级/省部级项目X项，在[期刊名称]等期刊发表论文X篇。本项目中负责[总体设计/核心研究任务]。

**项目成员一**
[姓名]，[职称]，[单位]。擅长[方向]，承担[分工内容]。

**项目成员二**
[姓名]，[职称]，[单位]。擅长[方向]，承担[分工内容]。

**研究生**
本项目计划招募[X]名博士生和[Y]名硕士生参与研究，分别负责[具体任务]。`,
      tips: [
        '主持人简介要与项目高度相关，去掉无关经历',
        '展示团队互补性（方法/数据/应用方向各异）',
        '每人分工明确',
      ],
      wordLimit: 600,
    },
    budget: {
      template: `[经费预算说明模板]

**经费使用总计：[X]万元，资助期[Y]年**

| 费用类别 | 金额（万元） | 占比 | 使用说明 |
|---------|------------|------|---------|
| 劳务费 | X | X% | 资助研究生X名每年X万元×Y年 |
| 材料费 | X | X% | 实验耗材采购 |
| 测试化验加工费 | X | X% | 仪器测试及数据服务 |
| 差旅费/会议费 | X | X% | 参加顶级学术会议X次/年 |
| 出版/文献费 | X | X% | 论文版面费及数据库订阅 |
| 设备费 | X | X% | [设备名称]（≤总经费15%） |
| 国际合作费 | X | X% | 邀请国际合作者来访X次 |
| **合计** | **X** | **100%** | |

**重点说明**：
- 设备费占比[X%]，低于总经费15%的上限要求
- 劳务费主要用于研究生培养，支持[X]名博士生、[Y]名硕士生
- 所有费用均有明确的使用计划，确保合理合规`,
      tips: [
        '设备费不超过总经费15%',
        '每项都要写具体使用用途',
        '与研究内容和团队规模相匹配',
      ],
      wordLimit: 400,
    },
  };

  return templates[sectionKey] ?? {
    template: `[${sectionKey} 内容待填写]`,
    tips: ['请根据研究内容填写本节'],
    wordLimit: 500,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GrantWriter class
// ─────────────────────────────────────────────────────────────────────────────
export class GrantWriter {
  private grantsDir: string;

  constructor(private llmClient?: LLMClient) {
    this.grantsDir = path.join(os.homedir(), '.tzukwan', 'grants');
    // Ensure dir exists — recursive:true is idempotent, eliminates TOCTOU
    try { fs.mkdirSync(this.grantsDir, { recursive: true }); } catch { /* non-fatal */ }
  }

  /**
   * Create a new grant proposal skeleton with all required sections.
   * If an llmClient is provided, each section is filled with LLM-generated content.
   */
  async createProposal(
    type: GrantType,
    title: string,
    applicant: string,
    institution: string,
    researchContext?: string
  ): Promise<GrantProposal> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const budgetTemplate = BUDGET_TEMPLATES[type];
    const sections = buildSections(type);

    const proposal: GrantProposal = {
      id,
      title,
      grantType: type,
      applicant,
      institution,
      sections,
      budget: {
        total: budgetTemplate.total,
        items: budgetTemplate.items.map(item => ({ ...item })),
      },
      createdAt: now,
      updatedAt: now,
      status: 'draft',
    };

    // Use LLM to fill each section if client is available
    if (this.llmClient && researchContext) {
      for (const sectionKey of Object.keys(proposal.sections)) {
        const content = await this.generateSectionContent(proposal, sectionKey, researchContext);
        proposal.sections[sectionKey]!.content = content;
        proposal.sections[sectionKey]!.wordCount = content.length;
      }
      proposal.updatedAt = new Date().toISOString();
    }

    // Save JSON
    this.saveProposal(proposal);

    // Export and write Markdown file
    const markdown = this.exportToMarkdown(proposal);
    const mdPath = path.join(this.grantsDir, `${id}.md`);
    fs.writeFileSync(mdPath, markdown, 'utf-8');

    return proposal;
  }

  /**
   * Generate content for a single section using the LLM client.
   */
  async generateSectionContent(
    proposal: GrantProposal,
    sectionKey: string,
    researchContext: string
  ): Promise<string> {
    if (!this.llmClient) return '';
    try {
      const prompt = this.buildPromptForSection(proposal, sectionKey, researchContext);
      const response = await this.llmClient.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 2048, temperature: 0.7 }
      );
      return (response.content ?? '').trim();
    } catch {
      return '';
    }
  }

  /**
   * Get fill-in templates for each section of a given grant type.
   */
  getTemplate(
    type: GrantType
  ): Record<string, { template: string; tips: string[]; wordLimit: number }> {
    const sections = buildSections(type);
    const result: Record<string, { template: string; tips: string[]; wordLimit: number }> = {};

    for (const key of Object.keys(sections)) {
      result[key] = buildSectionTemplate(key, type);
    }

    return result;
  }

  /**
   * Build an LLM prompt to help write a specific section given research context.
   */
  buildPromptForSection(
    proposal: GrantProposal,
    sectionKey: string,
    researchContext: string
  ): string {
    const section = proposal.sections[sectionKey];
    if (!section) {
      throw new Error(`Section '${sectionKey}' not found in proposal`);
    }

    const template = buildSectionTemplate(sectionKey, proposal.grantType);
    const grantLabel: Record<GrantType, string> = {
      'nsfc-youth': '国家自然科学基金青年项目',
      'nsfc-general': '国家自然科学基金面上项目',
      'nsfc-key': '国家自然科学基金重点项目',
      provincial: '省级自然科学基金',
      enterprise: '企业横向合作基金',
      international: '国际合作基金',
    };

    return `你是一位专业的科研基金申报撰写专家。请帮助撰写以下申报书章节。

## 基本信息
- 申报类型：${grantLabel[proposal.grantType]}（预算：${proposal.budget.total}万元）
- 项目标题：${proposal.title}
- 申请人：${proposal.applicant}（${proposal.institution}）
- 目标章节：${section.chineseTitle}（${section.title}）
- 字数限制：约${template.wordLimit}字

## 研究背景（申请人提供）
${researchContext}

## 写作要求
${template.tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}

## 参考模板结构
${template.template}

## 指令
请基于以上研究背景，严格按照写作要求，撰写"${section.chineseTitle}"章节的完整内容。
- 字数约${template.wordLimit}字（允许±20%浮动）
- 语言：专业学术中文
- 内容必须基于申请人提供的真实研究背景，不得编造数据或引用不存在的文献
- 输出格式：直接输出章节内容，无需额外说明`;
  }

  /**
   * Save a proposal to disk at ~/.tzukwan/grants/<id>.json
   */
  saveProposal(proposal: GrantProposal): string {
    proposal.updatedAt = new Date().toISOString();
    const filePath = path.join(this.grantsDir, `${proposal.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2), 'utf-8');
    return filePath;
  }

  /**
   * Load a proposal by id.
   */
  loadProposal(id: string): GrantProposal | null {
    // Validate id is a UUID v4 to prevent path traversal (e.g., ../../etc/passwd)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    const filePath = path.join(this.grantsDir, `${id}.json`);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as GrantProposal;
    } catch {
      return null;
    }
  }

  /**
   * List all saved proposals with summary info.
   */
  listProposals(): Array<{ id: string; title: string; type: GrantType; status: string }> {
    if (!fs.existsSync(this.grantsDir)) {
      return [];
    }

    const files = fs
      .readdirSync(this.grantsDir)
      .filter(f => f.endsWith('.json'));

    const results: Array<{ id: string; title: string; type: GrantType; status: string }> = [];

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(this.grantsDir, file), 'utf-8');
        const proposal = JSON.parse(raw) as GrantProposal;
        results.push({
          id: proposal.id,
          title: proposal.title,
          type: proposal.grantType,
          status: proposal.status,
        });
      } catch {
        // Skip corrupt files
      }
    }

    return results;
  }

  /**
   * Export a proposal to a formatted Markdown string.
   */
  exportToMarkdown(proposal: GrantProposal): string {
    const grantLabel: Record<GrantType, string> = {
      'nsfc-youth': '国家自然科学基金青年项目',
      'nsfc-general': '国家自然科学基金面上项目',
      'nsfc-key': '国家自然科学基金重点项目',
      provincial: '省级自然科学基金',
      enterprise: '企业横向合作基金',
      international: '国际合作基金',
    };

    const lines: string[] = [];

    lines.push(`# ${proposal.title}`);
    lines.push('');
    lines.push(`**申报类型：** ${grantLabel[proposal.grantType]}`);
    lines.push(`**申请人：** ${proposal.applicant}`);
    lines.push(`**依托单位：** ${proposal.institution}`);
    lines.push(`**项目状态：** ${proposal.status}`);
    lines.push(`**创建时间：** ${proposal.createdAt}`);
    lines.push(`**最后更新：** ${proposal.updatedAt}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Sections
    for (const [key, section] of Object.entries(proposal.sections)) {
      lines.push(`## ${section.chineseTitle}`);
      lines.push(`*${section.title}*`);
      lines.push('');

      if (section.content && section.content.trim().length > 0) {
        lines.push(section.content);
      } else {
        lines.push('*（内容待填写）*');
        lines.push('');
        lines.push('**写作提示：**');
        for (const tip of section.tips) {
          lines.push(`- ${tip}`);
        }
      }

      if (section.wordCount > 0) {
        lines.push('');
        lines.push(`*字数：${section.wordCount}*`);
      }

      lines.push('');
      lines.push('---');
      lines.push('');
    }

    // Budget
    lines.push('## 经费预算');
    lines.push('');
    lines.push(`**预算总额：** ${proposal.budget.total} 万元`);
    lines.push('');
    lines.push('| 费用类别 | 金额（万元） | 占比 | 使用说明 |');
    lines.push('|---------|------------|------|---------|');

    for (const item of proposal.budget.items) {
      const pct = proposal.budget.total > 0
        ? ((item.amount / proposal.budget.total) * 100).toFixed(1)
        : '0.0';
      lines.push(`| ${item.category} | ${item.amount} | ${pct}% | ${item.justification} |`);
    }

    const totalAllocated = proposal.budget.items.reduce((s, i) => s + i.amount, 0);
    lines.push(`| **合计** | **${totalAllocated}** | **100%** | |`);
    lines.push('');

    // Budget validation warning
    if (totalAllocated !== proposal.budget.total) {
      lines.push(`⚠️ **警告：预算总和 ${totalAllocated} 万元与申报总额 ${proposal.budget.total} 万元不一致，请检查调整。**`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push(`*本申报书由 tzukwan-cli 生成，ID: ${proposal.id}*`);

    return lines.join('\n');
  }
}

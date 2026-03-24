# TZUKWAN 智能体方法论增强实施指南

## 📋 实施检查清单

### Phase 1: 核心文件更新 (预计2小时)

- [ ] **1.1 更新 `packages/core/src/agents.ts`**
  - [ ] 替换 Dr. Mentor systemPrompt (Line 404-433)
  - [ ] 替换 Dr. Lit systemPrompt (Line 363-393)
  - [ ] 替换 Dr. Topic systemPrompt (Line 445-498)
  - [ ] 替换 Dr. Lab systemPrompt (Line 279-308)
  - [ ] 替换 Dr. Write systemPrompt (Line 241-268)
  - [ ] 替换 Dr. Peer systemPrompt (Line 319-352)
  - [ ] 替换 Dr. Grant systemPrompt (Line 665-791)

- [ ] **1.2 更新协作触发逻辑**
  - [ ] 在 `selectAutoCollaborationAgents` 函数中添加新的触发关键词

### Phase 2: 新增功能模块 (预计3小时)

- [ ] **2.1 创建方法论查询命令**
  - [ ] 在 CLI 中添加 `/methodology` 命令
  - [ ] 实现各方法论要点的快速查询

- [ ] **2.2 创建论文结构模板**
  - [ ] 理论应用型论文模板
  - [ ] 理论延伸型论文模板
  - [ ] 理论整合型论文模板
  - [ ] 理论对比型论文模板

- [ ] **2.3 创建创新点评估工具**
  - [ ] Gap类型识别辅助
  - [ ] 创新层次评估
  - [ ] 可行性五维评估

### Phase 3: 测试验证 (预计2小时)

- [ ] **3.1 单智能体测试**
  - [ ] 测试各智能体对方法论的理解和应用
  - [ ] 验证输出质量是否符合预期

- [ ] **3.2 多智能体协作测试**
  - [ ] 测试完整论文生成工作流
  - [ ] 验证协作触发是否正确

- [ ] **3.3 边界情况测试**
  - [ ] 跨学科研究场景
  - [ ] 新兴领域研究场景
  - [ ] 方法论文场景

---

## 📝 代码更新示例

### 示例1: 更新 Dr. Write systemPrompt

**文件**: `packages/core/src/agents.ts`
**位置**: Line 241-268

```typescript
// 原代码 (简化)
systemPrompt: `你是 Dr. Write，一位顶级学术写作专家...
## 核心能力
- **论文结构设计**：精通IMRaD结构...
`,

// 新代码 (增强版)
systemPrompt: `你是 Dr. Write，一位顶级学术写作专家...

## 核心理论：论文写作时间分配
总工作量: 100%
├── 前期准备: 55-60% (文献阅读筛选: 50% + 精读整理: 5-10%)
├── 实验/数据分析: 20-30%
└── 论文撰写: 15-20% (初稿: 10-15% + 修改: 3-5%)

## 经典论文结构模板

### 模板一：理论应用型 (适合新手)
结构：Introduction → Theoretical Background → Method → Results → Discussion
逻辑：现状 → Gap → 理论应用 → 数据验证 → 讨论

### 模板二：理论延伸型
结构：Introduction → Theoretical Framework → Method → Results → Discussion  
逻辑：背景 → Gap → 延伸理论+新因素 → 验证 → 讨论

[更多模板详见 ENHANCED_AGENT_PROMPTS.md]

## 八种故事线模式
1. 填补空白型：Gap存在 → 本文填补 → 贡献
2. 矛盾调和型：文献A vs B矛盾 → 本文解释 → 贡献
3. 深化拓展型：前人研究浅 → 本文深挖 → 贡献
...

## 论文五大核心问题 (贯穿全文)
- What? (研究什么) - Intro/LR
- Why? (为什么研究) - Intro/LR  
- How? (怎么研究) - Method
- So what? (发现有何价值) - Discussion
`,
```

### 示例2: 更新协作触发逻辑

**文件**: `packages/core/src/agents.ts`
**位置**: Line 158-227

```typescript
function selectAutoCollaborationAgents(
  task: string,
  activeAgent: AgentDefinition,
  availableAgents: AgentDefinition[],
): string[] | null {
  // ... 现有代码 ...
  
  // 新增触发条件 (在现有条件后添加)
  
  // Gap识别和创新点评估
  if (/(?:gap|创新点|novelty|research gap|创新|研究空白)/i.test(task)) {
    add('topic');
    add('literature');
  }
  
  // 文献综述任务
  if (/(?:系统综述|systematic review|文献综述|survey|综述)/i.test(task)) {
    add('literature');
    add('writing');
  }
  
  // 理论模型构建
  if (/(?:理论模型|模型构建|framework|model|中介|调节| SEM)/i.test(task)) {
    add('experiment');
    add('topic');
  }
  
  // 研究设计选择
  if (/(?:研究设计|experiment design|methodology|定性|定量|mixed)/i.test(task)) {
    add('experiment');
    add('advisor');
  }
  
  // 回复审稿意见
  if (/(?:回复审稿|response letter|revision|大修|小修)/i.test(task)) {
    add('review');
    add('writing');
  }
  
  // 基金申报
  if (/(?:基金|grant|nsfc|申报书|青年基金|面上)/i.test(task)) {
    add('grant');
    add('topic');
    add('writing');
  }
  
  // ... 现有代码 ...
}
```

### 示例3: 新增 `/methodology` 命令

**文件**: `packages/cli/src/commands/` (新建文件)

```typescript
// packages/cli/src/commands/methodology.ts

import { Command } from 'commander';

export const methodologyCommand = new Command('methodology')
  .description('查询科研方法论要点')
  .argument('<topic>', '方法论主题 (gap/novelty/design/structure/review/writing)')
  .action(async (topic) => {
    const guides: Record<string, string> = {
      gap: `
## Research Gap 四分法

| 类型 | 特征 | 创新策略 |
|------|------|----------|
| 旧 | 研究老化，未考虑新兴现象 | 新现象/新方法/新理论验证 |
| 窄 | 研究偏颇，过于乐观/狭窄 | 补充视角/多面性探索 |
| 泛 | 文献杂乱，缺乏整体脉络 | 跨学科整合/统一框架 |
| 少 | 某现象缺乏研究 | 开创新领域/划归成熟领域 |

## Gap识别检查清单
- [ ] 文献是否老化？(近5年文献占比<30% → 可能"旧")
- [ ] 研究视角是否单一？(只有支持性文献 → 可能"窄")
- [ ] 文献是否分散在不同学科？(难以找到核心框架 → 可能"泛")
- [ ] 直接相关文献是否极少？(<20篇高质量文献 → 可能"少")
`,
      novelty: `
## 创新点五层次模型

| 层次 | 类型 | 核心逻辑 | 适合阶段 |
|------|------|----------|----------|
| L1 | 应用型 | 成熟理论→新兴领域 | 新手 |
| L2 | 延伸型 | 核心理论+新因素 | 有经验 |
| L3 | 整合型 | 多理论融合 | 跨学科 |
| L4 | 比较型 | 多理论对比 | 方法论 |
| L5 | 构建型 | 从数据归纳新理论 | 资深 |

## 创新点表述模板
L1应用型: "By applying established theories to emerging phenomena..."
L2延伸型: "By incorporating factors into core theoretical framework..."
L3整合型: "By integrating multiple theories into foundational framework..."
`,
      design: `
## 研究设计三思路

| 思路 | 起点 | 流程 | 分析方法 |
|------|------|------|----------|
| 探索式 | 数据/现象 | 数据→规律→理论 | 定性(Content/Narrative) |
| 验证式 | 理论 | 理论→假设→验证 | 定量(SEM/回归) |
| 结合式 | 理论+数据 | 相互丰富 | 混合方法 |

## 选择决策
- 无理论指导 → 探索式
- 有明确理论+假设 → 验证式
- 部分理论指导 → 结合式
`,
      structure: `
## 经典论文结构

### 理论应用型 (新手友好)
Intro → Theoretical Background → Method → Results → Discussion

### 理论延伸型
Intro → Theoretical Framework → Method → Results → Discussion

### 理论整合型
Intro → Model Review → Empirical Comparison → Unified Model → Discussion

### 理论对比型
Intro → Theoretical Models → Method → Comparison → Discussion
`,
      review: `
## 文献综述三类型

| 类型 | 特点 | 适用场景 |
|------|------|----------|
| Systematic | 严格纳入/排除标准 | 问题清晰可量化 |
| Semi-systematic | 灵活性高 | 问题宽泛跨领域 |
| Integrative | 提出新框架 | 需整合分散研究 |

## 二八定律
- 80%时间：筛选粗读、定位文献
- 20%时间：精读整理、写作运用
`,
      writing: `
## 论文写作时间分配
- 前期准备: 55-60% (文献50% + 精读5-10%)
- 实验分析: 20-30%
- 论文撰写: 15-20%

## 八大故事线
1. 填补空白型  2. 矛盾调和型  3. 深化拓展型
4. 跨域应用型  5. 方法改进型  6. 综合比较型
7. 全新构建型  8. 反直觉型
`,
    };
    
    const guide = guides[topic];
    if (guide) {
      console.log(guide);
    } else {
      console.log(`可用主题: ${Object.keys(guides).join(', ')}`);
    }
  });
```

然后在主命令文件中注册：

```typescript
// packages/cli/src/index.ts
import { methodologyCommand } from './commands/methodology.js';

program.addCommand(methodologyCommand);
```

---

## 🧪 测试用例

### 测试1: Gap识别

**输入**: 
```
我想研究"人工智能在教育领域的应用"，帮我识别一下Gap类型
```

**预期行为**:
- Dr. Topic 被激活
- 使用Gap四分法分析
- 输出可能是"泛"类型(文献杂乱分散在不同学科)
- 建议整合型创新策略

### 测试2: 研究设计选择

**输入**:
```
我想用计划行为理论(TPB)研究消费者绿色包装行为，应该用什么研究设计？
```

**预期行为**:
- Dr. Lab 和 Dr. Mentor 协作
- 推荐"验证式"研究设计
- 提供TPB应用的经典结构模板

### 测试3: 文献综述

**输入**:
```
帮我做一个关于"数字金融与经济增长"的系统性文献综述
```

**预期行为**:
- Dr. Lit 被激活
- 使用二八定律筛选策略
- 推荐Systematic Review方法
- 输出结构化综述框架

### 测试4: 创新点挖掘

**输入**:
```
我想把社会认同理论应用到元宇宙虚拟社区研究，创新点够不够？
```

**预期行为**:
- Dr. Topic 被激活
- 识别为L1应用型创新
- 建议提升到L2延伸型(加入元宇宙特有因素)
- 提供创新点表述模板

### 测试5: 回复审稿人

**输入**:
```
审稿人说我的样本量太小，不够说服力，但这是我能拿到的全部数据了，怎么回复？
```

**预期行为**:
- Dr. Peer 被激活
- 识别为"同意但难改"情况
- 建议使用"且改且珍惜"策略
- 提供Response Letter模板

---

## 📊 效果评估指标

### 定量指标

1. **任务完成率**: 用户任务成功完成的比例
2. **多智能体协作触发准确率**: 正确识别需要协作的场景
3. **方法论引用频次**: 各方法论被成功应用的次数
4. **用户满意度**: 用户对输出质量的评分

### 定性指标

1. **输出专业性**: 是否体现科研方法论的专业性
2. **可操作性**: 建议是否具体可执行
3. **逻辑连贯性**: 多智能体协作输出是否逻辑一致
4. **创新性评估准确性**: Gap识别和创新点评估是否准确

---

## 🚀 部署计划

### Week 1: 核心更新
- 更新所有智能体 systemPrompt
- 添加协作触发关键词
- 内部测试

### Week 2: 功能增强
- 添加 `/methodology` 命令
- 创建论文结构模板
- 创建创新点评估工具

### Week 3: 测试验证
- 全面测试各场景
- 收集反馈
- 修复问题

### Week 4: 正式发布
- 文档更新
- 用户培训材料
- 正式发布

---

## 📚 相关文档

- `AGENTS_METHODOLOGY_ENHANCEMENT.md` - 方法论体系总览
- `ENHANCED_AGENT_PROMPTS.md` - 增强版智能体Prompts
- `IMPLEMENTATION_GUIDE.md` - 本实施指南

---

## 💡 后续优化方向

1. **个性化学习**: 根据用户反馈持续优化各智能体
2. **案例库建设**: 收集各类型成功案例
3. **学科定制**: 针对不同学科(经管/医学/CS)定制化方法论
4. **可视化工具**: 添加技术路线图、模型图等可视化生成
5. **协作记忆**: 增强多智能体间的协作记忆和上下文传递

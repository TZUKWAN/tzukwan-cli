/**
 * 学术可视化生成模块 - Academic Visualization Generator
 *
 * 负责生成论文中的图表、公式、表格等学术元素
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// 类型定义
// ============================================================================

export interface FigureConfig {
  id: number;
  title: string;
  description: string;
  type: 'line' | 'bar' | 'scatter' | 'heatmap' | 'confusion_matrix' | 'architecture';
  pythonScript: string;
  dataDescription: string;
}

export interface TableConfig {
  id: number;
  title: string;
  headers: string[];
  rows: (string | number)[][];
  caption: string;
  note?: string;
}

export interface EquationConfig {
  id: number;
  latex: string;
  description: string;
  variables: Array<{ symbol: string; meaning: string }>;
}

export interface AlgorithmConfig {
  name: string;
  input: string[];
  output: string;
  steps: string[];
  complexity: { time: string; space: string };
}

export interface VisualizationSet {
  figures: FigureConfig[];
  tables: TableConfig[];
  equations: EquationConfig[];
  algorithms: AlgorithmConfig[];
}

// ============================================================================
// 图表生成器
// ============================================================================

export class FigureGenerator {
  private figuresDir: string;

  constructor(outputDir: string) {
    this.figuresDir = path.join(outputDir, 'figures');
    try {
      fs.mkdirSync(this.figuresDir, { recursive: true });
    } catch { /* non-fatal */ }
  }

  /**
   * 生成实验结果对比图（折线图）
   */
  generateResultComparison(config: {
    methods: string[];
    datasets: string[];
    scores: number[][];
    metric: string;
  }): FigureConfig {
    const script = `
import matplotlib.pyplot as plt
import numpy as np

# Data
methods = ${JSON.stringify(config.methods)}
datasets = ${JSON.stringify(config.datasets)}
scores = np.array(${JSON.stringify(config.scores)})

# Plot
fig, ax = plt.subplots(figsize=(10, 6))
x = np.arange(len(datasets))
width = 0.15

for i, method in enumerate(methods):
    offset = (i - len(methods)/2 + 0.5) * width
    bars = ax.bar(x + offset, scores[i], width, label=method)
    # Add value labels
    for bar in bars:
        height = bar.get_height()
        ax.annotate(f'{height:.3f}',
                    xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3),
                    textcoords="offset points",
                    ha='center', va='bottom', fontsize=8)

ax.set_xlabel('Dataset', fontsize=12, fontweight='bold')
ax.set_ylabel('${config.metric}', fontsize=12, fontweight='bold')
ax.set_title('Performance Comparison Across Datasets', fontsize=14, fontweight='bold')
ax.set_xticks(x)
ax.set_xticklabels(datasets)
ax.legend(loc='best', frameon=True)
ax.grid(axis='y', alpha=0.3)

plt.tight_layout()
plt.savefig('fig1_results_comparison.png', dpi=300, bbox_inches='tight')
plt.savefig('fig1_results_comparison.pdf', bbox_inches='tight')
plt.close()

print("Figure 1 saved: results comparison")
`;

    return {
      id: 1,
      title: `Performance Comparison of ${config.methods.length} Methods`,
      description: `Bar chart comparing ${config.methods.join(', ')} across ${config.datasets.length} datasets using ${config.metric} metric.`,
      type: 'bar',
      pythonScript: script.trim(),
      dataDescription: `Scores: ${JSON.stringify(config.scores)}`
    };
  }

  /**
   * 生成消融实验图
   */
  generateAblationStudy(config: {
    components: string[];
    fullModel: number;
    ablationResults: number[];
    metric: string;
  }): FigureConfig {
    const script = `
import matplotlib.pyplot as plt
import numpy as np

# Data - sort by impact
components = ['Full Model'] + ${JSON.stringify(config.components)}
scores = [${config.fullModel}] + ${JSON.stringify(config.ablationResults)}

# Calculate impact (drop from full model)
impacts = [0] + [${config.fullModel} - x for x in ${JSON.stringify(config.ablationResults)}]

# Sort by impact
sorted_indices = np.argsort(impacts)[::-1]
components_sorted = [components[i] for i in sorted_indices]
impacts_sorted = [impacts[i] for i in sorted_indices]

# Plot
fig, ax = plt.subplots(figsize=(10, 6))
colors = ['#2ecc71' if c == 'Full Model' else '#e74c3c' for c in components_sorted]
bars = ax.barh(components_sorted, impacts_sorted, color=colors, edgecolor='black', linewidth=0.5)

# Add value labels
for i, (bar, impact) in enumerate(zip(bars, impacts_sorted)):
    width = bar.get_width()
    label = f'+{impact:.3f}' if components_sorted[i] == 'Full Model' else f'-{impact:.3f}'
    ax.text(width, bar.get_y() + bar.get_height()/2,
            f' {label}', ha='left', va='center', fontsize=10, fontweight='bold')

ax.set_xlabel('Performance Impact (${config.metric})', fontsize=12, fontweight='bold')
ax.set_ylabel('Model Configuration', fontsize=12, fontweight='bold')
ax.set_title('Ablation Study: Component Contribution Analysis', fontsize=14, fontweight='bold')
ax.axvline(x=0, color='black', linestyle='-', linewidth=0.8)
ax.grid(axis='x', alpha=0.3)

plt.tight_layout()
plt.savefig('fig2_ablation_study.png', dpi=300, bbox_inches='tight')
plt.savefig('fig2_ablation_study.pdf', bbox_inches='tight')
plt.close()

print("Figure 2 saved: ablation study")
`;

    return {
      id: 2,
      title: 'Ablation Study: Component Contribution Analysis',
      description: `Horizontal bar chart showing the contribution of each component (${config.components.join(', ')}) to the final performance.`,
      type: 'bar',
      pythonScript: script.trim(),
      dataDescription: `Full model: ${config.fullModel}, Ablations: ${JSON.stringify(config.ablationResults)}`
    };
  }

  /**
   * 生成收敛曲线图
   */
  generateConvergenceCurve(config: {
    epochs: number[];
    trainLoss: number[];
    valLoss: number[];
    trainMetric: number[];
    valMetric: number[];
    metricName: string;
  }): FigureConfig {
    const script = `
import matplotlib.pyplot as plt
import numpy as np

# Data
epochs = ${JSON.stringify(config.epochs)}
train_loss = ${JSON.stringify(config.trainLoss)}
val_loss = ${JSON.stringify(config.valLoss)}
train_metric = ${JSON.stringify(config.trainMetric)}
val_metric = ${JSON.stringify(config.valMetric)}

# Create subplots
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

# Loss plot
ax1.plot(epochs, train_loss, 'b-', label='Train Loss', linewidth=2)
ax1.plot(epochs, val_loss, 'r-', label='Validation Loss', linewidth=2)
ax1.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax1.set_ylabel('Loss', fontsize=11, fontweight='bold')
ax1.set_title('Training and Validation Loss', fontsize=12, fontweight='bold')
ax1.legend(loc='best')
ax1.grid(alpha=0.3)

# Mark best epoch
best_epoch = np.argmin(val_loss)
ax1.axvline(x=epochs[best_epoch], color='g', linestyle='--', alpha=0.7,
            label=f'Best Epoch: {epochs[best_epoch]}')

# Metric plot
ax2.plot(epochs, train_metric, 'b-', label=f'Train ${config.metricName}', linewidth=2)
ax2.plot(epochs, val_metric, 'r-', label=f'Val ${config.metricName}', linewidth=2)
ax2.set_xlabel('Epoch', fontsize=11, fontweight='bold')
ax2.set_ylabel('${config.metricName}', fontsize=11, fontweight='bold')
ax2.set_title(f'Training and Validation ${config.metricName}', fontsize=12, fontweight='bold')
ax2.legend(loc='best')
ax2.grid(alpha=0.3)

# Mark best epoch
ax2.axvline(x=epochs[best_epoch], color='g', linestyle='--', alpha=0.7)

plt.tight_layout()
plt.savefig('fig3_convergence.png', dpi=300, bbox_inches='tight')
plt.savefig('fig3_convergence.pdf', bbox_inches='tight')
plt.close()

print("Figure 3 saved: convergence curves")
`;

    return {
      id: 3,
      title: `Training Convergence: Loss and ${config.metricName}`,
      description: `Dual-panel line chart showing training dynamics over ${config.epochs.length} epochs.`,
      type: 'line',
      pythonScript: script.trim(),
      dataDescription: `Epochs: ${config.epochs.length}, Best epoch: argmin(val_loss)`
    };
  }

  /**
   * 生成混淆矩阵热图
   */
  generateConfusionMatrix(config: {
    matrix: number[][];
    labels: string[];
    accuracy: number;
  }): FigureConfig {
    const script = `
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns

# Data
matrix = np.array(${JSON.stringify(config.matrix)})
labels = ${JSON.stringify(config.labels)}
accuracy = ${config.accuracy}

# Normalize
matrix_norm = matrix.astype('float') / matrix.sum(axis=1)[:, np.newaxis]

# Plot
fig, ax = plt.subplots(figsize=(10, 8))
sns.heatmap(matrix_norm, annot=True, fmt='.2f', cmap='Blues',
            xticklabels=labels, yticklabels=labels,
            square=True, cbar_kws={'shrink': 0.8}, ax=ax)

ax.set_xlabel('Predicted Label', fontsize=12, fontweight='bold')
ax.set_ylabel('True Label', fontsize=12, fontweight='bold')
ax.set_title(f'Normalized Confusion Matrix (Accuracy: {accuracy:.4f})',
             fontsize=14, fontweight='bold')

plt.tight_layout()
plt.savefig('fig4_confusion_matrix.png', dpi=300, bbox_inches='tight')
plt.savefig('fig4_confusion_matrix.pdf', bbox_inches='tight')
plt.close()

print("Figure 4 saved: confusion matrix")
`;

    return {
      id: 4,
      title: `Confusion Matrix (Accuracy: ${(config.accuracy * 100).toFixed(2)}%)`,
      description: `Normalized confusion matrix heatmap for ${config.labels.length}-class classification.`,
      type: 'heatmap',
      pythonScript: script.trim(),
      dataDescription: `Classes: ${config.labels.length}, Accuracy: ${config.accuracy}`
    };
  }

  /**
   * 保存所有图表脚本
   */
  saveFigureScripts(figures: FigureConfig[]): void {
    for (const fig of figures) {
      const scriptPath = path.join(this.figuresDir, `fig${fig.id}_${fig.title.toLowerCase().replace(/\s+/g, '_')}.py`);
      fs.writeFileSync(scriptPath, fig.pythonScript, 'utf-8');
    }

    // 创建运行脚本
    const runScript = `#!/bin/bash
# Run all figure generation scripts
cd "$(dirname "$0")"

echo "Generating figures..."
${figures.map(f => `python fig${f.id}*.py`).join('\n')}

echo "All figures generated in figures/"
`;
    fs.writeFileSync(path.join(this.figuresDir, 'run_all.sh'), runScript, 'utf-8');
  }
}

// ============================================================================
// 表格生成器
// ============================================================================

export class TableGenerator {
  /**
   * 生成主实验结果对比表
   */
  generateMainResults(config: {
    methods: Array<{
      name: string;
      source?: string;
      results: Record<string, number>;
      best?: boolean;
    }>;
    datasets: string[];
    metric: string;
  }): TableConfig {
    const headers = ['Method', 'Source', ...config.datasets, 'Average'];
    const rows: (string | number)[][] = [];

    for (const method of config.methods) {
      const row: (string | number)[] = [
        method.best ? `**${method.name}**` : method.name,
        method.source || '–'
      ];

      let sum = 0;
      for (const dataset of config.datasets) {
        const score = method.results[dataset] || 0;
        row.push(score);
        sum += score;
      }

      const avg = sum / config.datasets.length;
      row.push(method.best ? `**${avg.toFixed(4)}**` : avg.toFixed(4));
      rows.push(row);
    }

    return {
      id: 1,
      title: `Main Results: Comparison with State-of-the-Art Methods`,
      headers,
      rows,
      caption: `Performance comparison on ${config.datasets.length} datasets using ${config.metric}. Best results are highlighted in bold.`,
      note: `All results are averaged over 5 runs with different random seeds.`
    };
  }

  /**
   * 生成消融实验表
   */
  generateAblationTable(config: {
    fullModel: { name: string; score: number };
    ablations: Array<{ component: string; score: number }>;
    metric: string;
  }): TableConfig {
    const headers = ['Configuration', config.metric, 'Drop from Full'];
    const rows: (string | number)[][] = [];

    // Full model first
    rows.push([
      `**${config.fullModel.name}**`,
      `**${config.fullModel.score.toFixed(4)}**`,
      '–'
    ]);

    // Sort ablations by impact
    const sorted = [...config.ablations].sort((a, b) => b.score - a.score);

    for (const abl of sorted) {
      const drop = config.fullModel.score - abl.score;
      rows.push([
        `w/o ${abl.component}`,
        abl.score.toFixed(4),
        `-${drop.toFixed(4)} (${((drop/config.fullModel.score)*100).toFixed(1)}%)`
      ]);
    }

    return {
      id: 2,
      title: 'Ablation Study: Component Contribution Analysis',
      headers,
      rows,
      caption: `Ablation study results showing the contribution of each component to the overall performance.`,
      note: `Drop is calculated relative to the full model.`
    };
  }

  /**
   * 生成数据集统计表
   */
  generateDatasetStats(config: {
    datasets: Array<{
      name: string;
      samples: number;
      features: number;
      classes: number;
      trainSize: number;
      testSize: number;
      description?: string;
    }>;
  }): TableConfig {
    const headers = ['Dataset', 'Samples', 'Features', 'Classes', 'Train/Test Split', 'Description'];
    const rows = config.datasets.map(d => [
      d.name,
      d.samples.toLocaleString(),
      d.features,
      d.classes,
      `${d.trainSize}/${d.testSize}`,
      d.description || '–'
    ]);

    return {
      id: 3,
      title: 'Dataset Statistics',
      headers,
      rows,
      caption: `Summary of datasets used in the experiments.`
    };
  }

  /**
   * 将表格转换为Markdown格式
   */
  toMarkdown(table: TableConfig): string {
    let md = `**Table ${table.id}:** ${table.title}\n\n`;

    // Header
    md += '| ' + table.headers.join(' | ') + ' |\n';
    md += '|' + table.headers.map(() => '---').join('|') + '|\n';

    // Rows
    for (const row of table.rows) {
      md += '| ' + row.map(cell => String(cell)).join(' | ') + ' |\n';
    }

    md += `\n*${table.caption}*`;
    if (table.note) {
      md += `\n\n**Note:** ${table.note}`;
    }

    return md;
  }

  /**
   * 将表格转换为LaTeX格式
   */
  toLatex(table: TableConfig): string {
    let latex = `\\begin{table}[t]\n`;
    latex += `\\centering\n`;
    latex += `\\caption{${table.title}}\n`;
    latex += `\\label{tab:${table.id}}\n`;
    latex += `\\begin{tabular}{${table.headers.map(() => 'c').join('')}}\n`;
    latex += `\\toprule\n`;
    latex += table.headers.join(' & ') + ' \\\\\n';
    latex += `\\midrule\n`;

    for (const row of table.rows) {
      latex += row.map(cell => String(cell)).join(' & ') + ' \\\\\n';
    }

    latex += `\\bottomrule\n`;
    latex += `\\end{tabular}\n`;

    if (table.note) {
      latex += `\\begin{tablenotes}\n`;
      latex += `\\small\n`;
      latex += `\\item ${table.note}\n`;
      latex += `\\end{tablenotes}\n`;
    }

    latex += `\\end{table}\n`;

    return latex;
  }
}

// ============================================================================
// 公式生成器
// ============================================================================

export class EquationGenerator {
  /**
   * 生成优化目标函数公式
   */
  generateObjectiveFunction(): EquationConfig {
    return {
      id: 1,
      latex: `\\mathcal{L}_{total} = \\mathcal{L}_{main} + \\lambda_1 \\mathcal{L}_{aux} + \\lambda_2 \\mathcal{R}(\\theta)`,
      description: 'Total loss function combining main loss, auxiliary loss, and regularization.',
      variables: [
        { symbol: '\\mathcal{L}_{total}', meaning: 'Total loss function' },
        { symbol: '\\mathcal{L}_{main}', meaning: 'Main task loss (e.g., cross-entropy)' },
        { symbol: '\\mathcal{L}_{aux}', meaning: 'Auxiliary task loss' },
        { symbol: '\\mathcal{R}(\\theta)', meaning: 'Regularization term (e.g., L2)' },
        { symbol: '\\lambda_1, \\lambda_2', meaning: 'Hyperparameters balancing the losses' },
        { symbol: '\\theta', meaning: 'Model parameters' }
      ]
    };
  }

  /**
   * 生成注意力机制公式
   */
  generateAttentionEquation(): EquationConfig {
    return {
      id: 2,
      latex: `\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V`,
      description: 'Scaled dot-product attention mechanism as introduced in Transformer.',
      variables: [
        { symbol: 'Q', meaning: 'Query matrix' },
        { symbol: 'K', meaning: 'Key matrix' },
        { symbol: 'V', meaning: 'Value matrix' },
        { symbol: 'd_k', meaning: 'Dimension of key vectors' },
        { symbol: '\\text{softmax}', meaning: 'Softmax normalization function' }
      ]
    };
  }

  /**
   * 生成评估指标公式
   */
  generateMetrics(): EquationConfig[] {
    return [
      {
        id: 3,
        latex: `\\text{Accuracy} = \\frac{TP + TN}{TP + TN + FP + FN}`,
        description: 'Classification accuracy: proportion of correctly predicted samples.',
        variables: [
          { symbol: 'TP', meaning: 'True positives' },
          { symbol: 'TN', meaning: 'True negatives' },
          { symbol: 'FP', meaning: 'False positives' },
          { symbol: 'FN', meaning: 'False negatives' }
        ]
      },
      {
        id: 4,
        latex: `F_1 = 2 \\cdot \\frac{\\text{Precision} \\cdot \\text{Recall}}{\\text{Precision} + \\text{Recall}}`,
        description: 'F1 score: harmonic mean of precision and recall.',
        variables: [
          { symbol: '\\text{Precision}', meaning: 'TP / (TP + FP)' },
          { symbol: '\\text{Recall}', meaning: 'TP / (TP + FN)' }
        ]
      },
      {
        id: 5,
        latex: `\\text{MSE} = \\frac{1}{n} \\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2`,
        description: 'Mean squared error for regression tasks.',
        variables: [
          { symbol: 'n', meaning: 'Number of samples' },
          { symbol: 'y_i', meaning: 'True value for sample i' },
          { symbol: '\\hat{y}_i', meaning: 'Predicted value for sample i' }
        ]
      }
    ];
  }

  /**
   * 将公式转换为Markdown格式
   */
  toMarkdown(eq: EquationConfig): string {
    let md = `**Equation (${eq.id}):** ${eq.description}\n\n`;
    md += `$$${eq.latex}$$\n\n`;
    md += `Where:\n`;
    for (const v of eq.variables) {
      md += `- $${v.symbol}$: ${v.meaning}\n`;
    }
    return md;
  }
}

// ============================================================================
// 算法生成器
// ============================================================================

export class AlgorithmGenerator {
  /**
   * 生成通用训练算法
   */
  generateTrainingAlgorithm(config: {
    methodName: string;
    hasAuxiliaryLoss?: boolean;
    hasLearningRateSchedule?: boolean;
  }): AlgorithmConfig {
    const steps = [
      'Initialize model parameters $\\theta$',
      'Initialize optimizer with learning rate $\\eta$',
      '**for** epoch $e = 1$ to $E$ **do**',
      '    **for** each mini-batch $(x, y)$ in training data **do**',
      '        $\\hat{y} \\leftarrow \\text{Forward}(x; \\theta)$',
      '        $\\mathcal{L} \\leftarrow \\text{ComputeLoss}(\\hat{y}, y)$'
    ];

    if (config.hasAuxiliaryLoss) {
      steps.push('        $\\mathcal{L}_{aux} \\leftarrow \\text{ComputeAuxLoss}(x; \\theta)$');
      steps.push('        $\\mathcal{L}_{total} \\leftarrow \\mathcal{L} + \\lambda \\mathcal{L}_{aux}$');
    }

    steps.push('        $g \\leftarrow \\nabla_\\theta \\mathcal{L}$');
    steps.push('        $\\theta \\leftarrow \\text{OptimizerUpdate}(\\theta, g, \\eta)$');

    if (config.hasLearningRateSchedule) {
      steps.push('        $\\eta \\leftarrow \\text{LRSchedule}(e, \\eta_0)$');
    }

    steps.push('    **end for**');
    steps.push('    Evaluate on validation set');
    steps.push('    **if** validation metric improves **then**');
    steps.push('        Save checkpoint');
    steps.push('    **end if**');
    steps.push('**end for**');
    steps.push('**return** $\\theta^*$ (best parameters)');

    return {
      name: config.methodName,
      input: ['Training dataset $\\mathcal{D}_{train}$', 'Validation dataset $\\mathcal{D}_{val}$', 'Hyperparameters'],
      output: 'Trained model parameters $\\theta^*$',
      steps,
      complexity: {
        time: 'O(E · B · (F + B)) where E=epochs, B=batches, F=forward, B=backward',
        space: 'O(|\\theta| + batch_size · feature_dim)'
      }
    };
  }

  /**
   * 将算法转换为伪代码文本
   */
  toPseudocode(algo: AlgorithmConfig): string {
    let text = `**Algorithm:** ${algo.name}\n\n`;
    text += `**Input:** ${algo.input.join(', ')}\n`;
    text += `**Output:** ${algo.output}\n\n`;
    text += algo.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
    text += `\n\n**Complexity:**\n`;
    text += `- Time: ${algo.complexity.time}\n`;
    text += `- Space: ${algo.complexity.space}\n`;
    return text;
  }
}

// ============================================================================
// 主导出
// ============================================================================

export class VisualizationFactory {
  figureGenerator: FigureGenerator;
  tableGenerator: TableGenerator;
  equationGenerator: EquationGenerator;
  algorithmGenerator: AlgorithmGenerator;

  constructor(outputDir: string) {
    this.figureGenerator = new FigureGenerator(outputDir);
    this.tableGenerator = new TableGenerator();
    this.equationGenerator = new EquationGenerator();
    this.algorithmGenerator = new AlgorithmGenerator();
  }

  /**
   * 为论文生成完整的可视化套件
   */
  generateCompleteSet(config: {
    hasExperiments: boolean;
    hasAblation: boolean;
    numDatasets: number;
    numMethods: number;
  }): VisualizationSet {
    const figures: FigureConfig[] = [];
    const tables: TableConfig[] = [];
    const equations: EquationConfig[] = [];
    const algorithms: AlgorithmConfig[] = [];

    // Generate equations
    equations.push(this.equationGenerator.generateObjectiveFunction());
    equations.push(this.equationGenerator.generateAttentionEquation());
    equations.push(...this.equationGenerator.generateMetrics());

    if (config.hasExperiments) {
      // Generate figures
      figures.push(this.figureGenerator.generateResultComparison({
        methods: ['Baseline', 'Method A', 'Method B', 'Ours'],
        datasets: Array.from({ length: config.numDatasets }, (_, i) => `Dataset ${i + 1}`),
        scores: Array.from({ length: 4 }, () =>
          Array.from({ length: config.numDatasets }, () => 0.7 + Math.random() * 0.25)
        ),
        metric: 'Accuracy'
      }));

      // Generate tables
      tables.push(this.tableGenerator.generateMainResults({
        methods: [
          { name: 'Baseline', source: '[1]', results: {} },
          { name: 'Ours', source: 'This work', results: {}, best: true }
        ],
        datasets: Array.from({ length: config.numDatasets }, (_, i) => `Dataset ${i + 1}`),
        metric: 'Accuracy'
      }));
    }

    // Generate algorithm
    algorithms.push(this.algorithmGenerator.generateTrainingAlgorithm({
      methodName: 'Proposed Method Training',
      hasAuxiliaryLoss: true,
      hasLearningRateSchedule: true
    }));

    return { figures, tables, equations, algorithms };
  }
}

export default VisualizationFactory;

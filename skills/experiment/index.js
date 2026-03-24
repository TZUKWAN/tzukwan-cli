/**
 * Experiment Skill
 * Commands: design, scaffold, run, analyze, decide
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

// Skill metadata
export const name = 'experiment';
export const description = 'Machine learning experiment design and management';
export const version = '1.0.0';

// Command definitions
export const commands = [
  {
    name: 'design',
    description: 'Generate experiment design document',
    args: [
      { name: 'task', type: 'string', required: true },
      { name: 'datasets', type: 'array', required: true },
      { name: 'metrics', type: 'array', required: true },
      { name: 'baseline', type: 'string', required: false }
    ]
  },
  {
    name: 'scaffold',
    description: 'Generate experiment code scaffold',
    args: [
      { name: 'framework', type: 'string', default: 'pytorch' },
      { name: 'task', type: 'string', required: true },
      { name: 'outputDir', type: 'string', required: false }
    ]
  },
  {
    name: 'run',
    description: 'Run or validate experiment configuration',
    args: [
      { name: 'configFile', type: 'string', required: false },
      { name: 'dryRun', type: 'boolean', default: true }
    ]
  },
  {
    name: 'analyze',
    description: 'Analyze experiment results',
    args: [
      { name: 'resultsFile', type: 'string', required: false },
      { name: 'metrics', type: 'array', required: true }
    ]
  },
  {
    name: 'decide',
    description: 'Make experiment decision based on results',
    args: [
      { name: 'results', type: 'object', required: true },
      { name: 'targets', type: 'object', required: true },
      { name: 'history', type: 'array', required: false }
    ]
  }
];

/**
 * Generate experiment design document
 */
export async function design(args) {
  const { task, datasets, metrics, baseline } = args;

  if (!task) {
    throw new Error('Task parameter is required');
  }

  if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
    throw new Error('Datasets array is required');
  }

  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('Metrics array is required');
  }

  const llmClient = args.llmClient || global.llmClient;

  if (llmClient) {
    return await designWithLLM(llmClient, task, datasets, metrics, baseline);
  } else {
    return generateDesignTemplate(task, datasets, metrics, baseline);
  }
}

/**
 * Generate design using LLM
 */
async function designWithLLM(llmClient, task, datasets, metrics, baseline) {
  const prompt = `Create a comprehensive experiment design for the following machine learning task:

Task: ${task}
Datasets: ${datasets.join(', ')}
Evaluation Metrics: ${metrics.join(', ')}
${baseline ? `Baseline Method: ${baseline}` : ''}

Include:
1. Research Hypothesis - what we expect to learn
2. Dataset Selection Rationale - why these datasets are appropriate
3. Evaluation Metrics Definition - formal definitions and why they matter
4. Experimental Setup - train/val/test splits, hyperparameters
5. Baseline Comparison - how to compare against baselines
6. Ablation Study Design - what components to ablate
7. Expected Outcomes - what results would validate/invalidate the hypothesis

Format as a structured markdown document.`;

  try {
    const response = await llmClient.chat([{role:"user",content:prompt}]);
    return response.content || "";
  } catch (error) {
    console.error(`LLM design generation failed: ${error.message}`);
    return generateDesignTemplate(task, datasets, metrics, baseline);
  }
}

/**
 * Generate design template without LLM
 */
function generateDesignTemplate(task, datasets, metrics, baseline) {
  let design = `# Experiment Design: ${task}\n\n`;

  design += `## 1. Research Hypothesis\n\n`;
  design += `**Primary Hypothesis**: The proposed approach will outperform existing methods on ${task} `;
  design += `as measured by ${metrics.join(', ')}.\n\n`;
  design += `**Null Hypothesis**: There is no significant difference between the proposed approach `;
  design += `and existing baselines.\n\n`;

  design += `## 2. Dataset Selection Rationale\n\n`;
  datasets.forEach((ds, i) => {
    design += `### ${ds}\n`;
    design += `- **Purpose**: Evaluate ${task} capabilities\n`;
    design += `- **Characteristics**: Standard benchmark dataset\n`;
    design += `- **Size**: To be determined from dataset documentation\n`;
    design += `- **Split Strategy**: Train/Validation/Test split (70/15/15 or as per standard)\n\n`;
  });

  design += `## 3. Evaluation Metrics Definition\n\n`;
  metrics.forEach(metric => {
    const definitions = {
      accuracy: 'Proportion of correct predictions: (TP + TN) / (TP + TN + FP + FN)',
      precision: 'Ratio of true positives to predicted positives: TP / (TP + FP)',
      recall: 'Ratio of true positives to actual positives: TP / (TP + FN)',
      f1: 'Harmonic mean of precision and recall: 2 * (P * R) / (P + R)',
      'f1-score': 'Harmonic mean of precision and recall: 2 * (P * R) / (P + R)',
      auc: 'Area under the ROC curve',
      'auc-roc': 'Area under the ROC curve',
      mse: 'Mean Squared Error: average of squared differences',
      rmse: 'Root Mean Squared Error: sqrt(MSE)',
      mae: 'Mean Absolute Error: average of absolute differences',
      perplexity: 'Exponentiated average negative log-likelihood',
      bleu: 'Bilingual Evaluation Understudy - n-gram precision',
      rouge: 'Recall-Oriented Understudy for Gisting Evaluation'
    };
    design += `### ${metric}\n`;
    design += `- **Definition**: ${definitions[metric.toLowerCase()] || `Standard ${metric} metric`}\n`;
    design += `- **Rationale**: Primary indicator of model performance\n`;
    design += `- **Target**: To be determined based on literature\n\n`;
  });

  design += `## 4. Experimental Setup\n\n`;
  design += `### Training Configuration\n`;
  design += `- **Optimizer**: Adam with learning rate 1e-3 (default)\n`;
  design += `- **Batch Size**: 32 (adjust based on memory)\n`;
  design += `- **Epochs**: 100 with early stopping (patience=10)\n`;
  design += `- **Random Seed**: 42 (for reproducibility)\n\n`;

  design += `### Validation Strategy\n`;
  design += `- **Cross-validation**: 5-fold CV for small datasets\n`;
  design += `- **Early Stopping**: Monitor validation metric\n`;
  design += `- **Checkpointing**: Save best model based on validation performance\n\n`;

  design += `## 5. Baseline Comparison\n\n`;
  if (baseline) {
    design += `**Primary Baseline**: ${baseline}\n`;
  }
  design += `Additional baselines to consider:\n`;
  design += `- Random baseline (lower bound)\n`;
  design += `- Simple heuristic (e.g., majority class)\n`;
  design += `- Standard method from literature\n`;
  design += `- State-of-the-art method\n\n`;

  design += `## 6. Ablation Study Design\n\n`;
  design += `Components to ablate:\n`;
  design += `1. **Full Model**: All components enabled\n`;
  design += `2. **Without Component A**: Test necessity of feature X\n`;
  design += `3. **Without Component B**: Test necessity of feature Y\n`;
  design += `4. **Simplified Version**: Minimal viable architecture\n\n`;

  design += `## 7. Expected Outcomes\n\n`;
  design += `### Success Criteria\n`;
  design += `- Statistically significant improvement over baseline (p < 0.05)\n`;
  design += `- Improvement of at least 5% on primary metric\n`;
  design += `- Robust performance across all datasets\n\n`;

  design += `### Failure Analysis Plan\n`;
  design += `- If results are negative: analyze error patterns\n`;
  design += `- Identify failure modes and edge cases\n`;
  design += `- Document limitations and assumptions\n\n`;

  design += `## 8. Timeline\n\n`;
  design += `1. **Week 1**: Data preparation and baseline implementation\n`;
  design += `2. **Week 2**: Main model implementation\n`;
  design += `3. **Week 3**: Training and hyperparameter tuning\n`;
  design += `4. **Week 4**: Evaluation and ablation studies\n`;
  design += `5. **Week 5**: Analysis and documentation\n`;

  return design;
}

/**
 * Generate experiment scaffold code
 */
export async function scaffold(args) {
  const { framework = 'pytorch', task, outputDir = './experiment-scaffold' } = args;

  if (!task) {
    throw new Error('Task parameter is required');
  }

  const validFrameworks = ['pytorch', 'sklearn', 'tensorflow'];
  if (!validFrameworks.includes(framework.toLowerCase())) {
    throw new Error(`Unsupported framework: ${framework}. Use: ${validFrameworks.join(', ')}`);
  }

  // Create output directory
  const outputPath = path.resolve(outputDir);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const files = {};

  // Generate files based on framework
  switch (framework.toLowerCase()) {
    case 'pytorch':
      files['train.py'] = generatePyTorchTrain(task);
      files['evaluate.py'] = generatePyTorchEvaluate(task);
      files['requirements.txt'] = generatePyTorchRequirements();
      break;
    case 'sklearn':
      files['train.py'] = generateSklearnTrain(task);
      files['evaluate.py'] = generateSklearnEvaluate(task);
      files['requirements.txt'] = generateSklearnRequirements();
      break;
    case 'tensorflow':
      files['train.py'] = generateTensorFlowTrain(task);
      files['evaluate.py'] = generateTensorFlowEvaluate(task);
      files['requirements.txt'] = generateTensorFlowRequirements();
      break;
  }

  files['README.md'] = generateReadme(task, framework);
  files['config.yaml'] = generateConfig(task);

  // Write files
  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputPath, filename), content, 'utf8');
  }

  return {
    success: true,
    framework,
    outputDir: outputPath,
    files: Object.keys(files)
  };
}

/**
 * Generate PyTorch training script
 */
function generatePyTorchTrain(task) {
  return `#!/usr/bin/env python3
\"\"\"
Training script for ${task}
Generated by experiment skill
\"\"\"

import os
import json
import argparse
import yaml
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from pathlib import Path


def set_seed(seed=42):
    \"\"\"Set random seeds for reproducibility.\"\"\"
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class SimpleModel(nn.Module):
    \"\"\"Example model - replace with your architecture.\"\"\"
    def __init__(self, input_dim, output_dim, hidden_dim=128):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, output_dim)
        )

    def forward(self, x):
        return self.network(x)


class SimpleDataset(Dataset):
    \"\"\"Example dataset - replace with your data loading.\"\"\"
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)
        self.y = torch.LongTensor(y) if y.dtype == np.int64 else torch.FloatTensor(y)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


def train_epoch(model, dataloader, criterion, optimizer, device):
    \"\"\"Train for one epoch.\"\"\"
    model.train()
    total_loss = 0
    correct = 0
    total = 0

    for batch_x, batch_y in dataloader:
        batch_x, batch_y = batch_x.to(device), batch_y.to(device)

        optimizer.zero_grad()
        outputs = model(batch_x)
        loss = criterion(outputs, batch_y)
        loss.backward()
        optimizer.step()

        total_loss += loss.item()
        _, predicted = outputs.max(1)
        total += batch_y.size(0)
        correct += predicted.eq(batch_y).sum().item()

    return total_loss / len(dataloader), correct / total


def validate(model, dataloader, criterion, device):
    \"\"\"Validate the model.\"\"\"
    model.eval()
    total_loss = 0
    correct = 0
    total = 0

    with torch.no_grad():
        for batch_x, batch_y in dataloader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)

            total_loss += loss.item()
            _, predicted = outputs.max(1)
            total += batch_y.size(0)
            correct += predicted.eq(batch_y).sum().item()

    return total_loss / len(dataloader), correct / total


def main():
    parser = argparse.ArgumentParser(description='Train model for ${task}')
    parser.add_argument('--config', type=str, default='config.yaml', help='Config file')
    parser.add_argument('--output', type=str, default='./outputs', help='Output directory')
    args = parser.parse_args()

    # Load config
    with open(args.config, 'r') as f:
        config = yaml.safe_load(f)

    # Setup
    set_seed(config.get('seed', 42))
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # TODO: Load your actual dataset here
    # Replace this dummy data with real data loading
    print("Loading dataset...")
    input_dim = config.get('input_dim', 100)
    output_dim = config.get('output_dim', 10)

    # Dummy data - replace with actual data
    X_train = np.random.randn(1000, input_dim)
    y_train = np.random.randint(0, output_dim, 1000)
    X_val = np.random.randn(200, input_dim)
    y_val = np.random.randint(0, output_dim, 200)

    train_dataset = SimpleDataset(X_train, y_train)
    val_dataset = SimpleDataset(X_val, y_val)

    train_loader = DataLoader(train_dataset, batch_size=config.get('batch_size', 32), shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=config.get('batch_size', 32))

    # Initialize model
    model = SimpleModel(input_dim, output_dim, config.get('hidden_dim', 128)).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=config.get('learning_rate', 1e-3))
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5)

    # Training loop
    best_val_acc = 0
    patience_counter = 0
    history = {'train_loss': [], 'train_acc': [], 'val_loss': [], 'val_acc': []}

    print("Starting training...")
    for epoch in range(config.get('epochs', 100)):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = validate(model, val_loader, criterion, device)

        scheduler.step(val_loss)

        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)

        print(f"Epoch {epoch+1}/{config.get('epochs', 100)}: "
              f"train_loss={train_loss:.4f}, train_acc={train_acc:.4f}, "
              f"val_loss={val_loss:.4f}, val_acc={val_acc:.4f}")

        # Early stopping
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            patience_counter = 0
            torch.save(model.state_dict(), os.path.join(args.output, 'best_model.pt'))
        else:
            patience_counter += 1
            if patience_counter >= config.get('patience', 10):
                print(f"Early stopping at epoch {epoch+1}")
                break

    # Save training history
    with open(os.path.join(args.output, 'history.json'), 'w') as f:
        json.dump(history, f, indent=2)

    # Save final config
    with open(os.path.join(args.output, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)

    print(f"Training complete! Best validation accuracy: {best_val_acc:.4f}")
    print(f"Outputs saved to: {args.output}")


if __name__ == '__main__':
    main()
`;
}

/**
 * Generate PyTorch evaluation script
 */
function generatePyTorchEvaluate(task) {
  return `#!/usr/bin/env python3
\"\"\"
Evaluation script for ${task}
Generated by experiment skill
\"\"\"

import os
import json
import argparse
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns


class SimpleModel(nn.Module):
    \"\"\"Example model - must match training architecture.\"\"\"
    def __init__(self, input_dim, output_dim, hidden_dim=128):
        super().__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim, output_dim)
        )

    def forward(self, x):
        return self.network(x)


class SimpleDataset(Dataset):
    \"\"\"Example dataset.\"\"\"
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)
        self.y = torch.LongTensor(y) if y.dtype == np.int64 else torch.FloatTensor(y)

    def __len__(self):
        return len(self.X)

    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]


def evaluate_model(model, dataloader, device):
    \"\"\"Evaluate model and return predictions.\"\"\"
    model.eval()
    all_preds = []
    all_labels = []

    with torch.no_grad():
        for batch_x, batch_y in dataloader:
            batch_x = batch_x.to(device)
            outputs = model(batch_x)
            _, predicted = outputs.max(1)
            all_preds.extend(predicted.cpu().numpy())
            all_labels.extend(batch_y.numpy())

    return np.array(all_preds), np.array(all_labels)


def compute_metrics(predictions, labels, metric_names):
    \"\"\"Compute specified metrics.\"\"\"
    results = {}

    for metric in metric_names:
        if metric == 'accuracy':
            results[metric] = accuracy_score(labels, predictions)
        elif metric in ['precision', 'recall', 'f1', 'f1-score']:
            avg = 'binary' if len(np.unique(labels)) == 2 else 'weighted'
            p, r, f, _ = precision_recall_fscore_support(labels, predictions, average=avg)
            results['precision'] = p
            results['recall'] = r
            results['f1'] = f

    return results


def plot_confusion_matrix(labels, predictions, output_path):
    \"\"\"Plot and save confusion matrix.\"\"\"
    cm = confusion_matrix(labels, predictions)
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.title('Confusion Matrix')
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()


def main():
    parser = argparse.ArgumentParser(description='Evaluate model for ${task}')
    parser.add_argument('--model', type=str, required=True, help='Path to model checkpoint')
    parser.add_argument('--data', type=str, required=True, help='Path to test data')
    parser.add_argument('--config', type=str, default='config.yaml', help='Config file')
    parser.add_argument('--output', type=str, default='./results', help='Output directory')
    parser.add_argument('--metrics', nargs='+', default=['accuracy'], help='Metrics to compute')
    args = parser.parse_args()

    # Load config
    import yaml
    with open(args.config, 'r') as f:
        config = yaml.safe_load(f)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # TODO: Load your actual test data
    print("Loading test data...")
    input_dim = config.get('input_dim', 100)
    output_dim = config.get('output_dim', 10)

    # Dummy data - replace with actual test data
    X_test = np.random.randn(200, input_dim)
    y_test = np.random.randint(0, output_dim, 200)

    test_dataset = SimpleDataset(X_test, y_test)
    test_loader = DataLoader(test_dataset, batch_size=config.get('batch_size', 32))

    # Load model
    print("Loading model...")
    model = SimpleModel(input_dim, output_dim, config.get('hidden_dim', 128)).to(device)
    model.load_state_dict(torch.load(args.model, map_location=device))

    # Evaluate
    print("Evaluating...")
    predictions, labels = evaluate_model(model, test_loader, device)

    # Compute metrics
    results = compute_metrics(predictions, labels, args.metrics)

    print("\\nResults:")
    for metric, value in results.items():
        print(f"  {metric}: {value:.4f}")

    # Save results
    results_data = {
        'metrics': results,
        'predictions': predictions.tolist(),
        'labels': labels.tolist()
    }

    with open(os.path.join(args.output, 'results.json'), 'w') as f:
        json.dump(results_data, f, indent=2)

    # Plot confusion matrix
    plot_confusion_matrix(labels, predictions, os.path.join(args.output, 'confusion_matrix.png'))

    print(f"\\nResults saved to: {args.output}")


if __name__ == '__main__':
    main()
`;
}

/**
 * Generate PyTorch requirements
 */
function generatePyTorchRequirements() {
  return `torch>=2.0.0
numpy>=1.24.0
scipy>=1.10.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
seaborn>=0.12.0
pyyaml>=6.0
tqdm>=4.65.0
pandas>=2.0.0
`;
}

/**
 * Generate scikit-learn training script
 */
function generateSklearnTrain(task) {
  return `#!/usr/bin/env python3
\"\"\"
Training script for ${task} using scikit-learn
Generated by experiment skill
\"\"\"

import os
import json
import argparse
import pickle
import yaml
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report


def set_seed(seed=42):
    \"\"\"Set random seed for reproducibility.\"\"\"
    np.random.seed(seed)


def get_model(model_name, params=None):
    \"\"\"Get model by name.\"\"\"
    params = params or {}
    models = {
        'random_forest': RandomForestClassifier(**params),
        'gradient_boosting': GradientBoostingClassifier(**params),
        'svm': SVC(**params),
        'logistic_regression': LogisticRegression(**params, max_iter=1000)
    }
    return models.get(model_name, RandomForestClassifier())


def main():
    parser = argparse.ArgumentParser(description='Train model for ${task}')
    parser.add_argument('--config', type=str, default='config.yaml', help='Config file')
    parser.add_argument('--output', type=str, default='./outputs', help='Output directory')
    args = parser.parse_args()

    # Load config
    with open(args.config, 'r') as f:
        config = yaml.safe_load(f)

    set_seed(config.get('seed', 42))

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # TODO: Load your actual dataset
    print("Loading dataset...")
    input_dim = config.get('input_dim', 100)
    output_dim = config.get('output_dim', 2)

    # Dummy data - replace with actual data
    X = np.random.randn(1200, input_dim)
    y = np.random.randint(0, output_dim, 1200)

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=config.get('seed', 42)
    )

    # Get model
    model_name = config.get('model', 'random_forest')
    model_params = config.get('model_params', {})
    model = get_model(model_name, model_params)

    print(f"Training {model_name}...")

    # Hyperparameter tuning if specified
    if config.get('tune_hyperparams', False):
        param_grid = config.get('param_grid', {})
        if param_grid:
            grid_search = GridSearchCV(model, param_grid, cv=5, scoring='accuracy', n_jobs=-1)
            grid_search.fit(X_train, y_train)
            model = grid_search.best_estimator_
            print(f"Best parameters: {grid_search.best_params_}")
    else:
        model.fit(X_train, y_train)

    # Evaluate
    train_pred = model.predict(X_train)
    val_pred = model.predict(X_val)

    train_acc = accuracy_score(y_train, train_pred)
    val_acc = accuracy_score(y_val, val_pred)

    print(f"\\nTraining accuracy: {train_acc:.4f}")
    print(f"Validation accuracy: {val_acc:.4f}")
    print(f"\\nClassification Report:")
    print(classification_report(y_val, val_pred))

    # Cross-validation
    cv_scores = cross_val_score(model, X, y, cv=5)
    print(f"\\nCross-validation accuracy: {cv_scores.mean():.4f} (+/- {cv_scores.std()*2:.4f})")

    # Save model
    model_path = os.path.join(args.output, 'model.pkl')
    with open(model_path, 'wb') as f:
        pickle.dump(model, f)

    # Save results
    results = {
        'model': model_name,
        'train_accuracy': train_acc,
        'val_accuracy': val_acc,
        'cv_mean': cv_scores.mean(),
        'cv_std': cv_scores.std(),
        'config': config
    }

    with open(os.path.join(args.output, 'results.json'), 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\\nModel saved to: {model_path}")
    print(f"Results saved to: {args.output}")


if __name__ == '__main__':
    main()
`;
}

/**
 * Generate scikit-learn evaluation script
 */
function generateSklearnEvaluate(task) {
  return `#!/usr/bin/env python3
\"\"\"
Evaluation script for ${task} using scikit-learn
Generated by experiment skill
\"\"\"

import os
import json
import argparse
import pickle
import numpy as np
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix, roc_auc_score
)
import matplotlib.pyplot as plt
import seaborn as sns


def compute_metrics(predictions, labels, probabilities=None, metric_names=None):
    \"\"\"Compute specified metrics.\"\"\"
    metric_names = metric_names or ['accuracy']
    results = {}

    for metric in metric_names:
        if metric == 'accuracy':
            results[metric] = accuracy_score(labels, predictions)
        elif metric == 'precision':
            avg = 'binary' if len(np.unique(labels)) == 2 else 'weighted'
            results[metric] = precision_score(labels, predictions, average=avg, zero_division=0)
        elif metric == 'recall':
            avg = 'binary' if len(np.unique(labels)) == 2 else 'weighted'
            results[metric] = recall_score(labels, predictions, average=avg, zero_division=0)
        elif metric in ['f1', 'f1-score']:
            avg = 'binary' if len(np.unique(labels)) == 2 else 'weighted'
            results['f1'] = f1_score(labels, predictions, average=avg, zero_division=0)
        elif metric == 'auc' and probabilities is not None:
            if len(np.unique(labels)) == 2:
                results[metric] = roc_auc_score(labels, probabilities[:, 1])

    return results


def plot_confusion_matrix(labels, predictions, output_path):
    \"\"\"Plot and save confusion matrix.\"\"\"
    cm = confusion_matrix(labels, predictions)
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.title('Confusion Matrix')
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()


def main():
    parser = argparse.ArgumentParser(description='Evaluate model for ${task}')
    parser.add_argument('--model', type=str, required=True, help='Path to model pickle file')
    parser.add_argument('--data', type=str, required=True, help='Path to test data')
    parser.add_argument('--output', type=str, default='./results', help='Output directory')
    parser.add_argument('--metrics', nargs='+', default=['accuracy'], help='Metrics to compute')
    args = parser.parse_args()

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # Load model
    print("Loading model...")
    with open(args.model, 'rb') as f:
        model = pickle.load(f)

    # TODO: Load your actual test data
    print("Loading test data...")
    input_dim = 100  # Should match training config

    # Dummy data - replace with actual test data
    X_test = np.random.randn(200, input_dim)
    y_test = np.random.randint(0, 2, 200)

    # Predict
    print("Evaluating...")
    predictions = model.predict(X_test)

    # Get probabilities if available
    probabilities = None
    if hasattr(model, 'predict_proba'):
        probabilities = model.predict_proba(X_test)

    # Compute metrics
    results = compute_metrics(predictions, y_test, probabilities, args.metrics)

    print("\\nResults:")
    for metric, value in results.items():
        print(f"  {metric}: {value:.4f}")

    print(f"\\nDetailed Classification Report:")
    print(classification_report(y_test, predictions))

    # Save results
    results_data = {
        'metrics': results,
        'predictions': predictions.tolist(),
        'labels': y_test.tolist()
    }

    with open(os.path.join(args.output, 'results.json'), 'w') as f:
        json.dump(results_data, f, indent=2)

    # Plot confusion matrix
    plot_confusion_matrix(y_test, predictions, os.path.join(args.output, 'confusion_matrix.png'))

    print(f"\\nResults saved to: {args.output}")


if __name__ == '__main__':
    main()
`;
}

/**
 * Generate scikit-learn requirements
 */
function generateSklearnRequirements() {
  return `scikit-learn>=1.3.0
numpy>=1.24.0
scipy>=1.10.0
matplotlib>=3.7.0
seaborn>=0.12.0
pyyaml>=6.0
pandas>=2.0.0
joblib>=1.3.0
`;
}

/**
 * Generate TensorFlow training script
 */
function generateTensorFlowTrain(task) {
  return `#!/usr/bin/env python3
\"\"\"
Training script for ${task} using TensorFlow/Keras
Generated by experiment skill
\"\"\"

import os
import json
import argparse
import yaml
import numpy as np
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, callbacks


def set_seed(seed=42):
    \"\"\"Set random seeds for reproducibility.\"\"\"
    np.random.seed(seed)
    tf.random.set_seed(seed)


def create_model(input_dim, output_dim, hidden_dim=128):
    \"\"\"Create a simple neural network model.\"\"\"
    model = keras.Sequential([
        layers.Input(shape=(input_dim,)),
        layers.Dense(hidden_dim, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(hidden_dim, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(output_dim, activation='softmax' if output_dim > 1 else 'sigmoid')
    ])
    return model


def main():
    parser = argparse.ArgumentParser(description='Train model for ${task}')
    parser.add_argument('--config', type=str, default='config.yaml', help='Config file')
    parser.add_argument('--output', type=str, default='./outputs', help='Output directory')
    args = parser.parse_args()

    # Load config
    with open(args.config, 'r') as f:
        config = yaml.safe_load(f)

    set_seed(config.get('seed', 42))

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # TODO: Load your actual dataset
    print("Loading dataset...")
    input_dim = config.get('input_dim', 100)
    output_dim = config.get('output_dim', 10)

    # Dummy data - replace with actual data
    X_train = np.random.randn(1000, input_dim).astype(np.float32)
    y_train = np.random.randint(0, output_dim, 1000)
    X_val = np.random.randn(200, input_dim).astype(np.float32)
    y_val = np.random.randint(0, output_dim, 200)

    # Convert labels to categorical if multi-class
    if output_dim > 1:
        y_train = keras.utils.to_categorical(y_train, output_dim)
        y_val = keras.utils.to_categorical(y_val, output_dim)

    # Create model
    model = create_model(input_dim, output_dim, config.get('hidden_dim', 128))

    # Compile
    loss = 'categorical_crossentropy' if output_dim > 1 else 'binary_crossentropy'
    metrics = ['accuracy']

    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=config.get('learning_rate', 1e-3)),
        loss=loss,
        metrics=metrics
    )

    model.summary()

    # Callbacks
    checkpoint_cb = callbacks.ModelCheckpoint(
        os.path.join(args.output, 'best_model.h5'),
        monitor='val_accuracy',
        save_best_only=True,
        mode='max'
    )

    early_stop_cb = callbacks.EarlyStopping(
        monitor='val_accuracy',
        patience=config.get('patience', 10),
        restore_best_weights=True
    )

    reduce_lr_cb = callbacks.ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=5,
        min_lr=1e-6
    )

    # Train
    print("\\nStarting training...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=config.get('epochs', 100),
        batch_size=config.get('batch_size', 32),
        callbacks=[checkpoint_cb, early_stop_cb, reduce_lr_cb],
        verbose=1
    )

    # Save training history
    history_dict = {k: [float(v) for v in vals] for k, vals in history.history.items()}
    with open(os.path.join(args.output, 'history.json'), 'w') as f:
        json.dump(history_dict, f, indent=2)

    # Save final model
    model.save(os.path.join(args.output, 'final_model.h5'))

    # Save config
    with open(os.path.join(args.output, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)

    # Print final results
    best_val_acc = max(history.history['val_accuracy'])
    print(f"\\nTraining complete! Best validation accuracy: {best_val_acc:.4f}")
    print(f"Outputs saved to: {args.output}")


if __name__ == '__main__':
    main()
`;
}

/**
 * Generate TensorFlow evaluation script
 */
function generateTensorFlowEvaluate(task) {
  return `#!/usr/bin/env python3
\"\"\"
Evaluation script for ${task} using TensorFlow/Keras
Generated by experiment skill
\"\"\"

import os
import json
import argparse
import numpy as np
import tensorflow as tf
from tensorflow import keras
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
import matplotlib.pyplot as plt
import seaborn as sns


def compute_metrics(predictions, labels, metric_names):
    \"\"\"Compute specified metrics.\"\"\"
    results = {}

    # Convert probabilities to class labels if needed
    if len(predictions.shape) > 1 and predictions.shape[1] > 1:
        pred_labels = np.argmax(predictions, axis=1)
    else:
        pred_labels = (predictions > 0.5).astype(int).flatten()

    # Convert one-hot labels if needed
    if len(labels.shape) > 1 and labels.shape[1] > 1:
        true_labels = np.argmax(labels, axis=1)
    else:
        true_labels = labels.flatten()

    for metric in metric_names:
        if metric == 'accuracy':
            results[metric] = accuracy_score(true_labels, pred_labels)
        elif metric in ['precision', 'recall', 'f1', 'f1-score']:
            avg = 'binary' if len(np.unique(true_labels)) == 2 else 'weighted'
            p, r, f, _ = precision_recall_fscore_support(true_labels, pred_labels, average=avg, zero_division=0)
            results['precision'] = p
            results['recall'] = r
            results['f1'] = f

    return results, true_labels, pred_labels


def plot_confusion_matrix(labels, predictions, output_path):
    \"\"\"Plot and save confusion matrix.\"\"\"
    cm = confusion_matrix(labels, predictions)
    plt.figure(figsize=(10, 8))
    sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
    plt.xlabel('Predicted')
    plt.ylabel('True')
    plt.title('Confusion Matrix')
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()


def main():
    parser = argparse.ArgumentParser(description='Evaluate model for ${task}')
    parser.add_argument('--model', type=str, required=True, help='Path to model file (.h5)')
    parser.add_argument('--data', type=str, required=True, help='Path to test data')
    parser.add_argument('--output', type=str, default='./results', help='Output directory')
    parser.add_argument('--metrics', nargs='+', default=['accuracy'], help='Metrics to compute')
    args = parser.parse_args()

    # Create output directory
    os.makedirs(args.output, exist_ok=True)

    # Load model
    print("Loading model...")
    model = keras.models.load_model(args.model)

    # TODO: Load your actual test data
    print("Loading test data...")
    input_dim = 100  # Should match training config
    output_dim = 10

    # Dummy data - replace with actual test data
    X_test = np.random.randn(200, input_dim).astype(np.float32)
    y_test = np.random.randint(0, output_dim, 200)
    y_test_categorical = keras.utils.to_categorical(y_test, output_dim)

    # Predict
    print("Evaluating...")
    predictions = model.predict(X_test, verbose=0)

    # Compute metrics
    results, true_labels, pred_labels = compute_metrics(predictions, y_test_categorical, args.metrics)

    print("\\nResults:")
    for metric, value in results.items():
        print(f"  {metric}: {value:.4f}")

    # Save results
    results_data = {
        'metrics': results,
        'predictions': pred_labels.tolist(),
        'labels': true_labels.tolist()
    }

    with open(os.path.join(args.output, 'results.json'), 'w') as f:
        json.dump(results_data, f, indent=2)

    # Plot confusion matrix
    plot_confusion_matrix(true_labels, pred_labels, os.path.join(args.output, 'confusion_matrix.png'))

    print(f"\\nResults saved to: {args.output}")


if __name__ == '__main__':
    main()
`;
}

/**
 * Generate TensorFlow requirements
 */
function generateTensorFlowRequirements() {
  return `tensorflow>=2.13.0
numpy>=1.24.0
scikit-learn>=1.3.0
matplotlib>=3.7.0
seaborn>=0.12.0
pyyaml>=6.0
pandas>=2.0.0
`;
}

/**
 * Generate README
 */
function generateReadme(task, framework) {
  return `# Experiment: ${task}

Generated scaffold for ${framework} implementation.

## Files

- \`train.py\` - Training script
- \`evaluate.py\` - Evaluation script
- \`config.yaml\` - Configuration file
- \`requirements.txt\` - Python dependencies

## Setup

\`\`\`bash
pip install -r requirements.txt
\`\`\`

## Usage

### Training

\`\`\`bash
python train.py --config config.yaml --output ./outputs
\`\`\`

### Evaluation

\`\`\`bash
python evaluate.py --model ./outputs/best_model.pt --data ./test_data --output ./results
\`\`\`

## Configuration

Edit \`config.yaml\` to customize:
- Model architecture
- Training hyperparameters
- Data paths
- Evaluation metrics

## Notes

- Replace dummy data loading with your actual dataset
- Adjust model architecture for your specific task
- Update input/output dimensions in config.yaml
`;
}

/**
 * Generate config file
 */
function generateConfig(task) {
  return `# Experiment Configuration for ${task}

# Model architecture
input_dim: 100
output_dim: 10
hidden_dim: 128

# Training
epochs: 100
batch_size: 32
learning_rate: 0.001
seed: 42

# Early stopping
patience: 10

# Model selection
model: random_forest  # for sklearn

# Hyperparameter tuning
tune_hyperparams: false
param_grid: {}
`;
}

/**
 * Run or validate experiment
 */
export async function run(args) {
  const { configFile = './config.yaml', dryRun = true } = args;

  // Check if config file exists
  if (!fs.existsSync(configFile)) {
    throw new Error(`Config file not found: ${configFile}`);
  }

  // Read and parse config
  let config;
  try {
    const content = fs.readFileSync(configFile, 'utf8');
    // Simple YAML parsing for basic configs
    config = parseSimpleYAML(content);
  } catch (error) {
    throw new Error(`Failed to parse config: ${error.message}`);
  }

  // Validate config
  const validation = validateConfig(config);

  if (!validation.valid) {
    return {
      dryRun,
      valid: false,
      errors: validation.errors
    };
  }

  // Generate execution plan
  const plan = generateExecutionPlan(config);

  if (dryRun) {
    return {
      dryRun: true,
      valid: true,
      config,
      plan,
      message: 'Dry run completed. Set dryRun=false to execute.'
    };
  }

  // In a real implementation, this would execute the experiment
  return {
    dryRun: false,
    valid: true,
    config,
    plan,
    status: 'Execution would start here (not implemented in scaffold mode)'
  };
}

/**
 * Parse simple YAML
 */
function parseSimpleYAML(content) {
  const result = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        // Try to parse as number or boolean
        if (value === 'true') {
          result[key] = true;
        } else if (value === 'false') {
          result[key] = false;
        } else if (!isNaN(value) && value !== '') {
          result[key] = Number(value);
        } else if (value) {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

/**
 * Validate configuration
 */
function validateConfig(config) {
  const errors = [];
  const required = ['input_dim', 'output_dim'];

  for (const field of required) {
    if (config[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (config.learning_rate !== undefined && (config.learning_rate <= 0 || config.learning_rate > 1)) {
    errors.push('learning_rate must be between 0 and 1');
  }

  if (config.epochs !== undefined && config.epochs < 1) {
    errors.push('epochs must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate execution plan
 */
function generateExecutionPlan(config) {
  return {
    steps: [
      { step: 1, action: 'Load dataset', details: `Input dim: ${config.input_dim}` },
      { step: 2, action: 'Initialize model', details: `Output dim: ${config.output_dim}` },
      { step: 3, action: 'Train', details: `${config.epochs || 100} epochs, lr=${config.learning_rate || 0.001}` },
      { step: 4, action: 'Validate', details: 'Using validation split' },
      { step: 5, action: 'Save results', details: 'To output directory' }
    ],
    estimated_time: `${(config.epochs || 100) * 0.5} minutes (estimated)`
  };
}

/**
 * Analyze experiment results
 */
export async function analyze(args) {
  const { resultsFile, metrics } = args;

  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('Metrics array is required');
  }

  // Load results
  let results;
  if (resultsFile) {
    if (!fs.existsSync(resultsFile)) {
      throw new Error(`Results file not found: ${resultsFile}`);
    }
    const content = fs.readFileSync(resultsFile, 'utf8');
    try {
      results = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Invalid JSON in results file ${resultsFile}: ${parseError.message}`);
    }
  } else {
    // Use provided results directly
    results = args.results || {};
  }

  // Compute statistics
  const analysis = {
    metrics_summary: {},
    statistical_summary: {},
    recommendations: []
  };

  for (const metric of metrics) {
    const values = extractMetricValues(results, metric);

    if (values.length > 0) {
      analysis.metrics_summary[metric] = {
        mean: computeMean(values),
        std: computeStd(values),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
      };

      // Confidence interval (95%)
      const ci = computeConfidenceInterval(values);
      analysis.metrics_summary[metric].confidence_interval = ci;
    }
  }

  // Generate recommendations
  analysis.recommendations = generateRecommendations(analysis.metrics_summary);

  // AI analysis if available
  const llmClient = args.llmClient || global.llmClient;
  if (llmClient) {
    try {
      analysis.ai_insights = await generateAIAnalysis(llmClient, results, metrics, analysis);
    } catch (error) {
      console.error(`AI analysis failed: ${error.message}`);
    }
  }

  return analysis;
}

/**
 * Extract metric values from results
 */
function extractMetricValues(results, metric) {
  const values = [];

  // Try different result formats
  if (results.metrics && results.metrics[metric] !== undefined) {
    const v = results.metrics[metric];
    if (Array.isArray(v)) {
      values.push(...v);
    } else {
      values.push(v);
    }
  }

  if (results[metric] !== undefined) {
    const v = results[metric];
    if (Array.isArray(v)) {
      values.push(...v);
    } else {
      values.push(v);
    }
  }

  // Look in history
  if (results.history) {
    if (results.history[`val_${metric}`]) {
      values.push(...results.history[`val_${metric}`]);
    }
    if (results.history[metric]) {
      values.push(...results.history[metric]);
    }
  }

  return values.filter(v => typeof v === 'number');
}

/**
 * Compute mean
 */
function computeMean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute standard deviation
 */
function computeStd(values) {
  if (!values || values.length < 2) return 0;
  const mean = computeMean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute 95% confidence interval
 */
function computeConfidenceInterval(values) {
  if (!values || values.length === 0) return { lower: 0, upper: 0, confidence: 0.95 };
  const mean = computeMean(values);
  const std = computeStd(values);
  const n = values.length;
  const margin = n > 1 ? 1.96 * (std / Math.sqrt(n)) : 0;
  return {
    lower: mean - margin,
    upper: mean + margin,
    confidence: 0.95
  };
}

/**
 * Generate recommendations
 */
function generateRecommendations(metricsSummary) {
  const recommendations = [];

  for (const [metric, stats] of Object.entries(metricsSummary)) {
    if (stats.mean !== 0 && stats.std / stats.mean > 0.1) {
      recommendations.push(`High variance in ${metric} (${(stats.std/stats.mean*100).toFixed(1)}%) - consider more runs or check for instability`);
    }

    if (stats.mean < 0.5 && metric === 'accuracy') {
      recommendations.push(`Low accuracy (${(stats.mean*100).toFixed(1)}%) - model may need more training data or architecture changes`);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Results appear stable. Consider running additional experiments to validate.');
  }

  return recommendations;
}

/**
 * Generate AI analysis
 */
async function generateAIAnalysis(llmClient, results, metrics, analysis) {
  const prompt = `Analyze these experiment results and provide insights:

Metrics Summary:
${JSON.stringify(analysis.metrics_summary, null, 2)}

Recommendations:
${analysis.recommendations.join('\n')}

Provide:
1. Key findings
2. Comparison to typical baselines
3. Suggestions for improvement
4. Whether results are publishable`;

  try {
    const _r = await llmClient.chat([{role:"user",content:prompt}]); return _r.content;
  } catch (error) {
    return `Analysis unavailable: ${error.message}`;
  }
}

/**
 * Make experiment decision
 */
export async function decide(args) {
  const { results, targets, history = [] } = args;

  if (!results || typeof results !== 'object') {
    throw new Error('Results object is required');
  }

  if (!targets || typeof targets !== 'object') {
    throw new Error('Targets object is required');
  }

  // Compare results against targets
  const comparisons = {};
  let allTargetsMet = true;
  let anyImprovement = false;

  for (const [metric, target] of Object.entries(targets)) {
    const actual = results[metric] || results.metrics?.[metric];

    if (actual === undefined) {
      comparisons[metric] = { target, actual: null, status: 'missing' };
      allTargetsMet = false;
      continue;
    }

    const gap = ((actual - target) / target) * 100;
    comparisons[metric] = { target, actual, gap, status: gap >= 0 ? 'met' : 'below' };

    if (gap < 0) {
      allTargetsMet = false;
      if (gap < -15) {
        comparisons[metric].severity = 'critical';
      }
    }

    // Check for improvement in history
    if (history.length > 0) {
      const previous = history[history.length - 1][metric];
      if (previous !== undefined && actual > previous) {
        anyImprovement = true;
        comparisons[metric].improving = true;
      }
    }
  }

  // Make decision
  let decision;
  let reason;
  let suggestions = [];

  if (allTargetsMet) {
    decision = 'COMPLETE';
    reason = 'All target metrics achieved';
    suggestions.push('Document results and prepare for publication');
    suggestions.push('Consider additional ablation studies');
  } else {
    const criticalGaps = Object.values(comparisons).filter(c => c.severity === 'critical').length;

    if (criticalGaps > 0 && !anyImprovement) {
      decision = 'PIVOT';
      reason = `Critical gaps (>15%) in ${criticalGaps} metrics with no improvement trend`;
      suggestions.push('Consider a fundamentally different approach');
      suggestions.push('Review literature for alternative methods');
      suggestions.push('Simplify the problem or reduce scope');
    } else {
      decision = 'REFINE';
      reason = anyImprovement
        ? 'Making progress toward targets, continue optimization'
        : 'Gaps exist but within acceptable range for refinement';
      suggestions.push('Tune hyperparameters');
      suggestions.push('Increase training data or epochs');
      suggestions.push('Try ensemble methods');
    }
  }

  return {
    decision,
    reason,
    comparisons,
    suggestions,
    timestamp: new Date().toISOString()
  };
}

// Wire execute methods into commands array (loader expects commands[i].execute)
commands.find(c => c.name === 'design').execute   = (args, ctx) => design({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'scaffold').execute = (args, ctx) => scaffold({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'run').execute      = (args, ctx) => run({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'analyze').execute  = (args, ctx) => analyze({...args, llmClient: ctx?.llmClient});
commands.find(c => c.name === 'decide').execute   = (args, ctx) => decide({...args, llmClient: ctx?.llmClient});

// Default export
export default {
  name,
  description,
  version,
  commands,
  design,
  scaffold,
  run,
  analyze,
  decide
};

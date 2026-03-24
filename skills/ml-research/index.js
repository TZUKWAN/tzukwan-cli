/**
 * ML Research Skill - Machine learning pipeline, model implementation, tuning, tracking, and diagnosis
 * Commands: pipeline, implement, tune, track, diagnose
 */

import fs from 'fs';
import path from 'path';

// ─── Code Templates ──────────────────────────────────────────────────────────

const PIPELINE_TEMPLATES = {
  pytorch: {
    classification: `import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
import numpy as np

# ─── Config ───────────────────────────────────────────────────────
config = {
    'batch_size': 32,
    'lr': 1e-3,
    'epochs': 50,
    'num_classes': 10,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
    'seed': 42,
}
torch.manual_seed(config['seed'])

# ─── Dataset ──────────────────────────────────────────────────────
class ClassificationDataset(Dataset):
    def __init__(self, data, labels, transform=None):
        self.data = data
        self.labels = labels
        self.transform = transform

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        x = self.data[idx]
        if self.transform:
            x = self.transform(x)
        return x, self.labels[idx]

train_transform = transforms.Compose([
    transforms.RandomHorizontalFlip(),
    transforms.RandomCrop(32, padding=4),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])
val_transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# ─── Model ────────────────────────────────────────────────────────
model = models.resnet18(pretrained=True)
model.fc = nn.Linear(model.fc.in_features, config['num_classes'])
model = model.to(config['device'])

# ─── Optimizer & Scheduler ────────────────────────────────────────
optimizer = optim.AdamW(model.parameters(), lr=config['lr'], weight_decay=1e-4)
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=config['epochs'])
criterion = nn.CrossEntropyLoss()

# ─── Training Loop ────────────────────────────────────────────────
def train_epoch(model, loader, optimizer, criterion, device):
    model.train()
    total_loss, correct = 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        optimizer.zero_grad()
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += loss.item() * x.size(0)
        correct += (logits.argmax(1) == y).sum().item()
    n = len(loader.dataset)
    return total_loss / n, correct / n

def eval_epoch(model, loader, criterion, device):
    model.eval()
    total_loss, correct = 0.0, 0
    with torch.no_grad():
        for x, y in loader:
            x, y = x.to(device), y.to(device)
            logits = model(x)
            total_loss += criterion(logits, y).item() * x.size(0)
            correct += (logits.argmax(1) == y).sum().item()
    n = len(loader.dataset)
    return total_loss / n, correct / n

best_val_acc = 0.0
for epoch in range(config['epochs']):
    train_loss, train_acc = train_epoch(model, train_loader, optimizer, criterion, config['device'])
    val_loss, val_acc = eval_epoch(model, val_loader, criterion, config['device'])
    scheduler.step()
    print(f"Epoch {epoch+1}/{config['epochs']}  train_loss={train_loss:.4f}  train_acc={train_acc:.4f}  val_loss={val_loss:.4f}  val_acc={val_acc:.4f}")
    if val_acc > best_val_acc:
        best_val_acc = val_acc
        torch.save(model.state_dict(), 'best_model.pth')
print(f"Best val_acc: {best_val_acc:.4f}")
`,
    regression: `import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np

config = {
    'batch_size': 64,
    'lr': 1e-3,
    'epochs': 100,
    'hidden_dims': [256, 128, 64],
    'dropout': 0.2,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
}

class RegressionDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.FloatTensor(X)
        self.y = torch.FloatTensor(y).unsqueeze(1)
    def __len__(self): return len(self.y)
    def __getitem__(self, idx): return self.X[idx], self.y[idx]

class MLP(nn.Module):
    def __init__(self, in_dim, hidden_dims, dropout):
        super().__init__()
        layers = []
        prev = in_dim
        for h in hidden_dims:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)
    def forward(self, x): return self.net(x)

model = MLP(in_dim=X_train.shape[1], hidden_dims=config['hidden_dims'], dropout=config['dropout']).to(config['device'])
optimizer = optim.Adam(model.parameters(), lr=config['lr'])
criterion = nn.MSELoss()

for epoch in range(config['epochs']):
    model.train()
    for X_batch, y_batch in train_loader:
        X_batch, y_batch = X_batch.to(config['device']), y_batch.to(config['device'])
        optimizer.zero_grad()
        loss = criterion(model(X_batch), y_batch)
        loss.backward()
        optimizer.step()
`,
    nlp: `import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification, get_linear_schedule_with_warmup
from torch.utils.data import Dataset, DataLoader
import torch.optim as optim

config = {
    'model_name': 'bert-base-uncased',
    'max_length': 128,
    'batch_size': 16,
    'lr': 2e-5,
    'epochs': 3,
    'warmup_ratio': 0.1,
    'num_labels': 2,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
}

tokenizer = AutoTokenizer.from_pretrained(config['model_name'])

class TextDataset(Dataset):
    def __init__(self, texts, labels):
        self.encodings = tokenizer(texts, truncation=True, padding='max_length',
                                    max_length=config['max_length'], return_tensors='pt')
        self.labels = torch.LongTensor(labels)
    def __len__(self): return len(self.labels)
    def __getitem__(self, idx):
        return {k: v[idx] for k, v in self.encodings.items()}, self.labels[idx]

model = AutoModelForSequenceClassification.from_pretrained(config['model_name'], num_labels=config['num_labels'])
model = model.to(config['device'])

total_steps = len(train_loader) * config['epochs']
optimizer = optim.AdamW(model.parameters(), lr=config['lr'], weight_decay=0.01)
scheduler = get_linear_schedule_with_warmup(optimizer,
    num_warmup_steps=int(total_steps * config['warmup_ratio']),
    num_training_steps=total_steps)

for epoch in range(config['epochs']):
    model.train()
    for batch, labels in train_loader:
        batch = {k: v.to(config['device']) for k, v in batch.items()}
        labels = labels.to(config['device'])
        optimizer.zero_grad()
        outputs = model(**batch, labels=labels)
        outputs.loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
`,
    cv: `import torch
import torch.nn as nn
from torchvision import transforms, models
from torch.utils.data import DataLoader
import torch.optim as optim

config = {
    'backbone': 'resnet50',
    'num_classes': 1000,
    'batch_size': 32,
    'lr': 1e-3,
    'epochs': 90,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
    'mixup_alpha': 0.2,
}

train_transform = transforms.Compose([
    transforms.RandomResizedCrop(224),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.4),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

model = models.resnet50(pretrained=False, num_classes=config['num_classes']).to(config['device'])
optimizer = optim.SGD(model.parameters(), lr=config['lr'], momentum=0.9, weight_decay=1e-4)
scheduler = optim.lr_scheduler.OneCycleLR(optimizer, max_lr=config['lr'],
    steps_per_epoch=len(train_loader), epochs=config['epochs'])
criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
`,
    'time-series': `import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torch.optim as optim
import numpy as np

config = {
    'seq_len': 96,
    'pred_len': 24,
    'hidden_size': 128,
    'num_layers': 2,
    'dropout': 0.2,
    'batch_size': 32,
    'lr': 1e-3,
    'epochs': 50,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
}

class TimeSeriesDataset(Dataset):
    def __init__(self, data, seq_len, pred_len):
        self.data = torch.FloatTensor(data)
        self.seq_len = seq_len
        self.pred_len = pred_len
    def __len__(self): return len(self.data) - self.seq_len - self.pred_len
    def __getitem__(self, idx):
        x = self.data[idx: idx + self.seq_len]
        y = self.data[idx + self.seq_len: idx + self.seq_len + self.pred_len]
        return x, y

class LSTMForecaster(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, pred_len, dropout):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers,
                            batch_first=True, dropout=dropout)
        self.fc = nn.Linear(hidden_size, pred_len)
    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

model = LSTMForecaster(1, config['hidden_size'], config['num_layers'],
                        config['pred_len'], config['dropout']).to(config['device'])
optimizer = optim.Adam(model.parameters(), lr=config['lr'])
criterion = nn.MSELoss()
`,
    recommendation: `import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torch.optim as optim

config = {
    'n_users': 10000,
    'n_items': 5000,
    'embed_dim': 64,
    'hidden_dims': [256, 128],
    'dropout': 0.3,
    'batch_size': 1024,
    'lr': 1e-3,
    'epochs': 20,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
}

class InteractionDataset(Dataset):
    def __init__(self, user_ids, item_ids, ratings):
        self.users = torch.LongTensor(user_ids)
        self.items = torch.LongTensor(item_ids)
        self.ratings = torch.FloatTensor(ratings)
    def __len__(self): return len(self.ratings)
    def __getitem__(self, idx): return self.users[idx], self.items[idx], self.ratings[idx]

class NCF(nn.Module):
    def __init__(self, n_users, n_items, embed_dim, hidden_dims, dropout):
        super().__init__()
        self.user_embed = nn.Embedding(n_users, embed_dim)
        self.item_embed = nn.Embedding(n_items, embed_dim)
        layers = []
        prev = embed_dim * 2
        for h in hidden_dims:
            layers += [nn.Linear(prev, h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.mlp = nn.Sequential(*layers)
    def forward(self, user, item):
        x = torch.cat([self.user_embed(user), self.item_embed(item)], dim=-1)
        return self.mlp(x).squeeze(-1)

model = NCF(**{k: config[k] for k in ['n_users','n_items','embed_dim','hidden_dims','dropout']}).to(config['device'])
optimizer = optim.Adam(model.parameters(), lr=config['lr'])
criterion = nn.BCEWithLogitsLoss()
`,
  },
  sklearn: {
    classification: `from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
import numpy as np
import joblib

# ─── Pipeline ─────────────────────────────────────────────────────
pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('clf', GradientBoostingClassifier(n_estimators=200, learning_rate=0.05,
                                        max_depth=4, random_state=42)),
])

# ─── Cross-Validation ─────────────────────────────────────────────
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring='f1_macro', n_jobs=-1)
print(f"CV F1 (macro): {scores.mean():.4f} ± {scores.std():.4f}")

# ─── Train & Evaluate ─────────────────────────────────────────────
pipeline.fit(X_train, y_train)
y_pred = pipeline.predict(X_test)
print(classification_report(y_test, y_pred))

# ─── Save ─────────────────────────────────────────────────────────
joblib.dump(pipeline, 'model_pipeline.joblib')
`,
    regression: `from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler, PolynomialFeatures
from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import KFold, cross_val_score
from sklearn.metrics import mean_squared_error, r2_score
import numpy as np
import joblib

pipeline = Pipeline([
    ('poly', PolynomialFeatures(degree=2, include_bias=False)),
    ('scaler', StandardScaler()),
    ('reg', GradientBoostingRegressor(n_estimators=200, learning_rate=0.05,
                                       max_depth=4, random_state=42)),
])

cv = KFold(n_splits=5, shuffle=True, random_state=42)
neg_mse = cross_val_score(pipeline, X_train, y_train, cv=cv, scoring='neg_mean_squared_error')
print(f"CV RMSE: {np.sqrt(-neg_mse).mean():.4f}")

pipeline.fit(X_train, y_train)
y_pred = pipeline.predict(X_test)
print(f"Test RMSE: {np.sqrt(mean_squared_error(y_test, y_pred)):.4f}")
print(f"Test R2:   {r2_score(y_test, y_pred):.4f}")
joblib.dump(pipeline, 'model_pipeline.joblib')
`,
  },
};

const MODEL_TEMPLATES = {
  transformer: `import torch
import torch.nn as nn
import math

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, n_heads, dropout=0.1):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_k = d_model // n_heads
        self.n_heads = n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.out = nn.Linear(d_model, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        B, T, C = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        q = q.view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        k = k.view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        v = v.view(B, T, self.n_heads, self.d_k).transpose(1, 2)
        attn = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_k)
        if mask is not None:
            attn = attn.masked_fill(mask == 0, float('-inf'))
        attn = self.dropout(torch.softmax(attn, dim=-1))
        out = (attn @ v).transpose(1, 2).contiguous().view(B, T, C)
        return self.out(out)

class FeedForward(nn.Module):
    def __init__(self, d_model, d_ff, dropout=0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d_model, d_ff), nn.GELU(), nn.Dropout(dropout), nn.Linear(d_ff, d_model)
        )
    def forward(self, x): return self.net(x)

class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff, dropout=0.1):
        super().__init__()
        self.attn = MultiHeadAttention(d_model, n_heads, dropout)
        self.ff = FeedForward(d_model, d_ff, dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        x = x + self.drop(self.attn(self.norm1(x), mask))
        x = x + self.drop(self.ff(self.norm2(x)))
        return x

class Transformer(nn.Module):
    def __init__(self, vocab_size, d_model=512, n_heads=8, n_layers=6, d_ff=2048,
                 max_seq_len=512, num_classes=None, dropout=0.1):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, d_model)
        self.pos_embed = nn.Embedding(max_seq_len, d_model)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, n_heads, d_ff, dropout) for _ in range(n_layers)
        ])
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, num_classes or vocab_size)
        self.drop = nn.Dropout(dropout)

    def forward(self, x, mask=None):
        B, T = x.shape
        pos = torch.arange(T, device=x.device).unsqueeze(0)
        x = self.drop(self.embed(x) + self.pos_embed(pos))
        for block in self.blocks:
            x = block(x, mask)
        x = self.norm(x)
        return self.head(x)
`,
  resnet: `import torch
import torch.nn as nn

class ResidualBlock(nn.Module):
    expansion = 1
    def __init__(self, in_ch, out_ch, stride=1):
        super().__init__()
        self.conv1 = nn.Conv2d(in_ch, out_ch, 3, stride=stride, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_ch)
        self.conv2 = nn.Conv2d(out_ch, out_ch, 3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_ch)
        self.relu = nn.ReLU(inplace=True)
        self.shortcut = nn.Sequential()
        if stride != 1 or in_ch != out_ch:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_ch, out_ch, 1, stride=stride, bias=False),
                nn.BatchNorm2d(out_ch)
            )

    def forward(self, x):
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.relu(out + self.shortcut(x))

class ResNet(nn.Module):
    def __init__(self, block, layers, num_classes=1000):
        super().__init__()
        self.in_ch = 64
        self.conv1 = nn.Conv2d(3, 64, 7, stride=2, padding=3, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)
        self.maxpool = nn.MaxPool2d(3, stride=2, padding=1)
        self.layer1 = self._make_layer(block, 64, layers[0])
        self.layer2 = self._make_layer(block, 128, layers[1], stride=2)
        self.layer3 = self._make_layer(block, 256, layers[2], stride=2)
        self.layer4 = self._make_layer(block, 512, layers[3], stride=2)
        self.avgpool = nn.AdaptiveAvgPool2d(1)
        self.fc = nn.Linear(512, num_classes)

    def _make_layer(self, block, ch, n_blocks, stride=1):
        layers = [block(self.in_ch, ch, stride)]
        self.in_ch = ch
        for _ in range(1, n_blocks):
            layers.append(block(ch, ch))
        return nn.Sequential(*layers)

    def forward(self, x):
        x = self.maxpool(self.relu(self.bn1(self.conv1(x))))
        for layer in [self.layer1, self.layer2, self.layer3, self.layer4]:
            x = layer(x)
        return self.fc(self.avgpool(x).flatten(1))

def resnet18(num_classes=1000): return ResNet(ResidualBlock, [2,2,2,2], num_classes)
def resnet34(num_classes=1000): return ResNet(ResidualBlock, [3,4,6,3], num_classes)
`,
  lstm: `import torch
import torch.nn as nn

class StackedLSTM(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size,
                 dropout=0.2, bidirectional=False):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size, hidden_size, num_layers,
            batch_first=True, dropout=dropout if num_layers > 1 else 0,
            bidirectional=bidirectional
        )
        self.drop = nn.Dropout(dropout)
        d = 2 if bidirectional else 1
        self.fc = nn.Linear(hidden_size * d, output_size)

    def forward(self, x, h=None):
        out, (h_n, c_n) = self.lstm(x, h)
        # Use last timestep output
        last = out[:, -1, :]
        return self.fc(self.drop(last))
`,
  bert: `# BERT Fine-tuning with Hugging Face Transformers
from transformers import BertTokenizer, BertForSequenceClassification, AdamW, get_linear_schedule_with_warmup
import torch

config = {
    'model_name': 'bert-base-uncased',
    'num_labels': 2,
    'max_length': 128,
    'batch_size': 16,
    'lr': 2e-5,
    'epochs': 3,
    'warmup_steps': 500,
    'device': 'cuda' if torch.cuda.is_available() else 'cpu',
}

tokenizer = BertTokenizer.from_pretrained(config['model_name'])
model = BertForSequenceClassification.from_pretrained(
    config['model_name'], num_labels=config['num_labels']
).to(config['device'])

optimizer = AdamW(model.parameters(), lr=config['lr'], eps=1e-8)
scheduler = get_linear_schedule_with_warmup(optimizer,
    num_warmup_steps=config['warmup_steps'],
    num_training_steps=len(train_loader) * config['epochs'])

# Training
for epoch in range(config['epochs']):
    model.train()
    for batch in train_loader:
        input_ids = batch['input_ids'].to(config['device'])
        attention_mask = batch['attention_mask'].to(config['device'])
        labels = batch['labels'].to(config['device'])
        optimizer.zero_grad()
        outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
        outputs.loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
`,
  gpt: `import torch
import torch.nn as nn
import math

class CausalSelfAttention(nn.Module):
    def __init__(self, d_model, n_heads, max_seq_len, dropout=0.1):
        super().__init__()
        self.d_k = d_model // n_heads
        self.n_heads = n_heads
        self.qkv = nn.Linear(d_model, 3 * d_model)
        self.proj = nn.Linear(d_model, d_model)
        self.attn_drop = nn.Dropout(dropout)
        # causal mask
        mask = torch.tril(torch.ones(max_seq_len, max_seq_len))
        self.register_buffer('mask', mask.view(1, 1, max_seq_len, max_seq_len))

    def forward(self, x):
        B, T, C = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        q = q.view(B, T, self.n_heads, self.d_k).transpose(1,2)
        k = k.view(B, T, self.n_heads, self.d_k).transpose(1,2)
        v = v.view(B, T, self.n_heads, self.d_k).transpose(1,2)
        attn = (q @ k.transpose(-2,-1)) / math.sqrt(self.d_k)
        attn = attn.masked_fill(self.mask[:,:,:T,:T] == 0, float('-inf'))
        attn = self.attn_drop(torch.softmax(attn, dim=-1))
        out = (attn @ v).transpose(1,2).contiguous().view(B, T, C)
        return self.proj(out)

class GPTBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff, max_seq_len, dropout=0.1):
        super().__init__()
        self.attn = CausalSelfAttention(d_model, n_heads, max_seq_len, dropout)
        self.ff = nn.Sequential(nn.Linear(d_model, d_ff), nn.GELU(), nn.Linear(d_ff, d_model))
        self.ln1 = nn.LayerNorm(d_model)
        self.ln2 = nn.LayerNorm(d_model)
        self.drop = nn.Dropout(dropout)

    def forward(self, x):
        x = x + self.drop(self.attn(self.ln1(x)))
        x = x + self.drop(self.ff(self.ln2(x)))
        return x

class GPT(nn.Module):
    def __init__(self, vocab_size, d_model=768, n_heads=12, n_layers=12,
                 d_ff=3072, max_seq_len=1024, dropout=0.1):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(max_seq_len, d_model)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([
            GPTBlock(d_model, n_heads, d_ff, max_seq_len, dropout) for _ in range(n_layers)
        ])
        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.max_seq_len = max_seq_len

    def forward(self, idx):
        B, T = idx.shape
        assert T <= self.max_seq_len
        pos = torch.arange(T, device=idx.device)
        x = self.drop(self.tok_emb(idx) + self.pos_emb(pos))
        for block in self.blocks:
            x = block(x)
        return self.head(self.ln_f(x))
`,
  vae: `import torch
import torch.nn as nn
import torch.nn.functional as F

class VAE(nn.Module):
    def __init__(self, input_dim, hidden_dim, latent_dim):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, hidden_dim), nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim), nn.ReLU(),
        )
        self.mu_head = nn.Linear(hidden_dim, latent_dim)
        self.logvar_head = nn.Linear(hidden_dim, latent_dim)
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim), nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim), nn.ReLU(),
            nn.Linear(hidden_dim, input_dim), nn.Sigmoid(),
        )

    def encode(self, x):
        h = self.encoder(x)
        return self.mu_head(h), self.logvar_head(h)

    def reparameterize(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        return mu + std * torch.randn_like(std)

    def decode(self, z): return self.decoder(z)

    def forward(self, x):
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        return self.decode(z), mu, logvar

def vae_loss(recon_x, x, mu, logvar, beta=1.0):
    recon_loss = F.binary_cross_entropy(recon_x, x, reduction='sum')
    kld = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp())
    return (recon_loss + beta * kld) / x.size(0)
`,
  gan: `import torch
import torch.nn as nn

class Generator(nn.Module):
    def __init__(self, latent_dim, hidden_dim, output_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(latent_dim, hidden_dim), nn.LeakyReLU(0.2),
            nn.BatchNorm1d(hidden_dim),
            nn.Linear(hidden_dim, hidden_dim * 2), nn.LeakyReLU(0.2),
            nn.BatchNorm1d(hidden_dim * 2),
            nn.Linear(hidden_dim * 2, output_dim), nn.Tanh(),
        )
    def forward(self, z): return self.net(z)

class Discriminator(nn.Module):
    def __init__(self, input_dim, hidden_dim):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim * 2), nn.LeakyReLU(0.2), nn.Dropout(0.3),
            nn.Linear(hidden_dim * 2, hidden_dim), nn.LeakyReLU(0.2), nn.Dropout(0.3),
            nn.Linear(hidden_dim, 1),
        )
    def forward(self, x): return self.net(x)

# Training (WGAN-GP style)
latent_dim, hidden_dim, data_dim = 128, 256, 784
G = Generator(latent_dim, hidden_dim, data_dim)
D = Discriminator(data_dim, hidden_dim)

g_opt = torch.optim.Adam(G.parameters(), lr=1e-4, betas=(0.0, 0.9))
d_opt = torch.optim.Adam(D.parameters(), lr=1e-4, betas=(0.0, 0.9))
criterion = nn.BCEWithLogitsLoss()
`,
};

// ─── Command Implementations ─────────────────────────────────────────────────

async function pipelineCommand(args, context) {
  const {
    task = 'classification',
    framework = 'pytorch',
    dataset,
    outputDir = './ml-pipeline',
  } = args;

  const validTasks = ['classification', 'regression', 'nlp', 'cv', 'time-series', 'recommendation'];
  const validFrameworks = ['pytorch', 'sklearn', 'scikit-learn'];

  if (!validTasks.includes(task)) {
    return { error: `Unknown task "${task}". Supported: ${validTasks.join(', ')}` };
  }

  const fw = framework === 'scikit-learn' ? 'sklearn' : framework;
  if (!['pytorch', 'sklearn'].includes(fw)) {
    return { error: `Unknown framework "${framework}". Supported: pytorch, sklearn, scikit-learn` };
  }

  // Select the best available template
  const fwTemplates = PIPELINE_TEMPLATES[fw] || PIPELINE_TEMPLATES['pytorch'];
  let code = fwTemplates[task];

  // Fallback: pytorch classification if combo not defined
  if (!code) {
    code = PIPELINE_TEMPLATES['pytorch']['classification'];
  }

  // Add dataset comment if provided
  if (dataset) {
    code = `# Dataset: ${dataset}\n` + code;
  }

  const header = `#!/usr/bin/env python3
"""
ML Training Pipeline
Task:      ${task}
Framework: ${framework}
Dataset:   ${dataset || 'user-provided'}
Generated: ${new Date().toISOString()}
"""
`;
  const fullCode = header + code;

  let savedPath = null;
  try {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    savedPath = path.join(outputDir, 'pipeline.py');
    fs.writeFileSync(savedPath, fullCode, 'utf-8');
  } catch (err) {
    return { error: `Failed to write pipeline: ${err.message}` };
  }

  return {
    task,
    framework,
    dataset: dataset || null,
    savedPath,
    code: fullCode,
    output: `ML pipeline generated for ${task} (${framework})\nSaved to: ${savedPath}\n\nKey components:\n  - Data loading & preprocessing\n  - Model architecture\n  - Training loop with gradient clipping\n  - Evaluation & checkpointing`,
  };
}

async function implementCommand(args, context) {
  const { model, framework = 'pytorch' } = args;

  const validModels = Object.keys(MODEL_TEMPLATES);
  if (!model) {
    return { error: `model is required. Supported: ${validModels.join(', ')}` };
  }

  const key = model.toLowerCase();
  const code = MODEL_TEMPLATES[key];
  if (!code) {
    return {
      error: `Model "${model}" not found. Supported: ${validModels.join(', ')}`,
    };
  }

  const usage = {
    transformer: 'model = Transformer(vocab_size=30000, d_model=512, n_heads=8, n_layers=6)',
    resnet: 'model = resnet18(num_classes=10)  # or resnet34()',
    lstm: 'model = StackedLSTM(input_size=1, hidden_size=128, num_layers=2, output_size=1)',
    bert: 'Already uses HuggingFace — adjust model_name and num_labels in config',
    gpt: 'model = GPT(vocab_size=50257, d_model=768, n_heads=12, n_layers=12)',
    vae: 'model = VAE(input_dim=784, hidden_dim=400, latent_dim=20)',
    gan: 'Instantiate Generator and Discriminator separately, then train with alternating optimizer steps',
  };

  return {
    model,
    framework,
    code,
    usage: usage[key] || '',
    output: `${model.toUpperCase()} implementation (${framework})\n\nUsage hint:\n  ${usage[key] || ''}\n\nCode length: ${code.split('\n').length} lines`,
  };
}

async function tuneCommand(args, context) {
  const {
    model = 'model',
    searchSpace = {},
    trials = 20,
    method = 'grid',
  } = args;

  const validMethods = ['grid', 'random', 'bayesian'];
  if (!validMethods.includes(method)) {
    return { error: `Unknown method "${method}". Supported: ${validMethods.join(', ')}` };
  }

  // Build search space representation
  const spaceStr = Object.entries(searchSpace)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `    '${k}': ${JSON.stringify(v)},`;
      return `    '${k}': ${JSON.stringify(v)},`;
    })
    .join('\n') || "    'lr': [1e-4, 1e-3, 1e-2],\n    'batch_size': [16, 32, 64],";

  let tuningCode = '';

  if (method === 'grid') {
    tuningCode = `from sklearn.model_selection import GridSearchCV
from sklearn.pipeline import Pipeline
import numpy as np

search_space = {
${spaceStr}
}

# For sklearn estimators
grid_search = GridSearchCV(
    estimator=model,
    param_grid=search_space,
    cv=5,
    scoring='f1_macro',
    n_jobs=-1,
    verbose=2,
    refit=True,
)
grid_search.fit(X_train, y_train)

print(f"Best score:  {grid_search.best_score_:.4f}")
print(f"Best params: {grid_search.best_params_}")
best_model = grid_search.best_estimator_
`;
  } else if (method === 'random') {
    tuningCode = `from sklearn.model_selection import RandomizedSearchCV
import numpy as np

search_space = {
${spaceStr}
}

random_search = RandomizedSearchCV(
    estimator=model,
    param_distributions=search_space,
    n_iter=${trials},
    cv=5,
    scoring='f1_macro',
    n_jobs=-1,
    random_state=42,
    verbose=2,
)
random_search.fit(X_train, y_train)
print(f"Best score:  {random_search.best_score_:.4f}")
print(f"Best params: {random_search.best_params_}")
`;
  } else {
    // bayesian / optuna
    tuningCode = `import optuna
import torch
import torch.nn as nn
optuna.logging.set_verbosity(optuna.logging.WARNING)

def objective(trial):
${Object.entries(searchSpace).length > 0
  ? Object.entries(searchSpace).map(([k, v]) => {
      if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') {
        return `    ${k} = trial.suggest_float('${k}', ${v[0]}, ${v[1]}, log=${v[0] < 0.01 ? 'True' : 'False'})`;
      } else if (Array.isArray(v)) {
        return `    ${k} = trial.suggest_categorical('${k}', ${JSON.stringify(v)})`;
      }
      return `    ${k} = trial.suggest_float('${k}', 1e-5, 1e-1, log=True)`;
    }).join('\n')
  : `    lr = trial.suggest_float('lr', 1e-5, 1e-2, log=True)
    batch_size = trial.suggest_categorical('batch_size', [16, 32, 64])
    dropout = trial.suggest_float('dropout', 0.1, 0.5)
    hidden_dim = trial.suggest_categorical('hidden_dim', [128, 256, 512])`}

    # ── Build and train ${model} with trial hyperparams ──
    # model = build_model(lr=lr, dropout=dropout, ...)
    # val_score = train_and_evaluate(model, ...)
    # return val_score
    raise NotImplementedError("Replace with your training logic")

study = optuna.create_study(direction='maximize',
    sampler=optuna.samplers.TPESampler(seed=42))
study.optimize(objective, n_trials=${trials}, show_progress_bar=True)

print(f"Best trial:  #{study.best_trial.number}")
print(f"Best value:  {study.best_value:.4f}")
print(f"Best params: {study.best_params}")

# Importance analysis
importances = optuna.importance.get_param_importances(study)
print("\\nParameter importance:")
for param, imp in importances.items():
    print(f"  {param}: {imp:.3f}")
`;
  }

  return {
    model,
    method,
    trials,
    searchSpace,
    code: tuningCode,
    output: `Hyperparameter tuning script generated\nMethod: ${method} | Trials: ${trials}\n\nSearch space:\n${spaceStr}\n\nCopy the code into your training script and replace the placeholder training logic.`,
  };
}

async function trackCommand(args, context) {
  const {
    experimentName = 'experiment',
    metrics = [],
    tags = {},
  } = args;

  const metricsStr = Array.isArray(metrics) ? metrics : String(metrics).split(',').map(s => s.trim());
  const tagsStr = typeof tags === 'object' ? JSON.stringify(tags, null, 4) : String(tags);

  const mlflowCode = `import mlflow
import mlflow.pytorch  # or mlflow.sklearn

# ─── Initialize ───────────────────────────────────────────────────
mlflow.set_experiment("${experimentName}")

with mlflow.start_run(run_name="${experimentName}_${Date.now()}") as run:
    # ─── Log Tags ─────────────────────────────────────────────────
    mlflow.set_tags(${tagsStr})

    # ─── Log Hyperparams ──────────────────────────────────────────
    mlflow.log_params({
        'lr': config['lr'],
        'batch_size': config['batch_size'],
        'epochs': config['epochs'],
        # Add more params here
    })

    # ─── Training Loop ────────────────────────────────────────────
    for epoch in range(config['epochs']):
        # ... training code ...

        # Log metrics each epoch
${metricsStr.map(m => `        mlflow.log_metric("${m}", ${m}_value, step=epoch)`).join('\n') || '        mlflow.log_metric("train_loss", train_loss, step=epoch)\n        mlflow.log_metric("val_loss", val_loss, step=epoch)\n        mlflow.log_metric("val_acc", val_acc, step=epoch)'}

    # ─── Save Model ───────────────────────────────────────────────
    mlflow.pytorch.log_model(model, "model")
    # For sklearn: mlflow.sklearn.log_model(pipeline, "model")

    print(f"Run ID: {run.info.run_id}")
    print(f"Experiment: ${experimentName}")
    print(f"Tracking URI: {mlflow.get_tracking_uri()}")

# ─── View results ─────────────────────────────────────────────────
# $ mlflow ui --port 5000
# Then open http://localhost:5000 in your browser
`;

  const wandbCode = `import wandb

# ─── Initialize ───────────────────────────────────────────────────
wandb.init(
    project="${experimentName}",
    name="${experimentName}_run",
    tags=${JSON.stringify(Object.values(tags))},
    config={
        'lr': config['lr'],
        'batch_size': config['batch_size'],
        'epochs': config['epochs'],
    }
)

# ─── During Training ──────────────────────────────────────────────
for epoch in range(config['epochs']):
    # ... training code ...
    wandb.log({
${metricsStr.map(m => `        "${m}": ${m}_value,`).join('\n') || '        "train_loss": train_loss,\n        "val_loss": val_loss,\n        "val_acc": val_acc,'}
        "epoch": epoch,
    })

# ─── Save Model Artifact ──────────────────────────────────────────
wandb.save("best_model.pth")
wandb.finish()
`;

  return {
    experimentName,
    metrics: metricsStr,
    tags,
    mlflowCode,
    wandbCode,
    output: `Experiment tracking code generated for "${experimentName}"\n\nMLflow snippet:\n${mlflowCode.slice(0, 300)}...\n\nW&B snippet available in wandbCode field.\n\nInstall: pip install mlflow wandb`,
  };
}

async function diagnoseCommand(args, context) {
  const { error = '', trainingLog = '' } = args;

  const combined = `${error} ${trainingLog}`.toLowerCase();
  const issues = [];
  const suggestions = [];
  let severity = 'low';

  // Rule-based diagnosis
  if (/nan|inf|gradient.*explod|loss.*nan/.test(combined)) {
    issues.push('Gradient explosion detected (NaN/Inf loss)');
    suggestions.push('Apply gradient clipping: torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)');
    suggestions.push('Reduce learning rate by 10x');
    suggestions.push('Check for division by zero in custom loss functions');
    suggestions.push('Use gradient clipping with max_norm=0.5 for RNNs');
    severity = 'high';
  }

  if (/gradient.*vanish|gradient.*norm.*[0-9e]-[5-9]/.test(combined)) {
    issues.push('Vanishing gradients (gradient norm < 1e-5)');
    suggestions.push('Use residual connections (ResNet-style skip connections)');
    suggestions.push('Switch activation: ReLU → GELU or SiLU');
    suggestions.push('Apply proper weight initialization (Xavier/Kaiming)');
    suggestions.push('Use gradient highway (LSTM/GRU instead of vanilla RNN)');
    if (severity !== 'high') severity = 'high';
  }

  if (/overfit|train.*loss.*val.*loss|train_loss.*0\.[0-1].*val_loss.*0\.[3-9]/.test(combined)) {
    issues.push('Overfitting: training loss << validation loss');
    suggestions.push('Increase dropout rate (current → +0.1 to +0.2)');
    suggestions.push('Add weight decay (L2 regularization): optimizer with weight_decay=1e-4');
    suggestions.push('Use early stopping with patience=5');
    suggestions.push('Apply data augmentation');
    suggestions.push('Reduce model capacity if dataset is small');
    if (severity === 'low') severity = 'medium';
  }

  if (/underfit|loss.*not.*decreas|loss.*plateau|loss.*stuck/.test(combined)) {
    issues.push('Underfitting: model cannot learn from training data');
    suggestions.push('Increase model capacity (more layers/hidden dims)');
    suggestions.push('Increase learning rate or use warmup schedule');
    suggestions.push('Train for more epochs');
    suggestions.push('Verify data preprocessing (normalization, no data leakage)');
    if (severity === 'low') severity = 'medium';
  }

  if (/out of memory|oom|cuda.*memory|memory.*cuda/.test(combined)) {
    issues.push('GPU out-of-memory (OOM)');
    suggestions.push('Reduce batch_size by half');
    suggestions.push('Enable gradient checkpointing: model.gradient_checkpointing_enable()');
    suggestions.push('Use mixed precision: torch.cuda.amp.autocast()');
    suggestions.push('Use torch.utils.checkpoint.checkpoint() for large layers');
    suggestions.push('Consider ZeRO optimizer (DeepSpeed) for large models');
    severity = 'high';
  }

  if (/learning rate.*too (high|large)|lr.*too (high|large)|loss.*oscillat/.test(combined)) {
    issues.push('Learning rate too high: loss oscillates');
    suggestions.push('Reduce lr by 5-10x');
    suggestions.push('Use lr warmup (linear warmup for first 10% of training steps)');
    suggestions.push('Switch to AdamW with weight_decay=0.01');
    if (severity === 'low') severity = 'medium';
  }

  if (/slow.*train|training.*slow|epoch.*slow/.test(combined)) {
    issues.push('Training speed is slow');
    suggestions.push('Enable torch.compile(model) (PyTorch >= 2.0)');
    suggestions.push('Use mixed precision: torch.cuda.amp.autocast()');
    suggestions.push('Increase DataLoader num_workers (typically CPU count / 2)');
    suggestions.push('Pin memory: DataLoader(pin_memory=True)');
    if (severity === 'low') severity = 'low';
  }

  if (issues.length === 0) {
    // General guidance when no specific issue detected
    issues.push('No specific issue pattern detected from provided input');
    suggestions.push('Monitor gradient norms each epoch: torch.nn.utils.clip_grad_norm_ returns the norm');
    suggestions.push('Plot train vs. val loss curves to visually diagnose underfitting/overfitting');
    suggestions.push('Check learning rate schedule with torch.optim.lr_scheduler');
    suggestions.push('Verify batch normalization is in train() mode during training and eval() during validation');
    severity = 'low';
  }

  // If LLM is available, add a deep-analysis note
  let deepAnalysis = null;
  if (context && context.llmClient && typeof context.llmClient.chat === 'function') {
    try {
      const prompt = `You are an ML training diagnostics expert. Analyze the following training error/log and provide detailed diagnosis:\n\nError: ${error}\n\nTraining log excerpt:\n${trainingLog}\n\nProvide: 1) Root cause, 2) Step-by-step fix, 3) Prevention tips.`;
      const response = await context.llmClient.chat([
        { role: 'system', content: 'You are an expert ML engineer specializing in training stability and debugging.' },
        { role: 'user', content: prompt },
      ]);
      deepAnalysis = response.content || response.message || String(response);
    } catch (e) {
      deepAnalysis = null;
    }
  }

  return {
    issues,
    suggestions,
    severity,
    deepAnalysis,
    output: `ML Diagnosis Report\nSeverity: ${severity.toUpperCase()}\n\nIssues detected (${issues.length}):\n${issues.map((i, n) => `  ${n+1}. ${i}`).join('\n')}\n\nSuggestions:\n${suggestions.map((s, n) => `  ${n+1}. ${s}`).join('\n')}${deepAnalysis ? `\n\nDeep Analysis (LLM):\n${deepAnalysis}` : ''}`,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const commands = [
  {
    name: 'pipeline',
    description: 'Generate a complete ML training pipeline script',
    args: [
      { name: 'task', type: 'string', required: true, description: 'ML task: classification, regression, nlp, cv, time-series, recommendation' },
      { name: 'framework', type: 'string', default: 'pytorch', description: 'Framework: pytorch, sklearn, scikit-learn' },
      { name: 'dataset', type: 'string', description: 'Dataset name or path (added as comment)' },
      { name: 'outputDir', type: 'string', default: './ml-pipeline', description: 'Output directory for pipeline.py' },
    ],
    execute: pipelineCommand,
  },
  {
    name: 'implement',
    description: 'Generate model architecture implementation code',
    args: [
      { name: 'model', type: 'string', required: true, description: 'Model: transformer, resnet, lstm, bert, gpt, vae, gan' },
      { name: 'framework', type: 'string', default: 'pytorch', description: 'Framework: pytorch' },
    ],
    execute: implementCommand,
  },
  {
    name: 'tune',
    description: 'Generate hyperparameter tuning script',
    args: [
      { name: 'model', type: 'string', required: true, description: 'Model name (for code comments)' },
      { name: 'searchSpace', type: 'object', default: {}, description: 'Search space as JSON object' },
      { name: 'trials', type: 'number', default: 20, description: 'Number of trials (for random/bayesian)' },
      { name: 'method', type: 'string', default: 'grid', description: 'Method: grid, random, bayesian' },
    ],
    execute: tuneCommand,
  },
  {
    name: 'track',
    description: 'Generate experiment tracking code (MLflow + W&B)',
    args: [
      { name: 'experimentName', type: 'string', required: true, description: 'Experiment name' },
      { name: 'metrics', type: 'array', default: [], description: 'List of metric names to log' },
      { name: 'tags', type: 'object', default: {}, description: 'Tags as JSON object' },
    ],
    execute: trackCommand,
  },
  {
    name: 'diagnose',
    description: 'Diagnose ML training issues from error messages or log',
    args: [
      { name: 'error', type: 'string', description: 'Error message text' },
      { name: 'trainingLog', type: 'string', description: 'Training log excerpt' },
    ],
    execute: diagnoseCommand,
  },
];

export default { commands };

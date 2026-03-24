# Tzukwan CLI (子宽学术智能体)

> A powerful, AI-driven Command Line Interface (CLI) and Multi-Agent system dedicated to transparent, verifiably true, and comprehensive academic research.
>
> 致力于真实、可验证且全面的学术研究的强大 AI 命令行与多智能体系统。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green)](https://nodejs.org/)

---

## 📖 Introduction (简介)

**Tzukwan CLI** is an advanced academic research assistant that utilizes a "Swarm" of specialized AI agents to assist PhD students, researchers, and academics. It strictly adheres to the principle of **Absolute Academic Integrity**, guaranteeing zero hallucination of data, references, or code. It seamlessly integrates literature reviews, topic discovery, experimental design, paper drafting, and peer-review simulation into an automated pipeline.

本项目是一个高级学术研究助手体系，利用"智能体蜂群" (Agent Swarm) 模式协助博士生与科研人员。系统严格遵循**绝对学术诚信**原则，保证零数据伪造、零虚假引用、零无效代码。它将文献综述、选题发现、实验设计、论文排版和模拟同行评审无缝集成到自动化工作流中。

### 🌟 Key Features (核心特性)

- 🤖 **Multi-Agent Swarm (多智能体蜂群)**:
  - **Dr. Mentor**: Lead strategist & coordinator (战略主管).
  - **Dr. Lit**: Literature review & mapping (文献综述).
  - **Dr. Topic**: Innovation & research gap discovery (创新发现).
  - **Dr. Lab**: Methodology & experimental design (方法与实验).
  - **Dr. Write**: Academic writing & typography (论文撰写).
  - **Dr. Peer**: Peer review & auditing (同行评审).
- 📚 **Real Verification (真实验证)**: Connected to OpenAlex, Semantic Scholar, Crossref, and arXiv for verified citations.
- 🛠️ **MCP Skill System (MCP技能插件系统)**: Easily extend the CLI's capabilities through standardized Model Context Protocol (MCP) servers.
- 🖥️ **Interactive REPL (交互式控制台)**: A powerful local interactive terminal for seamless multi-turn conversations.
- 📄 **End-to-End Formatting (端到端排版)**: Automatically compile outputs to PDF, DOCX, and LaTeX with beautifully generated figures (SVG/TIF) and formulas.

---

## 🚀 Quick Start (快速开始)

### 1. Installation (安装)

Ensure you have Node.js >= 18 installed.
确保已安装 Node.js >= 18。

```bash
git clone https://github.com/your-username/tzukwan-cli.git
cd tzukwan-cli
npm install
npm run build
npm install -g .
```

### 2. Configuration (配置)

Run the initialization wizard to configure your preferred LLM provider (supports OpenAI, DeepSeek, Moonshot, Groq, Ollama, etc.).

运行初始化向导，配置您偏好的大语言模型（支持 OpenAI, DeepSeek, Kimi, Groq, Ollama 等）。

```bash
tzukwan config init
```

*Note: All proprietary API endpoints and keys are configured locally. The open-source repository comes with secure placeholders (`<YOUR_*_BASE_URL>`).*

### 3. Usage (使用示例)

Enter the interactive REPL shell:
进入交互式控制台：
```bash
tzukwan
```

Or run single-shot commands directly:
或直接运行单次命令：
```bash
# General inquiry (通用学术提问)
tzukwan -p "Explain the application of Machine Learning in Econometrics"

# Paper search and analysis (论文检索与分析)
tzukwan search "diffusion models for time series"
tzukwan paper analyze 2301.00001

# Comprehensive paper generation (端到端论文生成工作流)
tzukwan paper generate --topic "Digital finance and economic growth" --field economics

# Literature review (系统性文献综述)
tzukwan paper review "large language model safety" --max 30
```

---

## 🧠 Methodology & Rules (方法论与强制规范)

The system strictly enforces the principles defined in `TZUKWAN.md`:
系统严格执行由 `TZUKWAN.md` 定义的以下原则：

1. **No Deception (绝对禁止欺骗)**: No fabricated datasets, results, or references.
2. **Robust Referencing (严格的引用格式)**: Enforces GB/T 7714 or APA styles using verified DOI entries.
3. **Comprehensive Outputs (完备的交付物)**: A complete generated project includes `paper.md`, `paper.pdf`, `paper.tex`, runnable Python/R source codes (`src/`), and high-res datasets/figures (`data/`, `figures/`).
4. **Peer Review Loop (自我审查循环)**: Up to 3 iterations of self-correction before presenting the final result.

---

## 🧩 Architecture (项目架构)

The project leverages a modern Monorepo architecture managed by NPM Workspaces.

- `packages/core`: Core multi-agent logic, LLM clients, MCP managers.
- `packages/cli`: Terminal interface, commands, and REPL.
- `packages/research`: Academic API clients (Crossref, Semantic Scholar, etc.) and citation verification engines.
- `packages/skills`: Skill loading and MCP registry.

---

## 🤝 Contributing (参与贡献)

We welcome contributions! Please follow the standard GitHub Flow.
欢迎贡献核心代码或新的学术技能（MCP Servers）！

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License (开源协议)

This project is licensed under the [Apache License 2.0](LICENSE).

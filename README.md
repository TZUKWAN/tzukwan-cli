# 🎓 Tzukwan CLI (子宽学术智能体)

> A powerful, AI-driven Command Line & Web Interface and Multi-Agent system dedicated to transparent, verifiably true, and comprehensive academic research.
>
> 致力于真实、可验证且全面的学术研究的顶层多智能体（Multi-Agent）科研生产力引擎。双界驱动（Web + TUI），一键零幻觉生成高质量学术成果。

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![NPM Version](https://img.shields.io/npm/v/@tzukwan/cli.svg)](https://www.npmjs.com/package/@tzukwan/cli)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green)](https://nodejs.org/)

![Tzukwan Web UI](./docs/assets/web_ui.png)
*(Tzukwan Web UI - Visualizing the Multi-Agent Swarm in Real-Time)*

---

## ⚡ Quick Start (快速开始)

We recommend installing Tzukwan globally via the official NPM registry to access the CLI tools anywhere on your system.
我们强烈建议通过 NPM 全局安装以获得最佳体验，只需一行命令即可武装您的终端：

### 1. Installation (极速安装)

```bash
# 全局安装 Tzukwan
npm install -g @tzukwan/cli
```

### 2. Configuration (配置您的专属大模型)

Run the initialization wizard to configure your preferred LLM provider (supports OpenAI, DeepSeek, Moonshot, Groq, Ollama, etc.).
支持市面上几乎所有主流模型生态，通过可视化向导一键接入：

```bash
tzukwan config init
```

### 3. Start the Engine (启动引擎)

Tzukwan offers both a stunning Web UI and a hacker-friendly Terminal (TUI) interface.
本系统提供**双模式交互**，随心所欲：

```bash
# 🔥 启动可视化 Web 界面后台引擎 (强烈推荐) / Start the Web UI Server
tzukwan web start
# 然后打开浏览器访问 / Then open your browser at: http://127.0.0.1:3847

# 💻 启动沉浸式终端交互模式 / Start interactive TUI shell
tzukwan

# 📚 一键端到端生成论文 / End-to-end Paper Generation Workflow
tzukwan paper generate --topic "Digital finance and economic growth" --field economics

# 🔎 针对性文献检索 / Deep Literature Search
tzukwan search "diffusion models for time series"

# 📊 论文深度解构分析 / Deep Paper Analysis
tzukwan paper analyze 2301.00001
```

---

## 🚀 Why Tzukwan? (技术创意与应用优势)

Tzukwan isn't just another ChatGPT wrapper. It is a **Swarms-based autonomous academic ecosystem** built to eradicate AI hallucinations and automate the grueling process of scientific research.
Tzukwan 绝不是一个简单的“套壳”对话框，而是一尊为科研人员量身打造的**自动化多智能体巨兽**。

### 🌟 1. 独创的 Multi-Agent Swarm（多智能体科研集群）
We break down the academic process into highly specialized LLM personas interacting, debating, and refining outputs together:
- **Dr. Mentor (战略主管)**: Oversees the research direction.
- **Dr. Lit (文献宗师)**: Connects to APIs to map the knowledge graph.
- **Dr. Topic (灵感引擎)**: Discovers true research gaps.
- **Dr. Lab (实验专家)**: Generates reproducible python/R data environments.
- **Dr. Write (排版大师)**: Assembles the ultimate LaTeX / Markdown paper.
- **Dr. Peer (冷酷审稿人)**: Audits every sentence for academic integrity before you even see it.

### 🛡️ 2. Absolute Integrity (绝对零幻觉科研体系)
Tzukwan forces models to cite **real, authenticated DOIs**. Through active verified API connections with databases like **Crossref, Semantic Scholar, OpenAlex, and PubMed**, fake citations are mathematically impossible.
拒绝假数据、拒绝伪造文献！所有的生成内容都必须有明确可查的底层支撑。如果大模型企图“编造”一篇论文，**Dr. Peer** 和底层校验机制会立刻将其驳回重写。

### 🧩 3. MCP (Model Context Protocol) 插件生态
Designed with the future in mind, Tzukwan integrates flawlessly with Anthropic's **MCP Protocol**. Need your agents to read local MATLAB files, query private Stata datasets, or scrape a specialized database? Simply plug in an MCP skill server:
```bash
tzukwan mcp add my-stata-server http://localhost:8080
```
Your agents instantly gain real-time access to infinite external environments!

### ⚙️ 4. End-to-End Automation (端到端交付成品)
From a single prompt, Tzukwan delivers a full project directory:
- Beautifully formatted `paper.pdf` & `paper.tex`
- Runnable R/Python code in `src/` folder
- High-res generated SVG/TIF `figures/`
- Standardized datasets `data/`

---

## 🤝 Contributing (参与贡献)

We welcome contributions! Please follow the standard GitHub Flow.
我们渴望社区力量的加入，无论是引入新的大模型供应商、创建新的 MCP 智能插件，还是修复 Bug，都万分欢迎！

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/CosmicFeature`)
3. Commit your changes (`git commit -m 'Add some CosmicFeature'`)
4. Push to the branch (`git push origin feature/CosmicFeature`)
5. Open a Pull Request

## 📜 License (开源协议)

This project is licensed under the [Apache License 2.0](LICENSE).

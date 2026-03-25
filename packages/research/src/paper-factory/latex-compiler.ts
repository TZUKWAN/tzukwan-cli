import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname, basename, extname, resolve } from 'path';
import { compile as tectonicCompile } from 'node-latex-compiler';

/**
 * LaTeX编译选项
 */
export interface LaTeXCompileOptions {
  /** 输入.tex文件路径 */
  inputFile: string;
  /** 输出目录 */
  outputDir?: string;
  /** 编译引擎：xelatex（中文推荐）| pdflatex | lualatex | tectonic（推荐，零依赖） */
  engine?: 'xelatex' | 'pdflatex' | 'lualatex' | 'tectonic';
  /** 编译次数（用于交叉引用） */
  compileTimes?: number;
  /** 是否使用bibtex/biber处理参考文献 */
  useBibtex?: boolean;
  /** bibtex引擎：bibtex | biber */
  bibEngine?: 'bibtex' | 'biber';
  /** 额外的环境变量 */
  env?: Record<string, string>;
}

/**
 * 编译结果
 */
export interface LaTeXCompileResult {
  /** 是否成功 */
  success: boolean;
  /** 输出PDF路径 */
  pdfPath?: string;
  /** 编译日志 */
  log: string;
  /** 错误信息 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
  /** 编译时间（毫秒） */
  compileTime: number;
}

/**
 * LaTeX编译器
 *
 * 功能：
 * 1. 优先使用node-latex-compiler（基于Tectonic，零依赖）
 * 2. 降级支持系统安装的TeX Live编译.tex文件
 * 3. 支持中文（xelatex/tectonic引擎）
 * 4. 自动处理交叉引用（多次编译）
 * 5. 处理参考文献（bibtex/biber）
 * 6. 错误捕获和报告
 */
export class LaTeXCompiler {
  private enginePaths: Map<string, string> = new Map();
  private useTectonic: boolean = true; // 默认使用Tectonic

  /**
   * 查找系统LaTeX引擎路径
   */
  async detectEngine(engine: string = 'xelatex'): Promise<string | null> {
    // Windows常见安装路径（包括win32和windows子目录）
    const winPaths = [
      `C:\\texlive\\2026\\bin\\windows\\${engine}.exe`,
      `C:\\texlive\\2026\\bin\\win32\\${engine}.exe`,
      `C:\\texlive\\2025\\bin\\windows\\${engine}.exe`,
      `C:\\texlive\\2025\\bin\\win32\\${engine}.exe`,
      `C:\\texlive\\2024\\bin\\windows\\${engine}.exe`,
      `C:\\texlive\\2024\\bin\\win32\\${engine}.exe`,
      `C:\\texlive\\2023\\bin\\windows\\${engine}.exe`,
      `C:\\texlive\\2023\\bin\\win32\\${engine}.exe`,
      `C:\\texlive\\2022\\bin\\windows\\${engine}.exe`,
      `C:\\texlive\\2022\\bin\\win32\\${engine}.exe`,
      `C:\\Program Files\\texlive\\2026\\bin\\windows\\${engine}.exe`,
      `C:\\Program Files\\texlive\\2026\\bin\\win32\\${engine}.exe`,
      `C:\\Program Files\\texlive\\2024\\bin\\win32\\${engine}.exe`,
      `C:\\Program Files\\texlive\\2023\\bin\\win32\\${engine}.exe`,
      `D:\\texlive\\2026\\bin\\windows\\${engine}.exe`,
      `D:\\texlive\\2026\\bin\\win32\\${engine}.exe`,
      `D:\\texlive\\2024\\bin\\win32\\${engine}.exe`,
      `D:\\texlive\\2023\\bin\\win32\\${engine}.exe`,
    ];

    // 先检查缓存
    if (this.enginePaths.has(engine)) {
      return this.enginePaths.get(engine)!;
    }

    // Windows路径检测
    for (const path of winPaths) {
      if (existsSync(path)) {
        this.enginePaths.set(engine, path);
        return path;
      }
    }

    // 尝试从PATH环境变量查找
    try {
      const result = await this.execCommand('where', [engine]);
      if (result.exitCode === 0 && result.stdout) {
        const path = result.stdout.trim().split('\n')[0];
        if (path) {
          this.enginePaths.set(engine, path);
          return path;
        }
      }
    } catch {
      // 命令未找到
    }

    return null;
  }

  /**
   * 执行系统命令
   */
  private execCommand(command: string, args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        shell: false
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode || 0, stdout, stderr });
      });

      child.on('error', () => {
        resolve({ exitCode: -1, stdout, stderr });
      });
    });
  }

  /**
   * 编译LaTeX文件
   * 优先使用node-latex-compiler（Tectonic），零依赖
   * 如果失败则降级到系统LaTeX
   */
  async compile(options: LaTeXCompileOptions): Promise<LaTeXCompileResult> {
    const startTime = Date.now();
    const engine = options.engine || 'tectonic'; // 默认使用tectonic

    // 如果明确指定了传统LaTeX引擎，或者Tectonic失败，则使用传统方法
    if (engine === 'xelatex' || engine === 'pdflatex' || engine === 'lualatex' || !this.useTectonic) {
      return this.compileWithTraditionalLaTeX(options);
    }

    // 使用node-latex-compiler（Tectonic）编译
    return this.compileWithTectonic(options);
  }

  /**
   * 使用node-latex-compiler（基于Tectonic）编译LaTeX
   * 零依赖，自动下载二进制文件
   */
  private async compileWithTectonic(options: LaTeXCompileOptions): Promise<LaTeXCompileResult> {
    const startTime = Date.now();
    const result: LaTeXCompileResult = {
      success: false,
      log: '',
      errors: [],
      warnings: [],
      compileTime: 0
    };

    // 检查输入文件
    const inputFile = resolve(options.inputFile);
    if (!existsSync(inputFile)) {
      result.errors.push(`输入文件不存在: ${inputFile}`);
      return result;
    }

    // 设置输出目录
    const inputDir = dirname(inputFile);
    const inputName = basename(inputFile, extname(inputFile));
    const outputDir = resolve(options.outputDir || inputDir);

    // 确保输出目录存在
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    try {
      console.log(`[LaTeXCompiler] 使用node-latex-compiler (Tectonic) 编译: ${inputFile}`);

      // 读取.tex文件内容
      const texContent = readFileSync(inputFile, 'utf-8');

      // 使用node-latex-compiler编译
      const tectonicResult = await tectonicCompile({
        tex: texContent,
        outputDir: outputDir,
        outputFile: join(outputDir, `${inputName}.pdf`),
        onStdout: (data) => {
          result.log += data + '\n';
          console.log('[Tectonic]', data.trim());
        },
        onStderr: (data) => {
          const stderr = data + '\n';
          result.log += stderr;
          if (data.toLowerCase().includes('warning')) {
            result.warnings.push(data.trim());
          } else {
            result.errors.push(data.trim());
          }
          console.warn('[Tectonic]', data.trim());
        }
      });

      if (tectonicResult.status === 'success' && tectonicResult.pdfPath) {
        result.success = true;
        result.pdfPath = tectonicResult.pdfPath;
        console.log(`[LaTeXCompiler] ✅ PDF生成成功: ${tectonicResult.pdfPath}`);
      } else {
        result.errors.push(`Tectonic编译失败: ${tectonicResult.stderr || tectonicResult.error || '未知错误'}`);
        console.error(`[LaTeXCompiler] ❌ Tectonic编译失败`);
      }

      if (tectonicResult.stdout) {
        result.log += tectonicResult.stdout;
      }
      if (tectonicResult.stderr) {
        result.log += tectonicResult.stderr;
      }

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Tectonic编译异常: ${errMsg}`);
      console.error(`[LaTeXCompiler] Tectonic异常: ${errMsg}`);

      // 如果Tectonic失败，尝试降级到传统LaTeX
      console.warn('[LaTeXCompiler] Tectonic失败，尝试降级到传统LaTeX...');
      return this.compileWithTraditionalLaTeX(options);
    }

    result.compileTime = Date.now() - startTime;
    return result;
  }

  /**
   * 使用传统LaTeX引擎编译（作为降级方案）
   */
  private async compileWithTraditionalLaTeX(options: LaTeXCompileOptions): Promise<LaTeXCompileResult> {
    const startTime = Date.now();
    const engine = options.engine || 'xelatex';
    const compileTimes = options.compileTimes || 2;
    const useBibtex = options.useBibtex ?? false;
    const bibEngine = options.bibEngine || 'bibtex';

    const result: LaTeXCompileResult = {
      success: false,
      log: '',
      errors: [],
      warnings: [],
      compileTime: 0
    };

    // 检查输入文件
    const inputFile = resolve(options.inputFile);
    if (!existsSync(inputFile)) {
      result.errors.push(`输入文件不存在: ${inputFile}`);
      return result;
    }

    // 查找引擎
    const enginePath = await this.detectEngine(engine);
    if (!enginePath) {
      result.errors.push(`未找到LaTeX引擎: ${engine}`);
      result.errors.push('建议：使用默认的Tectonic引擎（零依赖），或安装TeX Live');
      result.errors.push('安装地址: https://tug.org/texlive/');
      return result;
    }

    // 设置输出目录
    const inputDir = dirname(inputFile);
    const inputName = basename(inputFile, extname(inputFile));
    const outputDir = resolve(options.outputDir || inputDir);

    // 确保输出目录存在
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // 编译参数
    const args = [
      '-interaction=nonstopmode',
      '-file-line-error',
      '-synctex=1',
      `-output-directory=${outputDir}`,
      basename(inputFile)
    ];

    try {
      console.log(`[LaTeXCompiler] 使用传统LaTeX引擎编译: ${engine}`);

      // 第一次编译
      result.log += `=== 第1次编译（${engine}）===\n`;
      let cmdResult = await this.execCommand(enginePath, args, { cwd: inputDir, env: options.env });
      result.log += cmdResult.stdout + cmdResult.stderr;
      if (cmdResult.exitCode !== 0) {
        result.errors.push(`LaTeX engine exited with code ${cmdResult.exitCode}`);
      }

      // 处理参考文献
      if (useBibtex) {
        result.log += `\n=== 处理参考文献（${bibEngine}）===\n`;
        const bibPath = await this.detectEngine(bibEngine);
        if (bibPath) {
          cmdResult = await this.execCommand(bibPath, [inputName], { cwd: outputDir });
          result.log += cmdResult.stdout + cmdResult.stderr;
          if (cmdResult.exitCode !== 0) {
            result.warnings.push(`${bibEngine} exited with code ${cmdResult.exitCode}`);
          }
        } else {
          result.warnings.push(`未找到参考文献引擎: ${bibEngine}`);
        }
      }

      // 后续编译（用于生成交叉引用）
      for (let i = 2; i <= compileTimes; i++) {
        result.log += `\n=== 第${i}次编译（${engine}）===\n`;
        cmdResult = await this.execCommand(enginePath, args, { cwd: inputDir, env: options.env });
        result.log += cmdResult.stdout + cmdResult.stderr;
        if (cmdResult.exitCode !== 0) {
          result.errors.push(`LaTeX engine exited with code ${cmdResult.exitCode} on pass ${i}`);
        }
      }

      // 检查PDF是否生成
      const pdfPath = join(outputDir, `${inputName}.pdf`);
      if (existsSync(pdfPath)) {
        result.success = true;
        result.pdfPath = pdfPath;
        console.log(`[LaTeXCompiler] ✅ PDF生成成功: ${pdfPath}`);
      } else {
        result.errors.push('PDF文件未生成，请检查编译日志');
      }

      if (!result.success && result.errors.length === 0 && result.log.trim().length === 0) {
        result.errors.push('LaTeX compiler produced no output. Check whether the TeX engine is installed and callable.');
      }

      // 解析错误和警告
      this.parseLog(result.log, result);

    } catch (error) {
      result.errors.push(`编译异常: ${error}`);
    }

    result.compileTime = Date.now() - startTime;
    return result;
  }

  /**
   * 解析编译日志
   */
  private parseLog(log: string, result: LaTeXCompileResult): void {
    const lines = log.split('\n');

    for (const line of lines) {
      // LaTeX错误格式: ! Error message
      if (line.startsWith('!')) {
        result.errors.push(line.trim());
      }
      // 文件行错误格式: file.tex:123: error
      else if (/\.tex:\d+:/.test(line)) {
        if (line.includes('error') || line.includes('Error')) {
          result.errors.push(line.trim());
        }
      }
      // 警告格式: Warning: message 或 LaTeX Warning: message
      else if (/warning/i.test(line)) {
        result.warnings.push(line.trim());
      }
    }
  }

  /**
   * 将Markdown转换为LaTeX并编译
   */
  async compileMarkdown(
    markdownFile: string,
    outputDir: string,
    options: Omit<LaTeXCompileOptions, 'inputFile' | 'outputDir'> = {}
  ): Promise<LaTeXCompileResult> {
    // 这里可以集成pandoc或其他转换工具
    // 暂时返回错误，需要后续实现转换逻辑
    return {
      success: false,
      log: '',
      errors: ['Markdown转LaTeX功能需要pandoc支持，请先安装pandoc'],
      warnings: [],
      compileTime: 0
    };
  }

  /**
   * 批量编译多个.tex文件
   */
  async compileBatch(
    files: string[],
    options: Omit<LaTeXCompileOptions, 'inputFile'>
  ): Promise<LaTeXCompileResult[]> {
    const results: LaTeXCompileResult[] = [];

    for (const file of files) {
      const result = await this.compile({ ...options, inputFile: file });
      results.push(result);
    }

    return results;
  }

  /**
   * 生成LaTeX模板（中文论文）
   */
  generateChineseTemplate(title: string, author: string = '作者'): string {
    return `\\\\documentclass[12pt,a4paper]{ctexart}

% 页面设置
\\\\usepackage[margin=2.5cm]{geometry}
% 数学公式
\\\\usepackage{amsmath,amssymb,amsfonts}
% 图表
\\\\usepackage{graphicx,booktabs,float}
% 算法
\\\\usepackage{algorithm,algorithmic}
% 超链接
\\\\usepackage{hyperref}
% 代码高亮
\\\\usepackage{listings,xcolor}
% 参考文献
\\\\usepackage[numbers,sort&compress]{natbib}

% 中文字体设置
\\\\setCJKmainfont{SimSun}[AutoFakeBold=true,AutoFakeSlant=true]
\\\\setCJKsansfont{SimHei}[AutoFakeBold=true]
\\\\setCJKmonofont{FangSong}

% 英文字体设置
\\\\setmainfont{Times New Roman}
\\\\setsansfont{Arial}
\\\\setmonofont{Courier New}

% 标题格式
\\\\ctexset{
  section = {
    format = \\\\zihao{-3}\\\\heiti\\\\bfseries\\\\centering,
    beforeskip = 1em,
    afterskip = 0.5em
  },
  subsection = {
    format = \\\\zihao{4}\\\\heiti\\\\bfseries,
    beforeskip = 0.5em,
    afterskip = 0.3em
  }
}

\\\\begin{document}

% 标题页
\\\\begin{titlepage}
  \\\\centering
  \\\\vspace*{2cm}
  {\\\\zihao{2}\\\\heiti\\\\bfseries ${title}\\\\par}
  \\\\vspace{2cm}
  {\\\\zihao{3} ${author}\\\\par}
  \\\\vspace{1cm}
  {\\\\zihao{4} \\\\today\\\\par}
  \\\\vfill
\\\\end{titlepage}

% 摘要
\\\\begin{abstract}
\\\\noindent
这里是论文摘要...

\\\\textbf{关键词：}关键词1；关键词2；关键词3
\\\\end{abstract}

% 目录
\\\\tableofcontents
\\\\newpage

% 正文
\\\\section{引言}
引言内容...

\\\\section{相关工作}
相关工作内容...

\\\\section{方法}
方法内容...

\\\\section{实验}
实验内容...

\\\\section{结论}
结论内容...

% 参考文献
\\\\bibliographystyle{gbt7714-numerical}
\\\\bibliography{references}

\\\\end{document}
`;
  }

  /**
   * 生成参考文献文件
   */
  generateBibFile(references: Array<{ id: string; title: string; authors: string[]; year: number; venue?: string }>): string {
    const entries: string[] = [];

    for (const ref of references) {
      const authorStr = ref.authors.join(' and ');
      const entry = `@article{${ref.id},
  title = {${ref.title}},
  author = {${authorStr}},
  year = {${ref.year}}${ref.venue ? `,\n  journal = {${ref.venue}}` : ''}
}`;
      entries.push(entry);
    }

    return entries.join('\n\n');
  }
}

export default LaTeXCompiler;

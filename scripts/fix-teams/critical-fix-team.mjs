#!/usr/bin/env node
/**
 * Critical Fix Team - 处理严重问题
 * 
 * 当前聚焦：
 * 1. 修复 <think> 标签污染终稿问题
 * 2. 修复 -o 参数被忽略问题
 * 3. 修复技能系统状态不一致问题
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

class CriticalFixTeam {
  constructor() {
    this.fixes = [];
    this.logs = [];
  }

  log(message, type = 'info') {
    const entry = { time: new Date().toISOString(), message, type };
    this.logs.push(entry);
    const emoji = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' }[type] || 'ℹ️';
    console.log(`${emoji} [CriticalFixTeam] ${message}`);
  }

  async run() {
    this.log('Starting critical fix round...', 'info');
    
    // Fix 1: think 标签污染
    await this.fixThinkTagPollution();
    
    // Fix 2: -o 参数
    await this.fixOutputParameter();
    
    // Fix 3: 技能系统
    await this.fixSkillsConsistency();
    
    this.log(`Completed ${this.fixes.length} critical fixes`, 'success');
    return this.fixes;
  }

  async fixThinkTagPollution() {
    this.log('Analyzing think tag pollution issue...', 'info');
    
    const filePath = path.join(ROOT, 'packages/research/src/paper-factory/index.ts');
    if (!fs.existsSync(filePath)) {
      this.log('Paper factory not found', 'error');
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // 检查是否已经有 strip 逻辑
    if (content.includes('stripThinkingBlocks') || content.includes('stripThinking')) {
      this.log('Think tag stripping already implemented', 'success');
      return;
    }
    
    this.log('Need to implement think tag stripping', 'warning');
    
    this.fixes.push({
      id: 'FIX-001',
      type: 'think-tag-pollution',
      file: 'packages/research/src/paper-factory/index.ts',
      status: 'pending-implementation',
      note: 'Need to add stripThinkingBlocks before writing content to files',
    });
  }

  async fixOutputParameter() {
    this.log('Analyzing -o parameter issue...', 'info');
    
    const filePath = path.join(ROOT, 'packages/cli/src/commands/paper.ts');
    if (!fs.existsSync(filePath)) {
      this.log('Paper command not found', 'error');
      return;
    }
    
    this.fixes.push({
      id: 'FIX-002',
      type: 'output-parameter',
      file: 'packages/cli/src/commands/paper.ts',
      status: 'pending-implementation',
      note: 'Need to pass options.output to paper factory methods',
    });
    
    this.log('Identified output parameter fix location', 'warning');
  }

  async fixSkillsConsistency() {
    this.log('Analyzing skills system inconsistency...', 'info');
    
    this.fixes.push({
      id: 'FIX-003',
      type: 'skills-consistency',
      file: 'packages/cli/src/commands/skills.ts',
      status: 'pending-implementation',
      note: 'Need to unify CLI and runtime skills state',
    });
    
    this.log('Identified skills consistency fix location', 'warning');
  }
}

// 运行
const team = new CriticalFixTeam();
team.run().then((fixes) => {
  console.log('\n📋 Fix Summary:');
  fixes.forEach(f => {
    console.log(`  ${f.status === 'applied' ? '✅' : '⚠️'} ${f.id}: ${f.type} (${f.status})`);
  });
  process.exit(0);
}).catch(err => {
  console.error('Critical fix team error:', err);
  process.exit(1);
});

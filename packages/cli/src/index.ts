#!/usr/bin/env node
/**
 * Tzukwan CLI — main entry point.
 *
 * This file is the executable that runs when `tzukwan` is invoked.
 * It bootstraps the Commander program and delegates to the REPL
 * or single-prompt runner.
 */

const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning?.message;
  if (message?.includes('--localstorage-file')) return;
  // Suppress DEP0190: shell+args is required for .cmd wrappers on Windows (MCP servers)
  if (message?.includes('shell option true')) return;
  return originalEmitWarning(warning as never, ...(args as never[]));
}) as typeof process.emitWarning;

// Suppress known third-party library warnings that are not actionable by users
process.on('warning', (w) => {
  if (w.message?.includes('--localstorage-file')) return; // docx browser-compat shim
  if (w.message?.includes('shell option true')) return; // DEP0190: expected for MCP .cmd wrappers
  process.stderr.write(`(node) ${w.name}: ${w.message}\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`\x1b[31m\nUnhandled Promise Rejection: ${message}\x1b[0m\n`);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\x1b[31m\nUncaught Exception: ${message}\x1b[0m\n`);
  process.exit(1);
});

async function main(): Promise<void> {
  const { buildProgram } = await import('./cli.js');
  const program = buildProgram();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\x1b[31m\nFatal error: ${message}\x1b[0m\n`);
    process.exit(1);
  }
}

main();

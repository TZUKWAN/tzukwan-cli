import { ArxivClient, type ArxivPaper } from '../arxiv.js';

export interface MonitorOptions {
  intervalMinutes: number;
  onNewPapers: (papers: ArxivPaper[]) => Promise<void>;
}

export class ArxivMonitor {
  private client = new ArxivClient();
  private seenIds = new Set<string>();
  private seenIdsQueue: string[] = []; // For LRU eviction
  private readonly maxSeenIds = 10000; // Prevent unbounded growth
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private abortController: AbortController | null = null;

  start(categories: string[], options: MonitorOptions): void {
    if (this.running) return;
    const intervalMinutes = Math.max(1, Math.min(options.intervalMinutes, 60)); // Clamp 1-60 minutes
    this.running = true;

    const poll = async () => {
      // Skip if a previous poll is still in-flight (prevents race condition where
      // a slow poll overlaps with the next interval tick and overwrites abortController)
      if (this.abortController !== null) {
        console.warn('[ArxivMonitor] Previous poll still running, skipping this interval tick');
        return;
      }

      // Create new abort controller for this poll (use local ref to avoid race on `this`)
      const controller = new AbortController();
      this.abortController = controller;

      try {
        const papers = await this.client.getRecent(categories, 1, controller.signal);

        // Check if aborted during request
        if (controller.signal.aborted) return;

        // Defensive: ensure papers is array
        if (!Array.isArray(papers)) {
          console.warn('[ArxivMonitor] API returned non-array data');
          return;
        }

        const newPapers: ArxivPaper[] = [];
        for (const p of papers) {
          // Defensive: ensure paper has valid id
          if (!p || typeof p.id !== 'string') continue;

          if (!this.seenIds.has(p.id)) {
            this.seenIds.add(p.id);
            this.seenIdsQueue.push(p.id);
            newPapers.push(p);
          }
        }

        // Evict old IDs to prevent memory leak
        while (this.seenIdsQueue.length > this.maxSeenIds) {
          const oldestId = this.seenIdsQueue.shift();
          if (oldestId) this.seenIds.delete(oldestId);
        }

        if (newPapers.length > 0) {
          await options.onNewPapers(newPapers);
        }
      } catch (err) {
        // Don't log abort errors as warnings
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.warn(`[ArxivMonitor] Polling error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        // Only clear if this is still the current controller (guards against stop()+start() race)
        if (this.abortController === controller) this.abortController = null;
      }
    };

    // Run immediately, then on interval
    poll();
    this.timer = setInterval(poll, intervalMinutes * 60 * 1000);
  }

  stop(): void {
    // Cancel in-flight request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  isRunning(): boolean { return this.running; }
}

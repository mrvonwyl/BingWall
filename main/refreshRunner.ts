import type { RefreshRunner, RefreshRunnerDeps, RefreshRunOutcome } from './refreshRunner.models.js';

type InFlight = {
  controller: AbortController;
  replaceExisting: boolean;
  // Resolves once the run has settled either way, so no file write is under way any more.
  settled: Promise<void>;
};

// Runs one refresh at a time: a new refresh (daily, manual, timer, market switch) aborts the one in flight.
export function createRefreshRunner<T>(deps: RefreshRunnerDeps<T>): RefreshRunner<T> {
  let inFlight: InFlight | null = null;

  return {
    async refresh(requestedReplaceExisting) {
      const previous = inFlight;
      previous?.controller.abort();
      // Files an aborted refresh was replacing may be half replaced, so the new one finishes the job.
      const replaceExisting = requestedReplaceExisting || (previous?.replaceExisting ?? false);

      const controller = new AbortController();
      const running = (async () => {
        await previous?.settled;
        controller.signal.throwIfAborted();
        return deps.run({ replaceExisting, signal: controller.signal });
      })();
      const entry: InFlight = { controller, replaceExisting, settled: running.then(noop, noop) };
      inFlight = entry;

      try {
        const value = await running;
        return { status: 'done', value } satisfies RefreshRunOutcome<T>;
      } catch (error) {
        if (controller.signal.aborted) {
          return { status: 'aborted' };
        }
        throw error;
      } finally {
        if (inFlight === entry) {
          inFlight = null;
        }
      }
    },
  };
}

function noop(): void {}

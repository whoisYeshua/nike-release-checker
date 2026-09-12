// WorkerPoolClient interface — Story 17.2
// Implementation lives in the worker pool package (out of scope for this story).
// Future: replaced by Redis-backed BullMQWorkerPoolClient in v3.2.

export interface WorkerPoolClient {
  dispatchDrop(dropId: string): Promise<void>
}

/**
 * No-op implementation for local dev / tests.
 * Logs `worker.dispatch.received` and returns immediately.
 */
export class NoopWorkerPoolClient implements WorkerPoolClient {
  async dispatchDrop(dropId: string): Promise<void> {
    console.log(`[worker.dispatch.received] dropId=${dropId}`)
  }
}

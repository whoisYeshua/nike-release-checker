// Drop event bus — Story 17.4
// Lightweight in-process pub/sub keyed by drop_id.
// Replace implementation with Redis pub/sub in v3.2+ for multi-instance deployments.
// The interface stays stable across implementations.

import { EventEmitter } from 'node:events'
import type { DropEvent } from './dropEventTaxonomy.ts'

export interface DropEventBus {
  publish(dropId: string, event: DropEvent): void
  subscribe(dropId: string, cb: (event: DropEvent) => void): () => void
}

class InMemoryDropEventBus implements DropEventBus {
  private readonly emitter = new EventEmitter()

  constructor() {
    // Increase max listeners — each drop can have many WS clients
    this.emitter.setMaxListeners(500)
  }

  publish(dropId: string, event: DropEvent): void {
    this.emitter.emit(dropId, event)
  }

  subscribe(dropId: string, cb: (event: DropEvent) => void): () => void {
    this.emitter.on(dropId, cb)
    return () => {
      this.emitter.off(dropId, cb)
    }
  }
}

// Singleton exported for use by repositories and WS route
export const dropEventBus: DropEventBus = new InMemoryDropEventBus()

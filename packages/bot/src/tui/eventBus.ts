import { EventEmitter } from 'node:events'

export type AccountStatus =
	| { kind: 'pending' }
	| { kind: 'waiting'; step: string }
	| { kind: 'retrying'; step: string; attempt: number }
	| { kind: 'cop'; size: string; orderNumber?: string }
	| { kind: 'fail'; reason: 'SOLD_OUT' | 'BLOCKED' | 'THREEDS_TIMEOUT' | 'ERROR' }

export type TuiEvents = {
	stepCompleted: { accountId: string; step: string; durationMs: number }
	accountStatusChanged: { accountId: string; status: AccountStatus }
	checkoutFinished: { totalAccounts: number; cops: number; failures: number }
	warmupProgress: { phase: 'polling' | 'sessions' | 'contexts' | 'ready'; detail?: string }
}

export class TuiEventBus {
	private ee = new EventEmitter()

	emit<K extends keyof TuiEvents>(evt: K, payload: TuiEvents[K]): void {
		this.ee.emit(evt, payload)
	}

	on<K extends keyof TuiEvents>(evt: K, fn: (p: TuiEvents[K]) => void): () => void {
		this.ee.on(evt, fn)
		return () => {
			this.ee.off(evt, fn)
		}
	}
}

export const globalBus = new TuiEventBus()

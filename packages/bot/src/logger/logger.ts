import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { StepResult } from '../checkout/executeStep.ts'
import { maskEmail } from './credentialMasker.ts'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: string
  level: LogLevel
  account?: string
  step?: string
  outcome?: string
  durationMs?: number
  details?: string
  error?: string
  message?: string
}

let logFilePath = 'logs/bot.log'
let minLevel: LogLevel = 'info'

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export function configureLogger(options: { file?: string; level?: LogLevel }): void {
  if (options.file !== undefined) logFilePath = options.file
  if (options.level !== undefined) minLevel = options.level
}

export function logStep(accountEmail: string, result: StepResult): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level: result.outcome === 'success' ? 'info' : 'error',
    account: maskEmail(accountEmail),
    step: result.step,
    outcome: result.outcome,
    durationMs: result.durationMs,
    details: result.details,
    error: result.error,
  }
  writeEntry(entry)
}

export function log(level: LogLevel, message: string, extra?: Partial<LogEntry>): void {
  if (LEVELS[level] < LEVELS[minLevel]) return
  const safeExtra = extra !== undefined && extra.account !== undefined
    ? { ...extra, account: maskEmail(extra.account) }
    : extra
  writeEntry({ ts: new Date().toISOString(), level, message, ...safeExtra })
}

function writeEntry(entry: LogEntry): void {
  const line = JSON.stringify(entry) + '\n'
  try {
    mkdirSync(dirname(logFilePath), { recursive: true })
    appendFileSync(logFilePath, line, 'utf8')
  } catch (err) {
    process.stderr.write(`[logger] Failed to write to ${logFilePath}: ${err}\n`)
  }
}

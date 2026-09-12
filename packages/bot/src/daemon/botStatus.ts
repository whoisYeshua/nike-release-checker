import { statSync } from 'node:fs'
import { isDaemonRunning } from './daemonize.ts'
import { validateAllSessions, type SessionValidationResult } from '../auth/preCheckoutValidation.ts'

export interface BotStatus {
  running: boolean
  pid?: number
  uptimeMs?: number
  startedAt?: Date
  accounts: SessionValidationResult[]
  logFile: string
}

const PID_FILE = './bot.pid'

/**
 * Format milliseconds to human-readable uptime string.
 */
export function formatUptime(ms: number): string {
  if (ms < 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/**
 * Get the current bot status including daemon state and account sessions.
 * Uptime is derived from the PID file mtime, which works correctly even
 * when the status command is run from a separate process.
 */
export async function getBotStatus(logFilePath = 'logs/bot.log'): Promise<BotStatus> {
  const daemonStatus = isDaemonRunning()

  let uptimeMs: number | undefined
  if (daemonStatus.running) {
    try {
      const pidStat = statSync(PID_FILE)
      uptimeMs = Date.now() - pidStat.mtimeMs
    } catch {
      uptimeMs = undefined
    }
  }

  const accounts = await validateAllSessions()

  return {
    running: daemonStatus.running,
    pid: daemonStatus.pid,
    uptimeMs,
    accounts,
    logFile: logFilePath,
  }
}

/**
 * Print the bot status to the console in a human-readable format.
 */
export function printBotStatus(status: BotStatus): void {
  console.log('\n─── Bot Status ───')
  if (status.running) {
    console.log(`  Status:  running (PID: ${status.pid})`)
    if (status.uptimeMs !== undefined) {
      console.log(`  Uptime:  ${formatUptime(status.uptimeMs)}`)
    }
  } else {
    console.log('  Status:  stopped')
  }

  console.log(`\n  Accounts (${status.accounts.length}):`)
  for (const account of status.accounts) {
    const statusIcon = account.valid ? '✓' : '✗'
    const reason = account.valid ? 'valid' : (account.reason ?? 'invalid')
    console.log(`    ${statusIcon} ${account.email} — ${reason}`)
  }

  const validCount = status.accounts.filter((a) => a.valid).length
  console.log(`\n  Valid sessions: ${validCount}/${status.accounts.length}`)
  console.log(`  Log file: ${status.logFile}`)
  console.log()
}

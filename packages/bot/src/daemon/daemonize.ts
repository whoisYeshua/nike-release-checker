import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { spawn } from 'node:child_process'

const PID_FILE = './bot.pid'

export interface DaemonStatus {
  running: boolean
  pid?: number
}

/**
 * Check if a daemon process is currently running.
 * Returns false if no PID file exists or if the PID is stale (process not running).
 */
export function isDaemonRunning(): DaemonStatus {
  if (!existsSync(PID_FILE)) {
    return { running: false }
  }

  let pid: number
  try {
    const raw = readFileSync(PID_FILE, 'utf8').trim()
    pid = parseInt(raw, 10)
    if (isNaN(pid) || pid <= 0) {
      return { running: false }
    }
  } catch {
    return { running: false }
  }

  // Check if the process is actually running
  try {
    process.kill(pid, 0) // Signal 0 checks if process exists
    return { running: true, pid }
  } catch {
    // ESRCH: no such process (stale PID file)
    return { running: false }
  }
}

/**
 * Re-launch the current process as a background daemon and exit the current process.
 * This function never returns — it calls process.exit(0) after spawning the child.
 */
export function daemonize(args: string[]): never {
  const child = spawn(process.execPath, [process.argv[1]!, ...args], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()
  console.log(`Daemon started with PID: ${child.pid}`)
  process.exit(0)
}

/**
 * Write the current process PID to the PID file.
 */
export function writePidFile(pidFile = PID_FILE): void {
  try {
    writeFileSync(pidFile, String(process.pid), 'utf8')
  } catch (err) {
    process.stderr.write(`[daemon] Failed to write PID file: ${err}\n`)
  }
}

/**
 * Remove the PID file if it exists.
 */
export function removePidFile(pidFile = PID_FILE): void {
  try {
    if (existsSync(pidFile)) {
      unlinkSync(pidFile)
    }
  } catch (err) {
    process.stderr.write(`[daemon] Failed to remove PID file: ${err}\n`)
  }
}

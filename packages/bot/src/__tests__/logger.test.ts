import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TMP_DIR = join(tmpdir(), `bot-logger-test-${process.pid}`)
const LOG_FILE = join(TMP_DIR, 'test.log')

// Reset the module-level state between tests by re-importing (ESM workaround: use a unique path each test)
// Instead, just use configureLogger to reset

describe('logger', () => {
  beforeEach(async () => {
    mkdirSync(TMP_DIR, { recursive: true })
    // Reset logger state before each test
    const { configureLogger } = await import('../logger/logger.ts')
    configureLogger({ file: LOG_FILE, level: 'debug' })
    // Clear log file
    try { rmSync(LOG_FILE) } catch { /* ignore */ }
  })

  afterEach(() => {
    try { rmSync(TMP_DIR, { recursive: true }) } catch { /* ignore */ }
  })

  test('writes a NDJSON line to the log file', async () => {
    const { log } = await import('../logger/logger.ts')
    log('info', 'test message')
    assert.ok(existsSync(LOG_FILE), 'log file should exist')
    const content = readFileSync(LOG_FILE, 'utf8')
    assert.ok(content.trim().length > 0, 'log file should not be empty')
    // Each line should be terminated with \n
    assert.ok(content.endsWith('\n'), 'log entry should end with newline')
  })

  test('masks email in logStep', async () => {
    const { logStep } = await import('../logger/logger.ts')
    logStep('user@example.com', {
      step: 'select-size',
      outcome: 'success',
      durationMs: 100,
    })
    const content = readFileSync(LOG_FILE, 'utf8')
    assert.ok(!content.includes('user@example.com'), 'raw email must not appear in log')
    assert.ok(content.includes('u***@example.com'), 'masked email should appear in log')
  })

  test('filters out entries below minLevel', async () => {
    const { configureLogger, log } = await import('../logger/logger.ts')
    configureLogger({ file: LOG_FILE, level: 'warn' })
    log('debug', 'this should be filtered')
    log('info', 'this should also be filtered')
    log('warn', 'this should appear')
    const content = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8') : ''
    assert.ok(!content.includes('this should be filtered'), 'debug should be filtered')
    assert.ok(!content.includes('this should also be filtered'), 'info should be filtered when minLevel=warn')
    assert.ok(content.includes('this should appear'), 'warn should appear')
  })

  test('writes valid JSON on each line', async () => {
    const { log } = await import('../logger/logger.ts')
    log('info', 'line one')
    log('error', 'line two')
    const content = readFileSync(LOG_FILE, 'utf8')
    const lines = content.trim().split('\n').filter((l) => l.length > 0)
    assert.ok(lines.length >= 2, 'should have at least 2 lines')
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `each line must be valid JSON: ${line}`)
    }
  })

  test('logStep with error outcome sets level to error', async () => {
    const { logStep } = await import('../logger/logger.ts')
    logStep('fail@example.com', {
      step: 'add-to-cart',
      outcome: 'error',
      durationMs: 50,
      error: 'network error',
    })
    const content = readFileSync(LOG_FILE, 'utf8')
    const entry = JSON.parse(content.trim()) as Record<string, unknown>
    assert.equal(entry['level'], 'error', 'error outcome should produce error log level')
  })

  test('logStep with success outcome sets level to info', async () => {
    const { logStep } = await import('../logger/logger.ts')
    logStep('ok@example.com', {
      step: 'submit-order',
      outcome: 'success',
      durationMs: 200,
    })
    const content = readFileSync(LOG_FILE, 'utf8')
    const entry = JSON.parse(content.trim()) as Record<string, unknown>
    assert.equal(entry['level'], 'info', 'success outcome should produce info log level')
  })
})

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { formatUptime, getBotStatus } from '../daemon/botStatus.ts'

describe('botStatus', () => {
  test('formatUptime returns seconds for <1 minute', () => {
    assert.equal(formatUptime(45000), '45s')
    assert.equal(formatUptime(1000), '1s')
    assert.equal(formatUptime(0), '0s')
  })

  test('formatUptime returns minutes and seconds for <1 hour', () => {
    const result = formatUptime(90000) // 1m 30s
    assert.ok(result.includes('m'), 'should include minutes')
  })

  test('formatUptime returns hours for >1 hour', () => {
    const result = formatUptime(3661000) // 1h 1m 1s
    assert.ok(result.includes('h'), 'should include hours')
  })

  test('getBotStatus returns BotStatus with correct shape when no daemon running', async () => {
    const status = await getBotStatus()
    assert.equal(typeof status.running, 'boolean')
    assert.ok(Array.isArray(status.accounts), 'accounts should be an array')
    assert.equal(typeof status.logFile, 'string')
    // When no daemon is running (normal test env), running should be false or true
    // just verify the shape
    if (status.running) {
      assert.equal(typeof status.pid, 'number')
    }
  })
})

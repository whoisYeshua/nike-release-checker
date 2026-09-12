import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'

const CLI = 'node --import tsx /Users/jopad/Downloads/nike-release-checker/packages/bot/src/cli/index.ts'

function run(args: string): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execSync(`${CLI} ${args}`, {
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    return { stdout, stderr: '', code: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: e.status ?? 1,
    }
  }
}

describe('CLI start command', () => {
  test('start --help shows usage information', () => {
    const result = run('start --help')
    assert.ok(
      result.stdout.includes('slug') || result.stdout.includes('monitoring'),
      'help should mention slug or monitoring',
    )
    assert.equal(result.code, 0, 'help should exit 0')
  })

  test('start without --slug fails with error', () => {
    const result = run('start --sizes "42" --url "https://www.nike.com/test"')
    assert.notEqual(result.code, 0, 'missing --slug should fail')
    const combined = result.stdout + result.stderr
    assert.ok(
      combined.toLowerCase().includes('slug') || combined.toLowerCase().includes('required'),
      'error message should mention slug or required',
    )
  })

  test('start without --sizes fails with error', () => {
    const result = run('start --slug test-shoe --url "https://www.nike.com/test"')
    assert.notEqual(result.code, 0, 'missing --sizes should fail')
    const combined = result.stdout + result.stderr
    assert.ok(
      combined.toLowerCase().includes('sizes') || combined.toLowerCase().includes('required'),
      'error message should mention sizes or required',
    )
  })

  test('start without --url fails with error', () => {
    const result = run('start --slug test-shoe --sizes "42"')
    assert.notEqual(result.code, 0, 'missing --url should fail')
    const combined = result.stdout + result.stderr
    assert.ok(
      combined.toLowerCase().includes('url') || combined.toLowerCase().includes('required'),
      'error message should mention url or required',
    )
  })
})

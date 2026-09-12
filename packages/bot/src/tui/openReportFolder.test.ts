import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openReportFolder } from './openReportFolder.ts'

interface SpawnCall {
	cmd: string
	args: string[]
}

function makeSpySpawn(): { calls: SpawnCall[]; fn: Parameters<typeof openReportFolder>[1] } {
	const calls: SpawnCall[] = []
	const fn = (cmd: string, args: string[], _opts: unknown) => {
		calls.push({ cmd, args })
		return { unref: () => {} }
	}
	return { calls, fn: fn as Parameters<typeof openReportFolder>[1] }
}

function withPlatform<T>(platform: NodeJS.Platform, fn: () => T): T {
	const desc = Object.getOwnPropertyDescriptor(process, 'platform')
	Object.defineProperty(process, 'platform', { value: platform, configurable: true, writable: true })
	try {
		return fn()
	} finally {
		if (desc) Object.defineProperty(process, 'platform', desc)
	}
}

test('macOS: spawns "open" with the parent folder', () => {
	const spy = makeSpySpawn()
	withPlatform('darwin', () => {
		openReportFolder('/some/dir/report-2026-04-24.csv', spy.fn)
	})
	assert.equal(spy.calls.length, 1)
	assert.equal(spy.calls[0]!.cmd, 'open')
	assert.deepEqual(spy.calls[0]!.args, ['/some/dir'])
})

test('Windows: spawns "explorer" with the parent folder', () => {
	const spy = makeSpySpawn()
	withPlatform('win32', () => {
		openReportFolder('/reports/report.csv', spy.fn)
	})
	assert.equal(spy.calls.length, 1)
	assert.equal(spy.calls[0]!.cmd, 'explorer')
	assert.deepEqual(spy.calls[0]!.args, ['/reports'])
})

test('Linux: spawns "xdg-open" with the parent folder', () => {
	const spy = makeSpySpawn()
	withPlatform('linux', () => {
		openReportFolder('/home/user/reports/report.csv', spy.fn)
	})
	assert.equal(spy.calls.length, 1)
	assert.equal(spy.calls[0]!.cmd, 'xdg-open')
	assert.deepEqual(spy.calls[0]!.args, ['/home/user/reports'])
})

test('does not throw when reportPath is just a filename (dirname = ".")', () => {
	const spy = makeSpySpawn()
	assert.doesNotThrow(() => {
		openReportFolder('report.csv', spy.fn)
	})
	assert.equal(spy.calls[0]!.args[0], '.')
})

import { spawn as nodeSpawn } from 'node:child_process'
import { dirname } from 'node:path'

type SpawnFn = (cmd: string, args: string[], opts: { detached: boolean; stdio: 'ignore' }) => { unref(): void }

/**
 * Open the folder containing the report file in the OS file manager.
 * Detaches the child so that quitting the bot doesn't kill Finder/Explorer.
 *
 * | Platform | Command   |
 * |----------|-----------|
 * | macOS    | open      |
 * | Windows  | explorer  |
 * | Linux    | xdg-open  |
 *
 * @param reportPath  - Absolute or relative path to the CSV report file.
 * @param _spawn      - Optional override for `child_process.spawn` (testing).
 */
export function openReportFolder(
	reportPath: string,
	_spawn: SpawnFn = nodeSpawn as SpawnFn,
): void {
	const folder = dirname(reportPath)
	const cmd =
		process.platform === 'darwin' ? 'open'
		: process.platform === 'win32' ? 'explorer'
		: 'xdg-open'
	_spawn(cmd, [folder], { detached: true, stdio: 'ignore' }).unref()
}

/** @jsxImportSource react */
import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'

export interface MenuItem {
	label: string
	value: string
	hint?: string
}

export interface MainMenuProps {
	items: MenuItem[]
	onSelect: (value: string) => void
	accountCount?: number
	dropCount?: number
}

/**
 * Keyboard-driven home menu shown when the app launches and is already
 * configured. Arrow keys (or 1–9) to move, Enter to choose, q to quit.
 *
 * Why this exists: double-clicking the packaged app used to re-run the full
 * setup wizard and then exit ("Exiting in 0s…"), leaving an already-configured
 * user with no way to actually operate the bot. This menu is the home screen
 * that lets them launch a drop, test, inspect sessions, or reconfigure.
 */
export function MainMenu({ items, onSelect, accountCount, dropCount }: MainMenuProps) {
	const { exit } = useApp()
	const [idx, setIdx] = useState(0)

	const choose = (value: string) => {
		onSelect(value)
		exit()
	}

	useInput((input, key) => {
		if (key.upArrow || input === 'k') {
			setIdx((i) => (i - 1 + items.length) % items.length)
		} else if (key.downArrow || input === 'j') {
			setIdx((i) => (i + 1) % items.length)
		} else if (key.return) {
			choose(items[idx]!.value)
		} else if (input === 'q' || key.escape) {
			choose('exit')
		} else {
			const n = Number.parseInt(input, 10)
			if (!Number.isNaN(n) && n >= 1 && n <= items.length) {
				setIdx(n - 1)
				choose(items[n - 1]!.value)
			}
		}
	})

	return (
		<Box flexDirection='column' padding={1}>
			<Text color='magenta' bold>
				Nike Bot — Home
			</Text>
			<Text color='gray'>
				{accountCount ?? 0} configured account(s)
				{typeof dropCount === 'number' ? ` · ${dropCount} drop(s) in drop.csv` : ''}
			</Text>
			<Box marginTop={1} flexDirection='column'>
				{items.map((it, i) => {
					const active = i === idx
					return (
						<Box key={it.value}>
							<Text color={active ? 'green' : undefined}>
								{active ? '❯ ' : '  '}
								{i + 1}. {it.label}
							</Text>
							{it.hint ? <Text color='gray'> — {it.hint}</Text> : null}
						</Box>
					)
				})}
			</Box>
			<Box marginTop={1}>
				<Text color='gray'>↑/↓ or 1–{items.length} to select · Enter to confirm · q to quit</Text>
			</Box>
		</Box>
	)
}

/**
 * Render the home menu and resolve with the chosen action value (or 'exit').
 */
export async function runMainMenu(opts: {
	items: MenuItem[]
	accountCount?: number
	dropCount?: number
}): Promise<string> {
	const { render } = await import('ink')
	return new Promise<string>((resolve) => {
		let chosen = 'exit'
		const ui = render(
			<MainMenu
				items={opts.items}
				accountCount={opts.accountCount}
				dropCount={opts.dropCount}
				onSelect={(v) => {
					chosen = v
				}}
			/>,
		)
		ui.waitUntilExit().then(() => resolve(chosen))
	})
}

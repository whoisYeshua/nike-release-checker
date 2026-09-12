/** @jsxImportSource react */
import { useState } from 'react'
import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import * as v from 'valibot'

const CountSchema = v.pipe(
	v.string(),
	v.regex(/^\d+$/, 'Must be a whole number'),
	v.transform((s) => Number.parseInt(s, 10)),
	v.number(),
	v.minValue(1, 'Must be at least 1'),
	v.maxValue(100, 'Must be 100 or fewer'),
)

export interface Step1Props {
	onDone: (count: number) => void
}

export function Step1AccountCount({ onDone }: Step1Props) {
	const [value, setValue] = useState('')
	const [error, setError] = useState<string | undefined>(undefined)

	const handleSubmit = (raw: string) => {
		const result = v.safeParse(CountSchema, raw)
		if (!result.success) {
			setError(result.issues[0]?.message ?? 'Invalid input')
			return
		}
		setError(undefined)
		onDone(result.output)
	}

	return (
		<Box flexDirection='column'>
			<Text>Step 1 of 5 — How many Nike accounts will you configure? (1-100)</Text>
			<Box>
				<Text color='cyan'>{'> '}</Text>
				<TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
			</Box>
			{error ? <Text color='red'>{error}</Text> : null}
		</Box>
	)
}

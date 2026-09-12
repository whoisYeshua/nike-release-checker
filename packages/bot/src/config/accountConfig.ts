import { readFile } from 'node:fs/promises'
import * as v from 'valibot'
import { AccountConfigSchema, type AccountConfig } from './accountSchema.ts'

export interface AccountValidationError {
	index: number
	field: string
	message: string
}

export interface LoadAccountsResult {
	valid: AccountConfig[]
	errors: AccountValidationError[]
}

export async function loadAccountsFile(filePath: string): Promise<LoadAccountsResult> {
	const raw = await readFile(filePath, 'utf8')
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		throw new Error(`Failed to parse JSON from ${filePath}: not valid JSON`)
	}

	if (!Array.isArray(parsed)) {
		throw new Error(`Expected an array in ${filePath}, got ${typeof parsed}`)
	}

	const valid: AccountConfig[] = []
	const errors: AccountValidationError[] = []

	for (let i = 0; i < parsed.length; i++) {
		const result = v.safeParse(AccountConfigSchema, parsed[i])
		if (result.success) {
			valid.push(result.output)
		} else {
			for (const issue of result.issues) {
				const field = issue.path?.map((p) => String(p.key)).join('.') ?? 'unknown'
				errors.push({ index: i, field, message: issue.message })
			}
		}
	}

	return { valid, errors }
}

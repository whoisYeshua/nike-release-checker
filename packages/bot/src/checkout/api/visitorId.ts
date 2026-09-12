import { randomUUID } from 'node:crypto'

// Nike cart visitor IDs are client-generated UUIDs (see docs/NIKE_API_REFERENCE.md).
export function generateVisitorId(): string {
	return randomUUID()
}

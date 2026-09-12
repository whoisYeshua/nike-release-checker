/** @jsxImportSource react */
import React from 'react'
import { render } from 'ink'
import { RetrySelection } from './RetrySelection.tsx'
import type { CheckoutResult } from './SummaryScreen.tsx'
import type { RetryController } from '../checkout/retryController.ts'

/**
 * Mount the RetrySelection picker and return the accounts Kevin confirmed.
 * Returns an empty array if Kevin cancels without selecting.
 *
 * Unmounts automatically once the user confirms or cancels.
 */
export async function renderRetrySelection(
	failed: CheckoutResult[],
	retryController: RetryController,
): Promise<CheckoutResult[]> {
	return new Promise((resolve) => {
		let app: ReturnType<typeof render> | undefined

		const onConfirm = (selected: CheckoutResult[]): void => {
			app?.unmount()
			resolve(selected)
		}

		const onCancel = (): void => {
			app?.unmount()
			resolve([])
		}

		app = render(
			React.createElement(RetrySelection, {
				failed,
				retryController,
				onConfirm,
				onCancel,
			}),
		)
	})
}

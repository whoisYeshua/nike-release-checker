/** @jsxImportSource react */
import React from 'react'
import { render } from 'ink'
import { SummaryScreen } from './SummaryScreen.tsx'
import type { CheckoutResult } from './SummaryScreen.tsx'
import { writeReport } from '../logger/reportWriter.ts'
import type { RetryController } from '../checkout/retryController.ts'
import { join } from 'node:path'
import { dataDir } from '../config/dataDir.ts'

// Reports live in <data folder>/reports — the same place (Downloads/nikebot by
// default) where the user keeps their CSVs, so completed-order reports are easy
// to find next to the inputs that produced them.
const REPORTS_DIR = join(dataDir(), 'reports')

function toReportRow(r: CheckoutResult, retryController?: RetryController) {
	return {
		account_id: r.accountId,
		status: r.status,
		sku: r.sku,
		name: r.name,
		size: r.size,
		order_number: r.orderNumber,
		timestamp: new Date().toISOString(),
		error_reason: r.errorReason,
		duration_ms: r.durationMs,
		retry_attempt: retryController?.getAttempts(r.accountId),
	}
}

export interface RenderSummaryOptions {
	retryHandler: (failed: CheckoutResult[]) => void | Promise<void>
	/**
	 * When provided, retry rows are appended to this existing CSV file
	 * instead of creating a new one. Set by the caller after the first
	 * report write so the whole drop stays in one file.
	 */
	reportFile?: string
	/** Retry controller — used to populate `retry_attempt` column in report. */
	retryController?: RetryController
}

/**
 * Auto-save the report CSV, then mount SummaryScreen and await exit.
 *
 * The report is written BEFORE the screen renders so that [O] opens a folder
 * that actually contains the file. If the write fails we still render the
 * screen with a fallback path so the user can exit cleanly (NFR24).
 *
 * On retry rounds the caller passes `reportFile` so rows are appended to the
 * same CSV rather than creating a second file.
 */
export async function renderSummary(
	results: CheckoutResult[],
	startedAt: Date,
	opts: RenderSummaryOptions,
): Promise<string | undefined> {
	const endedAt = new Date()

	let reportPath: string | undefined
	try {
		if (opts.reportFile) {
			reportPath = await writeReport(results.map((r) => toReportRow(r, opts.retryController)), REPORTS_DIR, {
				appendToFile: opts.reportFile,
			})
		} else {
			reportPath = await writeReport(results.map((r) => toReportRow(r, opts.retryController)), REPORTS_DIR)
		}
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err)
		process.stderr.write(`[summary] writeReport failed: ${msg}\n`)
		reportPath = opts.reportFile ?? '(save failed — see logs)'
	}

	const { waitUntilExit } = render(
		React.createElement(SummaryScreen, {
			results,
			startedAt,
			endedAt,
			reportPath: reportPath ?? '(save failed — see logs)',
			onRetry: opts.retryHandler,
			onQuit: () => process.exit(0),
		}),
	)
	await waitUntilExit()

	return reportPath
}

/** @jsxImportSource react */
import { createElement, type ComponentType } from 'react'
import { render } from 'ink'
import { Dashboard } from './Dashboard.tsx'
import type { DashboardProps } from './Dashboard.tsx'

export interface RenderDashboardHandle {
	waitUntilExit: () => Promise<void>
	unmount: () => void
}

/**
 * Render the live Dashboard to the terminal and return a handle to await or
 * unmount it. Thin wrapper around `ink`'s `render()` so callers (CLI) don't
 * need to import React or Ink directly.
 */
export function renderDashboard(props: DashboardProps): RenderDashboardHandle {
	const app = render(createElement(Dashboard, props))
	return {
		waitUntilExit: () => app.waitUntilExit(),
		unmount: () => app.unmount(),
	}
}

/**
 * Render any Ink component as the root UI. Used by the warmup flow to mount
 * `<WarmupWidget>` before transitioning to `<Dashboard>` at T=0.
 */
export function renderComponent<P extends Record<string, unknown>>(
	Component: ComponentType<P>,
	props: P,
): RenderDashboardHandle {
	const app = render(createElement(Component, props))
	return {
		waitUntilExit: () => app.waitUntilExit(),
		unmount: () => app.unmount(),
	}
}

import { array, number, object, string } from 'valibot'

import type { BaseSchema } from 'valibot'

const pagesSchema = object({
	next: string(),
	prev: string(),
	totalPages: number(),
	totalResources: number(),
})

export const createSnkrsRootResponseSchema = <Schema extends BaseSchema<unknown, unknown, any>>(
	objectsSchema: Schema
) =>
	object({
		objects: array(objectsSchema),
		pages: pagesSchema,
	})

export type SnkrsRootResponse<T> = {
	objects: T[]
	pages: Pages
}

export interface Pages {
	next: string
	prev: string
	totalPages: number
	totalResources: number
}

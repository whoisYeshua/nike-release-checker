export interface SnkrsRootResponse<T> {
	objects: T[]
	pages: Pages
}

export interface Pages {
	next: string
	prev: string
	totalPages: number
	totalResources: number
}

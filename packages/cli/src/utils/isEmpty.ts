declare const emptyObjectSymbol: unique symbol
interface EmptyObject {
	[emptyObjectSymbol]?: never
}
type Empty = null | undefined | void | '' | never | never[] | EmptyObject
interface NullObject {
	valueOf(): null
}

export const isEmptyArray = (variable: unknown) => Array.isArray(variable) && variable.length === 0

export const isVoid = (
	variable: unknown
): variable is null | undefined | void | never | NullObject =>
	variable === undefined ||
	(typeof variable === 'object' && (variable === null || variable.valueOf() === null))

export const isEmptyString = (variable: unknown) => typeof variable === 'string' && variable === ''

export const isEmptyObject = (variable: unknown): variable is EmptyObject | NullObject =>
	typeof variable === 'object' &&
	variable !== null &&
	((variable.constructor.prototype === Object.prototype &&
		Object.getOwnPropertyNames(variable).length === 0) ||
		variable.valueOf() === null)

export const isEmpty = <T>(variable: T | Empty): variable is Empty =>
	isVoid(variable) || isEmptyString(variable) || isEmptyArray(variable) || isEmptyObject(variable)

export const isNotEmpty = <T>(variable: T | Empty): variable is Exclude<T, Empty> =>
	!isEmpty(variable)

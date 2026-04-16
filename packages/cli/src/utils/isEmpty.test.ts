import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
	isEmpty,
	isEmptyArray,
	isEmptyObject,
	isEmptyString,
	isNotEmpty,
	isVoid,
} from './isEmpty.ts'

describe('isEmptyArray', () => {
	test('returns true only for empty arrays', () => {
		assert.strictEqual(isEmptyArray([]), true)
		assert.strictEqual(isEmptyArray([1]), false)
		assert.strictEqual(isEmptyArray({}), false)
		assert.strictEqual(isEmptyArray(null), false)
	})
})

describe('isVoid', () => {
	const TestBox = class {
		#value: number | null
		constructor(value: number | null = null) {
			this.#value = value
		}
		valueOf() {
			return this.#value
		}
	}

	test('returns true for undefined, null, and objects whose valueOf is null', () => {
		assert.strictEqual(isVoid(undefined), true)
		assert.strictEqual(isVoid(null), true)
		assert.strictEqual(isVoid({ valueOf: () => null }), true)
		assert.strictEqual(isVoid(new TestBox()), true)
	})

	test('returns false for primitives and ordinary objects', () => {
		assert.strictEqual(isVoid(''), false)
		assert.strictEqual(isVoid(0), false)
		assert.strictEqual(isVoid({}), false)
		assert.strictEqual(isVoid({ valueOf: () => 0 }), false)
		assert.strictEqual(isVoid(new TestBox(0)), false)
	})
})

describe('isEmptyString', () => {
	test('returns true only for empty string', () => {
		assert.strictEqual(isEmptyString(''), true)
		assert.strictEqual(isEmptyString('a'), false)
		assert.strictEqual(isEmptyString(null), false)
		assert.strictEqual(isEmptyString([]), false)
	})
})

describe('isEmptyObject', () => {
	test('returns true for plain empty object', () => {
		assert.strictEqual(isEmptyObject({}), true)
	})

	test('returns true for object created with Object.create(null)', () => {
		assert.strictEqual(isEmptyObject(Object.create(null)), true)
	})

	test('returns true when valueOf returns null', () => {
		assert.strictEqual(isEmptyObject({ valueOf: () => null }), true)
	})

	test('returns false for non-plain objects and non-empty objects', () => {
		assert.strictEqual(isEmptyObject([]), false)
		assert.strictEqual(isEmptyObject(null), false)
		assert.strictEqual(isEmptyObject({ a: 1 }), false)
		class C {}
		assert.strictEqual(isEmptyObject(new C()), false)
	})
})

describe('isEmpty', () => {
	test('aggregates void, empty string, empty array, and empty object', () => {
		assert.strictEqual(isEmpty(undefined), true)
		assert.strictEqual(isEmpty(null), true)
		assert.strictEqual(isEmpty(''), true)
		assert.strictEqual(isEmpty([]), true)
		assert.strictEqual(isEmpty({}), true)
	})

	test('returns false for common non-empty values', () => {
		assert.strictEqual(isEmpty('x'), false)
		assert.strictEqual(isEmpty([0]), false)
		assert.strictEqual(isEmpty({ a: 1 }), false)
		assert.strictEqual(isEmpty(0), false)
	})
})

describe('isNotEmpty', () => {
	test('is negation of isEmpty', () => {
		assert.strictEqual(isNotEmpty(null), false)
		assert.strictEqual(isNotEmpty('hi'), true)
	})
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAddressText, digitsOnly, displayedAddressMatches } from './addressMatcher.ts'

const TARGET = { street: '10 rue de la Paix', city: 'Paris', zip: '75002', country: 'FR' }

test('normalizeAddressText strips accents/punctuation/case and expands FR abbreviations', () => {
	assert.equal(normalizeAddressText('10 R. de la Páix'), '10 rue de la paix')
	assert.equal(normalizeAddressText('25 Av.  des Champs'), '25 avenue des champs')
	assert.equal(normalizeAddressText('3 BD Voltaire'), '3 boulevard voltaire')
})

test('digitsOnly keeps only digits', () => {
	assert.equal(digitsOnly('75002 Paris'), '75002')
	assert.equal(digitsOnly('+33 6 00 00 00 00'), '33600000000')
})

test('matches when Nike concatenates the same address into one block', () => {
	const displayed = 'Demo User10 rue de la Paix75002 Paris Francedemo@example.com33600000000'
	assert.equal(displayedAddressMatches(displayed, TARGET), true)
})

test('matches with formatting differences (abbrev + accents)', () => {
	const displayed = 'Demo User 10 R. de la Páix 75002 PARIS France'
	assert.equal(displayedAddressMatches(displayed, TARGET), true)
})

test('does NOT match a different street at the same nothing-in-common', () => {
	const displayed = 'Other Person 99 boulevard Voltaire 75011 Paris France'
	assert.equal(displayedAddressMatches(displayed, TARGET), false)
})

test('does NOT match when ZIP differs', () => {
	const displayed = 'Demo User 10 rue de la Paix 69001 Lyon France'
	assert.equal(displayedAddressMatches(displayed, TARGET), false)
})

test('matches via house-number + longest-token fallback', () => {
	// Street token order shuffled but house number + "champs" present, ZIP ok.
	const target = { street: '25 avenue des Champs-Elysees', city: 'Paris', zip: '75008' }
	const displayed = 'Jean 25 av. des Champs Elysees 75008 Paris'
	assert.equal(displayedAddressMatches(displayed, target), true)
})

test('empty street never matches', () => {
	assert.equal(displayedAddressMatches('whatever 75002', { street: '', city: 'Paris', zip: '75002' }), false)
})

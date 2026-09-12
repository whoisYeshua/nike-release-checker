import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardLast4, displayedCardMatches } from './cardMatcher.ts'

test('cardLast4 strips formatting', () => {
	assert.equal(cardLast4('4111 1111 1111 1234'), '1234')
	assert.equal(cardLast4('4111-1111-1111-9876'), '9876')
	assert.equal(cardLast4('4111111111110042'), '0042')
})

test('matches a bullet-masked saved card', () => {
	assert.equal(displayedCardMatches('Visa •••• 1234', '4111111111111234'), true)
	assert.equal(displayedCardMatches('Carte ····0042', '4111111111110042'), true)
})

test('matches "se terminant par" / "ending in" phrasings', () => {
	assert.equal(displayedCardMatches('Carte se terminant par 1234', '4111111111111234'), true)
	assert.equal(displayedCardMatches('Visa ending in 9876', '4111111111119876'), true)
})

test('does NOT match a different saved card', () => {
	assert.equal(displayedCardMatches('Visa •••• 5555', '4111111111111234'), false)
})

test('does NOT match the 4 digits mid-sequence', () => {
	// 1234 appears but only inside a longer group → not a trailing match.
	assert.equal(displayedCardMatches('order 9912348', '4111111111111234'), false)
})

test('short/invalid target never matches', () => {
	assert.equal(displayedCardMatches('Visa •••• 1234', '12'), false)
})

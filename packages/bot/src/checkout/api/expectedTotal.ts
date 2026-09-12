// Expected-total computation helper (Story 12.6, FR66).
// Computes the bot's expected total BEFORE review so it can be compared
// against Nike's server-computed total in assertTotalMatches.
//
// Tax is NOT included: Nike computes tax server-side based on shipping address.
// The bot trusts Nike's tax computation but rejects unexpected non-tax variance.

export const computeExpectedTotal = (args: {
	pdpPrice: number
	fulfillmentCost: number
	currency: string
}): number => Number((args.pdpPrice + args.fulfillmentCost).toFixed(2))

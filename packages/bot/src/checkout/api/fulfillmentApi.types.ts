// Type definitions for Nike Fulfillment Offerings API.
// Story 12.4, FR63.

export type FulfillmentType = 'SHIP' | 'PICKUP'
export type JobStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

export interface FulfillmentOffering {
	offeringId: string
	carrier: string
	serviceLevel: string
	estimatedDays?: { min: number; max: number }
	type: FulfillmentType
	cost?: { amount: number; currency: string }
}

export interface PricingJob {
	jobId: string
	status: JobStatus
	pricedOffering?: {
		offeringId: string
		totalCost: { amount: number; currency: string }
		taxBreakdown?: Array<{ label: string; amount: number }>
		etaWindow?: { earliest: string; latest: string }
	}
	failureReason?: string
}

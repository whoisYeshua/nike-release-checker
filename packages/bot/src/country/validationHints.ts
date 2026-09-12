// Country-specific human-readable hint strings for phone and zip validation errors.
// Kept separate from validation.ts so copy changes do not touch validation logic.
// Future: translate per operator locale (v3.2+).

export const PHONE_HINTS: Record<string, string> = {
	FR: 'e.g. +33612345678 (FR mobile, 10 digits with +33 prefix)',
	US: 'e.g. +14155552671 (US, 10 digits with +1 prefix)',
	GB: 'e.g. +447911123456 (UK mobile, 10 digits with +44 prefix)',
	DE: 'e.g. +491701234567 (DE mobile, 10-11 digits with +49 prefix)',
	JP: 'e.g. +819012345678 (JP mobile, 10-11 digits with +81 prefix)',
	ES: 'e.g. +34612345678 (ES mobile, 9 digits with +34 prefix)',
	IT: 'e.g. +393123456789 (IT mobile, 9-10 digits with +39 prefix)',
	NL: 'e.g. +31612345678 (NL mobile, 9 digits with +31 prefix)',
	BE: 'e.g. +32412345678 (BE mobile, 9 digits with +32 prefix)',
	AU: 'e.g. +61412345678 (AU mobile, 9 digits with +61 prefix)',
}

export const ZIP_HINTS: Record<string, string> = {
	FR: 'expected 5-digit French postal code (e.g. 75001)',
	US: 'expected 5-digit US ZIP (e.g. 90210) or ZIP+4 (90210-1234)',
	GB: 'expected UK postcode (e.g. SW1A 1AA)',
	DE: 'expected 5-digit German Postleitzahl (e.g. 10115)',
	JP: 'expected 7-digit Japanese postcode with hyphen (e.g. 100-0001)',
	ES: 'expected 5-digit Spanish código postal (e.g. 28001)',
	IT: 'expected 5-digit Italian CAP (e.g. 00100)',
	NL: 'expected NL postcode (e.g. 1012 JS)',
	BE: 'expected 4-digit Belgian postcode (e.g. 1000)',
	AU: 'expected 4-digit Australian postcode (e.g. 2000)',
}

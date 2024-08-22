import { z } from 'zod'

export const countryInfoSchema = z
  .object({
    country: z.string(),
    language: z.string(),
    emoji: z.string(),
  })
  .strict()

export type CountryInfo = z.infer<typeof countryInfoSchema>

import { availableCountries } from '../config/index.js'

export const countrySchema = {
  properties: {
    country: {
      description: 'Choose your country alias (index)',
      validator: /^[A-Z]{2}$/,
      warning: 'Use only uppercase two-letter country code (index)',
      required: true,
      maxLength: 2,
      conform: value => {
        if (value in availableCountries) return true
        return false
      },
    },
  },
}

export const urlSchema = {
  properties: {
    url: {
      description: 'Past product URL',
      validator: /^https:\/\/www\.nike\.com/,
      warning:
        'Use full product url (eg. https://www.nike.com/ru/launch/t/waffle-trainer-2-starfish)',
      required: true,
    },
  },
}

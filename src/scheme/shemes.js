const { availableCountries } = require('../config/availableCountries')

const countrySchema = {
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
const urlSchema = {
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

module.exports = { countrySchema, urlSchema }

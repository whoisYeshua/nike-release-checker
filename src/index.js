import prompt from 'prompt'
import colors from 'colors'
import terminalImage from 'terminal-image'

import { getDataJSON, getDataBuffer } from './api/requests.js'
import { availableCountries } from './config/availableCountries.js'
import { colorTheme } from './config/colorTheme.js'
import {
  getDatabaseCounts,
  getDatabaseDocument,
  setDatabaseDocumentBody,
  updateDatabaseDocument,
  removeDatabase,
} from './database/database.js'
import { countrySchema, urlSchema } from './scheme/shemes.js'
import { formateData } from './util/formateData.js'

colors.setTheme(colorTheme)

const myArguments = process.argv.slice(2)
let now = new Date()
now = new Date(now.getFullYear(), now.getMonth(), now.getDate())

const getUserSlug = async () => {
  prompt.start()
  const { url } = await prompt.get(urlSchema)
  const chunk = url.split('/')

  return chunk[chunk['length'] - 1]
}

const getCountryCode = async () => {
  displayAvaliableCountries()
  prompt.start()
  return await prompt.get(countrySchema)
}

const displayAvaliableCountries = () => {
  if (process.platform === 'win32') {
    console.table(availableCountries, ['country'])
  } else {
    console.table(availableCountries, ['country', 'emoji'])
  }
}

const start = async () => {
  if (myArguments[0] === 'reset') {
    await removeDatabase()
    console.log('Reset completed')
  } else {
    checkStorage()
  }
}

const checkStorage = async () => {
  if ((await getDatabaseCounts()) > 0) {
    let lastFetch = (await getDatabaseDocument()).lastFetch
    lastFetch = lastFetch ? lastFetch.getTime() : lastFetch
    if (lastFetch !== now.getTime()) {
      await updateStorage()
      const products = (await getDatabaseDocument()).products
      await output(products)
      checkStorage()
    } else {
      const products = (await getDatabaseDocument()).products
      const userSlug = await getUserSlug()
      await selectProduct(products, userSlug)
    }
  } else {
    const { country } = await getCountryCode()
    await setDatabaseDocumentBody(country)
    checkStorage()
  }
}

const updateStorage = async () => {
  const selectedCountry = (await getDatabaseDocument()).country
  const data = await getDataJSON(
    selectedCountry,
    availableCountries[selectedCountry].language
  )
  const products = formateData(data.objects)
  await updateDatabaseDocument(now, products)
  console.log('Storage Updated')
}

const output = async products => {
  for (const product of products) {
    await showProduct(product)
  }
}

const selectProduct = async (products, userSlug) => {
  let exists
  for (const product of products) {
    if (product.slug === userSlug) {
      exists = true
      await showProduct(product)
    }
  }
  if (!exists) {
    await updateStorage()
  }
}

const showProduct = async product => {
  console.log(product)
  console.group(product.slug.slugTheme)

  console.log(product.title)
  console.log('')

  for (const model of product.models) {
    console.groupCollapsed(model.modelName.modelTheme)

    if (myArguments[0] === 'img') {
      const data = await getDataBuffer(model.imageURL)
      console.log(await terminalImage.buffer(data))
    } else {
      console.log(model.imageURL)
    }
    console.log(model.id.idTheme)

    console.groupCollapsed('size - stock'.stockTitleTheme)

    for (const index in model.sizes) {
      const [key, value] = Object.entries(model.sizes[index])[0]
      const stock = model.stock[index][value]

      const readbleSizeFormat = key.replace('_', '.')

      switch (stock) {
        case 'HIGH': {
          console.log('%s - %s'.highStockTheme, readbleSizeFormat, stock)

          break
        }
        case 'MEDIUM': {
          console.log('%s - %s'.midStockTheme, readbleSizeFormat, stock)

          break
        }
        case 'LOW': {
          console.log('%s - %s'.lowStockTheme, readbleSizeFormat, stock)

          break
        }
        default: {
          console.log('%s - %s'.othersStockTheme, readbleSizeFormat, stock)
        }
      }
    }
    console.groupEnd()
    console.groupEnd()
    console.log('')
  }
  console.groupEnd()
  console.log('')
}

start()

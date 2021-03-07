const prompt = require('prompt')
var colors = require('colors')
const terminalImage = require('terminal-image')

const { countries } = require('./src/available-countries')
const { getDbCounts, getDbDocument, setDbDocumentBody, updateDbDocument, removeDb } = require('./src/db')
const { getDataJSON, getDataBuffer } = require('./src/requests')
const { formateData } = require('./src/format')

const countrySchema = {
    properties: {
        country: {
            description: 'Choose your country alias (index)',
            validator: /^[A-Z]{2}$/,
            warning: 'Use only uppercase two-letter country code (index)',
            required: true,
            maxLength: 2,
            conform: value => {
                if (value in countries) return true
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
            warning: 'Use full product url (eg. https://www.nike.com/ru/launch/t/waffle-trainer-2-starfish)',
            required: true,
        },
    },
}

colors.setTheme({
    slugTheme: ['brightMagenta'],
    modelTheme: ['brightCyan', 'bold'],
    idTheme: ['bold'],
    stockTitleTheme: ['bold'],
    highStockTheme: ['brightGreen', 'bold'],
    midStockTheme: ['brightYellow', 'bold'],
    lowStockTheme: ['brightRed', 'bold'],
    othersStockTheme: ['grey', 'bold'],
})

const myArgs = process.argv.slice(2)
let now = new Date()
now = new Date(now.getFullYear(), now.getMonth(), now.getDate())

const getUserSlug = async () => {
    try {
        prompt.start()
        const { url } = await prompt.get(urlSchema)
        const chunk = url.split('/')

        return chunk[chunk['length'] - 1]
    } catch (error) {
        throw error
    }
}

const getCountryCode = async () => {
    try {
        displayAvaliableCountries()
        prompt.start()
        return await prompt.get(countrySchema)
    } catch (error) {
        throw error
    }
}

const displayAvaliableCountries = () => {
    if (process.platform === 'win32') {
        console.table(countries, ['country'])
    } else {
        console.table(countries, ['country', 'emoji'])
    }
}

const start = async () => {
    if (myArgs[0] === 'reset') {
        await removeDb()
        console.log('Reset completed')
    } else {
        checkStorage()
    }
}

const checkStorage = async () => {
    if ((await getDbCounts()) > 0) {
        let lastFetch = (await getDbDocument()).lastFetch
        lastFetch = lastFetch ? lastFetch.getTime() : lastFetch
        if (lastFetch !== now.getTime()) {
            await updateStorage()
            const products = (await getDbDocument()).products
            await output(products)
            checkStorage()
        } else {
            const products = (await getDbDocument()).products
            const userSlug = await getUserSlug()
            await selectProduct(products, userSlug)
        }
    } else {
        const { country } = await getCountryCode()
        await setDbDocumentBody(country)
        checkStorage()
    }
}

const updateStorage = async () => {
    const selectedCountry = (await getDbDocument()).country
    const data = await getDataJSON(selectedCountry, countries[selectedCountry].language)
    const products = formateData(data.objects)
    await updateDbDocument(now, products)
    console.log('Storage Updated')
}

const output = async products => {
    for (const product of products) {
        await showProduct(product)
    }
}

const selectProduct = async (products, userSlug) => {
    for (const product of products) {
        if (product.slug === userSlug) {
            await showProduct(product)
        }
    }
}

const showProduct = async product => {
    console.group(product.slug.slugTheme)

    console.log(product.title)
    console.log('')

    for (const model of product.models) {
        console.groupCollapsed(model.modelName.modelTheme)

        if (myArgs[0] === 'img') {
            const data = await getDataBuffer(model.imageURL)
            console.log(await terminalImage.buffer(data))
        } else {
            console.log(model.imageURL)
        }
        console.log(model.id.idTheme)

        console.groupCollapsed('size - stock'.stockTitleTheme)

        for (let i in model.sizes) {
            const key = Object.keys(model.sizes[i])[0]
            const value = model.sizes[i][key]
            const stock = model.stock[i][value]

            const readbleSizeFormat = key.replace('_', '.')

            if (stock === 'HIGH') {
                console.log('%s - %s'.highStockTheme, readbleSizeFormat, stock)
            } else if (stock === 'MEDIUM') {
                console.log('%s - %s'.midStockTheme, readbleSizeFormat, stock)
            } else if (stock === 'LOW') {
                console.log('%s - %s'.lowStockTheme, readbleSizeFormat, stock)
            } else {
                console.log('%s - %s'.othersStockTheme, readbleSizeFormat, stock)
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

const Datastore = require('nedb-promise')

const db = Datastore({ filename: 'productDB', autoload: true })

const createBody = country => {
    return {
        country,
        lastFetch: null,
        products: null,
    }
}

const getDbCounts = async () => {
    try {
        return await db.count({})
    } catch (error) {
        throw error
    }
}

const getDbDocument = async () => {
    try {
        return await db.findOne({ country: { $exists: true } })
    } catch (error) {
        throw error
    }
}

const setDbDocumentBody = async country => {
    try {
        await db.insert(createBody(country))
    } catch (error) {
        throw error
    }
}

const updateDbDocument = async (date, products) => {
    try {
        await db.update({ country: { $exists: true } }, { $set: { lastFetch: date, products: products } })
    } catch (error) {
        throw error
    }
}

const removeDb = async () => {
    try {
        await db.remove({}, { multi: true })
    } catch (error) {
        throw error
    }
}

module.exports = { getDbCounts, getDbDocument, setDbDocumentBody, updateDbDocument, removeDb }

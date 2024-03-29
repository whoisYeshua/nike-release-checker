import Datastore from 'nedb-promise'

const database = Datastore({ filename: 'productDB', autoload: true })

const createBody = country => {
  return {
    country,
    lastFetch: null,
    products: null,
  }
}

export const getDatabaseCounts = async () => {
  try {
    return await database.count({})
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const getDatabaseDocument = async () => {
  try {
    return await database.findOne({ country: { $exists: true } })
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const setDatabaseDocumentBody = async country => {
  try {
    await database.insert(createBody(country))
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const updateDatabaseDocument = async (date, products) => {
  try {
    await database.update(
      { country: { $exists: true } },
      { $set: { lastFetch: date, products: products } }
    )
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const removeDatabase = async () => {
  try {
    await database.remove({}, { multi: true })
  } catch (error) {
    console.error(error)
    throw error
  }
}

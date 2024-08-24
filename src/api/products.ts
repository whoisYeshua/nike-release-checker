import { getProductUrl } from './url'
import { rest } from './utils/rest'

export const getProducts = async () => {
	try {
		const url = getProductUrl({ countryName: 'test', language: 'te' })
		const response = await rest.get({ url })
	} catch (error) {
		console.error(error)
	}
}

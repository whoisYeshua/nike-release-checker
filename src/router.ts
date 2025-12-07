import { createRouter } from '@nanostores/router'

import { inputDictionary } from './utils/inputDictionary.ts'
import { logger } from './utils/logger.ts'

const { HOME, COUNTRY, PRODUCT } = inputDictionary

export const $router = createRouter({
	[COUNTRY.routeName]: COUNTRY.url,
	[HOME.routeName]: HOME.url,
	[PRODUCT.routeName]: PRODUCT.url,
})

const LOG_SCOPE = 'router'
logger.debug({ scope: LOG_SCOPE, routes: Object.keys($router.routes) }, 'router initialized')

$router.listen((routerState) => {
	logger.debug(
		{
			scope: LOG_SCOPE,
			route: routerState?.route,
			params: routerState?.params,
		},
		'router state change'
	)
})

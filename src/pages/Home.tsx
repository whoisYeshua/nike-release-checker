import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useStore } from '@nanostores/react'

import { countryStore } from '../store/countryStore'
import { router } from '../router'
import { inputDictionary } from '../utils/inputDictionary'

const { COUNTRY } = inputDictionary

export const Home = () => {
  const country = useStore(countryStore)
  const isLoading = true

  if (!country) {
    // use queueMicrotask for prevent error on change url before component render
    queueMicrotask(() => router.open(COUNTRY.url))
    return null
  }

  if (isLoading)
    return (
      <Box>
        <Text color="#FF5C7D">
          <Spinner type="dots" />
        </Text>
        <Text> Loading</Text>
      </Box>
    )

  return (
    <Box paddingLeft={2}>
      <Text>HOME</Text>
    </Box>
  )
}

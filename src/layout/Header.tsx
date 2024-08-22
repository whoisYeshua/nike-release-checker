import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'

import { readableCountry } from '../store/countryStore'
import { APP_VERSION } from '../utils/constants'

export const Header = () => {
  const country = useStore(readableCountry)

  return (
    <Box borderStyle="round" paddingLeft={1} paddingRight={1} justifyContent="space-between">
      <Box gap={1}>
        <Text color="#FF5C7D" bold>
          SNKRS CLI
        </Text>
        <Text color="gray" italic>
          V {APP_VERSION}
        </Text>
      </Box>
      <Box>
        <Text>Country: {country}</Text>
      </Box>
    </Box>
  )
}

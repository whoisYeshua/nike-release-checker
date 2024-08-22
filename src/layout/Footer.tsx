import { Box, Text } from 'ink'
import { useStore } from '@nanostores/react'

import { router } from '../router.js'
import { inputDictionary } from '../utils/inputDictionary.js'

const { COUNTRY } = inputDictionary

export const Footer = () => {
  const page = useStore(router)

  return (
    <Box borderStyle="round" paddingLeft={1} paddingRight={1} justifyContent="space-between">
      <Box>{page?.route !== COUNTRY.routeName && <Text>[{COUNTRY.key}] - Reset Country</Text>}</Box>
      <Text color="gray" italic>
        Made by @whoisYeshua
      </Text>
    </Box>
  )
}

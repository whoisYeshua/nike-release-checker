import { Box, Spacer } from 'ink'

import { useInputProcess } from '../hooks/useInputProcess.js'
import { Pages } from '../pages/index.js'
import { Header } from './Header.js'
import { Footer } from './Footer.js'

export const Layout = () => {
  useInputProcess()

  return (
    <Box flexDirection="column" height={35}>
      <Header />
      <Pages />
      <Spacer />
      <Footer />
    </Box>
  )
}

import { Box, Spacer } from 'ink'

import { useInputProcess } from '../hooks/useInputProcess'
import { Pages } from '../pages/index'
import { Header } from './Header'
import { Footer } from './Footer'

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

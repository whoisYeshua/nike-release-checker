import pc from 'picocolors'
import { Formatter } from 'picocolors/types'

export const colorTheme: Record<string, Formatter> = {
  slug: input => pc.magenta(input),
  model: input => pc.cyan(pc.bold(input)),
  importantText: input => pc.bold(input),
  highStock: input => pc.green(pc.bold(input)),
  midStock: input => pc.yellow(pc.bold(input)),
  lowStock: input => pc.red(pc.bold(input)),
  othersStock: input => pc.gray(pc.bold(input)),
}

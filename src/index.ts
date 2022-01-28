import pc from 'picocolors'
import { Formatter } from 'picocolors/types'

let { magenta, cyan, green, yellow, red, gray, bold } = pc.createColors(true)

export const colorTheme: Record<string, Formatter> = {
  slugTheme: value => magenta(value),
  modelTheme: value => cyan(bold(value)),
  idTheme: value => bold(value),
  stockTitleTheme: value => bold(value),
  highStockTheme: value => green(bold(value)),
  midStockTheme: value => yellow(bold(value)),
  lowStockTheme: value => red(bold(value)),
  othersStockTheme: value => gray(bold(value)),
}

console.log(colorTheme.slugTheme('red'))
console.log(pc)

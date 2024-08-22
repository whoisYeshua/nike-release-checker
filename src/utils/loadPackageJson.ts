import { readFile } from 'node:fs/promises'

export const loadPackageJson = async () => {
  const json = await readFile(new URL('../package.json', import.meta.url))
  return JSON.parse(json.toString())
}

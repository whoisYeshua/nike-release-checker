/**
 * selectorLoader — per-country selector deep-merge with LRU cache.
 *
 * Loads `selectors.yaml` (base / FR-derived) and optionally overlays
 * `selectors/<CC>.yaml` (country-specific deltas). The result is validated
 * against `SelectorsSchema` and cached per country code (max 10 entries).
 *
 * Design notes:
 *  - Deep merge: only keys present in the override file are applied; siblings
 *    and absent keys inherit from base. Nested objects are merged per-key, not
 *    replaced wholesale.
 *  - Silent passthrough when no override file exists (most countries share the
 *    FR DOM and need no overrides).
 *  - `clearSelectorCache()` is exposed for dev hot-reload; never call in prod.
 */

import { readFile, access } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { parse as parseYaml } from 'yaml'
import * as v from 'valibot'
import { countryRegistry } from './registry.ts'
import { SelectorsSchema } from '../config/selectorSchema.ts'
import type { Selectors } from '../config/selectorSchema.ts'

export interface LoadSelectorsOptions {
	/** Base directory to resolve `selectors.yaml` and `selectors/<CC>.yaml` against. Defaults to process.cwd() — pass an explicit cwd in tests to avoid process.chdir() pollution. */
	cwd?: string
}

// ---------------------------------------------------------------------------
// Internal cache (LRU-lite: a plain Map capped at MAX_CACHE_SIZE)
// ---------------------------------------------------------------------------

const MAX_CACHE_SIZE = 10
const cache = new Map<string, Selectors>()

function cacheSet(code: string, value: Selectors): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    // Evict the oldest (first-inserted) entry
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(code, value)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PATH = 'selectors.yaml'

async function readYamlIfExists(path: string): Promise<unknown | null> {
  try {
    await access(path)
  } catch {
    return null
  }
  return parseYaml(await readFile(path, 'utf-8'))
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      out[key] !== null &&
      typeof out[key] === 'object' &&
      !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(
        out[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else {
      out[key] = value
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load and return the effective `Selectors` for the given country code.
 *
 * Resolution order:
 *   1. Check in-memory cache — return immediately on hit.
 *   2. Read `selectors.yaml` (base / FR baseline).
 *   3. Read `selectors/<CC>.yaml` if it exists (country override).
 *   4. Deep-merge base + override.
 *   5. Validate merged result against `SelectorsSchema`.
 *   6. Store in cache and return.
 *
 * @throws {Error} if the base file is missing.
 * @throws {Error} if the merged result fails schema validation, with the
 *   country code and file paths in the message.
 */
export async function loadSelectorsForCountry(
	code: string,
	options: LoadSelectorsOptions = {},
): Promise<Selectors> {
  const country = countryRegistry.get(code)
  const cc = country.code

  if (cache.has(cc)) return cache.get(cc)!

  const cwd = options.cwd ?? process.cwd()
  const basePath = resolvePath(cwd, BASE_PATH)
  const base = await readYamlIfExists(basePath)
  if (base === null) throw new Error(`Base selectors file not found at ${basePath}`)

  const overrideRel = country.selectorOverridePath ?? `selectors/${cc}.yaml`
  const overridePath = resolvePath(cwd, overrideRel)
  const overrideRaw = country.selectorOverridePath === null
    ? null
    : await readYamlIfExists(overridePath)
  const override = (overrideRaw ?? {}) as Record<string, unknown>

  const merged = deepMerge(base as Record<string, unknown>, override)

  try {
    const validated = v.parse(SelectorsSchema, merged)
    cacheSet(cc, validated)
    return validated
  } catch (e) {
    const detail = e instanceof v.ValiError ? v.flatten(e.issues) : (e as Error).message
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail)
    throw new Error(
      `Invalid selectors for country ${cc} after merging ${overridePath} + ${basePath}: ${detailStr}`,
    )
  }
}

/**
 * Flush the entire selector cache.
 *
 * Intended for dev hot-reload (operator edits a YAML file and wants to see
 * the change without restarting). Never call this in production drops.
 */
export function clearSelectorCache(): void {
  cache.clear()
}

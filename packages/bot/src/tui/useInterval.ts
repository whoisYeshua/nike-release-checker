import { useEffect, useRef } from 'react'

/**
 * Stable `setInterval` hook.
 *
 * - Pass `ms = null` to pause without unmounting.
 * - The callback ref is updated on every render, so stale-closure bugs are
 *   impossible even if the caller passes an inline arrow function.
 * - The interval is cleaned up on unmount or when `ms` changes.
 */
export function useInterval(cb: () => void, ms: number | null): void {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  }, [cb])
  useEffect(() => {
    if (ms == null) return
    const id = setInterval(() => ref.current(), ms)
    return () => clearInterval(id)
  }, [ms])
}

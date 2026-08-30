import { type Table } from '@tanstack/react-table'
import { vi } from 'vitest'

/**
 * Minimal TanStack Table mock for tests that only need selected rows and
 * `resetRowSelection` (e.g. multi-delete dialogs). Pass `originals` when the
 * component under test reads `row.original`.
 */
export function createTableMock(rowCount = 2, originals?: unknown[]) {
  const rows = originals
    ? originals.map((original) => ({ original }))
    : Array.from({ length: rowCount }, () => ({}))
  const resetRowSelection = vi.fn()
  const table = {
    getFilteredSelectedRowModel: () => ({ rows }),
    resetRowSelection,
  } as unknown as Table<Record<string, unknown>>
  return { table, resetRowSelection }
}

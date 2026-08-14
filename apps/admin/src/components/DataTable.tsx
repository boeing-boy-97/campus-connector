import type { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  width?: string;
  /** Hides the column below the small breakpoint to keep tables readable. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  keyExtractor: (item: T) => string;
  /** Caption for screen readers describing the table contents. */
  caption?: string;
}

/**
 * Accessible, responsive data table.
 *
 * Wrapped in a horizontally scrollable region with `tabindex=0` so keyboard
 * users can scroll it, and each cell carries a `data-label` used by the
 * stacked-card layout on narrow screens (the original table simply overflowed).
 */
export function DataTable<T>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No data available',
  keyExtractor,
  caption,
}: DataTableProps<T>) {
  return (
    <div className="table-wrapper" tabIndex={0} role="region" aria-label={caption ?? 'Data table'}>
      <table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={index}
                style={{ width: column.width }}
                className={column.hideOnMobile ? 'hide-sm' : undefined}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, rowIndex) => (
              <tr key={`skeleton-${rowIndex}`}>
                {columns.map((column, colIndex) => (
                  <td key={colIndex} className={column.hideOnMobile ? 'hide-sm' : undefined}>
                    <div className="skeleton" style={{ height: 15, borderRadius: 4 }} />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">{emptyMessage}</td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={keyExtractor(row)}>
                {columns.map((column, colIndex) => (
                  <td
                    key={colIndex}
                    data-label={column.header}
                    className={column.hideOnMobile ? 'hide-sm' : undefined}
                  >
                    {typeof column.accessor === 'function'
                      ? column.accessor(row)
                      : (row[column.accessor] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;

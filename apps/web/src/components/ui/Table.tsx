interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  onRowMouseEnter?: (row: T) => void;
  onRowMouseLeave?: (row: T) => void;
  keyExtractor: (row: T) => string;
  rowClassName?: (row: T, index: number) => string;
  /** When true, renders stacked cards on mobile instead of a table */
  responsive?: boolean;
}

export default function Table<T>({ columns, data, onRowClick, onRowMouseEnter, onRowMouseLeave, keyExtractor, rowClassName, responsive = false }: TableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.06), 0 1px 2px rgba(26,26,46,0.04)' }}>
      {/* Desktop table — hidden on mobile when responsive */}
      <div className={`overflow-x-auto ${responsive ? 'hidden md:block' : ''}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-neutral-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`h-11 px-5 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                onMouseEnter={() => onRowMouseEnter?.(row)}
                onMouseLeave={() => onRowMouseLeave?.(row)}
                className={`group h-14 border-b border-neutral-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-primary-50/30' : ''} ${rowClassName?.(row, index) ?? ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-5 py-3 ${col.className || ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards — visible only on mobile when responsive */}
      {responsive && (
        <div className="divide-y divide-neutral-100 md:hidden">
          {data.map((row, index) => (
            <div
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className={`space-y-1.5 px-4 py-3 ${onRowClick ? 'cursor-pointer active:bg-primary-50/30' : ''} ${rowClassName?.(row, index) ?? ''}`}
            >
              {columns.map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-2">
                  <span className="shrink-0 text-xs font-medium text-neutral-400 uppercase tracking-wide">
                    {col.header}
                  </span>
                  <span className="text-right text-sm text-neutral-800">
                    {col.render(row)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

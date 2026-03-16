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
  keyExtractor: (row: T) => string;
}

export default function Table<T>({ columns, data, onRowClick, keyExtractor }: TableProps<T>) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.06), 0 1px 2px rgba(26,26,46,0.04)' }}>
      <div className="overflow-x-auto">
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
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={() => onRowClick?.(row)}
                className={`group h-14 border-b border-neutral-100 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-primary-50/30' : ''}`}
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
    </div>
  );
}

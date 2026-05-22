interface ResponseHeadersTableProps {
  headers: Record<string, string>;
}

export function ResponseHeadersTable({ headers }: ResponseHeadersTableProps) {
  const entries = Object.entries(headers);

  if (entries.length === 0) {
    return <div className="text-text-lighter ui-text-sm">No response headers.</div>;
  }

  return (
    <table className="w-full">
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key} className="border-b border-border/30">
            <td className="py-1 pr-4 font-medium ui-text-xs text-text-lighter whitespace-nowrap align-top">
              {key}
            </td>
            <td className="py-1 ui-text-xs text-text break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Bold client name cell. Names are the primary identifier in a row, so they
 * get the strongest weight (per the table UI guide: bold important records).
 */
export function NameCell({ name }: { name: string }): React.JSX.Element {
  return <span className="text-sm font-semibold">{name}</span>
}

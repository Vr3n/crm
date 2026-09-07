import { PersonCell } from '@/components/person/person-cell'

/**
 * Bold client name cell with optional avatar. Names are the primary identifier
 * in a row, so they get the strongest weight (per the table UI guide: bold
 * important records).
 */
export function NameCell({
  name,
  personId
}: {
  name: string
  personId?: number | string
}): React.JSX.Element {
  if (personId) {
    return <PersonCell personId={personId} name={name} />
  }
  return <span className="text-sm font-semibold">{name}</span>
}

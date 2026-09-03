# Excel Export Fixes.

IMPORTANT: Each Money or currency related data should be exported as `Currency` data type for excel.

## Leads Excel Export.

- The `Next Follow-up` and `Last Activity` column doesn't change to the date time column. It is raw timestamp which is confusing to the end user.
- Instead of Created you should name the Column `Aquired`

## Invoice Export.

- `Amount` column should be renamed to `Final Amount`

## Followup export

- Date time isn't formatted properly. Shouldn't show raw timestamp. it should be Date Time data type for excel.

## Customer Export.

- Remove the ID column from the excel export.

## Memberships Export.

- Remove the Customer Id column from the excel export.
- Remove the billing column

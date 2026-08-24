import classes from './admin-date-time.module.css'

export type AdminDateTimeLabels = {
  readonly local: string
  readonly utc: string
}

export type AdminDateTimeProps = {
  readonly labels: AdminDateTimeLabels
  readonly locale: string
  readonly value: string
}

export const AdminDateTime = ({ labels, locale, value }: AdminDateTimeProps) => {
  const date = new Date(value)
  const dateTime = date.toISOString()
  const format = (timeZone?: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      ...(timeZone ? { timeZone } : {}),
    }).format(date)

  return (
    <span className={classes.container}>
      <span>
        {labels.local}:{' '}
        <time className={classes.timestamp} dateTime={dateTime}>
          {format()}
        </time>
      </span>
      <span className={classes.utc}>
        {labels.utc}:{' '}
        <time className={classes.timestamp} dateTime={dateTime}>
          {format('UTC')}
        </time>
      </span>
    </span>
  )
}
/** Display formatting for the viewer's locale and time zone. */
export const formatTimestamp = (instant: string) =>
  new Date(instant).toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

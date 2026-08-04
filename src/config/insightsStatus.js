const information = (label, tone) => Object.freeze({ label, tone })

export const SIGNAL_QUALITIES = Object.freeze({
  EXCELLENT: information('优秀', 'success'),
  GOOD: information('良好', 'success'),
  FAIR: information('一般', 'warning'),
  WEAK: information('较弱', 'danger'),
  POOR: information('很差', 'danger'),
  UNKNOWN: information('未知', 'neutral')
})

export const GEOFENCE_EVENTS = Object.freeze({
  ENTER: information('进入', 'success'),
  EXIT: information('离开', 'warning')
})

function resolve(map, value) {
  const key = value === null || value === undefined
    ? 'UNKNOWN'
    : String(value).toUpperCase()

  return map[key] || information(`未知（${value}）`, 'neutral')
}

export const resolveSignalQuality = (value) => resolve(SIGNAL_QUALITIES, value)
export const resolveGeofenceEvent = (value) => resolve(GEOFENCE_EVENTS, value)

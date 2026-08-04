function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizePosition(position) {
  if (!Array.isArray(position) || position.length < 2) return null

  const longitude = toNumber(position[0])
  const latitude = toNumber(position[1])

  if (
    longitude === null
    || latitude === null
    || longitude < -180
    || longitude > 180
    || latitude < -90
    || latitude > 90
  ) {
    return null
  }

  return [longitude, latitude]
}

function positionFromFields(longitude, latitude) {
  return normalizePosition([longitude, latitude])
}

function normalizeLine(coordinates) {
  return (Array.isArray(coordinates) ? coordinates : [])
    .map(normalizePosition)
    .filter(Boolean)
}

function normalizePolygon(coordinates) {
  const ring = Array.isArray(coordinates?.[0]) ? coordinates[0] : []
  return ring.map(normalizePosition).filter(Boolean)
}

function pointFeature(id, coordinates, options = {}) {
  const position = normalizePosition(coordinates)
  if (!position) return null

  return {
    id,
    type: 'point',
    coordinates: position,
    label: options.label || '',
    tone: options.tone || 'cyan',
    weight: toNumber(options.weight),
    meta: options.meta || null
  }
}

export function trajectoryLayer(data = {}) {
  const line = normalizeLine(data.geometry?.coordinates)
  const points = (Array.isArray(data.points) ? data.points : [])
    .map((item, index) => pointFeature(
      `trajectory-point-${item.locationId ?? index}`,
      positionFromFields(item.longitude, item.latitude),
      {
        label: index === 0 ? '起点' : (index === data.points.length - 1 ? '终点' : ''),
        tone: index === data.points.length - 1 ? 'amber' : 'cyan',
        meta: item
      }
    ))
    .filter(Boolean)

  return {
    coordinateSystem: data.coordinateSystem || 'WGS84',
    features: [
      ...(line.length > 1 ? [{
        id: 'trajectory-line',
        type: 'line',
        coordinates: line,
        tone: 'cyan'
      }] : []),
      ...points
    ]
  }
}

export function stayPointLayer(data = {}) {
  const features = (Array.isArray(data.stayPoints) ? data.stayPoints : [])
    .map((item, index) => pointFeature(
      `stay-${item.sequence ?? index}`,
      item.geometry?.coordinates
        || positionFromFields(item.centerLongitude, item.centerLatitude),
      {
        label: `停留 ${item.sequence ?? index + 1}`,
        tone: 'amber',
        weight: item.pointCount,
        meta: item
      }
    ))
    .filter(Boolean)

  return {
    coordinateSystem: data.coordinateSystem || 'WGS84',
    features
  }
}

export function heatmapLayer(data = {}) {
  const features = (Array.isArray(data.grids) ? data.grids : [])
    .map((item, index) => {
      const coordinates = normalizePolygon(item.geometry?.coordinates)
      if (coordinates.length < 3) return null

      return {
        id: `heat-${item.gridKey || index}`,
        type: 'polygon',
        coordinates,
        label: item.gridKey || '',
        tone: 'heat',
        weight: toNumber(item.weight) ?? 0,
        meta: item
      }
    })
    .filter(Boolean)

  return {
    coordinateSystem: data.coordinateSystem || 'WGS84',
    features
  }
}

export function nodeCoverageLayer(data = {}) {
  const observations = (Array.isArray(data.observations) ? data.observations : [])
    .map((item, index) => pointFeature(
      `coverage-${item.locationId ?? index}`,
      item.geometry?.coordinates
        || positionFromFields(item.longitude, item.latitude),
      {
        label: item.confidenceLevel || '',
        tone: item.confidenceLevel === 'LOW' ? 'amber' : 'cyan',
        weight: item.actualDistanceMeters,
        meta: item
      }
    ))
    .filter(Boolean)

  const node = pointFeature(
    'coverage-node',
    positionFromFields(data.nodeLongitude, data.nodeLatitude),
    { label: data.deviceCode || '节点', tone: 'green' }
  )

  return {
    coordinateSystem: data.coordinateSystem || 'WGS84',
    features: node ? [node, ...observations] : observations
  }
}

export function geofenceLayer(fences = []) {
  return {
    coordinateSystem: fences[0]?.coordinateSystem || 'WGS84',
    features: (Array.isArray(fences) ? fences : [])
      .map((item) => pointFeature(
        `fence-${item.fenceId}`,
        item.geometry?.coordinates
          || positionFromFields(item.centerLongitude, item.centerLatitude),
        {
          label: item.name,
          tone: item.enabled === 1 ? 'green' : 'muted',
          weight: item.radiusMeters,
          meta: item
        }
      ))
      .filter(Boolean)
  }
}

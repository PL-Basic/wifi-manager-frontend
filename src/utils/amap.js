import AMapLoader from '@amap/amap-jsapi-loader'
import {
  AMAP_KEY,
  AMAP_SECURITY_JS_CODE
} from '@/config/runtime'

const AMAP_VERSION = '2.0'
const CONVERSION_BATCH_SIZE = 40

let loaderPromise = null

function configuredAmap() {
  return typeof window !== 'undefined' && window.AMap
}

export function loadAmap() {
  if (configuredAmap()) return Promise.resolve(window.AMap)
  if (loaderPromise) return loaderPromise

  if (!AMAP_KEY || !AMAP_SECURITY_JS_CODE) {
    return Promise.reject(new Error('高德地图服务配置不完整'))
  }

  window._AMapSecurityConfig = {
    securityJsCode: AMAP_SECURITY_JS_CODE
  }

  loaderPromise = AMapLoader.load({
    key: AMAP_KEY,
    version: AMAP_VERSION,
    plugins: []
  }).catch((error) => {
    loaderPromise = null
    throw new Error(error?.message || '高德地图脚本加载失败')
  })

  return loaderPromise
}

function convertedPosition(location) {
  const longitude = Number(location?.getLng?.() ?? location?.lng)
  const latitude = Number(location?.getLat?.() ?? location?.lat)
  return Number.isFinite(longitude) && Number.isFinite(latitude)
    ? [longitude, latitude]
    : null
}

function convertBatch(AMap, positions) {
  return new Promise((resolve, reject) => {
    AMap.convertFrom(positions, 'gps', (status, result) => {
      const locations = Array.isArray(result?.locations)
        ? result.locations
        : result?.locations
          ? [result.locations]
          : []
      const converted = locations.map(convertedPosition)

      if (status !== 'complete' || converted.length !== positions.length || converted.some((item) => !item)) {
        reject(new Error('WGS-84 坐标转换为高德坐标失败'))
        return
      }

      resolve(converted)
    })
  })
}

export async function convertWgs84Positions(AMap, positions) {
  const source = Array.isArray(positions) ? positions : []
  const converted = []

  for (let index = 0; index < source.length; index += CONVERSION_BATCH_SIZE) {
    const batch = source.slice(index, index + CONVERSION_BATCH_SIZE)
    converted.push(...await convertBatch(AMap, batch))
  }

  return converted
}

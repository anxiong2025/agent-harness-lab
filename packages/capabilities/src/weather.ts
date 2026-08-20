type WeatherPayload = {
  current?: {
    temperature_2m?: unknown
    relative_humidity_2m?: unknown
    weather_code?: unknown
    wind_speed_10m?: unknown
  }
  current_units?: {
    temperature_2m?: unknown
    relative_humidity_2m?: unknown
    wind_speed_10m?: unknown
  }
}

/** A tool definition that can be registered by the harness composition root. */
export type HongKongWeatherTool = {
  name: 'get_hong_kong_weather'
  description: string
  parameters: Record<string, never>
  execute(arguments_: Record<string, never>): Promise<string>
}

/** Reads current conditions for Hong Kong from Open-Meteo. */
export class HongKongWeatherClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async current(): Promise<string> {
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.search = new URLSearchParams({
      latitude: '22.3193',
      longitude: '114.1694',
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      timezone: 'Asia/Hong_Kong',
    }).toString()
    const response = await this.fetcher(url)
    if (!response.ok) throw new Error(`Hong Kong weather request failed: ${response.status}`)
    const payload = await response.json() as WeatherPayload
    const current = payload.current
    if (!current || !isFiniteNumber(current.temperature_2m) || !isFiniteNumber(current.relative_humidity_2m)
      || !isFiniteNumber(current.weather_code) || !isFiniteNumber(current.wind_speed_10m)) {
      throw new Error('Hong Kong weather response is missing current conditions')
    }
    const temperatureUnit = unit(payload.current_units?.temperature_2m, '°C')
    const humidityUnit = unit(payload.current_units?.relative_humidity_2m, '%')
    const windUnit = unit(payload.current_units?.wind_speed_10m, 'km/h')
    return `香港当前天气：${describeWeatherCode(current.weather_code)}，气温 ${current.temperature_2m}${temperatureUnit}，湿度 ${current.relative_humidity_2m}${humidityUnit}，风速 ${current.wind_speed_10m} ${windUnit}。`
  }
}

/** Create the complete Hong Kong weather tool without coupling it to a registry. */
export function createHongKongWeatherTool(
  client = new HongKongWeatherClient(),
): HongKongWeatherTool {
  return {
    name: 'get_hong_kong_weather',
    description: 'Read the current weather conditions in Hong Kong from a live weather service.',
    parameters: {},
    async execute() {
      return client.current()
    },
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function unit(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function describeWeatherCode(code: number): string {
  if (code === 0) return '晴'
  if (code <= 3) return '多云'
  if (code === 45 || code === 48) return '有雾'
  if (code >= 51 && code <= 57) return '毛毛雨'
  if (code >= 61 && code <= 67) return '下雨'
  if (code >= 71 && code <= 77) return '下雪'
  if (code >= 80 && code <= 82) return '阵雨'
  if (code >= 95) return '雷雨'
  return '天气状况未知'
}

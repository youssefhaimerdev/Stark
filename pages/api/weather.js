export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  const { city } = req.query
  if (!city) return res.status(400).json({ error: 'City required' })

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
    )
    const geoData = await geoRes.json()

    if (!geoData.results?.length) {
      return res.status(404).json({ error: `Cannot locate "${city}"` })
    }

    const { latitude, longitude, name, country } = geoData.results[0]

    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,humidity_2m&temperature_unit=celsius&windspeed_unit=kmh`
    )
    const wData = await wRes.json()
    const c = wData.current

    const weatherCodes = {
      0: 'clear skies', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
      45: 'foggy', 48: 'depositing rime fog', 51: 'light drizzle', 53: 'moderate drizzle',
      61: 'light rain', 63: 'moderate rain', 65: 'heavy rain',
      71: 'light snow', 73: 'moderate snow', 75: 'heavy snow',
      80: 'rain showers', 81: 'moderate rain showers', 82: 'heavy rain showers',
      95: 'thunderstorm', 96: 'thunderstorm with hail',
    }

    const description = weatherCodes[c.weathercode] ?? 'variable conditions'

    return res.status(200).json({
      city: name,
      country,
      temp: Math.round(c.temperature_2m),
      feelsLike: Math.round(c.apparent_temperature),
      description,
      wind: Math.round(c.windspeed_10m),
      humidity: c.humidity_2m ?? null,
      summary: `${name}, ${country}: ${Math.round(c.temperature_2m)}°C (feels like ${Math.round(c.apparent_temperature)}°C), ${description}, wind ${Math.round(c.windspeed_10m)} km/h`,
    })
  } catch (err) {
    return res.status(500).json({ error: 'Weather service unreachable' })
  }
}

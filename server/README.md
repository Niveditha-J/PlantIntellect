Environment variables

- OPENWEATHER_API_KEY: OpenWeatherMap API key
- PLANTNET_API_KEY: Pl@ntNet API key (for plant identification)
- PORT: Optional. Defaults to 4000

Scripts

- npm run dev: Start server with nodemon
- npm start: Start server with node

Endpoints

- GET /health: Health check
- GET /weather?lat&lon: Current weather (metric) via OpenWeatherMap
- POST /identify { imageBase64 }: Identify plant (Pl@ntNet placeholder)
- POST /suitability { species, lat, lon, weather? }: Rule-based suitability

Data

- data/plants.in.json: India-focused starter dataset (paddy, millets, home garden)



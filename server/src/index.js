import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 4000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';
const PLANTNET_API_KEY = process.env.PLANTNET_API_KEY || '';

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Optional root route for convenience
app.get('/', (_req, res) => {
  res.json({
    message: 'PlantIntellect backend is running',
    endpoints: [
      '/health',
      '/weather?lat=13.0827&lon=80.2707',
      'POST /identify',
      'POST /suitability'
    ]
  });
});

// Weather proxy: GET /weather?lat=..&lon=..
app.get('/weather', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }
  if (!OPENWEATHER_API_KEY) {
    return res.status(500).json({ error: 'OPENWEATHER_API_KEY not configured' });
  }
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const response = await axios.get(url);
    const data = response.data;
    const payload = {
      tempC: data?.main?.temp,
      humidity: data?.main?.humidity,
      weather: data?.weather?.[0]?.main,
      weatherDesc: data?.weather?.[0]?.description,
      windSpeedMs: data?.wind?.speed,
      city: data?.name,
      country: data?.sys?.country
    };
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

// Identify proxy (Pl@ntNet): POST /identify { imageBase64 }
app.post('/identify', async (req, res) => {
  const imageBase64 = req.body?.imageBase64;
  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }
  try {
    if (PLANTNET_API_KEY) {
      // Call Pl@ntNet identify API using built-in fetch/FormData (Node 18+)
      const buffer = Buffer.from(imageBase64, 'base64');
      const form = new FormData();
      const filename = 'image.jpg';
      // Create a Blob from the buffer for FormData
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      form.append('images', blob, filename);
      form.append('organs', 'auto');

      const endpoint = `https://my-api.plantnet.org/v2/identify/all?api-key=${encodeURIComponent(PLANTNET_API_KEY)}`;
      const r = await fetch(endpoint, { method: 'POST', body: form });
      if (!r.ok) return res.status(502).json({ error: 'identify_upstream_error' });
      const data = await r.json();
      const best = Array.isArray(data?.results) && data.results[0];
      const species = best?.species?.scientificName || best?.species?.genus?.scientificName || 'Unknown';
      const commonName = Array.isArray(best?.species?.commonNames) ? best.species.commonNames[0] : undefined;
      const confidence = typeof best?.score === 'number' ? best.score : undefined;
      // Low-confidence guard: treat as unknown if below threshold
      const MIN_SCORE = 0.2;
      if (!confidence || confidence < MIN_SCORE || species === 'Unknown') {
        return res.json({ species: null, commonName: null, confidence: confidence ?? 0, note: 'low_confidence_or_unknown' });
      }
      return res.json({ species, commonName, confidence });
    }

    // No API key: cannot identify reliably
    res.json({ species: null, commonName: null, confidence: 0, note: 'no_api_key' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to identify plant' });
  }
});

// Suitability: POST /suitability { species, lat, lon, weather? }
app.post('/suitability', async (req, res) => {
  const { species, lat, lon, weather } = req.body || {};
  if (!species) return res.status(400).json({ error: 'species is required' });

  let current = weather;
  if (!current && lat && lon) {
    try {
      const url = `http://localhost:${PORT}/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      const r = await axios.get(url);
      current = r.data;
    } catch (e) {
      return res.status(500).json({ error: 'Could not load weather for suitability' });
    }
  }

  // Rules enriched with dataset and Indian sowing windows
  const temp = current?.tempC;
  const humidity = current?.humidity;
  const rules = getPlantRequirements(species) || basicRulesForSpecies(species);
  const reasons = [];

  let suitable = true;
  if (typeof temp === 'number') {
    if (rules.tempMinC !== undefined && temp < rules.tempMinC) {
      suitable = false; reasons.push('Temperature is below optimal range');
    }
    if (rules.tempMaxC !== undefined && temp > rules.tempMaxC) {
      suitable = false; reasons.push('Temperature is above optimal range');
    }
  }
  if (typeof humidity === 'number' && rules.humidityMin !== undefined && rules.humidityMax !== undefined) {
    if (humidity < rules.humidityMin || humidity > rules.humidityMax) {
      suitable = false; reasons.push('Humidity outside ideal range');
    }
  }

  // Month-based sowing window check
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  let regionKey = 'india_kharif';
  if (typeof lat === 'number') {
    // Rough split: South India if lat < 16
    regionKey = lat < 16 ? 'india_south' : 'india_north';
  }
  const monthOk = isMonthSuitable(rules?.sowingMonthsByRegion, regionKey, month);
  if (monthOk === false) {
    suitable = false;
    reasons.push('Not in recommended sowing window for your region');
  }

  const advice = [];
  if (!suitable) {
    if (temp !== undefined) {
      advice.push(`Aim for ${rules.tempMinC ?? '?'}-${rules.tempMaxC ?? '?'} °C`);
    }
    if (rules.soil) advice.push(`Soil: ${rules.soil}`);
    if (rules.sunlight) advice.push(`Sunlight: ${rules.sunlight}`);
    if (monthOk === false) advice.push('Consider waiting until the local sowing window opens');
  }

  res.json({ suitableNow: suitable, reasons, advice, weather: current, species });
});

// Note: Express v5 treats '*' differently; rely on explicit '/' route above.

function basicRulesForSpecies(species) {
  const s = (species || '').toLowerCase();
  if (s.includes('oryza') || s.includes('rice') || s.includes('paddy')) {
    return { tempMinC: 20, tempMaxC: 35, humidityMin: 50, humidityMax: 90, soil: 'Clay loam, good water retention', sunlight: 'Full sun' };
  }
  if (s.includes('millet') || s.includes('sorghum') || s.includes('bajra') || s.includes('ragi')) {
    return { tempMinC: 22, tempMaxC: 38, humidityMin: 30, humidityMax: 70, soil: 'Well-drained loam/sandy loam', sunlight: 'Full sun' };
  }
  return { tempMinC: 18, tempMaxC: 32, humidityMin: 30, humidityMax: 80, soil: 'Well-drained', sunlight: 'Full sun to partial shade' };
}

function getPlantRequirements(species) {
  try {
    const dataPath = path.join(process.cwd(), 'server', 'data', 'plants.in.json');
    const content = fs.readFileSync(dataPath, 'utf-8');
    const json = JSON.parse(content);
    const s = (species || '').toLowerCase();
    const match = json.plants.find(p => {
      return (
        (p.scientificName && p.scientificName.toLowerCase().includes(s)) ||
        (p.commonName && p.commonName.toLowerCase().includes(s)) ||
        (p.id && s.includes(p.id.replace(/_/g, ' ')))
      );
    });
    return match || null;
  } catch (e) {
    return null;
  }
}

function isMonthSuitable(sowingByRegion, regionKey, month) {
  if (!sowingByRegion) return undefined;
  const all = Object.values(sowingByRegion).some(arr => Array.isArray(arr) && arr.includes(month));
  const regionArr = sowingByRegion[regionKey];
  if (Array.isArray(regionArr)) return regionArr.includes(month);
  return all ? true : undefined;
}

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});



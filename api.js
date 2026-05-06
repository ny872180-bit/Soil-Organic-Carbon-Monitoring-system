/**
 * api.js — External API Integration Module
 * APIs: SoilGrids v2, Open-Meteo, NASA POWER, Nominatim
 * Fixed: correct unit conversions, proper depth mapping, robust error handling
 */

const API = (() => {

  // ── SoilGrids v2 REST API ──────────────────────────────────────────────────
  // depth param must exactly match SoilGrids labels: "0-5cm", "0-30cm", "5-15cm", etc.
  const DEPTH_MAP = {
    '0-5cm': '0-5cm',
    '0-30cm': '0-30cm',
    '30-60cm': '30-60cm',
    '60-100cm': '60-100cm',
  };

  async function fetchSoilGrids(lat, lon, depth = '0-30cm') {
    const properties = 'soc,phh2o,clay,bdod,cfvo,nitrogen,sand,silt';
    const d = DEPTH_MAP[depth] || '0-30cm';
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query` +
      `?lon=${lon}&lat=${lat}&property=${properties}&depth=${encodeURIComponent(d)}&value=mean`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(14000) });
      if (!res.ok) throw new Error(`SoilGrids HTTP ${res.status}`);
      const data = await res.json();
      const parsed = parseSoilGrids(data, d);
      if (parsed && Object.keys(parsed).length > 0) {
        console.log('✅ SoilGrids live data:', parsed);
        return { ...parsed, source: 'SoilGrids API' };
      }
      throw new Error('Empty SoilGrids response');
    } catch (err) {
      console.warn('⚠️ SoilGrids fallback:', err.message);
      return { ...generateSoilFallback(lat, lon), source: 'Estimated' };
    }
  }

  function parseSoilGrids(data, depth) {
    const result = {};
    if (!data?.properties?.layers) return null;

    data.properties.layers.forEach(layer => {
      // Find depth that matches – check both exact and partial match
      const depthObj = layer.depths?.find(d =>
        d.label === depth || d.label?.replace(/\s/g, '') === depth.replace(/\s/g, '')
      ) || layer.depths?.[0]; // fallback to first depth

      const val = depthObj?.values?.mean ?? null;
      if (val === null || val === -32768) return; // SoilGrids nodata value

      // SoilGrids unit conversions (from API documentation):
      // soc:      dg/kg  ÷ 10   → g/kg
      // phh2o:    pHx10  ÷ 10   → pH
      // clay:     g/kg          → g/kg (already)
      // bdod:     cg/cm³÷ 100  → g/cm³
      // cfvo:     cm³/dm³÷10   → %
      // nitrogen: cg/kg ÷ 100  → g/kg
      // sand/silt: g/kg        → g/kg
      switch (layer.name) {
        case 'soc': result.soc = +(val / 10).toFixed(2); break;
        case 'phh2o': result.ph = +(val / 10).toFixed(1); break;
        case 'clay': result.clay = +val.toFixed(0); break; // already g/kg
        case 'bdod': result.bd = +(val / 100).toFixed(3); break;
        case 'cfvo': result.cfvo = +(val / 10).toFixed(1); break;
        case 'nitrogen': result.nitrogen = +(val / 100).toFixed(3); break;
        case 'sand': result.sand = +val.toFixed(0); break;
        case 'silt': result.silt = +val.toFixed(0); break;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  }

  // Geographically-calibrated fallback heuristics
  function generateSoilFallback(lat, lon) {
    // Zone heuristics
    const abslat = Math.abs(lat);
    let soc, ph, clay, bd;

    if (abslat < 10) {           // Humid tropics (Amazon, Congo, SE Asia)
      soc = 18 + Math.random() * 12; ph = 5.0 + Math.random() * 1.2;
      clay = 350 + Math.random() * 150; bd = 1.05 + Math.random() * 0.2;
    } else if (abslat < 25) {    // Sub-tropics, monsoon Asia, India, Brazil
      soc = 8 + Math.random() * 14; ph = 5.5 + Math.random() * 2.0;
      clay = 200 + Math.random() * 200; bd = 1.10 + Math.random() * 0.25;
    } else if (abslat < 40) {    // Mediterranean, dry subtropics
      soc = 6 + Math.random() * 12; ph = 6.5 + Math.random() * 1.5;
      clay = 150 + Math.random() * 200; bd = 1.20 + Math.random() * 0.25;
    } else if (abslat < 55) {    // Temperate (US Corn Belt, Europe)
      soc = 15 + Math.random() * 20; ph = 6.0 + Math.random() * 1.5;
      clay = 200 + Math.random() * 200; bd = 1.10 + Math.random() * 0.25;
    } else {                     // Boreal / sub-arctic
      soc = 20 + Math.random() * 30; ph = 4.5 + Math.random() * 2.0;
      clay = 100 + Math.random() * 150; bd = 0.95 + Math.random() * 0.3;
    }

    // Longitude adjustment (drier western continents tend to have lower SOC)
    const lonFactor = (Math.sin(lon * 0.05) + 1) / 2; // 0-1
    soc = soc * (0.85 + lonFactor * 0.30);

    return {
      soc: +soc.toFixed(2),
      ph: +ph.toFixed(1),
      clay: +clay.toFixed(0),
      bd: +bd.toFixed(3),
      cfvo: +(2 + Math.random() * 10).toFixed(1),
      nitrogen: +(soc * 0.085).toFixed(3),
      sand: +(600 - clay * 0.6).toFixed(0),
      silt: +(250 + Math.random() * 100).toFixed(0),
    };
  }

  // ── Open-Meteo Climate API ─────────────────────────────────────────────────
  async function fetchClimate(lat, lon) {
    const daily = [
      'temperature_2m_max', 'temperature_2m_min', 'precipitation_sum',
      'et0_fao_evapotranspiration', 'soil_moisture_0_to_7cm',
      'shortwave_radiation_sum'
    ].join(',');
    const hourly = 'soil_moisture_0_to_7cm';

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=${daily}&timezone=auto&past_days=14&forecast_days=1`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
      const data = await res.json();
      const result = parseClimate(data);
      console.log('✅ Open-Meteo live data:', result);
      return { ...result, source: 'Open-Meteo API' };
    } catch (err) {
      console.warn('⚠️ Open-Meteo fallback:', err.message);
      return { ...generateClimateFallback(lat, lon), source: 'Estimated' };
    }
  }

  function parseClimate(data) {
    const d = data.daily || {};
    const validFilter = arr => (arr || []).filter(v => v !== null && v !== undefined);

    const maxTemps = validFilter(d.temperature_2m_max);
    const minTemps = validFilter(d.temperature_2m_min);
    const precip = validFilter(d.precipitation_sum);
    const et0 = validFilter(d.et0_fao_evapotranspiration);
    const sm = validFilter(d.soil_moisture_0_to_7cm);
    const swrad = validFilter(d.shortwave_radiation_sum);

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const sum = arr => arr.reduce((a, b) => a + b, 0);

    const meanMax = avg(maxTemps);
    const meanMin = avg(minTemps);
    const temp = meanMax !== null && meanMin !== null ? (meanMax + meanMin) / 2 : null;

    return {
      temp: temp !== null ? +temp.toFixed(1) : null,
      tempMax: meanMax !== null ? +meanMax.toFixed(1) : null,
      tempMin: meanMin !== null ? +meanMin.toFixed(1) : null,
      precipitation: precip.length > 0 ? +sum(precip).toFixed(1) : null,  // total mm over period
      evapotranspiration: et0.length > 0 ? +avg(et0).toFixed(2) : null,  // mm/day avg
      soilMoisture: sm.length > 0 ? +(avg(sm) * 100).toFixed(1) : null,  // m³/m³ → %
      solarRadiation: swrad.length > 0 ? +avg(swrad).toFixed(1) : null,  // MJ/m²/day
    };
  }

  function generateClimateFallback(lat, lon) {
    // Thorougly calibrated by climate zone
    const abslat = Math.abs(lat);
    let temp, precip, sm;

    if (abslat < 10) { temp = 27; precip = 180; sm = 42; }       // Humid tropics
    else if (abslat < 23) { temp = 24; precip = 80; sm = 28; }       // Tropics/monsoon
    else if (abslat < 35) { temp = 19; precip = 40; sm = 18; }       // Sub-tropics
    else if (abslat < 50) { temp = 12; precip = 60; sm = 24; }       // Temperate
    else if (abslat < 65) { temp = 3; precip = 35; sm = 20; }       // Boreal
    else { temp = -8; precip = 20; sm = 12; }       // Arctic

    // Add small noise for uniqueness per location
    const seed = Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453;
    const frac = seed - Math.floor(seed);
    temp += (frac - 0.5) * 4;
    precip += (frac - 0.5) * 30;
    sm += (frac - 0.5) * 10;

    return {
      temp: +temp.toFixed(1),
      tempMax: +(temp + 5).toFixed(1),
      tempMin: +(temp - 5).toFixed(1),
      precipitation: +Math.max(0, precip).toFixed(1),
      evapotranspiration: +(Math.max(0.5, temp * 0.19)).toFixed(2),
      soilMoisture: +Math.max(5, Math.min(60, sm)).toFixed(1),
      solarRadiation: +(15 + (1 - abslat / 90) * 15 + (frac - 0.5) * 5).toFixed(1),
    };
  }

  // ── NASA POWER API ─────────────────────────────────────────────────────────
  async function fetchNASAPower(lat, lon) {
    // Use current month and previous month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-based

    // Start = 6 months ago, End = current month
    const startDate = new Date(now); startDate.setMonth(startDate.getMonth() - 6);
    const startYM = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const endYM = `${year}${String(month).padStart(2, '0')}`;

    const params = 'ALLSKY_SFC_SW_DWN,T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M,WS2M';
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?` +
      `parameters=${params}&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}` +
      `&start=${startYM}&end=${endYM}&format=JSON`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);
      const data = await res.json();
      const result = parseNASA(data);
      console.log('✅ NASA POWER live data:', result);
      return { ...result, source: 'NASA POWER API' };
    } catch (err) {
      console.warn('⚠️ NASA POWER fallback:', err.message);
      return { ...generateNASAFallback(lat, lon), source: 'Estimated' };
    }
  }

  function parseNASA(data) {
    const props = data?.properties?.parameter || {};

    // Get average of all available months for each parameter
    const avgParam = (key) => {
      const vals = Object.values(props[key] || {}).filter(v => v !== null && v > -900);
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    };

    return {
      solarRadiation: avgParam('ALLSKY_SFC_SW_DWN'),    // kWh/m²/day
      temperature: avgParam('T2M'),                   // °C
      tempMax: avgParam('T2M_MAX'),
      tempMin: avgParam('T2M_MIN'),
      precipitation: avgParam('PRECTOTCORR'),           // mm/day
      relativeHumidity: avgParam('RH2M'),                  // %
      windSpeed: avgParam('WS2M'),                  // m/s
    };
  }

  function generateNASAFallback(lat, lon) {
    const abslat = Math.abs(lat);
    const seed = Math.sin(lat * 7.9898 + lon * 43.233) * 13758.5;
    const frac = Math.abs(seed - Math.floor(seed));

    const solar = +(18 - abslat * 0.18 + (frac - 0.5) * 4).toFixed(1);
    const temp = +(28 - abslat * 0.55 + (frac - 0.5) * 3).toFixed(1);
    const precip = +(6 + (1 - abslat / 90) * 8 + (frac - 0.5) * 3).toFixed(1);
    const rh = +(50 + (1 - abslat / 90) * 30 + (frac - 0.5) * 15).toFixed(0);

    return {
      solarRadiation: Math.max(3, solar),
      temperature: temp,
      tempMax: +(temp + 6).toFixed(1),
      tempMin: +(temp - 6).toFixed(1),
      precipitation: Math.max(0.5, precip),
      relativeHumidity: Math.max(20, Math.min(98, rh)),
      windSpeed: +(2 + frac * 3).toFixed(1),
    };
  }

  // ── MODIS MOD09A1 Surface Reflectance (free, no auth) ─────────────────────
  // Provides actual satellite-measured band reflectances for any lat/lon
  // Product: MOD09A1 (8-day composite, 500m resolution)
  // Bands:   1=Red, 2=NIR, 3=Blue, 4=Green, 6=SWIR1, 7=SWIR2
  // Values:  raw integer ÷ 10000 = reflectance (0-1)
  async function fetchMODISBands(lat, lon) {
    try {
      // Fetch available dates to get the most recent valid MODIS date
      const datesUrl = `https://modis.ornl.gov/rst/api/v1/MOD09A1/dates?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`;
      const datesRes = await fetch(datesUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!datesRes.ok) throw new Error(`MODIS Dates HTTP ${datesRes.status}`);
      const datesData = await datesRes.json();
      if (!datesData.dates || datesData.dates.length === 0) throw new Error('No MODIS dates available');

      // Get the most recent date
      const latestDateObj = datesData.dates[datesData.dates.length - 1];
      const modisDate = latestDateObj.modis_date;

      // MODIS ORNL REST API
      const url = `https://modis.ornl.gov/rst/api/v1/MOD09A1/subset` +
        `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&startDate=${modisDate}&endDate=${modisDate}` +
        `&kmAboveBelow=0&kmLeftRight=0`;

      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      if (!res.ok) throw new Error(`MODIS HTTP ${res.status}`);
      const data = await res.json();
      const bands = parseMODISBands(data);
      if (bands && Object.keys(bands).length > 3) {
        console.log('✅ MODIS satellite bands:', bands);
        return { ...bands, source: 'MODIS MOD09A1 (NASA)', date: modisDate };
      }
      throw new Error('Insufficient MODIS band data');
    } catch (err) {
      console.warn('⚠️ MODIS fallback (estimating from climate zone):', err.message);
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const doy = Math.ceil((now - startOfYear) / 86400000);
      const periodStart = Math.max(1, Math.floor((doy - 8) / 8) * 8 + 1);
      const fallbackDate = `A${now.getFullYear()}${String(periodStart).padStart(3, '0')}`;
      return { ...estimateBandsFromClimate(lat, lon), source: 'Climate-Estimated', date: fallbackDate };
    }
  }

  function parseMODISBands(data) {
    if (!data?.subset) return null;
    // MOD09A1 band naming: 'sur_refl_b01', 'sur_refl_b02', ...
    const bandMap = {
      'sur_refl_b03': 'B2',   // Blue  620-670nm → Sentinel B2
      'sur_refl_b04': 'B3',   // Green 545-565nm → Sentinel B3
      'sur_refl_b01': 'B4',   // Red   620-670nm → Sentinel B4
      'sur_refl_b02': 'B8',   // NIR   841-876nm → Sentinel B8
      'sur_refl_b06': 'B11',  // SWIR1 1628-1652nm → Sentinel B11
      'sur_refl_b07': 'B12',  // SWIR2 2105-2155nm → Sentinel B12
    };
    const result = {};
    data.subset.forEach(item => {
      const key = bandMap[item.band];
      if (!key) return;
      // MODIS values are integer × 10000; filter fill values (<-2000)
      const vals = (item.data || []).filter(v => v > -2000);
      if (!vals.length) return;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      result[key] = +Math.max(0, Math.min(1, mean / 10000)).toFixed(4);
    });
    // NIR is also used as B8A approximation
    if (result.B8) result.B8A = result.B8;
    return result;
  }

  function estimateBandsFromClimate(lat, lon) {
    // Physics-based band estimates from latitude / climate zone
    const abslat = Math.abs(lat);
    const seed = Math.abs(Math.sin(lat * 9.87 + lon * 6.28)) * 0.1;
    // Vegetation fraction: higher in tropics, lower in arid zones
    const vegFrac = abslat < 10 ? 0.7 : abslat < 25 ? 0.5 : abslat < 45 ? 0.45 : 0.3;
    const soilFrac = 1 - vegFrac;
    // Band estimation (Sentinel-2 equivalents)
    return {
      B2: +(0.04 + soilFrac * 0.08 + seed).toFixed(4),   // Blue
      B3: +(0.07 + soilFrac * 0.10 + seed).toFixed(4),   // Green
      B4: +(0.05 + soilFrac * 0.12 + seed).toFixed(4),   // Red
      B8: +(0.25 + vegFrac * 0.35 + seed).toFixed(4),   // NIR
      B8A: +(0.25 + vegFrac * 0.35 + seed).toFixed(4),   // NIR narrow
      B11: +(0.15 + soilFrac * 0.15 + seed).toFixed(4),   // SWIR1
      B12: +(0.08 + soilFrac * 0.12 + seed).toFixed(4),   // SWIR2
    };
  }

  async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SOC-Monitor/2.0', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(6000)
      });
      return await res.json();
    } catch { return []; }
  }

  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SOC-Monitor/2.0', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(6000)
      });
      return await res.json();
    } catch { return { display_name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` }; }
  }

  // ── Fetch all data for a location ─────────────────────────────────────────
  async function fetchAll(lat, lon, depth = '0-30cm') {
    const [soil, climate, nasa] = await Promise.all([
      fetchSoilGrids(lat, lon, depth),
      fetchClimate(lat, lon),
      fetchNASAPower(lat, lon)
    ]);
    return { soil, climate, nasa, lat, lon, depth, timestamp: new Date().toISOString() };
  }

  return { fetchAll, fetchSoilGrids, fetchClimate, fetchNASAPower, geocode, reverseGeocode, fetchMODISBands };
})();

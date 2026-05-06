/**
 * app.js — Main Application Controller
 * SOC Carbon Intelligence Platform v2.1
 */

// ── Application State ──────────────────────────────────────────────────────
const AppState = {
    currentPage: 'dashboard',
    defaultLat: 20.5937,
    defaultLon: 78.9629,
    currentResult: null,
};

// ── Initialisation ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupTopbarSearch();
    setupTimeDisplay();
    setupFieldMap();
    setupAnalysisPickerMap();
    setupAnalysisPanel();
    setupRemoteSensingPanel();
    loadDashboardLive(AppState.defaultLat, AppState.defaultLon);
    initReportsPage();
});

// ── Time Display ────────────────────────────────────────────────────────────
function setupTimeDisplay() {
    const el = document.getElementById('timeDisplay');
    if (!el) return;
    const update = () => {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) +
            ' · ' + now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    update();
    setInterval(update, 30000);
}

// ── Field Map Init ──────────────────────────────────────────────────────────
function setupFieldMap() {
    // defer init until the page is first shown (Leaflet needs visible container)
    let initialized = false;
    const tryInit = () => {
        if (initialized) return;
        const el = document.getElementById('mainMap');
        if (el && el.offsetWidth > 0) {
            try {
                window.mainMap = MapModule.init('mainMap', [AppState.defaultLat, AppState.defaultLon], 5);
                initialized = true;
            } catch (e) { console.warn('MapModule init error:', e); }
        }
    };
    // Try on nav to fieldmap
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if ((item.dataset.section || item.dataset.page) === 'fieldmap') {
                setTimeout(tryInit, 300);
            }
        });
    });
}



// ── Navigation ─────────────────────────────────────────────────────────────
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section || item.dataset.page;
            if (!section) return;
            navigateTo(section);  // section names match page ids exactly
        });
    });
}

function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');
    // HTML uses data-section; match by section name
    const navItem = document.querySelector(`.nav-item[data-section="${pageId}"]`);
    if (navItem) navItem.classList.add('active');
    AppState.currentPage = pageId;

    // Invalidate Leaflet maps when navigating to map pages
    if (pageId === 'fieldmap') {
        setTimeout(() => window.mainMap && window.mainMap.invalidateSize(), 200);
    }
    if (pageId === 'analysis') {
        setTimeout(() => { pickerMap && pickerMap.invalidateSize(); }, 200);
    }
}

// ── Topbar Search ──────────────────────────────────────────────────────────
function setupTopbarSearch() {
    const input = document.getElementById('locationSearch') || document.getElementById('globalSearch');
    const results = document.getElementById('searchResults') || document.getElementById('globalResults');
    if (!input) return;

    input.addEventListener('input', debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) { results.classList.add('hidden'); return; }
        const data = await API.geocode(q);
        results.innerHTML = data.slice(0, 5).map(r =>
            `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}">${r.display_name}</div>`
        ).join('');
        results.classList.remove('hidden');
    }, 350));

    results.addEventListener('click', e => {
        const item = e.target.closest('.search-result-item');
        if (!item) return;
        const lat = +item.dataset.lat;
        const lon = +item.dataset.lon;
        input.value = item.textContent;
        results.classList.add('hidden');
        AppState.defaultLat = lat;
        AppState.defaultLon = lon;
        loadDashboardLive(lat, lon);
        if (window.mainMap) {
            window.mainMap.setView([lat, lon], 10, { animate: true });
            window.mainMarker && window.mainMarker.setLatLng([lat, lon]);
        }
    });

    document.addEventListener('click', e => {
        if (!results.contains(e.target) && e.target !== input) results.classList.add('hidden');
    });
}

// ── Dashboard Data Loading ─────────────────────────────────────────────────
async function loadDashboardLive(lat, lon) {
    showDashboardSpinner();
    try {
        const [apiData, geoResult] = await Promise.all([
            API.fetchAll(lat, lon, '0-30cm'),
            API.reverseGeocode(lat, lon)
        ]);
        await renderDashboard(apiData);
        updateDashboardLocation(lat, lon, geoResult, apiData.soil?.source);
    } catch (err) {
        console.error('Dashboard load error:', err);
        await renderDashboard(null);
        updateDashboardLocation(lat, lon, null, 'Estimated');
    }
}

function updateDashboardLocation(lat, lon, geoResult, source) {
    const el = document.getElementById('dashLocationText');
    if (!el) return;

    let place = null;
    if (geoResult?.address) {
        const a = geoResult.address;
        place = [a.village || a.town || a.city || a.county, a.state, a.country]
            .filter(Boolean).slice(0, 2).join(', ');
    } else if (geoResult?.display_name) {
        const parts = geoResult.display_name.split(',');
        place = parts.slice(0, 2).join(',').trim();
    }

    const coordStr = formatCoord(lat, lon);
    const srcIcon = (source === 'SoilGrids API') ? '📡' : '⚡';
    const srcLabel = (source === 'SoilGrids API') ? 'Live SoilGrids' : 'Estimated';

    el.textContent = place
        ? `${place} (${coordStr}) · ${srcIcon} ${srcLabel}`
        : `${coordStr} · ${srcIcon} ${srcLabel}`;
}

function showDashboardSpinner() {
    const grid = document.getElementById('kpiGrid');
    if (grid) grid.innerHTML = `
      <div class="loading-state" style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:12px;padding:32px">
        <div class="loader-orbit" style="width:32px;height:32px"></div>
        <span style="color:rgba(240,253,244,0.55)">Loading live data…</span>
      </div>`;
}

async function renderDashboard(apiData) {
    const soil = apiData?.soil || {};
    const climate = apiData?.climate || {};
    const nasa = apiData?.nasa || {};

    const ml = await MLEngine.runFullAsync({ soil, climate, nasa });

    // Compute trend: month-on-month change vs previous value
    const trendRecords = MLEngine.generateMonthlyTrend(ml.soc, 13);
    const trendPct = trendRecords.length >= 2
        ? +((trendRecords[trendRecords.length - 1].soc - trendRecords[trendRecords.length - 2].soc)
            / Math.max(trendRecords[trendRecords.length - 2].soc, 0.1) * 100).toFixed(1)
        : 0;
    ml.trend = trendPct;

    // Render KPI cards
    restoreKpiGrid(ml, soil, climate);

    // ── SOC Trend chart ────────────────────────────────────────────────────
    const trendLabels = trendRecords.map(r => r.date);
    const trendData = trendRecords.map(r => r.soc);
    const trendChartInstance = Charts.initSocTrend(trendLabels, trendData);

    // Wire up filter buttons
    const filterBtns = document.querySelectorAll('.chart-controls .chip');
    filterBtns.forEach(btn => {
        // Clone and replace to avoid duplicate listeners on re-render
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', (e) => {
            document.querySelectorAll('.chart-controls .chip').forEach(c => c.classList.remove('active'));
            newBtn.classList.add('active');

            const range = parseInt(newBtn.dataset.range, 10) || 12; // 6m, 12m, 24m
            const newRecords = MLEngine.generateMonthlyTrend(ml.soc, range + 1); // +1 because trend calc uses n-1

            const newLabels = newRecords.map(r => r.date);
            const newData = newRecords.map(r => r.soc);

            // Update the chart header title
            const headerTitle = newBtn.closest('.chart-header').querySelector('h3');
            if (headerTitle) {
                headerTitle.innerHTML = `SOC Trend Analysis (${range}-Month)`;
            }

            // Update the existing chart instance
            if (trendChartInstance && trendChartInstance.data) {
                trendChartInstance.data.labels = newLabels;
                trendChartInstance.data.datasets[0].data = newData;
                trendChartInstance.update();
            } else {
                Charts.initSocTrend(newLabels, newData);
            }
        });
    });

    // ── Soil Radar ─────────────────────────────────────────────────────────
    Charts.initSoilRadar(soil);

    // ── Carbon Stock by depth ──────────────────────────────────────────────
    const depthLabels = ['0-5cm', '5-15cm', '0-30cm', '30-60cm'];
    const bdVal = soil.bd ?? 1.3;
    const cfVal = soil.cfvo ?? 5;
    const socBase = soil.soc ?? ml.soc;
    const carbonByDepth = [
        MLEngine.calcCarbonStock(socBase * 1.35, bdVal, 5, cfVal),
        MLEngine.calcCarbonStock(socBase * 1.10, bdVal, 10, cfVal),
        MLEngine.calcCarbonStock(socBase, bdVal, 30, cfVal),
        MLEngine.calcCarbonStock(socBase * 0.60, bdVal, 30, cfVal),
    ];
    Charts.initCarbonStock(depthLabels, carbonByDepth);

    // ── Climate Correlation scatter ────────────────────────────────────────
    const precip = climate.precipitation ?? nasa.precipitation ?? 0;
    const socVal = ml.soc;
    // Generate 12 plausible scatter points around observed values
    const scatterData = Array.from({ length: 12 }, (_, i) => {
        const seed = Math.sin(i * 7.93 + (AppState.defaultLat || 20) * 0.1) * 0.5 + 0.5;
        return {
            x: +(precip * (0.7 + seed * 0.6)).toFixed(1),
            y: +(socVal * (0.8 + seed * 0.4)).toFixed(2),
        };
    });
    Charts.initClimateCorrelation(scatterData);

    // ── NDVI Monthly Bar ───────────────────────────────────────────────────
    const ndviTrend = MLEngine.generateNDVITrend(12);
    const now = new Date();
    const ndviLabels = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now); d.setMonth(d.getMonth() - 11 + i);
        return d.toLocaleDateString('en', { month: 'short' });
    });
    Charts.initNDVIBar(ndviLabels, ndviTrend);

    AppState.currentResult = { data: apiData, ml };
}

function restoreKpiGrid(ml, soil, climate) {
    const kpiGrid = document.getElementById('kpiGrid');
    if (!kpiGrid) return;

    let srcBadge = '';
    if (ml.source === 'Advanced ML (XGBoost)') {
        srcBadge = `<span class="kpi-src-badge live" style="background:rgba(168,85,247,0.15);color:#c084fc;border-color:rgba(168,85,247,0.3)"><i class="fa-solid fa-brain"></i> XGBoost AI</span>`;
    } else {
        srcBadge = ml.source === 'SoilGrids API'
            ? `<span class="kpi-src-badge live">📡 Live</span>`
            : `<span class="kpi-src-badge est">⚡ Est.</span>`;
    }

    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-wrap green"><i class="fa-solid fa-seedling fa-lg"></i></div>
          ${srcBadge}
        </div>
        <div class="kpi-label">AVG SOC CONTENT</div>
        <div class="kpi-value">${ml.soc} <span class="kpi-unit">g/kg</span></div>
        <div class="kpi-trend ${ml.trend > 0 ? 'up' : ml.trend < 0 ? 'down' : 'neutral'}">
          <i class="fa-solid fa-arrow-${ml.trend > 0 ? 'up' : ml.trend < 0 ? 'down' : 'right'}"></i>
          ${Math.abs(ml.trend).toFixed(1)}% MoM
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-wrap blue"><i class="fa-solid fa-database fa-lg"></i></div>
          ${srcBadge}
        </div>
        <div class="kpi-label">CARBON STOCK</div>
        <div class="kpi-value">${ml.carbonStock} <span class="kpi-unit">t C/ha</span></div>
        <div class="kpi-trend neutral">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-wrap amber"><i class="fa-solid fa-sun fa-lg"></i></div>
          <span class="kpi-src-badge est">⚡ Est.</span>
        </div>
        <div class="kpi-label">NDVI INDEX</div>
        <div class="kpi-value">${ml.indices?.NDVI ?? '—'} <span class="kpi-unit">index</span></div>
        <div class="kpi-trend neutral">—</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top">
          <div class="kpi-icon-wrap purple"><i class="fa-solid fa-leaf fa-lg"></i></div>
          ${srcBadge}
        </div>
        <div class="kpi-label">SEQUESTRATION RATE</div>
        <div class="kpi-value">${typeof ml.sequestration === 'object' ? (ml.sequestration.co2_rate ?? '—') : (ml.sequestration ?? '—')} <span class="kpi-unit">t CO₂/ha/yr</span></div>
        <div class="kpi-trend neutral">—</div>
      </div>`;
}

// ── Analysis Picker Map ────────────────────────────────────────────────────
let pickerMap = null;
let pickerMarker = null;

function setupAnalysisPickerMap() {
    const el = document.getElementById('anaPickerMap');
    if (!el) return;

    pickerMap = L.map('anaPickerMap', {
        center: [AppState.defaultLat, AppState.defaultLon],
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
    });

    // Satellite tile layer
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'ESRI World Imagery',
        maxZoom: 18,
    }).addTo(pickerMap);

    // Labels overlay
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 18, opacity: 0.7
    }).addTo(pickerMap);

    const greenIcon = L.divIcon({
        className: '',
        html: '<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:3px solid #fff;box-shadow:0 2px 8px rgba(34,197,94,0.5)"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });

    pickerMarker = L.marker([AppState.defaultLat, AppState.defaultLon], {
        draggable: true,
        icon: greenIcon,
    }).addTo(pickerMap);

    const updatePickerCoords = (lat, lon) => {
        const latStr = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
        document.getElementById('anaLat').value = lat.toFixed(6);
        document.getElementById('anaLon').value = lon.toFixed(6);
        document.getElementById('coordText').textContent = `${latStr}, ${lonStr}`;
    };

    pickerMap.on('click', (e) => {
        const { lat, lng } = e.latlng;
        pickerMarker.setLatLng([lat, lng]);
        updatePickerCoords(lat, lng);
        const hint = document.getElementById('anaMapHint');
        if (hint) hint.style.display = 'none';
    });

    pickerMarker.on('dragend', (e) => {
        const { lat, lng } = e.target.getLatLng();
        updatePickerCoords(lat, lng);
        const hint = document.getElementById('anaMapHint');
        if (hint) hint.style.display = 'none';
    });

    // Search inside the analysis panel
    const searchInput = document.getElementById('anaSearch');
    const searchResults = document.getElementById('anaSearchResults');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(async () => {
            const q = searchInput.value.trim();
            if (q.length < 2) { searchResults.classList.add('hidden'); return; }
            const data = await API.geocode(q);
            searchResults.innerHTML = data.slice(0, 5).map(r =>
                `<div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}">${r.display_name}</div>`
            ).join('');
            searchResults.classList.remove('hidden');
        }, 350));

        searchResults.addEventListener('click', e => {
            const item = e.target.closest('.search-result-item');
            if (!item) return;
            panPickerTo(+item.dataset.lat, +item.dataset.lon);
            searchInput.value = item.textContent;
            searchResults.classList.add('hidden');
        });

        document.addEventListener('click', e => {
            if (!searchResults.contains(e.target) && e.target !== searchInput) searchResults.classList.add('hidden');
        });
    }
}

function panPickerTo(lat, lon) {
    if (!pickerMap) return;
    pickerMap.setView([lat, lon], 10, { animate: true });
    pickerMarker.setLatLng([lat, lon]);
    const latStr = `${Math.abs(lat).toFixed(5)}°${lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(lon).toFixed(5)}°${lon >= 0 ? 'E' : 'W'}`;
    document.getElementById('anaLat').value = lat.toFixed(6);
    document.getElementById('anaLon').value = lon.toFixed(6);
    document.getElementById('coordText').textContent = `${latStr}, ${lonStr}`;
    const hint = document.getElementById('anaMapHint');
    if (hint) hint.style.display = 'none';
}

// ── Analysis Panel ─────────────────────────────────────────────────────────
function setupAnalysisPanel() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lat = +btn.dataset.lat;
            const lon = +btn.dataset.lon;
            panPickerTo(lat, lon);
        });
    });
    document.getElementById('runAnalysis')?.addEventListener('click', runAnalysis);

    // GPS Live Location button
    document.getElementById('anaGpsBtn')?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            showNotification('Geolocation not supported by this browser.', 'error');
            return;
        }
        const btn = document.getElementById('anaGpsBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color:#22c55e"></i> Locating…';
        btn.disabled = true;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                panPickerTo(lat, lon);
                AppState.defaultLat = lat;
                AppState.defaultLon = lon;
                btn.innerHTML = '<i class="fa-solid fa-location-crosshairs" style="color:#22c55e"></i> Live Location';
                btn.disabled = false;
                showNotification(`Live location: ${formatCoord(lat, lon)}`, 'success');
            },
            () => {
                btn.innerHTML = '<i class="fa-solid fa-location-crosshairs" style="color:#22c55e"></i> Live Location';
                btn.disabled = false;
                showNotification('Location access denied. Check browser permissions.', 'error');
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    });
}

async function runAnalysis() {
    const lat = +document.getElementById('anaLat').value;
    const lon = +document.getElementById('anaLon').value;
    const depth = document.getElementById('anaDepth').value;

    // Show loader overlay over the map
    const loader = document.getElementById('analysisLoader');
    const results = document.getElementById('analysisResults');
    const placeholder = document.getElementById('analysisPlaceholder');
    if (loader) loader.classList.remove('hidden');
    if (results) results.classList.add('hidden');
    if (placeholder) placeholder.style.display = 'none';

    try {
        const apiData = await API.fetchAll(lat, lon, depth);
        await renderAnalysisResults(apiData);
        // Dispatch event for Reports page
        const ev = AppState.currentResult;
        if (ev) {
            document.dispatchEvent(new CustomEvent('soc:analysisComplete', {
                detail: {
                    lat: +document.getElementById('anaLat').value,
                    lon: +document.getElementById('anaLon').value,
                    data: ev.data,
                    ml: ev.ml
                }
            }));
        }
    } catch (err) {
        console.error('Analysis error:', err);
        showNotification('Analysis failed. Check your connection.', 'error');
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

async function renderAnalysisResults(apiData) {
    const soil = apiData?.soil || {};
    const climate = apiData?.climate || {};
    const nasa = apiData?.nasa || {};

    const ml = await MLEngine.runFullAsync({ soil, climate, nasa });
    AppState.currentResult = { data: apiData, ml };

    // SOC
    document.getElementById('resSoc').textContent = ml.soc ?? '—';
    const confBadge = document.getElementById('resConf');
    if (confBadge) { confBadge.textContent = `${ml.confidence}% confidence`; confBadge.className = `confidence-badge ${ml.confidence >= 75 ? 'high' : ml.confidence >= 50 ? 'mid' : 'low'}`; }
    document.getElementById('resSocRange').textContent = `${ml.socRange?.[0] ?? '—'} – ${ml.socRange?.[1] ?? '—'} g/kg`;
    const fill = document.getElementById('confFill');
    if (fill) fill.style.width = `${ml.confidence}%`;

    // Mini cards
    document.getElementById('resCarbonStock').textContent = ml.carbonStock ?? '—';
    document.getElementById('resSeq').textContent = typeof ml.sequestration === 'object' ? (ml.sequestration.co2_rate ?? '—') : (ml.sequestration ?? '—');
    document.getElementById('resBD').textContent = soil.bd ?? '—';
    document.getElementById('resPH').textContent = soil.ph ?? '—';
    document.getElementById('resClay').textContent = soil.clay ?? '—';
    document.getElementById('resMoisture').textContent = climate.soilMoisture ?? '—';

    // Climate row
    const climateRow = document.getElementById('climateRow');
    if (climateRow) {
        climateRow.innerHTML = `
      <div class="c-cell"><div class="c-val">${climate.temp ?? nasa.temperature ?? '—'}°C</div><div class="c-label">Temp. (${climate.source === 'Open-Meteo API' ? '14d avg' : '± Estimated'})</div></div>
      <div class="c-cell"><div class="c-val">${climate.precipitation ?? '—'} mm</div><div class="c-label">14-Day Precip</div></div>
      <div class="c-cell"><div class="c-val">${climate.soilMoisture ?? '—'}%</div><div class="c-label">Soil Moisture</div></div>
      <div class="c-cell"><div class="c-val">${nasa.solarRadiation ?? climate.solarRadiation ?? '—'}</div><div class="c-label">Solar (Estimated)</div></div>
      <div class="c-cell"><div class="c-val">${climate.evapotranspiration ?? '—'} mm/d</div><div class="c-label">ET₀</div></div>
      <div class="c-cell"><div class="c-val">${nasa.relativeHumidity ?? '—'}%</div><div class="c-label">Rel. Humidity</div></div>`;
    }

    // Update the sidebar quick-result panel
    const qr = document.getElementById('anaQuickResult');
    const qrBody = document.getElementById('anaQuickResultBody');
    if (qr && qrBody) {
        qr.style.display = 'block';
        let srcLabel = ml.source === 'Advanced ML (XGBoost)' ? '<i class="fa-solid fa-brain"></i> XGBoost Model' : (apiData.soil?.source === 'SoilGrids API' ? 'Live SoilGrids' : 'Estimated');
        qrBody.innerHTML = `
          <div style="display:flex;justify-content:space-between"><span style="color:rgba(240,253,244,0.5)">SOC</span><strong style="color:${ml.label.color}">${ml.soc} g/kg</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:rgba(240,253,244,0.5)">Carbon Stock</span><strong>${ml.carbonStock} t C/ha</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:rgba(240,253,244,0.5)">Class</span><strong style="color:${ml.label.color}">${ml.label.text}</strong></div>
          <div style="display:flex;justify-content:space-between"><span style="color:rgba(240,253,244,0.5)">Confidence</span><strong>${ml.confidence}%</strong></div>
          <div style="margin-top:4px;font-size:10px;color:rgba(240,253,244,0.35)">${srcLabel}</div>`;
    }

    // Spectral indices
    const idx = ml.indices || {};
    const indexColors = { NDVI: '#22c55e', EVI: '#4ade80', BSI: '#f59e0b', NDWI: '#60a5fa', SAVI: '#a855f7', NDTI: '#fbbf24' };
    const indexDesc = { NDVI: 'Vegetation health', EVI: 'Enhanced vegetation', BSI: 'Bare soil', NDWI: 'Water content', SAVI: 'Soil-adj veg.', NDTI: 'Tillage indicator' };
    const indicesGrid = document.getElementById('indicesGrid');
    if (indicesGrid) {
        indicesGrid.innerHTML = Object.entries(idx).map(([name, val]) => `
          <div class="idx-chip">
            <span class="idx-name" style="color:${indexColors[name] || '#fff'}">${name}</span>
            <span class="idx-val">${val}</span>
            <span class="idx-desc">${indexDesc[name] || ''}</span>
          </div>`).join('');
    }

    // Recommendations
    const rec = document.getElementById('recommendationsList');
    if (rec) {
        rec.innerHTML = (ml.recommendations || []).map(r => `<li>${r}</li>`).join('');
    }

    // Show results
    const results = document.getElementById('analysisResults');
    if (results) results.classList.remove('hidden');
}

// ── Remote Sensing Panel ───────────────────────────────────────────────────
function setupRemoteSensingPanel() {
    document.getElementById('calcIndices')?.addEventListener('click', computeIndices);
    document.querySelectorAll('.band-row input').forEach(input =>
        input.addEventListener('input', debounce(computeIndices, 500))
    );

    const setBand = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = (+val).toFixed(4);
    };

    // -- Fetch Satellite Bands (MODIS MOD09A1) --
    document.getElementById('fetchSatBands')?.addEventListener('click', async () => {
        const lat = AppState.defaultLat || 20.5937;
        const lon = AppState.defaultLon || 78.9629;
        const btn = document.getElementById('fetchSatBands');
        const src = document.getElementById('rsBandSource');
        const locText = document.getElementById('rsLocText');

        if (locText) locText.textContent = formatCoord(lat, lon) + ' — fetching…';
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching…';
        btn.disabled = true;

        try {
            const result = await API.fetchMODISBands(lat, lon);

            setBand('bandBlue', result.B2);
            setBand('bandGreen', result.B3);
            setBand('bandRed', result.B4);
            setBand('bandNIR', result.B8);
            setBand('bandSWIR1', result.B11);
            setBand('bandSWIR2', result.B12);

            const isLive = result.source && result.source.includes('MODIS');
            if (src) {
                src.style.display = 'block';
                src.style.background = isLive ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.1)';
                src.style.borderColor = isLive ? 'rgba(34,197,94,0.3)' : 'rgba(251,191,36,0.3)';
                src.style.color = isLive ? '#4ade80' : '#fbbf24';
                src.innerHTML = isLive
                    ? '<i class="fa-solid fa-satellite-dish"></i> ' + (result.source || '') + (result.date ? ' · ' + result.date : '')
                    : '<i class="fa-solid fa-bolt"></i> ' + (result.source || '') + ' — MODIS unavailable, using climate estimates';
            }
            if (locText) locText.textContent = formatCoord(lat, lon) + (isLive ? ' · Live MODIS' : ' · Estimated');
            showNotification(isLive ? 'Live MODIS satellite bands loaded!' : 'Climate-based band estimates loaded', isLive ? 'success' : 'info');
            computeIndices();
        } catch (err) {
            showNotification('Failed to fetch satellite bands.', 'error');
            if (locText) locText.textContent = formatCoord(lat, lon) + ' — fetch failed';
        } finally {
            btn.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> Fetch Satellite Bands';
            btn.disabled = false;
        }
    });

    // -- Use Analysis Location --
    document.getElementById('useAnalysisLoc')?.addEventListener('click', () => {
        const anaLat = +(document.getElementById('anaLat')?.value || '');
        const anaLon = +(document.getElementById('anaLon')?.value || '');
        if (!anaLat || !anaLon) {
            showNotification('No location selected in SOC Analysis yet.', 'error');
            return;
        }
        AppState.defaultLat = anaLat;
        AppState.defaultLon = anaLon;
        const locText = document.getElementById('rsLocText');
        if (locText) locText.textContent = formatCoord(anaLat, anaLon) + ' (from SOC Analysis)';
        showNotification('Location set to ' + formatCoord(anaLat, anaLon), 'success');
    });
}

async function computeIndices() {
    const get = id => +document.getElementById(id).value;
    const bands = { B2: get('bandBlue'), B3: get('bandGreen'), B4: get('bandRed'), B8: get('bandNIR'), B11: get('bandSWIR1'), B12: get('bandSWIR2') };
    const indices = MLEngine.computeAllIndices(bands);

    const indexColors = { NDVI: '#22c55e', EVI: '#4ade80', BSI: '#f59e0b', NDWI: '#60a5fa', SAVI: '#a855f7', MSAVI: '#c084fc', NDTI: '#fbbf24', CMR: '#fb923c', FMI: '#f87171' };
    const indexDesc = { NDVI: 'Vegetation health', EVI: 'Enhanced veg. index', BSI: 'Bare soil indicator', NDWI: 'Water content', SAVI: 'Soil-adj. veg.', MSAVI: 'Modified SAVI', NDTI: 'Tillage indicator', CMR: 'Clay minerals ratio', FMI: 'Ferrous minerals' };

    const normalise = (name, val) => {
        if (['CMR', 'FMI'].includes(name)) return Math.max(0, Math.min(1, (val - 0.3) / 3.7));
        return Math.max(0, Math.min(1, (val + 1) / 2));
    };

    document.getElementById('rsResultsGrid').innerHTML = Object.entries(indices).map(([name, val]) => {
        const norm = normalise(name, val);
        const color = indexColors[name] || '#fff';
        return `
      <div class="rs-index-card">
        <div class="rs-index-name">${name}</div>
        <div class="rs-index-val" style="color:${color}">${val}</div>
        <div class="rs-index-desc">${indexDesc[name] || ''}</div>
        <div class="rs-index-bar"><div class="rs-index-fill" style="width:${(norm * 100).toFixed(0)}%;background:${color}"></div></div>
      </div>`;
    }).join('');

    // SOC estimate from spectral bands
    const ctx = AppState.currentResult;
    const ml = await MLEngine.runFullAsync({ bands, soil: ctx?.data?.soil, climate: ctx?.data?.climate, nasa: ctx?.data?.nasa });
    Charts.initSocGauge(ml.soc);

    document.getElementById('spectralSocDetails').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:rgba(240,253,244,0.55)">Predicted SOC</span>
        <strong style="color:${ml.label?.color || '#22c55e'};font-size:18px">${ml.soc} g/kg</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:rgba(240,253,244,0.55)">Carbon Stock</span>
        <strong>${ml.carbonStock} t C/ha</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:rgba(240,253,244,0.55)">Class</span>
        <strong style="color:${ml.label?.color || '#22c55e'}">${ml.label?.text || '—'}</strong>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:rgba(240,253,244,0.55)">Confidence</span>
        <strong>${ml.confidence}%</strong>
      </div>
    </div>`;
}

// ── Reports Page ───────────────────────────────────────────────────────────
// Track all report entries for stats
const _reportEntries = [];

function initReportsPage() {
    const exportBtn = document.getElementById('exportBtn') || document.getElementById('topExport');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportTextReport);
    }

    document.getElementById('exportCSV')?.addEventListener('click', () => Exporter.exportCSV(_reportEntries));
    document.getElementById('exportGeoJSON')?.addEventListener('click', () => Exporter.exportGeoJSON(_reportEntries));
    document.getElementById('printReport')?.addEventListener('click', () => Exporter.printReport());

    // Auto-populate report date
    const dateEl = document.getElementById('reportDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Listen for analyses
    document.addEventListener('soc:pointAnalyzed', (e) => { _reportEntries.push(e.detail); addTableRow(e.detail, _reportEntries.length); updateReportStats(); });
    document.addEventListener('soc:analysisComplete', (e) => { _reportEntries.push(e.detail); addTableRow(e.detail, _reportEntries.length); updateReportStats(); });
}

function addTableRow({ lat, lon, data, ml }) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;
    // Remove the empty message row if present
    const emptyRow = tbody.querySelector('.empty-table-msg');
    if (emptyRow) emptyRow.closest('tr')?.remove();

    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const soc = ml?.soc ?? '—';
    const stock = ml?.carbonStock ?? '—';
    const ndvi = ml?.indices?.NDVI ?? '—';
    const ph = data?.soil?.ph ?? '—';
    const label = ml?.label ?? { text: '—', color: '#fff' };
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${_reportEntries.length}</td>
      <td>${formatCoord(lat, lon)}</td>
      <td style="color:#22c55e;font-weight:600">${soc}</td>
      <td>${stock} t C/ha</td>
      <td>${ndvi}</td>
      <td>${ph}</td>
      <td>${now}</td>
      <td><span style="color:${label.color};font-weight:600">${label.text}</span></td>`;
    tbody.prepend(row);
}

function updateReportStats() {
    const n = _reportEntries.length;
    document.getElementById('rstatFields').textContent = n;
    if (n === 0) return;
    const avgSOC = (_reportEntries.reduce((s, e) => s + (e.ml?.soc ?? 0), 0) / n).toFixed(1);
    const totalC = (_reportEntries.reduce((s, e) => s + (e.ml?.carbonStock ?? 0), 0)).toFixed(1);
    const avgSeq = (_reportEntries.reduce((s, e) => {
        const seq = e.ml?.sequestration;
        return s + (typeof seq === 'object' ? (seq.co2_rate ?? 0) : (seq ?? 0));
    }, 0) / n).toFixed(3);
    document.getElementById('rstatSoc').textContent = avgSOC + ' g/kg';
    document.getElementById('rstatCarbon').textContent = totalC + ' t C/ha';
    document.getElementById('rstatSeq').textContent = avgSeq + ' t/ha/yr';
}

function appendReportEntry({ lat, lon, data, ml }) {
    const log = document.getElementById('reportLog');
    if (!log) return;
    const empty = log.querySelector('.empty-report-msg');
    if (empty) empty.remove();

    const soc = ml?.soc ?? '—';
    const stock = ml?.carbonStock ?? '—';
    const conf = ml?.confidence ?? '—';
    const label = ml?.label ?? { text: '—', color: '#fff' };
    const seq = (typeof ml?.sequestration === 'object') ? (ml.sequestration.co2_rate ?? '—') : (ml?.sequestration ?? '—');
    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const soil = data?.soil || {};

    const entry = document.createElement('div');
    entry.className = 'report-entry glass-card';
    entry.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <div>
          <div style="font-weight:600;font-size:15px">${formatCoord(lat, lon)}</div>
          <div style="font-size:11px;color:rgba(240,253,244,0.4);margin-top:2px">${now} · ${data?.soil?.source || 'Estimated'}</div>
        </div>
        <span style="background:${label.color}22;border:1px solid ${label.color}55;color:${label.color};padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">${label.text}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px">
        <div class="report-stat"><div class="rs-val" style="color:#22c55e">${soc} g/kg</div><div class="rs-lbl">SOC</div></div>
        <div class="report-stat"><div class="rs-val">${stock} t C/ha</div><div class="rs-lbl">Carbon Stock</div></div>
        <div class="report-stat"><div class="rs-val">${seq}</div><div class="rs-lbl">CO₂ seq. t/ha/yr</div></div>
        <div class="report-stat"><div class="rs-val">${conf}%</div><div class="rs-lbl">Confidence</div></div>
        <div class="report-stat"><div class="rs-val">${soil.ph ?? '—'}</div><div class="rs-lbl">pH</div></div>
        <div class="report-stat"><div class="rs-val">${soil.clay ?? '—'}</div><div class="rs-lbl">Clay g/kg</div></div>
      </div>`;
    log.prepend(entry);
    showNotification('Report entry added', 'success');
}

function exportTextReport() {
    const result = AppState.currentResult;
    if (!result) { showNotification('Run an analysis first.', 'error'); return; }
    const ml = result.ml;
    const soil = result.data?.soil || {};
    const lat = result.data?.lat || AppState.defaultLat;
    const lon = result.data?.lon || AppState.defaultLon;
    const seq = typeof ml.sequestration === 'object' ? ml.sequestration.co2_rate : ml.sequestration;
    const text = [
        'SOC Monitor — Export Report',
        new Date().toLocaleString(),
        '---',
        `Location: ${formatCoord(lat, lon)}`,
        `SOC: ${ml.soc} g/kg`,
        `Carbon Stock: ${ml.carbonStock} t C/ha`,
        `CO2 Sequestration: ${seq} t/ha/yr`,
        `Confidence: ${ml.confidence}%`,
        `Class: ${ml.label?.text}`,
        `pH: ${soil.ph ?? 'N/A'}`,
        `Clay: ${soil.clay ?? 'N/A'} g/kg`,
        `Bulk Density: ${soil.bd ?? 'N/A'} g/cm³`,
        `Source: ${soil.source || 'Estimated'}`,
        '---',
        'Recommendations:',
        ...(ml.recommendations || []).map(r => '- ' + r),
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `soc-report-${Date.now()}.txt`;
    a.click();
    showNotification('Report exported!', 'success');
}

// ── Notifications ──────────────────────────────────────────────────────────
function showNotification(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `notification notification-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);

    Object.assign(el.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '9999',
        background: type === 'success' ? 'rgba(34,197,94,0.18)' : type === 'error' ? 'rgba(239,68,68,0.18)' : 'rgba(99,102,241,0.18)',
        border: `1px solid ${type === 'success' ? 'rgba(34,197,94,0.4)' : type === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.4)'}`,
        color: '#f0fdf4',
        padding: '10px 18px',
        borderRadius: '10px',
        fontSize: '13px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        opacity: '0',
        transform: 'translateY(-4px)',
        transition: 'all 0.25s ease',
        maxWidth: '340px',
    });

    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 10);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-4px)';
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// ── Utilities ──────────────────────────────────────────────────────────────
function formatCoord(lat, lon) {
    const latStr = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    return `${latStr}, ${lonStr}`;
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

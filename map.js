/**
 * map.js — Leaflet Interactive Field Map Module
 */

const MapModule = (() => {
    let map = null;
    let drawnItems = null;
    let currentBaselayer = null;
    let markers = [];
    let fieldCount = 0;

    const baseLayers = {
        satellite: L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution: 'Tiles © Esri', maxZoom: 19 }
        ),
        terrain: L.tileLayer(
            'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenTopoMap', maxZoom: 17 }
        ),
        street: L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution: '© OpenStreetMap', maxZoom: 19 }
        ),
    };

    function init(containerId = 'mainMap', center = [20.59, 78.96], zoom = 5) {
        if (map) return map;

        map = L.map(containerId, {
            center,
            zoom,
            zoomControl: true,
        });

        // Default satellite layer
        baseLayers.satellite.addTo(map);
        currentBaselayer = 'satellite';

        // Drawn items feature group
        drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);

        // Draw controls
        const drawControl = new L.Control.Draw({
            edit: { featureGroup: drawnItems },
            draw: {
                polygon: { shapeOptions: { color: '#22c55e', weight: 2, fillOpacity: 0.15 } },
                rectangle: { shapeOptions: { color: '#3b82f6', weight: 2, fillOpacity: 0.15 } },
                circle: false,
                polyline: false,
                marker: false,
                circlemarker: false,
            }
        });
        map.addControl(drawControl);

        // Click handler — point analysis
        map.on('click', async (e) => {
            const { lat, lng } = e.latlng;
            addClickMarker(lat, lng);
            updateMapStatPanel(lat, lng);
        });

        // Draw completed
        map.on(L.Draw.Event.CREATED, (e) => {
            drawnItems.addLayer(e.layer);
            fieldCount++;
            const bounds = e.layer.getBounds ? e.layer.getBounds().getCenter() : e.latlng;
            addFieldToList(fieldCount, bounds.lat, bounds.lng);
        });

        // Basemap toggle from radio buttons
        document.querySelectorAll('input[name="basemap"]').forEach(radio => {
            radio.addEventListener('change', (e) => switchBaselayer(e.target.value));
        });

        // Tool buttons
        document.getElementById('btnDraw')?.addEventListener('click', () => {
            document.querySelector('.leaflet-draw-draw-polygon')?.click();
        });
        document.getElementById('btnMarker')?.addEventListener('click', () => {
            map.once('click', (e) => addClickMarker(e.latlng.lat, e.latlng.lng));
        });
        document.getElementById('btnClear')?.addEventListener('click', () => {
            drawnItems.clearLayers();
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            fieldCount = 0;
            document.getElementById('savedFieldsList').innerHTML = '<p class="empty-msg">No fields drawn yet</p>';
            document.getElementById('mapStatPanel').querySelector('p')?.setAttribute('textContent', '');
            resetMapStatPanel();
        });

        return map;
    }

    function switchBaselayer(name) {
        if (currentBaselayer) baseLayers[currentBaselayer]?.remove();
        baseLayers[name]?.addTo(map);
        currentBaselayer = name;
    }

    function addClickMarker(lat, lon) {
        const m = L.circleMarker([lat, lon], {
            radius: 8,
            color: '#22c55e',
            fillColor: '#22c55e',
            fillOpacity: 0.7,
            weight: 2,
        }).addTo(map);
        m.bindPopup(`
      <div style="line-height:1.6">
        <strong style="color:#4ade80">📍 ${lat.toFixed(4)}, ${lon.toFixed(4)}</strong><br/>
        <span style="font-size:11px">Click Analysis tab for full SOC data</span>
      </div>
    `);
        markers.push(m);
        return m;
    }

    async function updateMapStatPanel(lat, lon) {
        const panel = document.getElementById('mapStatPanel');
        if (!panel) return;

        panel.innerHTML = `
      <h4><i class="fa-solid fa-circle-info"></i> Point Info</h4>
      <div style="display:flex;align-items:center;gap:8px;color:rgba(240,253,244,0.5);font-size:12px">
        <div style="width:14px;height:14px;border-radius:50%;border:2px solid #22c55e;border-top-color:transparent;animation:spin 1s linear infinite"></div>
        Fetching soil data…
      </div>`;

        try {
            const data = await API.fetchAll(lat, lon);
            const ml = await MLEngine.runFullAsync({ soil: data.soil, climate: data.climate, nasa: data.nasa });

            const soc = ml.soc;
            const color = soc >= 25 ? '#22c55e' : soc >= 12 ? '#fbbf24' : '#f87171';
            const stock = ml.carbonStock;

            panel.innerHTML = `
        <h4><i class="fa-solid fa-circle-info"></i> Point Info</h4>
        <div class="stat-row-list">
          <div class="stat-row"><span>Lat / Lon</span><strong>${lat.toFixed(4)}, ${lon.toFixed(4)}</strong></div>
          <div class="stat-row"><span>SOC</span><strong style="color:${color}">${soc} g/kg</strong></div>
          <div class="stat-row"><span>Carbon Stock</span><strong>${stock} t C/ha</strong></div>
          <div class="stat-row"><span>pH</span><strong>${data.soil?.ph ?? '—'}</strong></div>
          <div class="stat-row"><span>Clay</span><strong>${data.soil?.clay ?? '—'} g/kg</strong></div>
          <div class="stat-row"><span>NDVI (est.)</span><strong>${ml.indices?.NDVI ?? '—'}</strong></div>
          <div class="stat-row"><span>Status</span><strong style="color:${ml.label.color}">${ml.label.text}</strong></div>
        </div>`;

            // Dispatch event so app.js can capture and add to reports
            document.dispatchEvent(new CustomEvent('soc:pointAnalyzed', { detail: { lat, lon, data, ml } }));
        } catch (err) {
            console.error('Field Map Error:', err);
            panel.innerHTML = `<h4><i class="fa-solid fa-circle-info"></i> Point Info</h4><p class="map-hint" style="color:#f87171">Failed to fetch data. Try another location.</p>`;
        }
    }

    function resetMapStatPanel() {
        const panel = document.getElementById('mapStatPanel');
        if (!panel) return;
        panel.innerHTML = `<h4><i class="fa-solid fa-circle-info"></i> Point Info</h4><p class="map-hint">Click a location on the map to fetch soil data</p>`;
    }

    function addFieldToList(id, lat, lon) {
        const list = document.getElementById('savedFieldsList');
        const emptyMsg = list.querySelector('.empty-msg');
        if (emptyMsg) emptyMsg.remove();

        const item = document.createElement('div');
        item.className = 'field-list-item';
        item.innerHTML = `
      <span>Field #${id}</span>
      <small style="color:rgba(240,253,244,0.4)">${lat.toFixed(2)}, ${lon.toFixed(2)}</small>`;
        list.appendChild(item);
    }

    function panTo(lat, lon, zoom = 12) {
        if (!map) return;
        map.flyTo([lat, lon], zoom, { animate: true, duration: 1.2 });
    }

    function addSOCHeatDot(lat, lon, soc) {
        const color = soc >= 25 ? '#22c55e' : soc >= 12 ? '#fbbf24' : '#f87171';
        L.circleMarker([lat, lon], {
            radius: 10,
            color,
            fillColor: color,
            fillOpacity: 0.5,
            weight: 2,
        }).bindTooltip(`SOC: ${soc} g/kg`, { sticky: true }).addTo(map);
    }

    return { init, panTo, addSOCHeatDot, addClickMarker, switchBaselayer };
})();

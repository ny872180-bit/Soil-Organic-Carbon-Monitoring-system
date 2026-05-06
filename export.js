/**
 * export.js — Data Export Module
 * CSV, GeoJSON, Print report
 */

const Exporter = (() => {

    function exportCSV(records) {
        if (!records || records.length === 0) {
            alert('No field data to export. Run at least one analysis first.');
            return;
        }

        const headers = ['#', 'Latitude', 'Longitude', 'SOC_g_per_kg', 'SOC_Low', 'SOC_High',
            'Carbon_Stock_tC_ha', 'Sequestration_tCO2_ha_yr', 'NDVI', 'EVI', 'BSI',
            'pH', 'Clay_g_per_kg', 'Bulk_Density', 'Soil_Moisture_pct',
            'Temperature_C', 'Precipitation_mm', 'Confidence_pct', 'Land_Use', 'Timestamp'];

        const rows = records.map((r, i) => [
            i + 1,
            r.lat?.toFixed(5) ?? '',
            r.lon?.toFixed(5) ?? '',
            r.ml?.soc ?? '',
            r.ml?.socLow ?? '',
            r.ml?.socHigh ?? '',
            r.ml?.carbonStock ?? '',
            r.ml?.sequestration?.co2_rate ?? '',
            r.ml?.indices?.NDVI ?? '',
            r.ml?.indices?.EVI ?? '',
            r.ml?.indices?.BSI ?? '',
            r.data?.soil?.ph ?? '',
            r.data?.soil?.clay ?? '',
            r.data?.soil?.bd ?? '',
            r.data?.climate?.soilMoisture ?? '',
            r.data?.climate?.temp ?? '',
            r.data?.climate?.precipitation ?? '',
            r.ml?.confidence ?? '',
            r.landUse ?? 'cropland',
            new Date(r.timestamp || Date.now()).toISOString(),
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        downloadFile(csvContent, 'soc_analysis_report.csv', 'text/csv');
    }

    function exportGeoJSON(records) {
        if (!records || records.length === 0) {
            alert('No field data to export as GeoJSON. Run at least one analysis first.');
            return;
        }

        const geojson = {
            type: 'FeatureCollection',
            features: records.map((r, i) => ({
                type: 'Feature',
                id: i + 1,
                geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
                properties: {
                    soc_g_per_kg: r.ml?.soc,
                    soc_low: r.ml?.socLow,
                    soc_high: r.ml?.socHigh,
                    carbon_stock_tC_ha: r.ml?.carbonStock,
                    sequestration_tCO2: r.ml?.sequestration?.co2_rate,
                    ndvi: r.ml?.indices?.NDVI,
                    evi: r.ml?.indices?.EVI,
                    bsi: r.ml?.indices?.BSI,
                    ph: r.data?.soil?.ph,
                    clay_g_per_kg: r.data?.soil?.clay,
                    bulk_density: r.data?.soil?.bd,
                    soil_moisture_pct: r.data?.climate?.soilMoisture,
                    temperature_c: r.data?.climate?.temp,
                    precipitation_mm: r.data?.climate?.precipitation,
                    confidence_pct: r.ml?.confidence,
                    soc_class: r.ml?.label?.text,
                    land_use: r.landUse ?? 'cropland',
                    timestamp: new Date(r.timestamp || Date.now()).toISOString(),
                }
            }))
        };

        downloadFile(JSON.stringify(geojson, null, 2), 'soc_fields.geojson', 'application/geo+json');
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function printReport() {
        window.print();
    }

    return { exportCSV, exportGeoJSON, printReport };
})();

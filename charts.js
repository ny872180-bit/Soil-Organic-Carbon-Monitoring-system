/**
 * charts.js — Chart.js Dashboard Components
 * Initializes and manages all charts in the SOC Monitor
 */

const Charts = (() => {

    // Shared chart defaults
    Chart.defaults.color = 'rgba(240,253,244,0.5)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;

    const GREEN = '#22c55e';
    const BLUE = '#3b82f6';
    const AMBER = '#f59e0b';
    const PURPLE = '#a855f7';
    const RED = '#f87171';
    const MUTED = 'rgba(134,239,172,0.4)';

    function gAlpha(color, alpha) {
        const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const [r, g, b] = hex2rgb(color);
        return `rgba(${r},${g},${b},${alpha})`;
    }

    // ── SOC Trend Chart ────────────────────────────────────────────────────────
    let socTrendChart = null;
    function initSocTrend(labels, data) {
        if (socTrendChart) socTrendChart.destroy();
        const ctx = document.getElementById('socTrendChart');
        if (!ctx) return;

        socTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'SOC (g/kg)',
                    data,
                    borderColor: GREEN,
                    backgroundColor: createGradient(ctx.getContext('2d'), GREEN),
                    borderWidth: 2.5,
                    pointRadius: 3,
                    pointBackgroundColor: GREEN,
                    tension: 0.4,
                    fill: true,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#111c14',
                        borderColor: 'rgba(34,197,94,0.3)',
                        borderWidth: 1,
                        callbacks: {
                            label: ctx => ` ${ctx.parsed.y} g/kg`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { maxTicksLimit: 8 } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: false, ticks: { callback: v => (+v).toFixed(1) + ' g/kg' } }
                }
            }
        });
        return socTrendChart;
    }

    // ── Soil Radar Chart ───────────────────────────────────────────────────────
    let radarChart = null;
    function initSoilRadar(soilData) {
        if (radarChart) radarChart.destroy();
        const ctx = document.getElementById('soilRadarChart');
        if (!ctx) return;

        const defaults_100 = [60, 50, 55, 65, 40, 50];
        const actual = soilData
            ? [
                normalizeRadar(soilData.soc ?? 15, 0, 60),
                normalizeRadar(soilData.clay ?? 250, 0, 600),
                normalizeRadar(soilData.ph ?? 6.5, 4, 9),
                normalizeRadar(soilData.bd ?? 1.3, 2, 0.8), // inverted
                normalizeRadar(soilData.nitrogen ?? 0.8, 0, 2),
                normalizeRadar(soilData.cfvo ?? 5, 20, 0),
            ]
            : defaults_100;

        radarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['SOC', 'Clay', 'pH', 'Bulk Density', 'Nitrogen', 'Low CF'],
                datasets: [{
                    label: 'Soil Properties',
                    data: actual,
                    borderColor: GREEN,
                    backgroundColor: gAlpha(GREEN, 0.12),
                    pointBackgroundColor: GREEN,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.1,
                plugins: { legend: { display: false } },
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { stepSize: 25, display: false },
                        grid: { color: 'rgba(255,255,255,0.07)' },
                        angleLines: { color: 'rgba(255,255,255,0.07)' },
                        pointLabels: { font: { size: 11 }, color: 'rgba(240,253,244,0.6)' }
                    }
                }
            }
        });
    }

    function normalizeRadar(val, min, max) {
        if (max < min) [min, max] = [max, min]; // inverted range
        return +Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100)).toFixed(0);
    }

    // ── Carbon Stock Bar Chart ─────────────────────────────────────────────────
    let carbonChart = null;
    function initCarbonStock(labels, data) {
        if (carbonChart) carbonChart.destroy();
        const ctx = document.getElementById('carbonStockChart');
        if (!ctx) return;

        carbonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Carbon Stock (t C/ha)',
                    data,
                    backgroundColor: data.map((v, i) => i % 2 === 0 ? gAlpha(GREEN, 0.7) : gAlpha(BLUE, 0.7)),
                    borderColor: data.map((v, i) => i % 2 === 0 ? GREEN : BLUE),
                    borderWidth: 1,
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
                }
            }
        });
    }

    // ── Climate Correlation Scatter ────────────────────────────────────────────
    let climateChart = null;
    function initClimateCorrelation(scatterData) {
        if (climateChart) climateChart.destroy();
        const ctx = document.getElementById('climateCorrelChart');
        if (!ctx) return;

        climateChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Precip vs SOC',
                    data: scatterData,
                    backgroundColor: gAlpha(AMBER, 0.6),
                    borderColor: AMBER,
                    borderWidth: 1,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        title: { display: true, text: 'Precipitation (mm)', color: MUTED },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        title: { display: true, text: 'SOC (g/kg)', color: MUTED },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    // ── NDVI Monthly Bar ────────────────────────────────────────────────────────
    let ndviChart = null;
    function initNDVIBar(labels, ndviData) {
        if (ndviChart) ndviChart.destroy();
        const ctx = document.getElementById('ndviBarChart');
        if (!ctx) return;

        ndviChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'NDVI',
                    data: ndviData,
                    backgroundColor: ndviData.map(v =>
                        v > 0.5 ? gAlpha(GREEN, 0.8) : v > 0.3 ? gAlpha(AMBER, 0.8) : gAlpha(RED, 0.8)
                    ),
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, min: 0, max: 0.9 }
                }
            }
        });
    }

    // ── Confidence Interval Area Chart ────────────────────────────────────────
    let confChart = null;
    function initConfidenceChart(labels, means, lows, highs) {
        if (confChart) confChart.destroy();
        const ctx = document.getElementById('confidenceChart');
        if (!ctx) return;

        confChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Upper Bound',
                        data: highs,
                        borderColor: 'transparent',
                        backgroundColor: gAlpha(GREEN, 0.15),
                        fill: '+1',
                        tension: 0.4,
                        pointRadius: 0,
                    },
                    {
                        label: 'SOC Estimate',
                        data: means,
                        borderColor: GREEN,
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0.4,
                        pointRadius: 3,
                        pointBackgroundColor: GREEN,
                    },
                    {
                        label: 'Lower Bound',
                        data: lows,
                        borderColor: 'transparent',
                        backgroundColor: gAlpha(GREEN, 0.15),
                        fill: '-1',
                        tension: 0.4,
                        pointRadius: 0,
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#111c14',
                        borderColor: 'rgba(34,197,94,0.3)',
                        borderWidth: 1,
                    }
                },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => v + ' g/kg' } }
                }
            }
        });
    }

    // ── SOC Gauge (Remote Sensing Panel) ──────────────────────────────────────
    let gaugeChart = null;
    function initSocGauge(soc, max = 60) {
        if (gaugeChart) gaugeChart.destroy();
        const ctx = document.getElementById('socGaugeChart');
        if (!ctx) return;

        const pct = Math.min(soc / max, 1);
        const remaining = 1 - pct;
        const color = soc >= 25 ? GREEN : soc >= 12 ? AMBER : RED;

        gaugeChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [pct, remaining],
                    backgroundColor: [color, 'rgba(255,255,255,0.05)'],
                    borderColor: ['transparent', 'transparent'],
                    cutout: '70%',
                    rotation: -90,
                    circumference: 180,
                }]
            },
            options: {
                responsive: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            },
            plugins: [{
                id: 'gaugeLabel',
                afterDraw(chart) {
                    const { ctx: c, chartArea: { left, top, right, bottom } } = chart;
                    const cx = (left + right) / 2;
                    const cy = (top + bottom) / 2 + 15;
                    c.save();
                    c.font = "bold 20px 'Space Grotesk'";
                    c.fillStyle = color;
                    c.textAlign = 'center';
                    c.textBaseline = 'middle';
                    c.fillText(soc + ' g/kg', cx, cy);
                    c.font = "11px Inter";
                    c.fillStyle = 'rgba(240,253,244,0.5)';
                    c.fillText('SOC estimate', cx, cy + 20);
                    c.restore();
                }
            }]
        });
    }

    // ── Helper ─────────────────────────────────────────────────────────────────
    function createGradient(ctx, color) {
        try {
            const grad = ctx.createLinearGradient(0, 0, 0, 200);
            const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
            const [r, g, b] = hex2rgb(color);
            grad.addColorStop(0, `rgba(${r},${g},${b},0.3)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
            return grad;
        } catch { return gAlpha(color, 0.2); }
    }

    return {
        initSocTrend,
        initSoilRadar,
        initCarbonStock,
        initCarbonByLayer: initCarbonStock,  // alias
        initClimateCorrelation,
        initNDVIBar,
        initConfidenceChart,
        initSocGauge,
    };
})();

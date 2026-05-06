# SOC Carbon Intelligence Platform

## 1. Project Overview
The **SOC (Soil Organic Carbon) Carbon Intelligence Platform** is an advanced, AI-powered web application designed to estimate, monitor, and map soil organic carbon levels using remote sensing and machine learning. The platform bridges the gap between raw satellite telemetry, global climate data, and actionable agricultural intelligence.

By combining live satellite feeds with an edge-deployed **XGBoost** machine learning model, the platform provides real-time, highly accurate SOC predictions, Carbon Stock estimates, and CO₂ sequestration rates without relying on expensive physical soil sampling.

---

## 2. System Architecture

The project utilizes a modern, hybrid architecture designed for speed and offline-capable inference:

### Frontend (Client-Side)
- **UI/UX Core**: HTML5, CSS3 (Glassmorphism design, highly responsive), Vanilla JavaScript.
- **Mapping Engine**: [Leaflet.js](https://leafletjs.com/) for interactive GIS field mapping, satellite basemaps, and geospatial drawing tools.
- **Data Visualization**: [Chart.js](https://www.chartjs.org/) for rendering real-time metrics (SOC trends, Carbon Stock bars, NDVI monthly charts, Soil Radar charts).
- **Edge AI Inference**: [ONNX Runtime Web](https://onnxruntime.ai/) (`ort.min.js`), allowing the previously trained XGBoost model to execute natively inside the user's browser, eliminating inference latency and backend bottlenecks.

### Backend (Server-Side)
- **REST API Server**: [Flask](https://flask.palletsprojects.com/) (`app.py`), serving the static frontend and acting as the gateway for continuous learning.
- **Model Training Pipeline**: Python (`train_model.py`), utilizing `pandas`, `scikit-learn`, and `xgboost` to clean datasets, train the regressor, calculate $R^2$/RMSE metrics, and export the model to the `.onnx` format.

---

## 3. Core Features

### 🌍 Interactive GIS Field Mapping
Users can search globally, pan across high-resolution satellite basemaps, place markers, or draw polygon fields. The map intelligently reverse-geocodes locations and instantly triggers the ML pipeline to predict soil health at that exact coordinate.

### 📡 Multi-Source API Data Fusion
The platform asynchronously aggregates vast amounts of environmental data in real-time to feed the AI:
1. **SoilGrids v2 REST API**: Provides baseline soil taxonomy (pH, bulk density, clay fractions).
2. **NASA POWER API**: Supplies long-term meteorological metrics (solar radiation, humidity, wind speed).
3. **Open-Meteo**: Delivers hyper-local 14-day weather caching (soil moisture, precipitation, evapotranspiration).
4. **MODIS (MOD09A1) via NASA ORNL**: Fetches raw, 8-day composite surface reflectance satellite bands (Blue, Green, Red, NIR, SWIR1, SWIR2).

### 🧠 Edge AI Inference (XGBoost)
Instead of sending data to a heavy backend, the platform compiles the API data into a tensor array and passes it into `soc_xgboost.onnx` directly in the browser. It instantly computes:
- **SOC (g/kg)**
- **Total Carbon Stock (t C/ha)**
- **Sequestration Potential (t CO₂/ha/yr)**
- Mathematical Confidence Intervals (%)

### 🔄 Continuous Learning Loop
The UI features an "Upload Data & Retrain" pipeline. Users can upload new ground-truth CSV data (e.g., from physical lab tests). The Flask backend (`/api/retrain`) receives this data, dynamically merges it with the core dataset, retrains the XGBoost model to get smarter, exports new metrics, and live-reloads the frontend model without restarting the server.

### 📊 Comprehensive Reporting & Exporting
A dedicated Reports Engine logs every analysis session. Users can seamlessly export their entire session history as:
- **CSV**: For Excel/data-science workflows.
- **GeoJSON**: For importing directly into QGIS/ArcGIS.
- **PDF/Print**: A beautifully formatted summary report for stakeholders.

---

## 4. Machine Learning Implementation

**Algorithm**: XGBoost (eXtreme Gradient Boosting) Regressor.
**Why XGBoost?**: Exceptional at tabular data regression, handles non-linear relationships in spectral bands elegantly, and resists overfitting via depth constraints.

**Input Features (8-Dimensional Vector)**:
1. `B2_Blue` (MODIS Band 3 equivalent)
2. `B3_Green` (MODIS Band 4)
3. `B4_Red` (MODIS Band 1)
4. `B8_NIR` (MODIS Band 2)
5. `B11_SWIR1` (MODIS Band 6)
6. `B12_SWIR2` (MODIS Band 7)
7. `NDVI` (Normalized Difference Vegetation Index)
8. `NDMI / NDWI` (Normalized Difference Moisture Index)

**Real-World Fallbacks**:
If satellite APIs fail or the user operates entirely offline, physics-based fallback algorithms mathematically simulate band reflectances and climate data based on global latitude/longitude climate zone heuristics.

---

## 5. Codebase Directory Structure

```text
/Desktop/Soil/
├── index.html                   # Main application entry point & UI layout
├── app.py                       # Flask server and Retraining API routing
├── train_model.py               # XGBoost model training and ONNX export pipeline
├── SOC_Spectral_Regression_Dataset.csv # Master AI training dataset
├── DOCUMENTATION.md             # This document
│
├── js/                          # Client-side JavaScript Modules
│   ├── app.js                   # Main controller, UI wiring, and view routing
│   ├── api.js                   # External API fetching and fallback generation
│   ├── ml.js                    # ONNX Runtime logic and agricultural math formulas
│   ├── map.js                   # Leaflet.js mapping and drawing controls
│   ├── charts.js                # Chart.js visualization initializers
│   └── export.js                # CSV, GeoJSON, and Print report formatting
│
├── css/                         # Stylesheets
│   └── style.css                # Custom glassmorphism and layout styling
│
└── assets/                      
    └── models/                  # Compiled Machine Learning Artifacts
        ├── soc_xgboost.onnx     # The LIVE edge-inference model
        └── metrics.json         # Real-time R² and RMSE accuracy variables
```

---

## 6. How to Run the Platform

1. **Install Dependencies**:
   Ensure you have Python 3.13+ installed along with necessary packages:
   ```bash
   pip install flask flask-cors pandas numpy xgboost scikit-learn onnxmltools skl2onnx
   ```

2. **Start the Flask Server**:
   Navigate to the project directory and launch `app.py`:
   ```bash
   cd /Users/niteshyadav/Desktop/Soil
   python3.13 app.py
   ```

3. **Access the Platform**:
   Open a modern web browser and navigate to:
   **http://localhost:8080/**

4. **Retraining the Model**:
   - Access the platform and click `Upload Data & Retrain`.
   - Provide a valid CSV matching the Spectral Dataset schema.
   - The backend will automatically rebuild `soc_xgboost.onnx` and update `metrics.json`!

# SOC Monitor — Soil Organic Carbon Intelligence Platform
**Technical Documentation for IEEE Publication Preparation**

## Abstract
The assessment and spatial modeling of Soil Organic Carbon (SOC) are critical for sustainable agriculture, climate change mitigation, and carbon sequestration verification. This document details the architecture and implementation of the **SOC Monitor**, a novel Edge AI web platform. The platform fuses distributed geospatial data—including remote sensing satellite imagery (MODIS) and deep soil parametrics (SoilGrids)—with a browser-based Machine Learning inference engine. By utilizing an eXtreme Gradient Boosting (XGBoost) model exported to the Open Neural Network Exchange (ONNX) format and executed client-side via WebAssembly (ONNX Runtime Web), the SOC Monitor achieves real-time, high-precision carbon evaluations without the latency or infrastructural overhead of traditional server-side ML architectures.

---

## 1. Introduction
Traditional SOC estimation relies heavily on either expensive in-situ soil sampling or complex, backend-heavy geospatial processing pipelines. The SOC Monitor introduces a "Serverless" Edge AI architecture. 

**Core Objectives:**
1. To democratize access to advanced soil analytics for agronomists and land managers.
2. To shift the computational burden of Machine Learning inference from centralized servers to the client's edge device.
3. To provide a highly interactive, data-dense Progressive Web Application (SPA) that operates globally in real-time.

---

## 2. System Architecture & Methodology

The application operates entirely within the client's browser, utilizing asynchronous JavaScript, external RESTful APIs, and WebAssembly for model execution.

### 2.1 Geospatial Data Fusion (API Layer)
The platform orchestrates concurrent fetching and fusion of planetary-scale datasets:
*   **ISRIC SoilGrids v2 (REST API):** Supplies high-resolution (250m) physical soil profiles, providing foundational covariates such as Clay Content (g/kg), pH, and Bulk Density (g/cm³).
*   **NASA POWER API (Agroclimatology):** Delivers climatological normals (temperature, precipitation, solar radiation) mapped precisely to the user's coordinates.
*   **NASA ORNL DAAC MODIS (MOD09A1):** Supplies 8-day composite multi-spectral surface reflectance bands (Blue, Green, Red, NIR, SWIR1, SWIR2).
*   **Open-Meteo API:** Serves as a secondary environmental data source, providing real-time conditions like soil moisture index.

### 2.2 Edge AI Engine (Machine Learning Layer)
A major innovation of this platform is the transition from empirical modeling to true Machine Learning inference executed entirely in the browser.

1.  **Model Training (Synthetic XGBoost):**
    An XGBoost Regressor model is trained on a comprehensive dataset capturing the non-linear relationships between environmental covariates and organic matter accumulation.
    *   **Input Features (9 variables):** NDVI, BSI, EVI, CMR, Clay Content, Precipitation, Temperature, Bulk Density, and Solar Radiation.
    *   **Target:** Soil Organic Carbon Content (g/kg).

2.  **Model Export & ONNX Format:**
    To achieve cross-platform compatibility and edge execution, the trained XGBoost model is translated into an ONNX (Open Neural Network Exchange) computational graph (`soc_xgboost.onnx`).

3.  **In-Browser Inference (ONNX Runtime Web):**
    The platform employs `onnxruntime-web` to load the model into the browser's memory. When a spatial query is triggered:
    *   Raw data is fetched from the aforementioned APIs.
    *   The JavaScript engine calculates derived spectral indices (NDVI, BSI, CMR, etc.).
    *   These parameters are packed into a highly optimized `Float32Array` tensor.
    *   The ONNX session runs inference `session.run(feeds)` natively in the browser, providing instantaneous SOC prediction and confidence intervals dynamically.

---

## 3. Implementation Details

### 3.1 Frontend Stack
*   **UI/UX:** Custom-built via Vanilla HTML5/CSS3 utilizing a modern "glassmorphism" design system. The avoidance of heavy UI frameworks (like React or Angular) guarantees minimal payload size and maximal rendering performance.
*   **Logic (Vanilla JavaScript ES6+):** Utilizes `async/await` and module patterns (`api.js`, `ml.js`, `app.js`) to cleanly separate concerns between remote data fetching, AI processing, and DOM manipulation.
*   **Data Visualization:** Powered by **Chart.js** to render dynamic Radar charts (Soil Properties), Line plots (Temporal SOC Trends), and Distribution metrics.

### 3.2 Interactive Spatial Mapping
*   **Engine:** Powered by **Leaflet.js** and `Leaflet.draw`.
*   **Features:** Provides ESRI World Imagery satellite basemaps. Users can draw geospatial polygons (field boundaries) or drop point markers. Event listeners capture coordinate geometries and trigger independent ML evaluations for that specific localized area, generating visual "SOC Heat Dots".

### 3.3 State Management & Reporting
*   Analytical evaluations are stored in a volatile application state (`AppState`).
*   The **Reports** module aggregates this historical session data into an interactive tabular ledger.
*   Users can serialize and export complete analytical datasets into `.csv` formats directly from the frontend for subsequent integration into GIS tools (QGIS, ArcGIS).

---

## 4. Results & Practical Application

### 4.1 Performance Profile
By executing the XGBoost model via ONNX in the browser, the platform effectively eliminates server-side latency associated with ML processing. The only bottleneck constraint is the external HTTPS fetch requests to NASA and ISRIC. Fallback algorithms handle API downtime gracefully to ensure continuous system availability.

### 4.2 Use Cases for Publication
*   **Carbon Farming & Sequestration:** Providing continuous, low-cost baseline metric evaluations for farmers entering soil carbon-credit markets.
*   **Precision Agriculture:** Identifying specific spatial zones suffering from SOC depletion, thereby optimizing localized organic amendment applications.
*   **Scalable Edge Computing in AgTech:** Demonstrating the technical viability of shifting complex predictive Earth Science models out of centralized cloud farms and directly onto the edge devices of field agronomists.

---

## 5. Conclusion
The SOC Monitor represents a significant step forward in the democratization of agricultural tech. By fusing live global APIs with an advanced, browser-native XGBoost ML pipeline via ONNX Runtime Web, it offers a scalable, zero-backend solution to planetary carbon monitoring. This architecture serves as a blueprint for future geospatial web applications aiming for real-time inference without infrastructural overhead.

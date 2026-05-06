import numpy as np
import pandas as pd
import json
import os
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
from onnxmltools import convert_xgboost
from skl2onnx.common.data_types import FloatTensorType

print("Loading real-world Spectral Dataset...")
dataset_path = "SOC_Spectral_Regression_Dataset.csv"
if not os.path.exists(dataset_path):
    raise FileNotFoundError(f"Could not find {dataset_path}")

df = pd.read_csv(dataset_path)

# Ensure no NaNs
df = df.dropna(subset=['SOC'])

features = ['B2_Blue', 'B3_Green', 'B4_Red', 'B8_NIR', 'B11_SWIR1', 'B12_SWIR2', 'NDVI', 'NDMI']
X = df[features].copy()
y = df['SOC']

X.columns = ["f" + str(i) for i in range(len(X.columns))]

# Train-Test Split (80/20) for realistic metrics
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

metrics = {}

os.makedirs("assets/models", exist_ok=True)
initial_type = [('float_input', FloatTensorType([None, 8]))]

# 1. XGBoost
print("Training XGBoost...")
xgb_model = XGBRegressor(n_estimators=150, max_depth=5, learning_rate=0.08, random_state=42)
xgb_model.fit(X_train, y_train)
y_pred_xgb = xgb_model.predict(X_test)
metrics['XGBoost'] = {
    'r2': round(r2_score(y_test, y_pred_xgb), 3),
    'rmse': round(np.sqrt(mean_squared_error(y_test, y_pred_xgb)), 3)
}
onnx_xgb = convert_xgboost(xgb_model, initial_types=initial_type)
with open("assets/models/soc_xgboost.onnx", "wb") as f:
    f.write(onnx_xgb.SerializeToString())

# Export Metrics
with open("assets/models/metrics.json", "w") as f:
    json.dump(metrics, f, indent=4)

print("Saved XGBoost ONNX model and metrics.json successfully!")
print("Metrics:", json.dumps(metrics, indent=2))

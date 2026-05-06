from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd
import subprocess
import os
import sys

# Serve the static files from the current directory (index.html, js, css, assets)
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/retrain', methods=['POST'])
def retrain():
    # Expects a CSV file upload named 'dataset'
    if 'dataset' not in request.files:
        return jsonify({'error': 'No file part. Please upload a dataset.'}), 400
        
    file = request.files['dataset']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    try:
        new_df = pd.read_csv(file)
    except Exception as e:
        return jsonify({'error': f'Invalid CSV format: {str(e)}'}), 400
        
    # Basic validation: ensure the target 'SOC' and features exist
    if 'SOC' not in new_df.columns:
         return jsonify({'error': 'Missing required column: SOC'}), 400
         
    # Append to existing dataset
    dataset_path = 'SOC_Spectral_Regression_Dataset.csv'
    try:
        if os.path.exists(dataset_path):
            existing_df = pd.read_csv(dataset_path)
            combined_df = pd.concat([existing_df, new_df], ignore_index=True)
        else:
            combined_df = new_df
            
        # Write back
        combined_df.to_csv(dataset_path, index=False)
    except Exception as e:
        return jsonify({'error': f'Error saving data: {str(e)}'}), 500
    
    # Trigger model training in the background
    try:
        # We use current python executable as per the successful environment check
        result = subprocess.run([sys.executable, 'train_model.py'], capture_output=True, text=True, check=True)
        return jsonify({'message': 'Retraining successful', 'logs': result.stdout}), 200
    except subprocess.CalledProcessError as e:
        return jsonify({'error': 'Model training script failed', 'details': e.stderr}), 500

if __name__ == '__main__':
    # Runs on port 8080 replacing python3 -m http.server
    print("Starting Advanced SOC Flask Server on http://localhost:8080")
    app.run(port=8080, debug=True)

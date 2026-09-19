from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
from shapely.geometry import shape
from shapely.ops import transform
import rasterio
from rasterio.mask import mask
from pyproj import Transformer
import math
from statistics import mean, pstdev
from sklearn.linear_model import LinearRegression

app = FastAPI(title="TerraScope Engine API")

class AnalyzeNdviRequest(BaseModel):
class AnalyzeIndicesRequest(BaseModel):
    languageCode: str = "en-IN"
    plantingDate: str = None
    harvestDate: str = None
    observations: list

@app.post("/analyze-ndvi")
def analyze_ndvi(payload: AnalyzeNdviRequest):
@app.post("/analyze-indices")
def analyze_indices(payload: AnalyzeIndicesRequest):
    from datetime import datetime
    
    values = []
    dates = []
    for obs in payload.observations:
        if "ndvi_value" not in obs:
            continue
        try:
            val = float(obs["ndvi_value"])
            # Try to parse date if available for more accurate modeling
            d_str = obs.get("observed_on", "")
            if d_str:
                d = datetime.strptime(d_str[:10], "%Y-%m-%d")
            else:
                d = None
            if math.isfinite(val):
                values.append(val)
                dates.append(d)
        except (ValueError, TypeError):
            continue

    if not values:
        if payload.languageCode == "hi-IN":
            return {"status": "insufficient_data", "statusLabel": "डेटा उपलब्ध नहीं", "summary": "कम से कम दो NDVI observations जोड़ें।", "observations": 0}
        return {"status": "insufficient_data", "statusLabel": "Not enough data", "summary": "Add at least two NDVI observations to analyse the trend.", "observations": 0}

    sample_count = len(values)
    features = [[i] for i in range(sample_count)]
    
    # Use days since planting if available and all dates are valid
    if payload.plantingDate and all(dates):
        try:
            p_date = datetime.strptime(payload.plantingDate[:10], "%Y-%m-%d")
            features = [[(d - p_date).days] for d in dates]
            # Predict for 7 days after the last observation
            next_feature = [[features[-1][0] + 7]]
        except ValueError:
            features = [[i] for i in range(sample_count)]
            next_feature = [[sample_count]]
    else:
        features = [[i] for i in range(sample_count)]
        next_feature = [[sample_count]]

    model = LinearRegression().fit(features, values)
    slope = float(model.coef_[0])
    average = mean(values)
    volatility = pstdev(values) if sample_count > 1 else 0.0
    next_value = float(model.predict([[sample_count]])[0])
    next_value = float(model.predict(next_feature)[0])
    
    # Mathematical Growth Stage approximation based on recent trajectory & value
    recent_val = values[-1]
    stage = "vegetative"
    if average < 0.25 and slope > 0.001:
        stage = "emergence"
    elif average > 0.6 and slope > -0.005 and slope < 0.005:
        stage = "peak_maturity"
    elif average > 0.4 and slope < -0.01:
        stage = "senescence"

    if slope > 0.001:
        trend = "improving"
        trend_label = "सुधार" if payload.languageCode == "hi-IN" else "Improving"
    elif slope < -0.001:
        trend = "declining"
        trend_label = "गिरावट" if payload.languageCode == "hi-IN" else "Declining"
    else:
        trend = "stable"
        trend_label = "स्थिर" if payload.languageCode == "hi-IN" else "Stable"

    if payload.languageCode == "hi-IN":
        summary = f"NDVI trend {trend_label.lower()} है। अगले observation का अनुमान {next_value:.3f} है।"
        summary = f"NDVI trend {trend_label.lower()} है। अगले observation का अनुमान {next_value:.3f} है। वर्तमान अवस्था: {stage}।"
        recommendation = "गिरावट जारी हो तो field inspection और moisture data की जाँच करें।" if trend == "declining" else "अगले satellite observation के साथ trend की निगरानी जारी रखें।"
    else:
        summary = f"NDVI trend is {trend_label.lower()}. The next observation is estimated at {next_value:.3f}."
        summary = f"NDVI trend is {trend_label.lower()}. The next observation is estimated at {next_value:.3f}. Estimated stage: {stage}."
        recommendation = "Inspect the field and review moisture data if the decline continues." if trend == "declining" else "Keep monitoring with the next satellite observation."

    return {
        "status": "analysed",
        "statusLabel": trend_label,
        "trend": trend,
        "stage": stage,
        "summary": summary,
        "recommendation": recommendation,
        "observations": sample_count,
        "average": round(average, 4),
        "slopePerObservation": round(slope, 5),
        "volatility": round(volatility, 4),
        "predictedNext": round(next_value, 4),
        "rSquared": round(float(model.score(features, values)), 4) if sample_count > 1 else None
    }


class CalculateIndicesRequest(BaseModel):
    blueUrl: str = None
    redUrl: str
    redEdgeUrl: str = None
    nirUrl: str
    swirUrl: str = None
    sclUrl: str = None
    polygonGeojson: dict

@app.post("/calculate-indices")
def calculate_indices(payload: CalculateIndicesRequest):
    try:
        geom = shape(payload.polygonGeojson)
        
        with rasterio.open(payload.redUrl) as src:
            raster_crs = src.crs
            transformer = Transformer.from_crs("EPSG:4326", raster_crs, always_xy=True)
            projected_geom = transform(transformer.transform, geom)
            red_image, _ = mask(src, [projected_geom], crop=True)
            red_image, out_transform = mask(src, [projected_geom], crop=True)
            red_band = red_image[0].astype(float)
            
        with rasterio.open(payload.nirUrl) as src:
            nir_image, _ = mask(src, [projected_geom], crop=True)
            nir_band = nir_image[0].astype(float)
            
        valid_mask = (red_band != 0) & (nir_band != 0)
        
        if payload.sclUrl:
            with rasterio.open(payload.sclUrl) as src:
                scl_image, _ = mask(src, [projected_geom], crop=True)
                scl_band = scl_image[0]
                invalid_scl = np.isin(scl_band, [1, 2, 3, 8, 9, 10, 11])
                valid_mask = valid_mask & (~invalid_scl)
                
        if not np.any(valid_mask):
            raise HTTPException(status_code=422, detail="No valid pixels found in field boundary (possibly clouded)")
            
        red_valid = red_band[valid_mask]
        nir_valid = nir_band[valid_mask]
        
        denominator = nir_valid + red_valid
        denominator = nir_band + red_band
        zero_mask = denominator == 0
        ndvi = np.zeros_like(denominator)
        ndvi[~zero_mask] = (nir_valid[~zero_mask] - red_valid[~zero_mask]) / denominator[~zero_mask]
        ndvi[~zero_mask] = (nir_band[~zero_mask] - red_band[~zero_mask]) / denominator[~zero_mask]
        
        mean_ndvi = float(np.mean(ndvi))
        mean_ndvi = float(np.mean(ndvi[valid_mask & ~zero_mask]))
        
        # Stress Zone Detection
        stress_geojson = None
        valid_pixel_count = int(np.sum(valid_mask))
        if valid_pixel_count > 10:
            std_ndvi = float(np.std(ndvi[valid_mask & ~zero_mask]))
            stress_threshold = mean_ndvi - 1.5 * std_ndvi
            
            # 2D Mask of stress pixels
            stress_mask = (ndvi < stress_threshold) & valid_mask & (~zero_mask)
            
            if np.any(stress_mask):
                from rasterio.features import shapes
                from shapely.geometry import shape as shp
                from pyproj import Transformer
                from shapely.ops import transform as shp_transform
                
                # Transform back to EPSG:4326
                inv_transformer = Transformer.from_crs(raster_crs, "EPSG:4326", always_xy=True)
                
                polygons = []
                # shapes generator returns (geojson_dict, value)
                for geom_dict, val in shapes(stress_mask.astype('uint8'), mask=stress_mask, transform=out_transform):
                    if val == 1:
                        # Reproject each polygon to WGS84
                        p = shp(geom_dict)
                        p_wgs84 = shp_transform(inv_transformer.transform, p)
                        polygons.append(p_wgs84)
                        
                if polygons:
                    from shapely.geometry import MultiPolygon, mapping
                    multi_poly = MultiPolygon(polygons)
                    stress_geojson = mapping(multi_poly)
        
        # Additional Indices
        red_valid = red_band[valid_mask]
        nir_valid = nir_band[valid_mask]
        
        mean_savi = None
        if len(red_valid) > 0:
            L = 0.5
            savi = ((nir_valid - red_valid) / (nir_valid + red_valid + L)) * (1 + L)
            mean_savi = float(np.mean(savi))
            
        mean_evi = None
        if payload.blueUrl:
            with rasterio.open(payload.blueUrl) as src:
                blue_image, _ = mask(src, [projected_geom], crop=True)
                blue_valid = blue_image[0].astype(float)[valid_mask]
                evi_denom = nir_valid + 6.0 * red_valid - 7.5 * blue_valid + 1.0
                # Assuming reflectance is scaled by 10000 in Sentinel-2 L2A STAC assets,
                # EVI coefficients (1.0) might need scaling if bands aren't 0-1.
                # Usually STAC Element84 L2A scale factor is 0.0001 (or stored as 1-10000).
                # To be scientifically rigorous without knowing scale, standard EVI might blow up.
                # Let's scale if max > 1.
                scale = 10000.0 if np.max(nir_valid) > 1.5 else 1.0
                evi_num = 2.5 * (nir_valid - red_valid)
                evi_denom_scaled = nir_valid + 6.0 * red_valid - 7.5 * blue_valid + (1.0 * scale)
                evi_zero_mask = evi_denom_scaled == 0
                evi = np.zeros_like(evi_denom_scaled)
                evi[~evi_zero_mask] = evi_num[~evi_zero_mask] / evi_denom_scaled[~evi_zero_mask]
                mean_evi = float(np.mean(evi))
                
        mean_ndre = None
        if payload.redEdgeUrl:
            with rasterio.open(payload.redEdgeUrl) as src:
                re_image, _ = mask(src, [projected_geom], crop=True)
                re_valid = re_image[0].astype(float)[valid_mask]
                ndre_denom = nir_valid + re_valid
                ndre_zero_mask = ndre_denom == 0
                ndre = np.zeros_like(ndre_denom)
                ndre[~ndre_zero_mask] = (nir_valid[~ndre_zero_mask] - re_valid[~ndre_zero_mask]) / ndre_denom[~ndre_zero_mask]
                mean_ndre = float(np.mean(ndre))
                
        mean_ndmi = None
        if payload.swirUrl:
            with rasterio.open(payload.swirUrl) as src:
                swir_image, _ = mask(src, [projected_geom], crop=True)
                swir_valid = swir_image[0].astype(float)[valid_mask]
                ndmi_denom = nir_valid + swir_valid
                ndmi_zero_mask = ndmi_denom == 0
                ndmi = np.zeros_like(ndmi_denom)
                ndmi[~ndmi_zero_mask] = (nir_valid[~ndmi_zero_mask] - swir_valid[~ndmi_zero_mask]) / ndmi_denom[~ndmi_zero_mask]
                mean_ndmi = float(np.mean(ndmi))
        
        valid_pixels = int(np.sum(valid_mask))
        
        return {
            "ndvi": round(mean_ndvi, 4),
            "ndre": round(mean_ndre, 4) if mean_ndre is not None else None,
            "ndmi": round(mean_ndmi, 4) if mean_ndmi is not None else None,
            "savi": round(mean_savi, 4) if mean_savi is not None else None,
            "evi": round(mean_evi, 4) if mean_evi is not None else None,
            "validPixels": valid_pixels
            "validPixels": valid_pixel_count,
            "stressGeojson": stress_geojson
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


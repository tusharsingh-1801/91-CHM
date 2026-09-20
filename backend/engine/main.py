from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import numpy as np
from shapely.geometry import shape
from shapely.ops import transform
import rasterio
from rasterio.mask import mask
from rasterio.features import geometry_mask, shapes
from rasterio.warp import reproject, Resampling
from pyproj import Transformer
import math
from statistics import mean, pstdev
import base64
import io
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from rio_tiler.io import Reader
from fastapi import Response
from sklearn.linear_model import LinearRegression

app = FastAPI(title="TerraScope Engine API")

class AnalyzeIndicesRequest(BaseModel):
    languageCode: str = "en-IN"
    plantingDate: str = None
    harvestDate: str = None
    observations: list

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
        summary = f"NDVI trend {trend_label.lower()} है। अगले observation का अनुमान {next_value:.3f} है। वर्तमान अवस्था: {stage}।"
        recommendation = "गिरावट जारी हो तो field inspection और moisture data की जाँच करें।" if trend == "declining" else "अगले satellite observation के साथ trend की निगरानी जारी रखें।"
    else:
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
        if geom.is_empty or geom.geom_type != "Polygon" or not geom.is_valid:
            raise HTTPException(status_code=422, detail="A valid Polygon field boundary is required")

        # Red is the reference grid. Every other Sentinel band is explicitly
        # reprojected/resampled to this grid before masks or formulas are used.
        with rasterio.open(payload.redUrl) as src:
            raster_crs = src.crs
            if raster_crs is None:
                raise HTTPException(status_code=422, detail="Red band has no CRS")
            transformer = Transformer.from_crs("EPSG:4326", raster_crs, always_xy=True)
            projected_geom = transform(transformer.transform, geom)
            red_image, out_transform = mask(src, [projected_geom], crop=True)
            red_band = red_image[0].astype(float)

        target_shape = red_band.shape
        inside_field = geometry_mask(
            [projected_geom.__geo_interface__],
            out_shape=target_shape,
            transform=out_transform,
            invert=True,
        )

        def aligned_band(url, resampling=Resampling.bilinear):
            destination = np.full(target_shape, np.nan, dtype=np.float32)
            with rasterio.open(url) as src:
                if src.crs is None:
                    raise HTTPException(status_code=422, detail=f"Band has no CRS: {url}")
                reproject(
                    source=rasterio.band(src, 1),
                    destination=destination,
                    src_transform=src.transform,
                    src_crs=src.crs,
                    src_nodata=src.nodata,
                    dst_transform=out_transform,
                    dst_crs=raster_crs,
                    dst_nodata=np.nan,
                    resampling=resampling,
                )
            return destination

        def reflectance(band):
            finite = band[np.isfinite(band)]
            if finite.size and float(np.nanpercentile(finite, 99)) > 2.0:
                return band * 0.0001
            return band

        red_band = reflectance(red_band)
        nir_band = reflectance(aligned_band(payload.nirUrl))
        valid_mask = inside_field & np.isfinite(red_band) & np.isfinite(nir_band) & (red_band > 0) & (nir_band > 0)

        if payload.sclUrl:
            scl_band = aligned_band(payload.sclUrl, Resampling.nearest)
            invalid_scl = ~np.isfinite(scl_band) | np.isin(scl_band.astype(np.int16), [0, 1, 2, 3, 8, 9, 10, 11])
            valid_mask &= ~invalid_scl

        if not np.any(valid_mask):
            raise HTTPException(status_code=422, detail="No valid pixels found in field boundary (possibly clouded)")

        denominator = nir_band + red_band
        ndvi_mask = valid_mask & np.isfinite(denominator) & (np.abs(denominator) > 1e-12)
        ndvi = np.full(target_shape, np.nan, dtype=np.float32)
        ndvi[ndvi_mask] = (nir_band[ndvi_mask] - red_band[ndvi_mask]) / denominator[ndvi_mask]
        ndvi_values = ndvi[ndvi_mask]
        if not ndvi_values.size:
            raise HTTPException(status_code=422, detail="No valid NDVI pixels remain after masking")

        mean_ndvi = float(np.mean(ndvi_values))
        valid_pixel_count = int(ndvi_values.size)
        field_pixel_count = int(np.sum(inside_field))
        valid_coverage = (valid_pixel_count / field_pixel_count * 100.0) if field_pixel_count else 0.0
        if valid_coverage < 10:
            raise HTTPException(status_code=422, detail="Less than 10% of the field has valid satellite pixels")

        # Stress Zone Detection
        stress_geojson = None
        if valid_pixel_count > 10:
            std_ndvi = float(np.std(ndvi_values))
            stress_threshold = mean_ndvi - 1.5 * std_ndvi
            stress_mask = (ndvi < stress_threshold) & ndvi_mask

            if np.any(stress_mask):
                from shapely.geometry import shape as shp
                from shapely.ops import transform as shp_transform
                inv_transformer = Transformer.from_crs(raster_crs, "EPSG:4326", always_xy=True)
                polygons = []
                for geom_dict, val in shapes(stress_mask.astype('uint8'), mask=stress_mask, transform=out_transform):
                    if val == 1:
                        p = shp(geom_dict)
                        p_wgs84 = shp_transform(inv_transformer.transform, p)
                        polygons.append(p_wgs84)
                if polygons:
                    from shapely.geometry import MultiPolygon, mapping
                    multi_poly = MultiPolygon(polygons)
                    stress_geojson = mapping(multi_poly)

        # Additional Indices
        red_valid = red_band[ndvi_mask]
        nir_valid = nir_band[ndvi_mask]
        savi_denom = nir_valid + red_valid + 0.5
        savi_valid = np.abs(savi_denom) > 1e-12
        mean_savi = float(np.mean(((nir_valid[savi_valid] - red_valid[savi_valid]) / savi_denom[savi_valid]) * 1.5)) if np.any(savi_valid) else None

        mean_evi = None
        if payload.blueUrl:
            blue_band = reflectance(aligned_band(payload.blueUrl))
            evi_mask = ndvi_mask & np.isfinite(blue_band)
            evi_denom = nir_band + 6.0 * red_band - 7.5 * blue_band + 1.0
            evi_mask &= np.abs(evi_denom) > 1e-12
            if np.any(evi_mask):
                mean_evi = float(np.mean(2.5 * (nir_band[evi_mask] - red_band[evi_mask]) / evi_denom[evi_mask]))

        mean_ndre = None
        if payload.redEdgeUrl:
            red_edge = reflectance(aligned_band(payload.redEdgeUrl))
            ndre_denom = nir_band + red_edge
            ndre_mask = ndvi_mask & np.isfinite(red_edge) & (np.abs(ndre_denom) > 1e-12)
            if np.any(ndre_mask):
                mean_ndre = float(np.mean((nir_band[ndre_mask] - red_edge[ndre_mask]) / ndre_denom[ndre_mask]))

        mean_ndmi = None
        if payload.swirUrl:
            swir_band = reflectance(aligned_band(payload.swirUrl))
            ndmi_denom = nir_band + swir_band
            ndmi_mask = ndvi_mask & np.isfinite(swir_band) & (np.abs(ndmi_denom) > 1e-12)
            if np.any(ndmi_mask):
                mean_ndmi = float(np.mean((nir_band[ndmi_mask] - swir_band[ndmi_mask]) / ndmi_denom[ndmi_mask]))

        return {
            "ndvi": round(mean_ndvi, 4),
            "ndre": round(mean_ndre, 4) if mean_ndre is not None else None,
            "ndmi": round(mean_ndmi, 4) if mean_ndmi is not None else None,
            "savi": round(mean_savi, 4) if mean_savi is not None else None,
            "evi": round(mean_evi, 4) if mean_evi is not None else None,
            "validPixels": valid_pixel_count,
            "validCoverage": round(valid_coverage, 2),
            "minimum": round(float(np.min(ndvi_values)), 4),
            "maximum": round(float(np.max(ndvi_values)), 4),
            "median": round(float(np.median(ndvi_values)), 4),
            "standardDeviation": round(float(np.std(ndvi_values)), 4),
            "stressGeojson": stress_geojson
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "TerraScope Engine API"}

class GenerateOverlayRequest(BaseModel):
    redUrl: str
    nirUrl: str
    polygonGeojson: dict

@app.post("/generate-overlay")
def generate_overlay(payload: GenerateOverlayRequest):
    try:
        geom = shape(payload.polygonGeojson)
        
        with rasterio.open(payload.redUrl) as src:
            raster_crs = src.crs
            transformer = Transformer.from_crs("EPSG:4326", raster_crs, always_xy=True)
            projected_geom = transform(transformer.transform, geom)
            red_image, out_transform = mask(src, [projected_geom], crop=True)
            red_band = red_image[0].astype(float)
            
            # Get bounds for the ground overlay
            bounds = rasterio.features.bounds(projected_geom)
            inv_transformer = Transformer.from_crs(raster_crs, "EPSG:4326", always_xy=True)
            min_lon, min_lat = inv_transformer.transform(bounds[0], bounds[1])
            max_lon, max_lat = inv_transformer.transform(bounds[2], bounds[3])
            
        with rasterio.open(payload.nirUrl) as src:
            nir_image, _ = mask(src, [projected_geom], crop=True)
            nir_band = nir_image[0].astype(float)
            
        valid_mask = (red_band != 0) & (nir_band != 0)
        
        denominator = nir_band + red_band
        zero_mask = denominator == 0
        ndvi = np.full_like(denominator, np.nan)
        ndvi[valid_mask & ~zero_mask] = (nir_band[valid_mask & ~zero_mask] - red_band[valid_mask & ~zero_mask]) / denominator[valid_mask & ~zero_mask]
        
        # Create a colormap for NDVI (Red-Yellow-Green)
        cmap = plt.get_cmap("RdYlGn")
        cmap.set_bad(color=(0, 0, 0, 0))
        
        norm = mcolors.Normalize(vmin=-0.2, vmax=1.0)
        rgba_image = cmap(norm(ndvi))
        
        # Apply alpha to valid pixels only
        rgba_image[~valid_mask | zero_mask, 3] = 0.0 
        
        fig, ax = plt.subplots(figsize=(rgba_image.shape[1]/100, rgba_image.shape[0]/100), dpi=100)
        ax.imshow(rgba_image)
        ax.axis('off')
        fig.patch.set_alpha(0)
        ax.patch.set_alpha(0)
        plt.subplots_adjust(top=1, bottom=0, right=1, left=0, hspace=0, wspace=0)
        plt.margins(0, 0)
        
        buf = io.BytesIO()
        plt.savefig(buf, format="png", transparent=True, pad_inches=0)
        buf.seek(0)
        image_base64 = base64.b64encode(buf.read()).decode('utf-8')
        plt.close(fig)
        
        return {
            "image": f"data:image/png;base64,{image_base64}",
            "bounds": {
                "north": max_lat,
                "south": min_lat,
                "east": max_lon,
                "west": min_lon
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class TileRequest(BaseModel):
    redUrl: str
    nirUrl: str
    polygonGeojson: dict = None

@app.post("/tiles/{z}/{x}/{y}.png")
def generate_tile(z: int, x: int, y: int, payload: TileRequest):
    try:
        with Reader(payload.redUrl) as red_src, Reader(payload.nirUrl) as nir_src:
            red_image = red_src.tile(x, y, z)
            nir_image = nir_src.tile(x, y, z)

        red_band = red_image.data[0].astype(float)
        nir_band = nir_image.data[0].astype(float)
        tile_mask = (red_image.mask != 0) & (nir_image.mask != 0)

        if payload.polygonGeojson and red_image.crs and red_image.transform:
            field_geom = shape(payload.polygonGeojson)
            transformer = Transformer.from_crs("EPSG:4326", red_image.crs, always_xy=True)
            projected_field = transform(transformer.transform, field_geom)
            tile_mask &= geometry_mask(
                [projected_field.__geo_interface__],
                out_shape=red_band.shape,
                transform=red_image.transform,
                invert=True,
            )
        
        valid_mask = (red_band != 0) & (nir_band != 0) & tile_mask
        denominator = nir_band + red_band
        zero_mask = denominator == 0
        
        ndvi = np.full_like(denominator, np.nan)
        ndvi[valid_mask & ~zero_mask] = (nir_band[valid_mask & ~zero_mask] - red_band[valid_mask & ~zero_mask]) / denominator[valid_mask & ~zero_mask]
        
        cmap = plt.get_cmap("RdYlGn")
        cmap.set_bad(color=(0, 0, 0, 0))
        norm = mcolors.Normalize(vmin=-0.2, vmax=1.0)
        rgba_image = cmap(norm(ndvi))
        
        # Apply alpha to valid pixels only
        rgba_image[~valid_mask | zero_mask, 3] = 0.0
        
        # Convert to 8-bit image array
        img_array = (rgba_image * 255).astype(np.uint8)
        
        from PIL import Image
        img = Image.fromarray(img_array, mode="RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        
        return Response(content=buf.read(), media_type="image/png")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=502, detail=f"NDVI tile generation failed: {e}")

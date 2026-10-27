from datetime import datetime
from typing import Optional
import base64
import io
import math
import numpy as np
import rasterio
from rasterio.features import geometry_mask, shapes
from rasterio.transform import from_bounds
from rasterio.warp import Resampling
from rasterio.vrt import WarpedVRT
from shapely.geometry import shape, mapping, MultiPolygon
from shapely.ops import transform
from pyproj import Transformer
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from PIL import Image
from backend.engine import earth_engine
import matplotlib
matplotlib.use('Agg')
from matplotlib import colormaps
from matplotlib.colors import Normalize

app = FastAPI(title='TerraScope Engine API')
CALCULATION_VERSION = 'sentinel-reflectance-scl-v2'
INVALID_SCL = [0, 1, 2, 3, 8, 9, 10, 11]
MAX_PIXELS = 4_000_000

@app.get('/')
def root():
    return {'service': 'TerraScope Engine API', 'health': '/health', 'docs': '/docs'}

@app.get('/health')
def health_check():
    return {'status': 'ok', 'service': 'TerraScope Engine API'}

class AnalyzeIndicesRequest(BaseModel):
    languageCode: str = 'en-IN'
    plantingDate: Optional[str] = None
    harvestDate: Optional[str] = None
    observations: list

@app.post('/analyze-indices')
def analyze_indices(payload: AnalyzeIndicesRequest):
    # Average duplicates on a date, never give them extra weight or invent elapsed time.
    grouped = {}
    for obs in payload.observations:
        try:
            day = datetime.strptime(str(obs['observed_on'])[:10], '%Y-%m-%d').date()
            value = float(obs['ndvi_value'])
            if math.isfinite(value) and -1 <= value <= 1:
                grouped.setdefault(day, []).append(value)
        except (KeyError, TypeError, ValueError):
            continue
    dates = sorted(grouped)
    values = np.array([np.mean(grouped[day]) for day in dates])
    count = len(dates)
    hindi = payload.languageCode == 'hi-IN'
    result = {'observations': count, 'dateStart': dates[0].isoformat() if count else None,
              'dateEnd': dates[-1].isoformat() if count else None, 'stage': None,
              'predictedNext': None, 'rSquared': None, 'slopePerDay': None,
              'slopeUnits': 'NDVI/day', 'interpretation': 'Descriptive change, not an agricultural prediction'}
    if count < 2:
        return {**result, 'status': 'insufficient_data', 'statusLabel': 'पर्याप्त डेटा नहीं' if hindi else 'Not enough data',
                'summary': 'बदलाव देखने के लिए दो अलग तारीखों की उपयोगी तस्वीरें चाहिए।' if hindi else 'Two distinct dated, usable images are needed to describe change.'}
    elapsed = np.array([(day-dates[0]).days for day in dates], dtype=float)
    slope = float(np.polyfit(elapsed, values, 1)[0])
    change = float(values[-1]-values[0])
    trend = 'declining' if slope < -.001 else 'improving' if slope > .001 else 'stable'
    label = {'declining': 'Decreasing vegetation', 'improving': 'Increasing vegetation', 'stable': 'Little overall change'}[trend]
    if hindi:
        label = {'declining': 'हरियाली में कमी', 'improving': 'हरियाली में वृद्धि', 'stable': 'कुल बदलाव कम'}[trend]
    summary = (f'{count} तारीखों में {int(elapsed[-1])} दिनों के दौरान NDVI बदलाव {change:+.3f} है। यह बीमारी की पहचान या उपज का अनुमान नहीं है।' if hindi else
               f'Across {count} dates over {int(elapsed[-1])} days, NDVI changed by {change:+.3f}. This is not a disease diagnosis or yield forecast.')
    if count == 2:
        summary += ' केवल दो तस्वीरों की तुलना उपलब्ध है।' if hindi else 'Only a two-image comparison is available; a sustained trend is not established.'
    return {**result, 'status': 'analysed', 'statusLabel': label, 'trend': trend,
            'summary': summary, 'recommendation': 'खेत में जाकर फसल, कटाई और पानी की स्थिति की जाँच करें।' if hindi else 'Use a field visit and diary records to check crop stage, harvest, and water conditions.',
            'slopePerDay': round(slope, 6), 'average': round(float(np.mean(values)), 4),
            'volatility': round(float(np.std(values)), 4), 'change': round(change, 4)}

class BandTransform(BaseModel):
    scale: float
    offset: float = 0

class CalculateIndicesRequest(BaseModel):
    blueUrl: Optional[str] = None
    redUrl: str
    redEdgeUrl: Optional[str] = None
    nirUrl: str
    swirUrl: Optional[str] = None
    sclUrl: Optional[str] = None
    polygonGeojson: dict
    transforms: dict[str, BandTransform] = Field(default_factory=dict)

class TileRequest(CalculateIndicesRequest):
    pass

class GenerateOverlayRequest(CalculateIndicesRequest):
    pass

class EarthEngineScenesRequest(BaseModel):
    polygonGeojson: dict
    start: str
    end: str
    limit: int = Field(ge=1, le=20)

class EarthEngineImageRequest(BaseModel):
    imageId: str
    polygonGeojson: dict

def field_geometry(payload):
    try:
        geom = shape(payload.polygonGeojson)
        if geom.is_empty or geom.geom_type != 'Polygon' or not geom.is_valid:
            raise ValueError('Invalid polygon')
        return geom
    except Exception as exc:
        raise HTTPException(422, 'A valid Polygon boundary is required') from exc

def reference_grid(payload):
    geom = field_geometry(payload)
    with rasterio.open(payload.redUrl) as src:
        if src.crs is None:
            raise HTTPException(422, 'Red band has no CRS')
        projected = transform(Transformer.from_crs('EPSG:4326', src.crs, always_xy=True).transform, geom)
        # Include the WHOLE field in the denominator, even beyond the scene footprint.
        window = rasterio.windows.from_bounds(*projected.bounds, transform=src.transform)
        col, row = math.floor(window.col_off), math.floor(window.row_off)
        width = math.ceil(window.col_off + window.width)-col
        height = math.ceil(window.row_off + window.height)-row
        if width < 1 or height < 1 or width*height > MAX_PIXELS:
            raise HTTPException(422, 'Boundary is empty or too large to process safely')
        return src.crs, src.window_transform(rasterio.windows.Window(col, row, width, height)), width, height

def read_aligned(url, key, payload, grid, categorical=False):
    crs, affine, width, height = grid
    with rasterio.open(url) as src:
        if src.crs is None:
            raise HTTPException(422, 'Band has no CRS')
        metadata = payload.transforms.get(key)
        scale = metadata.scale if metadata else src.scales[0]
        offset = metadata.offset if metadata else src.offsets[0]
        if not categorical and metadata is None and scale == 1 and offset == 0 and np.issubdtype(np.dtype(src.dtypes[0]), np.integer):
            raise HTTPException(422, 'Integer reflectance band lacks scale/offset metadata; refusing to guess')
        if not math.isfinite(scale) or not math.isfinite(offset) or scale <= 0:
            raise HTTPException(422, 'Invalid reflectance scale/offset')
        with WarpedVRT(src, crs=crs, transform=affine, width=width, height=height,
                       dtype='float32', nodata=np.nan,
                       resampling=Resampling.nearest if categorical else Resampling.bilinear) as vrt:
            band = vrt.read(1, masked=True).astype(np.float64).filled(np.nan)
        return band if categorical else band*scale+offset

def normalized_difference(a, b, valid):
    denominator = a+b
    usable = valid & np.isfinite(a) & np.isfinite(b) & (a >= 0) & (b >= 0) & (np.abs(denominator) > 1e-12)
    result = np.full(a.shape, np.nan)
    np.divide(a-b, denominator, out=result, where=usable)
    return result

def ndvi_grid(payload, grid):
    crs, affine, width, height = grid
    geom = field_geometry(payload)
    projected = transform(Transformer.from_crs('EPSG:4326', crs, always_xy=True).transform, geom)
    inside = geometry_mask([mapping(projected)], out_shape=(height,width), transform=affine, invert=True)
    red = read_aligned(payload.redUrl, 'red', payload, grid)
    nir = read_aligned(payload.nirUrl, 'nir', payload, grid)
    valid = inside.copy()
    if not payload.sclUrl:
        raise HTTPException(422, 'A scene classification/cloud mask is required')
    scl = read_aligned(payload.sclUrl, 'scl', payload, grid, categorical=True)
    valid &= np.isfinite(scl) & ~np.isin(scl, INVALID_SCL)
    ndvi = normalized_difference(nir,red,valid)
    return ndvi, red, nir, inside, projected

def png(ndvi):
    rgba = colormaps['RdYlGn'](Normalize(vmin=-.2,vmax=1)(np.ma.masked_invalid(ndvi)))
    rgba[~np.isfinite(ndvi),3] = 0
    buf=io.BytesIO()
    Image.fromarray((rgba*255).astype(np.uint8),mode='RGBA').save(buf,format='PNG')
    return buf.getvalue()

@app.post('/calculate-indices')
def calculate_indices(payload: CalculateIndicesRequest):
    try:
        grid = reference_grid(payload)
        ndvi,red,nir,inside,_ = ndvi_grid(payload,grid)
        valid = np.isfinite(ndvi)
        values = ndvi[valid]
        if not values.size:
            raise HTTPException(422,'No valid pixels intersect the boundary after cloud/nodata masking')
        valid_coverage = values.size/max(1,int(inside.sum()))*100
        def optional_index(url,key):
            if not url: return None
            other=read_aligned(url,key,payload,grid)
            index=normalized_difference(nir,other,valid)
            return round(float(np.nanmean(index)),4) if np.isfinite(index).any() else None
        savi=1.5*(nir[valid]-red[valid])/(nir[valid]+red[valid]+.5)
        evi=None
        if payload.blueUrl:
            blue=read_aligned(payload.blueUrl,'blue',payload,grid)
            denominator=nir+6*red-7.5*blue+1
            mask=valid & np.isfinite(blue) & (blue >= 0) & (np.abs(denominator)>1e-12)
            if mask.any(): evi=round(float(np.mean(2.5*(nir[mask]-red[mask])/denominator[mask])),4)
        anomaly=valid & (ndvi < float(np.mean(values))-1.5*float(np.std(values)))
        polygons=[]
        transformer=Transformer.from_crs(grid[0],'EPSG:4326',always_xy=True)
        if values.size>10:
            for geometry,value in shapes(anomaly.astype('uint8'),mask=anomaly,transform=grid[1]):
                if value==1: polygons.append(transform(transformer.transform,shape(geometry)))
        return {'ndvi':round(float(np.mean(values)),4), 'ndre':optional_index(payload.redEdgeUrl,'rededge1'),
                'ndmi':optional_index(payload.swirUrl,'swir16'), 'savi':round(float(np.mean(savi)),4),'evi':evi,
                'validPixels':int(values.size),'validCoverage':round(valid_coverage,2),
                'minimum':round(float(values.min()),4),'maximum':round(float(values.max()),4),
                'median':round(float(np.median(values)),4),'standardDeviation':round(float(np.std(values)),4),
                'stressGeojson':mapping(MultiPolygon(polygons)) if polygons else None,
                'affectedCoverage':round(float(anomaly.sum())/max(1,int(inside.sum()))*100,2),
                'calculationVersion':CALCULATION_VERSION}
    except HTTPException: raise
    except Exception as exc: raise HTTPException(502,'Raster processing failed') from exc

@app.post('/earth-engine/scenes')
def earth_engine_scenes(payload: EarthEngineScenesRequest):
    return {'scenes': earth_engine.search_scenes(payload.polygonGeojson, payload.start, payload.end, payload.limit)}

@app.post('/earth-engine/calculate-indices')
def earth_engine_calculate_indices(payload: EarthEngineImageRequest):
    return earth_engine.calculate_indices(payload.imageId, payload.polygonGeojson)

@app.post('/earth-engine/generate-overlay')
def earth_engine_generate_overlay(payload: EarthEngineImageRequest):
    return earth_engine.generate_overlay(payload.imageId, payload.polygonGeojson)

@app.post('/earth-engine/tiles/{z}/{x}/{y}.png')
def earth_engine_tile(z: int, x: int, y: int, payload: EarthEngineImageRequest):
    return Response(content=earth_engine.get_tile(payload.imageId, payload.polygonGeojson, z, x, y),
                    media_type='image/png', headers={'Cache-Control': 'private, max-age=300'})

@app.post('/generate-overlay')
def generate_overlay(payload: GenerateOverlayRequest):
    try:
        native=reference_grid(payload)
        geom=field_geometry(payload)
        # Ground overlays must be north-up WGS84 images, not a UTM image stretched between two corners.
        width,height=native[2:]
        grid=('EPSG:4326',from_bounds(*geom.bounds,width,height),width,height)
        ndvi,*_=ndvi_grid(payload,grid)
        west,south,east,north=geom.bounds
        return {'image':'data:image/png;base64,'+base64.b64encode(png(ndvi)).decode(),
                'bounds':{'north':north,'south':south,'east':east,'west':west},'calculationVersion':CALCULATION_VERSION}
    except HTTPException: raise
    except Exception as exc: raise HTTPException(502,'Overlay processing failed') from exc

@app.post('/tiles/{z}/{x}/{y}.png')
def generate_tile(z: int,x: int,y: int,payload: TileRequest):
    if z<0 or z>20 or x<0 or y<0 or x>=2**z or y>=2**z:
        raise HTTPException(422,'Invalid map tile')
    try:
        half=20037508.342789244
        span=2*half/(2**z)
        west,north=-half+x*span,half-y*span
        grid=('EPSG:3857',from_bounds(west,north-span,west+span,north,256,256),256,256)
        ndvi,*_=ndvi_grid(payload,grid)
        return Response(content=png(ndvi),media_type='image/png',headers={'Cache-Control':'no-store'})
    except HTTPException: raise
    except Exception as exc: raise HTTPException(502,'NDVI tile processing failed') from exc

def photo_quality_assessment(image):
    """Visual capture checks, not crop/disease classification."""
    from PIL import ImageFilter, ImageStat
    sample=image.copy()
    sample.thumbnail((256, 256))
    grayscale=sample.convert('L')
    stat=ImageStat.Stat(grayscale)
    brightness=float(stat.mean[0])
    contrast=float(stat.stddev[0])
    # Variance of spatial edges detects low-detail/camera-shake risk; not a validated sharpness score.
    edges=grayscale.filter(ImageFilter.FIND_EDGES)
    sharpness=float(ImageStat.Stat(edges).stddev[0])
    width,height=image.size
    issues=[]
    if min(width,height)<480:
        issues.append('low_resolution')
    if brightness<48:
        issues.append('underexposed')
    elif brightness>220:
        issues.append('overexposed')
    if contrast<22:
        issues.append('low_contrast')
    if sharpness<14:
        issues.append('possible_blur')
    hints={
        'low_resolution':'Move closer and use a higher-resolution image.',
        'underexposed':'Retake in daylight without heavy shadows.',
        'overexposed':'Avoid harsh reflections and excessive direct light.',
        'low_contrast':'Move closer to the leaf and use a clear background.',
        'possible_blur':'Hold the camera steady and tap the leaf to focus.'
    }
    return {'status':'needs_review' if issues else 'ready_for_scouting',
            'issues':issues, 'suggestions':[hints[issue] for issue in issues],
            'width':width,'height':height,
            'metrics':{'brightness':round(brightness,1),'contrast':round(contrast,1),'edge_detail':round(sharpness,1)},
            'disclaimer':'Image capture quality only. No disease, crop health, pest, or model confidence prediction.'}

class PhotoRequest(BaseModel):
    image: str

@app.post('/inspect-photo')
def inspect_photo(payload: PhotoRequest):
    from PIL import ImageOps, ImageStat
    try:
        data=base64.b64decode(payload.image,validate=True)
        if len(data)>5*1024*1024:
            raise ValueError('Photo exceeds 5 MB')
        with Image.open(io.BytesIO(data)) as original:
            if original.format not in ('JPEG','PNG','WEBP') or original.width*original.height>20_000_000:
                raise ValueError('Use a JPEG, PNG or WebP photo under 20 megapixels')
            image=ImageOps.exif_transpose(original).convert('RGB')
            image.thumbnail((2048,2048))
            width,height=image.size
            assessment=photo_quality_assessment(image)
            quality='needs_review' if assessment['status']=='needs_review' else 'usable_for_scouting'
            output=io.BytesIO();image.save(output,format='JPEG',quality=88)
        return {'image':base64.b64encode(output.getvalue()).decode(),'width':width,'height':height,'quality':quality,
                'qualityNote':'Capture quality review only; not a disease diagnosis', 'assessment':assessment}
    except Exception as exc:
        raise HTTPException(422,'Photo could not be decoded safely. Use JPEG, PNG or WebP under 5 MB and 20 megapixels.') from exc

# Experimental maize leaf classification
from backend.engine.maize_inference import router as maize_router
app.include_router(maize_router)

// CHSM TerraScope — repository-aligned Google Earth Engine Code Editor workflow.
// Draw/import your real farm polygon in the Imports panel and name it geometry.
// This script exports to Drive; it does NOT write into the CHSM database.
//
// Mirrors shared/evidence.ts / backend/engine/earth_engine.py:
// Sentinel-2 SR Harmonized; 90-day search; cloud metadata <40%; up to 100
// candidate scenes; quality-test newest 6; SCL exclusions; coverage >=70%;
// >=10 valid pixels; NDVI/NDRE/NDMI/SAVI/EVI; 14-day freshness; NDVI decline
// >=0.10 as an inspection signal. WorldCereal is historical 2021 context only.

var CFG = {
  searchDays: 90,
  cloudLimit: 40,
  candidateLimit: 100,
  maxAttempts: 6,
  minCoverage: 70,
  minPixels: 10,
  freshDays: 14,
  declineThreshold: 0.10,
  scale: 10,
  maxPixels: 4000000,
  exportFolder: 'CHSM_GEE'
};

var S2 = 'COPERNICUS/S2_SR_HARMONIZED';
var WORLD_CEREAL = 'ESA/WorldCereal/2021/MODELS/v100';
var BAD_SCL = [0, 1, 2, 3, 8, 9, 10, 11];
var roi = geometry;
var endDate = ee.Date(Date.now()).advance(1, 'day');
var startDate = endDate.advance(-CFG.searchDays, 'day');

Map.centerObject(roi, 16);
Map.addLayer(ee.FeatureCollection([ee.Feature(roi)]).style({
  color: 'yellow', fillColor: '00000000', width: 2
}), {}, 'CHSM field boundary');

print('Field area (ha)', roi.area(1).divide(10000));
print('Search start', startDate.format('YYYY-MM-dd'));
print('Search end (exclusive)', endDate.format('YYYY-MM-dd'));

function makeIndices(raw) {
  var scl = raw.select('SCL');
  var valid = scl.mask();
  BAD_SCL.forEach(function(c) { valid = valid.and(scl.neq(c)); });

  var r = raw.select(['B2', 'B4', 'B5', 'B8', 'B11']).multiply(0.0001);
  var blue = r.select('B2');
  var red = r.select('B4');
  var redEdge = r.select('B5');
  var nir = r.select('B8');
  var swir = r.select('B11');

  var dvi = nir.add(red);
  var ndvi = nir.subtract(red).divide(dvi).updateMask(dvi.neq(0)).rename('ndvi');
  valid = valid.and(red.mask()).and(nir.mask()).and(ndvi.mask());
  ndvi = ndvi.updateMask(valid);

  var dre = nir.add(redEdge);
  var ndre = nir.subtract(redEdge).divide(dre)
    .updateMask(valid.and(dre.neq(0))).rename('ndre');
  var dmi = nir.add(swir);
  var ndmi = nir.subtract(swir).divide(dmi)
    .updateMask(valid.and(dmi.neq(0))).rename('ndmi');
  var savi = nir.subtract(red).multiply(1.5)
    .divide(nir.add(red).add(0.5)).updateMask(valid).rename('savi');
  var de = nir.add(red.multiply(6)).subtract(blue.multiply(7.5)).add(1);
  var evi = nir.subtract(red).multiply(2.5).divide(de)
    .updateMask(valid.and(de.neq(0))).rename('evi');

  return raw.addBands(ee.Image.cat([ndvi, ndre, ndmi, savi, evi]).clip(roi))
    .set('scene_id', raw.get('system:index'))
    .set('acquired_date', ee.Date(raw.get('system:time_start')).format('YYYY-MM-dd'));
}

var reducer = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.min(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.max(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.median(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.stdDev(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.count(), sharedInputs: true});

var totalPixels = ee.Number(ee.Image.constant(1).rename('n').clip(roi)
  .reduceRegion({
    reducer: ee.Reducer.count(), geometry: roi, scale: CFG.scale,
    maxPixels: CFG.maxPixels, tileScale: 4
  }).get('n', 0));

function summarize(raw) {
  var img = makeIndices(raw);
  var stats = img.select(['ndvi', 'ndre', 'ndmi', 'savi', 'evi'])
    .reduceRegion({
      reducer: reducer, geometry: roi, scale: CFG.scale,
      maxPixels: CFG.maxPixels, tileScale: 4
    });
  var pixels = ee.Number(stats.get('ndvi_count', 0));
  var coverage = pixels.divide(totalPixels.max(1)).multiply(100).min(100);
  var mean = ee.Number(stats.get('ndvi_mean', -999));
  var accepted = coverage.gte(CFG.minCoverage)
    .and(pixels.gte(CFG.minPixels))
    .and(mean.gte(-1)).and(mean.lte(1));
  var reason = ee.Algorithms.If(accepted, 'accepted',
    ee.Algorithms.If(pixels.lt(CFG.minPixels), 'not_enough_valid_pixels',
      ee.Algorithms.If(coverage.lt(CFG.minCoverage), 'coverage_below_threshold',
        'invalid_or_missing_ndvi')));
  return img.set(stats).set({
    scene_id: raw.get('system:index'),
    acquired_date: ee.Date(raw.get('system:time_start')).format('YYYY-MM-dd'),
    cloud_cover: raw.get('CLOUDY_PIXEL_PERCENTAGE'),
    valid_pixels: pixels,
    total_pixels: totalPixels,
    valid_coverage_percent: coverage,
    accepted: accepted,
    quality_reason: reason,
    source: S2,
    calculation_version: 'gee-sentinel-reflectance-scl-v1'
  });
}

var candidates = ee.ImageCollection(S2)
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CFG.cloudLimit))
  .sort('system:time_start', false)
  .limit(CFG.candidateLimit);
var attempts = candidates.limit(CFG.maxAttempts).map(summarize)
  .sort('system:time_start', false);
var accepted = attempts.filter(ee.Filter.eq('accepted', true))
  .sort('system:time_start', false);

print('Candidate scenes found', candidates.size());
print('Quality-tested scenes (maximum six)', attempts.size());
print('Accepted scenes', accepted.size());
print('Scene quality table', attempts);

var columns = [
  'scene_id', 'acquired_date', 'system:time_start', 'cloud_cover',
  'valid_pixels', 'total_pixels', 'valid_coverage_percent',
  'ndvi_mean', 'ndvi_min', 'ndvi_max', 'ndvi_median', 'ndvi_stdDev',
  'ndre_mean', 'ndmi_mean', 'savi_mean', 'evi_mean',
  'accepted', 'quality_reason', 'source', 'calculation_version'
];
var sceneTable = ee.FeatureCollection(attempts.toList(attempts.size()).map(function(item) {
  var img = ee.Image(item);
  return ee.Feature(null, img.toDictionary(columns));
}));

function exportSceneCsv() {
  Export.table.toDrive({
    collection: sceneTable,
    description: 'CHSM_GEE_scene_quality_statistics',
    folder: CFG.exportFolder,
    fileNamePrefix: 'chsm_scene_quality_statistics',
    fileFormat: 'CSV',
    selectors: columns
  });
}

// Historical crop reference only; not current crop identity.
var wc = ee.ImageCollection(WORLD_CEREAL)
  .filterBounds(roi)
  .filter(ee.Filter.eq('product', 'temporarycrops'))
  .filter(ee.Filter.eq('season', 'tc-annual'));
print('WorldCereal 2021 images', wc.size());
wc.size().evaluate(function(n) {
  if (!n || n < 1) {
    print('No WorldCereal annual temporary-crop image intersects this polygon.');
    return;
  }
  var w = wc.mosaic();
  var cls = w.select('classification');
  var conf = w.select('confidence');
  var area = ee.Image.pixelArea();
  var mapped = cls.mask();
  var sums = ee.Image.cat([
    area.updateMask(mapped).rename('mapped_m2'),
    area.updateMask(cls.eq(100)).rename('temporary_crop_m2'),
    conf.updateMask(mapped).multiply(area).rename('confidence_area_m2')
  ]).reduceRegion({
    reducer: ee.Reducer.sum(), geometry: roi, scale: 10,
    maxPixels: CFG.maxPixels, tileScale: 4
  });
  var mappedArea = ee.Number(sums.get('mapped_m2', 0));
  var cropArea = ee.Number(sums.get('temporary_crop_m2', 0));
  print('WorldCereal historical summary', ee.Dictionary({
    field_area_m2: roi.area(1),
    mapped_area_m2: mappedArea,
    mapped_coverage_percent: mappedArea.divide(roi.area(1).max(1)).multiply(100).min(100),
    temporary_crop_area_m2: cropArea,
    temporary_crop_percent_of_field: cropArea.divide(roi.area(1).max(1)).multiply(100).min(100),
    mean_confidence: ee.Number(sums.get('confidence_area_m2', 0)).divide(mappedArea.max(1)),
    warning: '2021 historical classification; not current crop identification'
  }));
  Map.addLayer(cls.clip(roi), {
    min: 0, max: 100, palette: ['ffffff', 'bdbdbd', '238443', '006837']
  }, 'WorldCereal 2021 historical classification', false);
});

accepted.size().evaluate(function(n) {
  if (!n || n < 1) {
    print('RESULT: no scene passed CHSM quality rules.');
    print('Keep the thresholds unchanged; try a wider search window or inspect the polygon.');
    exportSceneCsv();
    return;
  }

  var latest = ee.Image(accepted.first());
  var ageDays = endDate.difference(ee.Date(latest.get('system:time_start')), 'day');
  var ndviVis = {min: -0.2, max: 1, palette: ['a50026', 'ffffbf', '006837']};
  Map.addLayer(latest.select('ndvi'), ndviVis, 'Latest accepted NDVI');
  Map.addLayer(latest.select('ndre'), {
    min: -0.2, max: 0.8, palette: ['8c2d04', 'fdbb84', '7fbc41', '006837']
  }, 'Latest accepted NDRE', false);
  Map.addLayer(latest.select('ndmi'), {
    min: -0.5, max: 0.5, palette: ['a6611a', 'f5f5f5', '018571']
  }, 'Latest accepted NDMI', false);
  Map.addLayer(latest.select('savi'), ndviVis, 'Latest accepted SAVI', false);
  Map.addLayer(latest.select('evi'), ndviVis, 'Latest accepted EVI', false);
  Map.addLayer(latest, {
    bands: ['B4', 'B3', 'B2'], min: 200, max: 3000, gamma: 1.2
  }, 'Latest scene natural colour', false);

  print('Latest scene ID', latest.get('scene_id'));
  print('Latest acquisition date', latest.get('acquired_date'));
  print('Scene cloud metadata (%)', latest.get('cloud_cover'));
  print('Valid / total field pixels', latest.get('valid_pixels'), latest.get('total_pixels'));
  print('Valid field coverage (%)', latest.get('valid_coverage_percent'));
  print('NDVI mean/min/max/median/stdDev', latest.toDictionary([
    'ndvi_mean', 'ndvi_min', 'ndvi_max', 'ndvi_median', 'ndvi_stdDev'
  ]));
  print('NDRE / NDMI / SAVI / EVI means', latest.toDictionary([
    'ndre_mean', 'ndmi_mean', 'savi_mean', 'evi_mean'
  ]));
  print('Days since latest accepted image', ageDays);

  var state;
  if (n < 2) {
    state = 'not_enough_data: need a second comparable accepted image';
  } else {
    var previous = ee.Image(accepted.toList(2).get(1));
    var delta = ee.Number(latest.get('ndvi_mean'))
      .subtract(ee.Number(previous.get('ndvi_mean')));
    print('Previous accepted date', previous.get('acquired_date'));
    print('Latest minus previous NDVI mean', delta);
    state = ee.Algorithms.If(ageDays.gt(CFG.freshDays), 'image_too_old',
      ee.Algorithms.If(delta.lte(-CFG.declineThreshold),
        'needs_inspection', 'no_unusual_change_detected'));
  }
  print('CHSM evidence status (not a diagnosis)', state);

  print(ui.Chart.image.series({
    imageCollection: accepted.select('ndvi'),
    region: roi, reducer: ee.Reducer.mean(), scale: CFG.scale,
    xProperty: 'system:time_start'
  }).setOptions({
    title: 'CHSM — accepted-scene mean NDVI',
    hAxis: {title: 'Acquisition date'},
    vAxis: {title: 'Mean NDVI', viewWindow: {min: -1, max: 1}},
    lineWidth: 2, pointSize: 4
  }));

  // Exploratory display only; not a validated stress/disease model.
  var lowThreshold = ee.Number(latest.get('ndvi_mean'))
    .subtract(ee.Number(latest.get('ndvi_stdDev')).multiply(1.5));
  Map.addLayer(latest.select('ndvi').lt(lowThreshold).selfMask().clip(roi),
    {palette: ['ff00ff']}, 'Exploratory low-NDVI pixels (not diagnosis)', false);
  print('Exploratory low-NDVI threshold', lowThreshold);

  var summary = ee.Feature(null, {
    field_area_ha: roi.area(1).divide(10000),
    scene_id: latest.get('scene_id'),
    acquired_date: latest.get('acquired_date'),
    cloud_cover: latest.get('cloud_cover'),
    valid_pixels: latest.get('valid_pixels'),
    total_pixels: latest.get('total_pixels'),
    valid_coverage_percent: latest.get('valid_coverage_percent'),
    ndvi_mean: latest.get('ndvi_mean'),
    ndvi_min: latest.get('ndvi_min'),
    ndvi_max: latest.get('ndvi_max'),
    ndvi_median: latest.get('ndvi_median'),
    ndvi_stdDev: latest.get('ndvi_stdDev'),
    ndre_mean: latest.get('ndre_mean'),
    ndmi_mean: latest.get('ndmi_mean'),
    savi_mean: latest.get('savi_mean'),
    evi_mean: latest.get('evi_mean'),
    accepted: latest.get('accepted'),
    source: S2,
    calculation_version: 'gee-sentinel-reflectance-scl-v1',
    note: 'Remote-sensing indicators only; not a diagnosis or yield prediction'
  });

  Export.table.toDrive({
    collection: ee.FeatureCollection([summary]),
    description: 'CHSM_GEE_latest_field_summary',
    folder: CFG.exportFolder,
    fileNamePrefix: 'chsm_latest_field_summary',
    fileFormat: 'CSV'
  });
  Export.image.toDrive({
    image: latest.select(['ndvi', 'ndre', 'ndmi', 'savi', 'evi']),
    description: 'CHSM_GEE_latest_vegetation_indices',
    folder: CFG.exportFolder,
    fileNamePrefix: 'chsm_latest_vegetation_indices',
    region: roi, scale: CFG.scale, maxPixels: 1e9,
    fileFormat: 'GeoTIFF',
    formatOptions: {cloudOptimized: true}
  });
  exportSceneCsv();
  print('Export tasks created. Open Tasks and click Run for each export.');
});

print('Analysis configured. Review quality acceptance in the Console before interpreting results.');

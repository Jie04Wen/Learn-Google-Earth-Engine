// ============================================================
// GEE 从零入门课程：月度/年度合成、图表与三类导出
// ============================================================

var roi = ee.Geometry.Rectangle([100.55, 21.72, 101.10, 22.22]);
Map.centerObject(roi, 9);

// 1. 去云并添加 NDVI。
function prepareS2(image) {
  var scl = image.select('SCL');
  var mask = scl.neq(0)
    .and(scl.neq(1))
    .and(scl.neq(3))
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  var reflectance = image.updateMask(mask)
    .select(['B2', 'B3', 'B4', 'B8', 'B11'],
            ['blue', 'green', 'red', 'nir', 'swir1'])
    .multiply(0.0001);

  var ndvi = reflectance
    .normalizedDifference(['nir', 'red'])
    .rename('NDVI');

  return reflectance.addBands(ndvi)
    .copyProperties(image, ['system:time_start']);
}

var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2024-01-01', '2026-01-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
  .map(prepareS2);

// 2. 生成 2025 年 12 个月的 NDVI 中位数合成。
var months = ee.List.sequence(1, 12);
var monthlyNdvi = ee.ImageCollection.fromImages(
  months.map(function(month) {
    month = ee.Number(month);
    var start = ee.Date.fromYMD(2025, month, 1);
    var end = start.advance(1, 'month');
    return collection
      .filterDate(start, end)
      .select('NDVI')
      .median()
      .rename('NDVI')
      .set('month', month)
      .set('system:time_start', start.millis());
  })
);
print('2025 月度 NDVI 合成', monthlyNdvi);

// 3. 生成 2024—2025 年年度最大 NDVI 合成。
var years = ee.List.sequence(2024, 2025);
var annualMaxNdvi = ee.ImageCollection.fromImages(
  years.map(function(year) {
    year = ee.Number(year);
    var start = ee.Date.fromYMD(year, 1, 1);
    var end = start.advance(1, 'year');
    return collection
      .filterDate(start, end)
      .select('NDVI')
      .max()
      .rename('NDVI')
      .set('year', year)
      .set('system:time_start', start.millis());
  })
);
print('年度最大 NDVI 合成', annualMaxNdvi);

// 4. 显示 2025 年最大 NDVI。
var ndvi2025 = annualMaxNdvi
  .filter(ee.Filter.eq('year', 2025))
  .first()
  .clip(roi);
Map.addLayer(
  ndvi2025,
  {min: 0.2, max: 0.9, palette: ['F7FCB9', '78C679', '006837']},
  '2025 最大 NDVI'
);

// 5. 研究区月度 NDVI 折线图。
var monthlyChart = ui.Chart.image.series({
  imageCollection: monthlyNdvi,
  region: roi,
  reducer: ee.Reducer.mean(),
  scale: 100,
  xProperty: 'system:time_start'
}).setOptions({
  title: '2025 年研究区月度平均 NDVI',
  hAxis: {title: '月份', format: 'MM'},
  vAxis: {title: 'NDVI', viewWindow: {min: 0, max: 1}},
  lineWidth: 2,
  pointSize: 5,
  colors: ['2E7D32']
});
print(monthlyChart);

// 6. NDVI 直方图。
var histogram = ui.Chart.image.histogram({
  image: ndvi2025,
  region: roi,
  scale: 100,
  maxBuckets: 40
}).setOptions({
  title: '2025 年最大 NDVI 频率分布',
  hAxis: {title: 'NDVI'},
  vAxis: {title: '像元频数'},
  colors: ['388E3C']
});
print(histogram);

// 7. 导出影像到 Google Drive。运行脚本后到 Tasks 标签点击 Run。
Export.image.toDrive({
  image: ndvi2025.toFloat(),
  description: 'NDVI_2025_Max',
  folder: 'GEE_Course',
  fileNamePrefix: 'ndvi_2025_max',
  region: roi,
  scale: 20,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

// 8. 导出矢量研究区为 SHP。
var roiFeature = ee.Feature(roi, {name: 'Xishuangbanna_demo_roi'});
Export.table.toDrive({
  collection: ee.FeatureCollection([roiFeature]),
  description: 'ROI_Vector',
  folder: 'GEE_Course',
  fileNamePrefix: 'roi_vector',
  fileFormat: 'SHP'
});

// 9. 把年度区域均值转换为表格，再导出 CSV。
var annualTable = annualMaxNdvi.map(function(image) {
  var meanNdvi = image.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: roi,
    scale: 100,
    maxPixels: 1e9,
    tileScale: 4
  }).get('NDVI');

  return ee.Feature(null, {
    year: image.get('year'),
    mean_ndvi: meanNdvi
  });
});
print('年度 NDVI 表格', annualTable);

Export.table.toDrive({
  collection: annualTable,
  description: 'Annual_NDVI_Table',
  folder: 'GEE_Course',
  fileNamePrefix: 'annual_ndvi_table',
  fileFormat: 'CSV',
  selectors: ['year', 'mean_ndvi']
});

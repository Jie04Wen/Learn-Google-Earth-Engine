// ============================================================
// 08 GPT 生成 GEE 代码后的最小验收脚本
// 目的：不靠“地图看起来正常”，而用数量、波段、范围和图表留证。
// ============================================================

var roi = ee.Geometry.Rectangle([116.20, 39.80, 116.55, 40.10]);
var start = '2024-06-01';
var end = '2024-09-01';

function maskS2Sr(image) {
  var scl = image.select('SCL');
  var clear = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));
  return image.updateMask(clear)
    .select(['B4', 'B8'], ['red', 'nir'])
    .multiply(0.0001)
    .copyProperties(image, ['system:time_start']);
}

var source = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate(start, end)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
  .map(maskS2Sr);

var ndviCollection = source.map(function(image) {
  return image.normalizedDifference(['nir', 'red'])
    .rename('NDVI')
    .copyProperties(image, ['system:time_start']);
});
var candidate = ndviCollection.median().rename('NDVI').clip(roi);

// ---------- 1. 输入验收 ----------
print('QC-01 日期范围', start, end);
print('QC-02 ROI 面积 km²', roi.area(1).divide(1e6));
print('QC-03 影像数量（必须 > 0）', source.size());
print('QC-04 首景波段（应为 red, nir）', ee.Image(source.first()).bandNames());

// ---------- 2. 输出结构与数值验收 ----------
print('QC-05 候选结果波段（应为 NDVI）', candidate.bandNames());
print('QC-06 候选结果投影', candidate.projection());

var minMax = candidate.reduceRegion({
  reducer: ee.Reducer.minMax(),
  geometry: roi,
  scale: 30,
  maxPixels: 1e8,
  tileScale: 2
});
print('QC-07 NDVI 最小/最大值（理论范围 -1 到 1）', minMax);

var percentiles = candidate.reduceRegion({
  reducer: ee.Reducer.percentile([2, 25, 50, 75, 98]),
  geometry: roi,
  scale: 30,
  maxPixels: 1e8,
  tileScale: 2
});
print('QC-08 NDVI 分位数（检查异常分布）', percentiles);

// ---------- 3. 空间与时序验收 ----------
Map.centerObject(roi, 10);
Map.addLayer(candidate, {
  min: 0,
  max: 0.9,
  palette: ['8c510a', 'f6e8c3', '5ab4ac', '01665e']
}, '候选 NDVI');
Map.addLayer(ee.Image().paint(roi, 1, 2), {palette: ['00FFFF']}, 'ROI');

var histogram = ui.Chart.image.histogram({
  image: candidate,
  region: roi,
  scale: 30,
  maxBuckets: 40
}).setOptions({
  title: 'QC-09 NDVI 直方图',
  hAxis: {title: 'NDVI'},
  vAxis: {title: '像元数'},
  legend: {position: 'none'}
});
print(histogram);

var series = ui.Chart.image.series({
  imageCollection: ndviCollection,
  region: roi,
  reducer: ee.Reducer.mean(),
  scale: 30,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'QC-10 ROI 平均 NDVI 原始时序',
  hAxis: {title: '日期'},
  vAxis: {title: 'NDVI'},
  lineWidth: 1,
  pointSize: 3
});
print(series);

// ---------- 4. 人工验收清单 ----------
print('QC-11 人工检查：随机点击至少 5 个像元；对照真彩色或高分影像。');
print('QC-12 科学检查：确认时间窗、掩膜、单位、scale、CRS 与研究问题一致。');
print('QC-13 复现检查：保存脚本版本、数据 ID、参数和运行日期。');


// ============================================================
// GEE 从零入门课程：Geometry、Feature、FeatureCollection、
// Image 与 ImageCollection 完整示例
// ============================================================

// ---------- 1. Geometry：只有空间形状，没有业务属性 ----------
var roi = ee.Geometry.Rectangle([100.55, 21.72, 101.10, 22.22]);
Map.centerObject(roi, 9);
Map.addLayer(roi, {color: 'FFFFFF'}, '研究区');
print('Geometry 类型', roi);

// ---------- 2. Feature：Geometry + 属性字典 ----------
var plotA = ee.Feature(
  ee.Geometry.Point([100.72, 21.92]),
  {plot_id: 'A', forest_type: '常绿阔叶林', canopy: 0.82}
);
var plotB = ee.Feature(
  ee.Geometry.Point([100.91, 22.05]),
  {plot_id: 'B', forest_type: '人工林', canopy: 0.64}
);
print('Feature A', plotA);
print('A 的林型属性', plotA.get('forest_type'));

// ---------- 3. FeatureCollection：多个 Feature 的集合 ----------
var plots = ee.FeatureCollection([plotA, plotB]);
Map.addLayer(plots.style({color: 'FF00FF', pointSize: 6}), {}, '样地点');
print('FeatureCollection', plots);
print('样地数量', plots.size());
print('平均郁闭度', plots.aggregate_mean('canopy'));

// 属性筛选：保留 canopy 大于 0.7 的样地。
var densePlots = plots.filter(ee.Filter.gt('canopy', 0.7));
print('高郁闭度样地', densePlots);

// ---------- 4. Image：具有一个或多个波段的栅格影像 ----------
// 从 Sentinel-2 地表反射率集合中筛选并取得第一景影像。
var s2One = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2025-01-01', '2025-04-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .sort('CLOUDY_PIXEL_PERCENTAGE')
  .first();

// 打印波段和元数据；影像波段值按 10000 缩放。
print('单张 Sentinel-2 Image', s2One);
print('单张影像波段', s2One.bandNames());
print('影像日期', ee.Date(s2One.get('system:time_start')));

// 真彩色显示：红、绿、蓝分别对应 B4、B3、B2。
Map.addLayer(
  s2One.divide(10000).clip(roi),
  {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3},
  '单景 Sentinel-2 真彩色'
);

// ---------- 5. ImageCollection：具有相同意义的一组时序影像 ----------
var s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2025-01-01', '2026-01-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

print('Sentinel-2 ImageCollection', s2Collection);
print('影像数量', s2Collection.size());
print('最小云量', s2Collection.aggregate_min('CLOUDY_PIXEL_PERCENTAGE'));

// median() 沿时间维逐像元取中位数，得到一张合成 Image。
var medianImage = s2Collection.median().divide(10000).clip(roi);
Map.addLayer(
  medianImage,
  {bands: ['B8', 'B4', 'B3'], min: 0, max: 0.45},
  '年度中位数假彩色'
);

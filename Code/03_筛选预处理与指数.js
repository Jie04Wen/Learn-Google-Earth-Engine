// ============================================================
// GEE 从零入门课程：筛选、去云、镶嵌、裁剪与常用指数
// 数据：Sentinel-2 SR Harmonized
// ============================================================

// 1. 定义研究区与分析时段。
var roi = ee.Geometry.Rectangle([100.55, 21.72, 101.10, 22.22]);
var startDate = '2025-01-01';
var endDate = '2026-01-01'; // filterDate 的结束日期不包含当天。

// 2. SCL 去云函数。
function maskS2(image) {
  // SCL 是场景分类波段；下列类别需要剔除。
  var scl = image.select('SCL');
  var clearMask = scl.neq(0)   // 0：无数据
    .and(scl.neq(1))           // 1：饱和或坏像元
    .and(scl.neq(3))           // 3：云影
    .and(scl.neq(8))           // 8：中概率云
    .and(scl.neq(9))           // 9：高概率云
    .and(scl.neq(10))          // 10：卷云
    .and(scl.neq(11));         // 11：雪/冰

  // 选出常用波段、应用掩膜、缩放为 0—1 反射率，并复制时间属性。
  return image
    .updateMask(clearMask)
    .select(['B2', 'B3', 'B4', 'B8', 'B11'],
            ['blue', 'green', 'red', 'nir', 'swir1'])
    .multiply(0.0001)
    .copyProperties(image, ['system:time_start']);
}

// 3. 依次执行范围、时间、整景云量筛选，再做逐像元去云。
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
  .map(maskS2);

print('去云后的影像集合', s2);
print('筛选后的影像数量', s2.size());

// 4. mosaic() 按集合顺序覆盖；适合同一天或人为排序后的拼接。
var mosaicImage = s2.sort('system:time_start').mosaic().clip(roi);
Map.addLayer(
  mosaicImage,
  {bands: ['red', 'green', 'blue'], min: 0, max: 0.3},
  'mosaic 镶嵌',
  false
);

// 5. median() 对时序逐像元取中位数，通常比直接 mosaic 更稳健。
var composite = s2.median().clip(roi);
Map.centerObject(roi, 9);
Map.addLayer(
  composite,
  {bands: ['red', 'green', 'blue'], min: 0.02, max: 0.30},
  '中位数真彩色'
);

// 6. NDVI = (NIR - Red) / (NIR + Red)。
var ndvi = composite.normalizedDifference(['nir', 'red']).rename('NDVI');

// 7. EVI = 2.5*(NIR-Red)/(NIR+6*Red-7.5*Blue+1)。
var evi = composite.expression(
  '2.5 * (NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1)',
  {
    NIR: composite.select('nir'),
    RED: composite.select('red'),
    BLUE: composite.select('blue')
  }
).rename('EVI');

// 8. NDBI = (SWIR1 - NIR) / (SWIR1 + NIR)。
var ndbi = composite.normalizedDifference(['swir1', 'nir']).rename('NDBI');

// 9. NDWI（McFeeters）= (Green - NIR) / (Green + NIR)。
var ndwi = composite.normalizedDifference(['green', 'nir']).rename('NDWI');

// 10. SAVI = 1.5*(NIR-Red)/(NIR+Red+0.5)，适合稀疏植被。
var savi = composite.expression(
  '1.5 * (NIR - RED) / (NIR + RED + 0.5)',
  {
    NIR: composite.select('nir'),
    RED: composite.select('red')
  }
).rename('SAVI');

// 11. 设置显示参数并逐层添加。
var vegetationPalette = [
  '8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e'
];
Map.addLayer(ndvi, {min: -0.2, max: 0.9, palette: vegetationPalette}, 'NDVI');
Map.addLayer(evi, {min: -0.1, max: 0.8, palette: vegetationPalette}, 'EVI', false);
Map.addLayer(ndbi, {min: -0.5, max: 0.5, palette: ['006837', 'FFFFBF', 'A50026']}, 'NDBI', false);
Map.addLayer(ndwi, {min: -0.5, max: 0.5, palette: ['A6611A', 'F5F5F5', '018571']}, 'NDWI', false);
Map.addLayer(savi, {min: -0.1, max: 0.8, palette: vegetationPalette}, 'SAVI', false);

// 12. 把五个指数合成多波段影像，便于统一统计或导出。
var indices = ndvi.addBands([evi, ndbi, ndwi, savi]);
print('五指数多波段影像', indices);

// 13. 在研究区内计算均值、最小值和最大值。
var reducer = ee.Reducer.mean()
  .combine({reducer2: ee.Reducer.min(), sharedInputs: true})
  .combine({reducer2: ee.Reducer.max(), sharedInputs: true});

var statistics = indices.reduceRegion({
  reducer: reducer,
  geometry: roi,
  scale: 20,
  maxPixels: 1e9,
  tileScale: 4
});
print('研究区指数统计', statistics);

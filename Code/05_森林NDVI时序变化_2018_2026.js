// ============================================================================
// 完整实战项目：基于 GEE 的长时间序列森林植被动态监测与变化分析
// 研究区：西双版纳教学示范区（矩形 + 四个教学分区）
// 时段：2018—2026；为保证年际可比，默认每年使用 1 月 1 日—7 月 29 日
// 数据：默认 Sentinel-2 SR Harmonized，可一键切换 Landsat 8/9 C2 L2
// 输出：年度最大 NDVI、线性斜率、Sen's slope、Kendall tau、变化分类、统计表
// ============================================================================

// ------------------------------
// 0. 用户参数：通常只需修改这里
// ------------------------------
var DATA_SOURCE = 'S2';       // 可选：'S2' 或 'LANDSAT'
var START_YEAR = 2018;
var END_YEAR = 2026;
var WINDOW_END_MONTH = 7;     // 每年统一分析窗口的结束月
var WINDOW_END_DAY = 29;      // 每年统一分析窗口的结束日
var MAX_SCENE_CLOUD = 40;     // 整景云量初筛阈值（%）
var MIN_VALID_YEARS = 7;      // 至少有 7 个有效年度才进行趋势分类
var SLOPE_THRESHOLD = 0.005;  // NDVI/年；变化幅度阈值
var TAU_THRESHOLD = 0.40;     // Kendall tau；单调趋势强度阈值
var VEGETATION_NDVI = 0.60;   // “高植被覆盖”教学阈值
var EXPORT_FOLDER = 'GEE_Forest_NDVI_Project';

// Sentinel-2 原生 NDVI 分辨率为 10 m；Landsat 为 30 m。
var NATIVE_SCALE = DATA_SOURCE === 'S2' ? 10 : 30;
// 分区统计用 100 m，显著降低计算量；论文中可按研究需求改为原生尺度。
var STAT_SCALE = 100;

// ------------------------------
// 1. 研究区与四个教学分区
// ------------------------------
var roi = ee.Geometry.Rectangle([100.55, 21.72, 101.10, 22.22]);
var midLon = 100.825;
var midLat = 21.97;

var zones = ee.FeatureCollection([
  ee.Feature(
    ee.Geometry.Rectangle([100.55, midLat, midLon, 22.22]),
    {zone_id: 1, zone_name: '西北区'}
  ),
  ee.Feature(
    ee.Geometry.Rectangle([midLon, midLat, 101.10, 22.22]),
    {zone_id: 2, zone_name: '东北区'}
  ),
  ee.Feature(
    ee.Geometry.Rectangle([100.55, 21.72, midLon, midLat]),
    {zone_id: 3, zone_name: '西南区'}
  ),
  ee.Feature(
    ee.Geometry.Rectangle([midLon, 21.72, 101.10, midLat]),
    {zone_id: 4, zone_name: '东南区'}
  )
]);

Map.centerObject(roi, 9);
Map.addLayer(ee.Image().byte().paint(roi, 1, 2), {palette: ['FFFFFF']}, '研究区边界');
Map.addLayer(
  ee.Image().byte().paint(zones, 'zone_id', 2),
  {min: 1, max: 4, palette: ['00FFFF', 'FF00FF', 'FFFF00', '00FF00']},
  '四个教学分区'
);

// ------------------------------
// 2. 森林样本框：ESA WorldCover 2021 树木覆盖类（Map = 10）
// ------------------------------
var worldCover = ee.ImageCollection('ESA/WorldCover/v200').first().select('Map');
var forestMask = worldCover.eq(10).selfMask().rename('forest');
Map.addLayer(forestMask.clip(roi), {palette: ['006400']}, '2021 树木覆盖范围', false);

// ------------------------------
// 3A. Sentinel-2 预处理：SCL 去云 + 反射率缩放 + 波段统一命名
// ------------------------------
function prepareSentinel2(image) {
  var scl = image.select('SCL');
  var clearMask = scl.neq(0)   // 无数据
    .and(scl.neq(1))           // 饱和或坏像元
    .and(scl.neq(3))           // 云影
    .and(scl.neq(8))           // 中概率云
    .and(scl.neq(9))           // 高概率云
    .and(scl.neq(10))          // 卷云
    .and(scl.neq(11));         // 雪/冰

  return image
    .updateMask(clearMask)
    .select(['B2', 'B3', 'B4', 'B8', 'B11'],
            ['blue', 'green', 'red', 'nir', 'swir1'])
    .multiply(0.0001)
    .copyProperties(image, ['system:time_start']);
}

// ------------------------------
// 3B. Landsat 8/9 预处理：QA_PIXEL 去云 + 饱和像元剔除 + 缩放
// ------------------------------
function prepareLandsat(image) {
  var qa = image.select('QA_PIXEL');
  // 低 6 位依次包含填充值、膨胀云、卷云、云、云影、雪。
  var clearMask = qa.bitwiseAnd(63).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  return image
    .updateMask(clearMask)
    .updateMask(saturationMask)
    .select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6'],
            ['blue', 'green', 'red', 'nir', 'swir1'])
    .multiply(0.0000275)
    .add(-0.2)
    .copyProperties(image, ['system:time_start']);
}

// ------------------------------
// 4. 批量获取光学影像；返回统一的 blue/green/red/nir/swir1 波段
// ------------------------------
var globalStart = ee.Date.fromYMD(START_YEAR, 1, 1);
var globalEnd = ee.Date.fromYMD(
  END_YEAR,
  WINDOW_END_MONTH,
  WINDOW_END_DAY
).advance(1, 'day');

function getOpticalCollection() {
  if (DATA_SOURCE === 'LANDSAT') {
    var landsat8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
    var landsat9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2');
    return landsat8.merge(landsat9)
      .filterBounds(roi)
      .filterDate(globalStart, globalEnd)
      .filter(ee.Filter.lt('CLOUD_COVER', MAX_SCENE_CLOUD))
      .map(prepareLandsat);
  }

  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(globalStart, globalEnd)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', MAX_SCENE_CLOUD))
    .map(prepareSentinel2);
}

var optical = getOpticalCollection();
print('当前数据源', DATA_SOURCE);
print('预处理后的影像总数', optical.size());

// ------------------------------
// 5. 为每景影像计算 NDVI
// ------------------------------
function addNdvi(image) {
  var ndvi = image.normalizedDifference(['nir', 'red']).rename('NDVI');
  return image.addBands(ndvi)
    .copyProperties(image, ['system:time_start']);
}

var withNdvi = optical.map(addNdvi);

// ------------------------------
// 6. 生成 2018—2026 同窗年度最大 NDVI 合成
// ------------------------------
var years = ee.List.sequence(START_YEAR, END_YEAR);

var annualNdvi = ee.ImageCollection.fromImages(
  years.map(function(year) {
    year = ee.Number(year);
    var start = ee.Date.fromYMD(year, 1, 1);
    // filterDate 的结束日期不包含当天，所以向后推进 1 天。
    var end = ee.Date.fromYMD(
      year,
      WINDOW_END_MONTH,
      WINDOW_END_DAY
    ).advance(1, 'day');

    var annualMax = withNdvi
      .filterDate(start, end)
      .select('NDVI')
      .max()
      .rename('NDVI')
      .updateMask(forestMask)
      .clip(roi);

    return annualMax
      .set('year', year)
      .set('system:index', year.format('%d'))
      .set('system:time_start', start.millis());
  })
);

print('年度最大 NDVI 集合', annualNdvi);
print('年度数量', annualNdvi.size());

var ndviStart = annualNdvi
  .filter(ee.Filter.eq('year', START_YEAR))
  .first();
var ndviEnd = annualNdvi
  .filter(ee.Filter.eq('year', END_YEAR))
  .first();

var ndviVis = {
  min: 0.2,
  max: 0.9,
  palette: ['8C510A', 'D8B365', 'F6E8C3', '5AB4AC', '01665E']
};
Map.addLayer(ndviStart, ndviVis, START_YEAR + ' 最大 NDVI', false);
Map.addLayer(ndviEnd, ndviVis, END_YEAR + ' 最大 NDVI');

// ------------------------------
// 7. 有效观测年数与线性趋势
// ------------------------------
var validYearCount = annualNdvi.select('NDVI').count().rename('valid_years');
var validTrendMask = validYearCount.gte(MIN_VALID_YEARS);

var annualWithTime = annualNdvi.map(function(image) {
  var year = ee.Number(image.get('year'));
  // 从 NDVI 波段派生时间波段，以继承相同投影和有效像元掩膜。
  var t = image.select('NDVI')
    .multiply(0)
    .add(year.subtract(START_YEAR))
    .rename('t')
    .float();
  return t.addBands(image.select('NDVI').float())
    .copyProperties(image, ['system:time_start', 'year']);
});

// linearFit 的输入顺序必须是 x（时间）在前、y（NDVI）在后。
var linearFit = annualWithTime
  .select(['t', 'NDVI'])
  .reduce(ee.Reducer.linearFit());
var linearSlope = linearFit.select('scale')
  .rename('linear_slope')
  .updateMask(validTrendMask);

// ------------------------------
// 8. Sen's slope 与 Kendall tau：对异常值更稳健的趋势指标
// ------------------------------
var senFit = annualWithTime
  .select(['t', 'NDVI'])
  .reduce(ee.Reducer.sensSlope());
var senSlope = senFit.select('slope')
  .rename('sen_slope')
  .updateMask(validTrendMask);

var kendallTau = annualWithTime
  .select(['t', 'NDVI'])
  .reduce(ee.Reducer.kendallsCorrelation(2))
  .rename('kendall_tau')
  .updateMask(validTrendMask);

var slopeVis = {
  min: -0.02,
  max: 0.02,
  palette: ['A50026', 'F46D43', 'FFFFBF', '66BD63', '006837']
};
Map.addLayer(linearSlope, slopeVis, '线性 NDVI 斜率', false);
Map.addLayer(senSlope, slopeVis, 'Sen slope');
Map.addLayer(
  kendallTau,
  {min: -1, max: 1, palette: ['B2182B', 'F7F7F7', '1A9850']},
  'Kendall tau',
  false
);

// ------------------------------
// 9. 改善/稳定/退化区域提取
// 分类：-1 退化，0 稳定，1 改善
// ------------------------------
var improvement = senSlope.gt(SLOPE_THRESHOLD)
  .and(kendallTau.gt(TAU_THRESHOLD));
var degradation = senSlope.lt(-SLOPE_THRESHOLD)
  .and(kendallTau.lt(-TAU_THRESHOLD));

// 用 senSlope*0 创建基底，可保留分析影像的投影和掩膜。
var changeClass = senSlope.multiply(0).toInt8()
  .where(improvement, 1)
  .where(degradation, -1)
  .rename('change_class')
  .updateMask(validTrendMask)
  .clip(roi);

Map.addLayer(
  changeClass,
  {min: -1, max: 1, palette: ['D73027', 'D9D9D9', '1A9850']},
  '森林植被变化分类'
);

// 首尾差值仅用于辅助观察，不替代趋势检验。
var endMinusStart = ndviEnd.subtract(ndviStart)
  .rename('ndvi_change_' + START_YEAR + '_' + END_YEAR)
  .updateMask(validTrendMask);
Map.addLayer(
  endMinusStart,
  {min: -0.3, max: 0.3, palette: ['B2182B', 'F7F7F7', '1A9850']},
  '首尾年度 NDVI 差值',
  false
);

// ------------------------------
// 10. 统计四个分区的改善/稳定/退化面积与占比
// ------------------------------
var pixelAreaKm2 = ee.Image.pixelArea().divide(1e6).rename('area_km2');

function sumArea(maskImage, geometry) {
  return pixelAreaKm2
    .updateMask(maskImage)
    .reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geometry,
      scale: STAT_SCALE,
      maxPixels: 1e9,
      tileScale: 4
    })
    .getNumber('area_km2');
}

var changeStats = zones.map(function(zone) {
  var geometry = zone.geometry();
  var totalArea = sumArea(validTrendMask, geometry);
  var improveArea = sumArea(changeClass.eq(1), geometry);
  var stableArea = sumArea(changeClass.eq(0), geometry);
  var degradeArea = sumArea(changeClass.eq(-1), geometry);

  return zone.set({
    valid_forest_km2: totalArea,
    improvement_km2: improveArea,
    stable_km2: stableArea,
    degradation_km2: degradeArea,
    improvement_pct: improveArea.divide(totalArea).multiply(100),
    stable_pct: stableArea.divide(totalArea).multiply(100),
    degradation_pct: degradeArea.divide(totalArea).multiply(100)
  });
});
print('各分区变化面积与占比', changeStats);

// ------------------------------
// 11. 统计各分区逐年的高植被覆盖占比（NDVI >= 0.60）
// ------------------------------
var vegetationStats = ee.FeatureCollection(
  years.map(function(year) {
    year = ee.Number(year);
    var annualImage = annualNdvi
      .filter(ee.Filter.eq('year', year))
      .first();

    return zones.map(function(zone) {
      var geometry = zone.geometry();
      var validMask = annualImage.mask().reduce(ee.Reducer.min());
      var validArea = sumArea(validMask, geometry);
      var vegetationArea = sumArea(
        annualImage.select('NDVI').gte(VEGETATION_NDVI),
        geometry
      );

      return ee.Feature(null, {
        year: year,
        zone_id: zone.get('zone_id'),
        zone_name: zone.get('zone_name'),
        valid_forest_km2: validArea,
        high_vegetation_km2: vegetationArea,
        vegetation_ratio_pct: vegetationArea.divide(validArea).multiply(100)
      });
    });
  })
).flatten();
print('各分区逐年高植被覆盖占比', vegetationStats);

// ------------------------------
// 12. 时序图与分区占比图
// ------------------------------
var ndviSeriesChart = ui.Chart.image.seriesByRegion({
  imageCollection: annualNdvi,
  band: 'NDVI',
  regions: zones,
  reducer: ee.Reducer.mean(),
  scale: STAT_SCALE,
  seriesProperty: 'zone_name',
  xProperty: 'system:time_start'
}).setOptions({
  title: '2018—2026 各分区森林年度最大 NDVI',
  hAxis: {title: '年份', format: 'yyyy'},
  vAxis: {title: '年度最大 NDVI', viewWindow: {min: 0.3, max: 1}},
  lineWidth: 2,
  pointSize: 5
});
print(ndviSeriesChart);

var vegetationRatioChart = ui.Chart.feature.groups({
  features: vegetationStats,
  xProperty: 'year',
  yProperty: 'vegetation_ratio_pct',
  seriesProperty: 'zone_name'
}).setChartType('LineChart').setOptions({
  title: '各分区高植被覆盖占比（NDVI >= 0.60）',
  hAxis: {title: '年份', format: '####'},
  vAxis: {title: '占比（%）', viewWindow: {min: 0, max: 100}},
  lineWidth: 2,
  pointSize: 5
});
print(vegetationRatioChart);

// ------------------------------
// 13. 添加变化分类图例
// ------------------------------
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 12px',
    backgroundColor: 'white'
  }
});
legend.add(ui.Label({
  value: '森林植被变化分类',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}
}));

function addLegendRow(color, label) {
  var colorBox = ui.Label('', {
    backgroundColor: color,
    padding: '8px',
    margin: '0 6px 4px 0'
  });
  var text = ui.Label(label, {margin: '0 0 4px 0'});
  legend.add(ui.Panel([colorBox, text], ui.Panel.Layout.Flow('horizontal')));
}

addLegendRow('#1A9850', '改善：Sen slope > 0.005 且 tau > 0.40');
addLegendRow('#D9D9D9', '稳定：未达到改善或退化双阈值');
addLegendRow('#D73027', '退化：Sen slope < -0.005 且 tau < -0.40');
Map.add(legend);

// ------------------------------
// 14. 导出：年度 NDVI、多指标趋势影像、分类、矢量与 CSV 表格
// ------------------------------
var annualNdviStack = annualNdvi.toBands().toFloat();
var trendStack = linearSlope
  .addBands(senSlope)
  .addBands(kendallTau)
  .addBands(endMinusStart)
  .addBands(validYearCount.toFloat());

Export.image.toDrive({
  image: annualNdviStack,
  description: 'Annual_Max_NDVI_2018_2026_' + DATA_SOURCE,
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'annual_max_ndvi_2018_2026_' + DATA_SOURCE.toLowerCase(),
  region: roi,
  scale: NATIVE_SCALE,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

Export.image.toDrive({
  image: trendStack.toFloat(),
  description: 'Forest_NDVI_Trend_2018_2026_' + DATA_SOURCE,
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'forest_ndvi_trend_2018_2026_' + DATA_SOURCE.toLowerCase(),
  region: roi,
  scale: NATIVE_SCALE,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

Export.image.toDrive({
  image: changeClass.toInt8(),
  description: 'Forest_Change_Class_2018_2026_' + DATA_SOURCE,
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'forest_change_class_2018_2026_' + DATA_SOURCE.toLowerCase(),
  region: roi,
  scale: NATIVE_SCALE,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {cloudOptimized: true}
});

Export.table.toDrive({
  collection: changeStats,
  description: 'Zone_Change_Statistics_2018_2026_' + DATA_SOURCE,
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'zone_change_statistics_2018_2026_' + DATA_SOURCE.toLowerCase(),
  fileFormat: 'CSV',
  selectors: [
    'zone_id', 'zone_name', 'valid_forest_km2',
    'improvement_km2', 'stable_km2', 'degradation_km2',
    'improvement_pct', 'stable_pct', 'degradation_pct'
  ]
});

Export.table.toDrive({
  collection: vegetationStats,
  description: 'Annual_Vegetation_Ratio_2018_2026_' + DATA_SOURCE,
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'annual_vegetation_ratio_2018_2026_' + DATA_SOURCE.toLowerCase(),
  fileFormat: 'CSV',
  selectors: [
    'year', 'zone_id', 'zone_name', 'valid_forest_km2',
    'high_vegetation_km2', 'vegetation_ratio_pct'
  ]
});

Export.table.toDrive({
  collection: zones,
  description: 'Teaching_Zones_Vector',
  folder: EXPORT_FOLDER,
  fileNamePrefix: 'teaching_zones',
  fileFormat: 'SHP'
});

// ------------------------------
// 15. 最后检查：Console 应显示 9 个年度；Tasks 应生成 6 个导出任务
// ------------------------------
print('有效年度数影像', validYearCount);
print('趋势多波段影像', trendStack);
print('变化分类编码：-1=退化，0=稳定，1=改善');
print('提醒：2026 为截至 7 月 29 日的同窗年度，不是完整自然年。');

// ============================================================
// 06 个人 Asset、ROI 与可视化
// 默认模式无需个人 Asset，可直接运行；准备好资产后再切换开关。
// ============================================================

// ---------- 1. 研究区来源 ----------
// false：使用北京附近的内置矩形，保证脚本可直接运行。
// true：读取你自己的 Table Asset；切换前必须替换下一行的 Asset ID。
var USE_PERSONAL_ASSET = false;
var PERSONAL_ASSET_ID = 'projects/your-cloud-project/assets/your_roi';

// 小范围演示 ROI，避免初次运行时计算量过大。
var demoRoiFc = ee.FeatureCollection([
  ee.Feature(
    ee.Geometry.Rectangle([116.05, 39.70, 116.75, 40.25]),
    {roi_name: 'Beijing_demo'}
  )
]);

// JavaScript 本地布尔值决定读取哪个分支；默认不会访问占位 Asset ID。
var roiFc = USE_PERSONAL_ASSET
  ? ee.FeatureCollection(PERSONAL_ASSET_ID)
  : demoRoiFc;

// geometry() 将集合中全部要素合并成一个分析几何。
// 若要逐行政区统计，请保留 roiFc 的属性，不要只保留 roi。
var roi = roiFc.geometry();

print('ROI FeatureCollection', roiFc);
print('ROI 要素数量', roiFc.size());
print('ROI 首个要素属性', roiFc.first());

// ---------- 2. Sentinel-2 去云与缩放 ----------
function maskS2Sr(image) {
  var scl = image.select('SCL');
  // 去除云影、云、卷云、雪冰；保留其他地表类别。
  var clear = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  // SR 波段比例因子为 0.0001，并保留时间属性供图表使用。
  return image.updateMask(clear)
    .select(['B2', 'B3', 'B4', 'B8'], ['blue', 'green', 'red', 'nir'])
    .multiply(0.0001)
    .copyProperties(image, ['system:time_start']);
}

var images = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2024-04-01', '2024-11-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
  .map(maskS2Sr);

print('筛选后影像数量', images.size());

// 中位数合成对残余异常值较稳健；clip 只保留 ROI 范围。
var composite = images.median().clip(roi);
var ndvi = composite.normalizedDifference(['nir', 'red']).rename('NDVI');

// ---------- 3. 五种常用可视化 ----------
// 真彩色：三个波段分别映射到红、绿、蓝显示通道。
var rgbVis = {
  bands: ['red', 'green', 'blue'],
  min: 0.02,
  max: 0.30,
  gamma: 1.1
};

// 连续变量：固定 min/max，便于不同日期或区域横向比较。
var ndviVis = {
  min: 0,
  max: 0.9,
  palette: ['8c510a', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e']
};

// 分类变量：阈值只用于教学，不等同于通用森林判定标准。
var vegetationClass = ndvi.expression(
  "b('NDVI') < 0.2 ? 0 : b('NDVI') < 0.5 ? 1 : 2"
).rename('vegetation_class').toByte();
var classVis = {
  min: 0,
  max: 2,
  palette: ['d9d9d9', 'fee08b', '1a9850']
};

// 矢量 style() 会把 FeatureCollection 渲染成便于显示的 Image。
var roiStyle = roiFc.style({
  color: '00FFFF',
  fillColor: '00000000',
  width: 3
});

Map.centerObject(roiFc, 9);
Map.addLayer(composite, rgbVis, 'S2 真彩色');
Map.addLayer(ndvi, ndviVis, 'NDVI 连续色带');
Map.addLayer(vegetationClass, classVis, '植被等级（教学阈值）', false);
Map.addLayer(roiStyle, {}, 'ROI 边界');

// ---------- 4. 图例 ----------
var legend = ui.Panel({
  style: {position: 'bottom-left', padding: '8px 12px'}
});
legend.add(ui.Label({
  value: 'NDVI 图例',
  style: {fontWeight: 'bold', fontSize: '14px'}
}));

var labels = ['低：0.0', '中：0.45', '高：0.9'];
var colors = ['8c510a', 'f6e8c3', '01665e'];
for (var i = 0; i < labels.length; i++) {
  var colorBox = ui.Label('', {
    backgroundColor: '#' + colors[i],
    padding: '8px',
    margin: '0 6px 4px 0'
  });
  var description = ui.Label(labels[i], {margin: '0 0 4px 0'});
  legend.add(ui.Panel([colorBox, description], ui.Panel.Layout.flow('horizontal')));
}
Map.add(legend);

// ---------- 5. Inspector 的统计替代：直方图 ----------
var histogram = ui.Chart.image.histogram({
  image: ndvi,
  region: roi,
  scale: 30,
  maxBuckets: 40
}).setOptions({
  title: 'ROI 内 NDVI 分布',
  hAxis: {title: 'NDVI'},
  vAxis: {title: '像元数'},
  legend: {position: 'none'},
  colors: ['2E8B57']
});
print(histogram);

// ---------- 6. 导出 ----------
// Run 后到 Tasks 面板手动提交任务。
Export.image.toDrive({
  image: ndvi,
  description: 'ROI_NDVI_2024',
  folder: 'GEE_exports',
  fileNamePrefix: 'ROI_NDVI_2024',
  region: roi,
  scale: 10,
  maxPixels: 1e10
});

// 如需写回 Asset，可取消下段注释并替换 assetId。
// 分类影像通常设置 pyramidingPolicy 为 mode；连续 NDVI 可保留 mean。
// Export.image.toAsset({
//   image: ndvi,
//   description: 'ROI_NDVI_2024_toAsset',
//   assetId: 'projects/your-cloud-project/assets/ROI_NDVI_2024',
//   region: roi,
//   scale: 10,
//   maxPixels: 1e10,
//   pyramidingPolicy: {'.default': 'mean'}
// });


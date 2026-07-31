// ============================================================
// 07 可公开访问的 Earth Engine App 教学模板
// 使用公开数据和内置 ROI，不依赖个人 Asset，可直接运行和发布。
// ============================================================

// ---------- 1. 应用数据与函数 ----------
var roi = ee.Geometry.Rectangle([116.05, 39.70, 116.75, 40.25]);

function maskS2Sr(image) {
  var scl = image.select('SCL');
  var clear = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));
  return image.updateMask(clear)
    .select(['B4', 'B8'], ['red', 'nir'])
    .multiply(0.0001);
}

function annualNdvi(year) {
  year = Number(year);
  var start = ee.Date.fromYMD(year, 4, 1);
  var end = ee.Date.fromYMD(year, 11, 1);
  var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(roi)
    .filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
    .map(maskS2Sr)
    .map(function(image) {
      return image.normalizedDifference(['nir', 'red']).rename('NDVI');
    });
  return collection.max().clip(roi);
}

var ndviVis = {
  min: 0,
  max: 0.9,
  palette: ['8c510a', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e']
};

// ---------- 2. 创建独立地图和侧栏 ----------
var appMap = ui.Map();
appMap.setCenter(116.4, 40.0, 9);

var title = ui.Label('北京示例区年度最大 NDVI', {
  fontSize: '22px',
  fontWeight: 'bold',
  color: '#173A5E',
  margin: '0 0 12px 0'
});

var intro = ui.Label(
  '选择年份后，应用使用 Sentinel-2 SR Harmonized，完成 SCL 去云并显示 4—10 月最大 NDVI。',
  {whiteSpace: 'pre-wrap', margin: '0 0 12px 0'}
);

var status = ui.Label('准备就绪', {color: '#5D6B78'});

var yearSelect = ui.Select({
  items: ['2022', '2023', '2024', '2025'],
  value: '2025',
  placeholder: '选择年份'
});

function drawLegend() {
  var legend = ui.Panel({style: {margin: '16px 0 0 0'}});
  legend.add(ui.Label('NDVI：0 → 0.9', {fontWeight: 'bold'}));
  legend.add(ui.Thumbnail({
    image: ee.Image.pixelLonLat().select('longitude'),
    params: {
      bbox: [0, 0, 1, 0.1],
      dimensions: '240x20',
      format: 'png',
      min: 0,
      max: 1,
      palette: ndviVis.palette
    },
    style: {stretch: 'horizontal', margin: '6px 0'}
  }));
  return legend;
}

function updateMap(year) {
  status.setValue('正在准备 ' + year + ' 年图层…');
  var image = annualNdvi(year);

  // reset() 保证每次选择年份只保留一个主图层。
  appMap.layers().reset([
    ui.Map.Layer(image, ndviVis, year + ' 年最大 NDVI')
  ]);
  appMap.addLayer(ee.Image().paint(roi, 1, 2), {palette: ['00FFFF']}, '研究区边界');
  status.setValue('当前年份：' + year + '；可点击地图用 Inspector 查看像元。');
}

yearSelect.onChange(updateMap);

var sidePanel = ui.Panel({
  widgets: [
    title,
    intro,
    ui.Label('年份', {fontWeight: 'bold'}),
    yearSelect,
    status,
    drawLegend(),
    ui.Label(
      '注意：本应用用于教学。正式科研应记录数据访问日期、质量掩膜、时间窗口和验证结果。',
      {whiteSpace: 'pre-wrap', margin: '18px 0 0 0', color: '#8A4B08'}
    )
  ],
  style: {width: '330px', padding: '18px'}
});

// ---------- 3. 重建应用界面 ----------
ui.root.clear();
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));
ui.root.add(sidePanel);
ui.root.add(appMap);

// 首次打开应用时主动绘制默认年份。
updateMap('2025');

// 发布前在 Apps 面板创建 App，选择 Cloud 项目并设置访问方式。
// 如果改用个人 Asset，必须同时给 App 或目标用户相应 Asset 读取权限。


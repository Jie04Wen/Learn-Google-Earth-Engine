// ============================================================
// GEE 从零入门课程：基础语法、print()、几何与矢量可视化
// 运行环境：https://code.earthengine.google.com/
// ============================================================

// 1. print()：把文字、数字和 Earth Engine 对象输出到 Console。
print('你好，Google Earth Engine！');
print('1 + 2 =', 1 + 2);

// 2. 创建一个点。坐标顺序固定为 [经度, 纬度]。
var point = ee.Geometry.Point([100.80, 22.00]);

// 3. 创建一条线。数组中的每一项都是一个 [经度, 纬度] 坐标。
var line = ee.Geometry.LineString([
  [100.62, 21.88],
  [100.80, 22.00],
  [101.02, 22.14]
]);

// 4. 创建一个面。首尾坐标相同，用于闭合多边形。
var polygon = ee.Geometry.Polygon([[
  [100.58, 21.76],
  [101.05, 21.76],
  [101.05, 22.18],
  [100.58, 22.18],
  [100.58, 21.76]
]]);

// 5. 创建一个矩形，参数依次为西、南、东、北。
var rectangle = ee.Geometry.Rectangle([100.55, 21.72, 101.10, 22.22]);

// 6. 把几何对象显示到地图。color 可写颜色名称或十六进制颜色。
Map.addLayer(point, {color: 'red'}, '点');
Map.addLayer(line, {color: 'yellow'}, '线');
Map.addLayer(polygon, {color: '00FFFF'}, '面');
Map.addLayer(rectangle, {color: 'FFFFFF'}, '矩形');

// 7. 让地图自动缩放到矩形范围；数字 10 是可选缩放级别。
Map.centerObject(rectangle, 10);

// 8. 计算几何属性。maxError 用 1 米，结果转换为更直观的单位。
print('点坐标', point.coordinates());
print('线长度（千米）', line.length({maxError: 1}).divide(1000));
print('多边形面积（平方千米）',
      polygon.area({maxError: 1}).divide(1e6));

// 9. 把面包装为 Feature，并添加属性。
var forestPlot = ee.Feature(polygon, {
  plot_id: 'P01',
  land_type: '教学样地',
  survey_year: 2026
});

// 10. Feature 可用 style() 设置填充色、边线颜色和线宽。
var styledPlot = forestPlot.style({
  color: '006400',
  fillColor: '66AA6666',
  width: 2
});
Map.addLayer(styledPlot, {}, '带属性的样地');
print('样地 Feature', forestPlot);

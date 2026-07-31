# GEE 从零入门全套课程包

- Google Earth Engine Guides: https://developers.google.cn/earth-engine/guides
- Google Earth Engine Reference: https://developers.google.cn/earth-engine/apidocs
- Google Earth Engine Data Catalog: https://developers.google.cn/earth-engine/datasets
- Google Earth Engine Data Tutorials: https://developers.google.cn/earth-engine/tutorials

## 文件说明

- `GEE从零入门全套教学手册.docx`：可发布、可继续编辑的 Word 教学手册。
- `GEE从零入门全套教学手册.md`：完整 Markdown 源稿，已嵌入全部课程代码。
- `Code/01_基础语法与几何.js`：print、几何与矢量可视化。
- `Code/02_四大核心数据结构.js`：Geometry、Feature、FeatureCollection、Image、ImageCollection。
- `Code/03_筛选预处理与指数.js`：筛选、去云、镶嵌、裁剪、五类指数与统计。
- `Code/04_时序合成图表与导出.js`：月度/年度合成、图表和三类导出。
- `Code/05_森林NDVI时序变化_2018_2026.js`：完整森林 NDVI 长时序项目。

## 快速开始

1. 完成 Google Cloud 项目和 Earth Engine 访问配置。
2. 打开 <https://code.earthengine.google.com/>。
3. 运行 `01_基础语法与几何.js`，再按编号学习。
4. 完整项目默认使用 Sentinel-2；把 `DATA_SOURCE` 改为 `LANDSAT` 可运行 Landsat 8/9 版本。
5. 2026 年默认按每年 1 月 1 日至 7 月 29 日统一窗口比较，不能解释为完整自然年。

## 正在修改中

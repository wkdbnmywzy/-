// navigation.js
// 导航界面逻辑

// 确保kmlLayers全局变量存在
if (typeof kmlLayers === 'undefined') {
    window.kmlLayers = [];
}

let navigationMap;
let routeData = null;
let drivingInstance = null;
let routePolyline = null;
let startMarker = null;
let endMarker = null;
let waypointMarkers = [];
// 导航运动相关对象
let userMarker = null;            // 代表"我的位置"的移动标记
let accuracyCircle = null;        // GPS精度圈
let currentAccuracy = 0;          // 当前GPS精度（米）
let navigationTimer = null;       // 模拟导航的定时器
let totalRouteDistance = 0;       // 总路线长度（用于完成统计）
let navStartTime = 0;             // 导航开始时间（ms）
let gpsWatchId = null;            // 浏览器GPS监听ID（真实导航）
let preNavWatchId = null;         // 导航前的位置监听ID
let lastGpsPos = null;            // 上一次GPS位置（用于计算朝向）
let geoErrorNotified = false;     // 避免重复弹错误
// 设备方向（用于箭头随朝向变化）
let trackingDeviceOrientationNav = false;
let deviceOrientationHandlerNav = null;
let lastDeviceHeadingNav = null; // 度，0-360，顺时针（相对正北）
// 导航页动态角度偏移：用于自动修正稳定的180°反向
let dynamicAngleOffsetNav = 0; // 0 或 180
let calibrationStateNav = { count0: 0, count180: 0, locked: false };
let isOffRoute = false;            // 是否偏离路径
let offRouteThreshold = 15;        // 偏离路径阈值（米），考虑GPS精度设为15米
let passedRoutePolyline = null;    // 已走过的规划路径（灰色）
let deviatedRoutePolyline = null;  // 偏离的实际路径（黄色）
let deviatedPath = [];             // 偏离路径的点���合
let maxPassedSegIndex = -1;        // 记录用户走过的最远路径点索引
let passedSegments = new Set();    // 记录已走过的路段（格式："startIndex-endIndex"）
let visitedWaypoints = new Set();  // 记录已到达的途径点名称

let currentBranchInfo = null;      // 当前检测到的分支信息
let userChosenBranch = -1;         // 用户选择的分支索引（-1表示未选择或推荐分支）
let lastBranchNotificationTime = 0; // 上次分支提示的时间戳，避免频繁提示
// 接近起点自动“以我为起点”阈值（米）
let startRebaseThresholdMeters = 25; // 可按需微调，建议20~30米
// 终点到达判定的沿路网剩余距离阈值（米）
let endArrivalThresholdMeters = 12; // 建议10~15米，避免误判
try {
    if (typeof MapConfig !== 'undefined' && MapConfig && MapConfig.navigationConfig &&
        typeof MapConfig.navigationConfig.startRebaseDistanceMeters === 'number') {
        startRebaseThresholdMeters = MapConfig.navigationConfig.startRebaseDistanceMeters;
    }
    if (typeof MapConfig !== 'undefined' && MapConfig && MapConfig.navigationConfig &&
        typeof MapConfig.navigationConfig.endArrivalDistanceMeters === 'number') {
        endArrivalThresholdMeters = MapConfig.navigationConfig.endArrivalDistanceMeters;
    }
} catch (e) { /* 忽略配置读取错误，使用默认值 */ }

// 初始化导航地图
function initNavigationMap() {
    console.log('初始化导航地图...');

    // 创建地图实例
    navigationMap = new AMap.Map('navigation-map-container', {
        zoom: 17,
        center: [116.397428, 39.90923],
        mapStyle: 'amap://styles/normal',
        viewMode: '2D',
        features: ['bg', 'road', 'building'], // 只显示背景、道路和建筑
        showLabel: true
    });

    // 地图加载完成后的操作
    navigationMap.on('complete', function() {
        console.log('导航地图加载完成');

        // 1. 先加载KML底图数据（便于查看路线）
        loadKMLDataFromSession();

        // 2. 延迟加载路线数据，让用户先看到KML底图
        setTimeout(function() {
            loadRouteData();
        }, 500);

        // 3. 启动实时定位（显示我的位置）
        startRealtimePositionTracking();
    });

    console.log('导航地图初始化完成');
}

// 从sessionStorage加载KML数据并显示在地图上
function loadKMLDataFromSession() {
    try {
        // 优先使用处理后的KML数据（已分割）
        const processedData = sessionStorage.getItem('processedKMLData');

        if (processedData) {
            console.log('从sessionStorage加载处理后的KML数据（已分割）');
            const data = JSON.parse(processedData);
            displayKMLFeaturesForNavigation(data.features, data.fileName);
            console.log('KML数据加载并显示完成，图层数:', kmlLayers.length);
            return;
        }

        // 如果没有处理后的数据，回退到原始数据
        const kmlRawData = sessionStorage.getItem('kmlRawData');
        const kmlFileName = sessionStorage.getItem('kmlFileName');

        if (!kmlRawData) {
            console.warn('sessionStorage中没有KML数据');
            return;
        }

        console.log('从sessionStorage加载原始KML数据，文件名:', kmlFileName);

        // 重新解析KML数据
        parseKMLForNavigation(kmlRawData, kmlFileName || 'loaded.kml');

        console.log('KML数据加载并显示完成，图层数:', kmlLayers.length);
    } catch (e) {
        console.error('加载KML数据失败:', e);
    }
}

// 为导航页面解析KML（复用主页的解析逻辑）
function parseKMLForNavigation(kmlContent, fileName) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlContent, 'text/xml');

        // 检查解析错误
        const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
        if (parserError) {
            throw new Error('KML文件格式错误');
        }

        // 提取所有Placemark
        const placemarks = xmlDoc.getElementsByTagName('Placemark');
        const features = [];

        for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            const feature = parsePlacemarkForNavigation(placemark, xmlDoc);
            if (feature) {
                features.push(feature);
            }
        }

        if (features.length === 0) {
            console.warn('未找到有效的地理要素');
            return;
        }

        // 在地图上显示KML要素
        displayKMLFeaturesForNavigation(features, fileName);

    } catch (error) {
        console.error('KML解析错误:', error);
    }
}

// 解析单个Placemark（复用主页逻辑）
function parsePlacemarkForNavigation(placemark, xmlDoc) {
    const name = placemark.getElementsByTagName('name')[0]?.textContent || '未命名要素';

    // 过滤掉名称为 "New Point" 的点要素
    if (name === 'New Point') {
        return null;
    }

    // 解析样式信息
    const style = parseStyleForNavigation(placemark, xmlDoc);

    // 解析几何要素
    let geometry = null;
    let type = '';

    // 点要素
    const point = placemark.getElementsByTagName('Point')[0];
    if (point) {
        const coordinates = point.getElementsByTagName('coordinates')[0]?.textContent;
        if (coordinates) {
            const [lng, lat] = coordinates.split(',').map(coord => parseFloat(coord.trim()));
            // 坐标转换：WGS84转GCJ02
            const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
            geometry = {
                type: 'point',
                coordinates: [gcjLng, gcjLat],
                originalCoordinates: [lng, lat],
                style: style.pointStyle
            };
            type = '点';
        }
    }

    // 线要素
    const lineString = placemark.getElementsByTagName('LineString')[0];
    if (lineString) {
        const coordinates = lineString.getElementsByTagName('coordinates')[0]?.textContent;
        if (coordinates) {
            const cleanedCoords = coordinates.trim().replace(/\s+/g, ' ');
            const coordsArray = cleanedCoords.split(' ')
                .filter(coord => coord.trim().length > 0)
                .map(coord => {
                    const parts = coord.split(',');
                    if (parts.length >= 2) {
                        const lng = parseFloat(parts[0].trim());
                        const lat = parseFloat(parts[1].trim());

                        if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
                            const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
                            return [gcjLng, gcjLat];
                        }
                    }
                    return null;
                })
                .filter(coord => coord !== null);

            if (coordsArray.length >= 2) {
                geometry = {
                    type: 'line',
                    coordinates: coordsArray,
                    style: style.lineStyle
                };
                type = '线';
            }
        }
    }

    // 面要素
    const polygon = placemark.getElementsByTagName('Polygon')[0];
    if (polygon) {
        const outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
        const linearRing = outerBoundary?.getElementsByTagName('LinearRing')[0];
        const coordinates = linearRing?.getElementsByTagName('coordinates')[0]?.textContent;

        if (coordinates) {
            const coordsArray = coordinates.trim().split(' ').map(coord => {
                const [lng, lat] = coord.split(',').map(c => parseFloat(c.trim()));
                const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
                return [gcjLng, gcjLat];
            });
            geometry = {
                type: 'polygon',
                coordinates: coordsArray,
                style: style.polyStyle
            };
            type = '面';
        }
    }

    if (!geometry) return null;

    return {
        name: name,
        type: type,
        geometry: geometry,
        description: placemark.getElementsByTagName('description')[0]?.textContent || ''
    };
}

// 解析样式（复用主页逻辑）
function parseStyleForNavigation(placemark, xmlDoc) {
    let styleNode = placemark.getElementsByTagName('Style')[0];

    if (!styleNode) {
        const styleUrl = placemark.getElementsByTagName('styleUrl')[0]?.textContent;
        if (styleUrl && styleUrl.startsWith('#')) {
            const styleId = styleUrl.slice(1);
            styleNode = xmlDoc.querySelector(`Style[id="${styleId}"]`);
        }
    }

    const pointStyle = {};
    const lineStyle = {};
    const polyStyle = {};

    // 解析线样式
    const lineStyleNode = styleNode?.getElementsByTagName('LineStyle')[0];
    if (lineStyleNode) {
        const colorText = lineStyleNode.getElementsByTagName('color')[0]?.textContent || 'ff0000ff';
        const colorResult = kmlColorToRgbaForNavigation(colorText);
        lineStyle.color = colorResult.color;
        lineStyle.opacity = colorResult.opacity;
        const widthText = lineStyleNode.getElementsByTagName('width')[0]?.textContent;
        lineStyle.width = widthText ? parseFloat(widthText) : 2;
        if (lineStyle.width < 1) lineStyle.width = 1;
        lineStyle.width = Math.max(lineStyle.width * 1.5, 3);
    } else {
        lineStyle.color = '#888888';
        lineStyle.opacity = 0.5;
        lineStyle.width = 2;
    }

    // 解析面样式
    const polyStyleNode = styleNode?.getElementsByTagName('PolyStyle')[0];
    if (polyStyleNode) {
        const colorText = polyStyleNode.getElementsByTagName('color')[0]?.textContent || '880000ff';
        const colorResult = kmlColorToRgbaForNavigation(colorText);
        polyStyle.fillColor = colorResult.color;
        polyStyle.fillOpacity = Math.max(colorResult.opacity, 0.3);
        polyStyle.strokeColor = lineStyle.color;
        polyStyle.strokeOpacity = lineStyle.opacity;
        polyStyle.strokeWidth = Math.max(lineStyle.width, 2);
    } else {
        polyStyle.fillColor = '#CCCCCC';
        polyStyle.fillOpacity = 0.3;
        polyStyle.strokeColor = '#666666';
        polyStyle.strokeOpacity = 0.6;
        polyStyle.strokeWidth = 2;
    }

    return { pointStyle, lineStyle, polyStyle };
}

// KML颜色转换
function kmlColorToRgbaForNavigation(kmlColor) {
    const alpha = parseInt(kmlColor.substring(0, 2), 16) / 255;
    const blue = parseInt(kmlColor.substring(2, 4), 16);
    const green = parseInt(kmlColor.substring(4, 6), 16);
    const red = parseInt(kmlColor.substring(6, 8), 16);

    const hexColor = '#' +
        red.toString(16).padStart(2, '0') +
        green.toString(16).padStart(2, '0') +
        blue.toString(16).padStart(2, '0');

    return {
        color: hexColor,
        opacity: alpha
    };
}

// 计算多边形面积（使用Shoelace公式）- 导航页专用
function calculatePolygonAreaForNav(coordinates) {
    if (!coordinates || coordinates.length < 3) {
        return 0;
    }

    let area = 0;
    const n = coordinates.length;

    // Shoelace公式计算多边形面积
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coordinates[i][0] * coordinates[j][1];
        area -= coordinates[j][0] * coordinates[i][1];
    }

    // 返回绝对值的一半（面积）
    return Math.abs(area) / 2;
}

// 在导航地图上显示KML要素（不显示点，只显示线和面）
function displayKMLFeaturesForNavigation(features, fileName) {
    const layerId = 'kml-' + Date.now();
    const layerMarkers = [];

    // 分离点、线、面
    const points = features.filter(f => f.geometry.type === 'point');
    const lines = features.filter(f => f.geometry.type === 'line');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    // 计算多边形面积并排序（面积大的在前，先渲染，这样会在底层）
    const polygonsWithArea = polygons.map(polygon => {
        const area = calculatePolygonAreaForNav(polygon.geometry.coordinates);
        return { ...polygon, area };
    });

    // 按面积从大到小排序
    polygonsWithArea.sort((a, b) => b.area - a.area);

    // 1. 先显示面（大面积的先渲染，zIndex递增）
    polygonsWithArea.forEach((feature, index) => {
        if (feature.geometry?.coordinates && feature.geometry.coordinates.length >= 3) {
            const polyStyle = feature.geometry.style || {
                fillColor: '#CCCCCC',
                fillOpacity: 0.3,
                strokeColor: '#666666',
                strokeOpacity: 0.6,
                strokeWidth: 2
            };

            const marker = new AMap.Polygon({
                path: feature.geometry.coordinates,
                strokeColor: 'transparent',
                strokeWeight: 0,  // 不显示描边
                strokeOpacity: 0,  // 完全透明
                fillColor: polyStyle.fillColor,
                fillOpacity: polyStyle.fillOpacity || 0.3,
                zIndex: 10 + index,  // 大面积的zIndex较小，显示在底层
                map: navigationMap
            });

            marker.setExtData({
                name: feature.name,
                type: feature.type,
                description: feature.description
            });

            layerMarkers.push(marker);
        }
    });

    // 2. 再显示线（zIndex: 20）
    // 导航界面的KML线要素默认不显示，与开始导航后保持一致
    lines.forEach(feature => {
        if (feature.geometry?.coordinates && feature.geometry.coordinates.length >= 2) {
            const lineStyle = feature.geometry.style || {
                color: '#888888',
                opacity: 0.5,
                width: 2
            };

            const marker = new AMap.Polyline({
                path: feature.geometry.coordinates,
                strokeColor: lineStyle.color,
                strokeWeight: lineStyle.width,
                strokeOpacity: lineStyle.opacity || 0.5,
                zIndex: 20
                // 不添加 map 参数，默认不显示
            });

            marker.setExtData({
                name: feature.name,
                type: feature.type,
                description: feature.description
            });

            layerMarkers.push(marker);
        }
    });

    // 3. 创建用于路径规划的marker对象（包含点数据，但不在地图上显示）
    const planningMarkers = features.map(feature => {
        if (!feature.geometry) {
            console.error('Feature缺少geometry数据:', feature.name);
            return null;
        }

        const mockMarker = {
            getExtData: function() {
                return {
                    type: feature.type,
                    name: feature.name,
                    description: feature.description
                };
            },
            hide: function() {},
            show: function() {}
        };

        if (feature.type === '点' && feature.geometry.coordinates) {
            mockMarker.getPosition = function() {
                return {
                    lng: feature.geometry.coordinates[0],
                    lat: feature.geometry.coordinates[1]
                };
            };
        } else if (feature.type === '线' && feature.geometry.coordinates) {
            mockMarker.getPath = function() {
                if (Array.isArray(feature.geometry.coordinates)) {
                    const path = feature.geometry.coordinates.map(coord => {
                        if (Array.isArray(coord) && coord.length >= 2) {
                            return { lng: coord[0], lat: coord[1] };
                        } else if (coord && coord.lng !== undefined && coord.lat !== undefined) {
                            return coord;
                        }
                        return null;
                    }).filter(c => c !== null);
                    return path;
                }
                return [];
            };
        }

        return mockMarker;
    }).filter(m => m !== null);

    // 保存到kmlLayers全局变量
    if (typeof kmlLayers === 'undefined') {
        window.kmlLayers = [];
    }

    kmlLayers.push({
        id: layerId,
        name: fileName,
        visible: true,
        markers: planningMarkers,
        displayMarkers: layerMarkers,
        features: features  // 保存原始features用于后续使用
    });

    console.log('KML数据加载并显示完成（不显示点），图层数:', kmlLayers.length);
}

// 加载路线数据
function loadRouteData() {
    try {
        // 从sessionStorage获取路线数据
        const storedData = sessionStorage.getItem('navigationRoute');

        if (storedData) {
            routeData = JSON.parse(storedData);
            console.log('路线数据:', routeData);

            // 更新界面显示
            updateNavigationUI();

            // 规划并绘制路线
            planRoute();
        } else {
            console.error('没有找到路线数据');
            // 显示默认数据
            displayDefaultRoute();
        }
    } catch (e) {
        console.error('加载路线数据失败:', e);
        displayDefaultRoute();
    }
}

// 更新导航界面显示
function updateNavigationUI() {
    if (!routeData) return;

    // 更新起点输入框
    const navStartInput = document.getElementById('nav-start-location');
    if (navStartInput && routeData.start) {
        navStartInput.value = routeData.start.name || '我的位置';
    }

    // 更新终点输入框
    const navEndInput = document.getElementById('nav-end-location');
    if (navEndInput && routeData.end) {
        navEndInput.value = routeData.end.name || '目的地';
    }

    // 更新途径点（如果有）
    if (routeData.waypoints && routeData.waypoints.length > 0) {
        const waypointsContainer = document.getElementById('nav-waypoints-container');
        if (waypointsContainer) {
            waypointsContainer.innerHTML = ''; // 清空现有途径点
            routeData.waypoints.forEach(waypoint => {
                addNavigationWaypoint(waypoint.name);
            });
        }
    }
}

// 规划路线（使用KML路径）
function planRoute() {
    if (!routeData || !routeData.start || !routeData.end) {
        console.error('路线数据不完整');
        return;
    }

    const startLngLat = routeData.start.position || [116.397428, 39.90923];
    const endLngLat = routeData.end.position || [116.407428, 39.91923];

    console.log('开始规划路线，起点:', startLngLat, '终点:', endLngLat);

    // 首先添加起点和终点标记
    addRouteMarkers(startLngLat, endLngLat);
    // 添加途经点标记
    if (Array.isArray(routeData.waypoints) && routeData.waypoints.length > 0) {
        addWaypointMarkers(routeData.waypoints);
    }

    // 注意：不在规划路线时隐藏KML线，而是在开始导航时隐藏
    // KML线在此阶段保持可见，便于用户查看完整的底图

    // 确保KML图已构建
    if (!kmlGraph || kmlNodes.length === 0) {
        console.log('KML图未构建，开始构建...');
        const success = buildKMLGraph();
        if (!success) {
            console.warn('KML图构建失败，使用直线路线');
            drawStraightLine(startLngLat, endLngLat);
            return;
        }
    }

    // 构建包含途经点的完整点序列：起点 -> 途经点(们) -> 终点
    const sequencePoints = [];
    sequencePoints.push(resolvePointPosition(routeData.start));

    if (Array.isArray(routeData.waypoints)) {
        routeData.waypoints.forEach(wp => {
            const pos = resolvePointPosition(wp);
            if (pos) sequencePoints.push(pos);
            else console.warn('无法解析途经点坐标，已忽略:', wp?.name || wp);
        });
    }
    sequencePoints.push(resolvePointPosition(routeData.end));

    // 逐段使用KML路径规划，失败则回退为直线路段
    let combinedPath = [];
    let totalDistance = 0;

    for (let i = 0; i < sequencePoints.length - 1; i++) {
        const a = sequencePoints[i];
        const b = sequencePoints[i + 1];

        let segResult = planKMLRoute(a, b);

        if (segResult && segResult.path && segResult.path.length >= 2) {
            // 拼接路径（智能去重：检查是否有重复点）
            if (combinedPath.length > 0) {
                // 获取上一段的最后一个点
                const lastPoint = combinedPath[combinedPath.length - 1];
                const lastLng = Array.isArray(lastPoint) ? lastPoint[0] : lastPoint.lng;
                const lastLat = Array.isArray(lastPoint) ? lastPoint[1] : lastPoint.lat;

                // 检查新路段的第一个点是否与上一段的最后一个点重复
                const firstPoint = segResult.path[0];
                const firstLng = Array.isArray(firstPoint) ? firstPoint[0] : firstPoint.lng;
                const firstLat = Array.isArray(firstPoint) ? firstPoint[1] : firstPoint.lat;

                // 如果坐标非常接近（小于0.00001度，约1米），认为是重复点
                const isDuplicate = Math.abs(lastLng - firstLng) < 0.00001 && Math.abs(lastLat - firstLat) < 0.00001;

                if (isDuplicate) {
                    // 有重复，跳过第一个点
                    combinedPath = combinedPath.concat(segResult.path.slice(1));
                } else {
                    // 无重复，保留所有点
                    combinedPath = combinedPath.concat(segResult.path);
                }
            } else {
                combinedPath = segResult.path.slice();
            }
            totalDistance += (segResult.distance || 0);
        } else {
            console.warn('路段KML规划失败，使用直线段');
            // 使用直线段作为备选
            if (combinedPath.length > 0) {
                combinedPath.push(b);
            } else {
                combinedPath = [a, b];
            }
            // 计算直线距离并累加
            try {
                const d = AMap.GeometryUtil.distance(a, b);
                totalDistance += d;
            } catch (e) {
                // 备用计算
                totalDistance += calculateDistanceBetweenPoints(a, b);
            }
        }
    }

    if (combinedPath.length >= 2) {
        // 更新距离与时间
        updateRouteInfoFromKML({ distance: totalDistance });
        // 绘制合并后的路线
        drawKMLRoute({ path: combinedPath });
        // 调整地图视野
        adjustMapView(startLngLat, endLngLat);
    } else {
        console.warn('合并路径失败，回退直线起终点');
        drawStraightLine(startLngLat, endLngLat);
    }
}

// 隐藏所有KML线要素，保留面和规划路径
function hideKMLLines() {
    if (typeof kmlLayers === 'undefined' || !kmlLayers || kmlLayers.length === 0) {
        return;
    }

    let hiddenCount = 0;

    // 遍历所有KML图层
    kmlLayers.forEach((layer, layerIndex) => {
        if (!layer.displayMarkers || layer.displayMarkers.length === 0) {
            return;
        }

        // 遍历该图层的所有显示要素
        layer.displayMarkers.forEach((marker, index) => {
            if (!marker) return;

            // 多种方式判断是否为Polyline（线要素）
            const isPolyline = marker.CLASS_NAME === 'AMap.Polyline' ||
                             marker.CLASS_NAME === 'Overlay.Polyline' ||
                             (marker.constructor && marker.constructor.name === 'Polyline') ||
                             (typeof marker.getPath === 'function' && typeof marker.setPath === 'function');

            const isPolygon = marker.CLASS_NAME === 'AMap.Polygon' ||
                            marker.CLASS_NAME === 'Overlay.Polygon' ||
                            (marker.constructor && marker.constructor.name === 'Polygon');

            if (isPolyline && !isPolygon) {
                try {
                    marker.hide();
                    hiddenCount++;
                } catch (e) {
                    console.error('隐藏线要素失败:', e);
                }
            }
        });
    });

    console.log('KML线要素已隐藏');
}

// 显示所有KML线要素（停止导航时恢复）
function showKMLLines() {
    if (typeof kmlLayers === 'undefined' || !kmlLayers || kmlLayers.length === 0) {
        return;
    }

    let shownCount = 0;

    // 遍历所有KML图层
    kmlLayers.forEach((layer, layerIndex) => {
        if (!layer.displayMarkers || layer.displayMarkers.length === 0) {
            return;
        }

        // 遍历该图层的所有显示要素
        layer.displayMarkers.forEach((marker, index) => {
            if (!marker) return;

            // 多种方式判断是否为Polyline（线要素）
            const isPolyline = marker.CLASS_NAME === 'AMap.Polyline' ||
                             marker.CLASS_NAME === 'Overlay.Polyline' ||
                             (marker.constructor && marker.constructor.name === 'Polyline') ||
                             (typeof marker.getPath === 'function' && typeof marker.setPath === 'function');

            const isPolygon = marker.CLASS_NAME === 'AMap.Polygon' ||
                            marker.CLASS_NAME === 'Overlay.Polygon' ||
                            (marker.constructor && marker.constructor.name === 'Polygon');

            if (isPolyline && !isPolygon) {
                try {
                    marker.show();
                    shownCount++;
                } catch (e) {
                    console.error('显示线要素失败:', e);
                }
            }
        });
    });

    console.log('KML线要素已显示');
}

// 更新路线信息（从KML路线结果）
function updateRouteInfoFromKML(routeResult) {
    const distance = routeResult.distance; // 米

    // 更新距离显示
    const distanceElement = document.getElementById('route-distance');
    if (distanceElement) {
        if (distance < 1000) {
            distanceElement.textContent = Math.round(distance);
            const unitElement = distanceElement.nextElementSibling;
            if (unitElement) unitElement.textContent = '米';
        } else {
            distanceElement.textContent = (distance / 1000).toFixed(1);
            const unitElement = distanceElement.nextElementSibling;
            if (unitElement) unitElement.textContent = '公里';
        }
    }

    // 更新时间显示（按步行速度5km/h估算）
    const timeElement = document.getElementById('route-time');
    if (timeElement) {
        const hours = distance / 5000; // 5km/h = 5000m/h
        const minutes = Math.ceil(hours * 60);
        timeElement.textContent = minutes;
    }
}

// 绘制KML路线（使用醒目的样式）
function drawKMLRoute(routeResult) {
    const path = routeResult.path;

    // 清除之前的路线
    if (routePolyline) {
        navigationMap.remove(routePolyline);
        routePolyline = null;
    }

    // 验证路径数据
    if (!path || path.length < 2) {
        console.error('路径数据无效或点数不足');
        return;
    }

    // 绘制路线（使用与KML线一致的样式）
    try {
        routePolyline = new AMap.Polyline({
            path: path,
            strokeColor: '#00C853',     // 标准导航绿色
            strokeWeight: 4,             // 与KML线宽一致（3-4px）
            strokeOpacity: 0.95,         // 稍微透明，更自然
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: 200,                 // 高zIndex，确保在KML线上方
            map: navigationMap
        });

        // 强制刷新地图
        try {
            navigationMap.setZoom(navigationMap.getZoom());
        } catch (e) {
            console.warn('触发地图重绘失败:', e);
        }

        // 自动调整地图视野到路径范围
        try {
            // 计算路径的边界
            let minLng = path[0][0], maxLng = path[0][0];
            let minLat = path[0][1], maxLat = path[0][1];

            path.forEach(point => {
                const lng = Array.isArray(point) ? point[0] : point.lng;
                const lat = Array.isArray(point) ? point[1] : point.lat;

                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });

            // 创建边界并设置地图视野
            const bounds = new AMap.Bounds([minLng, minLat], [maxLng, maxLat]);
            navigationMap.setBounds(bounds, false, [80, 80, 80, 80]); // 添加80px内边距
        } catch (e) {
            console.error('调整地图视野失败:', e);
        }

        // 检查Polyline是否真的在地图上
        setTimeout(() => {
            const allOverlays = navigationMap.getAllOverlays('polyline');
            if (allOverlays.length === 0) {
                console.error('警告: 地图上没有找到任何Polyline');
            }
        }, 500);

    } catch (error) {
        console.error('创建Polyline失败:', error);
        console.error('错误详情:', error.stack);
    }
}

// 绘制直线（备用方案，使用与首页一致的线宽）
function drawStraightLine(start, end) {
    // 清除之前的路线
    if (routePolyline) {
        navigationMap.remove(routePolyline);
        routePolyline = null;
    }

    routePolyline = new AMap.Polyline({
        path: [start, end],
        strokeColor: '#00C853',
        strokeWeight: 4, // 与首页KML线宽一致
        strokeOpacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 50,
        map: navigationMap
    });

    // 计算直线距离
    const distance = AMap.GeometryUtil.distance(start, end);

    // 更新距离显示
    const distanceElement = document.getElementById('route-distance');
    if (distanceElement) {
        if (distance < 1000) {
            distanceElement.textContent = Math.round(distance);
            const unitElement = distanceElement.nextElementSibling;
            if (unitElement) unitElement.textContent = '米';
        } else {
            distanceElement.textContent = (distance / 1000).toFixed(1);
            const unitElement = distanceElement.nextElementSibling;
            if (unitElement) unitElement.textContent = '公里';
        }
    }

    // 估算时间（按步行速度5km/h）
    const timeElement = document.getElementById('route-time');
    if (timeElement) {
        const hours = distance / 5000;
        const minutes = Math.ceil(hours * 60);
        timeElement.textContent = minutes;
    }

    // 调整地图视野
    adjustMapView(start, end);
}

// 调整地图视野
function adjustMapView(start, end) {
    // 创建包含起点和终点的边界
    const bounds = new AMap.Bounds(start, end);

    // 调整地图视野以适应边界，并添加padding
    navigationMap.setBounds(bounds, false, [60, 60, 200, 60]); // 上右下左的padding
}

// 添加起点和终点标记
function addRouteMarkers(startLngLat, endLngLat) {
    // 清除之前的标记
    if (startMarker) {
        navigationMap.remove(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        navigationMap.remove(endMarker);
        endMarker = null;
    }

    // 根据起点是否为“我的位置”选择不同的图标
    const isMyLocationStart = routeData?.start?.name === '我的位置' || routeData?.start?.isMyLocation === true;
    // 为“我的位置”使用导航目录下的圆形图标（居中对齐），否则使用针状起点图标（尖端对齐）
    const startIcon = new AMap.Icon({
        size: isMyLocationStart ? new AMap.Size(30, 30) : new AMap.Size(30, 38),
        image: isMyLocationStart
            ? MapConfig.markerStyles.currentLocation.icon
            : 'images/工地数字导航小程序切图/司机/2X/地图icon/起点.png',
        imageSize: isMyLocationStart ? new AMap.Size(30, 30) : new AMap.Size(30, 38)
    });

    startMarker = new AMap.Marker({
        position: startLngLat,
        icon: startIcon,
        // “我的位置”圆形图标用居中对齐；起点针状用尖端对齐
        offset: isMyLocationStart ? new AMap.Pixel(-15, -15) : new AMap.Pixel(-15, -38),
        zIndex: 100,
        map: navigationMap,
        title: routeData?.start?.name || '起点'
    });

    // 创建终点标记（使用本地"终点.png"）
    const endIcon = new AMap.Icon({
        size: new AMap.Size(30, 38),
        image: 'images/工地数字导航小程序切图/司机/2X/地图icon/终点.png',
        imageSize: new AMap.Size(30, 38)
    });

    endMarker = new AMap.Marker({
        position: endLngLat,
        icon: endIcon,
        offset: new AMap.Pixel(-15, -38),
        zIndex: 100,
        map: navigationMap,
        title: routeData?.end?.name || '终点'
    });

    console.log('起点和终点标记已添加');
}

// 添加途经点标记
function addWaypointMarkers(waypoints) {
    // 清理旧的途经点标记
    if (waypointMarkers && waypointMarkers.length) {
        navigationMap.remove(waypointMarkers);
        waypointMarkers = [];
    }

    const icon = new AMap.Icon({
        size: new AMap.Size(26, 34),
        image: 'images/工地数字导航小程序切图/司机/2X/地图icon/途径点.png',
        imageSize: new AMap.Size(26, 34)
    });

    waypoints.forEach(wp => {
        const pos = resolvePointPosition(wp);
        if (!pos) return;
        const marker = new AMap.Marker({
            position: pos,
            icon,
            offset: new AMap.Pixel(-13, -34),
            zIndex: 99,
            map: navigationMap,
            title: wp?.name || '途经点'
        });
        waypointMarkers.push(marker);
    });
}

// 解析点对象到 [lng, lat]
function resolvePointPosition(point) {
    if (!point) return null;
    if (Array.isArray(point)) return point;
    if (point.position && Array.isArray(point.position)) return point.position;
    if (point.name) {
        // 在KML图层中按名称查找
        try {
            if (typeof kmlLayers !== 'undefined' && kmlLayers && kmlLayers.length > 0) {
                for (const layer of kmlLayers) {
                    if (!layer.visible) continue;
                    for (const marker of layer.markers) {
                        if (!marker || typeof marker.getExtData !== 'function') continue;
                        const ext = marker.getExtData();
                        if (ext && ext.name === point.name && typeof marker.getPosition === 'function') {
                            const pos = marker.getPosition();
                            if (pos && pos.lng !== undefined && pos.lat !== undefined) return [pos.lng, pos.lat];
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('解析名称到坐标失败:', point.name, e);
        }
    }
    return null;
}

// 注意：原先的 SVG 生成函数已移除，改用本地 PNG 资源。

// 显示默认路线（当没有数据时）
function displayDefaultRoute() {
    console.log('显示默认路线');

    // 默认位置
    const defaultStart = [116.397428, 39.90923];
    const defaultEnd = [116.407428, 39.91923];

    // 设置默认数据
    routeData = {
        start: {
            name: '我的位置',
            position: defaultStart
        },
        end: {
            name: '1号楼',
            position: defaultEnd
        }
    };

    updateNavigationUI();

    // 添加标记
    addRouteMarkers(defaultStart, defaultEnd);

    // 绘制直线路线
    drawStraightLine(defaultStart, defaultEnd);
}

// 保存导航页地图状态用于返回主页时恢复视图
function saveNavigationMapState() {
    if (!navigationMap) return;

    try {
        const zoom = navigationMap.getZoom();
        const center = navigationMap.getCenter();

        // 如果有 KML 数据，计算 KML 区域的边界作为返回目标
        const kmlDataStr = sessionStorage.getItem('kmlData');
        let kmlBounds = null;

        if (kmlDataStr) {
            const kmlData = JSON.parse(kmlDataStr);
            const allCoordinates = [];

            // 收集所有 KML 要素的坐标
            kmlData.forEach(layer => {
                if (layer.features) {
                    layer.features.forEach(feature => {
                        if (feature.geometry && feature.geometry.coordinates) {
                            if (feature.type === '点') {
                                allCoordinates.push(feature.geometry.coordinates);
                            } else if (feature.type === '线' || feature.type === '面') {
                                allCoordinates.push(...feature.geometry.coordinates);
                            }
                        }
                    });
                }
            });

            // 计算边界
            if (allCoordinates.length > 0) {
                let minLng = allCoordinates[0][0];
                let maxLng = allCoordinates[0][0];
                let minLat = allCoordinates[0][1];
                let maxLat = allCoordinates[0][1];

                allCoordinates.forEach(coord => {
                    const [lng, lat] = coord;
                    minLng = Math.min(minLng, lng);
                    maxLng = Math.max(maxLng, lng);
                    minLat = Math.min(minLat, lat);
                    maxLat = Math.max(maxLat, lat);
                });

                kmlBounds = {
                    minLng: minLng,
                    maxLng: maxLng,
                    minLat: minLat,
                    maxLat: maxLat
                };
            }
        }

        const mapState = {
            zoom: zoom,
            center: [center.lng, center.lat],
            angle: 0,
            fromNavigation: true, // 标记来自导航页
            kmlBounds: kmlBounds  // 保存 KML 边界信息
        };

        sessionStorage.setItem('mapState', JSON.stringify(mapState));
        console.log('保存导航页地图状态（包含 KML 边界）:', mapState);
    } catch (e) {
        console.warn('保存地图状态失败:', e);
    }
}

// 设置事件监听
function setupNavigationEvents() {
    // 返回按钮
    const backBtn = document.getElementById('nav-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            // 如果正在导航，显示退出确认弹窗
            if (isNavigating) {
                showExitNavigationModal();
            } else {
                // 不在导航状态，保存地图状态后返回主页
                saveNavigationMapState();
                cleanupMap();
                window.location.href = 'index.html';
            }
        });
    }

    // 开始导航按钮
    const startNavBtn = document.getElementById('start-navigation-btn');
    if (startNavBtn) {
        startNavBtn.addEventListener('click', function() {
            console.log('开始导航');
            startNavigationUI();
        });
    }

    // 添加途径点按钮 - 跳转到点位选择界面
    const addWaypointBtn = document.getElementById('nav-add-waypoint-btn');
    if (addWaypointBtn) {
        addWaypointBtn.addEventListener('click', function() {
            console.log('跳转到点位选择界面添加途径点');

            // 检查当前途径点数量
            const waypointsContainer = document.getElementById('nav-waypoints-container');
            let currentCount = 0;
            if (waypointsContainer) {
                currentCount = waypointsContainer.querySelectorAll('.waypoint-input').length;
            }

            // 限制最多 2 个途经点
            if (currentCount >= 2) {
                alert('最多只能添加 2 个途经点');
                return;
            }

            // 保存当前路线数据到sessionStorage
            const startValue = document.getElementById('nav-start-location')?.value || '';
            const endValue = document.getElementById('nav-end-location')?.value || '';

            const waypoints = [];
            if (waypointsContainer) {
                const waypointInputs = waypointsContainer.querySelectorAll('.waypoint-input');
                waypointInputs.forEach(input => {
                    if (input.value) {
                        waypoints.push(input.value);
                    }
                });
            }

            const routeData = {
                startLocation: startValue,
                endLocation: endValue,
                waypoints: waypoints,
                autoAddWaypoint: true  // 标记：跳转后自动添加新途径点
            };

            sessionStorage.setItem('routePlanningData', JSON.stringify(routeData));

            // 保存来源页面
            sessionStorage.setItem('pointSelectionReferrer', 'navigation.html');

            // 跳转到点位选择页面
            window.location.href = 'point-selection.html';
        });
    }

    // 起点输入框点击事件
    const navStartInput = document.getElementById('nav-start-location');
    if (navStartInput) {
        navStartInput.addEventListener('click', function() {
            // 保存当前数据并跳转
            const startValue = this.value || '';
            const endValue = document.getElementById('nav-end-location')?.value || '';

            const waypointsContainer = document.getElementById('nav-waypoints-container');
            const waypoints = [];
            if (waypointsContainer) {
                const waypointInputs = waypointsContainer.querySelectorAll('.waypoint-input');
                waypointInputs.forEach(input => {
                    if (input.value) {
                        waypoints.push(input.value);
                    }
                });
            }

            const routeData = {
                startLocation: startValue,
                endLocation: endValue,
                waypoints: waypoints,
                activeInput: 'nav-start-location',
                inputType: 'start'
            };

            sessionStorage.setItem('routePlanningData', JSON.stringify(routeData));
            sessionStorage.setItem('pointSelectionReferrer', 'navigation.html');
            window.location.href = 'point-selection.html';
        });
    }

    // 终点输入框点击事件
    const navEndInput = document.getElementById('nav-end-location');
    if (navEndInput) {
        navEndInput.addEventListener('click', function() {
            // 保存当前数据并跳转
            const startValue = document.getElementById('nav-start-location')?.value || '';
            const endValue = this.value || '';

            const waypointsContainer = document.getElementById('nav-waypoints-container');
            const waypoints = [];
            if (waypointsContainer) {
                const waypointInputs = waypointsContainer.querySelectorAll('.waypoint-input');
                waypointInputs.forEach(input => {
                    if (input.value) {
                        waypoints.push(input.value);
                    }
                });
            }

            const routeData = {
                startLocation: startValue,
                endLocation: endValue,
                waypoints: waypoints,
                activeInput: 'nav-end-location',
                inputType: 'end'
            };

            sessionStorage.setItem('routePlanningData', JSON.stringify(routeData));
            sessionStorage.setItem('pointSelectionReferrer', 'navigation.html');
            window.location.href = 'point-selection.html';
        });
    }

    // 交换起点和终点按钮
    const swapBtn = document.getElementById('nav-swap-btn');
    if (swapBtn) {
        swapBtn.addEventListener('click', function() {
            console.log('交换起点和终点');
            swapStartAndEnd();
        });
    }

    // 底部卡片关闭按钮
    const destinationCloseBtn = document.getElementById('destination-close-btn');
    if (destinationCloseBtn) {
        destinationCloseBtn.addEventListener('click', function() {
            showExitNavigationModal();
        });
    }

    // 退出导航取消按钮
    const exitCancelBtn = document.getElementById('exit-cancel-btn');
    if (exitCancelBtn) {
        exitCancelBtn.addEventListener('click', function() {
            hideExitNavigationModal();
        });
    }

    // 退出导航确认按钮
    const exitConfirmBtn = document.getElementById('exit-confirm-btn');
    if (exitConfirmBtn) {
        exitConfirmBtn.addEventListener('click', function() {
            hideExitNavigationModal();
            stopNavigationUI();
            saveNavigationMapState();
            cleanupMap();
            window.location.href = 'index.html';
        });
    }

    // 导航完成按钮
    const completeFinishBtn = document.getElementById('complete-finish-btn');
    if (completeFinishBtn) {
        completeFinishBtn.addEventListener('click', function() {
            saveNavigationMapState();
            cleanupMap();
            window.location.href = 'index.html';
        });
    }

    // 添加键盘快捷键用于测试导航完成（按 'C' 键完成导航）
    document.addEventListener('keydown', function(e) {
        if (e.key === 'c' || e.key === 'C') {
            if (isNavigating) {
                console.log('模拟导航完成（键盘快捷键触发）');
                checkNavigationComplete();
            }
        }
    });
}

// 在导航页面添加途径点
function addNavigationWaypoint(waypointName) {
    const waypointsContainer = document.getElementById('nav-waypoints-container');
    if (!waypointsContainer) return;

    const waypointId = 'nav-waypoint-' + Date.now();
    const waypointRow = document.createElement('div');
    waypointRow.className = 'waypoint-row';
    waypointRow.id = waypointId;
    waypointRow.innerHTML = `
        <div class="location-item" style="flex: 1;">
            <i class="fas fa-dot-circle" style="color: #FF9800;"></i>
            <input type="text" placeholder="添加途经点" class="waypoint-input" readonly value="${waypointName}">
        </div>
        <div class="waypoint-actions">
            <button class="remove-waypoint-btn" data-id="${waypointId}">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    waypointsContainer.appendChild(waypointRow);

    // 添加删除事件
    const removeBtn = waypointRow.querySelector('.remove-waypoint-btn');
    removeBtn.addEventListener('click', function() {
        removeNavigationWaypoint(waypointId);
    });

    // 为新的途径点输入框设置唯一ID
    const waypointInput = waypointRow.querySelector('.waypoint-input');
    waypointInput.id = waypointId + '-input';

    console.log('已添加途径点:', waypointId);
}

// 交换起点和终点
function swapStartAndEnd() {
    if (!routeData || !routeData.start || !routeData.end) {
        console.warn('没有足够的路线数据可以交换');
        return;
    }

    // 交换routeData中的起点和终点
    const temp = routeData.start;
    routeData.start = routeData.end;
    routeData.end = temp;

    // 更新UI显示
    updateNavigationUI();

    // 重新规划路线
    planRoute();

    console.log('已交换起点和终点');
}

// 移除导航页面的途径点
function removeNavigationWaypoint(id) {
    const waypointElement = document.getElementById(id);
    if (waypointElement) {
        waypointElement.remove();
        console.log('已移除途径点:', id);
    }
}
function cleanupMap() {
    try { stopRealtimePositionTracking(); } catch (e) {}
    try { stopRealNavigationTracking(); } catch (e) {}

    if (navigationMap) {
        try {
            if (startMarker) { navigationMap.remove(startMarker); startMarker = null; }
            if (endMarker) { navigationMap.remove(endMarker); endMarker = null; }
            if (waypointMarkers && waypointMarkers.length) { navigationMap.remove(waypointMarkers); waypointMarkers = []; }
            if (userMarker) { navigationMap.remove(userMarker); userMarker = null; }
            if (passedRoutePolyline) { navigationMap.remove(passedRoutePolyline); passedRoutePolyline = null; }
            if (deviatedRoutePolyline) { navigationMap.remove(deviatedRoutePolyline); deviatedRoutePolyline = null; }
            if (routePolyline) { navigationMap.remove(routePolyline); routePolyline = null; }
        } catch (e) {}
        try { navigationMap.destroy(); } catch (e) {}
        navigationMap = null;
    }
}

// 页面加载完成后初始化
window.addEventListener('load', function() {
    console.log('导航页面加载完成');
    initNavigationMap();
    setupNavigationEvents();

    // 从sessionStorage恢复路线规划数据
    restoreNavigationRoutePlanningData();
});

// 恢复导航页面的路线规划数据
function restoreNavigationRoutePlanningData() {
    const routeData = sessionStorage.getItem('routePlanningData');
    if (!routeData) {
        return;
    }

    try {
        const data = JSON.parse(routeData);
        console.log('恢复导航页面路线规划数据:', data);

        const startInput = document.getElementById('nav-start-location');
        const endInput = document.getElementById('nav-end-location');

        if (data.startLocation && startInput) {
            startInput.value = data.startLocation;
        }
        if (data.endLocation && endInput) {
            endInput.value = data.endLocation;
        }

        // 恢复途经点
        if (data.waypoints && data.waypoints.length > 0) {
            // 先清空现有途经点
            const waypointsContainer = document.getElementById('nav-waypoints-container');
            if (waypointsContainer) {
                waypointsContainer.innerHTML = '';
            }

            // 添加途经点
            data.waypoints.forEach((waypoint) => {
                addNavigationWaypoint(waypoint);
            });
        }

        // 清除sessionStorage中的数据（已恢复）
        sessionStorage.removeItem('routePlanningData');
    } catch (e) {
        console.error('恢复导航页面路线规划数据失败:', e);
    }
}

// 页面卸载时清理资源
window.addEventListener('beforeunload', function() {
    cleanupMap();
});

// 导航状态变量
let isNavigating = false;
let currentNavigationIndex = 0;
let navigationPath = [];
let nextTurnIndex = -1; // 下一个转向点的索引
let hasReachedStart = false; // 是否已到达起点附近并正式开始沿路网导航

// 工业运输车速度配置（单位：米/小时）
const VEHICLE_SPEED = 10000; // 10km/h，约为工业运输车的平均速度

// 开始导航UI
function startNavigationUI() {
    if (!routeData || !routePolyline) {
        alert('请先规划路线');
        return;
    }

    isNavigating = true;
    hasReachedStart = false; // 重置：要求先到达起点附近再开始沿路网导航
    isOffRoute = false;  // 重置偏离路径状态
    maxPassedSegIndex = -1; // 重置已走过的最远点索引
    passedSegments.clear(); // 清空已走过的路段标记
    visitedWaypoints.clear(); // 清空已访问的途径点
    deviatedPath = []; // 清空偏离路径点集合
    currentBranchInfo = null; // 清空分支信息
    userChosenBranch = -1; // 重置用户分支选择
    lastBranchNotificationTime = 0; // 重置分支提示时间

    // 停止导航前的实时位置追踪
    stopRealtimePositionTracking();

    // 隐藏KML线要素，保留面和规划路径
    hideKMLLines();

    // 显示导航提示卡片
    showTipCard();

    // 切换底部卡片为导航状态
    const navigationCard = document.getElementById('navigation-card');
    if (navigationCard) {
        navigationCard.classList.add('navigating');
    }

    // 更新目的地信息（从KML数据中获取）
    updateDestinationInfo();

    // 初始化导航数据
    if (routePolyline && typeof routePolyline.getPath === 'function') {
        navigationPath = routePolyline.getPath();
        currentNavigationIndex = 0;

        // 查找第一个转向点
        findNextTurnPoint();

            // 基于当前规划路径构建“途经点索引映射”，用于到达/转向提示
            try {
                waypointIndexMap = buildWaypointIndexMap(navigationPath, routeData && routeData.waypoints);
            } catch (e) {
                console.warn('构建途经点索引映射失败:', e);
                waypointIndexMap = [];
            }
    }

    // 更新导航提示信息
    updateNavigationTip();

    // 启动基于真实GPS的导航追踪
    startRealNavigationTracking();

    console.log('导航已开始');
}

// 停止导航UI
function stopNavigationUI() {
    isNavigating = false;
    maxPassedSegIndex = -1; // 重置已走过的最远点索引

    // 隐藏导航提示卡片
    hideTipCard();

    // 恢复底部卡片状态
    const navigationCard = document.getElementById('navigation-card');
    if (navigationCard) {
        navigationCard.classList.remove('navigating');
    }

    // 停止模拟导航与清理覆盖物
    // 停止真实GPS导航追踪与清理覆盖物
    stopRealNavigationTracking();

    // 恢复显示KML线要素
    showKMLLines();

    console.log('导航已停止');
}

// 更新目的地信息
function updateDestinationInfo() {
    if (!routeData || !routeData.end) {
        return;
    }

    const destinationName = routeData.end.name || '目的地';

    // 尝试从KML数据中获取详细信息
    let orgName = '';
    let description = '';

    // 从KML图层中查找终点的详细信息
    if (typeof kmlLayers !== 'undefined' && kmlLayers && kmlLayers.length > 0) {
        for (const layer of kmlLayers) {
            if (!layer.visible) continue;

            for (const marker of layer.markers) {
                if (!marker || typeof marker.getExtData !== 'function') {
                    continue;
                }

                const extData = marker.getExtData();
                if (extData && extData.name === destinationName) {
                    // 找到匹配的KML点
                    description = extData.description || '';

                    // 尝试从描述中提取组织名称
                    // 假设描述格式可能包含组织信息
                    if (description) {
                        // 如果描述中包含特定分隔符，提取第一部分作为组织名
                        const parts = description.split(/[,，;；]/);
                        if (parts.length > 1) {
                            orgName = parts[0].trim();
                        }
                    }

                    console.log('从KML获取目的地信息:', { name: destinationName, org: orgName, desc: description });
                    break;
                }
            }

            if (orgName) break;
        }
    }

    // 更新DOM元素
    const destinationOrgElem = document.getElementById('destination-org');
    const destinationNameElem = document.getElementById('destination-name');

    if (destinationOrgElem) {
        if (orgName) {
            destinationOrgElem.textContent = orgName;
            destinationOrgElem.style.display = 'block';
        } else {
            destinationOrgElem.style.display = 'none';
        }
    }

    if (destinationNameElem) {
        destinationNameElem.textContent = destinationName;
    }
}

// 显示导航提示卡片
function showTipCard() {
    const tipCard = document.getElementById('navigation-tip-card');
    if (tipCard) {
        tipCard.classList.add('active');
    }
}

// 隐藏导航提示卡片
function hideTipCard() {
    const tipCard = document.getElementById('navigation-tip-card');
    if (tipCard) {
        tipCard.classList.remove('active');
    }
}

// 更新导航提示信息
function updateNavigationTip() {
    if (!routeData || !navigationPath || navigationPath.length === 0) {
        return;
    }

    // ====== 分支提示处理 ======
    if (currentBranchInfo && currentBranchInfo.isBranching) {
        // 如果在分岔路口附近，显示分支提示
        const isRecommendedBranch = (userChosenBranch === -1 || userChosenBranch === currentBranchInfo.recommendedBranch);

        // 更新UI显示当前是否在推荐路线上
        const tipTextElem = document.getElementById('tip-text');
        if (tipTextElem && !isRecommendedBranch) {
            // 用户选择了非推荐分支，添加提示
            const originalText = tipTextElem.textContent;
            if (!originalText.includes('备选路线')) {
                console.log('更新提示：您正在备选路线上');
                // 这里可以在UI上添加提示，当前只在控制台记录
            }
        }
    }

    // 计算剩余距离
    let remainingDistance = 0;
    if (routePolyline && typeof routePolyline.getLength === 'function') {
        remainingDistance = routePolyline.getLength();
    }

    // 更新上方提示卡片的"剩余"距离
    const remainingDistanceElem = document.getElementById('tip-remaining-distance');
    const remainingUnitElem = document.getElementById('tip-remaining-unit');

    if (remainingDistanceElem && remainingUnitElem) {
        if (remainingDistance < 1000) {
            remainingDistanceElem.textContent = Math.round(remainingDistance);
            remainingUnitElem.textContent = 'm';
        } else {
            remainingDistanceElem.textContent = (remainingDistance / 1000).toFixed(1);
            remainingUnitElem.textContent = 'km';
        }
    }

    // 估算剩余时间（按工业运输车速度10km/h）
    const estimatedTimeElem = document.getElementById('tip-estimated-time');
    if (estimatedTimeElem) {
        const hours = remainingDistance / VEHICLE_SPEED;
        const minutes = Math.ceil(hours * 60);
        estimatedTimeElem.textContent = minutes;
    }

    // 更新下方卡片的目的地距离和时间
    const destinationDistanceElem = document.getElementById('destination-distance');
    const destinationTimeElem = document.getElementById('destination-time');

    if (destinationDistanceElem) {
        destinationDistanceElem.textContent = Math.round(remainingDistance);
    }

    if (destinationTimeElem) {
        const hours = remainingDistance / VEHICLE_SPEED;
        const minutes = Math.ceil(hours * 60);
        destinationTimeElem.textContent = minutes;
    }

    // 获取当前位置
    const currPos = userMarker ?
        [userMarker.getPosition().lng, userMarker.getPosition().lat] :
        navigationPath[Math.max(0, currentNavigationIndex)];

    // 先找“最近路口”，用于显示“到最近路口还有 X 米”
    let directionType = 'straight';
    let distanceToNext = 0;
    const junction = findNextJunctionAhead(currPos, navigationPath, currentNavigationIndex || 0);
    if (junction) {
        const angle = junction.angle;
        if (angle > 135 || angle < -135) directionType = 'uturn';
        else if (angle > 30 && angle <= 135) directionType = 'right';
        else if (angle < -30 && angle >= -135) directionType = 'left';
        else directionType = 'straight';
        distanceToNext = Math.round(junction.distance || 0);
    } else {
        // 回退：使用原有“下一个转向点”的逻辑
        directionType = getNavigationDirection();
        if (nextTurnIndex > 0 && nextTurnIndex < navigationPath.length) {
            distanceToNext = computeDistanceToIndexMeters(currPos, navigationPath, nextTurnIndex) || 0;
            if (!isFinite(distanceToNext) || distanceToNext <= 0) {
                for (let i = currentNavigationIndex; i < nextTurnIndex; i++) {
                    if (i + 1 < navigationPath.length) {
                        distanceToNext += calculateDistanceBetweenPoints(
                            navigationPath[i],
                            navigationPath[i + 1]
                        );
                    }
                }
            }
        } else {
            distanceToNext = remainingDistance;
        }
    }

    
    // 调试日志
        try {
            console.log('导航提示更新:', {
                directionType,
                distanceToNext: Math.round(distanceToNext || 0),
                nextTurnIndex,
                currentNavigationIndex
            });
        } catch (e) {}
        updateDirectionIcon(directionType, distanceToNext);
    
}

// 计算从“当前点在路网的投影点”到指定路径索引（targetIndex）的沿路网距离（米）
function computeDistanceToIndexMeters(point, path, targetIndex) {
    if (!path || path.length < 2) return 0;
    const proj = projectPointOntoPathMeters(point, path);
    if (!proj) return 0;
    const idx = Math.max(0, Math.min(path.length - 1, targetIndex));

    // 若目标索引不在当前投影之后，视为0（通常意味着转向点已过，将会被重新寻找）
    if (idx <= proj.index) {
        // 特殊情况：若 idx === proj.index + 1，则只需到该段终点
        if (idx === proj.index + 1) {
            const segEnd = normalizeLngLat(path[idx]);
            return calculateDistanceBetweenPoints(proj.projected, segEnd);
        }
        return 0;
    }

    let dist = 0;
    const firstEnd = normalizeLngLat(path[proj.index + 1]);
    dist += calculateDistanceBetweenPoints(proj.projected, firstEnd);
    for (let j = proj.index + 1; j < idx; j++) {
        const a = normalizeLngLat(path[j]);
        const b = normalizeLngLat(path[j + 1]);
        dist += calculateDistanceBetweenPoints(a, b);
    }
    return dist;
}

// 查找下一个转向点
function findNextTurnPoint() {
    if (!navigationPath || navigationPath.length < 3) {
        nextTurnIndex = -1;
        return;
    }

    // 可配置阈值：转向角度、最小线段长度、前视最大距离
    // 说明：KML路径点可能较密集，线段长度往往小于10m，过大阈值会导致一直找不到拐点
    let TURN_ANGLE_THRESHOLD = 28; // 默认转向角度（度）
    let MIN_SEGMENT_LEN_M = 3;     // 默认最小线段长度（米）
    let LOOKAHEAD_MAX_M = 120;     // 默认前视最大距离（米）
    try {
        if (MapConfig && MapConfig.navigationConfig) {
            if (typeof MapConfig.navigationConfig.turnAngleThresholdDegrees === 'number') {
                TURN_ANGLE_THRESHOLD = MapConfig.navigationConfig.turnAngleThresholdDegrees;
            }
            if (typeof MapConfig.navigationConfig.minSegmentLengthMeters === 'number') {
                MIN_SEGMENT_LEN_M = MapConfig.navigationConfig.minSegmentLengthMeters;
            }
            if (typeof MapConfig.navigationConfig.turnLookAheadMeters === 'number') {
                LOOKAHEAD_MAX_M = MapConfig.navigationConfig.turnLookAheadMeters;
            }
        }
    } catch (e) {}

    // 当前坐标（用于计算“沿路网”距离）
    const currPos = userMarker ?
        [userMarker.getPosition().lng, userMarker.getPosition().lat] :
        navigationPath[Math.max(0, currentNavigationIndex)];

    // 从当前位置开始查找
    for (let i = currentNavigationIndex + 1; i < navigationPath.length - 1; i++) {
        // 跳过极短线段引起的“锯齿”抖动
        const segLenPrev = calculateDistanceBetweenPoints(navigationPath[i - 1], navigationPath[i]);
        const segLenNext = calculateDistanceBetweenPoints(navigationPath[i], navigationPath[i + 1]);
        if (segLenPrev < MIN_SEGMENT_LEN_M || segLenNext < MIN_SEGMENT_LEN_M) {
            continue;
        }

        // 使用前后各两个点（如有）进行角度平滑，减小微小偏折的影响
        const p1 = (i - 2 >= 0) ? navigationPath[i - 2] : navigationPath[i - 1];
        const p2 = navigationPath[i];
        const p3 = (i + 2 < navigationPath.length) ? navigationPath[i + 2] : navigationPath[i + 1];

        const angle = calculateTurnAngle(p1, p2, p3);

        // 如果转向角度大于阈值，认为是一个转向点
        if (Math.abs(angle) > TURN_ANGLE_THRESHOLD) {
            // 仅接受“前视距离”内的第一个拐点，避免把很远的拐点当作下一个
            const distAhead = computeDistanceToIndexMeters(currPos, navigationPath, i) || 0;
            if (isFinite(distAhead) && distAhead >= 0 && distAhead <= LOOKAHEAD_MAX_M) {
                nextTurnIndex = i;
                console.log(`找到转向点 索引:${i}, 角度:${angle.toFixed(2)}°, 前方${Math.round(distAhead)}m`);
                return;
            }
        }
    }

    // 后备方案：若严格条件未找到拐点，放宽条件再次扫描（忽略最小线段长度限制）
    for (let i = currentNavigationIndex + 1; i < navigationPath.length - 1; i++) {
        const p1 = (i - 2 >= 0) ? navigationPath[i - 2] : navigationPath[i - 1];
        const p2 = navigationPath[i];
        const p3 = (i + 2 < navigationPath.length) ? navigationPath[i + 2] : navigationPath[i + 1];
        const angle = calculateTurnAngle(p1, p2, p3);
        const looserThreshold = Math.max(15, TURN_ANGLE_THRESHOLD - 10); // 最低15°
        if (Math.abs(angle) > looserThreshold) {
            const distAhead = computeDistanceToIndexMeters(currPos, navigationPath, i) || 0;
            if (isFinite(distAhead) && distAhead >= 0 && distAhead <= LOOKAHEAD_MAX_M) {
                nextTurnIndex = i;
                console.log(`(放宽) 找到转向点 索引:${i}, 角度:${angle.toFixed(2)}°, 前方${Math.round(distAhead)}m`);
                return;
            }
        }
    }

    // 如果没有找到转向点，设置为终点
    nextTurnIndex = navigationPath.length - 1;
}

// 计算两点之间的距离（米）
function calculateDistanceBetweenPoints(point1, point2) {
    const R = 6371000; // 地球半径（米）

    let lng1, lat1, lng2, lat2;

    // 处理 AMap.LngLat 对象
    if (point1.lng !== undefined && point1.lat !== undefined) {
        lng1 = point1.lng;
        lat1 = point1.lat;
    } else if (Array.isArray(point1)) {
        lng1 = point1[0];
        lat1 = point1[1];
    } else {
        return 0;
    }

    if (point2.lng !== undefined && point2.lat !== undefined) {
        lng2 = point2.lng;
        lat2 = point2.lat;
    } else if (Array.isArray(point2)) {
        lng2 = point2[0];
        lat2 = point2[1];
    } else {
        return 0;
    }

    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLat = (lat2 - lat1) * Math.PI / 180;
    const deltaLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// 计算转向角度
function calculateTurnAngle(point1, point2, point3) {
    // 计算从point1到point2的方位角
    const bearing1 = calculateBearingBetweenPoints(point1, point2);
    // 计算从point2到point3的方位角
    const bearing2 = calculateBearingBetweenPoints(point2, point3);

    // 计算转向角度
    let angle = bearing2 - bearing1;

    // 规范化角度到 -180 到 180 范围
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;

    return angle;
}

// 计算路径某索引处的“平滑角度”（尽量使用 i-2 与 i+2 邻点）
function getAngleAtIndex(path, idx) {
    if (!path || path.length < 3) return 0;
    const mid = idx;
    const prevIdx = (mid - 2 >= 0) ? mid - 2 : mid - 1;
    const nextIdx = (mid + 2 < path.length) ? mid + 2 : mid + 1;
    if (prevIdx < 0 || nextIdx >= path.length) return 0;
    return calculateTurnAngle(path[prevIdx], path[mid], path[nextIdx]);
}

// 查找“最近路口”：从当前位置沿规划路径向前，寻找第一个满足“路口角度阈值”的节点
// 返回 { index, angle, distance } 或 null
function findNextJunctionAhead(currPos, path, startIndex) {
    if (!path || path.length < 3) return null;

    // 配置项
    let LOOKAHEAD_MAX_M = 120;       // 前视最大距离
    let MIN_SEGMENT_LEN_M = 3;       // 最小线段长度（去抖）
    let JUNCTION_MIN_ANGLE = 10;     // 将“很直的点”也当作路口候选（用于直行提示）
    try {
        if (MapConfig && MapConfig.navigationConfig) {
            if (typeof MapConfig.navigationConfig.turnLookAheadMeters === 'number') {
                LOOKAHEAD_MAX_M = MapConfig.navigationConfig.turnLookAheadMeters;
            }
            if (typeof MapConfig.navigationConfig.minSegmentLengthMeters === 'number') {
                MIN_SEGMENT_LEN_M = MapConfig.navigationConfig.minSegmentLengthMeters;
            }
            if (typeof MapConfig.navigationConfig.junctionAngleThresholdDegrees === 'number') {
                JUNCTION_MIN_ANGLE = MapConfig.navigationConfig.junctionAngleThresholdDegrees;
            }
        }
    } catch (e) {}

    // 从 startIndex 之后搜索，限定前视距离
    for (let i = Math.max(1, startIndex + 1); i < path.length - 1; i++) {
        const segLenPrev = calculateDistanceBetweenPoints(path[i - 1], path[i]);
        const segLenNext = calculateDistanceBetweenPoints(path[i], path[i + 1]);
        if (segLenPrev < MIN_SEGMENT_LEN_M || segLenNext < MIN_SEGMENT_LEN_M) continue;

        const angle = getAngleAtIndex(path, i);
        if (Math.abs(angle) < JUNCTION_MIN_ANGLE) continue; // 太直，当作非路口

        const distAhead = computeDistanceToIndexMeters(currPos, path, i) || 0;
        if (!isFinite(distAhead) || distAhead < 0 || distAhead > LOOKAHEAD_MAX_M) continue;

        return { index: i, angle, distance: distAhead };
    }

    return null;
}

// ====== 分岔路口检测和分支推荐 ======

// 检测用户是否接近分岔路口，并返回分支信息
// 返回: { isBranching: boolean, branchPoint: [lng, lat], branches: [...], recommendedBranch: index }
function detectBranchingPoint(currentPos, fullPath, currentSegIndex, lookAheadDistance = 30) {
    if (!fullPath || fullPath.length < 3 || currentSegIndex < 0) {
        return { isBranching: false, branchPoint: null, branches: [], recommendedBranch: -1 };
    }

    // 向前查找，寻找是否有重复出现的点（分岔点）
    let accumulatedDist = 0;
    let branchPoint = null;
    let branchPointIdx = -1;

    for (let i = currentSegIndex + 1; i < fullPath.length && accumulatedDist < lookAheadDistance; i++) {
        const p1 = fullPath[i - 1];
        const p2 = fullPath[i];
        accumulatedDist += calculateDistanceBetweenPoints(p1, p2);

        // 检查这个点是否在后续路径中重复出现（表示这是一个分岔点或汇合点）
        for (let j = i + 2; j < fullPath.length; j++) {
            const dist = calculateDistanceBetweenPoints(p2, fullPath[j]);
            if (dist < 2) { // 2米容差认为是同一点
                branchPoint = p2;
                branchPointIdx = i;
                break;
            }
        }

        if (branchPoint) break;
    }

    if (!branchPoint || branchPointIdx < 0) {
        return { isBranching: false, branchPoint: null, branches: [], recommendedBranch: -1 };
    }

    // 找到分岔点后，识别从该点出发的所有分支
    const branches = [];

    // 第一条分支：从分岔点到下一次遇到该点之间的路径
    let firstBranchEnd = -1;
    for (let i = branchPointIdx + 1; i < fullPath.length; i++) {
        const dist = calculateDistanceBetweenPoints(branchPoint, fullPath[i]);
        if (dist < 2) {
            firstBranchEnd = i;
            break;
        }
    }

    if (firstBranchEnd > branchPointIdx + 1) {
        const branchPath = fullPath.slice(branchPointIdx, firstBranchEnd + 1);
        branches.push({
            startIndex: branchPointIdx,
            endIndex: firstBranchEnd,
            path: branchPath,
            direction: calculateBearingBetweenPoints(branchPoint, fullPath[branchPointIdx + 1])
        });
    }

    // 第二条分支：从分岔点第二次出现开始
    if (firstBranchEnd > 0 && firstBranchEnd < fullPath.length - 1) {
        const secondBranchPath = fullPath.slice(firstBranchEnd);
        branches.push({
            startIndex: firstBranchEnd,
            endIndex: fullPath.length - 1,
            path: secondBranchPath,
            direction: calculateBearingBetweenPoints(branchPoint, fullPath[firstBranchEnd + 1])
        });
    }

    // 推荐的分支：默认推荐第一条（规划路线的顺序）
    const recommendedBranch = 0;

    console.log('检测到分岔路口:', {
        分岔点索引: branchPointIdx,
        分岔点坐标: branchPoint,
        分支数量: branches.length,
        推荐分支: recommendedBranch
    });

    return {
        isBranching: branches.length > 1,
        branchPoint: branchPoint,
        branchPointIdx: branchPointIdx,
        branches: branches,
        recommendedBranch: recommendedBranch
    };
}

// 判断用户选择了哪条分支
function detectUserBranchChoice(userPos, userHeading, branchInfo) {
    if (!branchInfo || !branchInfo.isBranching || !branchInfo.branches || branchInfo.branches.length === 0) {
        return -1;
    }

    let minAngleDiff = Infinity;
    let chosenBranch = -1;

    branchInfo.branches.forEach((branch, idx) => {
        // 计算用户朝向与分支方向的夹角
        const branchDirection = branch.direction;
        let angleDiff = Math.abs(userHeading - branchDirection);

        // 处理角度环绕问题
        if (angleDiff > 180) {
            angleDiff = 360 - angleDiff;
        }

        if (angleDiff < minAngleDiff) {
            minAngleDiff = angleDiff;
            chosenBranch = idx;
        }
    });

    // 如果夹角小于45度，认为用户选择了这条分支
    if (minAngleDiff < 45) {
        console.log('用户选择了分支:', chosenBranch, '夹角:', minAngleDiff.toFixed(1), '度');
        return chosenBranch;
    }

    return -1;
}

// 计算两点之间的方位角（度）
function calculateBearingBetweenPoints(point1, point2) {
    let lng1, lat1, lng2, lat2;

    // 处理不同的坐标格式
    if (point1.lng !== undefined && point1.lat !== undefined) {
        lng1 = point1.lng;
        lat1 = point1.lat;
    } else if (Array.isArray(point1)) {
        lng1 = point1[0];
        lat1 = point1[1];
    } else {
        return 0;
    }

    if (point2.lng !== undefined && point2.lat !== undefined) {
        lng2 = point2.lng;
        lat2 = point2.lat;
    } else if (Array.isArray(point2)) {
        lng2 = point2[0];
        lat2 = point2[1];
    } else {
        return 0;
    }

    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLng = (lng2 - lng1) * Math.PI / 180;

    const y = Math.sin(deltaLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLng);

    const bearing = Math.atan2(y, x) * 180 / Math.PI;

    // 规范化到 0-360 范围
    return (bearing + 360) % 360;
}

// === 统一将朝向应用到导航页“我的位置”标记 ===
function navApplyHeadingToMarker(rawHeading) {
    if (!userMarker || rawHeading === null || rawHeading === undefined || isNaN(rawHeading)) return;
    try {
        // 归一化角度
        let heading = rawHeading % 360;
        if (heading < 0) heading += 360;

        // 地图当前旋转角（度）
        let mapRotation = 0;
        try { mapRotation = navigationMap && typeof navigationMap.getRotation === 'function' ? (navigationMap.getRotation() || 0) : 0; } catch (e) { mapRotation = 0; }

        // 固定偏移（素材基准/机型校准）
        let angleOffset = 0;
        if (MapConfig && MapConfig.orientationConfig && typeof MapConfig.orientationConfig.angleOffset === 'number') {
            angleOffset = MapConfig.orientationConfig.angleOffset;
        }
        // 动态偏移（根据运动方向自动判定是否需要180°翻转）
        angleOffset += (dynamicAngleOffsetNav || 0);

        // 最终角度 = 设备朝向 + 偏移 - 地图旋转
        let finalAngle = (heading + angleOffset - mapRotation) % 360;
        if (finalAngle < 0) finalAngle += 360;

        if (MapConfig && MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
            console.log('[nav heading]', { heading, angleOffset, mapRotation, finalAngle });
        }

        if (typeof userMarker.setAngle === 'function') userMarker.setAngle(finalAngle);
        else if (typeof userMarker.setRotation === 'function') userMarker.setRotation(finalAngle);
    } catch (err) {
        console.error('[nav] 应用朝向失败:', err);
    }
}

// 计算用于“转向提示判断”的有效用户朝向（度，0-360）
// 说明：
// - 使用设备朝向为主（lastDeviceHeadingNav）
// - 应用静态与动态偏移（纠正机型/传感器180°翻转等问题）
// - 不扣除地图旋转（地图旋转不影响真实世界的左/右判断）
// - 若无设备朝向，则回退用最近两次GPS的移动方向
function getEffectiveUserHeading(currPos) {
    let heading = null;

    // 1) 优先用设备朝向
    if (typeof lastDeviceHeadingNav === 'number') {
        heading = lastDeviceHeadingNav;
    }

    // 2) 应用静态与动态偏移（若存在）
    let angleOffset = 0;
    try {
        if (MapConfig && MapConfig.orientationConfig && typeof MapConfig.orientationConfig.angleOffset === 'number') {
            angleOffset = MapConfig.orientationConfig.angleOffset;
        }
    } catch (e) {}

    if (typeof heading === 'number') {
        heading = heading + (dynamicAngleOffsetNav || 0) + angleOffset;
        // 归一化 0..360
        heading = ((heading % 360) + 360) % 360;
        return heading;
    }

    // 3) 回退：用最近两次GPS位置的运动方向（若可用）
    try {
        if (lastGpsPos && currPos) {
            const moveDist = calculateDistanceBetweenPoints(lastGpsPos, currPos);
            if (isFinite(moveDist) && moveDist > 0.5) {
                const bearing = calculateBearingBetweenPoints(lastGpsPos, currPos);
                if (isFinite(bearing)) return bearing;
            }
        }
    } catch (e) {}

    return null;
}

// 角度绝对差（0..180）
function navAngleAbsDiff(a, b) {
    let d = ((a - b + 540) % 360) - 180; // -180..180
    return Math.abs(d);
}

// 自动校准：使用上一GPS点→当前点的bearing与设备heading对比，稳定在180°附近则翻转
function attemptAutoCalibrationNav(curr, heading) {
    if (calibrationStateNav.locked) return;
    if (heading === null || heading === undefined || isNaN(heading)) return;
    if (!lastGpsPos) return;

    const dist = calculateDistanceBetweenPoints(lastGpsPos, curr);
    if (!isFinite(dist) || dist < 5) return; // 小于5米不参与，避免噪声

    const bearing = calculateBearingBetweenPoints(lastGpsPos, curr);
    if (!isFinite(bearing)) return;

    const diff = navAngleAbsDiff(heading, bearing);
    if (MapConfig && MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
        console.log('[nav calibration]', { heading, bearing, diff, dist });
    }

    const near0 = diff <= 25;
    const near180 = diff >= 155;

    if (near180) {
        calibrationStateNav.count180 += 1;
        calibrationStateNav.count0 = 0;
    } else if (near0) {
        calibrationStateNav.count0 += 1;
        calibrationStateNav.count180 = 0;
    } else {
        calibrationStateNav.count0 = Math.max(0, calibrationStateNav.count0 - 1);
        calibrationStateNav.count180 = Math.max(0, calibrationStateNav.count180 - 1);
        return;
    }

    if (calibrationStateNav.count180 >= 4) {
        dynamicAngleOffsetNav = 180;
        calibrationStateNav.locked = true;
        if (MapConfig && MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
            console.log('[nav calibration] 锁定 180° 偏移');
        }
    } else if (calibrationStateNav.count0 >= 4) {
        dynamicAngleOffsetNav = 0;
        calibrationStateNav.locked = true;
        if (MapConfig && MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
            console.log('[nav calibration] 锁定 0° 偏移');
        }
    }
}

// 获取导航转向类型（基于用户当前朝向）
function getNavigationDirection() {
    if (!navigationPath || navigationPath.length < 2) {
        return 'straight';
    }

    // 如果用户偏离路径，返回特殊状态
    if (isOffRoute) {
        return 'offroute';
    }

    // 获取用户当前位置在路径上的最近点索引
    const currentIdx = currentNavigationIndex || 0;

    // 如果接近终点
    if (currentIdx >= navigationPath.length - 1) {
        return 'straight';
    }

    // 提示模式：默认基于路网（path），可通过配置切换为 heading
    let promptMode = 'path';
    try {
        if (MapConfig && MapConfig.navigationConfig) {
            if (typeof MapConfig.navigationConfig.usePathBasedPrompts === 'boolean') {
                promptMode = MapConfig.navigationConfig.usePathBasedPrompts ? 'path' : 'heading';
            } else if (typeof MapConfig.navigationConfig.promptMode === 'string') {
                promptMode = MapConfig.navigationConfig.promptMode; // 'path' | 'heading'
            }
        }
    } catch (e) {}

    if (promptMode === 'path') {
        return getTraditionalNavigationDirection();
    }

    // 获取用户当前位置（用于回退计算朝向）
    const currentPos = userMarker ?
        [userMarker.getPosition().lng, userMarker.getPosition().lat] :
        navigationPath[currentIdx];

    // 获取用户当前有效朝向（应用传感器校准偏移，不受地图旋转影响）
    let userHeading = getEffectiveUserHeading(currentPos);

    // 如果没有用户朝向信息，使用传统的路径转向判断
    if (userHeading === null) {
        return getTraditionalNavigationDirection();
    }

    // 计算从当前位置到下一个路径点的方向
    const nextPoint = navigationPath[Math.min(currentIdx + 1, navigationPath.length - 1)];

    // 计算路径方向（从当前位置到下一点）
    const pathBearing = calculateBearingBetweenPoints(currentPos, nextPoint);

    // 计算用户朝向与路径方向的夹角
    let angleDiff = pathBearing - userHeading;

    // 规范化到 -180 到 180 范围
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    console.log(`用户朝向导航: 用户朝向=${userHeading.toFixed(1)}°, 路径方向=${pathBearing.toFixed(1)}°, 夹角=${angleDiff.toFixed(1)}°`);

    // 根据夹角判断如何行进（修正方向：正=右转，负=左转）
    if (Math.abs(angleDiff) <= 30) {
        return 'forward'; // 前进（-30° 到 30°）
    } else if (angleDiff > 30 && angleDiff <= 150) {
        return 'right'; // 右转（30° 到 150°）
    } else if (angleDiff < -30 && angleDiff >= -150) {
        return 'left'; // 左转（-30° 到 -150°）
    } else {
        return 'backward'; // 后退/掉头（150° 到 180° 或 -150° 到 -180°）
    }
}

// 传统的导航转向判断（基于路径转向点）
function getTraditionalNavigationDirection() {
    if (nextTurnIndex < 0 || nextTurnIndex >= navigationPath.length - 1) {
        return 'straight'; // 没有转向点，直行
    }

    // 计算转向角度（与查找阶段一致的平滑策略，尽量用 i-2 与 i+2）
    const mid = nextTurnIndex;
    const prevIdx = (mid - 2 >= 0) ? mid - 2 : mid - 1;
    const nextIdx = (mid + 2 < navigationPath.length) ? mid + 2 : mid + 1;
    if (prevIdx < 0 || nextIdx >= navigationPath.length) {
        return 'straight';
    }
    const angle = calculateTurnAngle(
        navigationPath[prevIdx],
        navigationPath[mid],
        navigationPath[nextIdx]
    );

    console.log(`转向角度: ${angle.toFixed(2)}°`);

    // 根据角度判断转向类型（修正方向：正=右转，负=左转）
    if (angle > 135 || angle < -135) {
        return 'uturn'; // 掉头（大于135度）
    } else if (angle > 30 && angle <= 135) {
        return 'right'; // 右转（30-135度）
    } else if (angle < -30 && angle >= -135) {
        return 'left'; // 左转（-30到-135度）
    } else {
        return 'straight'; // 直行（-30到30度）
    }
}

// 更新转向图标和提示文本
function updateDirectionIcon(directionType, distanceToNext, options) {
    const directionImg = document.getElementById('tip-direction-img');
    const actionText = document.getElementById('tip-action-text');
    const distanceAheadElem = document.getElementById('tip-distance-ahead');
    const distanceUnitElem = document.querySelector('.tip-distance-unit');
    const directionIconContainer = document.querySelector('.tip-direction-icon');
    const tipDetailsElem = document.querySelector('.tip-details');
    const tipDividerElem = document.querySelector('.tip-divider');


    const basePath = 'images/工地数字导航小程序切图/司机/2X/导航/';

    let iconPath = '';
    let actionName = '';

    // 当距离下一次转向较远时，优先展示“直行”以避免用户误解为仍需立即右/左转
    // 可通过 MapConfig.navigationConfig.turnPromptDistanceMeters 配置阈值（默认40米）
    let turnPromptThreshold = 40;
    try {
        if (MapConfig && MapConfig.navigationConfig && typeof MapConfig.navigationConfig.turnPromptDistanceMeters === 'number') {
            turnPromptThreshold = MapConfig.navigationConfig.turnPromptDistanceMeters;
        }
    } catch (e) {}

    // 检查是否偏离路径
    if (isOffRoute) {
        console.log('updateDirectionIcon: 检测到偏离路径，显示提示信息');

        // 隐藏图标
        if (directionIconContainer) {
            directionIconContainer.style.display = 'none';
        }

        // 隐藏距离和时间信息
        if (tipDetailsElem) {
            tipDetailsElem.style.display = 'none';
        }

        // 隐藏分隔线
        if (tipDividerElem) {
            tipDividerElem.style.display = 'none';
        }

        // 根据是否到达起点显示不同的提示
        let tipPrefix = '请';
        let tipText = '';
        if (!hasReachedStart) {
            tipText = '前往起点';
        } else {
            tipText = '回到规划路线';
        }

        // 显示偏离提示
        if (distanceAheadElem) {
            distanceAheadElem.textContent = tipPrefix;
        }
        if (actionText) {
            actionText.textContent = tipText;
        }
        if (distanceUnitElem) {
            distanceUnitElem.style.display = 'none';
        }

        // 添加偏离路线的视觉提示（改变背景色）
        const navTipCard = document.getElementById('navigation-tip-card');
        if (navTipCard) {
            navTipCard.style.backgroundColor = '#fff3cd'; // 淡黄色背景提示偏离
        }

        console.log('已更新UI显示偏离提示:', tipPrefix + tipText);
        return;  // 偏离路径时直接返回，不执行后续正常导航的逻辑
    }

    // 正常导航逻辑（未偏离路径时）
    // 恢复正常背景色
    const navTipCard = document.getElementById('navigation-tip-card');
    if (navTipCard) {
        navTipCard.style.backgroundColor = ''; // 恢复默认背景色
    }
    // 显示图标
    if (directionIconContainer) {
        directionIconContainer.style.display = 'flex';
    }

    // 显示距离和时间信息
    if (tipDetailsElem) {
        tipDetailsElem.style.display = 'flex';
    }

    // 显示分隔线
    if (tipDividerElem) {
        tipDividerElem.style.display = 'block';
    }

    // 计算显示的距离（四舍五入）
    const distance = Math.round(distanceToNext || 0);

    // 重置图标旋转样式
    let iconRotation = 0;

    // 如果距离下一次转向大于阈值，则图标优先展示“直行”，文案显示“距离下一次转向还有 X 米”
    // 注意：偏离路线(offroute)或即将掉头(backward/uturn)时不应用该直行覆盖逻辑
    const farFromNextTurn = isFinite(distance) && distance > turnPromptThreshold;
    let effectiveDirection = directionType;
    if (farFromNextTurn && directionType !== 'offroute' && directionType !== 'backward' && directionType !== 'uturn') {
        effectiveDirection = 'forward';
    }

    switch (effectiveDirection) {
        case 'forward':
            iconPath = basePath + '直行.png';
            actionName = '前进';
            iconRotation = 0;
            break;
        case 'backward':
            iconPath = basePath + '直行.png'; // 使用直行图标
            actionName = '后退';
            iconRotation = 180; // 旋转180度表示后退
            break;
        case 'left':
            iconPath = basePath + '左转.png';
            actionName = '左转';
            iconRotation = 0;
            break;
        case 'right':
            iconPath = basePath + '右转.png';
            actionName = '右转';
            iconRotation = 0;
            break;
        case 'uturn':
            iconPath = basePath + '掉头.png';
            actionName = '掉头';
            iconRotation = 0;
            break;
        case 'straight':
        default:
            iconPath = basePath + '直行.png';
            actionName = '直行';
            iconRotation = 0;
            break;
    }

    // 更新图标
    if (directionImg) {
        directionImg.src = iconPath;
        directionImg.alt = actionName;
        // 应用旋转样式
        if (iconRotation !== 0) {
            directionImg.style.transform = `rotate(${iconRotation}deg)`;
        } else {
            directionImg.style.transform = 'none';
        }
    }


    // 更新提示文本
    if (effectiveDirection === 'straight' || effectiveDirection === 'forward') {
        // 直行/前进时显示："XXX 米"
        if (distanceAheadElem) {
            distanceAheadElem.textContent = distance;
        }
        if (actionText) {
            actionText.textContent = '米';
        }
        // 隐藏"米后"文本
        if (distanceUnitElem) {
            distanceUnitElem.style.display = 'none';
        }
    } else {
        // 其他转向显示："XXX 米后 左转/右转/掉头/后退"
        if (distanceAheadElem) {
            distanceAheadElem.textContent = distance;
        }
        if (actionText) {
            actionText.textContent = actionName;
        }
        // 显示"米后"文本
        if (distanceUnitElem) {
            distanceUnitElem.style.display = 'inline';
        }
    }
}



// 显示退出导航确认弹窗
function showExitNavigationModal() {
    const exitModal = document.getElementById('exit-navigation-modal');
    if (exitModal) {
        exitModal.classList.add('active');
    }
}

// 隐藏退出导航确认弹窗
function hideExitNavigationModal() {
    const exitModal = document.getElementById('exit-navigation-modal');
    if (exitModal) {
        exitModal.classList.remove('active');
    }
}

// 显示导航完成弹窗
function showNavigationCompleteModal(totalDistance, totalTime) {
    const completeModal = document.getElementById('navigation-complete-modal');
    const distanceElem = document.getElementById('complete-distance');
    const timeElem = document.getElementById('complete-time');

    if (distanceElem) {
        distanceElem.textContent = Math.round(totalDistance);
    }
    if (timeElem) {
        timeElem.textContent = Math.ceil(totalTime);
    }

    if (completeModal) {
        completeModal.classList.add('active');
    }
}

// 隐藏导航完成弹窗
function hideNavigationCompleteModal() {
    const completeModal = document.getElementById('navigation-complete-modal');
    if (completeModal) {
        completeModal.classList.remove('active');
    }
}

// 检测导航是否完成（用于模拟到达目的地）
function checkNavigationComplete() {
    if (!isNavigating || !routeData || !routePolyline) {
        return;
    }

    // 这里可以实现真实的位置追踪逻辑
    // 暂时使用模拟方式：用户可以通过某个操作触发导航完成

    // 获取总距离和时间
    let totalDistance = 0;
    if (routePolyline && typeof routePolyline.getLength === 'function') {
        totalDistance = routePolyline.getLength();
    }

    // 估算时间（使用工业车速度）
    const hours = totalDistance / VEHICLE_SPEED;
    const totalTime = Math.ceil(hours * 60);

    // 停止导航UI
    stopNavigationUI();

    // 显示完成弹窗
    showNavigationCompleteModal(totalDistance, totalTime);
}

// 页面卸载时清理资源
window.addEventListener('beforeunload', function() {
    cleanupMap();
});

// ====== 模拟导航：移动“我的位置”并绘制灰色已走路径 ======
function startSimulatedNavigation() {
    if (!navigationMap || !routePolyline) return;

    // 记录总距离与开始时间
    try {
        totalRouteDistance = typeof routePolyline.getLength === 'function' ? routePolyline.getLength() : 0;
    } catch (e) {
        totalRouteDistance = 0;
    }
    navStartTime = Date.now();

    // 提取路径（统一转为 [lng, lat] 数组）
    const rawPath = routePolyline.getPath() || [];
    if (!rawPath || rawPath.length < 2) return;
    const path = rawPath.map(p => normalizeLngLat(p));

    // 创建移动的"我的位置"标记
    if (userMarker) {
        navigationMap.remove(userMarker);
        userMarker = null;
    }

    // 使用与首页相同的带方向箭头图标
    const iconCfg = MapConfig.markerStyles.headingLocation || {};
    const w = (iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
    const h = (iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;

    let iconImage = iconCfg.icon;
    // 如果开启箭头模式或 PNG 未配置，则改用 SVG 箭头，以确保旋转效果明显
    if (iconCfg.useSvgArrow === true || !iconImage) {
        iconImage = createHeadingArrowDataUrl('#007bff');
    }

    const myIcon = new AMap.Icon({
        size: new AMap.Size(w, h),
        image: iconImage,
        imageSize: new AMap.Size(w, h)
    });
    userMarker = new AMap.Marker({
        position: path[0],
        icon: myIcon,
        offset: new AMap.Pixel(-(w/2), -(h/2)),
        zIndex: 120,
        angle: 0,
        map: navigationMap
    });

    // 模拟行进参数
    const intervalMs = 300; // 刷新频率
    const metersPerTick = (VEHICLE_SPEED / 3600) * (intervalMs / 1000);

    let segIndex = 0;      // 当前所在线段起点索引（从 path[segIndex] -> path[segIndex+1]）
    let currPos = path[0]; // 当前精确位置（可处于两点之间）

    // 初始化：将剩余路线设为从当前点到终点（绿色）
    updateRemainingPolyline(currPos, path, segIndex);

    if (navigationTimer) {
        clearInterval(navigationTimer);
        navigationTimer = null;
    }
    if (gpsWatchId !== null && navigator.geolocation && typeof navigator.geolocation.clearWatch === 'function') {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
}

// 真实GPS导航追踪
// ====== 创建或更新GPS精度圈 ======
function updateAccuracyCircle(position, accuracy) {
    if (!navigationMap) {
        console.error('updateAccuracyCircle: navigationMap不存在');
        return;
    }

    currentAccuracy = accuracy || 10; // 默认10米精度
    const displayRadius = currentAccuracy / 2; // 显示半径缩小为原来的一半

    if (!accuracyCircle) {
        // 创建精度圈 - 使用非常明显的样式便于调试
        console.log('准备创建GPS精度圈，中心:', position, '实际精度:', currentAccuracy, '米, 显示半径:', displayRadius, '米');

        try {
            accuracyCircle = new AMap.Circle({
                center: position,
                radius: displayRadius,
                strokeColor: '#4A90E2',      // 蓝色边框
                strokeWeight: 2,              // 较细的边框
                strokeOpacity: 0.4,           // 高透明度边框
                fillColor: '#4A90E2',         // 蓝色填充
                fillOpacity: 0.15,            // 高透明度填充
                zIndex: 100,                  // 在路径上方，位置标记下方
                bubble: true,                 // 允许事件冒泡
                visible: true                 // 显式设置为可见
            });

            // 显式添加到地图
            accuracyCircle.setMap(navigationMap);

            console.log('GPS精度圈创建成功:', accuracyCircle);
            console.log('精度圈属性:', {
                center: accuracyCircle.getCenter(),
                radius: accuracyCircle.getRadius(),
                visible: accuracyCircle.getOptions().visible,
                map: accuracyCircle.getMap()
            });

            // 强制显示并刷新地图
            setTimeout(() => {
                if (accuracyCircle && typeof accuracyCircle.show === 'function') {
                    accuracyCircle.show();
                }
                if (navigationMap) {
                    navigationMap.setZoom(navigationMap.getZoom());
                }
                console.log('精度圈强制显示完成');
            }, 100);
        } catch (e) {
            console.error('创建GPS精度圈失败:', e);
        }
    } else {
        // 更新精度圈位置和半径
        const displayRadius = currentAccuracy / 6; // 显示半径缩小为原来的1/6
        console.log('更新GPS精度圈，中心:', position, '实际精度:', currentAccuracy, '米, 显示半径:', displayRadius, '米');
        try {
            accuracyCircle.setCenter(position);
            accuracyCircle.setRadius(displayRadius);
        } catch (e) {
            console.error('更新GPS精度圈失败:', e);
        }
    }
}

// ====== 检查用户是否在规划路线上（改进的精度圈检测） ======
// 返回: { onRoute: boolean, projectionPoint: [lng, lat] | null, segmentIndex: number }
function checkIfOnRouteWithAccuracy(userPos, routePath, accuracy) {
    if (!routePath || routePath.length === 0) {
        return { onRoute: true, projectionPoint: null, segmentIndex: -1 };
    }

    // 第一步：优先检测位置图标本身（小范围）
    const iconThreshold = 5; // 位置图标本身的检测半径（5米）
    let closestProjection = null;
    let minDistToIcon = Infinity;
    let iconSegmentIndex = -1;

    // 检查位置图标是否在路线上
    for (let i = 0; i < routePath.length - 1; i++) {
        const p1 = routePath[i];
        const p2 = routePath[i + 1];

        // 计算用户位置到线段的垂线投影点
        const projection = projectPointToSegment(userPos, p1, p2);

        if (projection) {
            const distToProjection = calculateDistanceBetweenPoints(userPos, projection.point);

            // 记录最近的投影点
            if (distToProjection < minDistToIcon) {
                minDistToIcon = distToProjection;
                closestProjection = projection.point;
                iconSegmentIndex = i;
            }

            // 如果位置图标本身在路线上（距离小于阈值），直接返回true
            if (distToProjection <= iconThreshold) {
                console.log('位置图标在路线上，距离:', distToProjection.toFixed(2), '米');
                return {
                    onRoute: true,
                    projectionPoint: [projection.point.lng || projection.point[0], projection.point.lat || projection.point[1]],
                    segmentIndex: i
                };
            }
        }
    }

    // 第二步：位置图标不在路线上，检查精度圈范围内的投影点
    // 使用实际GPS精度作为检测范围
    const circleRadius = (accuracy || 10) / 6; // 使用显示的精度圈半径（已缩小为1/6）

    // 从内至外逐步检测精度圈范围
    const checkSteps = [0.3, 0.6, 1.0]; // 检测精度圈的30%、60%、100%范围

    for (let step of checkSteps) {
        const currentRadius = circleRadius * step;

        for (let i = 0; i < routePath.length - 1; i++) {
            const p1 = routePath[i];
            const p2 = routePath[i + 1];

            // 计算用户位置到线段的垂线投影点
            const projection = projectPointToSegment(userPos, p1, p2);

            if (projection) {
                // 计算投影点到用户位置的距离
                const distToProjection = calculateDistanceBetweenPoints(userPos, projection.point);

                // 如果投影点在当前检测半径内，认为在路线上
                if (distToProjection <= currentRadius) {
                    console.log('精度圈内找到投影点，距离:', distToProjection.toFixed(2), '米，检测半径:', currentRadius.toFixed(2), '米');
                    return {
                        onRoute: true,
                        projectionPoint: [projection.point.lng || projection.point[0], projection.point.lat || projection.point[1]],
                        segmentIndex: i
                    };
                }
            }
        }
    }

    console.log('不在路线上，精度圈半径:', circleRadius.toFixed(2), '米，最近距离:', minDistToIcon.toFixed(2), '米');
    return { onRoute: false, projectionPoint: closestProjection, segmentIndex: iconSegmentIndex };
}

// ====== 计算点到线段的投影 ======
function projectPointToSegment(point, segStart, segEnd) {
    // 统一处理坐标格式：支持数组 [lng, lat] 和对象 {lng, lat}
    let px, py, x1, y1, x2, y2;

    // 处理 point
    if (Array.isArray(point)) {
        [px, py] = point;
    } else if (point && typeof point === 'object') {
        px = point.lng !== undefined ? point.lng : point[0];
        py = point.lat !== undefined ? point.lat : point[1];
    } else {
        console.error('Invalid point format:', point);
        return null;
    }

    // 处理 segStart
    if (Array.isArray(segStart)) {
        [x1, y1] = segStart;
    } else if (segStart && typeof segStart === 'object') {
        x1 = segStart.lng !== undefined ? segStart.lng : segStart[0];
        y1 = segStart.lat !== undefined ? segStart.lat : segStart[1];
    } else {
        console.error('Invalid segStart format:', segStart);
        return null;
    }

    // 处理 segEnd
    if (Array.isArray(segEnd)) {
        [x2, y2] = segEnd;
    } else if (segEnd && typeof segEnd === 'object') {
        x2 = segEnd.lng !== undefined ? segEnd.lng : segEnd[0];
        y2 = segEnd.lat !== undefined ? segEnd.lat : segEnd[1];
    } else {
        console.error('Invalid segEnd format:', segEnd);
        return null;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        // 线段退化为点
        return {
            point: [x1, y1],
            t: 0,
            onSegment: true
        };
    }

    // 计算投影参数t
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

    // 判断投影点是否在线段上
    const onSegment = (t >= 0 && t <= 1);

    // 限制t在[0,1]范围内以得到线段上的最近点
    const clampedT = Math.max(0, Math.min(1, t));

    // 计算投影点坐标
    const projX = x1 + clampedT * dx;
    const projY = y1 + clampedT * dy;

    // 计算投影点到原点的距离
    const distance = Math.sqrt((projX - px) * (projX - px) + (projY - py) * (projY - py)) * 111319.9; // 转换为米

    return {
        point: [projX, projY],
        t: clampedT,
        onSegment: onSegment,
        distance: distance
    };
}

// ====== 计算点到线段的距离 ======
function pointToSegmentDistance(point, segStart, segEnd) {
    const [px, py] = point;
    const [x1, y1] = segStart;
    const [x2, y2] = segEnd;

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        // 线段退化为点
        return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    // 计算投影参数t
    let t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t)); // 限制在[0,1]范围内

    // 计算最近点
    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    // 返回距离（经纬度近似计算）
    const distDeg = Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
    // 粗略转换为米（1度约111km）
    return distDeg * 111000;
}

// ====== 开始实时GPS导航（真实导航） ======
function startRealNavigationTracking() {
    if (!('geolocation' in navigator)) {
        if (!geoErrorNotified) {
            alert('当前浏览器不支持定位，无法进行实时导航');
            geoErrorNotified = true;
        }
        return;
    }

    // 清理之前的标记（确保重新开始）
    if (userMarker && navigationMap) {
        navigationMap.remove(userMarker);
        userMarker = null;
    }
    if (accuracyCircle && navigationMap) {
        navigationMap.remove(accuracyCircle);
        accuracyCircle = null;
    }
    if (passedRoutePolyline && navigationMap) {
        navigationMap.remove(passedRoutePolyline);
        passedRoutePolyline = null;
    }
    lastGpsPos = null;

    // 固定一份完整规划路径，作为"剩余路线"的参考
    const fullPathRaw = routePolyline && typeof routePolyline.getPath === 'function' ? routePolyline.getPath() : [];
    if (!fullPathRaw || fullPathRaw.length < 2) return;
    const fullPath = fullPathRaw.map(p => normalizeLngLat(p));
    navigationPath = fullPath.slice(); // 用作转向/提示计算

    try {
        totalRouteDistance = typeof routePolyline.getLength === 'function' ? routePolyline.getLength() : 0;
    } catch (e) {
        totalRouteDistance = 0;
    }
    navStartTime = Date.now();

    // 先清掉可能存在的模拟定时器
    if (navigationTimer) { clearInterval(navigationTimer); navigationTimer = null; }

    if (gpsWatchId !== null) {
        try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
        gpsWatchId = null;
    }

    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 };

    // 在用户操作开始导航时，尝试开启设备方向监听（iOS 需权限）
    tryStartDeviceOrientationNav();
    gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            let lng = pos.coords.longitude;
            let lat = pos.coords.latitude;
            // 将WGS84转换为GCJ-02以匹配高德底图
            try {
                if (typeof wgs84ToGcj02 === 'function') {
                    const converted = wgs84ToGcj02(lng, lat);
                    if (Array.isArray(converted) && converted.length === 2) {
                        lng = converted[0];
                        lat = converted[1];
                    }
                }
            } catch (e) { console.warn('WGS84->GCJ-02 转换失败，使用原始坐标:', e); }
            const curr = [lng, lat];

            // 获取GPS精度并更新精度圈
            const accuracy = pos.coords.accuracy || 10; // 默认10米
            updateAccuracyCircle(curr, accuracy);
            console.log('GPS位置更新, 精度:', accuracy, '米, 位置:', curr);

            // 初始化标记与灰色路径
            if (!userMarker) {
                // 使用与首页相同的配置
                const iconCfg = MapConfig.markerStyles.headingLocation;
                const w = (iconCfg && iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
                const h = (iconCfg && iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;

                // 使用配置的图标或SVG箭头
                let iconImage = iconCfg && iconCfg.icon ? iconCfg.icon : null;
                if (!iconImage || iconCfg.useSvgArrow === true) {
                    iconImage = createHeadingArrowDataUrl('#007bff');
                }

                console.log('导航中创建我的位置标记, 图标路径:', iconImage, '尺寸:', w, 'x', h);

                const myIcon = new AMap.Icon({
                    size: new AMap.Size(w, h),
                    image: iconImage,
                    imageSize: new AMap.Size(w, h)
                });

                userMarker = new AMap.Marker({
                    position: curr,
                    icon: myIcon,
                    offset: new AMap.Pixel(-(w/2), -(h/2)),
                    zIndex: 120,
                    angle: 0,
                    map: navigationMap
                });

                console.log('导航中我的位置标记创建成功');
            }

            // 计算朝向并旋转：优先使用设备方向 heading；否则用移动向量
            let heading = null;
            if (typeof lastDeviceHeadingNav === 'number') {
                heading = lastDeviceHeadingNav;
            } else if (lastGpsPos) {
                const moveDist = calculateDistanceBetweenPoints(lastGpsPos, curr);
                if (moveDist > 0.5) { // 小于0.5米忽略抖动
                    heading = calculateBearingBetweenPoints(lastGpsPos, curr);
                }
            }

            // 应用朝向角度：统一封装并在此路径尝试自动校准（处理稳定180°反向）
            if (heading !== null) {
                try {
                    attemptAutoCalibrationNav(curr, heading);
                    navApplyHeadingToMarker(heading);
                } catch (e) {
                    console.error('设置标记角度失败:', e);
                }
            }
            lastGpsPos = curr;
            userMarker.setPosition(curr);

            // 检查是否偏离路径并更新路径显示（使用精度圈判断）
            // 新逻辑：投影点在路线上即可开始导航，无需必须到起点
            let routeCheckResult = checkIfOnRouteWithAccuracy(curr, fullPath, accuracy);
            let onRoute = routeCheckResult.onRoute;
            let projectionPoint = routeCheckResult.projectionPoint;
            let segIndex = routeCheckResult.segmentIndex >= 0 ? routeCheckResult.segmentIndex : findClosestPathIndex(curr, fullPath);

            // 是否强制要求到达起点附近再开始（如果投影点不在路线上）
            let requireStartAtOrigin = false; // 默认改为false，因为投影点在路线上即可
            try {
                if (MapConfig && MapConfig.navigationConfig && typeof MapConfig.navigationConfig.requireStartAtOrigin === 'boolean') {
                    requireStartAtOrigin = MapConfig.navigationConfig.requireStartAtOrigin;
                }
            } catch (e) {}

            if (requireStartAtOrigin && !hasReachedStart && !onRoute) {
                // 只有在配置要求且未到起点且不在路线上时才检查起点距离
                const distToStart = calculateDistanceBetweenPoints(curr, fullPath[0]);
                if (distToStart <= (startRebaseThresholdMeters || 25)) {
                    // 到达起点附近：允许开始沿路网导航
                    hasReachedStart = true;
                    onRoute = true;
                } else {
                    // 未到起点：一律视为偏离，提示"请前往起点"
                    onRoute = false;
                }
            } else if (onRoute && !hasReachedStart) {
                // 投影点在路线上，即使不在起点也可以开始导航
                hasReachedStart = true;
                console.log('投影点在规划路线上，开始导航，无需前往起点');
            }
            isOffRoute = !onRoute;
            console.log('精度:', accuracy, 'm, 偏离路径状态:', isOffRoute);

            // 根据是否偏离路径决定如何显示路线
            if (isOffRoute) {
                // 偏离路径时：恢复完整的绿色规划路径
                if (routePolyline && fullPath.length > 0) {
                    routePolyline.setPath(fullPath);
                }
                // 不移除灰色已走路径，保留显示
                // 黄色偏离路径会在updatePathSegments中处理
                if (!hasReachedStart) {
                    console.log('未到起点附近，提示用户前往起点，显示完整规划路径');
                } else {
                    console.log('已偏离路径，显示完整规划路径和黄色偏离轨迹');
                }
                // 仍然调用updatePathSegments以更新黄色偏离路径，传入投影点
                updatePathSegments(curr, fullPath, segIndex, projectionPoint);
            } else {
                // 在路径上时：将规划路径分为已走部分（灰色）和剩余部分（绿色），并将分割点对齐到路网
                updatePathSegments(curr, fullPath, segIndex, projectionPoint);
                console.log('在路径上，显示分段路径');
            }

            // 视图跟随
            try { navigationMap.setCenter(curr); } catch (e) {}

            // ====== 分支检测逻辑 ======
            if (hasReachedStart && !isOffRoute && fullPath && fullPath.length > 0) {
                // 检测前方是否有分岔路口
                const branchInfo = detectBranchingPoint(curr, fullPath, segIndex, 30);

                if (branchInfo.isBranching) {
                    currentBranchInfo = branchInfo;

                    // 如果用户有朝向数据，检测用户选择了哪条分支
                    if (heading !== null) {
                        const chosenBranch = detectUserBranchChoice(curr, heading, branchInfo);

                        // 如果用户选择了非推荐分支，更新记录
                        if (chosenBranch >= 0 && chosenBranch !== branchInfo.recommendedBranch) {
                            if (userChosenBranch !== chosenBranch) {
                                userChosenBranch = chosenBranch;
                                console.log('用户选择了非推荐分支:', chosenBranch, '推荐分支:', branchInfo.recommendedBranch);

                                // 提示用户已切换到其他分支（避免频繁提示）
                                const now = Date.now();
                                if (now - lastBranchNotificationTime > 5000) { // 5秒内不重复提示
                                    lastBranchNotificationTime = now;
                                    // 这里可以更新UI提示
                                    console.log('>>> 提示：您选择了备选路线');
                                }
                            }
                        } else if (chosenBranch === branchInfo.recommendedBranch) {
                            userChosenBranch = -1; // 回到推荐分支
                        }
                    }
                } else {
                    // 不在分岔路口，清空分支信息
                    currentBranchInfo = null;
                }
            }

            // 更新提示
            if (hasReachedStart) {
                // 使用“投影到路网”的结果推进导航进度，避免仅靠最近顶点导致转弯后提示滞后
                const projForProgress = projectPointOntoPathMeters(curr, fullPath);
                let progressIndex = (projForProgress && typeof projForProgress.index === 'number')
                    ? projForProgress.index
                    : segIndex;

                // 防抖：仅前进不后退
                currentNavigationIndex = Math.max(0, Math.max(currentNavigationIndex || 0, progressIndex));

                // 若接近当前转向点（沿路网距离小于阈值），立即视为通过
                try {
                    let passTurnThreshold = 8; // 默认8米
                    if (MapConfig && MapConfig.navigationConfig && typeof MapConfig.navigationConfig.turnPassDistanceMeters === 'number') {
                        passTurnThreshold = MapConfig.navigationConfig.turnPassDistanceMeters;
                    }
                    if (!isOffRoute && typeof nextTurnIndex === 'number' && nextTurnIndex > 0 && nextTurnIndex < fullPath.length) {
                        const distToTurn = computeDistanceToIndexMeters(curr, fullPath, nextTurnIndex) || 0;
                        if (isFinite(distToTurn) && distToTurn <= passTurnThreshold) {
                            // 将进度至少推进到该转向点
                            currentNavigationIndex = Math.max(currentNavigationIndex, nextTurnIndex);
                        }
                    }
                } catch (e) {}

                // 若已通过当前转向点，则立即查找下一个转向点
                if (typeof nextTurnIndex === 'number' && nextTurnIndex >= 0 && currentNavigationIndex >= nextTurnIndex) {
                    findNextTurnPoint();
                } else {
                    // 即便未越过拐点，也周期性刷新，防止遗漏
                    findNextTurnPoint();
                }

                updateNavigationTip();
            } else {
                // 未到起点时，仅刷新“请前往起点”的提示卡片
                updateNavigationTip();
            }

            // 到终点判定（使用沿路网的剩余距离，避免未到就结束）
            const end = fullPath[fullPath.length - 1];
            const distToEnd = calculateDistanceBetweenPoints(curr, end);
            const proj = projectPointOntoPathMeters(curr, fullPath);
            const remainRouteDist = proj ? computeRemainingRouteDistanceMeters(fullPath, proj) : distToEnd;

            const nearByRoute = remainRouteDist <= endArrivalThresholdMeters;
            const nearByAir = distToEnd <= Math.max(endArrivalThresholdMeters * 1.5, 10); // 双重保险：物理距离也接近
            if (hasReachedStart && onRoute && nearByRoute && nearByAir) {
                finishNavigation();
                // 到达后停止持续定位
                stopRealNavigationTracking();
            }
        },
        err => {
            console.error('GPS定位失败:', err);
            if (!geoErrorNotified) {
                alert('无法获取定位，实时导航不可用');
                geoErrorNotified = true;
            }
        },
        options
    );
}

function stopRealNavigationTracking() {
    if (gpsWatchId !== null && navigator.geolocation && typeof navigator.geolocation.clearWatch === 'function') {
        try { navigator.geolocation.clearWatch(gpsWatchId); } catch (e) {}
        gpsWatchId = null;
    }
    lastGpsPos = null;
    if (userMarker && navigationMap) { navigationMap.remove(userMarker); userMarker = null; }
    if (accuracyCircle && navigationMap) { navigationMap.remove(accuracyCircle); accuracyCircle = null; }
    if (passedRoutePolyline && navigationMap) { navigationMap.remove(passedRoutePolyline); passedRoutePolyline = null; }
    if (deviatedRoutePolyline && navigationMap) { navigationMap.remove(deviatedRoutePolyline); deviatedRoutePolyline = null; }
    deviatedPath = []; // 清空偏离路径点集合
    // 停止设备方向监听
    tryStopDeviceOrientationNav();
}

// 在路径点集中找到距离当前点最近的点索引
function findClosestPathIndex(point, path) {
    if (!path || path.length === 0) return 0;
    let minIdx = 0;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.length; i++) {
        const d = calculateDistanceBetweenPoints(point, path[i]);
        if (d < minDist) { minDist = d; minIdx = i; }
    }
    return minIdx;
}

// 检查当前位置是否偏离规划路径（改进版：检查到线段的垂直距离）
function checkIfOffRoute(currentPosition, path) {
    if (!path || path.length === 0) return false;

    // 检查当前位置到路径线段的最小垂直距离
    let minDistToPath = Number.POSITIVE_INFINITY;

    // 遍历路径中的每一段
    for (let i = 0; i < path.length - 1; i++) {
        const segStart = path[i];
        const segEnd = path[i + 1];

        // 计算点到线段的最短距离
        const distToSegment = pointToSegmentDistance(currentPosition, segStart, segEnd);
        if (distToSegment < minDistToPath) {
            minDistToPath = distToSegment;
        }
    }

    // 同时检查到起点和终点的距离（处理用户在起点或终点附近的情况）
    const distToStart = calculateDistanceBetweenPoints(currentPosition, path[0]);
    const distToEnd = calculateDistanceBetweenPoints(currentPosition, path[path.length - 1]);
    const minDistToEndpoints = Math.min(distToStart, distToEnd);

    // 取两者中的较小值
    const finalDist = Math.min(minDistToPath, minDistToEndpoints);

    console.log(`距离路径最近距离: ${finalDist.toFixed(2)}米 (线段:${minDistToPath.toFixed(2)}m, 端点:${minDistToEndpoints.toFixed(2)}m), 阈值: ${offRouteThreshold}米`);

    // 如果最近距离超过阈值，认为偏离路径
    const offRoute = finalDist > offRouteThreshold;
    console.log(`偏离判断结果: ${offRoute ? '偏离' : '在路径上'}`);
    return offRoute;
}

// 计算点到线段的最短距离
function pointToSegmentDistance(point, segStart, segEnd) {
    // 统一坐标格式
    const px = Array.isArray(point) ? point[0] : point.lng;
    const py = Array.isArray(point) ? point[1] : point.lat;
    const x1 = Array.isArray(segStart) ? segStart[0] : segStart.lng;
    const y1 = Array.isArray(segStart) ? segStart[1] : segStart.lat;
    const x2 = Array.isArray(segEnd) ? segEnd[0] : segEnd.lng;
    const y2 = Array.isArray(segEnd) ? segEnd[1] : segEnd.lat;

    // 线段向量
    const dx = x2 - x1;
    const dy = y2 - y1;

    // 如果线段退化为一个点
    if (dx === 0 && dy === 0) {
        return calculateDistanceBetweenPoints(point, segStart);
    }

    // 计算投影参数 t
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

    let closestPoint;
    if (t < 0) {
        // 投影点在线段起点之前
        closestPoint = segStart;
    } else if (t > 1) {
        // 投影点在线段终点之后
        closestPoint = segEnd;
    } else {
        // 投影点在线段上
        closestPoint = [x1 + t * dx, y1 + t * dy];
    }

    return calculateDistanceBetweenPoints(point, closestPoint);
}

// 模拟导航定时器（该函数需要在startSimulatedNavigation中调用）
function startNavigationTimer(path, segIndex, currPos, intervalMs, metersPerTick) {
    navigationTimer = setInterval(() => {
        if (!isNavigating) return; // 外部已停止

        // 已到终点
        if (segIndex >= path.length - 1) {
            finishNavigation();
            return;
        }

        const segStart = currPos;
        const segEnd = path[segIndex + 1];
        const segRemDist = calculateDistanceBetweenPoints(segStart, segEnd);

        if (segRemDist <= metersPerTick) {
            // 本tick可以走到下一个拐点
            currPos = segEnd;
            segIndex++;
        } else {
            // 在线段内前进一定比例
            const t = metersPerTick / segRemDist;
            currPos = interpolateLngLat(segStart, segEnd, t);
        }

        // 更新用户标记位置与朝向
        try {
            const bearing = calculateBearingBetweenPoints(segStart, currPos);
            navApplyHeadingToMarker(bearing);
        } catch (e) {
            console.error('设置标记角度失败:', e);
        }
        userMarker.setPosition(currPos);

        // 将规划路径分为已走部分（灰色）和剩余部分（绿色）
        updatePathSegments(currPos, path, segIndex);

        // 地图视野跟随（可根据需要降低频率）
        try { navigationMap.setCenter(currPos); } catch (e) {}

        // 同步导航状态，用于转向提示与距离时间更新
        currentNavigationIndex = segIndex;
        findNextTurnPoint();
        updateNavigationTip();
    }, intervalMs);
}

function stopSimulatedNavigation() {
    if (navigationTimer) {
        clearInterval(navigationTimer);
        navigationTimer = null;
    }
    if (userMarker && navigationMap) {
        navigationMap.remove(userMarker);
        userMarker = null;
    }
    if (passedRoutePolyline && navigationMap) {
        navigationMap.remove(passedRoutePolyline);
        passedRoutePolyline = null;
    }
}

// 更新路径显示：将规划路径分为已走部分（灰色）、偏离部分（黄色）和剩余部分（绿色）
// 参数：currentPos - 用户实际GPS位置, fullPath - 规划路径, segIndex - 线段索引, projectionPoint - 投影点（可选）
function updatePathSegments(currentPos, fullPath, segIndex, projectionPoint) {
    if (!routePolyline || !fullPath || fullPath.length < 2) return;

    // 优先使用传入的投影点，如果没有则计算投影点
    let routePoint, routeSegIndex;
    if (projectionPoint && Array.isArray(projectionPoint) && projectionPoint.length >= 2) {
        routePoint = projectionPoint;
        routeSegIndex = segIndex >= 0 ? segIndex : findClosestPathIndex(projectionPoint, fullPath);
    } else {
        // 将当前位置投影到路网（找到最近线段与投影点），确保分段点在路网上
        const projection = projectPointOntoPathMeters(currentPos, fullPath);
        routePoint = projection ? projection.projected : currentPos;
        routeSegIndex = projection ? projection.index : segIndex;
    }

    // 判断用户是否在路径上
    const onRoute = !isOffRoute;

    // 标记当前所在路段为已走过（使用路段标记而非单一索引）
    if (onRoute && routeSegIndex >= 0 && routeSegIndex < fullPath.length - 1) {
        const segmentKey = `${routeSegIndex}-${routeSegIndex + 1}`;
        if (!passedSegments.has(segmentKey)) {
            passedSegments.add(segmentKey);
            console.log('标记已走过路段:', segmentKey);
        }
    }

    // 更新最远索引（用于兼容性）
    if (routeSegIndex > maxPassedSegIndex) {
        maxPassedSegIndex = routeSegIndex;
    }

    // 处理偏离路径的情况
    if (!onRoute) {
        // 添加当前位置到偏离路径（使用实际GPS位置，不是投影点）
        if (deviatedPath.length === 0 ||
            calculateDistanceBetweenPoints(currentPos, deviatedPath[deviatedPath.length - 1]) > 2) {
            // 只有当移动超过2米才添加新点，避免过于密集
            deviatedPath.push(currentPos);
        }

        // 创建或更新黄色偏离路径
        if (deviatedPath.length >= 2) {
            if (!deviatedRoutePolyline) {
                deviatedRoutePolyline = new AMap.Polyline({
                    path: deviatedPath,
                    strokeColor: '#FFC107', // 黄色
                    strokeWeight: 6,
                    strokeOpacity: 0.8,
                    strokeStyle: 'dashed', // 虚线样式
                    lineJoin: 'round',
                    lineCap: 'round',
                    zIndex: 115, // 在灰色路径之上，绿色路径之下
                    map: navigationMap
                });
                console.log('创建黄色偏离路径，长度:', deviatedPath.length, '点');
            } else {
                deviatedRoutePolyline.setPath(deviatedPath);
                console.log('更新黄色偏离路径，长度:', deviatedPath.length, '点');
            }
        }
    } else {
        // 回到路线上时，清除偏离路径
        if (deviatedRoutePolyline) {
            navigationMap.remove(deviatedRoutePolyline);
            deviatedRoutePolyline = null;
        }
        deviatedPath = [];
    }

    // 构建已走过的路径（灰色）：基于路段标记
    let passedPath = [];
    let passedPathSegments = []; // 用于构建完整的已走路径

    for (let i = 0; i < fullPath.length - 1; i++) {
        const segmentKey = `${i}-${i + 1}`;
        if (passedSegments.has(segmentKey)) {
            // 这个路段已经走过
            if (passedPathSegments.length === 0 || passedPathSegments[passedPathSegments.length - 1] !== i) {
                passedPathSegments.push(i);
            }
            passedPathSegments.push(i + 1);
        }
    }

    // 将索引转换为坐标点
    passedPath = passedPathSegments.map(idx => fullPath[idx]);

    // 如果当前在路上，添加投影点到已走路径的末尾
    if (onRoute && routePoint && passedPath.length > 0) {
        // 检查投影点是否应该添加到已走路径
        const lastPassedPoint = passedPath[passedPath.length - 1];
        const lastPassedIdx = passedPathSegments[passedPathSegments.length - 1];

        if (routeSegIndex === lastPassedIdx) {
            passedPath.push(routePoint);
        }
    }

    // 构建剩余路径（绿色）：未走过的路段
    let remainingPath = [];

    if (onRoute) {
        // 从投影点开始，收集所有未走过的路段
        remainingPath.push(routePoint);

        let currentSegIdx = routeSegIndex;
        let visited = new Set();
        visited.add(currentSegIdx);

        // 从当前位置向后查找未走过的连续路段
        for (let i = routeSegIndex + 1; i < fullPath.length; i++) {
            const segmentKey = `${i - 1}-${i}`;
            if (!passedSegments.has(segmentKey) || i === fullPath.length - 1) {
                remainingPath.push(fullPath[i]);
            }
        }

        // 如果剩余路径只有投影点，说明已经完成，保持当前状态
        if (remainingPath.length < 2) {
            remainingPath = [routePoint, fullPath[fullPath.length - 1]];
        }
    } else {
        // 偏离路径时：显示完整的未走路段
        let hasUnpassed = false;
        for (let i = 0; i < fullPath.length - 1; i++) {
            const segmentKey = `${i}-${i + 1}`;
            if (!passedSegments.has(segmentKey)) {
                if (!hasUnpassed) {
                    remainingPath.push(fullPath[i]);
                    hasUnpassed = true;
                }
                remainingPath.push(fullPath[i + 1]);
            }
        }

        if (remainingPath.length === 0) {
            remainingPath = fullPath.slice();
        }
    }

    console.log('路径状态:', {
        在路径上: onRoute,
        当前索引: routeSegIndex,
        已走路段数: passedSegments.size,
        灰色路径点数: passedPath.length,
        黄色偏离点数: deviatedPath.length,
        绿色路径点数: remainingPath.length
    });

    // 更新或创建灰色已走路径
    if (passedPath.length >= 2) {
        if (!passedRoutePolyline) {
            passedRoutePolyline = new AMap.Polyline({
                path: passedPath,
                strokeColor: '#9E9E9E',
                strokeWeight: 8,
                strokeOpacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: 110,
                map: navigationMap
            });
            console.log('创建灰色已走路径，长度:', passedPath.length, '点');
        } else {
            passedRoutePolyline.setPath(passedPath);
            console.log('更新灰色已走路径，长度:', passedPath.length, '点');
        }
    } else if (passedRoutePolyline) {
        // 如果已走路径太短，移除灰色线
        navigationMap.remove(passedRoutePolyline);
        passedRoutePolyline = null;
    }

    // 更新绿色剩余路径
    if (remainingPath.length >= 2) {
        routePolyline.setPath(remainingPath);
    } else if (routePoint) {
        routePolyline.setPath([routePoint]);
    }
}

// 更新剩余绿色路线为：当前点 + 后续节点（旧函数，保留用于兼容）
function updateRemainingPolyline(currentPos, fullPath, segIndex) {
    if (!routePolyline) return;
    // 使用投影点，确保路线对齐路网
    const projection = projectPointOntoPathMeters(currentPos, fullPath);
    const routePoint = projection ? projection.projected : currentPos;
    const remaining = [routePoint].concat(fullPath.slice((projection ? projection.index : segIndex) + 1));
    if (remaining.length >= 2) {
        routePolyline.setPath(remaining);
    } else {
        routePolyline.setPath([routePoint]);
    }
}

// 将一个地理点投影到路径上（近似平面计算），返回最近线段索引、投影比例t以及投影点
function projectPointOntoPathMeters(point, path) {
    if (!path || path.length < 2 || !point) return null;
    const p = normalizeLngLat(point);
    let best = null;
    for (let i = 0; i < path.length - 1; i++) {
        const a = normalizeLngLat(path[i]);
        const b = normalizeLngLat(path[i + 1]);
        const dx = (b[0] - a[0]);
        const dy = (b[1] - a[1]);
        const len2 = dx*dx + dy*dy;
        let t = 0;
        if (len2 > 0) {
            t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
            t = Math.max(0, Math.min(1, t));
        }
        const proj = [a[0] + t * dx, a[1] + t * dy];
        const dist = calculateDistanceBetweenPoints(p, proj);
        if (!best || dist < best.distance) {
            best = { index: i, t, projected: proj, distance: dist };
        }
    }
    return best;
}

// 计算沿路网从投影点到终点的剩余距离（米）
function computeRemainingRouteDistanceMeters(path, projection) {
    if (!path || path.length < 2 || !projection) return 0;
    const idx = Math.max(0, Math.min(path.length - 2, projection.index));
    let dist = 0;
    const projPoint = normalizeLngLat(projection.projected);
    const segEnd = normalizeLngLat(path[idx + 1]);
    dist += calculateDistanceBetweenPoints(projPoint, segEnd);
    for (let j = idx + 1; j < path.length - 1; j++) {
        const a = normalizeLngLat(path[j]);
        const b = normalizeLngLat(path[j + 1]);
        dist += calculateDistanceBetweenPoints(a, b);
    }
    return dist;
}

// 规范化点为 [lng, lat]
function normalizeLngLat(p) {
    if (!p) return [0, 0];
    if (Array.isArray(p)) return [p[0], p[1]];
    if (p.lng !== undefined && p.lat !== undefined) return [p.lng, p.lat];
    return [0, 0];
}

// 线性插值地理点（简化，足够短距离）
function interpolateLngLat(a, b, t) {
    const aArr = normalizeLngLat(a);
    const bArr = normalizeLngLat(b);
    const lng = aArr[0] + (bArr[0] - aArr[0]) * t;
    const lat = aArr[1] + (bArr[1] - aArr[1]) * t;
    return [lng, lat];
}

// 完成导航：统计并弹窗
function finishNavigation() {
    stopSimulatedNavigation();
    isNavigating = false;

    // 估算总时间（若有开始时间则按实际流逝；否则按速度估算）
    let totalMinutes;
    if (navStartTime) {
        totalMinutes = Math.max(1, Math.ceil((Date.now() - navStartTime) / 60000));
    } else {
        const hours = (totalRouteDistance || 0) / VEHICLE_SPEED;
        totalMinutes = Math.ceil(hours * 60);
    }

    showNavigationCompleteModal(totalRouteDistance || 0, totalMinutes);
}

function tryStartDeviceOrientationNav() {
    // 如果已经在监听设备方向，则直接返回
    if (trackingDeviceOrientationNav) return;

    // 判断是否为 iOS 设备（iOS 需要显式请求方向权限）
    const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent);

    // 启动监听的实际逻辑（封装为 start 以便在请求权限后调用）
    const start = () => {
        // 处理 deviceorientation 事件的回调
        deviceOrientationHandlerNav = function(e) {
            if (!e) return;
            let heading = null;

            // iOS Safari 提供 webkitCompassHeading（0-360，参考真北）
            if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
                heading = e.webkitCompassHeading;
            // Android: 优先使用 absolute=true 的 alpha（真实罗盘方向）
            } else if (typeof e.alpha === 'number' && !isNaN(e.alpha) && e.absolute === true) {
                heading = e.alpha;
            // 降级方案：使用相对 alpha，转换为顺时针
            } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
                heading = 360 - e.alpha;
            }
            if (heading === null) return;

            // Android 某些浏览器在 absolute 模式下与真实北向相反，按配置反转
            try {
                const isAndroid = /Android/i.test(navigator.userAgent);
                if (isAndroid && e.absolute === true && MapConfig && MapConfig.orientationConfig && MapConfig.orientationConfig.androidNeedsInversion) {
                    heading = (360 - heading);
                }
            } catch (ex) {}

            // 规范化到 0-360 范围
            heading = ((heading % 360) + 360) % 360;

            // 保存最新朝向，供其他逻辑（例如 GPS 更新）使用
            lastDeviceHeadingNav = heading;

            // 如果"我的位置"标记已存在，则尝试设置其旋转角度
            if (userMarker) {
                // 统一封装：角度偏移与地图旋转在内部处理
                try { navApplyHeadingToMarker(heading); } catch (err) {}
            }

            // 若正在导航，设备朝向变化也应触发提示刷新（支持“基于朝向”的提示在原地转向时即时更新）
            if (isNavigating && hasReachedStart) {
                try { updateNavigationTip(); } catch (e) {}
            }
        };

        // 优先尝试监听 deviceorientationabsolute（提供绝对罗盘方向）
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', deviceOrientationHandlerNav, true);
            console.log('[导航] 使用 deviceorientationabsolute 事件（绝对罗盘方向）');
        } else {
            // 降级到普通 deviceorientation
            window.addEventListener('deviceorientation', deviceOrientationHandlerNav, true);
            console.log('[导航] 使用 deviceorientation 事件（相对方向）');
        }

        trackingDeviceOrientationNav = true;
    };

    try {
        // iOS 13+ 要求页面主动请求 DeviceOrientation 权限
        if (isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(state => {
                if (state === 'granted') start();
                else console.warn('用户拒绝设备方向权限');
            }).catch(err => console.warn('请求方向权限失败:', err));
        } else {
            // 非 iOS 或不需要权限的浏览器直接开始监听
            start();
        }
    } catch (e) {
        // 捕获任何意外错误，避免阻断导航流程
        console.warn('开启方向监听失败:', e);
    }
}

function tryStopDeviceOrientationNav() {
    if (!trackingDeviceOrientationNav) return;
    try {
        if (deviceOrientationHandlerNav) {
            window.removeEventListener('deviceorientation', deviceOrientationHandlerNav, true);
            if ('ondeviceorientationabsolute' in window) {
                try { window.removeEventListener('deviceorientationabsolute', deviceOrientationHandlerNav, true); } catch (e) {}
            }
            deviceOrientationHandlerNav = null;
        }
    } catch (e) {}
    trackingDeviceOrientationNav = false;
    lastDeviceHeadingNav = null;
}

// 生成可旋转的箭头SVG数据URL（用于手机端导航页）
function createHeadingArrowDataUrl(color) {
    const svg = `
        <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
                    <feOffset dx="0" dy="1" result="offsetblur"/>
                    <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <g filter="url(#shadow)">
                <circle cx="15" cy="15" r="12" fill="white"/>
                <path d="M15 4 L20 18 L15 15 L10 18 Z" fill="${color || '#007bff'}"/>
            </g>
        </svg>`;
    try { return 'data:image/svg+xml;base64,' + btoa(svg); }
    catch (e) { return (MapConfig && MapConfig.markerStyles && MapConfig.markerStyles.currentLocation && MapConfig.markerStyles.currentLocation.icon) || ''; }
}

// ====== 导航前实时位置追踪（仅显示我的位置，不开启导航） ======
function startRealtimePositionTracking() {
    console.log('=== 开始启动导航前实时位置追踪 ===');

    if (!('geolocation' in navigator)) {
        console.error('浏览器不支持定位');
        alert('当前浏览器不支持定位功能');
        return;
    }

    // 如果已经在追踪，不重复启动
    if (preNavWatchId !== null) {
        console.log('实时位置追踪已启动，watchId:', preNavWatchId);
        return;
    }

    console.log('准备启动GPS监听...');

    // 尝试启动设备方向监听
    tryStartDeviceOrientationNav();

    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    preNavWatchId = navigator.geolocation.watchPosition(
        pos => {
            console.log('=== GPS位置更新 ===', pos);
            let lng = pos.coords.longitude;
            let lat = pos.coords.latitude;

            // 坐标系转换 WGS84 -> GCJ-02
            try {
                if (typeof wgs84ToGcj02 === 'function') {
                    const converted = wgs84ToGcj02(lng, lat);
                    if (Array.isArray(converted) && converted.length === 2) {
                        console.log('坐标转换: WGS84', [lng, lat], '-> GCJ02', converted);
                        lng = converted[0];
                        lat = converted[1];
                    }
                }
            } catch (e) {
                console.warn('坐标系转换失败，使用原始坐标:', e);
            }

            const curr = [lng, lat];
            console.log('当前位置:', curr);

            // 获取GPS精度并更新精度圈
            const accuracy = pos.coords.accuracy || 10; // 默认10米
            updateAccuracyCircle(curr, accuracy);
            console.log('GPS精度:', accuracy, '米');

            // 创建或更新"我的位置"标记
            if (!userMarker) {
                console.log('准备创建我的位置标记...');
                console.log('MapConfig:', MapConfig);
                console.log('MapConfig.markerStyles:', MapConfig.markerStyles);
                console.log('MapConfig.markerStyles.headingLocation:', MapConfig.markerStyles.headingLocation);

                // 使用与首页相同的配置
                const iconCfg = MapConfig.markerStyles.headingLocation;
                const w = (iconCfg && iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
                const h = (iconCfg && iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;

                // 使用配置的图标或SVG箭头
                let iconImage = iconCfg && iconCfg.icon ? iconCfg.icon : null;
                if (!iconImage || iconCfg.useSvgArrow === true) {
                    console.log('使用SVG箭头图标');
                    iconImage = createHeadingArrowDataUrl('#007bff');
                } else {
                    console.log('使用PNG图标:', iconImage);
                }

                console.log('导航页创建我的位置标记, 图标路径:', iconImage, '尺寸:', w, 'x', h);

                const myIcon = new AMap.Icon({
                    size: new AMap.Size(w, h),
                    image: iconImage,
                    imageSize: new AMap.Size(w, h)
                });

                console.log('AMap.Icon创建成功');

                userMarker = new AMap.Marker({
                    position: curr,
                    icon: myIcon,
                    offset: new AMap.Pixel(-(w/2), -(h/2)),
                    zIndex: 120,
                    angle: 0,
                    map: navigationMap
                });

                console.log('导航页我的位置标记创建成功, marker:', userMarker);
            } else {
                console.log('更新我的位置标记位置:', curr);
                userMarker.setPosition(curr);
            }

            // 计算并更新朝向
            let heading = null;
            if (typeof lastDeviceHeadingNav === 'number') {
                // 优先使用设备方向
                heading = lastDeviceHeadingNav;
                console.log('使用设备方向更新朝向:', heading);
            } else if (lastGpsPos) {
                // 使用GPS移动方向
                const moveDist = calculateDistanceBetweenPoints(lastGpsPos, curr);
                console.log('GPS移动距离:', moveDist, 'm');
                if (moveDist > 0.5) {
                    heading = calculateBearingBetweenPoints(lastGpsPos, curr);
                    console.log('使用GPS移动方向更新朝向:', heading);
                }
            }

            // 应用朝向角度：统一封装并尝试自动校准
            if (heading !== null) {
                try {
                    attemptAutoCalibrationNav(curr, heading);
                    navApplyHeadingToMarker(heading);
                } catch (e) {
                    console.error('设置标记角度失败:', e);
                }
            }

            lastGpsPos = curr;
        },
        err => {
            console.error('=== GPS定位失败 ===');
            console.error('错误代码:', err.code);
            console.error('错误信息:', err.message);
            console.error('错误详情:', err);

            if (!geoErrorNotified) {
                alert('无法获取实时位置，请检查定位权限\n错误代码: ' + err.code + '\n错误信息: ' + err.message);
                geoErrorNotified = true;
            }
        },
        options
    );

    console.log('GPS watchPosition已启动, watchId:', preNavWatchId);
}

// 停止导航前的实时位置追踪
function stopRealtimePositionTracking() {
    if (preNavWatchId !== null && navigator.geolocation && typeof navigator.geolocation.clearWatch === 'function') {
        try {
            navigator.geolocation.clearWatch(preNavWatchId);
            console.log('已停止实时位置追踪（导航前）');
        } catch (e) {
            console.error('停止位置追踪失败:', e);
        }
        preNavWatchId = null;
    }
    // 清理精度圈
    if (accuracyCircle && navigationMap) {
        navigationMap.remove(accuracyCircle);
        accuracyCircle = null;
    }
}

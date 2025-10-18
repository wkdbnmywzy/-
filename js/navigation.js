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
let userMarker = null;            // 代表“我的位置”的移动标记
let traveledPolyline = null;      // 已走过的路（灰色）
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
        const kmlRawData = sessionStorage.getItem('kmlRawData');
        const kmlFileName = sessionStorage.getItem('kmlFileName');

        if (!kmlRawData) {
            console.warn('sessionStorage中没有KML原始数据');
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

// 在导航地图上显示KML要素（不显示点，只显示线和面）
function displayKMLFeaturesForNavigation(features, fileName) {
    const layerId = 'kml-' + Date.now();
    const layerMarkers = [];

    // 分离点、线、面
    const points = features.filter(f => f.geometry.type === 'point');
    const lines = features.filter(f => f.geometry.type === 'line');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    // 1. 先显示面（zIndex: 10）
    polygons.forEach(feature => {
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
                strokeColor: polyStyle.strokeColor,
                strokeWeight: polyStyle.strokeWidth,
                strokeOpacity: polyStyle.strokeOpacity || 0.6,
                fillColor: polyStyle.fillColor,
                fillOpacity: polyStyle.fillOpacity || 0.3,
                zIndex: 10,
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
                zIndex: 20,
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

    // 隐藏所有KML线要素，避免与导航路线混淆
    hideKMLLines();

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

        console.log(`📍 规划路段 ${i+1}/${sequencePoints.length-1}: 从`, a, '到', b);

        let segResult = planKMLRoute(a, b);

        console.log('   路段规划结果:', segResult);

        if (segResult && segResult.path && segResult.path.length >= 2) {
            console.log(`   ✅ 路段${i+1}规划成功, 点数:`, segResult.path.length, '距离:', segResult.distance.toFixed(2), 'm');
            console.log('   路段路径数据:', JSON.stringify(segResult.path));

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
                    console.log('   检测到重复点，已跳过');
                } else {
                    // 无重复，保留所有点
                    combinedPath = combinedPath.concat(segResult.path);
                    console.log('   无重复点，保留所有点');
                }
            } else {
                combinedPath = segResult.path.slice();
            }
            totalDistance += (segResult.distance || 0);

            console.log('   拼接后总点数:', combinedPath.length);
        } else {
            console.warn(`   ❌ 路段${i+1} KML规划失败，使用直线段:`, a, b);
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

    console.log('=====================================');
    console.log('🎯 所有路段规划完成');
    console.log('   合并后路径总点数:', combinedPath.length);
    console.log('   总距离:', totalDistance.toFixed(2), 'm');
    console.log('   合并路径数据:', JSON.stringify(combinedPath));
    console.log('=====================================');

    if (combinedPath.length >= 2) {
        // 更新距离与时间
        updateRouteInfoFromKML({ distance: totalDistance });
        // 绘制合并后的路线
        console.log('📍 准备绘制路线, 点数:', combinedPath.length);
        drawKMLRoute({ path: combinedPath });
        // 调整地图视野
        adjustMapView(startLngLat, endLngLat);
    } else {
        console.warn('合并路径失败，回退直线起终点');
        drawStraightLine(startLngLat, endLngLat);
    }
}

// 隐藏所有KML线要素（已废弃 - KML线现在应该保持可见作为底图参考）
function hideKMLLines() {
    // 不再隐藏KML线，它们作为底图参考保持可见
    console.log('KML线保持可见作为底图参考');
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

    console.log('🎨 开始绘制KML路线');
    console.log('   路径点数:', path.length);
    console.log('   路径数据:', path);

    // 清除之前的路线
    if (routePolyline) {
        console.log('   清除之前的路线');
        navigationMap.remove(routePolyline);
        routePolyline = null;
    }

    // 验证路径数据
    if (!path || path.length < 2) {
        console.error('❌ 路径数据无效或点数不足');
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

        console.log('✅ Polyline创建成功');
        console.log('   颜色: #00C853 (导航绿色)');
        console.log('   线宽: 4px (与KML线一致)');
        console.log('   不透明度: 95%');
        console.log('   zIndex: 200');

        // 强制刷新地图
        try {
            navigationMap.setZoom(navigationMap.getZoom());
            console.log('✅ 已触发地图重绘');
        } catch (e) {
            console.warn('触发地图重绘失败:', e);
        }

        // 自动调整地图视野到路径范围
        try {
            console.log('📍 调整地图视野到路径范围...');

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

            console.log('   路径边界:', {minLng, maxLng, minLat, maxLat});

            // 创建边界并设置地图视野
            const bounds = new AMap.Bounds([minLng, minLat], [maxLng, maxLat]);
            navigationMap.setBounds(bounds, false, [80, 80, 80, 80]); // 添加80px内边距

            console.log('✅ 地图视野已调整到路径范围');
        } catch (e) {
            console.error('调整地图视野失败:', e);
        }

        // 检查Polyline是否真的在地图上
        setTimeout(() => {
            const allOverlays = navigationMap.getAllOverlays('polyline');
            console.log('🔍 检查地图上的Polyline数量:', allOverlays.length);
            if (allOverlays.length === 0) {
                console.error('❌ 警告: 地图上没有找到任何Polyline!');
            } else {
                console.log('✅ 地图上有', allOverlays.length, '个Polyline');

                // 输出路径线的详细信息用于调试
                console.log('📊 Polyline详细信息:');
                allOverlays.forEach((overlay, index) => {
                    if (overlay.CLASS_NAME === 'AMap.Polyline') {
                        const opts = overlay.getOptions();
                        console.log(`   Polyline ${index+1}:`, {
                            颜色: opts.strokeColor,
                            线宽: opts.strokeWeight,
                            不透明度: opts.strokeOpacity,
                            zIndex: opts.zIndex,
                            点数: overlay.getPath ? overlay.getPath().length : 'N/A'
                        });
                    }
                });
            }
        }, 500);

    } catch (error) {
        console.error('❌ 创建Polyline失败:', error);
        console.error('错误详情:', error.stack);
    }

    console.log('🎨 KML路线绘制完成，共', path.length, '个点');
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

    // 添加途径点按钮 - 保存地图状态后跳转到首页的点位选择界面
    const addWaypointBtn = document.getElementById('nav-add-waypoint-btn');
    if (addWaypointBtn) {
        addWaypointBtn.addEventListener('click', function() {
            console.log('跳转到首页点位选择界面添加途径点');

            // 保存当前路线数据到sessionStorage
            if (routeData) {
                try {
                    sessionStorage.setItem('navigationRoute', JSON.stringify(routeData));
                } catch (e) {
                    console.error('保存路线数据失败:', e);
                }
            }

            // 保存导航页的地图状态到专用key，避免被清除
            if (navigationMap) {
                try {
                    const zoom = navigationMap.getZoom();
                    const center = navigationMap.getCenter();
                    const position = routeData && routeData.start && routeData.start.position ?
                        routeData.start.position : null;

                    const mapState = {
                        zoom: zoom,
                        center: [center.lng, center.lat],
                        position: position,
                        angle: 0,
                        fromNavigation: true // 标记来自导航页
                    };
                    sessionStorage.setItem('mapState', JSON.stringify(mapState));
                    console.log('保存导航页地图状态:', mapState);
                } catch (e) {
                    console.warn('保存地图状态失败:', e);
                }
            }

            // 跳转到首页并自动打开点位选择界面
            window.location.href = 'index.html?action=addWaypoint';
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

// 清理地图资源
function cleanupMap() {
    // 停止所有位置追踪
    stopRealtimePositionTracking();
    stopRealNavigationTracking();

    if (navigationMap) {
        // 清除标记
        if (startMarker) {
            navigationMap.remove(startMarker);
            startMarker = null;
        }
        if (endMarker) {
            navigationMap.remove(endMarker);
            endMarker = null;
        }
        if (waypointMarkers && waypointMarkers.length) {
            navigationMap.remove(waypointMarkers);
            waypointMarkers = [];
        }
        // 清理"我的位置"与灰色轨迹
        if (userMarker) {
            navigationMap.remove(userMarker);
            userMarker = null;
        }
        if (traveledPolyline) {
            navigationMap.remove(traveledPolyline);
            traveledPolyline = null;
        }
        if (navigationTimer) {
            clearInterval(navigationTimer);
            navigationTimer = null;
        }
        // 清除路线
        if (routePolyline) {
            navigationMap.remove(routePolyline);
            routePolyline = null;
        }
        // 销毁地图实例
        navigationMap.destroy();
        navigationMap = null;
    }
}

// 页面加载完成后初始化
window.addEventListener('load', function() {
    console.log('导航页面加载完成');
    initNavigationMap();
    setupNavigationEvents();
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', function() {
    cleanupMap();
});

// 导航状态变量
let isNavigating = false;
let currentNavigationIndex = 0;
let navigationPath = [];
let nextTurnIndex = -1; // 下一个转向点的索引

// 工业运输车速度配置（单位：米/小时）
const VEHICLE_SPEED = 10000; // 10km/h，约为工业运输车的平均速度

// 开始导航UI
function startNavigationUI() {
    if (!routeData || !routePolyline) {
        alert('请先规划路线');
        return;
    }

    isNavigating = true;

    // 停止导航前的实时位置追踪
    stopRealtimePositionTracking();

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

    // 获取当前转向并更新图标和文本
    const directionType = getNavigationDirection();

    // 计算到下一个转向点或终点的距离
    let distanceToNext = 0;
    if (nextTurnIndex > 0 && nextTurnIndex < navigationPath.length) {
        // 有转向点，计算到转向点的距离
        for (let i = currentNavigationIndex; i < nextTurnIndex; i++) {
            if (i + 1 < navigationPath.length) {
                distanceToNext += calculateDistanceBetweenPoints(
                    navigationPath[i],
                    navigationPath[i + 1]
                );
            }
        }
    } else {
        // 没有转向点，使用剩余总距离
        distanceToNext = remainingDistance;
    }

    updateDirectionIcon(directionType, distanceToNext);
}

// 查找下一个转向点
function findNextTurnPoint() {
    if (!navigationPath || navigationPath.length < 3) {
        nextTurnIndex = -1;
        return;
    }

    const TURN_ANGLE_THRESHOLD = 15; // 转向角度阈值（度）

    // 从当前位置开始查找
    for (let i = currentNavigationIndex + 1; i < navigationPath.length - 1; i++) {
        const angle = calculateTurnAngle(
            navigationPath[i - 1],
            navigationPath[i],
            navigationPath[i + 1]
        );

        // 如果转向角度大于阈值，认为是一个转向点
        if (Math.abs(angle) > TURN_ANGLE_THRESHOLD) {
            nextTurnIndex = i;
            console.log(`找到转向点 索引:${i}, 角度:${angle.toFixed(2)}°`);
            return;
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

// 获取导航转向类型
function getNavigationDirection() {
    if (nextTurnIndex < 0 || nextTurnIndex >= navigationPath.length - 1) {
        return 'straight'; // 没有转向点，直行
    }

    // 计算转向角度
    const angle = calculateTurnAngle(
        navigationPath[nextTurnIndex - 1],
        navigationPath[nextTurnIndex],
        navigationPath[nextTurnIndex + 1]
    );

    console.log(`转向角度: ${angle.toFixed(2)}°`);

    // 根据角度判断转向类型
    if (angle > 135 || angle < -135) {
        return 'uturn'; // 掉头（大于135度）
    } else if (angle > 15 && angle <= 135) {
        return 'left'; // 左转（15-135度）
    } else if (angle < -15 && angle >= -135) {
        return 'right'; // 右转（-15到-135度）
    } else {
        return 'straight'; // 直行（-15到15度）
    }
}

// 更新转向图标和提示文本
function updateDirectionIcon(directionType, distanceToNext) {
    const directionImg = document.getElementById('tip-direction-img');
    const actionText = document.getElementById('tip-action-text');
    const distanceAheadElem = document.getElementById('tip-distance-ahead');
    const distanceUnitElem = document.querySelector('.tip-distance-unit');

    const basePath = 'images/工地数字导航小程序切图/司机/2X/导航/';

    let iconPath = '';
    let actionName = '';

    // 计算显示的距离（四舍五入）
    const distance = Math.round(distanceToNext || 0);

    switch (directionType) {
        case 'left':
            iconPath = basePath + '左转.png';
            actionName = '左转';
            break;
        case 'right':
            iconPath = basePath + '右转.png';
            actionName = '右转';
            break;
        case 'uturn':
            iconPath = basePath + '掉头.png';
            actionName = '掉头';
            break;
        case 'straight':
        default:
            iconPath = basePath + '直行.png';
            actionName = '直行';
            break;
    }

    // 更新图标
    if (directionImg) {
        directionImg.src = iconPath;
        directionImg.alt = actionName;
    }

    // 更新提示文本
    if (directionType === 'straight') {
        // 直行时显示："直行 XXX 米"
        if (distanceAheadElem) {
            distanceAheadElem.textContent = distance;
        }
        if (actionText) {
            actionText.textContent = '米';
        }
        // 隐藏"米后"文本，因为已经改为"直行 XXX 米"
        if (distanceUnitElem) {
            distanceUnitElem.style.display = 'none';
        }
    } else {
        // 其他转向显示："XXX 米后 左转/右转/掉头"
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

    // 创建移动的“我的位置”标记
    if (userMarker) {
        navigationMap.remove(userMarker);
        userMarker = null;
    }
    const myIcon = new AMap.Icon({
        size: new AMap.Size(30, 30),
        image: MapConfig.markerStyles.currentLocation.icon,
        imageSize: new AMap.Size(30, 30)
    });
    userMarker = new AMap.Marker({
        position: path[0],
        icon: myIcon,
        offset: new AMap.Pixel(-15, -15),
        zIndex: 120,
        angle: 0,
        map: navigationMap
    });

    // 创建灰色已走路径
    if (traveledPolyline) {
        navigationMap.remove(traveledPolyline);
        traveledPolyline = null;
    }
    traveledPolyline = new AMap.Polyline({
        path: [path[0]],
        strokeColor: '#9E9E9E',
        strokeWeight: 8,
        strokeOpacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 110,
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
function startRealNavigationTracking() {
    if (!('geolocation' in navigator)) {
        if (!geoErrorNotified) {
            alert('当前浏览器不支持定位，无法进行实时导航');
            geoErrorNotified = true;
        }
        return;
    }

    // 固定一份完整规划路径，作为“剩余路线”的参考
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

                if (traveledPolyline) { navigationMap.remove(traveledPolyline); traveledPolyline = null; }
                traveledPolyline = new AMap.Polyline({
                    path: [curr],
                    strokeColor: '#9E9E9E',
                    strokeWeight: 8,
                    strokeOpacity: 0.9,
                    lineJoin: 'round',
                    lineCap: 'round',
                    zIndex: 110,
                    map: navigationMap
                });
            }

            // 计算朝向并旋转：优先使用设备方向 heading；否则用移动向量
            if (typeof lastDeviceHeadingNav === 'number') {
                const heading = lastDeviceHeadingNav;
                if (typeof userMarker.setAngle === 'function') {
                    userMarker.setAngle(heading);
                } else if (typeof userMarker.setRotation === 'function') {
                    userMarker.setRotation(heading);
                }
            } else if (lastGpsPos) {
                const moveDist = calculateDistanceBetweenPoints(lastGpsPos, curr);
                if (moveDist > 0.5) { // 小于0.5米忽略抖动
                    const bearing = calculateBearingBetweenPoints(lastGpsPos, curr);
                    if (typeof userMarker.setAngle === 'function') {
                        userMarker.setAngle(bearing);
                    } else if (typeof userMarker.setRotation === 'function') {
                        userMarker.setRotation(bearing);
                    }
                }
            }
            lastGpsPos = curr;
            userMarker.setPosition(curr);

            // 灰色轨迹追加
            const traveledPath = traveledPolyline.getPath();
            traveledPath.push(curr);
            traveledPolyline.setPath(traveledPath);

            // 计算与规划路径最近的点索引，用于剩余路径与提示
            const segIndex = findClosestPathIndex(curr, fullPath);
            updateRemainingPolyline(curr, fullPath, Math.max(0, segIndex));

            // 视图跟随
            try { navigationMap.setCenter(curr); } catch (e) {}

            // 更新提示
            currentNavigationIndex = Math.max(0, segIndex);
            findNextTurnPoint();
            updateNavigationTip();

            // 到终点判定（与路径末点距离很近）
            const end = fullPath[fullPath.length - 1];
            const distToEnd = calculateDistanceBetweenPoints(curr, end);
            if (distToEnd < 5) { // 小于5米认为到达
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
    if (traveledPolyline && navigationMap) { navigationMap.remove(traveledPolyline); traveledPolyline = null; }
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
            if (typeof userMarker.setAngle === 'function') {
                userMarker.setAngle(bearing);
            } else {
                // 兼容：部分版本可能使用 setRotation
                if (typeof userMarker.setRotation === 'function') {
                    userMarker.setRotation(bearing);
                }
            }
        } catch (e) {}
        userMarker.setPosition(currPos);

        // 追加到灰色已走路径
        const traveledPath = traveledPolyline.getPath();
        traveledPath.push(currPos);
        traveledPolyline.setPath(traveledPath);

        // 将剩余路径（绿色）更新为从当前点开始
        updateRemainingPolyline(currPos, path, segIndex);

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
    if (traveledPolyline && navigationMap) {
        navigationMap.remove(traveledPolyline);
        traveledPolyline = null;
    }
}

// 更新剩余绿色路线为：当前点 + 后续节点
function updateRemainingPolyline(currentPos, fullPath, segIndex) {
    if (!routePolyline) return;
    const remaining = [currentPos].concat(fullPath.slice(segIndex + 1));
    if (remaining.length >= 2) {
        routePolyline.setPath(remaining);
    } else {
        routePolyline.setPath([currentPos]);
    }
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

// ====== 设备方向（导航页）支持 ======
function tryStartDeviceOrientationNav() {
    if (trackingDeviceOrientationNav) return;
    const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent);
    const start = () => {
        deviceOrientationHandlerNav = function(e) {
            if (!e) return;
            let heading = null;
            if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
                heading = e.webkitCompassHeading; // iOS Safari，已相对正北
            } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
                heading = e.alpha; // 部分安卓浏览器返回相对正北
            }
            if (heading === null) return;
            if (heading < 0) heading += 360;
            lastDeviceHeadingNav = heading;
            if (userMarker) {
                try {
                    if (typeof userMarker.setAngle === 'function') userMarker.setAngle(heading);
                    else if (typeof userMarker.setRotation === 'function') userMarker.setRotation(heading);
                } catch (err) {}
            }
        };
        window.addEventListener('deviceorientation', deviceOrientationHandlerNav, true);
        trackingDeviceOrientationNav = true;
    };
    try {
        if (isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(state => {
                if (state === 'granted') start();
                else console.warn('用户拒绝设备方向权限');
            }).catch(err => console.warn('请求方向权限失败:', err));
        } else {
            start();
        }
    } catch (e) { console.warn('开启方向监听失败:', e); }
}

function tryStopDeviceOrientationNav() {
    if (!trackingDeviceOrientationNav) return;
    try {
        if (deviceOrientationHandlerNav) {
            window.removeEventListener('deviceorientation', deviceOrientationHandlerNav, true);
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
            if (typeof lastDeviceHeadingNav === 'number') {
                // 优先使用设备方向
                const heading = lastDeviceHeadingNav;
                console.log('使用设备方向更新朝向:', heading);
                try {
                    if (typeof userMarker.setAngle === 'function') {
                        userMarker.setAngle(heading);
                    } else if (typeof userMarker.setRotation === 'function') {
                        userMarker.setRotation(heading);
                    }
                } catch (e) {
                    console.error('设置标记角度失败:', e);
                }
            } else if (lastGpsPos) {
                // 使用GPS移动方向
                const moveDist = calculateDistanceBetweenPoints(lastGpsPos, curr);
                console.log('GPS移动距离:', moveDist, 'm');
                if (moveDist > 0.5) {
                    const bearing = calculateBearingBetweenPoints(lastGpsPos, curr);
                    console.log('使用GPS移动方向更新朝向:', bearing);
                    try {
                        if (typeof userMarker.setAngle === 'function') {
                            userMarker.setAngle(bearing);
                        } else if (typeof userMarker.setRotation === 'function') {
                            userMarker.setRotation(bearing);
                        }
                    } catch (e) {
                        console.error('设置标记角度失败:', e);
                    }
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
}

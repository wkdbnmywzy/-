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
let lastGpsPos = null;            // 上一次GPS位置（用于计算朝向）
let geoErrorNotified = false;     // 避免重复弹错误

// 初始化导航地图
function initNavigationMap() {
    console.log('初始化导航地图...');

    // 先加载KML数据（必须在规划路线之前）
    loadKMLDataFromSession();

    // 创建地图实例（不显示任何图层）
    navigationMap = new AMap.Map('navigation-map-container', {
        zoom: 17,
        center: [116.397428, 39.90923],
        mapStyle: 'amap://styles/normal',
        viewMode: '2D',
        features: ['bg', 'road', 'building'], // 只显示背景、道路和建筑
        showLabel: true
    });

    // 获取路线数据
    loadRouteData();

    console.log('导航地图初始化完成');
}

// 从sessionStorage加载KML数据
function loadKMLDataFromSession() {
    try {
        const kmlDataStr = sessionStorage.getItem('kmlData');
        if (!kmlDataStr) {
            console.warn('sessionStorage中没有KML数据');
            return;
        }

        const kmlData = JSON.parse(kmlDataStr);
        console.log('从sessionStorage加载KML数据，图层数:', kmlData.length);

        // 重建kmlLayers结构（不包含marker对象，只包含坐标数据）
        // 这些数据将用于kml-route-planning.js的buildKMLGraph函数
        if (typeof kmlLayers === 'undefined') {
            window.kmlLayers = [];
        }

        kmlData.forEach(layerData => {
            const layerMarkers = layerData.features.map(feature => {
                // 创建一个简化的marker对象，只包含必要的方法
                const mockMarker = {
                    getExtData: function() {
                        return {
                            type: feature.type,
                            name: feature.name,
                            description: feature.description
                        };
                    },
                    // 添加空的hide和show方法，因为导航页面不需要显示这些KML要素
                    hide: function() {
                        // 空实现，导航页面不显示KML要素
                    },
                    show: function() {
                        // 空实现，导航页面不显示KML要素
                    }
                };

                // 根据类型添加相应的方法
                if (feature.type === '点') {
                    mockMarker.getPosition = function() {
                        return {
                            lng: feature.coordinates[0],
                            lat: feature.coordinates[1]
                        };
                    };
                } else if (feature.type === '线') {
                    mockMarker.getPath = function() {
                        return feature.coordinates;
                    };
                }

                return mockMarker;
            });

            kmlLayers.push({
                id: layerData.id,
                name: layerData.name,
                visible: layerData.visible,
                markers: layerMarkers
            });
        });

        console.log('KML数据加载完成，图层数:', kmlLayers.length);
    } catch (e) {
        console.error('加载KML数据失败:', e);
    }
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

        let segResult = planKMLRoute(a, b);
        if (segResult && segResult.path && segResult.path.length >= 2) {
            // 拼接路径（避免重复当前段的起点）
            if (combinedPath.length > 0) {
                // 移除与上一段末尾重复的第一个点
                combinedPath = combinedPath.concat(segResult.path.slice(1));
            } else {
                combinedPath = segResult.path.slice();
            }
            totalDistance += (segResult.distance || 0);
        } else {
            console.warn('该段KML规划失败，使用直线段:', a, b);
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

// 隐藏所有KML线要素
function hideKMLLines() {
    if (!kmlLayers || kmlLayers.length === 0) {
        console.log('没有KML图层需要隐藏');
        return;
    }

    kmlLayers.forEach(function(layer) {
        if (!layer.visible) return;

        layer.markers.forEach(function(marker) {
            // 只隐藏线要素，保留点要素可见
            if (marker && typeof marker.getExtData === 'function') {
                const extData = marker.getExtData();
                if (extData && extData.type === '线') {
                    marker.hide();
                    console.log('隐藏KML线:', extData.name);
                } else if (extData && extData.type === '点') {
                    // 点要素也需要隐藏，只显示选中的起点和终点
                    marker.hide();
                }
            }
        });
    });
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

// 绘制KML路线
function drawKMLRoute(routeResult) {
    const path = routeResult.path;

    // 清除之前的路线
    if (routePolyline) {
        navigationMap.remove(routePolyline);
        routePolyline = null;
    }

    // 绘制路线（绿色线条）
    routePolyline = new AMap.Polyline({
        path: path,
        strokeColor: '#00C853',
        strokeWeight: 8,
        strokeOpacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 50,
        map: navigationMap
    });

    console.log('KML路线绘制完成，共', path.length, '个点');
}

// 绘制直线（备用方案）
function drawStraightLine(start, end) {
    // 清除之前的路线
    if (routePolyline) {
        navigationMap.remove(routePolyline);
        routePolyline = null;
    }

    routePolyline = new AMap.Polyline({
        path: [start, end],
        strokeColor: '#00C853',
        strokeWeight: 8,
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
                // 不在导航状态，直接返回
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

    // 添加途径点按钮
    const addWaypointBtn = document.getElementById('nav-add-waypoint-btn');
    if (addWaypointBtn) {
        addWaypointBtn.addEventListener('click', function() {
            console.log('添加途径点');
            addNavigationWaypoint('');
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
            cleanupMap();
            window.location.href = 'index.html';
        });
    }

    // 导航完成按钮
    const completeFinishBtn = document.getElementById('complete-finish-btn');
    if (completeFinishBtn) {
        completeFinishBtn.addEventListener('click', function() {
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
        // 清理“我的位置”与灰色轨迹
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

    // 启动模拟导航（创建移动标记、灰色路径并沿线移动）
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

    // 更新"XX米后"的提示
    const distanceAheadElem = document.getElementById('tip-distance-ahead');
    if (distanceAheadElem && nextTurnIndex > 0) {
        // 计算到下一个转向点的距离
        let distanceToTurn = 0;
        for (let i = currentNavigationIndex; i < nextTurnIndex; i++) {
            if (i + 1 < navigationPath.length) {
                distanceToTurn += calculateDistanceBetweenPoints(
                    navigationPath[i],
                    navigationPath[i + 1]
                );
            }
        }
        distanceAheadElem.textContent = Math.round(distanceToTurn);
    } else if (distanceAheadElem) {
        // 如果没有转向点，显示到终点的距离
        distanceAheadElem.textContent = Math.round(remainingDistance);
    }

    // 获取当前转向并更新图标
    const directionType = getNavigationDirection();
    updateDirectionIcon(directionType);
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

// 更新转向图标
function updateDirectionIcon(directionType) {
    const directionImg = document.getElementById('tip-direction-img');
    const actionText = document.getElementById('tip-action-text');

    const basePath = 'images/工地数字导航小程序切图/司机/2X/导航/';

    let iconPath = '';
    let actionName = '';

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

    if (directionImg) {
        directionImg.src = iconPath;
        directionImg.alt = actionName;
    }

    if (actionText) {
        actionText.textContent = actionName;
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
        clearInterval(navigationTimer); navigationTimer = null;
        if (gpsWatchId !== null && navigator.geolocation && typeof navigator.geolocation.clearWatch === 'function') {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
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
                const myIcon = new AMap.Icon({
                    size: new AMap.Size(30, 30),
                    image: MapConfig.markerStyles.currentLocation.icon,
                    imageSize: new AMap.Size(30, 30)
                });
                userMarker = new AMap.Marker({
                    position: curr,
                    icon: myIcon,
                    offset: new AMap.Pixel(-15, -15),
                    zIndex: 120,
                    angle: 0,
                    map: navigationMap
                });

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

            // 计算朝向并旋转
            if (lastGpsPos) {
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
    }

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

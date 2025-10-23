// route-planning.js
// 路线规划、途经点管理和导航功能（基于Dijkstra算法的KML路径规划）

let isNavigating = false;
let navigationMarker = null;
let traveledPolyline = null; // 已走路径（灰色）
let traveledPath = [];

function addWaypoint() {
    // 检查当前途径点数量（首页底部卡片中的途径点）
    const waypointsContainer = document.getElementById('waypoints-container');
    let currentCount = 0;
    if (waypointsContainer) {
        currentCount = waypointsContainer.querySelectorAll('.waypoint-input').length;
    }

    // 限制最多 2 个途经点
    if (currentCount >= 2) {
        alert('最多只能添加 2 个途经点');
        return;
    }

    // 保存当前路线规划数据到sessionStorage
    const startValue = document.getElementById('start-location')?.value || '';
    const endValue = document.getElementById('end-location')?.value || '';

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
    sessionStorage.setItem('pointSelectionReferrer', 'index.html');

    // 跳转到点位选择界面
    currentInputType = 'waypoint';
    window.location.href = 'point-selection.html';
}

function removeWaypoint(id) {
    var waypointElement = document.getElementById(id);
    if (waypointElement) {
        waypointElement.remove();
    }
}

function calculateRoute() {
    var start = document.getElementById('start-location').value;
    var end = document.getElementById('end-location').value;

    if (!start || !end) {
        alert('请选择起点和终点');
        return;
    }

    // 显示加载状态
    document.getElementById('route-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> 规划中...';
    document.getElementById('route-btn').disabled = true;

    // 使用 Dijkstra 算法进行 KML 路径规划
    performKMLOnlyRouting(start, end);
}

function performKMLOnlyRouting(start, end) {
    // 将起点和终点转换为坐标
    getCoordinatesFromAddress(start, function(startCoord) {
        if (startCoord) {
            getCoordinatesFromAddress(end, function(endCoord) {
                if (endCoord) {
                    // 尝试KML路径规划
                    const kmlRoute = planKMLRoute(startCoord, endCoord);

                    if (kmlRoute) {
                        // 成功使用KML路径
                        displayKMLRoute(kmlRoute);
                        showKMLRouteInfo(kmlRoute);

                        // 恢复按钮状态
                        document.getElementById('route-btn').innerHTML = '路线规划';
                        document.getElementById('route-btn').disabled = false;
                        document.getElementById('start-nav-btn').disabled = false;
                    } else {
                        // KML路径规划失败
                        showRouteFailureMessage();
                    }
                } else {
                    console.error('无法获取终点坐标:', end);
                    showRouteFailureMessage();
                }
            });
        } else {
            console.error('无法获取起点坐标:', start);
            showRouteFailureMessage();
        }
    });
}

function showRouteFailureMessage() {
    // 恢复按钮状态
    document.getElementById('route-btn').innerHTML = '路线规划';
    document.getElementById('route-btn').disabled = false;

    alert('路径规划失败：请确保已导入KML数据且起终点在路径网络范围内');
}

function getCoordinatesFromAddress(address, callback) {
    // 检查是否是搜索历史中的地点
    if (typeof searchHistory !== 'undefined' && searchHistory) {
        const historyItem = searchHistory.find(item => item.name === address);
        if (historyItem && historyItem.position) {
            // 确保返回标准的 [lng, lat] 数组格式
            let position = historyItem.position;
            if (Array.isArray(position) && position.length >= 2) {
                callback([position[0], position[1]]);
            } else if (position && position.lng !== undefined && position.lat !== undefined) {
                callback([position.lng, position.lat]);
            } else {
                console.error('搜索历史中的坐标格式无效:', position);
                callback(null);
            }
            return;
        }
    }

    // 检查是否是KML点
    if (kmlLayers && kmlLayers.length > 0) {
        for (const layer of kmlLayers) {
            if (!layer.visible) continue;

            for (const marker of layer.markers) {
                // 安全检查
                if (!marker || typeof marker.getExtData !== 'function') {
                    continue;
                }

                const extData = marker.getExtData();
                if (extData && extData.name === address) {
                    // 获取坐标
                    let position;
                    try {
                        if (typeof marker.getPosition === 'function') {
                            position = marker.getPosition();
                        }
                    } catch (e) {
                        console.error('获取marker位置失败:', e);
                        continue;
                    }

                    if (position) {
                        // 转换为数组格式 [lng, lat]
                        if (position.lng !== undefined && position.lat !== undefined) {
                            callback([position.lng, position.lat]);
                        } else if (Array.isArray(position) && position.length >= 2) {
                            callback(position);
                        } else {
                            callback(position);
                        }
                        return;
                    }
                }
            }
        }
    }

    // 如果都找不到，记录错误
    console.error('无法找到地址坐标，请确保该地点存在于KML数据或搜索历史中:', address);
    callback(null);
}

function showKMLRouteInfo(kmlRoute) {
    const distance = (kmlRoute.distance / 1000).toFixed(1);
    const time = Math.round(kmlRoute.distance / 50000 * 60); // 假设50km/h的速度

    // 创建路线信息显示
    const routeInfo = document.createElement('div');
    routeInfo.id = 'kml-route-info';
    routeInfo.style.cssText = `
        position: absolute;
        top: 80px;
        left: 20px;
        right: 20px;
        background: white;
        padding: 15px;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        font-size: 14px;
        border: 2px solid #00AA00;
    `;

    routeInfo.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-weight: bold; margin-bottom: 5px; color: #00AA00;">KML路径规划</div>
                <div style="color: #666;">${distance}公里 | 约${time}分钟</div>
            </div>
            <button id="close-kml-info" style="background: #ccc; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;">
                关闭
            </button>
        </div>
    `;

    document.getElementById('map-container').appendChild(routeInfo);

    // 添加关闭按钮事件
    document.getElementById('close-kml-info').addEventListener('click', function() {
        routeInfo.remove();
    });

    // 3秒后自动移除
    setTimeout(() => {
        if (routeInfo.parentNode) {
            routeInfo.remove();
        }
    }, 5000);
}



function startNavigation() {
    // 检查是否有KML路径
    if (!window.currentKMLRoute) {
        alert('请先规划路线');
        return;
    }

    if (!isNavigating) {
        // 开始导航
        startKMLNavigation();
    } else {
        // 停止导航
        stopNavigation();
    }
}

function startKMLNavigation() {
    if (!window.currentKMLRoute) {
        alert('请先规划KML路线');
        return;
    }

    isNavigating = true;
    document.getElementById('start-nav-btn').innerHTML = '<i class="fas fa-stop"></i> 停止导航';
    document.getElementById('route-btn').disabled = true;

    // 显示KML导航信息
    showKMLNavigationInfo();

    // 开始KML模拟导航
    startKMLSimulationNavigation(window.currentKMLRoute);
}

function showKMLNavigationInfo() {
    const navInfo = document.createElement('div');
    navInfo.id = 'kml-navigation-info';
    navInfo.style.cssText = `
        position: absolute;
        top: 80px;
        left: 20px;
        right: 20px;
        background: white;
        padding: 15px;
        border-radius: 12px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        z-index: 1000;
        font-size: 14px;
        border: 2px solid #00AA00;
    `;

    const distance = (window.currentKMLRoute.distance / 1000).toFixed(1);
    const time = Math.round(window.currentKMLRoute.distance / 50000 * 60);

    navInfo.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div style="font-weight: bold; margin-bottom: 5px; color: #00AA00;">KML导航中</div>
                <div style="color: #666;">${distance}公里 | ${time}分钟</div>
            </div>
            <button id="stop-kml-nav-btn" style="background: #ff4444; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer;">
                停止
            </button>
        </div>
    `;

    document.getElementById('map-container').appendChild(navInfo);

    // 添加停止按钮事件
    document.getElementById('stop-kml-nav-btn').addEventListener('click', stopNavigation);
}

function startKMLSimulationNavigation(kmlRoute) {
    const path = kmlRoute.path;
    let currentPointIndex = 0;

    // 创建导航车辆标记
    navigationMarker = new AMap.Marker({
        position: path[0],
        icon: new AMap.Icon({
            size: new AMap.Size(30, 30),
            image: createHeadingArrowIcon('#007bff'),
            imageSize: new AMap.Size(30, 30)
        }),
        map: map,
        // 箭头图标使用居中对齐，旋转围绕中心
        offset: new AMap.Pixel(-15, -15)
    });

    // 初始化已走路径（灰色）
    traveledPath = [path[0]];
    if (traveledPolyline) {
        map.remove(traveledPolyline);
    }
    traveledPolyline = new AMap.Polyline({
        path: traveledPath,
        strokeColor: '#B0B0B0',
        strokeWeight: 6,
        strokeOpacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
        zIndex: 30,
        map: map
    });

    // 清除之前的定时器
    if (window.navigationInterval) {
        clearInterval(window.navigationInterval);
    }

    // 开始模拟导航
    window.navigationInterval = setInterval(function() {
        if (currentPointIndex < path.length - 1) {
            currentPointIndex++;

            // 更新车辆位置
            navigationMarker.setPosition(path[currentPointIndex]);

            // 记录已走路径并更新灰线路径
            traveledPath.push(path[currentPointIndex]);
            if (traveledPolyline) {
                traveledPolyline.setPath(traveledPath);
            }

            // 移动地图中心到车辆位置
            map.setCenter(path[currentPointIndex]);

            // 计算方向
            if (currentPointIndex < path.length - 1) {
                const currentPos = path[currentPointIndex];
                const nextPos = path[currentPointIndex + 1];
                const angle = calculateBearing(currentPos, nextPos);
                navigationMarker.setAngle(angle);
            }

            // 更新剩余信息
            updateKMLRemainingInfo(currentPointIndex, path.length);

        } else {
            // 到达目的地
            clearInterval(window.navigationInterval);
            alert('已到达目的地！');
            stopNavigation();

            // 显示到达标记
            const endMarker = new AMap.Marker({
                position: path[path.length - 1],
                icon: new AMap.Icon({
                    size: new AMap.Size(30, 38),
                    image: 'images/工地数字导航小程序切图/司机/2X/地图icon/终点.png',
                    imageSize: new AMap.Size(30, 38)
                }),
                map: map,
                offset: new AMap.Pixel(-15, -38)
            });
        }
    }, 800); // 每800毫秒移动一次，比较适合KML路径
}

function updateKMLRemainingInfo(currentIndex, totalPoints) {
    const navInfo = document.getElementById('kml-navigation-info');
    if (navInfo && window.currentKMLRoute) {
        const progress = Math.round((currentIndex / totalPoints) * 100);
        const totalDistance = (window.currentKMLRoute.distance / 1000).toFixed(1);
        const totalTime = Math.round(window.currentKMLRoute.distance / 50000 * 60);

        const remainingTime = Math.round(totalTime * (1 - currentIndex / totalPoints));
        const remainingDistance = (totalDistance * (1 - currentIndex / totalPoints)).toFixed(1);

        const infoDiv = navInfo.querySelector('div > div');
        infoDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px; color: #00AA00;">KML导航中 - ${progress}%</div>
            <div style="color: #666;">剩余: ${remainingDistance}公里 | ${remainingTime}分钟</div>
        `;
    }
}


function stopNavigation() {
    isNavigating = false;
    document.getElementById('start-nav-btn').innerHTML = '开始导航';
    document.getElementById('route-btn').disabled = false;

    // 隐藏KML导航信息
    const kmlNavInfo = document.getElementById('kml-navigation-info');
    if (kmlNavInfo) {
        kmlNavInfo.remove();
    }

    // 清除导航标记
    if (navigationMarker) {
        map.remove(navigationMarker);
        navigationMarker = null;
    }

    // 清除已走路径灰线
    if (traveledPolyline) {
        map.remove(traveledPolyline);
        traveledPolyline = null;
        traveledPath = [];
    }

    // 停止模拟导航
    if (window.navigationInterval) {
        clearInterval(window.navigationInterval);
        window.navigationInterval = null;
    }
}





function calculateBearing(start, end) {
    // 计算两点之间的方位角（以正北为0°，顺时针0..360）
    // 使用与导航页一致的算法，避免左右判断不一致
    const lng1 = start[0], lat1 = start[1];
    const lng2 = end[0],   lat2 = end[1];

    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
}

// 生成朝向箭头的SVG图标（base64）
function createHeadingArrowIcon(color) {
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
        return 'data:image/svg+xml;base64,' + btoa(svg);
}



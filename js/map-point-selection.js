// map-point-selection.js
// 地图选点页面逻辑

// 禁用自动定位追踪（点位选择页面不需要持续追踪）
window.disableLocationTracking = true;

// 全局变量
let selectedPoint = null;  // 当前选中的点
let selectedPolygon = null;  // 当前选中的面
let mapSelectionCurrentPosition = null;  // 当前位置（使用不同的变量名避免冲突）
let highlightedMarker = null;  // 高亮的marker
let highlightedPolygonOverlay = null;  // 当前高亮的面overlay

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('地图选点页面加载完成');

    // 检查登录状态
    if (!checkLoginStatus()) {
        return;
    }

    // 初始化地图
    initMap();

    // 初始化事件监听
    initEventListeners();

    // 加载地图数据（从API加载）
    loadMapDataFromAPIForSelection();

    // 获取一次位置用于距离计算（不持续追踪）
    getOnceLocation();
});

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const currentUser = sessionStorage.getItem('currentUser');

    if (!isLoggedIn || !currentUser) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// 初始化事件监听
function initEventListeners() {
    // 搜索框
    const searchInput = document.getElementById('map-selection-search-input');
    const searchResults = document.getElementById('map-selection-search-results');
    const clearBtn = document.getElementById('map-selection-clear-btn');

    if (searchInput) {
        let searchTimer;

        // 输入时实时搜索
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            const keyword = this.value.trim();

            // 显示/隐藏清除按钮
            if (clearBtn) {
                clearBtn.style.display = keyword ? 'flex' : 'none';
            }

            searchTimer = setTimeout(() => {
                searchPointsAndPolygons(keyword);
            }, 300);
        });

        // 获得焦点时，如果有值则显示搜索结果
        searchInput.addEventListener('focus', function() {
            const keyword = this.value.trim();
            if (keyword) {
                searchPointsAndPolygons(keyword);
            }
        });

        // 回车搜索
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const keyword = this.value.trim();
                searchPointsAndPolygons(keyword);
            }
        });
    }

    // 清除按钮
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (searchInput) {
                searchInput.value = '';
                clearBtn.style.display = 'none';
            }
            if (searchResults) {
                searchResults.style.display = 'none';
                searchResults.innerHTML = '';
            }
        });
    }

    // 点击页面其他地方隐藏搜索结果
    document.addEventListener('click', function(e) {
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer && !searchContainer.contains(e.target)) {
            if (searchResults) {
                searchResults.style.display = 'none';
            }
        }
    });

    // 点信息面板 - 关闭按钮
    const pointCloseBtn = document.getElementById('panel-close-btn');
    if (pointCloseBtn) {
        pointCloseBtn.addEventListener('click', closePanels);
    }

    // 点信息面板 - 路线按钮
    const pointRouteBtn = document.getElementById('point-route-btn');
    if (pointRouteBtn) {
        pointRouteBtn.addEventListener('click', function() {
            if (selectedPoint) {
                selectPointForRoute(selectedPoint);
            }
        });
    }

    // 点信息面板 - 导航按钮
    const pointNavBtn = document.getElementById('point-nav-btn');
    if (pointNavBtn) {
        pointNavBtn.addEventListener('click', function() {
            if (selectedPoint) {
                navigateToPoint(selectedPoint);
            }
        });
    }

    // 面信息面板 - 关闭按钮
    const polygonCloseBtn = document.getElementById('panel-polygon-close-btn');
    if (polygonCloseBtn) {
        polygonCloseBtn.addEventListener('click', closePanels);
    }
}

// 点击点时的处理
function handlePointClick(point, marker) {
    console.log('点击点:', point.name);

    // 恢复之前高亮的面（如果有）
    if (highlightedPolygonOverlay && highlightedPolygonOverlay._originalStyle) {
        console.log('[点击点] 恢复之前高亮的面');
        highlightedPolygonOverlay.setOptions({
            fillColor: highlightedPolygonOverlay._originalStyle.fillColor,
            fillOpacity: highlightedPolygonOverlay._originalStyle.fillOpacity,
            strokeColor: highlightedPolygonOverlay._originalStyle.strokeColor,
            strokeWeight: highlightedPolygonOverlay._originalStyle.strokeWeight,
            strokeOpacity: highlightedPolygonOverlay._originalStyle.strokeOpacity
        });
        highlightedPolygonOverlay = null;
    }

    // 保存选中的点
    selectedPoint = point;
    selectedPolygon = null;

    // 高亮marker
    highlightMarker(marker);

    // 计算距离
    const distance = calculateDistance(point.geometry.coordinates);

    // 显示点信息面板
    showPointPanel(point, distance);
}

// 点击面时的处理
function handlePolygonClick(polygon, polygonOverlay) {
    console.log('点击面:', polygon.name);

    // 恢复之前高亮的marker（如果有）
    if (highlightedMarker) {
        console.log('[点击面] 恢复之前高亮的点');
        restoreMarkerState(highlightedMarker);
        highlightedMarker = null;
    }

    // 保存选中的面和它的overlay
    selectedPolygon = polygon;
    selectedPolygon.overlay = polygonOverlay;
    selectedPoint = null;

    // 高亮面
    highlightPolygon(polygonOverlay);

    // 获取面内的点
    const pointsInPolygon = getPointsInPolygon(polygon);

    // 显示面信息面板
    showPolygonPanel(polygon, pointsInPolygon);
}

// 高亮marker（使用DOM操作切换图标状态）
function highlightMarker(marker) {
    console.log('[高亮marker] 开始高亮点位');

    // 恢复之前高亮的marker
    if (highlightedMarker && highlightedMarker !== marker) {
        console.log('[高亮marker] 恢复之前的高亮点位');
        restoreMarkerState(highlightedMarker);
    }

    // 切换当前marker为up状态
    const markerDom = marker.getContentDom();
    if (markerDom) {
        const iconDiv = markerDom.querySelector('.kml-icon-marker');

        if (iconDiv) {
            const currentState = iconDiv.dataset.state;
            const iconType = iconDiv.dataset.iconType || 'building';
            const upIconPath = iconDiv.dataset.upIcon;

            console.log('[高亮marker] 当前状态:', currentState, '图标类型:', iconType, 'upIconPath:', upIconPath);

            // 强制切换为up状态（无论当前状态是什么）
            const newIconPath = (upIconPath && upIconPath.startsWith('images/'))
                ? upIconPath
                : getIconPath(iconType, 'up');

            const img = iconDiv.querySelector('img');
            if (img) {
                img.src = newIconPath;
                iconDiv.dataset.state = 'up';
                // 放大为选中大小：40px
                iconDiv.style.width = '40px';
                iconDiv.style.height = '40px';
                console.log('[高亮marker] 已切换为up状态:', newIconPath);
            } else {
                console.error('[高亮marker] 未找到img元素');
            }
        } else {
            console.error('[高亮marker] 未找到.kml-icon-marker元素');
        }
    } else {
        console.error('[高亮marker] markerDom为空');
    }

    highlightedMarker = marker;
}

// 恢复marker为默认状态
function restoreMarkerState(marker) {
    if (!marker) return;

    console.log('[恢复marker] 恢复点位为默认状态');

    const markerDom = marker.getContentDom();
    if (markerDom) {
        const iconDiv = markerDom.querySelector('.kml-icon-marker');

        if (iconDiv) {
            const currentState = iconDiv.dataset.state;
            const iconType = iconDiv.dataset.iconType || 'building';
            const downIconPath = iconDiv.dataset.downIcon;

            if (currentState === 'up') {
                // 恢复为down状态
                const newIconPath = (downIconPath && downIconPath.startsWith('images/'))
                    ? downIconPath
                    : getIconPath(iconType, 'down');

                const img = iconDiv.querySelector('img');
                if (img) {
                    img.src = newIconPath;
                    iconDiv.dataset.state = 'down';
                    // 恢复为默认大小：24px
                    iconDiv.style.width = '24px';
                    iconDiv.style.height = '24px';
                    console.log('[恢复marker] 已恢复为down状态:', newIconPath);
                }
            }
        }
    }
}

// 获取图标路径（与kml-handler.js保持一致）
function getIconPath(iconType, state = 'down') {
    const iconMap = {
        'entrance': '出入口',
        'yard': '堆场',
        'workshop': '加工区',
        'building': '建筑'
    };

    const iconName = iconMap[iconType] || iconMap['building'];
    // 交换状态：原来的up现在作为默认状态，原来的down现在作为选中状态
    const actualState = state === 'up' ? 'down' : 'up';
    return `images/工地数字导航小程序切图/图标/${iconName}-${actualState}.png`;
}

// 高亮面
function highlightPolygon(polygonOverlay) {
    console.log('[高亮面] 开始高亮:', polygonOverlay);

    // 先恢复之前高亮的面（如果存在且不是当前要高亮的面）
    if (highlightedPolygonOverlay && highlightedPolygonOverlay !== polygonOverlay) {
        console.log('[高亮面] 恢复之前的高亮面');
        // 从overlay对象本身获取保存的原始样式
        if (highlightedPolygonOverlay._originalStyle) {
            highlightedPolygonOverlay.setOptions({
                fillColor: highlightedPolygonOverlay._originalStyle.fillColor,
                fillOpacity: highlightedPolygonOverlay._originalStyle.fillOpacity,
                strokeColor: highlightedPolygonOverlay._originalStyle.strokeColor,
                strokeWeight: highlightedPolygonOverlay._originalStyle.strokeWeight,
                strokeOpacity: highlightedPolygonOverlay._originalStyle.strokeOpacity
            });
            console.log('[高亮面] 已恢复原始样式:', highlightedPolygonOverlay._originalStyle);
        }
    }

    // 如果当前polygon还没有保存过原始样式，则保存
    if (!polygonOverlay._originalStyle) {
        const options = polygonOverlay.getOptions();
        polygonOverlay._originalStyle = {
            fillColor: options.fillColor,
            fillOpacity: options.fillOpacity,
            strokeColor: options.strokeColor,
            strokeWeight: options.strokeWeight,
            strokeOpacity: options.strokeOpacity
        };
        console.log('[高亮面] 保存原始样式到polygon对象:', polygonOverlay._originalStyle);
    }

    // 设置高亮样式
    // 填充：#237CF3，透明度20%
    // 边框：#237CF3，透明度60%，粗细1px
    polygonOverlay.setOptions({
        fillColor: '#237CF3',
        fillOpacity: 0.2,
        strokeColor: '#237CF3',
        strokeOpacity: 0.6,
        strokeWeight: 1
    });

    console.log('[高亮面] 已设置高亮样式');

    // 更新当前高亮的overlay引用
    highlightedPolygonOverlay = polygonOverlay;
}

// 显示点信息面板
function showPointPanel(point, distance) {
    // 隐藏其他面板
    document.getElementById('panel-polygon-info').style.display = 'none';

    // 设置点信息
    document.getElementById('point-name').textContent = point.name;
    document.getElementById('point-distance').textContent = `距离 ${distance} 米`;

    // 显示点面板
    document.getElementById('panel-point-info').style.display = 'block';

    // 激活面板（滑入）
    const panel = document.getElementById('map-selection-panel');
    setTimeout(() => panel.classList.add('active'), 10);
}

// 显示面信息面板
function showPolygonPanel(polygon, pointsInPolygon) {
    // 隐藏其他面板
    document.getElementById('panel-point-info').style.display = 'none';

    // 设置面信息
    document.getElementById('polygon-name').textContent = polygon.name;

    // 计算面中心距离
    const center = getPolygonCenter(polygon);
    const distance = calculateDistance(center);
    document.getElementById('polygon-area').textContent = `距离 ${distance} 米`;

    // 渲染面内点列表
    renderPointsList(pointsInPolygon);

    // 显示面面板
    document.getElementById('panel-polygon-info').style.display = 'block';

    // 激活面板（滑入）
    const panel = document.getElementById('map-selection-panel');
    setTimeout(() => panel.classList.add('active'), 10);
}

// 渲染面内点列表
function renderPointsList(points) {
    const listContainer = document.getElementById('panel-points-list');
    listContainer.innerHTML = '';

    if (!points || points.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">该区域内暂无点位</div>';
        return;
    }

    points.forEach(point => {
        const distance = calculateDistance(point.geometry.coordinates);

        const item = document.createElement('div');
        item.className = 'panel-point-item';
        item.innerHTML = `
            <div class="panel-point-info">
                <div class="panel-point-name">${point.name}</div>
                <div class="panel-point-distance">${distance}m</div>
            </div>
            <div class="panel-point-actions">
                <button class="panel-point-btn panel-point-btn-route" data-point-name="${point.name}">
                    <img src="images/工地数字导航小程序切图/司机/2X/导航/路线.png" alt="路线">
                    <span>路线</span>
                </button>
                <button class="panel-point-btn panel-point-btn-nav" data-point-name="${point.name}">
                    <img src="images/工地数字导航小程序切图/司机/2X/导航/导航.png" alt="导航">
                    <span>导航</span>
                </button>
            </div>
        `;

        // 绑定按钮事件
        const routeBtn = item.querySelector('.panel-point-btn-route');
        const navBtn = item.querySelector('.panel-point-btn-nav');

        routeBtn.addEventListener('click', () => selectPointForRoute(point));
        navBtn.addEventListener('click', () => navigateToPoint(point));

        listContainer.appendChild(item);
    });
}

// 关闭面板
function closePanels() {
    const panel = document.getElementById('map-selection-panel');
    panel.classList.remove('active');

    // 恢复marker（使用DOM操作）
    if (highlightedMarker) {
        restoreMarkerState(highlightedMarker);
        highlightedMarker = null;
    }

    // 恢复面样式（包括边框）
    if (highlightedPolygonOverlay && highlightedPolygonOverlay._originalStyle) {
        console.log('[关闭面板] 恢复面样式');
        highlightedPolygonOverlay.setOptions({
            fillColor: highlightedPolygonOverlay._originalStyle.fillColor,
            fillOpacity: highlightedPolygonOverlay._originalStyle.fillOpacity,
            strokeColor: highlightedPolygonOverlay._originalStyle.strokeColor,
            strokeWeight: highlightedPolygonOverlay._originalStyle.strokeWeight,
            strokeOpacity: highlightedPolygonOverlay._originalStyle.strokeOpacity
        });
        highlightedPolygonOverlay = null;
    }

    selectedPoint = null;
    selectedPolygon = null;
}

// 选择点用于路线规划
function selectPointForRoute(point) {
    console.log('选择点用于路线规划:', point.name);

    // 从sessionStorage获取当前输入类型，默认为终点
    const routeData = sessionStorage.getItem('routePlanningData');
    let inputType = 'end';  // 默认填充到终点

    if (routeData) {
        try {
            const data = JSON.parse(routeData);
            inputType = data.inputType || 'end';
        } catch (e) {
            console.error('解析路线数据失败:', e);
        }
    }

    // 保存选择的点到sessionStorage
    const newRouteData = JSON.parse(sessionStorage.getItem('routePlanningData') || '{}');

    // 根据输入类型填充相应的字段
    if (inputType === 'start') {
        newRouteData.startLocation = point.name;
        newRouteData.startPosition = point.geometry.coordinates;
    } else if (inputType === 'end') {
        newRouteData.endLocation = point.name;
        newRouteData.endPosition = point.geometry.coordinates;
    } else if (inputType === 'waypoint') {
        // 添加途径点（保存为字符串，位置信息在完成路线选择时解析）
        if (!newRouteData.waypoints) {
            newRouteData.waypoints = [];
        }
        newRouteData.waypoints.push(point.name);
    }

    sessionStorage.setItem('routePlanningData', JSON.stringify(newRouteData));

    // 跳转到点位选择界面
    window.location.href = 'point-selection.html';
}

// 导航到点
function navigateToPoint(point) {
    console.log('开始导航到:', point.name);

    // 使用当前页面的位置变量，如果没有则尝试从缓存获取
    let currentPos = mapSelectionCurrentPosition || [0, 0];

    if (!mapSelectionCurrentPosition) {
        const savedPosition = sessionStorage.getItem('currentPosition');
        if (savedPosition) {
            try {
                currentPos = JSON.parse(savedPosition);
            } catch (e) {
                console.warn('无法解析当前位置:', e);
            }
        }
    }

    // 从sessionStorage获取当前路线数据
    const routeDataStr = sessionStorage.getItem('routePlanningData');
    let routeData = {};
    let inputType = 'end';  // 默认填充到终点

    if (routeDataStr) {
        try {
            routeData = JSON.parse(routeDataStr);
            inputType = routeData.inputType || 'end';
        } catch (e) {
            console.error('解析路线数据失败:', e);
        }
    }

    // 根据输入类型和当前路线状态填充数据
    if (inputType === 'start') {
        routeData.startLocation = point.name;
        routeData.startPosition = point.geometry.coordinates;
    } else if (inputType === 'waypoint') {
        // 添加途径点（保存为字符串，在构建navigationData时再添加位置）
        if (!routeData.waypoints) {
            routeData.waypoints = [];
        }
        routeData.waypoints.push(point.name);

        // 保存当前点的位置信息，用于后续构建navigationData
        if (!routeData.waypointPositions) {
            routeData.waypointPositions = {};
        }
        routeData.waypointPositions[point.name] = point.geometry.coordinates;
    } else {
        // 默认填充到终点
        routeData.endLocation = point.name;
        routeData.endPosition = point.geometry.coordinates;
    }

    // 如果没有起点，设置为"我的位置"
    if (!routeData.startLocation) {
        routeData.startLocation = '我的位置';
        routeData.startPosition = currentPos;
    }

    // 如果没有终点，把选中的点作为终点
    if (!routeData.endLocation) {
        routeData.endLocation = point.name;
        routeData.endPosition = point.geometry.coordinates;
    }

    // 保存路线规划数据
    sessionStorage.setItem('routePlanningData', JSON.stringify(routeData));

    // 准备完整的导航路线数据
    const navigationData = {
        start: {
            name: routeData.startLocation,
            position: routeData.startPosition || currentPos
        },
        end: {
            name: routeData.endLocation,
            position: routeData.endPosition || point.geometry.coordinates
        },
        waypoints: routeData.waypoints || []
    };

    // 保存到sessionStorage
    sessionStorage.setItem('navigationRoute', JSON.stringify(navigationData));

    console.log('导航数据已准备:', navigationData);

    // 直接跳转到导航页面
    window.location.href = 'navigation.html';
}

// 计算距离
function calculateDistance(targetCoords) {
    // 使用当前页面的位置变量
    if (!mapSelectionCurrentPosition || !targetCoords) {
        return '---';
    }

    try {
        const [lng1, lat1] = mapSelectionCurrentPosition;
        const [lng2, lat2] = targetCoords;

        // 使用Haversine公式计算距离
        const R = 6371e3; // 地球半径（米）
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        const distance = R * c;
        return Math.round(distance);
    } catch (e) {
        console.warn('计算距离失败:', e);
        return '---';
    }
}

// 获取面的中心点
function getPolygonCenter(polygon) {
    const coords = polygon.geometry.coordinates;
    if (!coords || coords.length === 0) return [0, 0];

    let sumLng = 0, sumLat = 0;
    coords.forEach(coord => {
        sumLng += coord[0];
        sumLat += coord[1];
    });

    return [sumLng / coords.length, sumLat / coords.length];
}

// 获取面内的点（通过polygon_id字段匹配）
function getPointsInPolygon(polygon) {
    // 从全局kmlData中获取所有点
    if (!window.kmlData || !window.kmlData.features) {
        return [];
    }

    const allFeatures = window.kmlData.features;
    const points = allFeatures.filter(f => f.geometry.type === 'point');

    // 获取面的ID
    const polygonId = polygon.properties?.id;

    if (!polygonId) {
        console.warn('[获取面内点] 面没有ID，无法匹配点', polygon);
        return [];
    }

    // 通过polygon_id字段匹配点
    const matchedPoints = points.filter(point => {
        const pointPolygonId = point.properties?.polygon_id;

        // 匹配条件：点的polygon_id等于面的id
        const isMatched = pointPolygonId === polygonId;

        if (isMatched) {
            console.log('[获取面内点] 匹配到点:', point.name, '点的polygon_id:', pointPolygonId, '面ID:', polygonId);
        }

        return isMatched;
    });

    console.log(`[获取面内点] 面"${polygon.name}"(ID:${polygonId}) 匹配到 ${matchedPoints.length} 个点`);

    return matchedPoints;
}

// 搜索点和面（搜索所有地图数据，不仅是KML）
function searchPointsAndPolygons(keyword) {
    const searchResults = document.getElementById('map-selection-search-results');

    if (!searchResults) {
        console.error('搜索结果容器不存在');
        return;
    }

    // 如果关键词为空，隐藏搜索结果
    if (!keyword || keyword.trim() === '') {
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
        return;
    }

    const lowerKeyword = keyword.toLowerCase().trim();
    const matches = [];

    // 从所有kmlLayers中搜索（包括API加载的数据）
    if (window.kmlLayers && window.kmlLayers.length > 0) {
        window.kmlLayers.forEach(layer => {
            if (!layer.visible || !layer.features) return;

            layer.features.forEach(feature => {
                const name = feature.name ? feature.name.toLowerCase() : '';
                if (name.includes(lowerKeyword)) {
                    matches.push({
                        ...feature,
                        source: layer.name || 'API数据'
                    });
                }
            });
        });
    }

    console.log('搜索结果:', matches.length, '个匹配项');

    // 清空之前的结果
    searchResults.innerHTML = '';

    if (matches.length === 0) {
        searchResults.innerHTML = '<div class="search-result-item" style="justify-content: center; color: #999;">未找到匹配的地点</div>';
        searchResults.style.display = 'block';
        return;
    }

    // 分组显示：先显示点，再显示面
    const points = matches.filter(m => m.geometry && m.geometry.type === 'point');
    const polygons = matches.filter(m => m.geometry && m.geometry.type === 'polygon');

    // 渲染点
    if (points.length > 0) {
        points.forEach(match => {
            const item = createSearchResultItem(match, '点');
            searchResults.appendChild(item);
        });
    }

    // 渲染面
    if (polygons.length > 0) {
        polygons.forEach(match => {
            const item = createSearchResultItem(match, '面');
            searchResults.appendChild(item);
        });
    }

    // 显示搜索结果
    searchResults.style.display = 'block';
}

// 创建搜索结果项
function createSearchResultItem(match, type) {
    const item = document.createElement('div');
    item.className = 'search-result-item';

    // 计算距离
    let distanceText = '';
    if (match.geometry.type === 'point' && match.geometry.coordinates) {
        const distance = calculateDistance(match.geometry.coordinates);
        distanceText = distance !== '---' ? `${distance}m` : '';
    } else if (match.geometry.type === 'polygon') {
        const center = getPolygonCenter(match);
        const distance = calculateDistance(center);
        distanceText = distance !== '---' ? `${distance}m` : '';
    }

    item.innerHTML = `
        <div class="result-info">
            <div class="result-name">${match.name}</div>
            ${distanceText ? `<div class="result-distance">${distanceText}</div>` : ''}
        </div>
        <div class="result-actions">
            <button class="result-action-btn route-action" title="路线">
                <img src="images/工地数字导航小程序切图/司机/2X/导航/路线.png" alt="路线">
                <span>路线</span>
            </button>
            <button class="result-action-btn nav-action" title="导航">
                <img src="images/工地数字导航小程序切图/司机/2X/导航/导航.png" alt="导航">
                <span>导航</span>
            </button>
        </div>
    `;

    // 绑定事件
    const routeBtn = item.querySelector('.route-action');
    const navBtn = item.querySelector('.nav-action');

    // 路线规划按钮
    routeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleRouteAction(match);
    });

    // 导航按钮
    navBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleNavAction(match);
    });

    // 点击整个项目
    item.addEventListener('click', function() {
        handleSearchItemClick(match);
    });

    return item;
}

// 处理路线规划操作
function handleRouteAction(match) {
    console.log('规划路线到:', match.name);

    if (match.geometry.type === 'point') {
        selectPointForRoute({
            name: match.name,
            geometry: match.geometry,
            description: match.description || ''
        });
    } else if (match.geometry.type === 'polygon') {
        // 面的中心点作为目的地
        const center = getPolygonCenter(match);
        selectPointForRoute({
            name: match.name,
            geometry: {
                type: 'point',
                coordinates: center
            },
            description: match.description || ''
        });
    }
}

// 处理导航操作
function handleNavAction(match) {
    console.log('开始导航到:', match.name);

    if (match.geometry.type === 'point') {
        navigateToPoint({
            name: match.name,
            geometry: match.geometry,
            description: match.description || ''
        });
    } else if (match.geometry.type === 'polygon') {
        // 面的中心点作为目的地
        const center = getPolygonCenter(match);
        navigateToPoint({
            name: match.name,
            geometry: {
                type: 'point',
                coordinates: center
            },
            description: match.description || ''
        });
    }
}

// 处理搜索项点击
function handleSearchItemClick(match) {
    // 清空搜索框
    const searchInput = document.getElementById('map-selection-search-input');
    const clearBtn = document.getElementById('map-selection-clear-btn');
    if (searchInput) {
        searchInput.value = '';
    }
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }

    // 隐藏搜索结果
    const searchResults = document.getElementById('map-selection-search-results');
    if (searchResults) {
        searchResults.style.display = 'none';
    }

    // 定位到该位置并放大地图两级
    if (match.geometry.type === 'point') {
        const currentZoom = map.getZoom();
        map.setZoomAndCenter(currentZoom + 2, match.geometry.coordinates);
        console.log('[地图选点-搜索] 放大地图两级:', currentZoom, '->', currentZoom + 2);

        // 等待地图缩放完成后再触发marker点击
        setTimeout(() => {
            // 查找对应的marker并触发点击
            findAndClickMarker(match);
        }, 300);
    } else if (match.geometry.type === 'polygon') {
        const center = getPolygonCenter(match);
        const currentZoom = map.getZoom();
        map.setZoomAndCenter(currentZoom + 2, center);
        console.log('[地图选点-搜索] 放大地图两级:', currentZoom, '->', currentZoom + 2);

        // 等待地图缩放完成后再触发polygon点击
        setTimeout(() => {
            // 查找对应的polygon并触发点击
            findAndClickPolygon(match);
        }, 300);
    }
}

// 查找并点击对应的marker
function findAndClickMarker(feature) {
    console.log('[findAndClickMarker] 开始查找marker:', feature.name);

    if (!window.kmlLayers || window.kmlLayers.length === 0) {
        console.warn('[findAndClickMarker] 没有KML图层');
        return;
    }

    console.log('[findAndClickMarker] KML图层数量:', window.kmlLayers.length);

    for (const layer of window.kmlLayers) {
        if (!layer.visible || !layer.markers) {
            console.log('[findAndClickMarker] 跳过图层（不可见或无markers）');
            continue;
        }

        console.log('[findAndClickMarker] 检查图层，markers数量:', layer.markers.length);

        for (const marker of layer.markers) {
            if (!marker || typeof marker.getExtData !== 'function') continue;

            const extData = marker.getExtData();
            if (extData) {
                console.log('[findAndClickMarker] 检查marker:', extData.name, '类型:', extData.type);

                if (extData.name === feature.name && extData.type === '点') {
                    console.log('[findAndClickMarker] ✓ 找到匹配的marker:', feature.name);
                    // 触发handlePointClick
                    if (typeof window.handleMapPointClick === 'function') {
                        console.log('[findAndClickMarker] 调用 handleMapPointClick');
                        window.handleMapPointClick(feature, marker);
                    } else {
                        console.error('[findAndClickMarker] window.handleMapPointClick 不是函数');
                    }
                    return;
                }
            }
        }
    }

    console.warn('[findAndClickMarker] ✗ 未找到匹配的marker:', feature.name);
}

// 查找并点击对应的polygon
function findAndClickPolygon(feature) {
    if (!window.kmlLayers || window.kmlLayers.length === 0) {
        console.warn('没有KML图层');
        return;
    }

    for (const layer of window.kmlLayers) {
        if (!layer.visible || !layer.markers) continue;

        for (const marker of layer.markers) {
            if (!marker || typeof marker.getExtData !== 'function') continue;

            const extData = marker.getExtData();
            if (extData && extData.name === feature.name && extData.type === '面') {
                // 找到了对应的polygon overlay
                // 构造完整的feature对象并触发点击
                const polygonFeature = {
                    name: feature.name,
                    geometry: feature.geometry,
                    description: feature.description || ''
                };

                if (typeof window.handleMapPolygonClick === 'function') {
                    window.handleMapPolygonClick(polygonFeature, marker);
                }
                return;
            }
        }
    }
}

// 导出函数供全局使用
window.handleMapPointClick = handlePointClick;
window.handleMapPolygonClick = handlePolygonClick;

/**
 * 从API加载地图数据（点、线、面）
 * 适用于点位选择页面，不启动定位追踪
 */
async function loadMapDataFromAPIForSelection() {
    try {
        console.log('[选点页-API加载] 开始从API加载地图数据...');

        // 禁用自动聚焦
        if (typeof disableAutoCenter !== 'undefined') {
            disableAutoCenter = true;
            console.log('[选点页-API加载] 已禁用自动聚焦');
        }

        // 1. 获取项目选择信息
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

        let projectId = null;
        let projectName = '所有项目';
        let projectCenter = null;

        if (projectSelection) {
            const selection = JSON.parse(projectSelection);
            projectName = selection.project;

            const userProjects = currentUser.projects || [];
            const selectedProject = userProjects.find(p => p.projectName === projectName);

            if (selectedProject) {
                projectId = selectedProject.projectCode || selectedProject.id;
                if (selectedProject.longitude && selectedProject.latitude) {
                    projectCenter = [selectedProject.longitude, selectedProject.latitude];
                }
                console.log('[选点页-API加载] 选择的项目:', {
                    name: projectName,
                    id: projectId,
                    center: projectCenter
                });
            }
        }

        // 2. 准备请求headers
        const baseURL = 'https://dmap.cscec3bxjy.cn/api/map';
        const headers = {
            'Content-Type': 'application/json'
        };

        // 3. 获取当前启用的地图版本号
        if (!projectId) {
            console.warn('[选点页-API加载] 没有项目ID，无法获取地图');
            alert('请先选择项目');
            return;
        }

        let versionId = null;
        try {
            console.log('[选点页-API加载] 获取项目地图版本...');
            const versionRes = await fetch(`${baseURL}/map-versions/project/${projectId}/active`, { headers });

            if (versionRes.ok) {
                const versionData = await versionRes.json();
                console.log('[选点页-API加载] 版本信息:', versionData);

                if (versionData.code === 200 && versionData.data) {
                    versionId = versionData.data.MapVersion_Id || versionData.data.id;
                    console.log('[选点页-API加载] 当前启用版本ID:', versionId);
                }
            }
        } catch (e) {
            console.warn('[选点页-API加载] 获取版本信息失败:', e);
        }

        if (!versionId) {
            console.warn('[选点页-API加载] 该项目没有启用的地图版本');
            alert('该项目暂无地图数据');

            if (projectCenter && map) {
                console.log('[选点页-API加载] 设置地图中心为项目位置:', projectCenter);
                map.setCenter(projectCenter);
                map.setZoom(15);
            }
            return;
        }

        // 4. 构建请求URL
        let pointsUrl = `${baseURL}/points?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;
        let polylinesUrl = `${baseURL}/polylines?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;
        let polygonsUrl = `${baseURL}/polygons?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;

        console.log('[选点页-API加载] 请求URL:', { pointsUrl, polylinesUrl, polygonsUrl });

        // 5. 并行请求点、线、面数据
        const [pointsRes, polylinesRes, polygonsRes] = await Promise.all([
            fetch(pointsUrl, { headers }),
            fetch(polylinesUrl, { headers }),
            fetch(polygonsUrl, { headers })
        ]);

        if (!pointsRes.ok || !polylinesRes.ok || !polygonsRes.ok) {
            console.error('[选点页-API加载] API请求失败');
            throw new Error('API请求失败');
        }

        // 6. 解析数据
        const pointsData = await pointsRes.json();
        const polylinesData = await polylinesRes.json();
        const polygonsData = await polygonsRes.json();

        let points = pointsData.data?.list || pointsData.data || [];
        let polylines = polylinesData.data?.list || polylinesData.data || [];
        let polygons = polygonsData.data?.list || polygonsData.data || [];

        // 过滤数据：只保留当前版本的数据
        points = points.filter(point => {
            const versionField = point.map_version_id || point.MapVersion_Id || point.version_id;
            if (!versionField) return true;
            return versionField == versionId;
        });

        polylines = polylines.filter(line => {
            if (!line.map_version_id) return true;
            return line.map_version_id == versionId;
        });

        polygons = polygons.filter(polygon => {
            if (!polygon.map_version_id) return true;
            return polygon.map_version_id == versionId;
        });

        console.log('[选点页-API加载] 数据加载成功:', {
            点数量: points.length,
            线数量: polylines.length,
            面数量: polygons.length
        });

        // 7. 转换为KML格式的features
        let features;
        if (window.APIDataConverter) {
            features = APIDataConverter.convert(points, polylines, polygons);
        } else {
            features = convertAPIDataToFeaturesLocal(points, polylines, polygons);
        }

        console.log('[选点页-API加载] 转换后的features数量:', features.length);

        // 8. 对线数据进行分割处理
        let processedFeatures = features;
        if (typeof processLineIntersections === 'function') {
            try {
                processedFeatures = processLineIntersections(features);
                console.log('[选点页-API加载] 线段分割完成');
            } catch (e) {
                console.warn('[选点页-API加载] 线段分割失败:', e);
            }
        }

        // 9. 构建KML数据对象
        const kmlData = {
            features: processedFeatures,
            fileName: `${projectName} (API数据)`
        };

        // 10. 显示地图数据
        if (processedFeatures.length > 0) {
            window.isFirstKMLImport = true;
            window.kmlData = kmlData;

            console.log('[选点页-API加载] 调用displayKMLFeatures显示地图数据');
            displayKMLFeatures(processedFeatures, kmlData.fileName);

            console.log('[选点页-API加载] 地图数据已显示');

            if (projectCenter && map) {
                console.log('[选点页-API加载] 设置地图中心为项目位置:', projectCenter);
                map.setCenter(projectCenter);
                map.setZoom(15);
            }
        } else {
            console.warn('[选点页-API加载] 无地图数据');

            if (projectCenter && map) {
                console.log('[选点页-API加载] 设置地图中心为项目位置:', projectCenter);
                map.setCenter(projectCenter);
                map.setZoom(15);
            }
        }

        console.log('[选点页-API加载] 地图数据加载完成');

    } catch (error) {
        console.error('[选点页-API加载] 加载地图数据失败:', error);
        alert('您所在位置周边无项目现场');
    }
}

/**
 * 将API数据转换为KML格式的features（本地版本）
 */
function convertAPIDataToFeaturesLocal(points, polylines, polygons) {
    const features = [];

    // 转换点
    points.forEach(point => {
        features.push({
            name: point.name || '未命名点',
            description: point.description || '',
            geometry: {
                type: 'point',
                coordinates: [point.longitude, point.latitude]
            },
            properties: {
                icon: point.icon_url || '',
                ...point
            }
        });
    });

    // 转换线
    polylines.forEach(line => {
        const coordsField = line.line_position;
        if (!coordsField) return;

        let coords = [];
        try {
            if (typeof coordsField === 'string') {
                if (coordsField.includes(';') && !coordsField.includes('[')) {
                    coords = coordsField.split(';').map(point => {
                        const [lng, lat] = point.split(',').map(Number);
                        return [lng, lat];
                    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
                } else {
                    coords = JSON.parse(coordsField);
                }
            } else if (Array.isArray(coordsField)) {
                coords = coordsField;
            }
        } catch (e) {
            console.warn('解析线坐标失败:', line.line_name, e);
            return;
        }

        if (!Array.isArray(coords) || coords.length === 0) return;

        features.push({
            name: line.line_name || '未命名线',
            description: line.description || '',
            geometry: {
                type: 'line',
                coordinates: coords,
                style: {
                    strokeColor: line.line_color || '#9AE59D',
                    strokeWeight: line.line_width || 3,
                    strokeOpacity: 1
                }
            }
        });
    });

    // 转换面
    polygons.forEach(polygon => {
        const coordsField = polygon.pg_position;
        if (!coordsField) return;

        let coords = [];
        try {
            if (typeof coordsField === 'string') {
                if (coordsField.includes(';') && !coordsField.includes('[')) {
                    coords = coordsField.split(';').map(point => {
                        const [lng, lat] = point.split(',').map(Number);
                        return [lng, lat];
                    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
                } else {
                    coords = JSON.parse(coordsField);
                }
            } else if (Array.isArray(coordsField)) {
                coords = coordsField;
            }
        } catch (e) {
            console.warn('解析面坐标失败:', polygon.polygon_name, e);
            return;
        }

        if (!Array.isArray(coords) || coords.length === 0) return;

        features.push({
            name: polygon.polygon_name || '未命名面',
            description: polygon.description || '',
            geometry: {
                type: 'polygon',
                coordinates: coords,
                style: {
                    fillColor: polygon.pg_color || '#CCCCCC',
                    fillOpacity: 0.3,
                    strokeColor: polygon.pg_frame_color || 'transparent',
                    strokeWeight: polygon.pg_frame_width || 0
                }
            }
        });
    });

    return features;
}

/**
 * 获取一次用户位置（用于距离计算，不持续追踪）
 */
function getOnceLocation() {
    console.log('[选点页] 获取一次位置用于距离计算');

    // 优先从 sessionStorage 获取位置
    const savedPosition = sessionStorage.getItem('currentPosition');
    if (savedPosition) {
        try {
            mapSelectionCurrentPosition = JSON.parse(savedPosition);
            console.log('[选点页] 使用缓存位置:', mapSelectionCurrentPosition);
            return;
        } catch (e) {
            console.warn('[选点页] 解析缓存位置失败:', e);
        }
    }

    // 如果没有缓存，获取一次位置
    if (!navigator.geolocation) {
        console.warn('[选点页] 浏览器不支持定位');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            console.log('[选点页] 定位成功:', position);

            let lng = position.coords.longitude;
            let lat = position.coords.latitude;

            // 转换坐标系（WGS84 -> GCJ02）
            if (typeof wgs84ToGcj02 === 'function') {
                const converted = wgs84ToGcj02(lng, lat);
                lng = converted[0];
                lat = converted[1];
                console.log('[选点页] 转换后坐标:', lng, lat);
            }

            mapSelectionCurrentPosition = [lng, lat];

            // 保存到 sessionStorage
            try {
                sessionStorage.setItem('currentPosition', JSON.stringify(mapSelectionCurrentPosition));
                console.log('[选点页] 已保存位置到缓存');
            } catch (e) {
                console.warn('[选点页] 保存位置失败:', e);
            }
        },
        function(error) {
            console.warn('[选点页] 定位失败:', error.message);
            // 定位失败不影响其他功能，距离显示会显示 ---
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000  // 5分钟内的缓存位置可用
        }
    );
}


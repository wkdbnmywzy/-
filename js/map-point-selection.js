// map-point-selection.js
// 地图选点页面逻辑

// 全局变量
let selectedPoint = null;  // 当前选中的点
let selectedPolygon = null;  // 当前选中的面
let mapSelectionCurrentPosition = null;  // 当前位置（使用不同的变量名避免冲突）
let highlightedMarker = null;  // 高亮的marker
let originalPolygonStyle = null;  // 原始面样式

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

    // 加载地图数据（复用main.js的逻辑）
    loadMapDataFromAPI();

    // 获取当前位置
    getCurrentLocation();
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
    // 返回按钮
    const backBtn = document.getElementById('map-selection-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            // 返回点位选择页面
            window.location.href = 'point-selection.html';
        });
    }

    // 搜索框
    const searchInput = document.getElementById('map-selection-search-input');
    if (searchInput) {
        let searchTimer;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            const keyword = this.value.trim();
            searchTimer = setTimeout(() => {
                if (keyword) {
                    searchPointsAndPolygons(keyword);
                }
            }, 300);
        });
    }

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

    // 保存选中的面
    selectedPolygon = polygon;
    selectedPoint = null;

    // 高亮面
    highlightPolygon(polygonOverlay);

    // 获取面内的点
    const pointsInPolygon = getPointsInPolygon(polygon);

    // 显示面信息面板
    showPolygonPanel(polygon, pointsInPolygon);
}

// 高亮marker
function highlightMarker(marker) {
    // 恢复之前高亮的marker
    if (highlightedMarker && highlightedMarker !== marker) {
        // 恢复原始图标
        if (highlightedMarker.originalIcon) {
            highlightedMarker.setIcon(highlightedMarker.originalIcon);
        }
    }

    // 保存原始图标
    if (!marker.originalIcon) {
        marker.originalIcon = marker.getIcon();
    }

    // 设置高亮图标（使用up图标）
    if (marker.upIcon) {
        marker.setIcon(marker.upIcon);
    }

    highlightedMarker = marker;
}

// 高亮面
function highlightPolygon(polygonOverlay) {
    // 恢复之前高亮的面
    if (selectedPolygon && selectedPolygon.overlay && selectedPolygon.overlay !== polygonOverlay) {
        if (originalPolygonStyle) {
            selectedPolygon.overlay.setOptions({
                fillColor: originalPolygonStyle.fillColor,
                fillOpacity: originalPolygonStyle.fillOpacity
            });
        }
    }

    // 保存原始样式
    originalPolygonStyle = {
        fillColor: polygonOverlay.getOptions().fillColor,
        fillOpacity: polygonOverlay.getOptions().fillOpacity
    };

    // 设置高亮样式（使用图片中的颜色 #E3F2FD）
    polygonOverlay.setOptions({
        fillColor: '#E3F2FD',
        fillOpacity: 0.8
    });
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
                    <i class="fas fa-map-marked-alt"></i>
                    路线
                </button>
                <button class="panel-point-btn panel-point-btn-nav" data-point-name="${point.name}">
                    <i class="fas fa-location-arrow"></i>
                    导航
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

    // 恢复marker
    if (highlightedMarker && highlightedMarker.originalIcon) {
        highlightedMarker.setIcon(highlightedMarker.originalIcon);
        highlightedMarker = null;
    }

    // 恢复面样式
    if (selectedPolygon && selectedPolygon.overlay && originalPolygonStyle) {
        selectedPolygon.overlay.setOptions({
            fillColor: originalPolygonStyle.fillColor,
            fillOpacity: originalPolygonStyle.fillOpacity
        });
        originalPolygonStyle = null;
    }

    selectedPoint = null;
    selectedPolygon = null;
}

// 选择点用于路线规划
function selectPointForRoute(point) {
    console.log('选择点用于路线规划:', point.name);

    // 从sessionStorage获取当前输入类型
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

    if (inputType === 'start') {
        newRouteData.startLocation = point.name;
    } else if (inputType === 'end') {
        newRouteData.endLocation = point.name;
    } else if (inputType === 'waypoint') {
        // 添加途径点
        if (!newRouteData.waypoints) {
            newRouteData.waypoints = [];
        }
        newRouteData.waypoints.push(point.name);
    }

    sessionStorage.setItem('routePlanningData', JSON.stringify(newRouteData));

    // 返回点位选择页面
    window.location.href = 'point-selection.html';
}

// 导航到点
function navigateToPoint(point) {
    console.log('开始导航到:', point.name);

    // 准备导航路线数据
    const routeData = {
        start: {
            name: '我的位置',
            position: mapSelectionCurrentPosition || [0, 0]
        },
        end: {
            name: point.name,
            position: point.geometry.coordinates
        },
        waypoints: []
    };

    // 保存到sessionStorage
    sessionStorage.setItem('navigationRoute', JSON.stringify(routeData));

    // 跳转到导航页面
    window.location.href = 'navigation.html';
}

// 计算距离
function calculateDistance(targetCoords) {
    if (!mapSelectionCurrentPosition || !targetCoords) {
        return '---';
    }

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

// 获取面内的点
function getPointsInPolygon(polygon) {
    // 从全局kmlData中获取所有点
    if (!window.kmlData || !window.kmlData.features) {
        return [];
    }

    const allFeatures = window.kmlData.features;
    const points = allFeatures.filter(f => f.geometry.type === 'point');

    // 判断点是否在面内
    return points.filter(point => {
        return isPointInPolygon(point.geometry.coordinates, polygon.geometry.coordinates);
    });
}

// 判断点是否在多边形内（射线法）
function isPointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];

        const intersect = ((yi > y) !== (yj > y)) &&
                         (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

// 搜索点和面
function searchPointsAndPolygons(keyword) {
    if (!window.kmlData || !window.kmlData.features) {
        return;
    }

    const lowerKeyword = keyword.toLowerCase();
    const features = window.kmlData.features;

    // 搜索匹配的点和面
    const matches = features.filter(f => {
        const name = f.name.toLowerCase();
        return name.includes(lowerKeyword);
    });

    console.log('搜索结果:', matches.length, '个匹配项');

    // 如果只有一个匹配，自动选中
    if (matches.length === 1) {
        const match = matches[0];
        if (match.geometry.type === 'point') {
            // 找到对应的marker并点击
            // 这里需要根据实际的marker存储方式来获取
        } else if (match.geometry.type === 'polygon') {
            // 找到对应的面并点击
        }
    }
}

// 获取当前位置
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                mapSelectionCurrentPosition = [position.coords.longitude, position.coords.latitude];
                console.log('当前位置:', mapSelectionCurrentPosition);
            },
            function(error) {
                console.warn('获取位置失败:', error);
            }
        );
    }
}

// 导出函数供全局使用
window.handleMapPointClick = handlePointClick;
window.handleMapPolygonClick = handlePolygonClick;

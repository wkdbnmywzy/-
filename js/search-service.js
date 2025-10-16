// search-service.js
// 地点搜索和选择功能

function searchPlaces(keyword) {
    var resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';

    // 首先显示KML点信息（支持筛选）
    var kmlResults = getAllKMLPoints(keyword);

    // 显示KML搜索结果
    if (kmlResults.length > 0) {
        var kmlSection = document.createElement('div');
        kmlSection.className = 'search-section';
        kmlSection.innerHTML = '<div class="search-section-title">KML点位</div>';
        resultsContainer.appendChild(kmlSection);

        kmlResults.forEach(function(kmlPoint) {
            var item = document.createElement('div');
            item.className = 'search-result-item kml-result';
            item.innerHTML = `
                <div class="result-icon"><i class="fas fa-map-pin" style="color: #888888;"></i></div>
                <div class="result-content">
                    <div class="result-name">${kmlPoint.name}</div>
                    <div class="result-address">${kmlPoint.description || 'KML导入点位'}</div>
                </div>
                <div class="result-actions">
                    <button class="result-action-btn navigate-btn">
                        <img src="images/工地数字导航小程序切图/司机/2X/导航/导航.png" alt="导航">
                    </button>
                    <button class="result-action-btn route-btn">
                        <img src="images/工地数字导航小程序切图/司机/2X/导航/路线.png" alt="路线">
                    </button>
                </div>
            `;

            // 点击结果项选择该点
            item.querySelector('.result-content').addEventListener('click', function() {
                selectKMLPointFromSearchEnhanced(kmlPoint);
            });

            // 导航按钮点击事件
            item.querySelector('.navigate-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                // 设置为终点并开始导航
                const endInput = document.getElementById('end-location');
                if (endInput) {
                    endInput.value = kmlPoint.name;
                    // 关闭搜索结果
                    resultsContainer.classList.remove('active');
                    // 跳转到导航页面
                    window.location.href = 'navigation.html';
                }
            });

            // 路线按钮点击事件
            item.querySelector('.route-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                // 设置为终点并规划路线
                const endInput = document.getElementById('end-location');
                if (endInput) {
                    endInput.value = kmlPoint.name;
                    // 关闭搜索结果
                    resultsContainer.classList.remove('active');
                    // 如果有规划路线函数，调用它
                    if (window.planRoute) {
                        window.planRoute();
                    }
                }
            });

            resultsContainer.appendChild(item);
        });
    }

    // 如果有搜索关键词，再搜索POI
    if (keyword && keyword.trim()) {
        searchPOI(keyword, resultsContainer);
    } else if (kmlResults.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item">暂无KML点位数据</div>';
    }

    resultsContainer.classList.add('active');
}

// 获取所有KML点（支持筛选）
function getAllKMLPoints(keyword) {
    var results = [];
    if (!kmlLayers || kmlLayers.length === 0) return results;

    var searchKeyword = keyword ? keyword.toLowerCase() : '';

    kmlLayers.forEach(function(layer) {
        if (!layer.visible) return;

        layer.markers.forEach(function(marker) {
            var extData = marker.getExtData();
            if (extData && extData.type === '点') {
                var name = extData.name.toLowerCase();
                var description = (extData.description || '').toLowerCase();

                // 如果没有关键词或者匹配关键词，则显示
                if (!searchKeyword ||
                    name.includes(searchKeyword) ||
                    description.includes(searchKeyword)) {
                    results.push({
                        name: extData.name,
                        description: extData.description,
                        position: marker.getPosition(),
                        marker: marker,
                        type: 'kml-point'
                    });
                }
            }
        });
    });

    return results;
}

// 搜索POI
function searchPOI(keyword, resultsContainer) {
    // 使用高德地图POI搜索
    AMap.plugin('AMap.PlaceSearch', function() {
        var placeSearch = new AMap.PlaceSearch({
            pageSize: 10,
            pageIndex: 1,
            city: '全国'
        });

        placeSearch.search(keyword, function(status, result) {
            if (status === 'complete' && result.poiList && result.poiList.pois) {
                var pois = result.poiList.pois;

                if (pois.length > 0) {
                    // 添加POI搜索结果分类
                    var poiSection = document.createElement('div');
                    poiSection.className = 'search-section';
                    poiSection.innerHTML = '<div class="search-section-title">地点搜索</div>';
                    resultsContainer.appendChild(poiSection);

                    pois.forEach(function(poi) {
                        var item = document.createElement('div');
                        item.className = 'search-result-item poi-result';
                        item.innerHTML = `
                            <div class="result-icon"><i class="fas fa-map-marker-alt"></i></div>
                            <div class="result-content">
                                <div class="result-name">${poi.name}</div>
                                <div class="result-address">${poi.address || '地址不详'}</div>
                            </div>
                        `;

                        item.addEventListener('click', function() {
                            selectPlace(poi);
                        });

                        resultsContainer.appendChild(item);
                    });
                }
            }
        });
    });
}

// 显示所有KML点位（点击搜索框时调用）
function showAllKMLPoints() {
    var resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = '';

    var kmlResults = getAllKMLPoints(''); // 获取所有KML点

    if (kmlResults.length > 0) {
        var kmlSection = document.createElement('div');
        kmlSection.className = 'search-section';
        kmlSection.innerHTML = '<div class="search-section-title">所有KML点位</div>';
        resultsContainer.appendChild(kmlSection);

        kmlResults.forEach(function(kmlPoint) {
            var item = document.createElement('div');
            item.className = 'search-result-item kml-result';
            item.innerHTML = `
                <div class="result-icon"><i class="fas fa-map-pin" style="color: #888888;"></i></div>
                <div class="result-content">
                    <div class="result-name">${kmlPoint.name}</div>
                    <div class="result-address">${kmlPoint.description || 'KML导入点位'}</div>
                </div>
                <div class="result-actions">
                    <button class="result-action-btn navigate-btn">
                        <img src="images/工地数字导航小程序切图/司机/2X/导航/导航.png" alt="导航">
                    </button>
                    <button class="result-action-btn route-btn">
                        <img src="images/工地数字导航小程序切图/司机/2X/导航/路线.png" alt="路线">
                    </button>
                </div>
            `;

            // 点击结果项选择该点
            item.querySelector('.result-content').addEventListener('click', function() {
                selectKMLPointFromSearchEnhanced(kmlPoint);
            });

            // 导航按钮点击事件
            item.querySelector('.navigate-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                // 设置为终点并开始导航
                const endInput = document.getElementById('end-location');
                if (endInput) {
                    endInput.value = kmlPoint.name;
                    // 关闭搜索结果
                    resultsContainer.classList.remove('active');
                    // 跳转到导航页面
                    window.location.href = 'navigation.html';
                }
            });

            // 路线按钮点击事件
            item.querySelector('.route-btn').addEventListener('click', function(e) {
                e.stopPropagation();
                // 设置为终点并规划路线
                const endInput = document.getElementById('end-location');
                if (endInput) {
                    endInput.value = kmlPoint.name;
                    // 关闭搜索结果
                    resultsContainer.classList.remove('active');
                    // 如果有规划路线函数，调用它
                    if (window.planRoute) {
                        window.planRoute();
                    }
                }
            });

            resultsContainer.appendChild(item);
        });
    } else {
        resultsContainer.innerHTML = '<div class="search-result-item">暂无KML点位数据<br><small>请先导入KML文件</small></div>';
    }

    resultsContainer.classList.add('active');
}

// 从搜索框选择KML点（专门用于上方搜索框的选择逻辑）
function selectKMLPointFromSearch(kmlPoint) {
    // 清除之前的高亮
    clearPointHighlight();

    // 高亮选中的点
    highlightKMLPoint(kmlPoint);

    // 移动地图中心到选中位置
    map.setCenter(kmlPoint.position);
    map.setZoom(16);

    // 隐藏搜索结果
    document.getElementById('search-results').classList.remove('active');

    // 清空搜索框
    document.getElementById('search-input').value = '';

    // 显示选择成功的提示
    showSuccessMessage(`已选择: ${kmlPoint.name}`);
}

// 搜索KML点信息（保持原有函数用于兼容）
function searchKMLPoints(keyword) {
    return getAllKMLPoints(keyword);
}

// 选择KML点
function selectKMLPoint(kmlPoint) {
    // 清除之前的高亮
    clearPointHighlight();

    // 高亮选中的点
    highlightKMLPoint(kmlPoint);

    // 移动地图中心到选中位置
    map.setCenter(kmlPoint.position);
    map.setZoom(16);

    // 隐藏搜索结果
    document.getElementById('search-results').classList.remove('active');

    // 清空搜索框
    document.getElementById('search-input').value = '';
}

// 高亮KML点
function highlightKMLPoint(kmlPoint) {
    // 创建高亮圆圈
    if (window.highlightCircle) {
        map.remove(window.highlightCircle);
    }

    window.highlightCircle = new AMap.Circle({
        center: kmlPoint.position,
        radius: 100,
        strokeColor: '#FF0000',
        strokeWeight: 3,
        strokeOpacity: 0.8,
        fillColor: '#FF0000',
        fillOpacity: 0.2,
        map: map
    });

    // 3秒后移除高亮
    setTimeout(function() {
        if (window.highlightCircle) {
            map.remove(window.highlightCircle);
            window.highlightCircle = null;
        }
    }, 3000);
}

// 清除点高亮
function clearPointHighlight() {
    if (window.highlightCircle) {
        map.remove(window.highlightCircle);
        window.highlightCircle = null;
    }
}

function selectPlace(poi) {
    // 清除之前的标记
    clearMarkers();

    // 添加新标记
    var marker = new AMap.Marker({
        position: [poi.location.lng, poi.location.lat],
        icon: new AMap.Icon({
            size: new AMap.Size(30, 38),
            image: MapConfig.markerStyles.destination.icon,
            imageSize: new AMap.Size(30, 38)
        }),
        offset: new AMap.Pixel(-15, -38),
        map: map
    });
    markers.push(marker);

    // 添加到搜索历史
    addToSearchHistory({
        name: poi.name,
        address: poi.address || '地址不详',
        position: [poi.location.lng, poi.location.lat],
        type: 'poi'
    });

    // 判断当前活动的输入框并更新相应的值
    var activeElement = document.activeElement;
    if (activeElement && activeElement.id === 'start-location') {
        // 更新起点输入框
        document.getElementById('start-location').value = poi.name;
    } else {
        // 默认更新终点输入框
        document.getElementById('end-location').value = poi.name;
    }

    // 移动地图中心到选中位置
    map.setCenter([poi.location.lng, poi.location.lat]);

    // 隐藏搜索结果
    document.getElementById('search-results').classList.remove('active');

    // 检查是否可以启用路线规划按钮
    checkRouteButtonState();
}

// 选择KML点
function selectKMLPoint(kmlPoint) {
    // 清除之前的高亮
    clearPointHighlight();

    // 高亮选中的点
    highlightKMLPoint(kmlPoint);

    // 添加到搜索历史
    addToSearchHistory({
        name: kmlPoint.name,
        address: kmlPoint.description || 'KML导入点位',
        position: kmlPoint.position,
        type: 'kml-point'
    });

    // 判断当前活动的输入框并更新相应的值
    var activeElement = document.activeElement;
    if (activeElement && activeElement.id === 'start-location') {
        // 更新起点输入框
        document.getElementById('start-location').value = kmlPoint.name;
    } else {
        // 默认更新终点输入框
        document.getElementById('end-location').value = kmlPoint.name;
    }

    // 移动地图中心到选中位置
    map.setCenter(kmlPoint.position);
    map.setZoom(16);

    // 隐藏搜索结果
    document.getElementById('search-results').classList.remove('active');

    // 按钮已移除，等待新的设计方案
    // checkRouteButtonState();
}

// 检查路线规划按钮状态（按钮已移除，保留函数以防其他地方调用）
function checkRouteButtonState() {
    // 路线规划和导航按钮已移除，等待新的设计方案
    // var startValue = document.getElementById('start-location').value.trim();
    // var endValue = document.getElementById('end-location').value.trim();
    // var routeBtn = document.getElementById('route-btn');
    // if (startValue && endValue) {
    //     routeBtn.disabled = false;
    // } else {
    //     routeBtn.disabled = true;
    // }
}
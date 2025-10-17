// ui-utils.js
// UI相关的工具函数和事件处理

// 全局控制：是否允许自动将地图居中到当前位置（true = 允许）
// 可以在导入/跳转到 KML 点后调用 window.disableAutoCenterTemporarily(ms) 暂时禁用自动居中
window.autoCenterEnabled = true;
function disableAutoCenterTemporarily(ms = 10000) {
    window.autoCenterEnabled = false;
    setTimeout(function() {
        window.autoCenterEnabled = true;
        console.log('自动居中已恢复');
    }, ms);
}

function showSuccessMessage(message) {
    // 创建临时提示
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: #34c759;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        font-size: 14px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        document.body.removeChild(toast);
    }, 3000);
}

function setupEventListeners() {
    console.log('设置事件监听器...');

    // 搜索框事件
    const searchInput = document.getElementById('search-input');
    const searchResults = document.getElementById('search-results');
    const bottomCard = document.getElementById('bottom-card');

    if (searchInput) {
        console.log('找到搜索输入框');

        // 点击搜索框时显示所有KML点位
        searchInput.addEventListener('focus', function() {
            // 如果搜索框有内容且存在选中状态，先清空再显示列表
            if (this.value && window.selectedMarker) {
                this.value = '';
            }
            showAllKMLPoints();
            // 底部卡片下滑隐藏
            bottomCard.style.transform = 'translateY(100%)';
        });

        // 输入搜索时实时筛选
        let searchTimer;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            const value = searchInput.value.trim();

            // 如果是程序设置的值（选中点后），不触发搜索
            if (this.dataset.programmaticUpdate === 'true') {
                this.dataset.programmaticUpdate = 'false';
                return;
            }

            searchTimer = setTimeout(function() {
                if (value) {
                    console.log('搜索:', value);
                    searchPlaces(value);
                } else {
                    // 如果输入为空，显示所有KML点位
                    showAllKMLPoints();
                }
            }, 300);
        });

        // 失去焦点时隐藏搜索结果（延迟一点以便点击结果）
        searchInput.addEventListener('blur', function() {
            setTimeout(function() {
                if (!document.querySelector('.search-results:hover')) {
                    searchResults.classList.remove('active');
                    bottomCard.style.transform = 'translateY(0)';
                }
            }, 200);
        });
    } else {
        console.error('未找到搜索输入框');
    }

    // 地图点击事件 - 切换底部面板显示/隐藏
    if (map) {
        let bottomCardVisible = true;

        map.on('click', function(e) {
            // 检查点击的是否是地图本身，而不是标记或其他覆盖物
            if (e.target && e.target.getClassName && e.target.getClassName() === 'amap-maps') {
                if (bottomCardVisible) {
                    // 隐藏底部面板
                    bottomCard.style.transform = 'translateY(100%)';
                    bottomCardVisible = false;
                } else {
                    // 显示底部面板
                    bottomCard.style.transform = 'translateY(0)';
                    bottomCardVisible = true;
                }
            }
        });
    }

    // 起点和终点输入框搜索功能
    const startLocationInput = document.getElementById('start-location');
    const endLocationInput = document.getElementById('end-location');

    if (startLocationInput) {
        startLocationInput.addEventListener('focus', function() {
            // 显示搜索结果容器
            searchResults.classList.add('active');

            // 如果有文本内容，进行搜索
            if (this.value.trim()) {
                searchPlaces(this.value.trim());
            }
        });

        startLocationInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function() {
                if (startLocationInput.value.trim()) {
                    searchPlaces(startLocationInput.value.trim());
                } else {
                    searchResults.classList.remove('active');
                }
            }, 500);
        });
    }

    if (endLocationInput) {
        endLocationInput.addEventListener('focus', function() {
            // 显示搜索结果容器
            searchResults.classList.add('active');

            // 如果有文本内容，进行搜索
            if (this.value.trim()) {
                searchPlaces(this.value.trim());
            }
        });

        endLocationInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(function() {
                if (endLocationInput.value.trim()) {
                    searchPlaces(endLocationInput.value.trim());
                } else {
                    searchResults.classList.remove('active');
                }
            }, 500);
        });
    }

    // 点击页面其他区域关闭搜索结果
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-container') &&
            !e.target.closest('#end-location') &&
            !e.target.closest('#start-location')) {
            searchResults.classList.remove('active');
        }
    });

    // 添加途经点按钮点击事件
    const addWaypointBtn = document.getElementById('add-waypoint-btn');
    if (addWaypointBtn) {
        console.log('找到添加途经点按钮');
        addWaypointBtn.addEventListener('click', addWaypoint);
    } else {
        console.error('未找到添加途经点按钮');
    }

    // 切换起点终点按钮点击事件
    const swapLocationsBtn = document.getElementById('swap-locations-btn');
    if (swapLocationsBtn) {
        console.log('找到切换起点终点按钮');
        swapLocationsBtn.addEventListener('click', function() {
            swapStartAndEndLocations();
        });
    } else {
        console.log('未找到切换起点终点按钮');
    }

    // 路线规划和导航按钮已移除，等待新的设计方案
    // const routeBtn = document.getElementById('route-btn');
    // const startNavBtn = document.getElementById('start-nav-btn');

    // 地图控制按钮事件
    const locateBtn = document.getElementById('locate-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

    if (locateBtn) {
        let isBusy = false; // 防止重复点击节流

        locateBtn.addEventListener('click', function() {
            if (isBusy) return;
            isBusy = true;

            const icon = locateBtn.querySelector('i');
            locateBtn.style.opacity = '0.75';
            if (icon) icon.style.animation = 'spin 0.8s linear infinite';

            try {
                // 用户手势下尝试申请方向权限（iOS）
                if (typeof tryStartDeviceOrientationIndex === 'function') {
                    tryStartDeviceOrientationIndex();
                }

                // 如果实时定位未启动，先启动它
                if (typeof isRealtimeLocating !== 'undefined' && !isRealtimeLocating) {
                    if (typeof startRealtimeLocationTracking === 'function') {
                        startRealtimeLocationTracking();
                        showSuccessMessage('正在获取当前位置...');
                    }
                }

                // 强制更新并定位到当前位置
                // 这里使用一次性定位来立即获取最新位置
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                        function(position) {
                            var lng = position.coords.longitude;
                            var lat = position.coords.latitude;

                            // 坐标系转换 WGS84 -> GCJ-02
                            try {
                                if (typeof wgs84ToGcj02 === 'function') {
                                    var converted = wgs84ToGcj02(lng, lat);
                                    if (Array.isArray(converted) && converted.length === 2) {
                                        lng = converted[0];
                                        lat = converted[1];
                                    }
                                }
                            } catch (e) {
                                console.warn('坐标系转换失败，使用原始坐标:', e);
                            }

                            currentPosition = [lng, lat];

                            // 更新或创建自身标记
                            if (selfMarker) {
                                selfMarker.setPosition([lng, lat]);
                            }

                            // 定位到当前位置（仅在允许自动居中时）
                            try {
                                if (window.autoCenterEnabled) {
                                    map.setZoom(17);
                                    map.setCenter([lng, lat]);
                                    showSuccessMessage('已定位到当前位置');
                                } else {
                                    console.log('跳过自动居中（autoCenterEnabled=false）');
                                }
                            } catch (e) {
                                console.error('定位失败:', e);
                            }
                        },
                        function(error) {
                            console.error('获取位置失败:', error);
                            showSuccessMessage('获取位置失败，请检查定位权限');

                            // 如果有当前位置，则定位到当前位置（仅在允许自动居中时）
                            if (typeof currentPosition !== 'undefined' && currentPosition) {
                                try {
                                    if (window.autoCenterEnabled) {
                                        map.setZoom(17);
                                        map.setCenter(currentPosition);
                                    } else {
                                        console.log('跳过自动居中（autoCenterEnabled=false）');
                                    }
                                } catch (e) {}
                            }
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0
                        }
                    );
                } else {
                    // 浏览器不支持定位，尝试定位到已有的当前位置
                    if (typeof currentPosition !== 'undefined' && currentPosition) {
                        try {
                            if (window.autoCenterEnabled) {
                                map.setZoom(17);
                                map.setCenter(currentPosition);
                            } else {
                                console.log('跳过自动居中（autoCenterEnabled=false）');
                            }
                        } catch (e) {}
                    } else {
                        showSuccessMessage('浏览器不支持定位功能');
                    }
                }
            } finally {
                setTimeout(function() {
                    if (icon) icon.style.animation = '';
                    locateBtn.style.opacity = '1';
                    isBusy = false;
                }, 300);
            }
        });
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function() {
            map.zoomIn();
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function() {
            map.zoomOut();
        });
    }

    console.log('事件监听器设置完成');
}

// 交换起点和终点位置
function swapStartAndEndLocations() {
    console.log('交换起点和终点');

    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    const pickerStartInput = document.getElementById('picker-start-location');
    const pickerEndInput = document.getElementById('picker-end-location');

    if (startInput && endInput) {
        // 交换主输入框的值
        const tempValue = startInput.value;
        startInput.value = endInput.value;
        endInput.value = tempValue;

        // 同步点选择面板的输入框
        if (pickerStartInput) {
            pickerStartInput.value = endInput.value;
        }
        if (pickerEndInput) {
            pickerEndInput.value = startInput.value;
        }

        console.log('已交换起点和终点输入框的值');

        // 提示用户
        if (typeof showSuccessMessage === 'function') {
            showSuccessMessage('已交换起点和终点');
        }
    } else {
        console.warn('未找到起点或终点输入框');
    }
}

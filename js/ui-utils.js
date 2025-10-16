// ui-utils.js
// UI相关的工具函数和事件处理

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

    // 导航栏点击效果
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            navItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
        });
    });

    // 添加途经点按钮点击事件
    const addWaypointBtn = document.getElementById('add-waypoint-btn');
    if (addWaypointBtn) {
        console.log('找到添加途经点按钮');
        addWaypointBtn.addEventListener('click', addWaypoint);
    } else {
        console.error('未找到添加途经点按钮');
    }

    // 路线规划和导航按钮已移除，等待新的设计方案
    // const routeBtn = document.getElementById('route-btn');
    // const startNavBtn = document.getElementById('start-nav-btn');

    // 地图控制按钮事件
    const locateBtn = document.getElementById('locate-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

    if (locateBtn) {
        let isLocating = false;  // 防止重复点击

        locateBtn.addEventListener('click', function() {
            console.log('定位按钮点击');

            // 防止重复点击
            if (isLocating) {
                console.log('定位中，忽略重复点击');
                return;
            }

            // 添加视觉反馈
            locateBtn.style.opacity = '0.6';
            const icon = locateBtn.querySelector('i');
            if (icon) {
                icon.style.animation = 'spin 1s linear infinite';
            }

            isLocating = true;

            if (currentPosition) {
                // 如果已有定位，直接移动到当前位置
                map.setCenter(currentPosition);
                map.setZoom(15);

                // 添加动画效果
                setTimeout(function() {
                    if (icon) {
                        icon.style.animation = '';
                    }
                    locateBtn.style.opacity = '1';
                    isLocating = false;
                }, 300);

                showSuccessMessage('已定位到您的位置');
            } else {
                // 如果没有定位，重新获取
                getCurrentLocation();

                // 监听定位结果，恢复按钮状态
                setTimeout(function() {
                    if (icon) {
                        icon.style.animation = '';
                    }
                    locateBtn.style.opacity = '1';
                    isLocating = false;
                }, 2000);
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
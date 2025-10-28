// main.js
// 应用程序主入口

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const currentUser = sessionStorage.getItem('currentUser');

    if (!isLoggedIn || !currentUser) {
        // 未登录，跳转到登录页
        window.location.href = 'login.html';
        return false;
    }

    return true;
}

document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    if (!checkLoginStatus()) {
        return;
    }

    // 初始化地图
    initMap();

    // 初始化KML导入功能
    initKMLImport();

    // 等待地图加载完成后，尝试从sessionStorage恢复KML数据
    setTimeout(function() {
        if (typeof loadKMLFromSession === 'function') {
            loadKMLFromSession();
        }
    }, 500);

    // 初始化点选择面板
    initPointSelectionPanel();

    // 初始化底部导航栏
    initBottomNav();

    // 等待地图初始化完成后设置事件监听器
    setTimeout(function() {
        setupEventListeners();

        // 检查URL参数，是否需要自动显示点位选择界面并添加途径点
        checkURLAction();

        // 从sessionStorage恢复路线规划数据
        restoreRoutePlanningData();
    }, 1000);
});

/**
 * 检查URL参数并执行相应操作
 */
function checkURLAction() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    // 检查是否从任务页来进行导航，如果是则清除标记和地图状态
    const fromTaskNav = sessionStorage.getItem('fromTaskNavigation');
    if (fromTaskNav === 'true') {
        sessionStorage.removeItem('fromTaskNavigation');
        sessionStorage.removeItem('mapState');
        console.log('从任务页导航进入，已清除地图状态缓存');
    }

    if (action === 'addWaypoint') {
        console.log('检测到添加途径点操作，跳转到点位选择界面');
        // 跳转到点位选择界面
        if (typeof showPickerPanel === 'function') {
            currentInputType = 'waypoint';
            showPickerPanel();
        }

        // 清除URL参数，避免刷新时重复执行
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

/**
 * 初始化底部导航栏
 */
function initBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');
    console.log('初始化底部导航栏, 找到', navItems.length, '个导航项');

    navItems.forEach(item => {
        // 使用touchstart事件处理移动端点击，避免双击延迟
        const handleNavClick = function(e) {
            e.preventDefault(); // 防止默认行为
            e.stopPropagation(); // 防止事件冒泡
            
            console.log('导航项被点击:', this.getAttribute('data-page'));
            const page = this.getAttribute('data-page');

            // 更新导航栏状态
            updateNavState(navItems, this);

            // 页面跳转
            navigateToPage(page);
        };

        // 同时监听touch和click事件，确保在不同设备上都能工作
        item.addEventListener('touchstart', handleNavClick, { passive: false });
        item.addEventListener('click', handleNavClick);
    });

    // 监听地图容器点击，保持导航状态
    setupMapClickHandler(navItems);
}

/**
 * 更新导航栏状态
 */
function updateNavState(navItems, activeItem) {
    navItems.forEach(nav => {
        const img = nav.querySelector('.nav-icon-img');
        const text = nav.querySelector('.nav-text');

        if (nav === activeItem) {
            nav.classList.add('active');
            img.src = img.getAttribute('data-active');
            text.style.color = '#5BA8E3';
        } else {
            nav.classList.remove('active');
            img.src = img.getAttribute('data-inactive');
            text.style.color = '#666666';
        }
    });
}

/**
 * 设置地图点击处理器，点击地图时保持当前页面的导航状态
 */
function setupMapClickHandler(navItems) {
    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    // 点击地图区域时，确保导航栏状态与当前页面一致
    mapContainer.addEventListener('click', function(e) {
        // 确保点击的是地图本身，而不是地图上的控件
        if (e.target === mapContainer || e.target.closest('#map-container')) {
            // 获取当前页面
            const currentPage = getCurrentPage();
            
            // 找到对应的导航项并确保其为活跃状态
            navItems.forEach(nav => {
                const page = nav.getAttribute('data-page');
                const img = nav.querySelector('.nav-icon-img');
                const text = nav.querySelector('.nav-text');

                if (page === currentPage) {
                    nav.classList.add('active');
                    img.src = img.getAttribute('data-active');
                    text.style.color = '#5BA8E3';
                } else {
                    nav.classList.remove('active');
                    img.src = img.getAttribute('data-inactive');
                    text.style.color = '#666666';
                }
            });
        }
    });
}

/**
 * 获取当前页面
 */
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('task.html')) {
        return 'task';
    } else if (path.includes('profile.html')) {
        return 'profile';
    } else {
        return 'index';
    }
}

/**
 * 页面导航
 */
function navigateToPage(page) {
    console.log('准备跳转到页面:', page);

    // 只有从首页跳转到其他页面时才保存地图状态（用于返回时恢复）
    // 注意：从任务页切换到首页时，不应保存状态，而是重新定位
    if (page !== 'index' && typeof map !== 'undefined' && map) {
        try {
            const zoom = map.getZoom();
            const center = map.getCenter();
            const position = currentPosition || null;
            const angle = (selfMarker && typeof selfMarker.getAngle === 'function') ? selfMarker.getAngle() : 0;

            const mapState = {
                zoom: zoom,
                center: [center.lng, center.lat],
                position: position,
                angle: angle
            };
            sessionStorage.setItem('mapState', JSON.stringify(mapState));
            console.log('保存地图状态:', mapState);
        } catch (e) {
            console.warn('保存地图状态失败:', e);
        }
    }

    switch(page) {
        case 'index':
            // 从其他页面跳转到首页时，清除地图状态，强制重新定位
            sessionStorage.removeItem('mapState');
            console.log('清除地图状态，将重新定位');
            // 当前页面不需要跳转
            if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                console.log('已经在首页，无需跳转');
            } else {
                window.location.href = 'index.html';
            }
            break;
        case 'task':
            console.log('跳转到任务页面');
            window.location.href = 'task.html';
            break;
        case 'profile':
            console.log('跳转到我的页面');
            window.location.href = 'profile.html';
            break;
        default:
            console.warn('未知页面:', page);
    }
}

/**
 * 恢复路线规划数据
 */
function restoreRoutePlanningData() {
    const routeData = sessionStorage.getItem('routePlanningData');
    if (!routeData) {
        return;
    }

    try {
        const data = JSON.parse(routeData);
        console.log('恢复路线规划数据:', data);

        const startInput = document.getElementById('start-location');
        const endInput = document.getElementById('end-location');

        if (data.startLocation && startInput) {
            startInput.value = data.startLocation;
        }
        if (data.endLocation && endInput) {
            endInput.value = data.endLocation;
        }

        // 恢复途经点
        if (data.waypoints && data.waypoints.length > 0) {
            // 先清空现有途经点
            const waypointsContainer = document.getElementById('waypoints-container');
            if (waypointsContainer) {
                waypointsContainer.innerHTML = '';
            }

            // 添加途经点
            data.waypoints.forEach((waypoint, index) => {
                if (typeof addWaypointToUI === 'function') {
                    addWaypointToUI(waypoint, index);
                }
            });
        }

        // 清除sessionStorage中的数据（已恢复）
        sessionStorage.removeItem('routePlanningData');
    } catch (e) {
        console.error('恢复路线规划数据失败:', e);
    }
}
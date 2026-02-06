// 管理员页面 JavaScript
// map 变量已在 config.js 中声明，这里直接使用

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    checkLoginStatus();
    
    // 初始化地图
    initMap();
    
    // 初始化事件监听
    initEventListeners();
});

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    
    if (!isLoggedIn || currentUser.role !== 'manager') {
        // 未登录或不是管理员，跳转到登录页
        window.location.href = 'login.html';
        return;
    }
    
    console.log('管理员已登录:', currentUser);
}

// 初始化地图
function initMap() {
    // 创建地图实例，使用 config.js 中的配置
    map = new AMap.Map('map-container', {
        zoom: MapConfig.mapConfig.zoom,
        center: MapConfig.mapConfig.center,
        mapStyle: 'amap://styles/normal',
        viewMode: MapConfig.mapConfig.viewMode,
        pitch: 0,
        rotation: 0,
        showLabel: MapConfig.mapConfig.showLabel,
        features: MapConfig.mapConfig.features
    });
    
    console.log('管理员地图初始化完成');
}

// 初始化事件监听
function initEventListeners() {
    // 底部导航切换
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            handleNavigation(page);
        });
    });
    
    // 搜索框点击
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('click', function() {
            console.log('搜索功能待实现');
            // TODO: 跳转到搜索页面
        });
    }
    
    // 筛选项点击
    const filterItems = document.querySelectorAll('.filter-item');
    filterItems.forEach(item => {
        item.addEventListener('click', function() {
            const filterType = this.querySelector('span').textContent;
            console.log('筛选:', filterType);
            // TODO: 实现筛选功能
        });
    });
    
    // 右侧控制按钮
    const locateBtn = document.getElementById('locate-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const vehicleToggleBtn = document.getElementById('vehicle-toggle-btn');
    const vehicleLegend = document.getElementById('vehicle-legend');
    
    // 定位按钮
    if (locateBtn) {
        locateBtn.addEventListener('click', function() {
            console.log('定位功能待实现');
            // TODO: 实现定位功能
        });
    }
    
    // 摄像头按钮
    if (cameraBtn) {
        cameraBtn.addEventListener('click', function() {
            console.log('摄像头功能待实现');
            // TODO: 实现摄像头功能
        });
    }
    
    // 车辆切换按钮
    if (vehicleToggleBtn && vehicleLegend) {
        vehicleToggleBtn.addEventListener('click', function() {
            // 切换按钮激活状态
            this.classList.toggle('active');
            
            // 切换车辆图例显示/隐藏
            if (vehicleLegend.style.display === 'none') {
                vehicleLegend.style.display = 'flex';
                console.log('车辆图例显示');
            } else {
                vehicleLegend.style.display = 'none';
                console.log('车辆图例隐藏');
            }
        });
    }
}

// 处理导航切换
function handleNavigation(page) {
    console.log('导航到:', page);
    
    // 更新导航状态
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const icon = item.querySelector('.nav-icon-img');
        if (item.dataset.page === page) {
            item.classList.add('active');
            icon.src = icon.dataset.active;
        } else {
            item.classList.remove('active');
            icon.src = icon.dataset.inactive;
        }
    });
    
    // 根据不同页面跳转或显示不同内容
    switch(page) {
        case 'admin-navigation':
            // 当前就是导航页面，刷新即可
            console.log('导航页面');
            break;
        case 'admin-data':
            // 跳转到工地数据页面
            window.location.href = 'admin-data.html';
            break;
        case 'admin-transport':
            // 跳转到运输管理页面
            window.location.href = 'admin-transport.html';
            break;
        case 'admin-profile':
            // 跳转到我的页面
            window.location.href = 'admin-profile.html';
            break;
    }
}

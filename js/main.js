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
        if (typeof restoreKMLDataFromSession === 'function') {
            restoreKMLDataFromSession();
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
    }, 1000);
});

/**
 * 检查URL参数并执行相应操作
 */
function checkURLAction() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    if (action === 'addWaypoint') {
        console.log('检测到添加途径点操作，跳转到点位选择界面');
        // 显示点位选择界面
        if (typeof showPickerPanel === 'function') {
            showPickerPanel();

            // 稍微延迟后添加途径点输入框
            setTimeout(() => {
                if (typeof addPickerWaypoint === 'function') {
                    addPickerWaypoint();
                }
            }, 200);
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
        item.addEventListener('click', function(e) {
            console.log('导航项被点击:', this.getAttribute('data-page'));
            const page = this.getAttribute('data-page');

            // 更新导航栏状态
            navItems.forEach(nav => {
                const img = nav.querySelector('.nav-icon-img');
                const text = nav.querySelector('.nav-text');

                if (nav === this) {
                    nav.classList.add('active');
                    img.src = img.getAttribute('data-active');
                    text.style.color = '#5BA8E3';
                } else {
                    nav.classList.remove('active');
                    img.src = img.getAttribute('data-inactive');
                    text.style.color = '#666666';
                }
            });

            // 页面跳转
            navigateToPage(page);
        });
    });
}

/**
 * 页面导航
 */
function navigateToPage(page) {
    console.log('准备跳转到页面:', page);
    switch(page) {
        case 'index':
            // 当前页面，不需要跳转
            console.log('已经在首页，无需跳转');
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
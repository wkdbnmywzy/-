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
    }, 1000);
});

/**
 * 初始化底部导航栏
 */
function initBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', function() {
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
    switch(page) {
        case 'index':
            // 当前页面，不需要跳转
            break;
        case 'task':
            window.location.href = 'task.html';
            break;
        case 'profile':
            window.location.href = 'profile.html';
            break;
    }
}
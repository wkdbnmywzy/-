// 管理员通用 JavaScript（用于非导航页面）

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    checkLoginStatus();
    
    // 初始化事件监听
    initEventListeners();
});

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    
    if (!isLoggedIn || (currentUser.role !== 'manager' && !currentUser.isAdmin)) {
        // 未登录或不是管理员，跳转到登录页
        window.location.href = 'login.html';
        return;
    }
    
    console.log('管理员已登录:', currentUser);
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
}

// 处理导航切换
function handleNavigation(page) {
    console.log('导航到:', page);

    // 根据不同页面跳转
    switch(page) {
        case 'admin-navigation':
            window.location.href = 'admin_index.html';
            break;
        case 'admin-data':
            // 跳转到工地监控页面
            window.location.href = 'admin_data.html';
            break;
        case 'admin-transport':
            window.location.href = 'admin_transport.html';
            break;
        case 'admin-profile':
            window.location.href = 'admin_profile.html';
            break;
    }
}

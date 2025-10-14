// profile.js - 我的页面功能

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

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    if (!checkLoginStatus()) {
        return;
    }

    console.log('我的页面初始化...');

    // 初始化导航栏
    initNavigation();

    // 初始化退出登录按钮
    initLogout();

    // 加载用户信息
    loadUserInfo();
});

// 初始化导航栏
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;

            // 更新导航栏状态
            navItems.forEach(nav => {
                nav.classList.remove('active');
                const img = nav.querySelector('.nav-icon-img');
                const text = nav.querySelector('.nav-text');
                if (img) {
                    img.src = img.dataset.inactive;
                }
                if (text) {
                    text.style.color = '#666666';
                }
            });

            this.classList.add('active');
            const activeImg = this.querySelector('.nav-icon-img');
            const activeText = this.querySelector('.nav-text');
            if (activeImg) {
                activeImg.src = activeImg.dataset.active;
            }
            if (activeText) {
                activeText.style.color = '#5BA8E3';
            }

            // 页面跳转
            if (page === 'index') {
                window.location.href = 'index.html';
            } else if (page === 'task') {
                window.location.href = 'task.html';
            } else if (page === 'profile') {
                // 当前页面，不需要跳转
            }
        });
    });
}

// 初始化退出登录功能
function initLogout() {
    const logoutBtn = document.getElementById('logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // 显示确认对话框
            if (confirm('确定要退出登录吗？')) {
                // 清除所有登录相关的 session 信息
                sessionStorage.removeItem('isLoggedIn');
                sessionStorage.removeItem('currentUser');
                sessionStorage.removeItem('loginTime');
                sessionStorage.removeItem('loginType');
                sessionStorage.removeItem('projectSelection');
                sessionStorage.removeItem('vehicleInfo');

                // 清除用户信息
                localStorage.removeItem('userInfo');

                console.log('已清除所有登录信息');

                // 跳转到登录页面
                window.location.href = 'login.html';
            }
        });
    }
}

// 加载用户信息
function loadUserInfo() {
    // 尝试从 sessionStorage 获取车辆信息
    const vehicleInfoStr = sessionStorage.getItem('vehicleInfo');
    const currentUserStr = sessionStorage.getItem('currentUser');

    if (vehicleInfoStr) {
        try {
            const vehicleInfo = JSON.parse(vehicleInfoStr);
            // 从车辆信息中获取用户数据
            const currentUser = currentUserStr ? JSON.parse(currentUserStr) : {};
            updateUserDisplay({
                driverName: vehicleInfo.driverName || currentUser.username || '未设置',
                phoneNumber: currentUser.phone || '未设置',
                licensePlate: vehicleInfo.licensePlate || '未设置'
            });
            return;
        } catch (e) {
            console.error('解析车辆信息失败:', e);
        }
    }

    // 如果没有车辆信息，尝试从当前用户获取
    if (currentUserStr) {
        try {
            const currentUser = JSON.parse(currentUserStr);
            // 对于固定车辆，尝试从 localStorage 加载
            if (currentUser.username) {
                const userVehiclesStr = localStorage.getItem('userVehicles');
                if (userVehiclesStr) {
                    const userVehicles = JSON.parse(userVehiclesStr);
                    const userVehicle = userVehicles[currentUser.username];
                    if (userVehicle) {
                        updateUserDisplay(userVehicle);
                        return;
                    }
                }
            }

            // 使用当前用户信息
            updateUserDisplay({
                driverName: currentUser.username,
                phoneNumber: currentUser.phone || '',
                licensePlate: ''
            });
            return;
        } catch (e) {
            console.error('解析用户信息失败:', e);
        }
    }

    // 尝试从 localStorage 获取旧的用户信息（兼容性）
    const userInfoStr = localStorage.getItem('userInfo');
    if (userInfoStr) {
        try {
            const user = JSON.parse(userInfoStr);
            updateUserDisplay(user);
            return;
        } catch (e) {
            console.error('解析用户信息失败:', e);
        }
    }

    // 使用默认信息
    useDefaultInfo();
}

// 更新用户显示
function updateUserDisplay(user) {
    const nameElement = document.querySelector('.driver-name');
    const phoneElement = document.querySelector('.contact-item:first-child .contact-text');
    const plateElement = document.querySelector('.contact-item:last-child .contact-text');

    // 支持多种数据格式
    const driverName = user.driverName || user.name || '未设置';
    const phoneNumber = user.phoneNumber || user.phone || '未设置';
    const licensePlate = user.licensePlate || user.plateNumber || '未设置';

    if (nameElement) {
        nameElement.textContent = driverName;
    }

    if (phoneElement) {
        phoneElement.textContent = phoneNumber;
    }

    if (plateElement) {
        // 格式化车牌号显示（添加空格）
        if (licensePlate && licensePlate !== '未设置' && licensePlate.length >= 2) {
            // 如果车牌号是"京A12345"格式，转换为"京A 12345"
            const formatted = licensePlate.substring(0, 2) + ' ' + licensePlate.substring(2);
            plateElement.textContent = formatted;
        } else {
            plateElement.textContent = licensePlate;
        }
    }

    console.log('用户信息已更新:', { driverName, phoneNumber, licensePlate });
}

// 使用默认信息
function useDefaultInfo() {
    console.log('使用默认用户信息');
    // 默认信息已在HTML中设置，这里不需要额外处理
}

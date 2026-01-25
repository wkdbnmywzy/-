// 管理员我的页面 JavaScript

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    checkLoginStatus();

    // 加载用户信息
    loadUserInfo();

    // 初始化事件监听
    initEventListeners();

    // 更新消息中心未读数量
    updateMessageBadge();
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

// 加载用户信息
function loadUserInfo() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const driverNameElement = document.querySelector('.driver-name');

    if (driverNameElement && currentUser.username) {
        driverNameElement.textContent = currentUser.username;
    }
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

    // 退出登录按钮
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // 切换项目按钮
    const switchProjectBtn = document.getElementById('switch-project');
    if (switchProjectBtn) {
        switchProjectBtn.addEventListener('click', function() {
            console.log('[切换项目] 显示项目选择卡片');
            showAdminProjectSelection();
        });
    }

    // 消息中心按钮
    const messageCenterBtn = document.getElementById('message-center');
    if (messageCenterBtn) {
        messageCenterBtn.addEventListener('click', function() {
            console.log('[消息中心] 打开消息中心');
            window.location.href = 'admin_messages.html';
        });
    }

    // 监听消息更新事件
    window.addEventListener('messageUpdated', function(e) {
        updateMessageBadge();
    });
}

// 更新消息中心未读数量
function updateMessageBadge() {
    const badge = document.getElementById('message-badge');
    if (!badge) return;

    // 检查消息管理器是否可用
    if (typeof AdminMessageManager === 'undefined') {
        badge.style.display = 'none';
        return;
    }

    const unreadCount = AdminMessageManager.getUnreadCount();

    if (unreadCount > 0) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
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
            // 跳转到外部工地数据系统
            window.location.href = 'http://sztymap.0x3d.cn:11080/#/pages/login/login';
            break;
        case 'admin-transport':
            window.location.href = 'admin_transport.html';
            break;
        case 'admin-profile':
            // 当前就是我的页面
            break;
    }
}

// 处理退出登录
function handleLogout() {
    // 确认退出
    if (confirm('确定要退出登录吗？')) {
        // 清除登录信息
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('loginTime');
        sessionStorage.removeItem('loginType');

        console.log('已退出登录');

        // 跳转到登录页
        window.location.href = 'login.html';
    }
}

// ========== 管理员项目切换功能 ==========

// 显示项目选择卡片
function showAdminProjectSelection() {
    const projectCard = document.getElementById('admin-project-card');
    const projectOverlay = document.getElementById('project-overlay');
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

    if (!projectCard) {
        console.error('[切换项目] 项目选择卡片不存在');
        return;
    }

    // 显示遮罩层
    if (projectOverlay) {
        projectOverlay.classList.remove('hidden');
        setTimeout(() => {
            projectOverlay.classList.add('show');
        }, 10);
    }

    // 显示卡片
    projectCard.classList.remove('hidden');

    // 初始化项目选择器
    initAdminProjectPicker(currentUser.projects || []);

    // 绑定事件（只绑定一次）
    if (!projectCard.dataset.eventsBound) {
        // 关闭按钮
        const backBtn = document.getElementById('admin-project-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', hideAdminProjectSelection);
        }

        // 确定按钮
        const confirmBtn = document.getElementById('admin-confirm-project-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', confirmAdminProjectSelection);
        }

        // 点击遮罩层关闭
        if (projectOverlay) {
            projectOverlay.addEventListener('click', hideAdminProjectSelection);
        }

        projectCard.dataset.eventsBound = 'true';
    }
}

// 隐藏项目选择卡片
function hideAdminProjectSelection() {
    const projectCard = document.getElementById('admin-project-card');
    const projectOverlay = document.getElementById('project-overlay');

    if (projectCard) {
        projectCard.classList.add('hidden');
    }

    if (projectOverlay) {
        projectOverlay.classList.remove('show');
        setTimeout(() => {
            projectOverlay.classList.add('hidden');
        }, 300);
    }
}

// 初始化项目选择器
function initAdminProjectPicker(projects) {
    console.log('[切换项目] 初始化项目选择器，项目数量:', projects.length);
    console.log('[切换项目] 所有项目:', projects);

    // 按省份分组项目
    const projectsByProvince = {};
    projects.forEach(project => {
        // 优先使用 province 字段，其次是 provinceName
        const province = project.province || project.provinceName || '未知省份';
        if (!projectsByProvince[province]) {
            projectsByProvince[province] = [];
        }
        projectsByProvince[province].push(project);
    });

    const provinces = Object.keys(projectsByProvince);
    console.log('[切换项目] 省份列表:', provinces);
    console.log('[切换项目] 按省份分组后的项目:', projectsByProvince);

    // 初始化省份列和项目列
    const provinceColumn = document.getElementById('admin-province-column');
    const projectColumn = document.getElementById('admin-project-column');

    if (!provinceColumn || !projectColumn) {
        console.error('[切换项目] 选择器列不存在');
        return;
    }

    let selectedProvince = provinces[0];
    let selectedProject = null;
    let provincePicker = null;
    let projectPicker = null;
    let currentProjectList = []; // 保存当前项目列表，供onChange使用

    // 创建省份选择器
    provincePicker = new WheelPicker(
        provinceColumn,
        provinces,
        function(province) {
            console.log('[切换项目] 省份轮盘onChange触发:', province);
            selectedProvince = province;
            updateProjectColumn(province);
        }
    );

    // 更新项目列
    function updateProjectColumn(province) {
        const projectList = projectsByProvince[province] || [];
        console.log('[切换项目] updateProjectColumn被调用:', {
            province: province,
            projectList: projectList,
            projectCount: projectList.length
        });

        currentProjectList = projectList; // 更新当前项目列表
        const projectNames = projectList.map(p => p.projectName);

        if (projectPicker) {
            console.log('[切换项目] 更新已存在的项目选择器，项目数:', projectNames.length);
            projectPicker.updateItems(projectNames);
            // updateItems会调用updateSelection(0)，触发onChange，此时会用currentProjectList[0]
        } else {
            // 第一次创建选择器
            projectPicker = new WheelPicker(
                projectColumn,
                projectNames,
                function(projectName, index) {
                    selectedProject = currentProjectList[index]; // 使用外部的currentProjectList
                    console.log('[切换项目] 项目轮盘onChange触发:', {
                        projectName: projectName,
                        index: index,
                        selectedProject: selectedProject
                    });
                }
            );
        }

        // 确保selectedProject被正确设置
        if (!selectedProject && currentProjectList.length > 0) {
            selectedProject = currentProjectList[0];
        }
    }

    // 初始化项目列
    updateProjectColumn(selectedProvince);

    // 保存选中状态到全局
    window.adminProjectSelection = {
        getSelected: () => ({ province: selectedProvince, project: selectedProject })
    };
}

// 轮盘选择器类
class WheelPicker {
    constructor(element, items, onChange) {
        this.element = element;
        this.items = items;
        this.onChange = onChange;
        this.selectedIndex = 0;
        this.itemHeight = 40;

        this.isDragging = false;
        this.startY = 0;
        this.startTranslate = 0;
        this.currentTranslate = 0;

        this.init();
    }

    init() {
        this.render();
        this.attachEvents();
        this.updateSelection(0, false);
    }

    render() {
        this.element.innerHTML = '';
        this.items.forEach((item, index) => {
            const itemElement = document.createElement('div');
            itemElement.className = 'picker-item';
            itemElement.textContent = item;
            itemElement.dataset.index = index;
            this.element.appendChild(itemElement);
        });
    }

    attachEvents() {
        // 触摸事件
        this.element.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.element.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.element.addEventListener('touchend', this.handleTouchEnd.bind(this));

        // 鼠标事件
        this.element.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mousemove', this.handleMouseMove.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));

        // 点击事件
        this.element.addEventListener('click', this.handleClick.bind(this));
    }

    handleTouchStart(e) {
        this.isDragging = true;
        this.startY = e.touches[0].clientY;
        this.startTranslate = this.currentTranslate;
        this.element.style.transition = 'none';
    }

    handleTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const currentY = e.touches[0].clientY;
        const deltaY = currentY - this.startY;
        this.currentTranslate = this.startTranslate + deltaY;

        this.element.style.transform = `translateY(${this.currentTranslate}px)`;
        this.updateItemStyles();
    }

    handleTouchEnd() {
        if (!this.isDragging) return;
        this.isDragging = false;

        const index = Math.round(-this.currentTranslate / this.itemHeight);
        this.updateSelection(index, true);
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.startY = e.clientY;
        this.startTranslate = this.currentTranslate;
        this.element.style.transition = 'none';
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const currentY = e.clientY;
        const deltaY = currentY - this.startY;
        this.currentTranslate = this.startTranslate + deltaY;

        this.element.style.transform = `translateY(${this.currentTranslate}px)`;
        this.updateItemStyles();
    }

    handleMouseUp() {
        if (!this.isDragging) return;
        this.isDragging = false;

        const index = Math.round(-this.currentTranslate / this.itemHeight);
        this.updateSelection(index, true);
    }

    handleClick(e) {
        const item = e.target.closest('.picker-item');
        if (!item) return;

        const index = parseInt(item.dataset.index);
        this.updateSelection(index, true);
    }

    updateSelection(index, animate = false) {
        index = Math.max(0, Math.min(index, this.items.length - 1));
        this.selectedIndex = index;

        this.currentTranslate = -index * this.itemHeight;

        if (animate) {
            this.element.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        }

        this.element.style.transform = `translateY(${this.currentTranslate}px)`;

        this.updateItemStyles();

        if (this.onChange) {
            this.onChange(this.items[index], index);
        }
    }

    updateItemStyles() {
        const items = this.element.querySelectorAll('.picker-item');
        items.forEach((item, index) => {
            const offset = Math.abs(index - this.selectedIndex);

            if (offset === 0) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    updateItems(newItems) {
        this.items = newItems;
        this.render();
        this.updateSelection(0, true);
    }
}

// 确认项目选择
function confirmAdminProjectSelection() {
    const selection = window.adminProjectSelection?.getSelected();

    console.log('[切换项目] window.adminProjectSelection:', window.adminProjectSelection);
    console.log('[切换项目] getSelected()返回:', selection);

    if (!selection || !selection.project) {
        alert('请选择项目');
        return;
    }

    console.log('[切换项目] 选择的项目完整信息:', {
        province: selection.province,
        projectName: selection.project.projectName,
        projectCode: selection.project.projectCode,
        projectId: selection.project.id,
        fullProject: selection.project
    });

    // 保存项目选择（包含完整的项目信息以避免重名项目混淆）
    const projectSelection = {
        province: selection.province,
        project: selection.project.projectName,
        projectCode: selection.project.projectCode || selection.project.id, // 保存唯一ID
        projectId: selection.project.id,
        timestamp: new Date().toISOString()
    };

    console.log('[切换项目] 即将保存到sessionStorage:', projectSelection);
    sessionStorage.setItem('projectSelection', JSON.stringify(projectSelection));

    // 验证保存是否成功
    const saved = sessionStorage.getItem('projectSelection');
    console.log('[切换项目] 保存后读取验证:', saved);

    // ========== 清除旧的地图数据缓存 ==========
    console.log('[切换项目] 清除旧的地图数据缓存...');

    // 清除KML相关数据
    sessionStorage.removeItem('kmlRawData');        // 原始KML文本
    sessionStorage.removeItem('kmlFileName');       // KML文件名
    sessionStorage.removeItem('kmlData');           // 结构化KML数据（点位列表）
    sessionStorage.removeItem('processedKMLData');  // 处理后的KML数据

    // 清除路线规划相关数据
    sessionStorage.removeItem('routePlanningData'); // 路线规划数据
    sessionStorage.removeItem('navigationRoute');   // 导航路线数据

    // 清除选中位置
    sessionStorage.removeItem('selectedLocation');  // 选中的位置

    console.log('[切换项目] 缓存清除完成');
    // ==========================================

    // 隐藏卡片
    hideAdminProjectSelection();

    // 刷新页面
    window.location.reload();
}

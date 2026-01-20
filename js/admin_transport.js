// 运输管理页面 JavaScript

// API 基础 URL
const API_BASE_URL = 'http://115.159.67.12:8086/api/transport';

// 当前查看的任务ID
let currentViewTaskId = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    checkLoginStatus();

    // 初始化事件监听
    initEventListeners();

    // 加载任务数据
    loadTaskData();
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

    // 顶部标签切换
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.addEventListener('click', function() {
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });

    // 新增任务按钮
    const addTaskBtn = document.querySelector('.add-task-btn');
    if (addTaskBtn) {
        addTaskBtn.addEventListener('click', function() {
            showPage('addTaskPage');
            // 加载表单所需的数据
            loadAddTaskFormData();
        });
    }

    // 初始化任务列表交互
    initTaskListInteractions();

    // 初始化全屏页面交互
    initPageInteractions();

    // 初始化统计卡片展开/收起功能
    initStatsCardToggle();

    // 初始化日期选择器
    initVehicleDateSelector();

    // 加载车辆进出数据
    loadVehicleData();
}

// 切换标签页
function switchTab(tab) {
    // 更新标签样式
    const tabItems = document.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        if (item.dataset.tab === tab) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 切换内容显示
    const vehicleTab = document.getElementById('vehicle-tab');
    const taskTab = document.getElementById('task-tab');

    if (tab === 'vehicle') {
        vehicleTab.style.display = 'block';
        taskTab.style.display = 'none';
    } else {
        vehicleTab.style.display = 'none';
        taskTab.style.display = 'block';
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
            // 当前就是运输管理页面
            break;
        case 'admin-profile':
            window.location.href = 'admin_profile.html';
            break;
    }
}

/**
 * 初始化统计卡片展开/收起功能
 */
function initStatsCardToggle() {
    // 选择所有统计卡片的header
    const statsHeaders = document.querySelectorAll('.stats-card .stats-header');

    statsHeaders.forEach(header => {
        header.addEventListener('click', function() {
            // 找到对应的stats-content
            const statsCard = this.closest('.stats-card');
            const statsContent = statsCard.querySelector('.stats-content');
            const chevronIcon = this.querySelector('.fa-chevron-right, .fa-chevron-down');

            // 找到紧跟在当前stats-card后面的列表（task-list 或 vehicle-list）
            let dataList = statsCard.nextElementSibling;
            // 确保找到的是列表元素（task-list 或 vehicle-list）
            while (dataList && !dataList.classList.contains('task-list') && !dataList.classList.contains('vehicle-list')) {
                dataList = dataList.nextElementSibling;
            }

            if (!statsContent) return;

            // 切换展开/收起状态
            const isExpanded = statsContent.classList.contains('expanded');

            if (isExpanded) {
                // 收起
                statsContent.classList.remove('expanded');
                if (dataList) {
                    dataList.classList.remove('expanded');
                }
                if (chevronIcon) {
                    chevronIcon.classList.remove('fa-chevron-down');
                    chevronIcon.classList.add('fa-chevron-right');
                }
            } else {
                // 展开
                statsContent.classList.add('expanded');
                if (dataList) {
                    dataList.classList.add('expanded');
                }
                if (chevronIcon) {
                    chevronIcon.classList.remove('fa-chevron-right');
                    chevronIcon.classList.add('fa-chevron-down');
                }
            }
        });

        // 添加鼠标悬停效果
        header.style.cursor = 'pointer';
    });
}

/**
 * 初始化车辆进出日期选择器
 */
function initVehicleDateSelector() {
    const dateSelector = document.getElementById('vehicleDateSelector');
    if (!dateSelector) return;

    dateSelector.addEventListener('click', function(e) {
        e.stopPropagation();
        showVehicleDatePicker();
    });
}

/**
 * 显示车辆进出日期选择器（一周内的日期）
 */
function showVehicleDatePicker() {
    // 创建日期选择弹窗
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    const picker = document.createElement('div');
    picker.style.cssText = `
        background: white;
        border-radius: 8px;
        padding: 20px;
        width: 80%;
        max-width: 300px;
        max-height: 400px;
        overflow-y: auto;
    `;

    // 生成最近7天的日期选项
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        dates.push(date);
    }

    // 创建日期选项列表
    let html = '<div style="font-size: 18px; font-weight: bold; margin-bottom: 15px; text-align: center;">选择日期</div>';
    dates.forEach((date, index) => {
        const dateStr = formatDateYYYYMMDD(date);
        const displayText = index === 0 ? '今日' : formatDateDisplay(date);
        html += `
            <div class="date-option" data-date="${dateStr}" style="
                padding: 12px;
                margin: 8px 0;
                border: 1px solid #ddd;
                border-radius: 4px;
                cursor: pointer;
                text-align: center;
                transition: all 0.2s;
            ">
                ${displayText} (${dateStr})
            </div>
        `;
    });

    picker.innerHTML = html;
    overlay.appendChild(picker);
    document.body.appendChild(overlay);

    // 添加悬停效果
    const options = picker.querySelectorAll('.date-option');
    options.forEach(option => {
        option.addEventListener('mouseenter', function() {
            this.style.background = '#f0f0f0';
        });
        option.addEventListener('mouseleave', function() {
            this.style.background = 'white';
        });
        option.addEventListener('click', function() {
            const selectedDate = this.dataset.date;
            const displayText = this.textContent.split('(')[0].trim();
            onVehicleDateSelected(selectedDate, displayText);
            document.body.removeChild(overlay);
        });
    });

    // 点击遮罩关闭
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
        }
    });
}

/**
 * 当选择日期后的回调
 */
function onVehicleDateSelected(dateStr, displayText) {
    console.log('[日期选择] 选择了日期:', dateStr, displayText);

    // 更新显示文本
    const dateTextEl = document.getElementById('vehicleDateText');
    if (dateTextEl) {
        dateTextEl.textContent = displayText;
    }

    // 重新加载该日期的车辆数据
    loadVehicleData(dateStr);
}

/**
 * 格式化日期显示（如：01月20日）
 */
function formatDateDisplay(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}月${day}日`;
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 */
function formatDateYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 测试获取任务地点详情
 * @param {number} locationId - 地点ID
 */
async function testGetLocationDetail(locationId) {
    const token = sessionStorage.getItem('authToken') || '';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // 尝试几个可能的API端点
    const possibleAPIs = [
        `https://dmap.cscec3bxjy.cn/api/transport/task-locations/${locationId}`,
        `https://dmap.cscec3bxjy.cn/api/transport/locations/${locationId}`,
        `https://dmap.cscec3bxjy.cn/api/map/points/${locationId}`
    ];

    console.log('[地点查询] ========== 测试获取地点详情 ==========');
    console.log('[地点查询] 地点ID:', locationId);

    for (const url of possibleAPIs) {
        try {
            console.log('[地点查询] 尝试API:', url);
            const response = await fetch(url, { method: 'GET', headers });
            console.log('[地点查询] 响应状态:', response.status);

            if (response.ok) {
                const data = await response.json();
                console.log('[地点查询] ✓ 成功！返回数据:', data);
                console.log('[地点查询] ===========================================');
                return data;
            } else {
                console.log('[地点查询] ✗ 失败');
            }
        } catch (e) {
            console.log('[地点查询] ✗ 错误:', e.message);
        }
    }
    console.log('[地点查询] ===========================================');
    return null;
}

// 暴露到全局，方便测试
window.testGetLocationDetail = testGetLocationDetail;

/**
 * 状态码映射表
 * 0=草稿, 1=已下发, 2=进行中, 3=已完成, 4=已取消
 */
const STATUS_MAP = {
    0: '草稿',
    1: '已下发',
    2: '进行中',
    3: '已完成',
    4: '已取消'
};

/**
 * 车辆类型映射表（仅用于显示）
 */
const VEHICLE_TYPE_MAP = {
    1: '小型车',
    2: '中型车',
    3: '大型车',
    4: '特种车'
};

/**
 * 加载车辆进出数据
 * 使用专门的车辆进出统计API
 * @param {string} dateStr - 可选的日期参数 (YYYY-MM-DD)，不传则默认为今日
 */
async function loadVehicleData(dateStr) {
    try {
        console.log('[车辆进出] 开始加载车辆数据...');

        // 1. 获取项目ID
        const projectId = getProjectId();
        if (!projectId) {
            console.warn('[车辆进出] 未找到项目ID');
            return;
        }
        console.log('[车辆进出] 项目ID:', projectId);

        // 2. 获取token
        const token = sessionStorage.getItem('authToken') || '';

        // 3. 构建请求headers
        const headers = {
            'accept': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 4. 使用车辆进出统计API
        const baseURL = 'http://115.159.67.12:8086/api/transport/statistics';

        // 获取Dashboard数据（包含车辆列表）
        let dashboardUrl = `${baseURL}/dashboard?projectId=${projectId}`;

        // 如果传入了日期参数，添加到URL
        if (dateStr) {
            dashboardUrl += `&date_from=${dateStr}&date_to=${dateStr}`;
            console.log('[车辆进出] 查询日期:', dateStr);
        } else {
            console.log('[车辆进出] 查询今日数据');
        }

        console.log('[车辆进出] 请求Dashboard API:', dashboardUrl);

        const dashboardResponse = await fetch(dashboardUrl, {
            method: 'GET',
            headers,
            credentials: 'omit'
        });

        if (!dashboardResponse.ok) {
            console.warn('[车辆进出] Dashboard请求失败:', dashboardResponse.status);
            return;
        }

        const dashboardData = await dashboardResponse.json();
        console.log('[车辆进出] Dashboard数据:', dashboardData);

        let tempCount = 0;
        let fixedCount = 0;
        const vehicleList = [];

        if (dashboardData.code === 200 && dashboardData.data) {
            const data = dashboardData.data;

            // 获取统计数据
            tempCount = data.tempCount || 0;
            fixedCount = data.fixedCount || 0;

            // 获取车辆列表
            const list = data.list || [];

            // 转换数据格式
            list.forEach(vehicle => {
                vehicleList.push({
                    attribute: vehicle.attribute,           // 车辆属性（临时车/固定车）
                    plate_number: vehicle.plateNumber,      // 车牌号
                    task_status: vehicle.taskStatus,        // 任务状态
                    entry_time: vehicle.entryTime,          // 入场时间
                    exit_time: vehicle.exitTime || null     // 离场时间（可能为空）
                });
            });

            console.log('[车辆进出] 统计数据:', {
                临时车辆: tempCount,
                固定车辆: fixedCount,
                车辆总数: vehicleList.length,
                车辆列表: vehicleList
            });
        }

        // 5. 更新页面显示
        updateVehicleStats(tempCount, fixedCount);

        // 6. 渲染车辆列表
        renderVehicleList(vehicleList);

        console.log('[车辆进出] ✓ 车辆数据加载完成');

    } catch (error) {
        console.error('[车辆进出] ========== 加载失败 ==========');
        console.error('[车辆进出] 错误类型:', error.name);
        console.error('[车辆进出] 错误信息:', error.message);
        console.error('[车辆进出] ===================================');

        // 失败时显示0
        updateVehicleStats(0, 0);
    }
}

/**
 * 更新车辆统计数据
 * @param {number} tempCount - 临时车辆数量
 * @param {number} fixedCount - 固定车辆数量
 */
function updateVehicleStats(tempCount, fixedCount) {
    // 更新车辆进出管理页面的统计数字
    const statNumbers = document.querySelectorAll('#vehicle-tab .stats-row .stat-number');
    if (statNumbers.length >= 2) {
        statNumbers[0].textContent = tempCount;  // 临时车辆
        statNumbers[1].textContent = fixedCount; // 固定车辆
    }
    console.log('[车辆进出] 统计数据已更新 - 临时:', tempCount, '固定:', fixedCount);
}

/**
 * 渲染车辆列表
 * @param {Array} vehicles - 车辆列表
 */
function renderVehicleList(vehicles) {
    const listBody = document.querySelector('#vehicle-tab .list-body');
    if (!listBody) {
        console.warn('[车辆进出] 未找到车辆列表容器');
        return;
    }

    // 清空现有列表
    listBody.innerHTML = '';

    if (!vehicles || vehicles.length === 0) {
        console.log('[车辆进出] 无车辆数据');
        return;
    }

    // 渲染每辆车
    vehicles.forEach(vehicle => {
        // 判断车辆属性（临时车/固定车）
        const vehicleAttr = vehicle.attribute || '临时车';
        const vehicleClass = vehicleAttr === '固定车' ? 'fixed' : 'temporary';

        // 任务进度
        const taskStatus = vehicle.task_status || '无任务';

        // 格式化入场时间
        const entryTime = formatDateTime(vehicle.entry_time);

        const itemHtml = `
            <div class="list-item">
                <div class="col-data vehicle-type ${vehicleClass}">${vehicleAttr}</div>
                <div class="col-data">${vehicle.plate_number}</div>
                <div class="col-data task-progress">${taskStatus}</div>
                <div class="col-data">${entryTime}</div>
            </div>
        `;

        listBody.insertAdjacentHTML('beforeend', itemHtml);
    });

    console.log('[车辆进出] 车辆列表渲染完成，共', vehicles.length, '辆');
}

/**
 * 格式化日期时间
 * @param {string} dateTimeStr - ISO格式的日期时间字符串
 * @returns {string} 格式化后的字符串，如 "01-09 00:00"
 */
function formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '-';

    try {
        const date = new Date(dateTimeStr);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');

        return `${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
        console.warn('[时间格式化] 失败:', dateTimeStr);
        return '-';
    }
}

/**
 * 加载任务数据
 * 使用 GET /api/transport/tasks/project/{project_id} 接口
 */
async function loadTaskData() {
    try {
        console.log('[运输管理] 开始加载任务数据...');

        // 1. 获取项目ID
        const projectId = getProjectId();
        if (!projectId) {
            console.warn('[运输管理] 未找到项目ID');
            return;
        }
        console.log('[运输管理] 项目ID:', projectId);

        // 2. 获取token
        const token = sessionStorage.getItem('authToken') || '';

        // 3. 构建请求headers
        const headers = {
            'accept': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 4. 获取所有任务数据
        const baseURL = 'http://115.159.67.12:8086/api/transport';
        const tasksUrl = `${baseURL}/tasks/project/${projectId}?page=1&page_size=1000`;

        console.log('[运输管理] 请求任务列表URL:', tasksUrl);

        const tasksResponse = await fetch(tasksUrl, {
            method: 'GET',
            headers,
            credentials: 'omit'
        });

        if (!tasksResponse.ok) {
            console.error('[运输管理] 任务列表请求失败:', tasksResponse.status);
            return;
        }

        const tasksData = await tasksResponse.json();
        console.log('[运输管理] 任务列表响应:', tasksData);

        // 获取今天的日期（只比较年月日）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();
        console.log('[运输管理] 今日日期:', today.toLocaleDateString());

        if (tasksData.code === 200 && tasksData.data) {
            const allTasks = tasksData.data.list || tasksData.data || [];
            console.log('[运输管理] 任务总数:', allTasks.length);

            // 5. 根据入场和离场时间筛选今日任务和历史任务
            const todayTasks = [];
            const historyTasks = [];

            allTasks.forEach(task => {
                // 获取任务的入场和离场时间
                const entryStartTime = task.entry_start_time;
                const exitStartTime = task.exit_start_time;

                if (entryStartTime && exitStartTime) {
                    try {
                        // 解析入场时间
                        const entryDate = new Date(entryStartTime);
                        entryDate.setHours(0, 0, 0, 0);
                        const entryTime = entryDate.getTime();

                        // 解析离场时间
                        const exitDate = new Date(exitStartTime);
                        exitDate.setHours(0, 0, 0, 0);
                        const exitTime = exitDate.getTime();

                        // 判断任务是否与今天相关：
                        // 1. 今天在入场和离场时间范围内（任务跨越今天）
                        // 2. 入场时间是今天
                        // 3. 离场时间是今天
                        const isToday = (entryTime <= todayTime && exitTime >= todayTime);

                        if (isToday) {
                            todayTasks.push(task);
                        } else {
                            historyTasks.push(task);
                        }
                    } catch (error) {
                        console.warn('[运输管理] 解析任务时间失败:', entryStartTime, exitStartTime, error);
                        // 解析失败的任务归为历史任务
                        historyTasks.push(task);
                    }
                } else {
                    // 没有完整时间信息的任务归为历史任务
                    historyTasks.push(task);
                }
            });

            console.log('[运输管理] 今日任务数:', todayTasks.length);
            console.log('[运输管理] 历史任务数:', historyTasks.length);

            // 6. 分别更新统计数据和渲染列表
            updateTodayTaskStats(todayTasks);
            updateHistoryTaskStats(historyTasks);
            renderTodayTaskList(todayTasks);
            renderHistoryTaskList(historyTasks);

            console.log('[运输管理] ✓ 任务数据加载成功');
        } else {
            console.error('[运输管理] API返回错误 - code:', tasksData.code);
        }

    } catch (error) {
        console.error('[运输管理] ========== 加载失败 ==========');
        console.error('[运输管理] 错误信息:', error.message);
        console.error('[运输管理] ===================================');
    }
}

/**
 * 获取当前选择的项目ID
 * @returns {string|null} 项目ID (如 "P000000025")
 */
function getProjectId() {
    try {
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

        if (!projectSelection) {
            console.warn('[运输管理] 未找到项目选择信息');
            return null;
        }

        const selection = JSON.parse(projectSelection);
        const projectName = selection.project;

        // 从用户的项目列表中找到选择的项目
        const userProjects = currentUser.projects || [];

        // 优先使用 projectCode 精确匹配，避免重名项目混淆
        let selectedProject = null;
        if (selection.projectCode) {
            selectedProject = userProjects.find(p =>
                (p.projectCode === selection.projectCode) || (p.id === selection.projectCode)
            );
        }

        // 如果projectCode匹配失败，回退到名称匹配
        if (!selectedProject) {
            selectedProject = userProjects.find(p => p.projectName === projectName);
        }

        if (selectedProject) {
            // projectCode 才是API需要的项目ID
            return selectedProject.projectCode || selectedProject.id;
        }

        console.warn('[运输管理] 未在用户项目列表中找到匹配项目:', projectName);
        return null;

    } catch (error) {
        console.error('[运输管理] 获取项目ID失败:', error);
        return null;
    }
}

/**
 * 更新任务统计数据
 * @param {Array} tasks - 任务列表
 */
function updateTaskStats(tasks) {
    // 统计进行中和已完成的任务
    let ongoingCount = 0;
    let completedCount = 0;
    const typeCount = {};

    tasks.forEach(task => {
        // 使用状态码判断
        const status = task.status;
        // 直接使用 task_name 字段（API已返回中文名称）
        const taskType = task.task_name || '其他';

        // 统计状态 (2=进行中, 3=已完成)
        if (status === 2) {
            ongoingCount++;
        } else if (status === 3) {
            completedCount++;
        }

        // 统计类型
        typeCount[taskType] = (typeCount[taskType] || 0) + 1;
    });

    console.log('[运输管理] 统计数据 - 进行中:', ongoingCount, '已完成:', completedCount, '类型分布:', typeCount);

    // 更新左侧：进行中/已完成任务数
    const statNumbers = document.querySelectorAll('.stats-left .stat-number');
    if (statNumbers.length >= 2) {
        statNumbers[0].textContent = ongoingCount;
        statNumbers[1].textContent = completedCount;
    }

    // 更新右侧：任务类型统计
    const typeStatItems = document.querySelectorAll('.type-stat-item');

    // 获取最常见的3种任务类型
    const sortedTypes = Object.entries(typeCount)
        .sort((a, b) => b[1] - a[1])  // 按数量降序
        .slice(0, 3);  // 取前3个

    sortedTypes.forEach(([typeName, count], index) => {
        if (typeStatItems[index]) {
            const nameSpan = typeStatItems[index].querySelector('.type-name');
            const countSpan = typeStatItems[index].querySelector('.type-count');
            if (nameSpan && countSpan) {
                nameSpan.textContent = typeName;
                countSpan.textContent = count;
            }
        }
    });

    // 如果类型不足3个，隐藏多余的项
    for (let i = sortedTypes.length; i < typeStatItems.length; i++) {
        if (typeStatItems[i]) {
            typeStatItems[i].style.display = 'none';
        }
    }
}

/**
 * 更新今日任务统计数据
 */
function updateTodayTaskStats(tasks) {
    let ongoingCount = 0;
    let completedCount = 0;
    const typeCount = {};

    tasks.forEach(task => {
        const status = task.status;
        const taskType = task.task_name || '其他';

        if (status === 2) {
            ongoingCount++;
        } else if (status === 3) {
            completedCount++;
        }

        typeCount[taskType] = (typeCount[taskType] || 0) + 1;
    });

    console.log('[今日任务] 统计 - 进行中:', ongoingCount, '已完成:', completedCount);

    // 限定在任务标签页内选择统计卡片
    const taskTab = document.querySelector('#task-tab');
    if (!taskTab) return;

    const todayStatsCard = taskTab.querySelectorAll('.stats-card')[0];
    if (todayStatsCard) {
        const statNumbers = todayStatsCard.querySelectorAll('.stats-left .stat-number');
        if (statNumbers.length >= 2) {
            statNumbers[0].textContent = ongoingCount;
            statNumbers[1].textContent = completedCount;
        }

        const typeStatItems = todayStatsCard.querySelectorAll('.type-stat-item');
        const sortedTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

        sortedTypes.forEach(([typeName, count], index) => {
            if (typeStatItems[index]) {
                const nameSpan = typeStatItems[index].querySelector('.type-name');
                const countSpan = typeStatItems[index].querySelector('.type-count');
                if (nameSpan && countSpan) {
                    nameSpan.textContent = typeName;
                    countSpan.textContent = count;
                }
            }
        });
    }
}

/**
 * 更新历史任务统计数据
 */
function updateHistoryTaskStats(tasks) {
    let ongoingCount = 0;
    let completedCount = 0;
    const typeCount = {};

    tasks.forEach(task => {
        const status = task.status;
        const taskType = task.task_name || '其他';

        if (status === 2) {
            ongoingCount++;
        } else if (status === 3) {
            completedCount++;
        }

        typeCount[taskType] = (typeCount[taskType] || 0) + 1;
    });

    console.log('[历史任务] 统计 - 进行中:', ongoingCount, '已完成:', completedCount);

    // 限定在任务标签页内选择统计卡片
    const taskTab = document.querySelector('#task-tab');
    if (!taskTab) return;

    const historyStatsCard = taskTab.querySelectorAll('.stats-card')[1];
    if (historyStatsCard) {
        const statNumbers = historyStatsCard.querySelectorAll('.stats-left .stat-number');
        if (statNumbers.length >= 2) {
            statNumbers[0].textContent = ongoingCount;
            statNumbers[1].textContent = completedCount;
        }

        const typeStatItems = historyStatsCard.querySelectorAll('.type-stat-item');
        const sortedTypes = Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 3);

        sortedTypes.forEach(([typeName, count], index) => {
            if (typeStatItems[index]) {
                const nameSpan = typeStatItems[index].querySelector('.type-name');
                const countSpan = typeStatItems[index].querySelector('.type-count');
                if (nameSpan && countSpan) {
                    nameSpan.textContent = typeName;
                    countSpan.textContent = count;
                }
            }
        });
    }
}

/**
 * 渲染今日任务列表
 */
function renderTodayTaskList(tasks) {
    const listBody = document.querySelector('#today-task-list .list-body');
    if (!listBody) return;

    listBody.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        console.log('[今日任务] 无任务数据');
        return;
    }

    tasks.forEach(task => {
        const taskType = task.task_name || '未知类型';
        const taskStatus = STATUS_MAP[task.status] || '未知';
        const vehicle = task.plate_number || '未分配';

        let statusClass = 'draft';
        if (task.status === 0) statusClass = 'draft';
        else if (task.status === 1) statusClass = 'assigned';
        else if (task.status === 2) statusClass = 'ongoing';
        else if (task.status === 3) statusClass = 'completed';
        else if (task.status === 4) statusClass = 'cancelled';

        const itemHtml = `
            <div class="list-item" data-task-id="${task.id}">
                <div class="col-data task-type">${taskType}</div>
                <div class="col-data task-status ${statusClass}">${taskStatus}</div>
                <div class="col-data">${vehicle}</div>
            </div>
        `;

        listBody.insertAdjacentHTML('beforeend', itemHtml);
    });

    console.log('[今日任务] 列表渲染完成，共', tasks.length, '条');
}

/**
 * 渲染历史任务列表
 */
function renderHistoryTaskList(tasks) {
    const listBody = document.querySelector('#history-task-list .list-body');
    if (!listBody) return;

    listBody.innerHTML = '';

    if (!tasks || tasks.length === 0) {
        console.log('[历史任务] 无任务数据');
        return;
    }

    tasks.forEach(task => {
        const taskType = task.task_name || '未知类型';
        const taskStatus = STATUS_MAP[task.status] || '未知';
        const vehicle = task.plate_number || '未分配';

        let statusClass = 'draft';
        if (task.status === 0) statusClass = 'draft';
        else if (task.status === 1) statusClass = 'assigned';
        else if (task.status === 2) statusClass = 'ongoing';
        else if (task.status === 3) statusClass = 'completed';
        else if (task.status === 4) statusClass = 'cancelled';

        const itemHtml = `
            <div class="list-item" data-task-id="${task.id}">
                <div class="col-data task-type">${taskType}</div>
                <div class="col-data task-status ${statusClass}">${taskStatus}</div>
                <div class="col-data">${vehicle}</div>
            </div>
        `;

        listBody.insertAdjacentHTML('beforeend', itemHtml);
    });

    console.log('[历史任务] 列表渲染完成，共', tasks.length, '条');
}

/**
 * 渲染任务列表
 * @param {Array} tasks - 任务列表
 */
function renderTaskList(tasks) {
    const listBody = document.querySelector('#task-tab .list-body');
    if (!listBody) {
        console.warn('[运输管理] 未找到任务列表容器');
        return;
    }

    // 清空现有列表
    listBody.innerHTML = '';

    // 渲染每个任务
    tasks.forEach(task => {
        // 直接使用 task_name（API已返回中文）
        const taskType = task.task_name || '未知类型';
        const taskStatus = STATUS_MAP[task.status] || '未知';
        const vehicle = task.plate_number || '未分配';

        // 判断状态样式 (0=草稿, 1=已下发, 2=进行中, 3=已完成, 4=已取消)
        let statusClass = 'draft';
        if (task.status === 0) {
            statusClass = 'draft'; // 草稿
        } else if (task.status === 1) {
            statusClass = 'assigned'; // 已下发
        } else if (task.status === 2) {
            statusClass = 'ongoing'; // 进行中
        } else if (task.status === 3) {
            statusClass = 'completed'; // 已完成
        } else if (task.status === 4) {
            statusClass = 'cancelled'; // 已取消
        }

        const itemHtml = `
            <div class="list-item" data-task-id="${task.id}">
                <div class="col-data task-type">${taskType}</div>
                <div class="col-data task-status ${statusClass}">${taskStatus}</div>
                <div class="col-data">${vehicle}</div>
            </div>
        `;

        listBody.insertAdjacentHTML('beforeend', itemHtml);
    });

    console.log('[运输管理] 任务列表渲染完成，共', tasks.length, '条');

    // 自动测试第一个任务的地点查询（如果有task_location_id）
    if (tasks.length > 0 && tasks[0].task_location_id) {
        console.log('[运输管理] 自动测试地点查询...');
        setTimeout(() => {
            testGetLocationDetail(tasks[0].task_location_id);
        }, 1000);
    }
}

/* ========== 新增交互逻辑 ========== */

/**
 * 初始化任务列表交互（气泡菜单）
 */
function initTaskListInteractions() {
    const listBodies = document.querySelectorAll('#task-tab .list-body');
    const popover = document.getElementById('taskActionPopover');
    const deleteBtn = document.getElementById('popoverDeleteBtn');
    const viewBtn = document.getElementById('popoverViewBtn');

    if (listBodies.length === 0 || !popover) return;

    let currentTaskId = null;

    // 为所有列表添加点击事件委托
    listBodies.forEach(listBody => {
        listBody.addEventListener('click', function(e) {
            // 如果点击的是列表项本身或其子元素
            const item = e.target.closest('.list-item');
            if (!item) return;

            e.stopPropagation(); // 阻止冒泡

            // 获取任务ID
            currentTaskId = item.dataset.taskId;

            // 定位气泡
            const rect = item.getBoundingClientRect();
            // 气泡宽度约为140px
            const popoverWidth = 140;

            // 计算位置：居中显示
            let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
            let top = rect.top + (rect.height / 2) - 20; // 稍微上移

            // 强制使用fixed定位，基于视口
            popover.style.position = 'fixed';
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
            popover.style.display = 'block';
        });
    });

    // 点击气泡选项：查看/修改
    if (viewBtn) {
        viewBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            popover.style.display = 'none';
            if (currentTaskId) {
                openViewTaskPage(currentTaskId);
            }
        });
    }

    // 点击气泡选项：删除
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async function(e) {
            e.stopPropagation();
            popover.style.display = 'none';
            // 简单确认
            if (confirm('确定要删除该任务吗？')) {
                console.log('删除任务:', currentTaskId);
                await deleteTask(currentTaskId);
            }
        });
    }

    // 点击页面其他地方关闭气泡
    document.addEventListener('click', function() {
        if (popover) {
            popover.style.display = 'none';
        }
    });
    
    // 阻止气泡本身的点击冒泡
    popover.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

/**
 * 初始化页面交互（全屏弹窗）
 */
function initPageInteractions() {
    // 新增任务页面按钮
    document.getElementById('addCancelBtn')?.addEventListener('click', () => hidePage('addTaskPage'));
    document.getElementById('addConfirmBtn')?.addEventListener('click', () => {
        createNewTask();
    });
    
    // 查看任务页面按钮
    document.getElementById('viewCancelBtn')?.addEventListener('click', () => hidePage('viewTaskPage'));
    document.getElementById('viewSaveBtn')?.addEventListener('click', async () => {
        // 收集表单数据并保存
        if (!currentViewTaskId) {
            alert('未找到任务ID');
            return;
        }

        const formData = collectViewTaskFormData();
        if (!formData) {
            return; // 验证失败，collectViewTaskFormData已显示错误提示
        }

        const success = await updateTask(currentViewTaskId, formData);
        if (success) {
            hidePage('viewTaskPage');
            loadTaskData(); // 刷新列表
        }
    });
    
    // 返回按钮通用处理
    document.querySelectorAll('.back-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const page = this.closest('.sub-page');
            if (page) {
                hidePage(page.id);
            }
        });
    });
}

/**
 * 加载新增任务表单所需的数据
 */
async function loadAddTaskFormData() {
    const projectId = getProjectId();
    if (!projectId) {
        console.warn('[新增任务] 未找到项目ID');
        return;
    }

    // 并行加载定位器和点位数据
    await Promise.all([
        loadLocators(projectId),
        loadTaskLocations()
    ]);

    // 初始化时间选择器
    initDateTimePickers();
}

/**
 * 加载定位器列表
 * @param {string} projectId - 项目ID
 */
async function loadLocators(projectId) {
    try {
        const token = sessionStorage.getItem('authToken') || '';
        const url = `https://dmap.cscec3bxjy.cn/api/transport/tracker/project-locations?projectId=${projectId}`;

        console.log('[新增任务] 加载定位器列表:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            console.error('[新增任务] 加载定位器失败:', response.status);
            return;
        }

        const result = await response.json();
        console.log('[新增任务] 定位器API响应:', result);

        if (result.code === 200 && result.data) {
            const locatorSelect = document.getElementById('addLocator');
            if (!locatorSelect) return;

            // 清空现有选项（保留第一个默认选项）
            locatorSelect.innerHTML = '<option value="">选择定位器编号</option>';

            if (result.data.length === 0) {
                // 如果没有定位器数据，添加提示选项
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '（该项目暂无定位器数据）';
                option.disabled = true;
                locatorSelect.appendChild(option);
                console.log('[新增任务] 该项目暂无定位器数据');
            } else {
                // 添加定位器选项
                result.data.forEach(locator => {
                    const option = document.createElement('option');
                    // 使用TrackerID作为value，PlateNumber作为显示文本
                    option.value = locator.TrackerID;
                    option.textContent = `${locator.PlateNumber} (${locator.TrackerID})`;
                    // 保存额外信息到dataset
                    option.dataset.plateNumber = locator.PlateNumber;
                    option.dataset.trackerId = locator.TrackerID;
                    locatorSelect.appendChild(option);
                });
                console.log('[新增任务] 已加载', result.data.length, '个定位器');
            }
        }
    } catch (error) {
        console.error('[新增任务] 加载定位器失败:', error);
    }
}

/**
 * 加载任务地点（从sessionStorage的kmlData获取已过滤的点位）
 */
async function loadTaskLocations() {
    try {
        console.log('[新增任务] 从sessionStorage加载点位数据...');

        // 从sessionStorage获取kmlData（首页或点位选择界面已经加载并过滤好的数据）
        const kmlDataStr = sessionStorage.getItem('kmlData');

        if (!kmlDataStr) {
            console.warn('[新增任务] sessionStorage中没有kmlData，请先访问首页加载地图数据');
            // 显示提示
            const startPointSelect = document.getElementById('addStartPoint');
            const endPointSelect = document.getElementById('addEndPoint');

            if (startPointSelect && endPointSelect) {
                startPointSelect.innerHTML = '<option value="">请先访问首页加载地图</option>';
                endPointSelect.innerHTML = '<option value="">请先访问首页加载地图</option>';
            }
            return;
        }

        // 解析kmlData
        const kmlDataArray = JSON.parse(kmlDataStr);
        console.log('[新增任务] kmlData数组:', kmlDataArray);

        // 提取所有点位（kmlData是数组，每个元素是一个KML文件的数据）
        const allPoints = [];

        kmlDataArray.forEach(kmlItem => {
            if (kmlItem.points && Array.isArray(kmlItem.points)) {
                kmlItem.points.forEach(point => {
                    allPoints.push({
                        id: point.id || point.name, // 使用ID或名称作为标识
                        name: point.name,
                        position: point.position
                    });
                });
            }
        });

        console.log('[新增任务] 从kmlData提取到的点位数量:', allPoints.length);
        console.log('[新增任务] 点位示例（前5个）:', allPoints.slice(0, 5));

        // 填充起点和终点下拉框
        const startPointSelect = document.getElementById('addStartPoint');
        const endPointSelect = document.getElementById('addEndPoint');

        if (startPointSelect && endPointSelect) {
            // 清空现有选项
            startPointSelect.innerHTML = '<option value="">选择地点</option>';
            endPointSelect.innerHTML = '<option value="">选择地点</option>';

            if (allPoints.length === 0) {
                const startOption = document.createElement('option');
                startOption.value = '';
                startOption.textContent = '（暂无可用点位数据）';
                startOption.disabled = true;
                startPointSelect.appendChild(startOption);

                const endOption = document.createElement('option');
                endOption.value = '';
                endOption.textContent = '（暂无可用点位数据）';
                endOption.disabled = true;
                endPointSelect.appendChild(endOption);

                console.log('[新增任务] 暂无可用点位数据');
            } else {
                // 添加点位选项
                allPoints.forEach((point, index) => {
                    // 起点
                    const startOption = document.createElement('option');
                    startOption.value = index;
                    startOption.textContent = point.name;
                    startOption.dataset.lng = point.position[0];
                    startOption.dataset.lat = point.position[1];
                    if (point.id) startOption.dataset.pointId = point.id;
                    startPointSelect.appendChild(startOption);

                    // 终点
                    const endOption = document.createElement('option');
                    endOption.value = index;
                    endOption.textContent = point.name;
                    endOption.dataset.lng = point.position[0];
                    endOption.dataset.lat = point.position[1];
                    if (point.id) endOption.dataset.pointId = point.id;
                    endPointSelect.appendChild(endOption);
                });

                console.log('[新增任务] 已加载', allPoints.length, '个点位到起点和终点下拉框');
            }
        }
    } catch (error) {
        console.error('[新增任务] 加载地点失败:', error);
    }
}

/**
 * 初始化时间选择器
 */
function initDateTimePickers() {
    // 时间选择器元素
    const entryStartTimeEl = document.getElementById('addEntryStartTime');
    const entryEndTimeEl = document.getElementById('addEntryEndTime');
    const exitStartTimeEl = document.getElementById('addExitStartTime');
    const exitEndTimeEl = document.getElementById('addExitEndTime');

    // 保存选择的时间
    const selectedTimes = {
        entryStart: null,
        entryEnd: null,
        exitStart: null,
        exitEnd: null
    };

    // 绑定点击事件
    if (entryStartTimeEl) {
        entryStartTimeEl.addEventListener('click', () => {
            showDateTimePicker('入场开始时间', (dateTime) => {
                selectedTimes.entryStart = dateTime;
                entryStartTimeEl.innerHTML = `<i class="far fa-calendar-alt"></i> ${formatDateTimeDisplay(dateTime)}`;
            });
        });
    }

    if (entryEndTimeEl) {
        entryEndTimeEl.addEventListener('click', () => {
            showDateTimePicker('入场结束时间', (dateTime) => {
                selectedTimes.entryEnd = dateTime;
                entryEndTimeEl.innerHTML = `<i class="far fa-calendar-alt"></i> ${formatDateTimeDisplay(dateTime)}`;
            });
        });
    }

    if (exitStartTimeEl) {
        exitStartTimeEl.addEventListener('click', () => {
            showDateTimePicker('离场开始时间', (dateTime) => {
                selectedTimes.exitStart = dateTime;
                exitStartTimeEl.innerHTML = `<i class="far fa-calendar-alt"></i> ${formatDateTimeDisplay(dateTime)}`;
            });
        });
    }

    if (exitEndTimeEl) {
        exitEndTimeEl.addEventListener('click', () => {
            showDateTimePicker('离场结束时间', (dateTime) => {
                selectedTimes.exitEnd = dateTime;
                exitEndTimeEl.innerHTML = `<i class="far fa-calendar-alt"></i> ${formatDateTimeDisplay(dateTime)}`;
            });
        });
    }

    // 保存到全局以便在提交时访问
    window.addTaskSelectedTimes = selectedTimes;
}

/**
 * 显示时间选择器（简单实现）
 * @param {string} title - 选择器标题
 * @param {Function} callback - 选择完成后的回调函数
 */
function showDateTimePicker(title, callback) {
    // 使用HTML5的datetime-local输入框
    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.style.position = 'absolute';
    input.style.opacity = '0';
    input.style.pointerEvents = 'none';

    // 设置默认值为当前时间
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    input.value = `${year}-${month}-${day}T${hours}:${minutes}`;

    document.body.appendChild(input);

    input.addEventListener('change', function() {
        if (this.value) {
            // 转换为ISO格式
            const dateTime = new Date(this.value).toISOString();
            callback(dateTime);
        }
        document.body.removeChild(input);
    });

    // 触发点击打开选择器
    input.click();
    input.showPicker();
}

/**
 * 格式化时间显示
 * @param {string} isoDateTime - ISO格式的时间字符串
 * @returns {string} 格式化后的显示文本
 */
function formatDateTimeDisplay(isoDateTime) {
    if (!isoDateTime) return '选择时间';

    const date = new Date(isoDateTime);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * 创建新任务
 */
async function createNewTask() {
    try {
        console.log('[新增任务] 开始创建新任务...');

        // 1. 获取项目ID
        const projectId = getProjectId();
        if (!projectId) {
            alert('未找到项目ID，请先选择项目');
            return;
        }

        // 2. 获取token和用户信息
        const token = sessionStorage.getItem('authToken') || '';
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const publisherId = currentUser.userId || currentUser.id || '';

        if (!token) {
            alert('未登录，请先登录');
            return;
        }

        // 3. 收集表单数据
        const formData = collectTaskFormData();
        if (!formData) {
            return; // 验证失败，collectTaskFormData已显示错误提示
        }

        // 4. 构建请求body
        const requestBody = {
            driver_name: formData.driverName,
            phone: formData.phone,
            plate_number: formData.plateNumber,
            vehicle_type: formData.vehicleType || 0,
            vehicle_id: formData.locatorId || 0, // 使用定位器ID
            task_type: formData.taskType,
            task_name: formData.taskName || '',
            task_detail: formData.taskDetail || '',
            start_point: formData.startPoint || 0,
            end_point: formData.endPoint || 0,
            task_location_id: 0, // 暂时设为0
            entry_start_time: formData.entryStartTime,
            entry_end_time: formData.entryEndTime,
            exit_start_time: formData.exitStartTime,
            exit_end_time: formData.exitEndTime,
            project_id: projectId,
            publisher_id: publisherId,
            publish_date: new Date().toISOString(),
            status: 0 // 0=未开始
        };

        console.log('[新增任务] 请求body:', requestBody);

        // 5. 发送POST请求
        const url = `${API_BASE_URL}/tasks`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        console.log('[新增任务] 请求URL:', url);

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        console.log('[新增任务] 响应状态:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[新增任务] 请求失败:', errorText);
            alert(`创建任务失败: ${response.status} ${response.statusText}`);
            return;
        }

        const result = await response.json();
        console.log('[新增任务] API响应:', result);

        if (result.code === 200) {
            alert('新增任务成功');
            hidePage('addTaskPage');
            // 清空表单
            clearTaskForm();
            // 刷新任务列表
            loadTaskData();
        } else {
            alert(`创建任务失败: ${result.message || '未知错误'}`);
        }

    } catch (error) {
        console.error('[新增任务] 创建失败:', error);
        alert('创建任务时发生错误，请稍后重试');
    }
}

/**
 * 获取任务详情
 */
async function fetchTaskDetail(taskId) {
    try {
        console.log('[任务详情] 获取任务详情:', taskId);

        const token = sessionStorage.getItem('authToken') || '';
        const url = `${API_BASE_URL}/tasks/${taskId}`;
        const headers = {
            'Authorization': `Bearer ${token}`
        };

        console.log('[任务详情] 请求URL:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        console.log('[任务详情] 响应状态:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[任务详情] 请求失败:', errorText);
            alert(`获取任务详情失败: ${response.status} ${response.statusText}`);
            return null;
        }

        const result = await response.json();
        console.log('[任务详情] API响应:', result);

        if (result.code === 200 && result.data) {
            return result.data;
        } else {
            alert(`获取任务详情失败: ${result.message || '未知错误'}`);
            return null;
        }

    } catch (error) {
        console.error('[任务详情] 获取失败:', error);
        alert('获取任务详情时发生错误，请稍后重试');
        return null;
    }
}

/**
 * 删除任务
 */
async function deleteTask(taskId) {
    try {
        console.log('[删除任务] 开始删除任务:', taskId);

        const token = sessionStorage.getItem('authToken') || '';
        const url = `${API_BASE_URL}/tasks/${taskId}`;
        const headers = {
            'Authorization': `Bearer ${token}`
        };

        console.log('[删除任务] 请求URL:', url);

        const response = await fetch(url, {
            method: 'DELETE',
            headers: headers
        });

        console.log('[删除任务] 响应状态:', response.status);

        // DELETE 请求成功时可能返回 200 或 204
        if (response.ok) {
            // 如果是 204 No Content，不解析 JSON
            if (response.status === 204) {
                console.log('[删除任务] 删除成功 (204 No Content)');
                alert('删除成功');
                // 刷新任务列表
                await loadTaskData();
                return;
            }

            // 尝试解析 JSON 响应
            const result = await response.json();
            console.log('[删除任务] API响应:', result);

            if (result.code === 200 || result.code === 0 || !result.code) {
                alert('删除成功');
                // 刷新任务列表
                await loadTaskData();
            } else {
                alert(`删除任务失败: ${result.message || '未知错误'}`);
            }
        } else {
            const errorText = await response.text();
            console.error('[删除任务] 请求失败:', errorText);
            alert(`删除任务失败: ${response.status} ${response.statusText}`);
        }

    } catch (error) {
        console.error('[删除任务] 删除失败:', error);
        alert('删除任务时发生错误，请稍后重试');
    }
}

/**
 * 更新任务
 */
async function updateTask(taskId, taskData) {
    try {
        console.log('[更新任务] 开始更新任务:', taskId);

        const token = sessionStorage.getItem('authToken') || '';
        const url = `${API_BASE_URL}/tasks/${taskId}`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        console.log('[更新任务] 请求URL:', url);
        console.log('[更新任务] 请求body:', taskData);

        const response = await fetch(url, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify(taskData)
        });

        console.log('[更新任务] 响应状态:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[更新任务] 请求失败:', errorText);
            alert(`更新任务失败: ${response.status} ${response.statusText}`);
            return false;
        }

        const result = await response.json();
        console.log('[更新任务] API响应:', result);

        if (result.code === 200) {
            alert('保存成功');
            return true;
        } else {
            alert(`更新任务失败: ${result.message || '未知错误'}`);
            return false;
        }

    } catch (error) {
        console.error('[更新任务] 更新失败:', error);
        alert('更新任务时发生错误，请稍后重试');
        return false;
    }
}

/**
 * 收集查看任务页面的表单数据并验证
 * @returns {Object|null} 表单数据对象，验证失败返回null
 */
function collectViewTaskFormData() {
    const viewTaskPage = document.getElementById('viewTaskPage');
    if (!viewTaskPage) {
        alert('未找到表单');
        return null;
    }

    // 获取项目ID和用户信息
    const projectId = getProjectId();
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const publisherId = currentUser.userId || currentUser.id || '';

    // 获取表单输入值 (根据查看任务页面的表单结构调整选择器)
    const locatorSelect = document.getElementById('viewLocator');
    const plateNumber = viewTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(2) input')?.value.trim();
    const driverName = viewTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(3) input')?.value.trim();
    const phone = viewTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(4) input')?.value.trim();
    const taskTypeSelect = document.getElementById('viewTaskType');
    const taskDetail = viewTaskPage.querySelector('.form-section:nth-child(4) .form-item:nth-child(2) textarea')?.value.trim();
    const startPointSelect = document.getElementById('viewStartPoint');
    const endPointSelect = document.getElementById('viewEndPoint');

    // 验证必填字段
    if (!plateNumber) {
        alert('请输入车牌号');
        return null;
    }
    if (!driverName) {
        alert('请输入司机姓名');
        return null;
    }
    if (!phone) {
        alert('请输入联系电话');
        return null;
    }

    // 获取时间选择器的值
    const entryStartTime = viewTaskPage.querySelector('#viewEntryStartTime')?.value || '';
    const entryEndTime = viewTaskPage.querySelector('#viewEntryEndTime')?.value || '';
    const exitStartTime = viewTaskPage.querySelector('#viewExitStartTime')?.value || '';
    const exitEndTime = viewTaskPage.querySelector('#viewExitEndTime')?.value || '';

    // 构建请求body
    const requestBody = {
        driver_name: driverName,
        phone: phone,
        plate_number: plateNumber,
        vehicle_type: 0,
        vehicle_id: locatorSelect ? parseInt(locatorSelect.value) || 0 : 0,
        task_type: taskTypeSelect ? parseInt(taskTypeSelect.value) || 0 : 0,
        task_name: taskTypeSelect ? taskTypeSelect.options[taskTypeSelect.selectedIndex]?.text || '' : '',
        task_detail: taskDetail || '',
        start_point: startPointSelect ? parseInt(startPointSelect.value) || 0 : 0,
        end_point: endPointSelect ? parseInt(endPointSelect.value) || 0 : 0,
        task_location_id: 0,
        entry_start_time: entryStartTime,
        entry_end_time: entryEndTime,
        exit_start_time: exitStartTime,
        exit_end_time: exitEndTime,
        project_id: projectId,
        publisher_id: publisherId,
        publish_date: new Date().toISOString(),
        status: 0
    };

    return requestBody;
}

/**
 * 收集任务表单数据并验证
 * @returns {Object|null} 表单数据对象，验证失败返回null
 */
function collectTaskFormData() {
    const addTaskPage = document.getElementById('addTaskPage');
    if (!addTaskPage) {
        alert('未找到表单');
        return null;
    }

    // 获取表单输入值
    const locatorSelect = document.getElementById('addLocator');
    const plateNumber = addTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(2) input')?.value.trim();
    const driverName = addTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(3) input')?.value.trim();
    const phone = addTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(4) input')?.value.trim();
    const taskTypeSelect = document.getElementById('addTaskType');
    const taskDetail = addTaskPage.querySelector('.form-section:nth-child(4) .form-item:nth-child(2) textarea')?.value.trim();
    const startPointSelect = document.getElementById('addStartPoint');
    const endPointSelect = document.getElementById('addEndPoint');

    // 验证必填字段
    if (!plateNumber) {
        alert('请输入车牌号');
        return null;
    }
    if (!driverName) {
        alert('请输入司机姓名');
        return null;
    }
    if (!phone) {
        alert('请输入联系方式');
        return null;
    }
    if (!taskTypeSelect || !taskTypeSelect.value) {
        alert('请选择任务类型');
        return null;
    }
    if (!startPointSelect || !startPointSelect.value) {
        alert('请选择任务起点');
        return null;
    }
    if (!endPointSelect || !endPointSelect.value) {
        alert('请选择任务终点');
        return null;
    }

    // 获取时间数据
    const selectedTimes = window.addTaskSelectedTimes || {};
    if (!selectedTimes.entryStart || !selectedTimes.entryEnd || !selectedTimes.exitStart || !selectedTimes.exitEnd) {
        alert('请选择完整的入场和离场时间');
        return null;
    }

    // 获取任务类型
    const taskType = parseInt(taskTypeSelect.value) || 0;
    const taskName = taskTypeSelect.options[taskTypeSelect.selectedIndex]?.text || '';

    // 获取定位器ID
    const locatorId = locatorSelect?.value || '';

    // 获取起点和终点
    const startPoint = parseInt(startPointSelect.value) || 0;
    const endPoint = parseInt(endPointSelect.value) || 0;

    return {
        locatorId,
        driverName,
        phone,
        plateNumber,
        vehicleType: 0, // 暂时默认为0
        taskType,
        taskName,
        taskDetail,
        startPoint,
        endPoint,
        entryStartTime: selectedTimes.entryStart,
        entryEndTime: selectedTimes.entryEnd,
        exitStartTime: selectedTimes.exitStart,
        exitEndTime: selectedTimes.exitEnd
    };
}

/**
 * 清空任务表单
 */
function clearTaskForm() {
    const addTaskPage = document.getElementById('addTaskPage');
    if (!addTaskPage) return;

    // 清空输入框
    addTaskPage.querySelectorAll('input').forEach(input => {
        input.value = '';
    });

    // 清空文本域
    addTaskPage.querySelectorAll('textarea').forEach(textarea => {
        textarea.value = '';
    });

    // 重置下拉框
    addTaskPage.querySelectorAll('select').forEach(select => {
        select.selectedIndex = 0;
    });

    // 重置时间选择器显示
    const timeElements = [
        'addEntryStartTime',
        'addEntryEndTime',
        'addExitStartTime',
        'addExitEndTime'
    ];

    timeElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '<i class="far fa-calendar-alt"></i> 选择时间';
        }
    });

    // 清空时间选择器数据
    if (window.addTaskSelectedTimes) {
        window.addTaskSelectedTimes = {
            entryStart: null,
            entryEnd: null,
            exitStart: null,
            exitEnd: null
        };
    }
}

/**
 * 打开查看/修改页面并填充数据
 */
async function openViewTaskPage(taskId) {
    console.log('打开任务详情:', taskId);

    // 保存当前任务ID
    currentViewTaskId = taskId;

    // 显示页面
    showPage('viewTaskPage');

    // 从API获取任务详情并填充表单
    const taskData = await fetchTaskDetail(taskId);
    if (taskData) {
        fillViewTaskForm(taskData);
    }
}

/**
 * 填充查看任务页面的表单数据
 */
function fillViewTaskForm(taskData) {
    console.log('[填充表单] 填充任务数据:', taskData);

    const viewTaskPage = document.getElementById('viewTaskPage');
    if (!viewTaskPage) {
        console.error('[填充表单] 未找到查看任务页面');
        return;
    }

    // 填充定位器选择框
    const locatorSelect = document.getElementById('viewLocator');
    if (locatorSelect && taskData.vehicle_id) {
        locatorSelect.value = taskData.vehicle_id;
    }

    // 填充车牌号
    const plateNumberInput = viewTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(2) input');
    if (plateNumberInput && taskData.plate_number) {
        plateNumberInput.value = taskData.plate_number;
    }

    // 填充司机姓名
    const driverNameInput = viewTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(3) input');
    if (driverNameInput && taskData.driver_name) {
        driverNameInput.value = taskData.driver_name;
    }

    // 填充联系电话
    const phoneInput = viewTaskPage.querySelector('.form-section:nth-child(2) .form-item:nth-child(4) input');
    if (phoneInput && taskData.phone) {
        phoneInput.value = taskData.phone;
    }

    // 填充任务类型
    const taskTypeSelect = document.getElementById('viewTaskType');
    if (taskTypeSelect && taskData.task_type !== undefined) {
        taskTypeSelect.value = taskData.task_type;
    }

    // 填充任务详情
    const taskDetailTextarea = viewTaskPage.querySelector('.form-section:nth-child(4) .form-item:nth-child(2) textarea');
    if (taskDetailTextarea && taskData.task_detail) {
        taskDetailTextarea.value = taskData.task_detail;
    }

    // 填充起点
    const startPointSelect = document.getElementById('viewStartPoint');
    if (startPointSelect && taskData.start_point) {
        startPointSelect.value = taskData.start_point;
    }

    // 填充终点
    const endPointSelect = document.getElementById('viewEndPoint');
    if (endPointSelect && taskData.end_point) {
        endPointSelect.value = taskData.end_point;
    }

    // 填充时间选择器
    const entryStartTimeInput = viewTaskPage.querySelector('#viewEntryStartTime');
    if (entryStartTimeInput && taskData.entry_start_time) {
        entryStartTimeInput.value = taskData.entry_start_time;
    }

    const entryEndTimeInput = viewTaskPage.querySelector('#viewEntryEndTime');
    if (entryEndTimeInput && taskData.entry_end_time) {
        entryEndTimeInput.value = taskData.entry_end_time;
    }

    const exitStartTimeInput = viewTaskPage.querySelector('#viewExitStartTime');
    if (exitStartTimeInput && taskData.exit_start_time) {
        exitStartTimeInput.value = taskData.exit_start_time;
    }

    const exitEndTimeInput = viewTaskPage.querySelector('#viewExitEndTime');
    if (exitEndTimeInput && taskData.exit_end_time) {
        exitEndTimeInput.value = taskData.exit_end_time;
    }

    console.log('[填充表单] 表单数据填充完成');
}

/**
 * 显示子页面
 */
function showPage(pageId) {
    const page = document.getElementById(pageId);
    if (page) {
        page.style.display = 'flex';
        // 记录状态，处理浏览器返回键（可选）
    }
}

/**
 * 隐藏子页面
 */
function hidePage(pageId) {
    const page = document.getElementById(pageId);
    if (page) {
        page.style.display = 'none';
    }
}

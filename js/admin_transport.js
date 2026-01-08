// 运输管理页面 JavaScript

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
            console.log('新增任务功能待实现');
            // TODO: 实现新增任务功能
        });
    }

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
 */
const STATUS_MAP = {
    0: '未开始',
    1: '进行中',
    2: '已完成',
    3: '已逾期',
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
 * 尝试使用 /api/transport/ 下的API（避免CORS问题）
 */
async function loadVehicleData() {
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
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 4. 尝试使用 /api/transport/ 下的API
        const baseURL = 'https://dmap.cscec3bxjy.cn/api/transport';

        // 方案1：尝试从任务数据中统计车辆
        // 通过获取所有任务，统计临时车辆和固定车辆
        const tasksUrl = `${baseURL}/tasks/project/${projectId}?page=1&page_size=1000`;

        console.log('[车辆进出] 通过任务统计车辆，URL:', tasksUrl);

        const response = await fetch(tasksUrl, { method: 'GET', headers });

        if (!response.ok) {
            console.warn('[车辆进出] 请求失败:', response.status);
            return;
        }

        const data = await response.json();
        console.log('[车辆进出] 任务数据:', data);

        let tempCount = 0;
        let fixedCount = 0;
        const vehicleList = []; // 车辆详细列表

        if (data.code === 200 && data.data) {
            const taskList = data.data.list || data.data || [];

            // 统计不同的车辆（使用车牌号去重）
            const tempVehicles = new Set();  // 临时车辆
            const fixedVehicles = new Set(); // 固定车辆
            const vehicleMap = new Map(); // 车辆详情映射

            taskList.forEach(task => {
                if (task.plate_number) {
                    tempVehicles.add(task.plate_number);

                    // 保存车辆详情（每个车牌只保存一次）
                    if (!vehicleMap.has(task.plate_number)) {
                        vehicleMap.set(task.plate_number, {
                            plate_number: task.plate_number,
                            vehicle_type: task.vehicle_type,
                            entry_start_time: task.entry_start_time,
                            exit_start_time: task.exit_start_time,
                            driver_name: task.driver_name
                        });
                    }
                }
            });

            tempCount = tempVehicles.size;
            fixedCount = 0; // 固定车辆暂时无法从任务中区分

            // 转换为数组
            vehicleList.push(...Array.from(vehicleMap.values()));

            console.log('[车辆进出] 从任务中统计到的车辆:', {
                临时车辆: tempCount,
                固定车辆: fixedCount,
                车牌列表: Array.from(tempVehicles),
                车辆详情: vehicleList
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
        // 判断车辆属性（临时/固定）
        // 暂时都显示为"临时"，因为无法从任务数据判断
        const vehicleAttr = '临时';
        const vehicleClass = 'temporary';

        // 格式化时间
        const entryTime = formatDateTime(vehicle.entry_start_time);
        const exitTime = formatDateTime(vehicle.exit_start_time);

        const itemHtml = `
            <div class="list-item">
                <div class="col-data vehicle-type ${vehicleClass}">${vehicleAttr}</div>
                <div class="col-data">${vehicle.plate_number}</div>
                <div class="col-data">${entryTime}</div>
                <div class="col-data">${exitTime}</div>
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
        if (!token) {
            console.warn('[运输管理] 未找到token');
            return;
        }

        // 3. 构建请求headers
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        // 4. 构建请求URL
        const baseURL = 'https://dmap.cscec3bxjy.cn/api/transport';
        const page = 1;
        const pageSize = 100;
        const url = `${baseURL}/tasks/project/${projectId}?page=${page}&page_size=${pageSize}`;

        console.log('[运输管理] 请求URL:', url);
        console.log('[运输管理] 请求Headers:', headers);

        // 5. 发送请求
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        console.log('[运输管理] 响应状态:', response.status);

        if (!response.ok) {
            console.error('[运输管理] 请求失败:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('[运输管理] 错误详情:', errorText);
            return;
        }

        // 6. 解析响应
        const data = await response.json();
        console.log('[运输管理] ========== API返回数据 ==========');
        console.log('[运输管理] 完整响应:', data);
        console.log('[运输管理] 响应code:', data.code);
        console.log('[运输管理] 响应message:', data.message);
        console.log('[运输管理] 响应data:', data.data);

        if (data.code === 200 && data.data) {
            // 提取任务列表（可能在 data.data.list 或 data.data 中）
            const taskList = data.data.list || data.data;
            console.log('[运输管理] 任务列表类型:', Array.isArray(taskList) ? '数组' : typeof taskList);
            console.log('[运输管理] 任务数量:', Array.isArray(taskList) ? taskList.length : '不是数组');

            if (Array.isArray(taskList) && taskList.length > 0) {
                console.log('[运输管理] ========== 第一条任务数据详情 ==========');
                console.log('[运输管理] 第一条任务:', JSON.stringify(taskList[0], null, 2));
                console.log('[运输管理] 任务字段列表:', Object.keys(taskList[0]));
                console.log('[运输管理] =====================================');

                // 更新统计数据
                updateTaskStats(taskList);

                // 渲染任务列表
                renderTaskList(taskList);

                console.log('[运输管理] ✓ 任务数据加载成功');
            } else {
                console.warn('[运输管理] 返回的任务列表为空');
            }
        } else {
            console.error('[运输管理] API返回错误 - code:', data.code, 'message:', data.message);
        }

    } catch (error) {
        console.error('[运输管理] ========== 加载失败 ==========');
        console.error('[运输管理] 错误类型:', error.name);
        console.error('[运输管理] 错误信息:', error.message);
        console.error('[运输管理] 错误堆栈:', error.stack);
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
        const selectedProject = userProjects.find(p => p.projectName === projectName);

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

        // 统计状态（1=进行中，2=已完成）
        if (status === 1) {
            ongoingCount++;
        } else if (status === 2) {
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

        // 判断状态样式
        let statusClass = 'ongoing';
        if (task.status === 2) {
            statusClass = 'completed'; // 已完成
        } else if (task.status === 3) {
            statusClass = 'overdue'; // 已逾期
        } else if (task.status === 1) {
            statusClass = 'ongoing'; // 进行中
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

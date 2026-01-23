// 任务页面逻辑

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

// 页面加载时检查登录
if (!checkLoginStatus()) {
    throw new Error('Unauthorized');
}

class TaskManager {
    constructor() {
        this.tasks = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadTasks();
    }

    bindEvents() {
        // 底部导航切换
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = item.getAttribute('data-page');

                // 更新导航栏状态
                const navItems = document.querySelectorAll('.nav-item');
                navItems.forEach(nav => {
                    const img = nav.querySelector('.nav-icon-img');
                    const text = nav.querySelector('.nav-text');

                    if (nav === item) {
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
                this.navigateTo(page);
            });
        });

        // 导航弹窗按钮
        document.getElementById('nav-dialog-confirm').addEventListener('click', () => {
            this.confirmNavigation();
        });

        document.getElementById('nav-dialog-cancel').addEventListener('click', () => {
            this.closeNavigationDialog();
        });

        // 点击遮罩层关闭弹窗
        document.querySelector('.nav-dialog-overlay').addEventListener('click', () => {
            this.closeNavigationDialog();
        });
    }

    /**
     * 加载任务列表
     * 从API获取司机对应的任务数据
     */
    async loadTasks() {
        try {
            console.log('[任务页面] 开始加载任务...');

            // 1. 获取项目ID和车牌号
            const projectId = this.getProjectId();
            const plateNumber = this.getPlateNumber();

            if (!projectId) {
                console.warn('[任务页面] 未找到项目ID');
                this.showEmpty();
                return;
            }

            if (!plateNumber) {
                console.warn('[任务页面] 未找到车牌号');
                this.showEmpty();
                return;
            }

            console.log('[任务页面] 项目ID:', projectId, '车牌号:', plateNumber);

            // 2. 获取项目下所有任务
            const allTasks = await this.fetchProjectTasks(projectId);
            console.log('[任务页面] 项目任务总数:', allTasks.length);

            // 3. 筛选出匹配车牌号的任务
            const matchedTasks = allTasks.filter(task =>
                task.plate_number && task.plate_number === plateNumber
            );
            console.log('[任务页面] 匹配车牌号的任务数:', matchedTasks.length);

            if (matchedTasks.length === 0) {
                console.log('[任务页面] 无匹配任务');
                this.showEmpty();
                return;
            }

            // 4. 获取每个任务的详细信息，包括起点终点
            const taskDetails = await Promise.all(
                matchedTasks.map(async (task) => {
                    const detail = await this.fetchTaskDetail(task.id);
                    if (!detail) return null;

                    // 获取起点信息（start_point是点位ID）
                    if (detail.start_point) {
                        console.log('[任务页面] 获取起点信息，ID:', detail.start_point);
                        const startPointInfo = await this.fetchPointDetail(detail.start_point);
                        if (startPointInfo) {
                            detail.startPointInfo = startPointInfo;
                            console.log('[任务页面] ✓ 起点信息:', startPointInfo);
                        }
                    }

                    // 获取终点信息（end_point是点位ID）
                    if (detail.end_point) {
                        console.log('[任务页面] 获取终点信息，ID:', detail.end_point);
                        const endPointInfo = await this.fetchPointDetail(detail.end_point);
                        if (endPointInfo) {
                            detail.endPointInfo = endPointInfo;
                            console.log('[任务页面] ✓ 终点信息:', endPointInfo);
                        }
                    }

                    return detail;
                })
            );

            // 5. 转换为前端需要的格式
            this.tasks = taskDetails
                .filter(detail => detail !== null)
                .map(detail => this.convertTaskData(detail));

            console.log('[任务页面] 最终显示任务数:', this.tasks.length);

            // 6. 渲染任务列表
            this.renderTasks();

        } catch (error) {
            console.error('[任务页面] 加载任务失败:', error);
            this.showEmpty();
        }
    }

    /**
     * 获取项目ID
     */
    getProjectId() {
        try {
            const projectSelection = sessionStorage.getItem('projectSelection');

            if (!projectSelection) {
                console.warn('[任务页面] 未找到projectSelection');
                return null;
            }

            const selection = JSON.parse(projectSelection);
            console.log('[任务页面] projectSelection完整数据:', selection);

            // 优先使用projectSelection中直接保存的projectCode
            if (selection.projectCode) {
                console.log('[任务页面] 从projectSelection获取projectCode:', selection.projectCode);
                return selection.projectCode;
            }

            // 如果projectSelection中没有projectCode，尝试从currentUser.projects中查找
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
            console.log('[任务页面] currentUser完整数据:', currentUser);

            const projectName = selection.project;
            console.log('[任务页面] 要查找的项目名称:', projectName);

            const userProjects = currentUser.projects || [];
            console.log('[任务页面] 用户项目列表:', userProjects);

            const selectedProject = userProjects.find(p => p.projectName === projectName);
            console.log('[任务页面] 找到的项目:', selectedProject);

            if (selectedProject) {
                const projectId = selectedProject.projectCode || selectedProject.id;
                console.log('[任务页面] 从currentUser.projects获取projectId:', projectId);
                return projectId;
            }

            console.warn('[任务页面] 无法获取项目ID');
            return null;
        } catch (error) {
            console.error('[任务页面] 获取项目ID失败:', error);
            return null;
        }
    }

    /**
     * 获取车牌号
     * 从多个位置尝试获取：vehicleInfo、projectSelection、currentUser
     */
    getPlateNumber() {
        try {
            // 1. 优先从 vehicleInfo 获取（登录时保存的车辆信息）
            const vehicleInfo = sessionStorage.getItem('vehicleInfo');
            if (vehicleInfo) {
                const vehicle = JSON.parse(vehicleInfo);
                if (vehicle.licensePlate) {
                    console.log('[任务页面] 从vehicleInfo获取车牌号:', vehicle.licensePlate);
                    return vehicle.licensePlate;
                }
            }

            // 2. 尝试从 projectSelection 获取
            const projectSelection = sessionStorage.getItem('projectSelection');
            if (projectSelection) {
                const selection = JSON.parse(projectSelection);
                if (selection.vehicle) {
                    console.log('[任务页面] 从projectSelection获取车牌号:', selection.vehicle);
                    return selection.vehicle;
                }
            }

            // 3. 最后尝试从 currentUser 获取
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
            if (currentUser.licensePlate) {
                console.log('[任务页面] 从currentUser获取车牌号:', currentUser.licensePlate);
                return currentUser.licensePlate;
            }

            console.warn('[任务页面] 未在任何位置找到车牌号');
            return null;
        } catch (error) {
            console.error('[任务页面] 获取车牌号失败:', error);
            return null;
        }
    }

    /**
     * 获取项目下所有任务
     */
    async fetchProjectTasks(projectId) {
        try {
            const token = sessionStorage.getItem('authToken');
            const headers = {
                'Content-Type': 'application/json'
            };

            // 只在token存在且不为空时才添加Authorization header
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
                console.log('[任务页面] 使用token请求（token长度:', token.length, '）');
            } else {
                console.log('[任务页面] 无token，使用匿名请求');
            }

            const url = `http://115.159.67.12:8086/api/transport/tasks/project/${projectId}?page=1&page_size=1000`;
            console.log('[任务页面] 请求URL（内网测试）:', url);
            console.log('[任务页面] 请求headers:', headers);

            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                credentials: 'omit'  // 不发送cookie
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('[任务页面] 任务列表响应:', result);

            if (result.code === 200 && result.data) {
                return result.data.list || result.data || [];
            }

            return [];
        } catch (error) {
            console.error('[任务页面] 获取项目任务失败:', error);
            return [];
        }
    }

    /**
     * 获取任务详情
     */
    async fetchTaskDetail(taskId) {
        try {
            const token = sessionStorage.getItem('authToken');
            const headers = {
                'Content-Type': 'application/json'
            };

            // 只在token存在且不为空时才添加Authorization header
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const url = `http://115.159.67.12:8086/api/transport/tasks/${taskId}`;
            console.log('[任务页面] 请求任务详情（内网测试）:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                credentials: 'omit'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('[任务页面] 任务详情响应:', result);
            console.log('[任务页面] ========== 任务详情完整数据 ==========');
            console.log(JSON.stringify(result.data, null, 2));
            console.log('[任务页面] ==========================================');

            if (result.code === 200 && result.data) {
                return result.data;
            }

            return null;
        } catch (error) {
            console.error('[任务页面] 获取任务详情失败:', taskId, error);
            return null;
        }
    }

    /**
     * 根据点位ID获取点位详细信息（使用首页的点位接口）
     * @param {number} pointId - 点位ID
     * @returns {Promise<Object|null>} 点位详细信息
     */
    async fetchPointDetail(pointId) {
        try {
            const token = sessionStorage.getItem('authToken');
            const headers = {
                'Content-Type': 'application/json'
            };

            // 只在token存在且不为空时才添加Authorization header
            if (token && token.trim() !== '') {
                headers['Authorization'] = `Bearer ${token}`;
            }

            // 使用首页的地图API点位查询接口（HTTPS可用）
            const url = `https://dmap.cscec3bxjy.cn/api/map/points/${pointId}`;
            console.log('[任务页面] 请求点位详情:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: headers,
                credentials: 'omit'
            });

            if (!response.ok) {
                console.warn('[任务页面] 点位详情请求失败:', response.status);
                return null;
            }

            const result = await response.json();
            console.log('[任务页面] 点位详情响应:', result);

            if (result.code === 200 && result.data) {
                return result.data;
            }

            return null;
        } catch (error) {
            console.error('[任务页面] 获取点位详情失败:', pointId, error);
            return null;
        }
    }


    /**
     * 转换API数据为前端格式
     */
    convertTaskData(apiData) {
        // 状态映射 (0=草稿, 1=已下发, 2=进行中, 3=已完成, 4=已取消)
        const statusMap = {
            0: '草稿',
            1: '已下发',
            2: '进行中',
            3: '已完成',
            4: '已取消'
        };

        // 状态对应的颜色 (0=草稿, 1=已下发, 2=进行中, 3=已完成, 4=已取消)
        const colorMap = {
            0: 'gray',   // 草稿
            1: 'blue',   // 已下发
            2: 'green',  // 进行中
            3: 'gray',   // 已完成
            4: 'gray'    // 已取消
        };

        const status = statusMap[apiData.status] || '未开始';
        const color = colorMap[apiData.status] || 'blue';

        // 默认值
        let startLocationName = '起点';
        let endLocationName = '终点';
        let startLongitude = 118.796877;
        let startLatitude = 32.060255;
        let endLongitude = 118.806877;
        let endLatitude = 32.070255;

        // 使用起点信息（从start_point ID查询得到）
        if (apiData.startPointInfo) {
            const point = apiData.startPointInfo;
            startLocationName = point.name || point.point_name || '起点';
            startLongitude = point.longitude || point.lng || startLongitude;
            startLatitude = point.latitude || point.lat || startLatitude;

            console.log('[任务页面] 使用起点信息:', {
                name: startLocationName,
                longitude: startLongitude,
                latitude: startLatitude
            });
        } else {
            console.warn('[任务页面] 未获取到起点信息，使用默认坐标');
        }

        // 使用终点信息（从end_point ID查询得到）
        if (apiData.endPointInfo) {
            const point = apiData.endPointInfo;
            endLocationName = point.name || point.point_name || '终点';
            endLongitude = point.longitude || point.lng || endLongitude;
            endLatitude = point.latitude || point.lat || endLatitude;

            console.log('[任务页面] 使用终点信息:', {
                name: endLocationName,
                longitude: endLongitude,
                latitude: endLatitude
            });
        } else {
            console.warn('[任务页面] 未获取到终点信息，使用默认坐标');
        }

        return {
            id: apiData.id,
            name: apiData.task_name || '未命名任务',
            type: apiData.task_name || '运输任务',
            description: apiData.task_detail || '暂无任务详情',
            startPoint: {
                name: startLocationName,
                date: this.formatDate(apiData.entry_start_time),
                time: this.formatTimeRange(apiData.entry_start_time, apiData.entry_end_time),
                location: [startLongitude, startLatitude]
            },
            endPoint: {
                name: endLocationName,
                date: this.formatDate(apiData.exit_start_time),
                time: this.formatTimeRange(apiData.exit_start_time, apiData.exit_end_time),
                location: [endLongitude, endLatitude]
            },
            status: status,
            color: color
        };
    }

    /**
     * 格式化日期
     * @param {string} dateTimeStr - ISO格式的日期时间字符串
     * @returns {string} 格式化后的日期，如 "9月26日"
     */
    formatDate(dateTimeStr) {
        if (!dateTimeStr) return '-';

        try {
            const date = new Date(dateTimeStr);
            const month = date.getMonth() + 1;
            const day = date.getDate();
            return `${month}月${day}日`;
        } catch (e) {
            return '-';
        }
    }

    /**
     * 格式化时间范围
     * @param {string} startTime - 开始时间
     * @param {string} endTime - 结束时间
     * @returns {string} 格式化后的时间范围，如 "15:30 - 16:30"
     */
    formatTimeRange(startTime, endTime) {
        if (!startTime || !endTime) return '-';

        try {
            const start = new Date(startTime);
            const end = new Date(endTime);

            const startStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
            const endStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

            return `${startStr} - ${endStr}`;
        } catch (e) {
            return '-';
        }
    }

    /**
     * 渲染任务列表
     */
    renderTasks() {
        const taskList = document.getElementById('task-list');
        const taskEmpty = document.getElementById('task-empty');

        if (!this.tasks || this.tasks.length === 0) {
            this.showEmpty();
            return;
        }

        taskEmpty.style.display = 'none';
        taskList.innerHTML = '';

        this.tasks.forEach(task => {
            const taskCard = this.createTaskCard(task);
            taskList.appendChild(taskCard);
        });
    }

    /**
     * 创建任务卡片
     *
     * 显示字段说明 (所有字段均由后端提供):
     *
     * 【卡片头部】
     * - task.name: 任务名称 (卡片顶部,大号字体)
     * - task.type: 任务类型 (任务名称下方,蓝色字体)
     *
     * 【展开区域】
     * - task.description: 任务详情 (展开后显示的完整描述文本)
     *
     * 【时间轴区域】
     * - task.startPoint.name: 起点地点名称
     * - task.startPoint.date: 起点日期
     * - task.startPoint.time: 起点时间段
     * - task.status: 任务状态 (时间轴中间的绿色徽章)
     * - task.endPoint.name: 终点地点名称
     * - task.endPoint.date: 终点日期
     * - task.endPoint.time: 终点时间段
     *
     * 【卡片颜色】
     * - task.color: 'green' = 正在进行的任务 (头部浅绿色背景)
     * - task.color: 'pink' = 时间紧急的任务 (头部浅红色背景)
     * - task.color: 'blue' = 其他状态任务 (头部白色背景)
     */
    createTaskCard(task) {
    const card = document.createElement('div');
    const statusText = task.status || '进行中';
    const statusClass = this.getStatusClass(statusText);
    card.className = `task-card task-${task.color} task-status-${statusClass.replace('status-','')}`;

        card.innerHTML = `
            <div class="task-card-header">
                <div class="task-card-left">
                    <div class="task-card-name">${task.name}</div>
                    <div class="task-card-type">${task.type}</div>
                </div>
                <div class="task-card-status ${statusClass}">${statusText}</div>
            </div>

            <!-- 任务名称下方显示起点/终点与时间 -->
            <div class="task-timeline timeline-horizontal">
                <div class="timeline-row">
                    <div class="timeline-point start"></div>
                    <div class="timeline-info">
                        <div class="timeline-location">${task.startPoint.name}</div>
                        <div class="timeline-date">${task.startPoint.date}</div>
                        <div class="timeline-time">${task.startPoint.time}</div>
                    </div>
                </div>
                <div class="timeline-status">
                    <span class="status-badge">${task.status}</span>
                </div>
                <div class="timeline-separator" aria-hidden="true"></div>
                <div class="timeline-row">
                    <div class="timeline-point end"></div>
                    <div class="timeline-info end-info">
                        <div class="timeline-location-row">
                            <div class="timeline-location">${task.endPoint.name}</div>
                            <button class="task-card-nav" data-task-id="${task.id}" aria-label="开始导航">
                                <img class="nav-icon" src="images/工地数字导航小程序切图/司机/2X/导航/定位-1.png" alt="" aria-hidden="true" />
                            </button>
                        </div>
                        <div class="timeline-date">${task.endPoint.date}</div>
                        <div class="timeline-time">${task.endPoint.time}</div>
                    </div>
                </div>
            </div>

            <div class="task-detail-section">
                <div class="task-detail-header" data-task-id="${task.id}">
                    <div class="task-detail-title">任务详情</div>
                    <i class="fas fa-chevron-down task-detail-toggle"></i>
                </div>
                <div class="task-detail-content">
                    <div class="task-detail-text">${task.description}</div>
                </div>
            </div>
        `;

        // 绑定详情展开/收起事件
        const detailHeader = card.querySelector('.task-detail-header');
        detailHeader.addEventListener('click', () => {
            this.toggleTaskDetail(detailHeader);
        });

        // 绑定导航按钮事件
        const navBtn = card.querySelector('.timeline-info.end-info .task-card-nav');
        if (navBtn) {
            navBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showNavigationDialog(task);
            });
        }

        return card;
    }

    /**
     * 将状态文本映射为样式类 (0=草稿, 1=已下发, 2=进行中, 3=已完成, 4=已取消)
     */
    getStatusClass(statusText) {
        const t = (statusText || '').trim();
        if (t === '草稿') return 'status-draft';
        if (t === '已下发') return 'status-assigned';
        if (t === '进行中') return 'status-in-progress';
        if (t === '已完成') return 'status-completed';
        if (t === '已取消') return 'status-cancelled';
        return 'status-assigned'; // 默认为已下发
    }

    /**
     * 切换任务详情展开/收起
     */
    toggleTaskDetail(headerElement) {
        const card = headerElement.closest('.task-card');
        const content = card.querySelector('.task-detail-content');
        const toggle = card.querySelector('.task-detail-toggle');

        content.classList.toggle('expanded');
        toggle.classList.toggle('expanded');
    }

    /**
     * 显示导航确认弹窗
     */
    showNavigationDialog(task) {
        const dialog = document.getElementById('nav-confirm-dialog');
        const projectEl = document.getElementById('nav-dialog-project');
        const locationEl = document.getElementById('nav-dialog-location');

        // 获取项目名称（上方浅色小字）
        let projectName = '项目名称';
        try {
            const projectSelection = sessionStorage.getItem('projectSelection');
            if (projectSelection) {
                const selection = JSON.parse(projectSelection);
                projectName = selection.project || '项目名称';
            }
        } catch (error) {
            console.error('[导航弹窗] 获取项目名称失败:', error);
        }

        // 设置目的地信息
        projectEl.textContent = projectName;  // 项目名称
        locationEl.textContent = task.endPoint.name;  // 地点名称

        // 保存完整的任务信息（起点+终点），供确认导航时使用
        dialog.dataset.taskId = task.id;

        // 起点信息
        dialog.dataset.startLat = task.startPoint.location[1];
        dialog.dataset.startLng = task.startPoint.location[0];
        dialog.dataset.startName = task.startPoint.name;

        // 终点信息
        dialog.dataset.endLat = task.endPoint.location[1];
        dialog.dataset.endLng = task.endPoint.location[0];
        dialog.dataset.endName = task.endPoint.name;

        dialog.classList.add('show');
    }

    /**
     * 关闭导航确认弹窗
     */
    closeNavigationDialog() {
        const dialog = document.getElementById('nav-confirm-dialog');
        dialog.classList.remove('show');
    }

    /**
     * 确认导航
     */
    confirmNavigation() {
        const dialog = document.getElementById('nav-confirm-dialog');
        const taskId = dialog.dataset.taskId;

        // 获取起点信息
        const startLat = parseFloat(dialog.dataset.startLat);
        const startLng = parseFloat(dialog.dataset.startLng);
        const startName = dialog.dataset.startName;

        // 获取终点信息
        const endLat = parseFloat(dialog.dataset.endLat);
        const endLng = parseFloat(dialog.dataset.endLng);
        const endName = dialog.dataset.endName;

        this.closeNavigationDialog();

        console.log('[任务导航] 直接跳转到导航页面，起点:', startName, '终点:', endName);

        // 将起点终点信息保存到sessionStorage，供导航页面使用
        try {
            const taskNavigationData = {
                taskId: taskId,
                startPoint: {
                    name: startName,
                    lng: startLng,
                    lat: startLat
                },
                endPoint: {
                    name: endName,
                    lng: endLng,
                    lat: endLat
                },
                timestamp: Date.now()
            };
            sessionStorage.setItem('taskNavigationData', JSON.stringify(taskNavigationData));
            console.log('[任务导航] 导航数据已保存到sessionStorage');
        } catch (e) {
            console.warn('[任务导航] 保存导航数据失败:', e);
        }

        // 直接跳转到导航页面
        window.location.href = 'navigation.html';
    }

    /**
     * 显示空状态
     */
    showEmpty() {
        const taskList = document.getElementById('task-list');
        const taskEmpty = document.getElementById('task-empty');

        taskList.style.display = 'none';
        taskEmpty.style.display = 'flex';
    }

    /**
     * 页面导航
     */
    navigateTo(page) {
        switch(page) {
            case 'index':
                window.location.href = 'index.html';
                break;
            case 'task':
                // 当前页面，不需要跳转
                break;
            case 'profile':
                window.location.href = 'profile.html';
                break;
        }
    }

    /**
     * 刷新任务列表
     * 提供给外部调用的方法
     */
    async refresh() {
        await this.loadTasks();
    }
}

// 初始化任务管理器
const taskManager = new TaskManager();

// 暴露到全局，方便调试和外部调用
window.taskManager = taskManager;

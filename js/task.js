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
     * TODO: 对接后端API
     *
     * 后端需要提供以下字段:
     * 【任务基本信息】
     * - name: 任务名称 (显示在卡片顶部)
     * - type: 任务类型 (显示在任务名称下方,如"水泥运输")
     * - description: 任务详情 (显示在展开的详情区域,完整文本描述)
     *
     * 【时间轴区域数据】
     * - startPoint: 起点信息 (时间轴上方)
     *   - name: 起点地点名称
     *   - date: 起点日期
     *   - time: 起点时间段
     *   - location: 起点经纬度坐标
     * - endPoint: 终点信息 (时间轴下方)
     *   - name: 终点地点名称
     *   - date: 终点日期
     *   - time: 终点时间段
     *   - location: 终点经纬度坐标
     * - status: 任务状态 (时间轴中间显示,如"进行中")
     *
     * 其他字段见 API_DOCUMENTATION.md
     */
    async loadTasks() {
        try {
            // 预留后端API接口
            // const response = await fetch('/api/tasks');
            // const result = await response.json();
            // if (result.code === 0) {
            //     this.tasks = result.data.tasks;
            // }

            // 模拟数据（开发测试用）
            this.tasks = this.getMockTasks();

            this.renderTasks();
        } catch (error) {
            console.error('加载任务失败:', error);
            this.showEmpty();
        }
    }

    /**
     * 获取模拟数据
     * TODO: 删除此方法，使用真实后端数据
     *
     * 注意: 以下三个字段必须由后端提供:
     * - name: 任务名称
     * - type: 任务类型
     * - description: 任务详情描述
     */
    getMockTasks() {
        return [
            {
                id: 1,
                name: '任务名称1',  // 由后端提供
                type: '水泥运输',   // 由后端提供
                description: '请于2025年9月25日将水泥运送至汉韵公馆7号堆料区，请于2025年9月25日将水泥运送至汉韵公馆7号堆料区请于2025年9月25日将水泥运送至汉韵公馆7号堆料区请于2025年9月25日将水泥运送至汉韵公馆7号堆料区请于2025年9月25日将水泥运送至汉韵公馆7号堆料区，请于2025年9月25日将水泥运送至汉韵公馆7号堆料区，请于2025年9月25日将水泥运送至汉韵公馆7号堆料区',  // 由后端提供
                startPoint: {
                    name: '中建汉韵公馆项目',
                    date: '9月26日',
                    time: '15:30 - 16:30',
                    location: [118.796877, 32.060255] // 经纬度
                },
                endPoint: {
                    name: '终点项目终点项目',
                    date: '9月26日',
                    time: '17:30 - 18:30',
                    location: [118.806877, 32.070255]
                },
                status: '进行中',
                color: 'green'
            },
            {
                id: 2,
                name: '任务名称2',
                type: '水泥运输',
                description: '任务详情任务详情任务详情',
                startPoint: {
                    name: '起点项目',
                    date: '9月27日',
                    time: '08:00 - 09:00',
                    location: [118.796877, 32.060255]
                },
                endPoint: {
                    name: '终点项目',
                    date: '9月27日',
                    time: '10:00 - 11:00',
                    location: [118.806877, 32.070255]
                },
                status: '待开始',
                color: 'pink'
            },
            {
                id: 3,
                name: '任务名称3',
                type: '水泥运输',
                description: '任务详情任务详情任务详情',
                startPoint: {
                    name: '起点项目',
                    date: '9月28日',
                    time: '14:00 - 15:00',
                    location: [118.796877, 32.060255]
                },
                endPoint: {
                    name: '终点项目',
                    date: '9月28日',
                    time: '16:00 - 17:00',
                    location: [118.806877, 32.070255]
                },
                status: '待开始',
                color: 'blue'
            },
            {
                id: 4,
                name: '任务名称4',
                type: '水泥运输',
                description: '任务详情任务详情任务详情',
                startPoint: {
                    name: '起点项目',
                    date: '9月29日',
                    time: '09:00 - 10:00',
                    location: [118.796877, 32.060255]
                },
                endPoint: {
                    name: '终点项目',
                    date: '9月29日',
                    time: '11:00 - 12:00',
                    location: [118.806877, 32.070255]
                },
                status: '待开始',
                color: 'green'
            }
        ];
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
        card.className = `task-card task-${task.color}`;
        card.innerHTML = `
            <div class="task-card-header">
                <div class="task-card-left">
                    <div class="task-card-name">${task.name}</div>
                    <div class="task-card-type">${task.type}</div>
                </div>
                <button class="task-card-nav" data-task-id="${task.id}">
                    <i class="fas fa-location-dot"></i>
                </button>
            </div>

            <div class="task-detail-section">
                <div class="task-detail-header" data-task-id="${task.id}">
                    <div class="task-detail-title">任务详情</div>
                    <i class="fas fa-chevron-down task-detail-toggle"></i>
                </div>
                <div class="task-detail-content">
                    <div class="task-detail-text">${task.description}</div>

                    <div class="task-timeline">
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
                        <div class="timeline-row">
                            <div class="timeline-point end"></div>
                            <div class="timeline-info">
                                <div class="timeline-location">${task.endPoint.name}</div>
                                <div class="timeline-date">${task.endPoint.date}</div>
                                <div class="timeline-time">${task.endPoint.time}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 绑定详情展开/收起事件
        const detailHeader = card.querySelector('.task-detail-header');
        detailHeader.addEventListener('click', () => {
            this.toggleTaskDetail(detailHeader);
        });

        // 绑定导航按钮事件
        const navBtn = card.querySelector('.task-card-nav');
        navBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showNavigationDialog(task);
        });

        return card;
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

        // 设置目的地信息
        projectEl.textContent = task.endPoint.name.replace('项目', '').trim();
        locationEl.textContent = task.endPoint.name;

        // 保存当前任务信息，供确认导航时使用
        dialog.dataset.taskId = task.id;
        dialog.dataset.lat = task.endPoint.location[1];
        dialog.dataset.lng = task.endPoint.location[0];
        dialog.dataset.locationName = task.endPoint.name;

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
        const lat = parseFloat(dialog.dataset.lat);
        const lng = parseFloat(dialog.dataset.lng);
        const locationName = dialog.dataset.locationName;

        this.closeNavigationDialog();

        // 保存任务页即将跳转的标记，首页可以不重新定位
        try {
            sessionStorage.setItem('fromTaskNavigation', 'true');
        } catch (e) {
            console.warn('保存导航来源标记失败:', e);
        }

        // 跳转到地图页面并开始导航
        // 使用URL参数传递导航信息
        window.location.href = `index.html?nav=true&lat=${lat}&lng=${lng}&name=${encodeURIComponent(locationName)}&taskId=${taskId}`;
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

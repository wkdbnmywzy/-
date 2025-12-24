// 登录页面 JavaScript - 基于设计图

// DOM元素
const phoneLoginForm = document.getElementById('phone-login-form');
const accountLoginForm = document.getElementById('account-login-form');
const phoneInput = document.getElementById('phone');
const codeInput = document.getElementById('code');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const getCodeBtn = document.getElementById('get-code-btn');
const errorMessage = document.getElementById('error-message');
const accountErrorMessage = document.getElementById('account-error-message');
const tabBtns = document.querySelectorAll('.tab-btn');
const loadingScreen = document.getElementById('loading-screen');
const otherLoginBtn = document.querySelector('.other-login-btn');
const otherPhoneForm = document.getElementById('other-phone-form');
const otherPhoneBackBtn = document.getElementById('other-phone-back-btn');

// 状态变量
let countdown = 60;
let countdownTimer = null;

// 测试账号数据
const testAccounts = [
    { username: 'admin', password: '123456', role: 'admin' },
    { username: 'admin2', password: '123456', role: 'manager' },  // 管理员账号
    { username: 'driver', password: '123456', role: 'driver' },
    { username: 'test', password: '123456', role: 'user' }
];

// 测试手机号
const testPhones = [
    { phone: '13800138000', code: '123456' },
    { phone: '13900139000', code: '123456' },
    { phone: '13700137000', code: '123456' }
];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 页面加载完成后隐藏加载界面
    hideLoadingScreen();

    initEventListeners();
    initProjectSelection();
});

// 隐藏加载界面
function hideLoadingScreen() {
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
        // 完全移除元素，避免阻挡交互
        setTimeout(() => {
            loadingScreen.style.display = 'none';
        }, 500);
    }
}

// 显示加载界面
function showLoadingScreen() {
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        // 强制重绘
        loadingScreen.offsetHeight;
        loadingScreen.classList.remove('hidden');
    }
}

// 初始化事件监听
function initEventListeners() {
    // 标签切换
    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.dataset.tab;
            switchTab(tab);
        });
    });

    // 获取验证码（当前界面已不展示，做存在性判断）
    if (getCodeBtn) {
        getCodeBtn.addEventListener('click', handleGetCode);
    }

    // 表单提交
    phoneLoginForm.addEventListener('submit', handlePhoneLogin);
    accountLoginForm.addEventListener('submit', handleAccountLogin);
    if (otherPhoneForm) {
        otherPhoneForm.addEventListener('submit', handleOtherPhoneSubmit);
    }

    // 其他手机号登录入口
    if (otherLoginBtn) {
        otherLoginBtn.addEventListener('click', () => {
            hideError(errorMessage);
            slideTo('other-phone-card');
        });
    }

    // 其他手机号登录返回
    if (otherPhoneBackBtn) {
        otherPhoneBackBtn.addEventListener('click', () => {
            slideToByElement(document.querySelector('.login-card'));
        });
    }

    // 输入框获得焦点时隐藏错误消息
    phoneInput?.addEventListener('focus', () => hideError(errorMessage));
    codeInput?.addEventListener('focus', () => hideError(errorMessage));
    usernameInput?.addEventListener('focus', () => hideError(accountErrorMessage));
    passwordInput?.addEventListener('focus', () => hideError(accountErrorMessage));

    // 手机号输入验证
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '');
        });
    }

    // 验证码输入验证
    if (codeInput) {
        codeInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '');
        });
    }
}

// 切换登录方式标签
function switchTab(tab) {
    // 更新标签样式
    tabBtns.forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 切换表单显示
    if (tab === 'phone') {
        phoneLoginForm.classList.remove('hidden');
        accountLoginForm.classList.add('hidden');
        hideError(errorMessage);
        hideError(accountErrorMessage);
    } else {
        phoneLoginForm.classList.add('hidden');
        accountLoginForm.classList.remove('hidden');
        hideError(errorMessage);
        hideError(accountErrorMessage);
    }
}

// 获取验证码
function handleGetCode() {
    if (!phoneInput) return; // 当前布局不显示
    const phone = phoneInput.value.trim();

    // 验证手机号
    if (!phone) {
        showError(errorMessage, '请输入手机号');
        phoneInput.focus();
        return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showError(errorMessage, '手机号格式不正确');
        phoneInput.focus();
        return;
    }

    // 开始倒计时
    startCountdown();

    // 模拟发送验证码
    setTimeout(() => {
        console.log(`验证码已发送到 ${phone}，测试验证码: 123456`);
    }, 500);
}

// 开始倒计时
function startCountdown() {
    countdown = 60;
    if (getCodeBtn) {
        getCodeBtn.disabled = true;
        updateCountdownText();
    }

    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            stopCountdown();
        } else if (getCodeBtn) {
            updateCountdownText();
        }
    }, 1000);
}

// 停止倒计时
function stopCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
    if (getCodeBtn) {
        getCodeBtn.disabled = false;
        getCodeBtn.textContent = '获取验证码';
    }
}

// 更新倒计时文本
function updateCountdownText() {
    if (getCodeBtn) {
        getCodeBtn.textContent = `${countdown}秒后重试`;
    }
}

// 处理“其他手机号登录”提交
function handleOtherPhoneSubmit(e) {
    e.preventDefault();

    const phone = phoneInput?.value.trim() || '';
    const code = codeInput?.value.trim() || '';

    if (!phone) {
        showError(errorMessage, '请输入手机号');
        phoneInput?.focus();
        return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showError(errorMessage, '手机号格式不正确');
        phoneInput?.focus();
        return;
    }
    if (!code) {
        showError(errorMessage, '请输入验证码');
        codeInput?.focus();
        return;
    }

    const result = validatePhoneLogin(phone, code);
    if (!result.success) {
        showError(errorMessage, result.message || '验证码错误');
        return;
    }

    // 登录成功
    showLoadingScreen();
    setTimeout(() => {
        handleLoginSuccess({ username: phone, role: 'driver', phone }, 'phone');
    }, 400);
}

// 处理手机号登录
function handlePhoneLogin(e) {
    e.preventDefault();
    // 现在界面不要求输入手机号/验证码，直接按一键登录处理
    showLoadingScreen();
    setTimeout(() => {
        const mockPhone = '13800138000';
        handleLoginSuccess({ username: mockPhone, role: 'driver', phone: mockPhone }, 'phone');
    }, 400);
}

// 处理账号密码登录
function handleAccountLogin(e) {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // 验证输入
    if (!username) {
        showError(accountErrorMessage, '请输入账号');
        usernameInput.focus();
        return;
    }

    if (!password) {
        showError(accountErrorMessage, '请输入密码');
        passwordInput.focus();
        return;
    }

    // 显示加载
    showLoadingScreen();

    // 调用真实登录API
    loginWithAPI(username, password)
        .then(result => {
            if (result.success) {
                handleLoginSuccess(result.user, 'account');
            } else {
                hideLoadingScreen();
                handleLoginFailure(accountErrorMessage, result.message);
            }
        })
        .catch(error => {
            hideLoadingScreen();
            console.error('登录失败:', error);
            handleLoginFailure(accountErrorMessage, '登录失败，请稍后重试');
        });
}

/**
 * 调用真实登录API（RSA加密版本）
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
async function loginWithAPI(username, password) {
    try {
        // 1. 获取RSA公钥
        const publicKey = await fetchPublicKey();
        
        if (!publicKey) {
            return {
                success: false,
                message: '获取加密公钥失败，请稍后重试'
            };
        }
        
        // 2. 使用公钥加密登录信息
        const encryptedData = encryptLoginData(publicKey, username, password);
        
        if (!encryptedData) {
            return {
                success: false,
                message: '加密失败，请稍后重试'
            };
        }
        
        // 3. 发送加密后的登录请求
        const response = await fetch('https://dmap.cscec3bxjy.cn/api/user/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                encrypted_data: encryptedData
            })
        });

        const data = await response.json();

        if (response.ok && data.code === 200) {
            // 登录成功，保存token
            const token = data.data?.access_token || data.data?.token || data.data;
            const userInfo = data.data?.user || {};
            
            // 获取用户ID（优先使用id，其次user_id）
            const userId = userInfo.id || userInfo.user_id;
            
            if (token) {
                sessionStorage.setItem('authToken', token);
            } else {
                console.error('[登录] 未找到token，data.data:', data.data);
            }

            if (!userId) {
                console.warn('[登录] 未找到用户ID，将无法获取用户项目列表');
            }

            // 获取用户参与的项目列表（需要用户ID）
            const userProjects = userId ? await fetchUserProjects(token, userId) : [];
            
            // 获取用户的车牌号（暂时不可用，后续可扩展）
            const userVehicle = { licensePlate: '' };

            // 返回用户信息
            return {
                success: true,
                user: {
                    username: username,
                    userId: userId,
                    role: userInfo.role || userInfo.roles?.[0]?.name || 'user',
                    projects: userProjects,
                    licensePlate: userVehicle.licensePlate,
                    ...userInfo
                }
            };
        } else {
            // 登录失败
            return {
                success: false,
                message: data.message || '用户名或密码错误'
            };
        }
    } catch (error) {
        console.error('[登录] API调用失败:', error);
        return {
            success: false,
            message: '网络错误，请检查连接后重试'
        };
    }
}

/**
 * 获取RSA公钥
 * @returns {Promise<string|null>} 公钥字符串，失败返回null
 */
async function fetchPublicKey() {
    try {
        const response = await fetch('https://dmap.cscec3bxjy.cn/api/user/auth/public-key', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok && data.code === 200 && data.data?.public_key) {
            return data.data.public_key;
        } else {
            console.error('[公钥] 获取失败:', data.message);
            return null;
        }
    } catch (error) {
        console.error('[公钥] API调用失败:', error);
        return null;
    }
}

/**
 * 使用RSA公钥加密登录数据
 * @param {string} publicKey - RSA公钥
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {string|null} Base64编码的加密数据，失败返回null
 */
function encryptLoginData(publicKey, username, password) {
    try {
        // 检查JSEncrypt是否可用
        if (typeof JSEncrypt === 'undefined') {
            console.error('[加密] JSEncrypt库未加载');
            return null;
        }

        // 初始化加密器
        const encryptor = new JSEncrypt();
        encryptor.setPublicKey(publicKey);

        // 准备载荷（JSON字符串）
        const payload = JSON.stringify({
            username: username,
            password: password
        });

        // 加密
        const encryptedData = encryptor.encrypt(payload);
        
        if (!encryptedData) {
            console.error('[加密] 加密失败，可能是数据太长或公钥无效');
            return null;
        }

        return encryptedData;
    } catch (error) {
        console.error('[加密] 加密过程出错:', error);
        return null;
    }
}

/**
 * 获取用户参与的项目列表
 * @param {string} token - 认证token
 * @param {number} userId - 用户ID
 * @returns {Promise<Array>} 项目列表
 */
async function fetchUserProjects(token, userId) {
    // 如果没有userId，直接返回空数组
    if (!userId) {
        console.warn('[项目列表] 缺少用户ID，将使用默认项目列表');
        return [];
    }

    try {
        // 第一步：获取用户关联的项目ID列表
        const response = await fetch(`https://dmap.cscec3bxjy.cn/api/project/relations_users/${userId}/projects`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 404) {
            console.warn('[项目列表] 接口暂未实现(404)，将使用默认项目列表');
            console.info('[项目列表] 提示：如需使用用户项目数据，请联系后端实现该接口');
            return [];
        }

        const data = await response.json();

        if (!response.ok || data.code !== 200) {
            console.error('[项目列表] 获取项目ID列表失败:', data.message);
            return [];
        }

        // 获取项目ID列表（尝试多种可能的字段名）
        const projectIds = data.data?.projects || data.data?.project_ids || data.data?.projectIds || [];
        
        // 如果data.data本身就是数组
        const projectIdsArray = Array.isArray(data.data) ? data.data : projectIds;
        
        if (projectIdsArray.length === 0) {
            console.warn('[项目列表] 用户没有关联的项目，data.data内容:', data.data);
            return [];
        }

        // 第二步：根据每个项目ID获取项目详情
        const projectDetailsPromises = projectIdsArray.map(async (projectId) => {
            try {
                const detailResponse = await fetch(`https://dmap.cscec3bxjy.cn/api/project/projects/${projectId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!detailResponse.ok) {
                    console.error(`[项目详情] 获取项目 ${projectId} 详情失败:`, detailResponse.status);
                    return null;
                }

                const detailData = await detailResponse.json();
                
                if (detailData.code === 200 && detailData.data) {
                    const project = detailData.data;
                    return {
                        id: project.id,
                        province: project.province || project.location || '',
                        projectName: project.name || project.project_name || project.projectName || ''
                    };
                }
                
                return null;
            } catch (error) {
                console.error(`[项目详情] 获取项目 ${projectId} 详情异常:`, error);
                return null;
            }
        });

        // 等待所有项目详情获取完成
        const projectDetails = await Promise.all(projectDetailsPromises);
        
        // 过滤掉获取失败的项目
        const validProjects = projectDetails.filter(p => p !== null);
        
        return validProjects;

    } catch (error) {
        console.error('[项目列表] API调用失败:', error);
        console.warn('[项目列表] 将使用默认项目列表');
        return [];
    }
}


// 验证手机号登录
function validatePhoneLogin(phone, code) {
    const testPhone = testPhones.find(p => p.phone === phone);

    if (testPhone && testPhone.code === code) {
        return { success: true };
    } else if (!testPhone) {
        return { success: false, message: '手机号未注册' };
    } else {
        return { success: false, message: '验证码错误' };
    }
}

// 验证账号密码登录
function validateAccountLogin(username, password) {
    const user = testAccounts.find(account =>
        account.username === username && account.password === password
    );

    if (user) {
        return { success: true, user: user };
    } else {
        return { success: false, message: '用户名或密码错误' };
    }
}

// 处理登录成功
function handleLoginSuccess(user, loginType) {
    // 清除历史存储数据
    clearHistoryStorage();

    // 保存用户信息
    sessionStorage.setItem('isLoggedIn', 'true');
    sessionStorage.setItem('currentUser', JSON.stringify(user));
    sessionStorage.setItem('loginTime', new Date().toISOString());
    sessionStorage.setItem('loginType', loginType); // 保存登录类型

    // 显示成功消息

    // 账号密码登录：立即进入项目选择页（无延迟）
    if (loginType === 'account') {
        hideLoadingScreen(); // 先隐藏加载界面
        setTimeout(() => {
            showProjectSelection();
        }, 100);
        return;
    }

    // 手机号登录：保持现有加载动画与延迟
    setTimeout(() => {
        hideLoadingScreen();
        showProjectSelection();
    }, 500);
}

// 清除历史存储数据
function clearHistoryStorage() {
    try {
        // 清除sessionStorage中的历史数据（但保留项目选择）
        const keysToRemove = [
            'kmlData',              // KML数据
            'kmlRawData',           // KML原始数据
            'kmlFileName',          // KML文件名
            'navigationRoute',      // 导航路线数据
            'searchHistory',        // 搜索历史
            'vehicleInfo',          // 车辆信息
            'mapState',             // ⭐ 地图状态（重要：清除旧的地图状态）
            'selectedLocation'      // 选中的位置
        ];
        // 注意：不清除 projectSelection，因为马上要用

        keysToRemove.forEach(key => {
            sessionStorage.removeItem(key);
        });

        // 清除localStorage中的搜索历史
        localStorage.removeItem('searchHistory');
    } catch (e) {
        console.error('清除历史存储数据失败:', e);
    }
}

// 处理登录失败
function handleLoginFailure(msgElement, message) {
    showError(msgElement, message);
}

// 设置按钮加载状态
function setButtonLoading(btn, isLoading) {
    if (isLoading) {
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btn.dataset.originalText = btn.textContent;
        btn.textContent = '登录中...';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
    }
}

// 显示错误消息
function showError(msgElement, message) {
    if (msgElement) {
        msgElement.textContent = message;
        msgElement.classList.add('show');
    }
}

// 隐藏错误消息
function hideError(msgElement) {
    if (msgElement) {
        msgElement.classList.remove('show');
    }
}

// 初始化项目选择
function initProjectSelection() {
    // 项目数据（默认数据，将被用户实际项目覆盖）
    let projectsData = {
        '江苏省': ['苏州丰隆项目','胥江一号项目',  '圆融国际广场项目', '汇川动力总部项目'],
        '湖北省': ['汉韵公馆项目', '葛店试验场项目','测试项目']
    };
    let provincePicker = null;
    let projectPicker = null;
    let selectedProvince = null;
    let selectedProject = null;

    // 返回按钮
    const projectBackBtn = document.getElementById('project-back-btn');
    if (projectBackBtn) {
        projectBackBtn.addEventListener('click', function() {
            showLoginForm();
        });
    }

    // 确认项目按钮
    const confirmProjectBtn = document.getElementById('confirm-project-btn');
    if (confirmProjectBtn) {
        confirmProjectBtn.addEventListener('click', function() {
            if (selectedProvince && selectedProject) {
                // 保存项目选择
                const projectSelection = {
                    province: selectedProvince,
                    project: selectedProject,
                    timestamp: new Date().toISOString()
                };
                sessionStorage.setItem('projectSelection', JSON.stringify(projectSelection));

                // 检查是否是管理员
                const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
                if (currentUser.role === 'manager') {
                    // 管理员直接跳转到管理员界面
                    showLoadingScreen();
                    setTimeout(() => {
                        window.location.href = 'admin_index.html';
                    }, 300);
                } else {
                    // 普通用户显示车辆信息登记界面
                    showVehicleCard();
                }
            } else {
                alert('请选择省份和项目');
            }
        });
    }

    // 车辆信息返回按钮
    const vehicleBackBtn = document.getElementById('vehicle-back-btn');
    if (vehicleBackBtn) {
        vehicleBackBtn.addEventListener('click', function() {
            hideVehicleCard();
        });
    }

    // 车辆信息表单提交
    const vehicleForm = document.getElementById('vehicle-form');
    if (vehicleForm) {
        vehicleForm.addEventListener('submit', handleVehicleSubmit);
    }

    // 初始化轮盘选择器的函数
    function initPickers() {
        const provinceColumn = document.getElementById('province-column');
        const projectColumn = document.getElementById('project-column');

        if (!provinceColumn || !projectColumn) return;

        // 从用户信息中获取项目列表
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const userProjects = currentUser.projects || [];

        // 如果用户有项目列表，使用用户的项目
        if (userProjects.length > 0) {
            projectsData = {};
            userProjects.forEach(project => {
                const province = project.province || '未知省份';
                if (!projectsData[province]) {
                    projectsData[province] = [];
                }
                if (project.projectName && !projectsData[province].includes(project.projectName)) {
                    projectsData[province].push(project.projectName);
                }
            });
        }

        const provinces = Object.keys(projectsData);

        // 创建省份选择器
        provincePicker = new WheelPicker(
            provinceColumn,
            provinces,
            function(province) {
                selectedProvince = province;
                updateProjectPicker(province);
            }
        );

        // 初始化项目选择器
        selectedProvince = provinces[0];
        projectPicker = new WheelPicker(
            projectColumn,
            projectsData[provinces[0]],
            function(project) {
                selectedProject = project;
            }
        );
        selectedProject = projectsData[provinces[0]][0];
    }

    // 更新项目选择器
    function updateProjectPicker(province) {
        const projects = projectsData[province] || [];
        if (projectPicker) {
            projectPicker.updateItems(projects);
            selectedProject = projects[0];
        }
    }

    // 轮盘选择器类
    class WheelPicker {
        constructor(element, items, onChange) {
            this.element = element;
            this.items = items;
            this.onChange = onChange;
            this.selectedIndex = 0;
            this.itemHeight = 40; // 与 CSS 中的 .picker-item 高度一致

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

    // 当显示项目选择时，初始化选择器
    window.initProjectPickers = initPickers;
}

// 显示项目选择（替换登录卡片）
function showProjectSelection() {
    slideTo('project-card');

    // 初始化轮盘选择器（等待动画开始后执行）
    if (window.initProjectPickers) {
        setTimeout(() => window.initProjectPickers(), 50);
    }
}

// 隐藏项目选择，返回登录卡片
function showLoginForm() {
    slideToByElement(document.querySelector('.login-card'));
}

// 显示车辆信息登记（替换当前卡片）
function showVehicleCard() {
    const vehicleCard = document.getElementById('vehicle-card');
    const vehicleTitle = document.getElementById('vehicle-title');
    const driverNameGroup = document.getElementById('driver-name-group');
    const licensePlateInput = document.getElementById('license-plate');
    const loginType = sessionStorage.getItem('loginType');

    // 根据登录类型设置标题和显示字段
    if (loginType === 'phone') {
        // 手机号登录 - 临时车辆
        if (vehicleTitle) {
            vehicleTitle.textContent = '临时车辆信息登记';
        }
        if (driverNameGroup) {
            driverNameGroup.style.display = 'flex';
        }
        vehicleCard?.classList.remove('fixed');
        vehicleCard?.classList.add('temporary');
    } else {
        // 账号密码登录 - 固定车辆
        if (vehicleTitle) {
            vehicleTitle.textContent = '固定车辆信息登记';
        }
        if (driverNameGroup) {
            driverNameGroup.style.display = 'none';
        }
        vehicleCard?.classList.add('fixed');
        vehicleCard?.classList.remove('temporary');

        // 从用户信息中获取车牌号并自动填充
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        if (currentUser.licensePlate && licensePlateInput) {
            licensePlateInput.value = currentUser.licensePlate;
        }
    }

    // 滑动到车辆卡片
    slideTo('vehicle-card');
}

// 隐藏车辆信息登记，回到项目选择
function hideVehicleCard() {
    slideTo('project-card');
}

// 通用滑动切换：将当前可见卡片向左滑出，新卡片从右滑入
function slideTo(targetId) {
    const target = document.getElementById(targetId);
    slideToByElement(target);
}

function slideToByElement(target) {
    if (!target) return;
    const stack = document.querySelector('.card-stack');
    if (!stack) return;

    // 找到当前显示中的卡片
    const current = stack.querySelector('.card:not(.hidden)');

    if (current === target) return; // 已经在目标卡片

    // 准备目标卡片进入
    target.classList.remove('hidden');
    target.classList.add('enter-from-right');

    // 触发一次重绘以启动过渡
    // eslint-disable-next-line no-unused-expressions
    target.offsetHeight;

    // 当前卡片离场
    if (current) {
        current.classList.add('leave-to-left');
    }

    // 启动动画
    requestAnimationFrame(() => {
        target.classList.add('enter-active');
        if (current) current.classList.add('leave-active');

        // 动画结束后清理类名
        const onDone = () => {
            target.classList.remove('enter-from-right', 'enter-active');
            if (current) {
                current.classList.add('hidden');
                current.classList.remove('leave-to-left', 'leave-active');
            }
        };

        setTimeout(onDone, 300); // 与 CSS 过渡时长匹配
    });
}

// 处理车辆信息提交
function handleVehicleSubmit(e) {
    e.preventDefault();

    const driverNameInput = document.getElementById('driver-name');
    const licensePlateInput = document.getElementById('license-plate');
    const loginType = sessionStorage.getItem('loginType');

    let vehicleInfo = {
        licensePlate: licensePlateInput.value.trim(),
        timestamp: new Date().toISOString()
    };

    // 验证车牌号
    if (!vehicleInfo.licensePlate) {
        alert('请输入车牌号');
        licensePlateInput.focus();
        return;
    }

    // 如果是临时车辆，验证姓名
    if (loginType === 'phone') {
        const driverName = driverNameInput.value.trim();
        if (!driverName) {
            alert('请输入姓名');
            driverNameInput.focus();
            return;
        }
        vehicleInfo.driverName = driverName;
        vehicleInfo.type = 'temporary';
    } else {
        vehicleInfo.type = 'fixed';
        // 从当前用户获取司机姓名
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        vehicleInfo.driverName = currentUser.username || '';
    }

    // 显示加载界面
    showLoadingScreen();

    // 保存车辆信息
    sessionStorage.setItem('vehicleInfo', JSON.stringify(vehicleInfo));

    // 延迟后跳转到主页面
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 300);
}

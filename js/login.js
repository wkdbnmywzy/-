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

// 状态变量
let countdown = 60;
let countdownTimer = null;

// 测试账号数据
const testAccounts = [
    { username: 'admin', password: '123456', role: 'admin' },
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

    // 获取验证码
    getCodeBtn.addEventListener('click', handleGetCode);

    // 表单提交
    phoneLoginForm.addEventListener('submit', handlePhoneLogin);
    accountLoginForm.addEventListener('submit', handleAccountLogin);

    // 输入框获得焦点时隐藏错误消息
    phoneInput?.addEventListener('focus', () => hideError(errorMessage));
    codeInput?.addEventListener('focus', () => hideError(errorMessage));
    usernameInput?.addEventListener('focus', () => hideError(accountErrorMessage));
    passwordInput?.addEventListener('focus', () => hideError(accountErrorMessage));

    // 手机号输入验证
    phoneInput?.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '');
    });

    // 验证码输入验证
    codeInput?.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '');
    });
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
    getCodeBtn.disabled = true;
    updateCountdownText();

    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            stopCountdown();
        } else {
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
    getCodeBtn.disabled = false;
    getCodeBtn.textContent = '获取验证码';
}

// 更新倒计时文本
function updateCountdownText() {
    getCodeBtn.textContent = `${countdown}秒后重试`;
}

// 处理手机号登录
function handlePhoneLogin(e) {
    e.preventDefault();

    const phone = phoneInput.value.trim();
    const code = codeInput.value.trim();

    // 验证输入
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

    if (!code) {
        showError(errorMessage, '请输入验证码');
        codeInput.focus();
        return;
    }

    // 显示加载界面
    showLoadingScreen();

    // 模拟登录请求
    setTimeout(() => {
        const result = validatePhoneLogin(phone, code);

        if (result.success) {
            handleLoginSuccess({ username: phone, role: 'driver', phone: phone }, 'phone');
        } else {
            hideLoadingScreen();
            handleLoginFailure(errorMessage, result.message);
        }
    }, 800);
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

    // 模拟登录请求
    setTimeout(() => {
        const result = validateAccountLogin(username, password);

        if (result.success) {
            handleLoginSuccess(result.user, 'account');
        } else {
            hideLoadingScreen();
            handleLoginFailure(accountErrorMessage, result.message);
        }
    }, 800);
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
    console.log('登录成功', user, '登录类型:', loginType);

    // 延迟隐藏加载界面并显示项目选择
    setTimeout(() => {
        hideLoadingScreen();
        showProjectSelection();
    }, 500);
}

// 清除历史存储数据
function clearHistoryStorage() {
    try {
        console.log('清除历史存储数据...');

        // 清除sessionStorage中的历史数据
        const keysToRemove = [
            'kmlData',              // KML数据
            'navigationRoute',      // 导航路线数据
            'searchHistory',        // 搜索历史
            'projectSelection',     // 项目选择
            'vehicleInfo'           // 车辆信息
        ];

        keysToRemove.forEach(key => {
            sessionStorage.removeItem(key);
        });

        // 清除localStorage中的搜索历史
        localStorage.removeItem('searchHistory');

        console.log('历史存储数据已清除');
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
    // 项目数据
    const projectsData = {
        '河北省': ['石家庄项目', '唐山项目', '秦皇岛项目'],
        '河南省': ['郑州项目', '洛阳项目', '开封项目'],
        '湖北省': ['汉韵公馆', '戏曲中心'],
        '湖南省': ['长沙项目', '岳阳项目', '常德项目'],
        '新疆维吾尔自治区': ['乌鲁木齐项目', '喀什项目', '伊犁项目']
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

                console.log('项目选择已保存:', projectSelection);

                // 显示车辆信息登记界面
                showVehicleCard();
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
            this.itemHeight = 36;

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

// 显示项目选择
function showProjectSelection() {
    const projectCard = document.getElementById('project-card');

    // 移除hidden类，添加show类
    projectCard.classList.remove('hidden');

    // 使用setTimeout确保动画生效
    setTimeout(() => {
        projectCard.classList.add('show');
    }, 10);

    // 初始化轮盘选择器
    if (window.initProjectPickers) {
        setTimeout(() => {
            window.initProjectPickers();
        }, 400);
    }
}

// 隐藏项目选择
function showLoginForm() {
    const projectCard = document.getElementById('project-card');

    // 移除show类，触发下滑动画
    projectCard.classList.remove('show');

    // 动画完成后添加hidden类
    setTimeout(() => {
        projectCard.classList.add('hidden');
    }, 300);
}

// 显示车辆信息登记
function showVehicleCard() {
    const vehicleCard = document.getElementById('vehicle-card');
    const vehicleTitle = document.getElementById('vehicle-title');
    const driverNameGroup = document.getElementById('driver-name-group');
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
    } else {
        // 账号密码登录 - 固定车辆
        if (vehicleTitle) {
            vehicleTitle.textContent = '固定车辆信息登记';
        }
        if (driverNameGroup) {
            driverNameGroup.style.display = 'none';
        }
    }

    // 移除hidden类，添加show类
    vehicleCard.classList.remove('hidden');

    // 使用setTimeout确保动画生效
    setTimeout(() => {
        vehicleCard.classList.add('show');
    }, 10);
}

// 隐藏车辆信息登记
function hideVehicleCard() {
    const vehicleCard = document.getElementById('vehicle-card');

    // 移除show类，触发下滑动画
    vehicleCard.classList.remove('show');

    // 动画完成后添加hidden类
    setTimeout(() => {
        vehicleCard.classList.add('hidden');
    }, 300);
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

    console.log('车辆信息已保存:', vehicleInfo);

    // 延迟后跳转到主页面
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 300);
}

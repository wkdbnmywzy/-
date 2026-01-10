// 登录页面 JavaScript - 基于设计图

// ==================== 模拟GPS调试功能 ====================
// 用于开发测试，可在控制台设置模拟GPS坐标
let mockGPSCoordinates = null;

/**
 * 设置模拟GPS坐标（用于开发测试）
 * @param {number} longitude - 经度（范围：-180 到 180）
 * @param {number} latitude - 纬度（范围：-90 到 90）
 * @example setMockGPS(114.402198, 30.452716)  // 武汉（经度在前，纬度在后）
 */
window.setMockGPS = function(longitude, latitude) {
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        console.error('[模拟GPS] 参数错误：经度和纬度必须是数字');
        return;
    }
    if (longitude < -180 || longitude > 180) {
        console.error('[模拟GPS] 经度范围错误：必须在 -180 到 180 之间');
        return;
    }
    if (latitude < -90 || latitude > 90) {
        console.error('[模拟GPS] 纬度范围错误：必须在 -90 到 90 之间');
        return;
    }

    mockGPSCoordinates = { latitude, longitude };
    console.log(`[模拟GPS] ✓ 已设置模拟坐标: 经度=${longitude}, 纬度=${latitude}`);
    console.log('[模拟GPS] 下次登录将使用此坐标搜索附近项目');
};

/**
 * 清除模拟GPS坐标，恢复使用真实GPS
 */
window.clearMockGPS = function() {
    mockGPSCoordinates = null;
    console.log('[模拟GPS] ✓ 已清除模拟坐标，将使用真实GPS定位');
};

/**
 * 查看当前模拟GPS设置
 */
window.getMockGPS = function() {
    if (mockGPSCoordinates) {
        console.log('[模拟GPS] 当前模拟坐标:', mockGPSCoordinates);
        return mockGPSCoordinates;
    } else {
        console.log('[模拟GPS] 未设置模拟坐标，使用真实GPS');
        return null;
    }
};

console.log('[模拟GPS] 调试功能已加载，可用命令：');
console.log('  setMockGPS(经度, 纬度) - 设置模拟GPS坐标');
console.log('  clearMockGPS() - 清除模拟坐标');
console.log('  getMockGPS() - 查看当前设置');
console.log('  示例: setMockGPS(114.402198, 30.452716)  // 武汉');

// DOM元素
const driverLoginForm = document.getElementById('driver-login-form');
const adminLoginForm = document.getElementById('admin-login-form');
const driverNameInput = document.getElementById('driver-name-input');
const driverPhoneInput = document.getElementById('driver-phone-input');
const driverPlateInput = document.getElementById('driver-plate-input');
const driverHintMessage = document.getElementById('driver-hint-message');
const driverErrorMessage = document.getElementById('driver-error-message');
const rememberDriverCheckbox = document.getElementById('remember-driver');
const nameRequiredMark = document.getElementById('name-required');
const phoneRequiredMark = document.getElementById('phone-required');
const plateRequiredMark = document.getElementById('plate-required');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberAdminCheckbox = document.getElementById('remember-admin');
const accountErrorMessage = document.getElementById('account-error-message');
const tabBtns = document.querySelectorAll('.tab-btn');
const loadingScreen = document.getElementById('loading-screen');

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    // 页面加载完成后隐藏加载界面
    hideLoadingScreen();

    initEventListeners();
    initProjectSelection();

    // 加载记住的登录信息
    loadRememberedCredentials();

    // 初始化红色星号状态（页面加载完成后立即检查）
    console.log('[初始化] 检查红色星号状态');
    setTimeout(() => {
        updateRequiredMarks();
    }, 100);
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

    // 表单提交
    driverLoginForm.addEventListener('submit', handleDriverLogin);
    adminLoginForm.addEventListener('submit', handleAdminLogin);

    // 输入框获得焦点时隐藏错误消息
    driverNameInput?.addEventListener('focus', () => {
        hideError(driverErrorMessage);
        hideHint();
    });
    driverPhoneInput?.addEventListener('focus', () => {
        hideError(driverErrorMessage);
        hideHint();
    });
    driverPlateInput?.addEventListener('focus', () => {
        hideError(driverErrorMessage);
        hideHint();
    });
    usernameInput?.addEventListener('focus', () => hideError(accountErrorMessage));
    passwordInput?.addEventListener('focus', () => hideError(accountErrorMessage));

    // 手机号输入验证
    if (driverPhoneInput) {
        driverPhoneInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '');
            updateRequiredMarks();
        });
    }

    // 监听司机登录输入框的输入事件，动态更新红色星号
    driverNameInput?.addEventListener('input', updateRequiredMarks);
    driverPlateInput?.addEventListener('input', updateRequiredMarks);

    // 输入框失焦时显示提示
    driverNameInput?.addEventListener('blur', updateDriverHint);
    driverPhoneInput?.addEventListener('blur', updateDriverHint);
    driverPlateInput?.addEventListener('blur', updateDriverHint);
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
    if (tab === 'driver') {
        driverLoginForm.classList.remove('hidden');
        adminLoginForm.classList.add('hidden');
        hideError(driverErrorMessage);
        hideError(accountErrorMessage);
        hideHint();
    } else {
        driverLoginForm.classList.add('hidden');
        adminLoginForm.classList.remove('hidden');
        hideError(driverErrorMessage);
        hideError(accountErrorMessage);
    }
}

// 更新必填标记的显示状态
function updateRequiredMarks() {
    const name = driverNameInput?.value.trim() || '';
    const phone = driverPhoneInput?.value.trim() || '';
    const plate = driverPlateInput?.value.trim() || '';

    console.log('[星号更新] 姓名:', name, '手机号:', phone, '车牌号:', plate);
    console.log('[星号更新] DOM元素:', {
        nameRequiredMark: !!nameRequiredMark,
        phoneRequiredMark: !!phoneRequiredMark,
        plateRequiredMark: !!plateRequiredMark
    });

    // 根据输入框是否有值来显示/隐藏红色星号
    if (nameRequiredMark) {
        if (name) {
            nameRequiredMark.classList.add('hidden');
            console.log('[星号更新] 姓名星号已隐藏');
        } else {
            nameRequiredMark.classList.remove('hidden');
            console.log('[星号更新] 姓名星号已显示');
        }
    }
    if (phoneRequiredMark) {
        if (phone) {
            phoneRequiredMark.classList.add('hidden');
            console.log('[星号更新] 手机号星号已隐藏');
        } else {
            phoneRequiredMark.classList.remove('hidden');
            console.log('[星号更新] 手机号星号已显示');
        }
    }
    if (plateRequiredMark) {
        if (plate) {
            plateRequiredMark.classList.add('hidden');
            console.log('[星号更新] 车牌号星号已隐藏');
        } else {
            plateRequiredMark.classList.remove('hidden');
            console.log('[星号更新] 车牌号星号已显示');
        }
    }
}

// 更新司机登录提示信息
function updateDriverHint() {
    const name = driverNameInput?.value.trim() || '';
    const phone = driverPhoneInput?.value.trim() || '';
    const plate = driverPlateInput?.value.trim() || '';

    const missing = [];
    if (!name) missing.push('姓名');
    if (!phone) missing.push('手机号');
    if (!plate) missing.push('车牌号');

    if (missing.length > 0 && driverHintMessage) {
        driverHintMessage.textContent = `请填入${missing.join('、')}`;
        driverHintMessage.classList.add('show');
    } else {
        hideHint();
    }
}

// 隐藏提示消息
function hideHint() {
    if (driverHintMessage) {
        driverHintMessage.classList.remove('show');
    }
}

// 处理司机登录
async function handleDriverLogin(e) {
    e.preventDefault();

    const name = driverNameInput?.value.trim() || '';
    const phone = driverPhoneInput?.value.trim() || '';
    const plate = driverPlateInput?.value.trim() || '';

    // 验证输入
    if (!name) {
        showError(driverErrorMessage, '请输入姓名');
        updateDriverHint();
        driverNameInput?.focus();
        return;
    }

    if (!phone) {
        showError(driverErrorMessage, '请输入手机号');
        updateDriverHint();
        driverPhoneInput?.focus();
        return;
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
        showError(driverErrorMessage, '手机号格式不正确');
        driverPhoneInput?.focus();
        return;
    }

    if (!plate) {
        showError(driverErrorMessage, '请输入车牌号');
        updateDriverHint();
        driverPlateInput?.focus();
        return;
    }

    // 显示加载
    showLoadingScreen();

    try {
        // 司机登录不使用token，清除之前可能存在的token（避免API请求401错误）
        sessionStorage.removeItem('authToken');
        console.log('[司机登录] 已清除authToken，司机登录不需要token');

        // 获取GPS位置
        console.log('[司机登录] 获取GPS位置...');
        const position = await getCurrentPosition();
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        console.log('[司机登录] GPS位置:', { latitude, longitude });

        // 根据GPS获取附近项目
        console.log('[司机登录] 搜索附近项目...');
        const nearbyProjects = await searchNearbyProjects(latitude, longitude);
        console.log('[司机登录] 附近项目:', nearbyProjects);

        // 检查是否有附近项目
        if (!nearbyProjects || nearbyProjects.length === 0) {
            hideLoadingScreen();
            showError(driverErrorMessage, '您附近没有项目，请联系管理员');
            console.warn('[司机登录] 附近没有项目');
            return;
        }

        // 构建司机用户信息
        const driverUser = {
            username: name,
            phone: phone,
            role: 'driver',
            isDriver: true,
            isAdmin: false,
            projects: nearbyProjects,
            licensePlate: plate,
            gpsLocation: { latitude, longitude }
        };

        // 保存记住的登录信息
        if (rememberDriverCheckbox?.checked) {
            saveDriverCredentials(name, phone, plate);
        } else {
            clearDriverCredentials();
        }

        // 保存用户信息并进入项目选择
        handleLoginSuccess(driverUser, 'driver');

    } catch (error) {
        hideLoadingScreen();
        console.error('[司机登录] 失败:', error);

        // 根据错误类型显示不同提示
        if (error.code === 1) {
            showError(driverErrorMessage, '请允许获取位置权限');
        } else if (error.code === 2) {
            showError(driverErrorMessage, '无法获取位置信息，请检查GPS');
        } else if (error.code === 3) {
            showError(driverErrorMessage, '获取位置超时，请重试');
        } else {
            showError(driverErrorMessage, error.message || '登录失败，请稍后重试');
        }
    }
}

/**
 * 获取当前GPS位置（支持模拟坐标用于开发测试）
 * 优先使用模拟坐标，若未设置则使用真实GPS
 * @returns {Promise<GeolocationPosition>}
 */
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        // 如果设置了模拟GPS坐标，直接返回模拟数据
        if (mockGPSCoordinates) {
            console.log('[GPS定位] 使用模拟GPS坐标:', mockGPSCoordinates);
            // 构造符合GeolocationPosition接口的对象
            const mockPosition = {
                coords: {
                    latitude: mockGPSCoordinates.latitude,
                    longitude: mockGPSCoordinates.longitude,
                    accuracy: 10,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null
                },
                timestamp: Date.now()
            };
            resolve(mockPosition);
            return;
        }

        // 未设置模拟坐标，使用真实GPS
        console.log('[GPS定位] 使用真实GPS定位...');
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持定位功能'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log('[GPS定位] 真实GPS定位成功:', {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
                resolve(position);
            },
            reject,
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

/**
 * 根据GPS位置搜索附近5KM内的项目
 * 流程：GPS定位 → 获取附近项目列表（含projectid）→ 用projectid获取项目详情 → 获取省份信息
 * 与账号密码登录的 fetchUserProjects 处理方式一致
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @returns {Promise<Array>} 项目列表
 */
async function searchNearbyProjects(latitude, longitude) {
    try {
        // 第一步：根据GPS获取附近项目列表
        const response = await fetch('https://dmap.cscec3bxjy.cn/api/project/projects/search/nearby', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude: latitude,
                longitude: longitude
            })
        });

        const data = await response.json();
        console.log('[附近项目] API返回数据:', data);
        
        if (!response.ok || data.code !== 200) {
            console.warn('[附近项目] 搜索失败:', data.message);
            return [];
        }
        
        const projects = data.data || [];
        
        if (projects.length === 0) {
            console.log('[附近项目] 附近没有项目');
            return [];
        }
        
        // 第二步：提取项目ID列表（与账号密码登录一样的处理方式）
        const projectIds = projects.map(p => p.projectid).filter(id => id);
        console.log('[附近项目] 项目ID列表:', projectIds);
        
        if (projectIds.length === 0) {
            console.warn('[附近项目] 没有有效的项目ID');
            return [];
        }
        
        // 第三步：根据每个项目ID获取项目详情（与 fetchUserProjects 一致）
        const token = sessionStorage.getItem('authToken') || '';
        
        const projectDetailsPromises = projectIds.map(async (projectId) => {
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                
                const detailResponse = await fetch(`https://dmap.cscec3bxjy.cn/api/project/projects/code/${projectId}`, {
                    method: 'GET',
                    headers: headers
                });

                if (!detailResponse.ok) {
                    console.error(`[附近项目] 获取项目 ${projectId} 详情失败:`, detailResponse.status);
                    return null;
                }

                const detailData = await detailResponse.json();
                console.log(`[附近项目] 项目 ${projectId} 完整数据:`, detailData);
                
                if (detailData.code === 200 && detailData.data) {
                    const project = detailData.data;
                    return {
                        id: project.id,
                        projectCode: projectId,
                        provinceId: project.province_id || null,  // 省份ID，后续填充省份名称
                        projectName: project.name || project.project_name || project.projectName || '',
                        longitude: project.longitude || project.lng || null,
                        latitude: project.latitude || project.lat || null
                    };
                }
                
                return null;
            } catch (error) {
                console.error(`[附近项目] 获取项目 ${projectId} 详情异常:`, error);
                return null;
            }
        });

        // 等待所有项目详情获取完成
        const projectDetails = await Promise.all(projectDetailsPromises);
        const validProjects = projectDetails.filter(p => p !== null);

        // 第四步：获取省份映射表并填充省份名称（与 fetchUserProjects 一致）
        const provinceCodeToName = await fetchAllProvincesWithoutToken();
        
        // 将省份名称填充到项目中
        validProjects.forEach(project => {
            if (project.provinceId && provinceCodeToName[project.provinceId]) {
                project.province = provinceCodeToName[project.provinceId];
            } else {
                project.province = '未知省份';
                console.warn(`[省份匹配] 未找到省份代码 ${project.provinceId} 对应的名称`);
            }
        });
        
        console.log('[附近项目] 获取完成，项目数:', validProjects.length, '项目列表:', validProjects);
        return validProjects;
    } catch (error) {
        console.error('[附近项目] API调用失败:', error);
        return [];
    }
}

/**
 * 获取所有省份列表（无需token版本，用于一键登录）
 */
async function fetchAllProvincesWithoutToken() {
    try {
        const response = await fetch('https://dmap.cscec3bxjy.cn/api/project/provinces', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.warn('[省份列表] 无token获取失败，使用本地映射');
            return getLocalProvinceMap();
        }

        const data = await response.json();
        
        if (data.code === 200 && Array.isArray(data.data)) {
            const provinceMap = {};
            data.data.forEach(province => {
                const code = province.province_id;
                const name = province.province_name;
                if (code && name) {
                    provinceMap[code] = name;
                }
            });
            
            console.log('[省份列表] 获取成功，共', Object.keys(provinceMap).length, '个省份');
            return provinceMap;
        }
        
        return getLocalProvinceMap();
    } catch (error) {
        console.warn('[省份列表] 获取异常，使用本地映射:', error);
        return getLocalProvinceMap();
    }
}

/**
 * 本地省份映射表（备用）
 */
function getLocalProvinceMap() {
    return {
        'BJ': '北京市', 'TJ': '天津市', 'HE': '河北省', 'SX': '山西省', 'NM': '内蒙古',
        'LN': '辽宁省', 'JL': '吉林省', 'HL': '黑龙江省', 'SH': '上海市', 'JS': '江苏省',
        'ZJ': '浙江省', 'AH': '安徽省', 'FJ': '福建省', 'JX': '江西省', 'SD': '山东省',
        'HA': '河南省', 'HB': '湖北省', 'HN': '湖南省', 'GD': '广东省', 'GX': '广西',
        'HI': '海南省', 'CQ': '重庆市', 'SC': '四川省', 'GZ': '贵州省', 'YN': '云南省',
        'XZ': '西藏', 'SN': '陕西省', 'GS': '甘肃省', 'QH': '青海省', 'NX': '宁夏',
        'XJ': '新疆', 'TW': '台湾省', 'HK': '香港', 'MO': '澳门'
    };
}

// 处理管理员登录
function handleAdminLogin(e) {
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
                // 检查是否有项目
                const userProjects = result.user.projects || [];
                if (userProjects.length === 0) {
                    hideLoadingScreen();
                    showError(accountErrorMessage, '您的账号没有关联项目，请联系管理员');
                    console.warn('[管理员登录] 用户没有关联项目');
                    return;
                }

                // 保存记住的密码
                if (rememberAdminCheckbox?.checked) {
                    saveAdminCredentials(username, password);
                } else {
                    clearAdminCredentials();
                }

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
            
            // 获取用户ID（数字ID用于项目查询，字符串user_id用于司机查询）
            const userId = userInfo.id;  // 数字ID，如 66
            const userIdStr = userInfo.user_id;  // 字符串ID，如 'USER_20251119_0229'
            
            console.log('[登录] 用户ID信息 - 数字ID:', userId, ', 字符串user_id:', userIdStr);
            
            if (token) {
                sessionStorage.setItem('authToken', token);
            } else {
                console.error('[登录] 未找到token，data.data:', data.data);
            }

            if (!userId) {
                console.warn('[登录] 未找到用户ID，将无法获取用户项目列表');
            }

            // 获取用户详细信息（包括角色、是否司机等）
            const userDetail = await fetchUserDetail(token, userId);
            
            // 判断用户类型
            const isDriver = userDetail?.isDriver || false;
            const isAdmin = userDetail?.isAdmin || false;
            const roleNames = userDetail?.roleNames || [];
            const driverId = userDetail?.driver_id;
            
            // 确定用户角色（用于后续跳转判断）
            let userRole = 'user';
            if (isAdmin) {
                userRole = 'manager';
            } else if (isDriver) {
                userRole = 'driver';
            }
            
            // 获取用户参与的项目列表（需要用户ID）
            // API需要字符串user_id（如USER_20251119_0229），而非数字id
            console.log('[项目列表] 准备调用，使用userIdStr:', userIdStr);
            const userProjects = userIdStr ? await fetchUserProjects(token, userIdStr) : [];
            
            // 获取用户关联的车辆信息（仅司机需要）
            // 用user_id字符串去运输服务查询司机信息
            let userVehicle = { licensePlate: '' };
            if (isDriver && userIdStr) {
                userVehicle = await fetchUserVehicle(token, userIdStr);
            }

            // 返回用户信息
            return {
                success: true,
                user: {
                    username: username,
                    userId: userId,
                    userIdStr: userIdStr,  // 字符串ID，用于司机查询
                    role: userRole,
                    isDriver: isDriver,
                    isAdmin: isAdmin,
                    roleNames: roleNames,
                    projects: userProjects,
                    licensePlate: userVehicle.licensePlate,
                    ...userInfo,
                    ...userDetail
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
 * 手机号登录API（暂时使用与账号密码相同的方式，后续替换为真实接口）
 * @param {string} phone - 手机号
 * @param {string} code - 验证码
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
async function loginWithPhoneAPI(phone, code) {
    try {
        // TODO: 后续替换为真实的手机号登录接口
        // 目前暂时使用与账号密码相同的加密登录方式
        // 真实接口可能是: POST /api/user/auth/phone-login { phone, code }
        
        // 1. 获取RSA公钥
        const publicKey = await fetchPublicKey();
        
        if (!publicKey) {
            return {
                success: false,
                message: '获取加密公钥失败，请稍后重试'
            };
        }
        
        // 2. 使用公钥加密登录信息（暂时用手机号作为用户名，验证码作为密码）
        const encryptedData = encryptLoginData(publicKey, phone, code);
        
        if (!encryptedData) {
            return {
                success: false,
                message: '加密失败，请稍后重试'
            };
        }
        
        // 3. 发送加密后的登录请求
        // TODO: 后续替换为真实的手机号登录接口
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
            
            // 获取用户ID
            const userId = userInfo.id;  // 数字ID
            const userIdStr = userInfo.user_id;  // 字符串ID
            
            console.log('[手机登录] 用户ID信息 - 数字ID:', userId, ', 字符串user_id:', userIdStr);
            
            if (token) {
                sessionStorage.setItem('authToken', token);
            }

            // 获取用户详细信息
            const userDetail = await fetchUserDetail(token, userId);
            
            // 手机号登录默认为司机角色
            const isDriver = true;
            const isAdmin = false;
            const roleNames = userDetail?.roleNames || ['司机'];
            
            // 获取用户参与的项目列表
            const userProjects = userIdStr ? await fetchUserProjects(token, userIdStr) : [];

            // 返回用户信息（手机号登录不获取车辆信息，需要手动输入）
            return {
                success: true,
                user: {
                    username: phone,
                    phone: phone,
                    userId: userId,
                    role: 'driver',
                    isDriver: isDriver,
                    isAdmin: isAdmin,
                    roleNames: roleNames,
                    projects: userProjects,
                    licensePlate: '', // 手机号登录需要手动输入车牌号
                    ...userInfo,
                    ...userDetail
                }
            };
        } else {
            return {
                success: false,
                message: data.message || '手机号或验证码错误'
            };
        }
    } catch (error) {
        console.error('[手机号登录] API调用失败:', error);
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
 * 获取用户详细信息（包括用户类型、关联的司机ID等）
 * 使用 /auth/me 接口获取当前登录用户的完整信息
 * @param {string} token - 认证token
 * @param {number} userId - 用户ID（备用）
 * @returns {Promise<Object|null>} 用户详细信息
 */
async function fetchUserDetail(token, userId) {
    if (!token) return null;
    
    try {
        // 使用 /auth/me 接口获取当前登录用户信息
        const response = await fetch('https://dmap.cscec3bxjy.cn/api/user/auth/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.code === 200 && data.data) {
                const user = data.data;
                console.log('[用户详情] 获取成功:', user);
                
                // 解析角色信息，判断用户类型
                const roles = user.roles || [];
                const roleNames = roles.map(r => r.role_name || r.name || r);
                
                // 判断是否是司机（角色名包含"司机"）
                const isDriver = roleNames.some(name => 
                    name.includes('司机') || name.includes('driver')
                );
                
                // 判断是否是管理员（角色名包含"管理员"或"admin"）
                const isAdmin = roleNames.some(name => 
                    name.includes('管理员') || name.includes('admin') || name.includes('Admin')
                );
                
                return {
                    ...user,
                    roleNames: roleNames,
                    isDriver: isDriver,
                    isAdmin: isAdmin
                    // 注意：不在这里设置driver_id，因为用户ID不等于司机ID
                };
            }
        }
        
        console.warn('[用户详情] 获取失败，状态码:', response.status);
        return null;
    } catch (error) {
        console.error('[用户详情] API调用失败:', error);
        return null;
    }
}

/**
 * 获取用户参与的项目列表（使用 /details 接口，直接返回项目详情）
 * @param {string} token - 认证token
 * @param {string} userIdStr - 用户ID字符串（如 USER_20251119_0229）
 * @returns {Promise<Array>} 项目列表
 */
async function fetchUserProjects(token, userIdStr) {
    // 如果没有userIdStr，直接返回空数组
    if (!userIdStr) {
        console.warn('[项目列表] 缺少用户ID字符串，将使用默认项目列表');
        return [];
    }

    console.log('[项目列表] 调用API，userIdStr:', userIdStr);

    try {
        // 调用 /details 接口，直接获取项目详情列表（包含 project_id, project_name, province_id）
        const response = await fetch(`https://dmap.cscec3bxjy.cn/api/project/relations_users/${userIdStr}/details`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 404) {
            console.warn('[项目列表] 接口暂未实现(404)，将使用默认项目列表');
            return [];
        }

        const data = await response.json();
        console.log('[项目列表] API返回数据:', data);

        if (!response.ok || data.code !== 200) {
            console.error('[项目列表] 获取项目详情列表失败:', data.message);
            return [];
        }

        const projectList = data.data || [];
        
        if (projectList.length === 0) {
            console.warn('[项目列表] 用户没有关联的项目');
            return [];
        }

        // 从API获取省份代码到名称的映射
        const provinceCodeToName = await fetchAllProvinces(token);

        // 直接解析返回的项目详情，并过滤掉数据不完整的项目
        const validProjects = projectList
            .map(item => {
                const provinceId = item.province_id || null;
                return {
                    id: item.id,
                    projectCode: item.project_id || '',
                    provinceId: provinceId,
                    projectName: item.project_name || '',
                    province: (provinceId && provinceCodeToName[provinceId]) ? provinceCodeToName[provinceId] : '未知省份'
                };
            })
            .filter(project => {
                // 过滤掉省份ID为空或项目名称为空的项目
                const isValid = project.provinceId && project.projectName.trim();
                if (!isValid) {
                    console.warn('[项目列表] 过滤掉数据不完整的项目:', project);
                }
                return isValid;
            });

        console.log('[项目列表] 获取完成，项目数:', validProjects.length, '项目列表:', validProjects);
        return validProjects;

    } catch (error) {
        console.error('[项目列表] API调用失败:', error);
        return [];
    }
}

/**
 * 获取所有省份列表，构建省份代码到名称的映射
 * @param {string} token - 认证token
 * @returns {Promise<Object>} 省份代码到名称的映射 { province_id: province_name }
 */
async function fetchAllProvinces(token) {
    try {
        const response = await fetch('https://dmap.cscec3bxjy.cn/api/project/provinces', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[省份列表] 获取失败:', response.status);
            return {};
        }

        const data = await response.json();
        
        if (data.code === 200 && Array.isArray(data.data)) {
            // 构建省份代码到名称的映射
            const provinceMap = {};
            // 同时构建 省份代码 → 数字ID 的映射
            const codeToNumericId = {};
            
            data.data.forEach(province => {
                const numericId = province.id;        // 数字ID，如 1
                const code = province.province_id;    // 省份代码，如 "BJ"
                const name = province.province_name;  // 省份名称，如 "北京市"
                if (code && name) {
                    provinceMap[code] = name;
                    if (numericId) {
                        codeToNumericId[code] = numericId;
                    }
                }
            });
            
            console.log('[省份列表] 获取成功，共', Object.keys(provinceMap).length, '个省份');
            
            // 将映射存储到全局，供其他地方使用
            window.provinceCodeToNumericId = codeToNumericId;
            
            return provinceMap;
        }
        
        return {};
    } catch (error) {
        console.error('[省份列表] 获取异常:', error);
        return {};
    }
}

/**
 * 批量获取省份名称
 * @param {string} token - 认证token
 * @param {Array} provinceIds - 省份ID数组
 * @returns {Promise<Object>} 省份ID到名称的映射 { id: name }
 */
async function fetchProvinceNames(token, provinceIds) {
    try {
        // GET请求，province_ids作为query参数，逗号分隔
        const idsParam = provinceIds.join(',');
        const response = await fetch(`https://dmap.cscec3bxjy.cn/api/project/provinces/batch?province_ids=${idsParam}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('[省份信息] 批量获取省份失败:', response.status);
            return {};
        }

        const data = await response.json();
        
        if (data.code === 200 && data.data) {
            // 构建省份ID到名称的映射
            const provinceMap = {};
            const provinces = Array.isArray(data.data) ? data.data : [data.data];
            
            provinces.forEach(province => {
                // 尝试多种可能的字段名
                const id = province.id || province.province_id;
                const name = province.province_name || province.name;
                if (id && name) {
                    // 同时存储数字和字符串类型的key，确保匹配
                    provinceMap[id] = name;
                    provinceMap[String(id)] = name;
                }
            });
            
            console.log('[省份信息] 获取成功:', provinceMap);
            return provinceMap;
        }
        
        return {};
    } catch (error) {
        console.error('[省份信息] 批量获取省份异常:', error);
        return {};
    }
}

/**
 * 获取用户关联的车辆信息
 * 流程：用户user_id → 查询司机详情 → 获取vehicle_id → 查询车辆详情 → 获取车牌号
 * @param {string} token - 认证token
 * @param {string} userIdStr - 用户的user_id字符串（如 'xya'）
 * @returns {Promise<Object>} 车辆信息 { licensePlate: string }
 */
async function fetchUserVehicle(token, userIdStr) {
    const transportBaseURL = 'https://dmap.cscec3bxjy.cn/api/transport';
    
    if (!userIdStr) {
        console.log('[车辆信息] 缺少user_id');
        return { licensePlate: '' };
    }
    
    try {
        // 第一步：用user_id字符串查询司机详情
        console.log('[车辆信息] 查询司机，user_id:', userIdStr);
        const driverResponse = await fetch(`${transportBaseURL}/drivers/${userIdStr}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!driverResponse.ok) {
            console.log('[车辆信息] 未找到司机信息，user_id:', userIdStr);
            return { licensePlate: '' };
        }

        const driverData = await driverResponse.json();
        if (driverData.code !== 200 || !driverData.data) {
            return { licensePlate: '' };
        }

        const driver = driverData.data;
        console.log('[车辆信息] 司机详情:', driver);

        // 如果司机信息中直接有车牌号，直接返回
        if (driver.license_plate || driver.licensePlate) {
            return { licensePlate: driver.license_plate || driver.licensePlate };
        }

        // 第二步：获取vehicle_id，查询车辆详情
        const vehicleId = driver.vehicle_id || driver.vehicleId;
        if (!vehicleId) {
            console.log('[车辆信息] 司机没有关联车辆');
            return { licensePlate: '' };
        }

        const vehicleResponse = await fetch(`${transportBaseURL}/vehicles/${vehicleId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!vehicleResponse.ok) {
            console.log('[车辆信息] 未找到车辆信息，vehicleId:', vehicleId);
            return { licensePlate: '' };
        }

        const vehicleData = await vehicleResponse.json();
        if (vehicleData.code === 200 && vehicleData.data) {
            const vehicle = vehicleData.data;
            console.log('[车辆信息] 车辆详情:', vehicle);
            return { 
                licensePlate: vehicle.license_plate || vehicle.licensePlate || vehicle.plate_number || ''
            };
        }

        return { licensePlate: '' };

    } catch (error) {
        console.error('[车辆信息] 获取失败:', error);
        return { licensePlate: '' };
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
        // 清除sessionStorage中的历史数据（包括项目选择）
        const keysToRemove = [
            'kmlData',              // KML数据
            'kmlRawData',           // KML原始数据
            'kmlFileName',          // KML文件名
            'navigationRoute',      // 导航路线数据
            'searchHistory',        // 搜索历史
            'vehicleInfo',          // 车辆信息
            'mapState',             // 地图状态
            'selectedLocation',     // 选中的位置
            'projectSelection'      // ⭐ 项目选择（每次登录都要重新选择）
        ];

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
    // 项目数据（从API获取，不再使用默认数据）
    let projectsData = {};
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
                if (currentUser.role === 'manager' || currentUser.isAdmin) {
                    // 管理员直接跳转到管理员界面
                    showLoadingScreen();
                    setTimeout(() => {
                        window.location.href = 'admin_index.html';
                    }, 300);
                } else {
                    // 司机：已有车牌号，保存车辆信息后直接跳转
                    const vehicleInfo = {
                        licensePlate: currentUser.licensePlate,
                        driverName: currentUser.username,
                        type: 'driver',
                        timestamp: new Date().toISOString()
                    };
                    sessionStorage.setItem('vehicleInfo', JSON.stringify(vehicleInfo));

                    showLoadingScreen();
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 300);
                }
            } else {
                alert('请选择省份和项目');
            }
        });
    }

    // 初始化轮盘选择器的函数
    function initPickers() {
        const provinceColumn = document.getElementById('province-column');
        const projectColumn = document.getElementById('project-column');

        if (!provinceColumn || !projectColumn) return;

        // 从用户信息中获取项目列表
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        const userProjects = currentUser.projects || [];

        console.log('[项目选择器] 当前用户:', currentUser);
        console.log('[项目选择器] 用户项目数量:', userProjects.length);
        console.log('[项目选择器] 用户项目列表:', userProjects);

        // 如果用户有项目列表，使用用户的项目
        if (userProjects.length > 0) {
            projectsData = {};
            userProjects.forEach(project => {
                const province = project.province || '未知省份';
                console.log('[项目选择器] 处理项目:', project.projectName, '省份:', province);
                if (!projectsData[province]) {
                    projectsData[province] = [];
                }
                if (project.projectName && !projectsData[province].includes(project.projectName)) {
                    projectsData[province].push(project.projectName);
                }
            });
            console.log('[项目选择器] 分组后的项目数据:', projectsData);
        }

        const provinces = Object.keys(projectsData);
        console.log('[项目选择器] 省份列表:', provinces);

        if (provinces.length === 0) {
            console.warn('[项目选择器] 没有可用的省份！');
            return;
        }

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
    console.log('[项目选择] 开始显示项目选择界面');

    // 先验证用户信息和项目列表是否已保存
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    console.log('[项目选择] 当前用户:', currentUser);
    console.log('[项目选择] 项目数量:', (currentUser.projects || []).length);

    slideTo('project-card');

    // 初始化轮盘选择器（等待动画开始后执行）
    if (window.initProjectPickers) {
        setTimeout(() => {
            console.log('[项目选择] 准备初始化选择器');
            window.initProjectPickers();
        }, 50);
    }
}

// 隐藏项目选择，返回登录卡片
function showLoginForm() {
    slideToByElement(document.querySelector('.login-card'));
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

// ==================== 记住登录信息功能 ====================

/**
 * 加载记住的登录信息
 */
function loadRememberedCredentials() {
    // 加载司机登录信息
    const driverData = localStorage.getItem('rememberedDriver');
    if (driverData) {
        try {
            const data = JSON.parse(driverData);
            if (data.remember && driverNameInput && driverPhoneInput && driverPlateInput) {
                driverNameInput.value = data.name || '';
                driverPhoneInput.value = data.phone || '';
                driverPlateInput.value = data.plate || '';
                if (rememberDriverCheckbox) {
                    rememberDriverCheckbox.checked = true;
                }
                // 更新红色星号显示状态
                updateRequiredMarks();
                console.log('[自动填写] 司机登录信息已加载');
            }
        } catch (e) {
            console.error('[自动填写] 加载司机信息失败:', e);
        }
    }

    // 加载管理员登录信息
    const adminData = localStorage.getItem('rememberedAdmin');
    if (adminData) {
        try {
            const data = JSON.parse(adminData);
            if (data.remember && usernameInput && passwordInput) {
                usernameInput.value = data.username || '';
                passwordInput.value = data.password || '';
                if (rememberAdminCheckbox) {
                    rememberAdminCheckbox.checked = true;
                }
                console.log('[记住密码] 管理员登录信息已加载');
            }
        } catch (e) {
            console.error('[记住密码] 加载管理员信息失败:', e);
        }
    }
}

/**
 * 保存司机登录信息
 */
function saveDriverCredentials(name, phone, plate) {
    const data = {
        name: name,
        phone: phone,
        plate: plate,
        remember: true,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('rememberedDriver', JSON.stringify(data));
    console.log('[自动填写] 司机登录信息已保存');
}

/**
 * 清除司机登录信息
 */
function clearDriverCredentials() {
    localStorage.removeItem('rememberedDriver');
    console.log('[自动填写] 司机登录信息已清除');
}

/**
 * 保存管理员登录信息
 */
function saveAdminCredentials(username, password) {
    const data = {
        username: username,
        password: password,
        remember: true,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem('rememberedAdmin', JSON.stringify(data));
    console.log('[记住密码] 管理员登录信息已保存');
}

/**
 * 清除管理员登录信息
 */
function clearAdminCredentials() {
    localStorage.removeItem('rememberedAdmin');
    console.log('[记住密码] 管理员登录信息已清除');
}


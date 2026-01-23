/**
 * 车辆位置上报模块
 * 功能：司机进入系统后，每隔4秒上报一次车辆位置信息
 * 作者：系统自动生成
 * 日期：2026-01-07
 */

// 位置上报配置
const LocationReporterConfig = {
    reportInterval: 2000,           // 上报间隔（毫秒）2秒
    apiUrl: 'http://115.159.67.12:8086/api/transport/temp-vehicle/report',
    enabled: true,                  // 是否启用上报
    maxRetries: 3,                  // 最大重试次数
    retryDelay: 2000               // 重试延迟（毫秒）
};

// 上报器状态
let reporterState = {
    isRunning: false,               // 是否正在运行
    timerId: null,                  // 定时器ID
    lastReportTime: null,           // 最后上报时间
    reportCount: 0,                 // 上报次数
    failCount: 0,                   // 失败次数
    currentUser: null,              // 当前用户信息
    projectId: null,                // 项目ID
    lastPosition: null              // 最后的GPS位置
};

/**
 * 初始化位置上报器
 * 在司机进入首页后调用
 */
function initVehicleLocationReporter() {
    console.log('[位置上报器] 开始初始化...');

    // 检查是否已经在运行
    if (reporterState.isRunning) {
        console.log('[位置上报器] 已经在运行中');
        return;
    }

    // 获取当前用户信息
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    const projectSelection = JSON.parse(sessionStorage.getItem('projectSelection') || '{}');

    // 验证用户是否是司机
    if (!currentUser.isDriver && currentUser.role !== 'driver') {
        console.log('[位置上报器] 当前用户不是司机，不启动位置上报');
        return;
    }

    // 验证必要信息
    if (!currentUser.licensePlate) {
        console.warn('[位置上报器] 缺少车牌号信息，无法上报');
        return;
    }

    if (!projectSelection.project || !projectSelection.project.projectCode) {
        console.warn('[位置上报器] 缺少项目ID，无法上报');
        return;
    }

    // 保存信息
    reporterState.currentUser = currentUser;
    reporterState.projectId = projectSelection.project.projectCode;

    console.log('[位置上报器] 初始化成功');
    console.log('[位置上报器] 车牌号:', currentUser.licensePlate);
    console.log('[位置上报器] 项目ID:', reporterState.projectId);
    console.log('[位置上报器] 上报间隔:', LocationReporterConfig.reportInterval / 1000, '秒');

    // 注意：不在此处启动定时上报
    // 等待用户点击定位按钮或GPS定位成功后再启动
    console.log('[位置上报器] 等待GPS定位...');
}

/**
 * 启动位置上报
 * 当GPS定位成功后调用
 * @param {Object} position - GPS位置对象 {latitude, longitude}
 */
function startLocationReporting(position) {
    if (!LocationReporterConfig.enabled) {
        console.log('[位置上报器] 上报功能已禁用');
        return;
    }

    if (reporterState.isRunning) {
        console.log('[位置上报器] 已经在运行中');
        return;
    }

    // 验证必要信息
    if (!reporterState.currentUser || !reporterState.projectId) {
        console.warn('[位置上报器] 缺少必要信息，无法启动上报');
        return;
    }

    console.log('[位置上报器] 启动定时上报...');

    // 保存初始位置
    if (position) {
        reporterState.lastPosition = position;
    }

    // 立即执行一次上报
    reportVehicleLocation();

    // 启动定时器，每4秒上报一次
    reporterState.timerId = setInterval(() => {
        reportVehicleLocation();
    }, LocationReporterConfig.reportInterval);

    reporterState.isRunning = true;
    console.log('[位置上报器] 定时上报已启动');
}

/**
 * 停止位置上报
 */
function stopLocationReporting() {
    if (!reporterState.isRunning) {
        console.log('[位置上报器] 未在运行');
        return;
    }

    if (reporterState.timerId) {
        clearInterval(reporterState.timerId);
        reporterState.timerId = null;
    }

    reporterState.isRunning = false;

    console.log('[位置上报器] 已停止上报');
    console.log('[位置上报器] 统计信息 - 总上报次数:', reporterState.reportCount, '失败次数:', reporterState.failCount);
}

/**
 * 上报车辆位置
 * 获取当前GPS位置并上报到后端
 */
async function reportVehicleLocation() {
    try {
        // 获取当前GPS位置
        const position = await getCurrentGPSPosition();

        if (!position) {
            console.warn('[位置上报器] 无法获取GPS位置，跳过本次上报');
            return;
        }

        const { latitude, longitude } = position;
        const plateNumber = reporterState.currentUser.licensePlate;
        const projectId = reporterState.projectId;

        console.log('[位置上报器] 准备上报:', {
            latitude,
            longitude,
            plateNumber,
            projectId,
            time: new Date().toLocaleTimeString()
        });

        // 获取车辆方向角度（如果在导航中）
        const direction = window.currentMapRotation || 0;

        // 发送上报请求
        const response = await fetch(LocationReporterConfig.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                latitude,
                longitude,
                plateNumber,
                projectId,
                direction  // 车辆方向角度（相对正北）
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        // 更新状态
        reporterState.lastReportTime = new Date();
        reporterState.reportCount++;
        reporterState.lastPosition = position;

        console.log('[位置上报器] 上报成功:', result);
        console.log('[位置上报器] 累计上报次数:', reporterState.reportCount);

    } catch (error) {
        reporterState.failCount++;
        console.error('[位置上报器] 上报失败:', error);
        console.error('[位置上报器] 失败次数:', reporterState.failCount);

        // 注意：上报失败不停止定时器，会在下个周期继续尝试
    }
}

/**
 * 获取当前GPS位置
 * @returns {Promise<{latitude: number, longitude: number}>}
 */
function getCurrentGPSPosition() {
    return new Promise((resolve, reject) => {
        // 优先使用导航吸附后的位置（如果在导航中）
        if (window.NavCore && typeof window.NavCore.getStatus === 'function') {
            const navStatus = window.NavCore.getStatus();
            if (navStatus.isNavigating && window.snappedPosition) {
                // 使用吸附后的高精度位置
                resolve({
                    latitude: window.snappedPosition[1],
                    longitude: window.snappedPosition[0]
                });
                return;
            }
        }

        // 如果不在导航中，使用全局的GPS位置
        if (window.lastGpsPosIndex) {
            const lnglat = window.lastGpsPosIndex;
            resolve({
                latitude: lnglat[1],
                longitude: lnglat[0]
            });
            return;
        }

        // 如果没有实时定位，使用浏览器原生定位获取一次
        if (!navigator.geolocation) {
            reject(new Error('浏览器不支持定位'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // WGS84坐标，需要转换为GCJ02（高德坐标系）
                // 调用全局的坐标转换函数（如果存在）
                if (typeof wgs84ToGcj02 === 'function') {
                    const converted = wgs84ToGcj02(lng, lat);
                    // wgs84ToGcj02 返回数组 [经度, 纬度]
                    resolve({
                        latitude: converted[1],   // 数组第二个元素是纬度
                        longitude: converted[0]   // 数组第一个元素是经度
                    });
                } else {
                    // 如果没有转换函数，直接使用原始坐标
                    resolve({
                        latitude: lat,
                        longitude: lng
                    });
                }
            },
            (error) => {
                console.error('[位置上报器] GPS定位失败:', error);

                // 如果有上次的位置，使用上次的位置
                if (reporterState.lastPosition) {
                    console.log('[位置上报器] 使用上次的GPS位置');
                    resolve(reporterState.lastPosition);
                } else {
                    reject(error);
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 3000  // 允许使用3秒内的缓存
            }
        );
    });
}

/**
 * 获取上报器状态
 * @returns {Object} 上报器状态信息
 */
function getReporterStatus() {
    return {
        isRunning: reporterState.isRunning,
        reportCount: reporterState.reportCount,
        failCount: reporterState.failCount,
        lastReportTime: reporterState.lastReportTime,
        licensePlate: reporterState.currentUser?.licensePlate,
        projectId: reporterState.projectId
    };
}

// 导出到全局作用域
window.VehicleLocationReporter = {
    init: initVehicleLocationReporter,
    start: startLocationReporting,
    stop: stopLocationReporting,
    getStatus: getReporterStatus
};

console.log('[位置上报器] 模块已加载');

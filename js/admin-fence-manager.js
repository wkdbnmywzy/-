/**
 * 管理端电子围栏管理模块
 * 功能：管理电子围栏，在地图上显示围栏区域
 *
 * 报警机制：
 * - 报警由 WebSocket 推送（admin-websocket.js）
 * - 本地仅做围栏显示和状态追踪，不触发报警
 *
 * 报警规则（由后端判断）：
 * - 禁行区(prohibit)：任何车辆进入都报警
 * - 工地范围(fence)：固定车离开时报警
 */

const AdminFenceManager = (function() {
    'use strict';

    // API配置
    const API_CONFIG = {
        mapServiceURL: 'http://115.159.67.12:8088/api/map',
        endpoints: {
            fencePolygons: '/fence-polygons',
            projectFences: '/fence-polygons/project',
            checkFence: '/fence-polygons/check'
        }
    };

    // 校准配置
    const CALIBRATION_INTERVAL = 30000; // 后端校准间隔30秒

    // 围栏数据
    let fenceData = [];

    // 围栏多边形覆盖物
    let fencePolygons = [];

    // 地图实例
    let map = null;

    // 当前项目ID
    let currentProjectId = null;

    // 初始化标志
    let isInitialized = false;

    // 车辆围栏状态记录 - 改进版
    // key: vehicleId, value: Map<fenceId, { inFence: boolean, fenceType: string, fenceName: string }>
    let vehicleFenceStatus = new Map();

    // 校准定时器
    let calibrationTimer = null;

    // 待校准的车辆列表
    let vehiclesToCalibrate = [];

    /**
     * 初始化电子围栏管理器
     * @param {AMap.Map} mapInstance - 高德地图实例
     * @param {string} projectId - 项目ID
     */
    function init(mapInstance, projectId) {
        if (isInitialized) {
            console.log('[围栏管理器] 已经初始化，跳过重复初始化');
            return;
        }

        console.log('[围栏管理器] 初始化...', projectId);
        map = mapInstance;
        currentProjectId = projectId;

        if (!projectId) {
            console.warn('[围栏管理器] 缺少项目ID，无法加载围栏数据');
            return;
        }

        // 加载围栏数据
        loadFenceData(projectId);

        // 后端校准接口已废弃，禁用定时器
        // startCalibration();

        isInitialized = true;
    }

    /**
     * 加载项目的电子围栏数据
     * @param {string} projectId - 项目ID
     */
    async function loadFenceData(projectId) {
        try {
            // 尝试从缓存加载
            const cacheKey = `fenceData_${projectId}`;
            const cachedData = sessionStorage.getItem(cacheKey);
            const cacheTime = sessionStorage.getItem(`${cacheKey}_time`);
            const CACHE_DURATION = 5 * 60 * 1000; // 缓存5分钟

            if (cachedData && cacheTime && (Date.now() - parseInt(cacheTime)) < CACHE_DURATION) {
                console.log('[围栏管理器] 使用缓存的围栏数据');
                fenceData = JSON.parse(cachedData);
                console.log('[围栏管理器] 缓存围栏数量:', fenceData.length);
                displayFencesOnMap();
                return;
            }

            console.log('[围栏管理器] 加载围栏数据...');

            const token = sessionStorage.getItem('authToken') || '';
            const url = `${API_CONFIG.mapServiceURL}${API_CONFIG.endpoints.projectFences}/${projectId}`;

            console.log('[围栏管理器] 请求URL:', url);

            const headers = {
                'Content-Type': 'application/json'
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('[围栏管理器] 围栏API响应:', result);

            if (result.code === 200 && result.data) {
                fenceData = result.data;
                console.log('[围栏管理器] 加载围栏数量:', fenceData.length);

                // 缓存围栏数据
                const cacheKey = `fenceData_${projectId}`;
                sessionStorage.setItem(cacheKey, JSON.stringify(fenceData));
                sessionStorage.setItem(`${cacheKey}_time`, Date.now().toString());

                // 打印第一个围栏的完整结构，便于调试
                if (fenceData.length > 0) {
                    console.log('[围栏管理器] 第一个围栏完整数据:', JSON.stringify(fenceData[0], null, 2));
                }

                // 打印每个围栏的详细信息
                fenceData.forEach((fence, index) => {
                    // 后端字段映射：area_type (0=工地范围/fence, 1=禁行区/prohibit)
                    const areaType = fence.area_type;
                    const fenceType = areaType === 1 ? 'prohibit' : 'fence';
                    const fenceName = fence.polygon_name || fence.name || fence.fenceName || '未命名';
                    console.log(`[围栏管理器] 围栏${index + 1}: ${fenceName}, area_type=${areaType}, 映射类型: ${fenceType}`);
                });

                // 在地图上显示围栏
                displayFencesOnMap();
            } else {
                console.warn('[围栏管理器] 无围栏数据');
                fenceData = [];
            }

        } catch (error) {
            console.error('[围栏管理器] 加载围栏数据失败:', error);
            fenceData = [];
        }
    }

    /**
     * 在地图上显示电子围栏（区分类型颜色）
     */
    function displayFencesOnMap() {
        if (!map) {
            console.warn('[围栏管理器] 地图实例不存在');
            return;
        }

        // 清除旧的围栏
        clearFencePolygons();

        fenceData.forEach(fence => {
            try {
                const path = parseFenceCoordinates(fence);
                if (!path || path.length < 3) {
                    console.warn('[围栏管理器] 围栏坐标无效:', fence);
                    return;
                }

                // 使用统一的字段解析
                const { id: fenceId, name: fenceName, type: fenceType } = parseFenceFields(fence);

                // 根据围栏类型设置不同颜色
                const colors = getFenceColors(fenceType);

                // 创建多边形覆盖物
                const polygon = new AMap.Polygon({
                    path: path,
                    strokeColor: colors.stroke,
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: colors.fill,
                    fillOpacity: 0.1,
                    zIndex: 5,
                    bubble: true
                });

                // 设置扩展数据
                polygon.setExtData({
                    fenceId: fenceId,
                    fenceName: fenceName,
                    fenceType: fenceType
                });

                // 添加到地图
                polygon.setMap(map);

                // 添加点击事件
                polygon.on('click', function() {
                    const extData = polygon.getExtData();
                    const typeLabel = extData.fenceType === 'prohibit' ? '禁行区' : '工地范围';
                    const infoContent = `
                        <div style="padding:10px;">
                            <strong>${extData.fenceName}</strong><br/>
                            <span style="color:#999;">ID: ${extData.fenceId}</span><br/>
                            <span style="color:${colors.stroke};">类型: ${typeLabel}</span>
                        </div>
                    `;

                    const infoWindow = new AMap.InfoWindow({
                        content: infoContent,
                        offset: new AMap.Pixel(0, -10)
                    });

                    const bounds = polygon.getBounds();
                    const center = bounds.getCenter();
                    infoWindow.open(map, center);
                });

                fencePolygons.push(polygon);

            } catch (error) {
                console.error('[围栏管理器] 创建围栏失败:', error, fence);
            }
        });

        console.log('[围栏管理器] 地图上已显示围栏:', fencePolygons.length);
    }

    /**
     * 解析围栏字段（统一处理后端不同的字段名）
     * @param {Object} fence - 围栏原始数据
     * @returns {Object} - { id, name, type }
     */
    function parseFenceFields(fence) {
        // ID
        const id = fence.id || fence.fenceId || fence.polygon_id;

        // 名称：优先 polygon_name，其次 name/fenceName
        const name = fence.polygon_name || fence.name || fence.fenceName || '电子围栏';

        // 类型：area_type 数字映射 (0=工地范围, 1=禁行区)
        // 或者直接使用 type/fenceType 字符串
        let type = 'fence'; // 默认工地范围
        if (fence.area_type !== undefined) {
            type = fence.area_type === 1 ? 'prohibit' : 'fence';
        } else if (fence.type) {
            type = fence.type;
        } else if (fence.fenceType) {
            type = fence.fenceType;
        }

        return { id, name, type };
    }

    /**
     * 根据围栏类型获取颜色
     * @param {string} fenceType - 围栏类型
     * @returns {Object} - { stroke, fill }
     */
    function getFenceColors(fenceType) {
        if (fenceType === 'prohibit') {
            // 禁行区 - 红色
            return { stroke: '#FF0000', fill: '#FF0000' };
        } else {
            // 工地范围 - 蓝色
            return { stroke: '#2196F3', fill: '#2196F3' };
        }
    }

    /**
     * 解析围栏坐标
     * @param {Object} fence - 围栏数据
     * @returns {Array} - [[lng, lat], ...]
     */
    function parseFenceCoordinates(fence) {
        let coordinates = [];

        if (fence.coordinates) {
            coordinates = fence.coordinates;
        } else if (fence.polygon) {
            coordinates = fence.polygon;
        } else if (fence.path) {
            coordinates = fence.path;
        } else if (fence.pg_position) {
            try {
                if (typeof fence.pg_position === 'string') {
                    coordinates = JSON.parse(fence.pg_position);
                } else {
                    coordinates = fence.pg_position;
                }
            } catch (e) {
                console.error('[围栏管理器] 解析 pg_position 失败:', e);
                return null;
            }
        }

        if (!coordinates || coordinates.length < 3) {
            return null;
        }

        // 转换为 [lng, lat] 格式
        const path = coordinates.map(coord => {
            if (Array.isArray(coord)) {
                return [coord[0], coord[1]];
            } else if (coord.lng && coord.lat) {
                return [coord.lng, coord.lat];
            }
            return null;
        }).filter(p => p !== null);

        return path.length >= 3 ? path : null;
    }

    /**
     * 清除地图上的所有围栏
     */
    function clearFencePolygons() {
        fencePolygons.forEach(polygon => {
            if (polygon && map) {
                map.remove(polygon);
            }
        });
        fencePolygons = [];
    }

    /**
     * 检查点是否在多边形内（射线法）
     * @param {Array} point - 点坐标 [lng, lat]
     * @param {Array} polygon - 多边形坐标数组 [[lng, lat], ...]
     * @returns {boolean}
     */
    function isPointInPolygon(point, polygon) {
        const x = point[0];
        const y = point[1];
        let inside = false;

        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0];
            const yi = polygon[i][1];
            const xj = polygon[j][0];
            const yj = polygon[j][1];

            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }

    /**
     * 检查单个车辆的围栏状态（核心函数 - 支持进入/离开检测）
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     * @param {string} vehicleId - 车辆ID
     * @param {string} vehicleType - 车辆类型：'temp'(临时车) 或 'fixed'(固定车)
     * @returns {Object} - 检查结果
     */
    function checkVehicleFenceStatus(latitude, longitude, vehicleId, vehicleType = 'temp') {
        const point = [longitude, latitude];
        const results = [];

        // 获取该车辆之前的围栏状态
        if (!vehicleFenceStatus.has(vehicleId)) {
            vehicleFenceStatus.set(vehicleId, new Map());
        }
        const previousStatus = vehicleFenceStatus.get(vehicleId);

        // 记录当前在哪些围栏内
        const currentFenceIds = new Set();

        // 遍历所有围栏检测
        for (const fence of fenceData) {
            try {
                const path = parseFenceCoordinates(fence);
                if (!path) continue;

                // 使用统一的字段解析（支持后端 area_type/polygon_name 字段）
                const { id: fenceId, name: fenceName, type: fenceType } = parseFenceFields(fence);

                const currentlyInFence = isPointInPolygon(point, path);
                const previouslyInFence = previousStatus.has(fenceId) && previousStatus.get(fenceId).inFence;

                // 检测进入事件
                if (currentlyInFence && !previouslyInFence) {
                    // 刚进入围栏
                    console.log(`[围栏管理器] 车辆 ${vehicleId} 进入 ${fenceName} (类型: ${fenceType})`);

                    // 本地报警已禁用，改为由 WebSocket 推送报警
                    // if (fenceType === 'prohibit') {
                    //     triggerFenceWarning(vehicleId, fenceId, fenceName, fenceType, 'enter', latitude, longitude);
                    // }

                    results.push({
                        event: 'enter',
                        fenceId: fenceId,
                        fenceName: fenceName,
                        fenceType: fenceType
                    });
                }

                // 检测离开事件
                if (!currentlyInFence && previouslyInFence) {
                    // 刚离开围栏
                    console.log(`[围栏管理器] 车辆 ${vehicleId} 离开 ${fenceName} (类型: ${fenceType})`);

                    // 本地报警已禁用，改为由 WebSocket 推送报警
                    // if (fenceType === 'fence' && vehicleType === 'fixed') {
                    //     triggerFenceWarning(vehicleId, fenceId, fenceName, fenceType, 'leave', latitude, longitude);
                    // }

                    results.push({
                        event: 'leave',
                        fenceId: fenceId,
                        fenceName: fenceName,
                        fenceType: fenceType
                    });
                }

                // 更新状态
                if (currentlyInFence) {
                    currentFenceIds.add(fenceId);
                    previousStatus.set(fenceId, {
                        inFence: true,
                        fenceType: fenceType,
                        fenceName: fenceName
                    });
                } else {
                    previousStatus.delete(fenceId);
                }

            } catch (error) {
                console.error('[围栏管理器] 检查围栏失败:', error, fence);
            }
        }

        // 添加到待校准列表
        addToCalibrationQueue(vehicleId, latitude, longitude, vehicleType);

        return {
            vehicleId: vehicleId,
            vehicleType: vehicleType,
            events: results,
            currentFences: Array.from(currentFenceIds)
        };
    }

    /**
     * 兼容旧接口 - 检查车辆是否在围栏内
     */
    async function checkVehicleInFence(latitude, longitude, vehicleId, vehicleType = 'temp') {
        const result = checkVehicleFenceStatus(latitude, longitude, vehicleId, vehicleType);

        // 返回兼容格式
        if (result.currentFences.length > 0) {
            const fenceId = result.currentFences[0];
            const status = vehicleFenceStatus.get(vehicleId)?.get(fenceId);
            return {
                inFence: true,
                fenceId: fenceId,
                fenceName: status?.fenceName || '电子围栏',
                fenceType: status?.fenceType || 'fence'
            };
        }
        return { inFence: false };
    }

    /**
     * 批量检查多个车辆
     * @param {Array} vehicles - 车辆数组，每个元素包含 {vehicleId, latitude, longitude, vehicleType}
     */
    function checkMultipleVehicles(vehicles) {
        return vehicles.map(vehicle =>
            checkVehicleFenceStatus(
                vehicle.latitude,
                vehicle.longitude,
                vehicle.vehicleId,
                vehicle.vehicleType || 'temp'
            )
        );
    }

    /**
     * 触发围栏警告
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceId - 围栏ID
     * @param {string} fenceName - 围栏名称
     * @param {string} fenceType - 围栏类型
     * @param {string} eventType - 事件类型：'enter' 或 'leave'
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     */
    function triggerFenceWarning(vehicleId, fenceId, fenceName, fenceType, eventType, latitude, longitude) {
        const isEnter = eventType === 'enter';
        const actionText = isEnter ? '进入' : '离开';
        const fenceTypeText = fenceType === 'prohibit' ? '禁行区' : '工地范围';

        console.warn(`[围栏警告] 车辆 ${vehicleId} ${actionText} ${fenceTypeText} ${fenceName} (${fenceId})`);

        // 1. 存储消息到消息中心
        if (typeof AdminMessageManager !== 'undefined') {
            AdminMessageManager.addFenceAlertMessage(
                vehicleId, fenceId, fenceName, fenceType, eventType, latitude, longitude
            );
        }

        // 2. 围栏区域不闪烁，只让车辆闪烁（车辆闪烁在 admin-vehicle-manager.js 中处理）
        // highlightFenceOnMap(fenceId, fenceType);

        // 3. 记录日志
        logFenceEvent(vehicleId, fenceId, fenceName, fenceType, eventType, latitude, longitude);
    }

    /**
     * 显示围栏警告提示（已弃用，改为消息中心）
     */
    function showFenceAlert(vehicleId, fenceName, fenceType, eventType) {
        // 不再使用alert，改为消息中心
        // 保留此函数以备兼容
    }

    /**
     * 在地图上高亮围栏
     */
    function highlightFenceOnMap(fenceId, fenceType) {
        const targetPolygon = fencePolygons.find(polygon => {
            const extData = polygon.getExtData();
            return extData && extData.fenceId === fenceId;
        });

        if (targetPolygon) {
            const originalOptions = targetPolygon.getOptions();
            const highlightColor = fenceType === 'prohibit' ? '#FF0000' : '#FFA500'; // 红色或橙色

            // 闪烁效果
            let count = 0;
            const interval = setInterval(() => {
                if (count % 2 === 0) {
                    targetPolygon.setOptions({ fillColor: '#FFFF00', fillOpacity: 0.5 });
                } else {
                    targetPolygon.setOptions({ fillColor: highlightColor, fillOpacity: 0.3 });
                }
                count++;
                if (count >= 6) {
                    clearInterval(interval);
                    targetPolygon.setOptions({
                        fillColor: originalOptions.fillColor,
                        fillOpacity: originalOptions.fillOpacity
                    });
                }
            }, 300);
        }
    }

    /**
     * 记录围栏事件日志
     */
    function logFenceEvent(vehicleId, fenceId, fenceName, fenceType, eventType, latitude, longitude) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            vehicleId: vehicleId,
            fenceId: fenceId,
            fenceName: fenceName,
            fenceType: fenceType,
            eventType: eventType === 'enter' ? 'FENCE_ENTRY' : 'FENCE_EXIT',
            latitude: latitude,
            longitude: longitude
        };

        console.log('[围栏事件]', logEntry);

        // 可以将日志发送到后端API
        // sendFenceEventToServer(logEntry);
    }

    // ==================== 后端校准机制 ====================

    /**
     * 添加车辆到校准队列
     */
    function addToCalibrationQueue(vehicleId, latitude, longitude, vehicleType) {
        const existing = vehiclesToCalibrate.find(v => v.vehicleId === vehicleId);
        if (existing) {
            existing.latitude = latitude;
            existing.longitude = longitude;
            existing.vehicleType = vehicleType;
        } else {
            vehiclesToCalibrate.push({ vehicleId, latitude, longitude, vehicleType });
        }
    }

    /**
     * 启动后端校准定时器
     */
    function startCalibration() {
        if (calibrationTimer) {
            clearInterval(calibrationTimer);
        }

        calibrationTimer = setInterval(() => {
            if (vehiclesToCalibrate.length > 0) {
                console.log('[围栏管理器] 执行后端校准，车辆数:', vehiclesToCalibrate.length);
                calibrateWithBackend();
            }
        }, CALIBRATION_INTERVAL);

        console.log(`[围栏管理器] 后端校准已启动，间隔 ${CALIBRATION_INTERVAL / 1000} 秒`);
    }

    /**
     * 停止校准定时器
     */
    function stopCalibration() {
        if (calibrationTimer) {
            clearInterval(calibrationTimer);
            calibrationTimer = null;
        }
    }

    /**
     * 使用后端接口校准
     */
    async function calibrateWithBackend() {
        const vehicles = [...vehiclesToCalibrate];
        vehiclesToCalibrate = []; // 清空队列

        for (const vehicle of vehicles) {
            try {
                const result = await checkFenceWithAPI(vehicle.latitude, vehicle.longitude);

                if (result) {
                    // 比较本地状态和后端结果
                    const localStatus = vehicleFenceStatus.get(vehicle.vehicleId);
                    const localInFence = localStatus && localStatus.size > 0;
                    const backendInFence = result.inFence;

                    if (localInFence !== backendInFence) {
                        console.warn(`[围栏管理器] 校准发现差异 - 车辆 ${vehicle.vehicleId}: 本地=${localInFence}, 后端=${backendInFence}`);
                        // 以后端为准，重新检测一次
                        checkVehicleFenceStatus(vehicle.latitude, vehicle.longitude, vehicle.vehicleId, vehicle.vehicleType);
                    }
                }
            } catch (error) {
                console.error('[围栏管理器] 校准失败:', error, vehicle);
            }
        }
    }

    /**
     * 调用后端接口检查围栏
     */
    async function checkFenceWithAPI(latitude, longitude) {
        try {
            const token = sessionStorage.getItem('authToken') || '';
            const url = `${API_CONFIG.mapServiceURL}${API_CONFIG.endpoints.checkFence}?latitude=${latitude}&longitude=${longitude}`;

            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                // 静默处理，不打印错误（接口可能不支持）
                return null;
            }

            const result = await response.json();

            if (result.code === 200 && result.data) {
                return {
                    inFence: result.data.inFence || result.data.isInFence || false,
                    fenceId: result.data.fenceId || result.data.id,
                    fenceName: result.data.fenceName || result.data.name
                };
            }

            return { inFence: false };

        } catch (error) {
            // 静默处理网络错误
            return null;
        }
    }

    // ==================== 其他函数 ====================

    /**
     * 刷新围栏数据
     */
    async function refresh() {
        if (currentProjectId) {
            await loadFenceData(currentProjectId);
        }
    }

    /**
     * 销毁围栏管理器
     */
    function destroy() {
        stopCalibration();
        clearFencePolygons();
        fenceData = [];
        vehicleFenceStatus.clear();
        vehiclesToCalibrate = [];
        currentProjectId = null;
        isInitialized = false;
        console.log('[围栏管理器] 已销毁');
    }

    /**
     * 测试围栏显示
     */
    function addTestFence() {
        console.log('[围栏管理器] 添加测试围栏...');

        const center = map.getCenter();
        const offset = 0.002;

        // 添加一个工地范围（蓝色）
        const testFence1 = {
            id: 'test-fence-001',
            name: '测试工地范围',
            type: 'fence',
            coordinates: [
                [center.lng - offset, center.lat - offset],
                [center.lng + offset, center.lat - offset],
                [center.lng + offset, center.lat + offset],
                [center.lng - offset, center.lat + offset]
            ]
        };

        // 添加一个禁行区（红色）
        const testFence2 = {
            id: 'test-fence-002',
            name: '测试禁行区',
            type: 'prohibit',
            coordinates: [
                [center.lng + offset * 1.5, center.lat - offset * 0.5],
                [center.lng + offset * 2.5, center.lat - offset * 0.5],
                [center.lng + offset * 2.5, center.lat + offset * 0.5],
                [center.lng + offset * 1.5, center.lat + offset * 0.5]
            ]
        };

        fenceData.push(testFence1, testFence2);
        displayFencesOnMap();

        console.log('[围栏管理器] 测试围栏已添加 - 蓝色为工地范围，红色为禁行区');
    }

    // 导出API
    return {
        init: init,
        refresh: refresh,
        destroy: destroy,
        checkVehicleInFence: checkVehicleInFence,
        checkVehicleFenceStatus: checkVehicleFenceStatus,
        checkMultipleVehicles: checkMultipleVehicles,
        getFenceData: () => fenceData,
        getVehicleFenceStatus: () => vehicleFenceStatus,
        displayFencesOnMap: displayFencesOnMap,
        clearFencePolygons: clearFencePolygons,
        addTestFence: addTestFence,
        // 校准相关
        startCalibration: startCalibration,
        stopCalibration: stopCalibration
    };
})();

console.log('[围栏管理器] 模块已加载（支持进入/离开检测，区分围栏类型报警）');

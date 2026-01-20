/**
 * 管理端电子围栏管理模块
 * 功能：管理电子围栏，检测车辆进入围栏区域并发出警告
 * 作者：系统自动生成
 * 日期：2026-01-16
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

    // 车辆围栏状态记录（用于避免重复警告）
    let vehicleFenceStatus = new Map(); // key: vehicleId, value: Set<fenceId>

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

        isInitialized = true;
    }

    /**
     * 加载项目的电子围栏数据
     * @param {string} projectId - 项目ID
     */
    async function loadFenceData(projectId) {
        try {
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
     * 在地图上显示电子围栏
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
                // 解析围栏坐标
                let coordinates = [];

                // 假设API返回的坐标格式为 [[lng, lat], [lng, lat], ...]
                // 或者 {coordinates: [[lng, lat], ...]}
                if (fence.coordinates) {
                    coordinates = fence.coordinates;
                } else if (fence.polygon) {
                    coordinates = fence.polygon;
                } else if (fence.path) {
                    coordinates = fence.path;
                } else if (fence.pg_position) {
                    // 处理 pg_position 字段（可能是 JSON 字符串）
                    try {
                        if (typeof fence.pg_position === 'string') {
                            coordinates = JSON.parse(fence.pg_position);
                        } else {
                            coordinates = fence.pg_position;
                        }
                    } catch (e) {
                        console.error('[围栏管理器] 解析 pg_position 失败:', e, fence.pg_position);
                    }
                }

                if (!coordinates || coordinates.length < 3) {
                    console.warn('[围栏管理器] 围栏坐标无效:', fence);
                    return;
                }

                // 转换为高德地图格式 [lng, lat]
                const path = coordinates.map(coord => {
                    if (Array.isArray(coord)) {
                        return [coord[0], coord[1]];
                    } else if (coord.lng && coord.lat) {
                        return [coord.lng, coord.lat];
                    }
                    return null;
                }).filter(p => p !== null);

                if (path.length < 3) {
                    console.warn('[围栏管理器] 转换后的坐标不足:', fence);
                    return;
                }

                // 创建多边形覆盖物
                const polygon = new AMap.Polygon({
                    path: path,
                    strokeColor: '#FF0000',  // 红色边框
                    strokeWeight: 2,
                    strokeOpacity: 0.9,
                    fillColor: '#FF0000',    // 红色填充
                    fillOpacity: 0.05,       // 降低填充透明度，使底图更清晰
                    zIndex: 50,
                    bubble: true
                });

                // 设置扩展数据
                polygon.setExtData({
                    fenceId: fence.id || fence.fenceId,
                    fenceName: fence.name || fence.fenceName || '电子围栏',
                    fenceType: fence.type || fence.fenceType || 'fence'
                });

                // 添加到地图
                polygon.setMap(map);

                // 添加点击事件
                polygon.on('click', function() {
                    const extData = polygon.getExtData();
                    const infoContent = `
                        <div style="padding:10px;">
                            <strong>${extData.fenceName}</strong><br/>
                            <span style="color:#999;">ID: ${extData.fenceId}</span><br/>
                            <span style="color:#999;">类型: ${extData.fenceType === 'fence' ? '电子围栏' : '禁行区'}</span>
                        </div>
                    `;

                    const infoWindow = new AMap.InfoWindow({
                        content: infoContent,
                        offset: new AMap.Pixel(0, -10)
                    });

                    // 获取多边形中心点
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
     * 检查车辆是否在围栏内（本地判断）
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     * @param {string} vehicleId - 车辆ID（用于追踪状态）
     * @returns {Object} - 检查结果
     */
    function checkVehicleInFenceLocal(latitude, longitude, vehicleId) {
        const point = [longitude, latitude];

        for (const fence of fenceData) {
            try {
                // 解析围栏坐标
                let coordinates = [];
                if (fence.coordinates) {
                    coordinates = fence.coordinates;
                } else if (fence.polygon) {
                    coordinates = fence.polygon;
                } else if (fence.path) {
                    coordinates = fence.path;
                } else if (fence.pg_position) {
                    if (typeof fence.pg_position === 'string') {
                        coordinates = JSON.parse(fence.pg_position);
                    } else {
                        coordinates = fence.pg_position;
                    }
                }

                if (!coordinates || coordinates.length < 3) continue;

                // 转换为 [lng, lat] 格式
                const path = coordinates.map(coord => {
                    if (Array.isArray(coord)) {
                        return [coord[0], coord[1]];
                    } else if (coord.lng && coord.lat) {
                        return [coord.lng, coord.lat];
                    }
                    return null;
                }).filter(p => p !== null);

                if (path.length < 3) continue;

                // 判断点是否在多边形内
                if (isPointInPolygon(point, path)) {
                    const fenceId = fence.id || fence.fenceId;
                    const fenceName = fence.name || fence.fenceName || '电子围栏';

                    // 检查是否已经发出过警告
                    if (!hasWarned(vehicleId, fenceId)) {
                        // 触发警告
                        triggerFenceWarning(vehicleId, fenceId, fenceName, latitude, longitude);
                        // 记录已警告
                        markWarned(vehicleId, fenceId);
                    }

                    return {
                        inFence: true,
                        fenceId: fenceId,
                        fenceName: fenceName
                    };
                }
            } catch (error) {
                console.error('[围栏管理器] 检查围栏失败:', error, fence);
            }
        }

        // 车辆不在任何围栏内，清除警告状态
        clearWarned(vehicleId);
        return { inFence: false };
    }

    /**
     * 检查车辆是否在围栏内（使用API）
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     * @param {string} vehicleId - 车辆ID（用于追踪状态）
     * @returns {Promise<Object>} - 检查结果
     */
    async function checkVehicleInFence(latitude, longitude, vehicleId) {
        // 优先使用本地判断
        if (fenceData && fenceData.length > 0) {
            return checkVehicleInFenceLocal(latitude, longitude, vehicleId);
        }

        // 如果没有本地数据，使用API
        try {
            const token = sessionStorage.getItem('authToken') || '';
            const url = `${API_CONFIG.mapServiceURL}${API_CONFIG.endpoints.checkFence}?latitude=${latitude}&longitude=${longitude}`;

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

            if (result.code === 200 && result.data) {
                // 如果车辆在围栏内
                if (result.data.inFence || result.data.isInFence) {
                    const fenceId = result.data.fenceId || result.data.id;
                    const fenceName = result.data.fenceName || result.data.name || '电子围栏';

                    // 检查是否已经发出过警告
                    if (!hasWarned(vehicleId, fenceId)) {
                        // 触发警告
                        triggerFenceWarning(vehicleId, fenceId, fenceName, latitude, longitude);
                        // 记录已警告
                        markWarned(vehicleId, fenceId);
                    }

                    return {
                        inFence: true,
                        fenceId: fenceId,
                        fenceName: fenceName
                    };
                } else {
                    // 车辆离开围栏，清除该围栏的警告状态
                    clearWarned(vehicleId);
                    return {
                        inFence: false
                    };
                }
            }

            return { inFence: false };

        } catch (error) {
            console.error('[围栏管理器] 检查围栏失败:', error);
            return { inFence: false };
        }
    }

    /**
     * 批量检查多个车辆是否在围栏内
     * @param {Array} vehicles - 车辆数组，每个元素包含 {vehicleId, latitude, longitude}
     */
    async function checkMultipleVehicles(vehicles) {
        const promises = vehicles.map(vehicle =>
            checkVehicleInFence(vehicle.latitude, vehicle.longitude, vehicle.vehicleId)
        );

        const results = await Promise.all(promises);
        return results;
    }

    /**
     * 检查车辆是否已经对某个围栏发出过警告
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceId - 围栏ID
     * @returns {boolean}
     */
    function hasWarned(vehicleId, fenceId) {
        if (!vehicleFenceStatus.has(vehicleId)) {
            return false;
        }
        const fenceSet = vehicleFenceStatus.get(vehicleId);
        return fenceSet.has(fenceId);
    }

    /**
     * 标记车辆已对某个围栏发出警告
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceId - 围栏ID
     */
    function markWarned(vehicleId, fenceId) {
        if (!vehicleFenceStatus.has(vehicleId)) {
            vehicleFenceStatus.set(vehicleId, new Set());
        }
        vehicleFenceStatus.get(vehicleId).add(fenceId);
    }

    /**
     * 清除车辆的警告状态
     * @param {string} vehicleId - 车辆ID
     */
    function clearWarned(vehicleId) {
        vehicleFenceStatus.delete(vehicleId);
    }

    /**
     * 触发围栏警告
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceId - 围栏ID
     * @param {string} fenceName - 围栏名称
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     */
    function triggerFenceWarning(vehicleId, fenceId, fenceName, latitude, longitude) {
        console.warn(`[围栏警告] 车辆 ${vehicleId} 进入围栏 ${fenceName} (${fenceId})`);

        // 1. 浏览器通知（如果支持）
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('围栏警告', {
                body: `车辆 ${vehicleId} 已进入 ${fenceName}`,
                icon: 'images/工地数字导航小程序切图/管理/2X/运输管理/临时车.png'
            });
        }

        // 2. 页面提示
        showFenceAlert(vehicleId, fenceName);

        // 3. 在地图上标记（可选）
        highlightFenceOnMap(fenceId);

        // 4. 记录日志（可以发送到后端）
        logFenceEvent(vehicleId, fenceId, fenceName, latitude, longitude);
    }

    /**
     * 显示围栏警告提示
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceName - 围栏名称
     */
    function showFenceAlert(vehicleId, fenceName) {
        // 使用alert或自定义提示组件
        // 这里简单使用alert，实际项目中应该用更好的UI组件
        alert(`⚠️ 围栏警告\n\n车辆 ${vehicleId} 已进入禁行区域：${fenceName}`);
    }

    /**
     * 在地图上高亮围栏
     * @param {string} fenceId - 围栏ID
     */
    function highlightFenceOnMap(fenceId) {
        const targetPolygon = fencePolygons.find(polygon => {
            const extData = polygon.getExtData();
            return extData && extData.fenceId === fenceId;
        });

        if (targetPolygon) {
            // 临时高亮（闪烁效果）
            const originalColor = targetPolygon.getOptions().fillColor;

            // 闪烁3次
            let count = 0;
            const interval = setInterval(() => {
                if (count % 2 === 0) {
                    targetPolygon.setOptions({ fillColor: '#FFFF00', fillOpacity: 0.5 }); // 黄色
                } else {
                    targetPolygon.setOptions({ fillColor: originalColor, fillOpacity: 0.2 });
                }
                count++;
                if (count >= 6) {
                    clearInterval(interval);
                    targetPolygon.setOptions({ fillColor: originalColor, fillOpacity: 0.2 });
                }
            }, 300);
        }
    }

    /**
     * 记录围栏事件日志
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceId - 围栏ID
     * @param {string} fenceName - 围栏名称
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     */
    function logFenceEvent(vehicleId, fenceId, fenceName, latitude, longitude) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            vehicleId: vehicleId,
            fenceId: fenceId,
            fenceName: fenceName,
            latitude: latitude,
            longitude: longitude,
            eventType: 'FENCE_ENTRY'
        };

        console.log('[围栏事件]', logEntry);

        // 可以将日志发送到后端API
        // sendFenceEventToServer(logEntry);
    }

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
        clearFencePolygons();
        fenceData = [];
        vehicleFenceStatus.clear();
        currentProjectId = null;
        isInitialized = false;
        console.log('[围栏管理器] 已销毁');
    }

    /**
     * 测试围栏显示（添加一个测试围栏）
     */
    function addTestFence() {
        console.log('[围栏管理器] 添加测试围栏...');

        // 创建一个测试围栏（在地图中心周围）
        const center = map.getCenter();
        const offset = 0.002; // 约200米

        const testFence = {
            id: 'test-fence-001',
            fenceId: 'test-fence-001',
            name: '测试围栏区域',
            fenceName: '测试围栏区域',
            type: 'fence',
            coordinates: [
                [center.lng - offset, center.lat - offset],
                [center.lng + offset, center.lat - offset],
                [center.lng + offset, center.lat + offset],
                [center.lng - offset, center.lat + offset],
                [center.lng - offset, center.lat - offset] // 闭合
            ]
        };

        fenceData.push(testFence);
        displayFencesOnMap();

        console.log('[围栏管理器] 测试围栏已添加:', testFence);
        console.log('[围栏管理器] 你应该能在地图上看到一个红色半透明的矩形区域');
    }

    // 导出API
    return {
        init: init,
        refresh: refresh,
        destroy: destroy,
        checkVehicleInFence: checkVehicleInFence,
        checkMultipleVehicles: checkMultipleVehicles,
        getFenceData: () => fenceData,
        displayFencesOnMap: displayFencesOnMap,
        clearFencePolygons: clearFencePolygons,
        addTestFence: addTestFence  // 添加测试函数
    };
})();

console.log('[围栏管理器] 模块已加载');

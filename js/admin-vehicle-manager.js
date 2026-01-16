/**
 * 管理端车辆管理模块
 * 功能：显示和管理临时车辆和固定车辆
 * 作者：系统自动生成
 * 日期：2026-01-07
 */

const AdminVehicleManager = (function() {
    'use strict';

    // API配置
    const API_CONFIG = {
        baseURL: 'http://115.159.67.12:8086/api/transport',
        endpoints: {
            tempVehicles: '/temp-vehicle/project-vehicles',    // 临时车辆
            fixedVehicles: '/tracker/project-locations'         // 固定车辆（设备位置）
        }
    };

    // 车辆数据
    let vehicleData = {
        temp: [],       // 临时车辆数据
        fixed: []       // 固定车辆数据
    };

    // 车辆标记
    let vehicleMarkers = {
        temp: [],       // 临时车辆标记
        fixed: []       // 固定车辆标记
    };

    // 筛选状态
    let filterState = {
        temp: true,     // 是否显示临时车
        fixed: true     // 是否显示固定车
    };

    // 地图实例
    let map = null;

    // 路线数据（用于吸附）
    let routePolylines = [];

    // 初始化标志
    let isInitialized = false;
    let isUIInitialized = false; // UI是否已初始化

    // 定时刷新
    let refreshTimer = null;
    let currentProjectId = null; // 当前项目ID
    const REFRESH_INTERVAL = 5000; // 刷新间隔5秒（与司机端上报间隔接近）

    /**
     * 初始化车辆管理器
     * @param {AMap.Map} mapInstance - 高德地图实例
     */
    function init(mapInstance) {
        // 防止重复初始化
        if (isInitialized) {
            console.log('[车辆管理器] 已经初始化，跳过重复初始化');
            return;
        }

        console.log('[车辆管理器] 初始化...');
        map = mapInstance;

        // 获取项目ID（使用与admin_index.js相同的逻辑）
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

        let projectId = null;

        if (projectSelection) {
            try {
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
                    projectId = selectedProject.projectCode || selectedProject.id;
                    console.log('[车辆管理器] 项目信息:', {
                        name: projectName,
                        id: projectId
                    });
                }
            } catch (e) {
                console.error('[车辆管理器] 解析项目信息失败:', e);
            }
        }

        if (!projectId) {
            console.warn('[车辆管理器] 缺少项目ID，显示0辆车辆');
            // 初始化UI但不加载数据
            initUI();
            updateVehicleCount(); // 显示0辆
            isInitialized = true; // 标记为已初始化
            return;
        }

        console.log('[车辆管理器] 项目ID:', projectId);

        // 保存项目ID
        currentProjectId = projectId;

        // 初始化UI事件
        initUI();

        // 加载路线数据（用于吸附）
        loadRouteData();

        // 加载车辆数据
        loadVehicleData(projectId);

        // 启动定时刷新
        startAutoRefresh();

        // 标记为已初始化
        isInitialized = true;
    }

    /**
     * 初始化UI事件
     */
    function initUI() {
        // 防止重复初始化UI
        if (isUIInitialized) {
            console.log('[车辆管理器] UI已初始化，跳过');
            return;
        }

        console.log('[车辆管理器] 初始化UI事件');

        // 车辆切换按钮
        const vehicleToggleBtn = document.getElementById('vehicle-toggle-btn');
        const vehicleLegend = document.getElementById('vehicle-legend');

        if (vehicleToggleBtn && vehicleLegend) {
            vehicleToggleBtn.addEventListener('click', function() {
                // 获取当前显示状态
                const currentDisplay = window.getComputedStyle(vehicleLegend).display;
                const isVisible = currentDisplay !== 'none';

                // 切换显示状态
                if (isVisible) {
                    // 当前可见 → 隐藏
                    vehicleLegend.style.display = 'none';
                    vehicleToggleBtn.classList.remove('active');
                    console.log('[车辆管理器] 隐藏车辆图例');
                } else {
                    // 当前隐藏 → 显示
                    vehicleLegend.style.display = 'block';
                    vehicleToggleBtn.classList.add('active');
                    console.log('[车辆管理器] 显示车辆图例');
                }
            });
        }

        // 使用事件委托绑定图例项点击事件
        if (vehicleLegend) {
            vehicleLegend.addEventListener('click', function(e) {
                // 找到最近的 legend-item 元素
                const legendItem = e.target.closest('.legend-item');
                if (!legendItem) return;

                // 确定是第几个图例项
                const legendItems = vehicleLegend.querySelectorAll('.legend-item');
                const index = Array.from(legendItems).indexOf(legendItem);

                if (index !== -1) {
                    const type = index === 0 ? 'temp' : 'fixed';
                    console.log('[车辆管理器] 点击图例项:', type, '索引:', index);
                    toggleVehicleFilter(type);
                }
            });
        }

        // 标记UI已初始化
        isUIInitialized = true;
    }

    /**
     * 加载路线数据（用于吸附）
     */
    function loadRouteData() {
        try {
            // 尝试从全局变量获取路线数据
            if (window.polylines && window.polylines.length > 0) {
                routePolylines = window.polylines;
                console.log('[车辆管理器] 路线数据已加载:', routePolylines.length, '条');
            } else {
                console.warn('[车辆管理器] 未找到路线数据，车辆将不会吸附到路线');
            }
        } catch (e) {
            console.error('[车辆管理器] 加载路线数据失败:', e);
        }
    }

    /**
     * 加载车辆数据
     * @param {string} projectId - 项目ID
     */
    async function loadVehicleData(projectId) {
        console.log('[车辆管理器] 开始加载车辆数据...');

        try {
            // 并行加载临时车和固定车数据
            const [tempData, fixedData] = await Promise.all([
                fetchTempVehicles(projectId),
                fetchFixedVehicles(projectId)
            ]);

            vehicleData.temp = tempData || [];
            vehicleData.fixed = fixedData || [];

            console.log('[车辆管理器] 临时车辆:', vehicleData.temp.length, '辆');
            console.log('[车辆管理器] 固定车辆:', vehicleData.fixed.length, '辆');

            // 更新UI显示数量
            updateVehicleCount();

            // 在地图上显示车辆
            displayVehiclesOnMap();

            // 检查车辆是否在电子围栏内
            checkVehiclesInFence();

        } catch (error) {
            console.error('[车辆管理器] 加载车辆数据失败:', error);
        }
    }

    /**
     * 检查所有车辆是否在围栏内
     */
    async function checkVehiclesInFence() {
        // 检查围栏管理器是否可用
        if (typeof AdminFenceManager === 'undefined') {
            return;
        }

        try {
            // 准备车辆列表
            const vehicles = [];

            // 临时车辆
            vehicleData.temp.forEach(vehicle => {
                if (vehicle.latitude && vehicle.longitude) {
                    vehicles.push({
                        vehicleId: vehicle.plateNumber || 'unknown',
                        latitude: vehicle.latitude,
                        longitude: vehicle.longitude,
                        type: 'temp'
                    });
                }
            });

            // 固定车辆
            vehicleData.fixed.forEach(vehicle => {
                if (vehicle.latitude && vehicle.longitude) {
                    vehicles.push({
                        vehicleId: vehicle.deviceId || 'unknown',
                        latitude: vehicle.latitude,
                        longitude: vehicle.longitude,
                        type: 'fixed'
                    });
                }
            });

            if (vehicles.length > 0) {
                // 批量检查
                await AdminFenceManager.checkMultipleVehicles(vehicles);
            }

        } catch (error) {
            console.error('[车辆管理器] 检查围栏失败:', error);
        }
    }

    /**
     * 获取临时车辆数据
     * @param {string} projectId - 项目ID
     * @returns {Promise<Array>}
     */
    async function fetchTempVehicles(projectId) {
        try {
            const url = `${API_CONFIG.baseURL}${API_CONFIG.endpoints.tempVehicles}?projectId=${projectId}`;
            console.log('[车辆管理器] 请求临时车辆:', url);

            // 获取token
            const token = sessionStorage.getItem('authToken') || '';
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
            console.log('[车辆管理器] 临时车辆API响应:', result);

            // 解析返回数据
            if (result.code === 200 && result.data) {
                return result.data.map(item => ({
                    type: 'temp',
                    plateNumber: item.plateNumber,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    projectId: item.projectId,
                    updatedAt: item.updatedAt
                }));
            }

            return [];
        } catch (error) {
            console.error('[车辆管理器] 获取临时车辆失败:', error);
            return [];
        }
    }

    /**
     * 获取固定车辆（设备）数据
     * @param {string} projectId - 项目ID
     * @returns {Promise<Array>}
     */
    async function fetchFixedVehicles(projectId) {
        try {
            const url = `${API_CONFIG.baseURL}${API_CONFIG.endpoints.fixedVehicles}?projectId=${projectId}`;
            console.log('[车辆管理器] 请求固定车辆:', url);

            // 获取token
            const token = sessionStorage.getItem('authToken') || '';
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
            console.log('[车辆管理器] 固定车辆API响应:', result);

            // 解析返回数据
            if (result.code === 200 && result.data) {
                return result.data.map(item => ({
                    type: 'fixed',
                    deviceId: item.direction || 'unknown',  // 使用direction字段作为标识
                    latitude: item.latitude,
                    longitude: item.longitude
                }));
            }

            return [];
        } catch (error) {
            console.error('[车辆管理器] 获取固定车辆失败:', error);
            return [];
        }
    }

    /**
     * 更新车辆数量显示
     */
    function updateVehicleCount() {
        const legendItems = document.querySelectorAll('.vehicle-legend .legend-item span');
        if (legendItems.length >= 2) {
            legendItems[0].textContent = `临时车辆(${vehicleData.temp.length})`;
            legendItems[1].textContent = `固定车辆(${vehicleData.fixed.length})`;
        }
    }

    /**
     * 在地图上显示车辆（平滑更新版本）
     */
    function displayVehiclesOnMap() {
        if (!map) {
            console.warn('[车辆管理器] 地图实例不存在');
            return;
        }

        // 临时车辆：平滑更新
        if (filterState.temp) {
            updateVehicleMarkers(vehicleData.temp, 'temp');
        } else {
            // 如果筛选关闭，清除该类型的标记
            removeAllMarkersByType('temp');
        }

        // 固定车辆：平滑更新
        if (filterState.fixed) {
            updateVehicleMarkers(vehicleData.fixed, 'fixed');
        } else {
            // 如果筛选关闭，清除该类型的标记
            removeAllMarkersByType('fixed');
        }

        console.log('[车辆管理器] 地图上已显示车辆:', {
            temp: vehicleMarkers.temp.length,
            fixed: vehicleMarkers.fixed.length
        });
    }

    /**
     * 平滑更新车辆标记（不删除重建，而是更新位置）
     * @param {Array} vehicles - 车辆数据数组
     * @param {string} type - 'temp' 或 'fixed'
     */
    function updateVehicleMarkers(vehicles, type) {
        const markersArray = vehicleMarkers[type];
        const newMarkersArray = [];
        const processedIds = new Set();

        // 遍历新数据
        vehicles.forEach(vehicle => {
            const vehicleId = type === 'temp'
                ? vehicle.plateNumber
                : vehicle.deviceId;

            if (!vehicleId) return;

            processedIds.add(vehicleId);

            // 查找是否已有该车辆的marker
            const existingMarker = markersArray.find(m => {
                const extData = m.getExtData();
                return extData && extData.vehicleId === vehicleId;
            });

            if (existingMarker) {
                // 已存在，平滑更新位置和角度
                updateVehicleMarker(existingMarker, vehicle, type);
                newMarkersArray.push(existingMarker);
            } else {
                // 不存在，创建新marker
                const newMarker = createVehicleMarker(vehicle, type);
                if (newMarker) {
                    newMarkersArray.push(newMarker);
                }
            }
        });

        // 移除不在新数据中的marker
        markersArray.forEach(marker => {
            const extData = marker.getExtData();
            if (extData && !processedIds.has(extData.vehicleId)) {
                map.remove(marker);
            }
        });

        // 更新标记数组
        vehicleMarkers[type] = newMarkersArray;
    }

    /**
     * 平滑更新现有车辆标记的位置和角度
     * @param {AMap.Marker} marker - 现有标记
     * @param {Object} vehicle - 新的车辆数据
     * @param {string} type - 车辆类型
     */
    function updateVehicleMarker(marker, vehicle, type) {
        let lng = vehicle.longitude;
        let lat = vehicle.latitude;

        // 验证坐标有效性
        if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
            return;
        }

        // 应用路线吸附并获取行进方向
        const snappedResult = snapToRouteWithDirection([lng, lat]);
        let angle = 0;

        if (snappedResult) {
            lng = snappedResult.position[0];
            lat = snappedResult.position[1];
            angle = snappedResult.angle || 0;
        }

        const newPosition = [lng, lat];
        const oldPosition = marker.getPosition();

        // 计算移动距离
        const distance = calculateDistance(
            oldPosition.lat, oldPosition.lng,
            lat, lng
        );

        // 如果距离很小（<1米），直接设置位置，否则使用动画
        if (distance < 1) {
            marker.setPosition(newPosition);
            marker.setAngle(angle);
        } else {
            // 使用moveAlong实现平滑移动（5秒完成，与刷新间隔一致）
            marker.moveAlong([oldPosition, newPosition], {
                duration: 5000,
                autoRotation: false // 不自动旋转，使用我们计算的角度
            });

            // 更新角度（平滑过渡）
            setTimeout(() => {
                marker.setAngle(angle);
            }, 2500); // 中途更新角度
        }
    }

    /**
     * 移除指定类型的所有标记
     * @param {string} type - 'temp' 或 'fixed'
     */
    function removeAllMarkersByType(type) {
        vehicleMarkers[type].forEach(marker => {
            if (marker && map) {
                map.remove(marker);
            }
        });
        vehicleMarkers[type] = [];
    }

    /**
     * 创建车辆标记
     * @param {Object} vehicle - 车辆数据
     * @param {string} type - 车辆类型 'temp' 或 'fixed'
     * @returns {AMap.Marker}
     */
    function createVehicleMarker(vehicle, type) {
        try {
            let lng = vehicle.longitude;
            let lat = vehicle.latitude;

            // 验证坐标有效性
            if (!lng || !lat || isNaN(lng) || isNaN(lat)) {
                console.warn('[车辆管理器] 无效坐标:', vehicle);
                return null;
            }

            // 应用路线吸附并获取行进方向
            const snappedResult = snapToRouteWithDirection([lng, lat]);
            let angle = 0; // 默认角度

            if (snappedResult) {
                lng = snappedResult.position[0];
                lat = snappedResult.position[1];
                angle = snappedResult.angle || 0; // 获取行进方向角度
                console.log('[车辆管理器] 车辆吸附:', [vehicle.longitude, vehicle.latitude], '->', snappedResult.position, '角度:', angle);
            }

            // 选择图标
            const iconUrl = type === 'temp'
                ? 'images/工地数字导航小程序切图/管理/2X/运输管理/临时车.png'
                : 'images/工地数字导航小程序切图/管理/2X/运输管理/固定车.png';

            // 创建图标
            const icon = new AMap.Icon({
                size: new AMap.Size(40, 40),
                image: iconUrl,
                imageSize: new AMap.Size(40, 40)
            });

            // 创建标记（带旋转角度）
            const marker = new AMap.Marker({
                position: [lng, lat],
                icon: icon,
                offset: new AMap.Pixel(-20, -20),
                angle: angle, // 设置车头方向
                zIndex: 100,
                map: map
            });

            // 设置扩展数据（用于平滑更新时识别车辆）
            const vehicleId = type === 'temp' ? vehicle.plateNumber : vehicle.deviceId;
            marker.setExtData({
                vehicleId: vehicleId,
                type: type
            });

            // 添加信息窗口
            const infoContent = type === 'temp'
                ? `<div style="padding:10px;"><strong>临时车辆</strong><br/>车牌：${vehicle.plateNumber}<br/>更新时间：${vehicle.updatedAt || '未知'}</div>`
                : `<div style="padding:10px;"><strong>固定车辆</strong><br/>设备ID：${vehicle.deviceId}</div>`;

            const infoWindow = new AMap.InfoWindow({
                content: infoContent,
                offset: new AMap.Pixel(0, -30)
            });

            marker.on('click', function() {
                infoWindow.open(map, marker.getPosition());
            });

            return marker;
        } catch (error) {
            console.error('[车辆管理器] 创建车辆标记失败:', error);
            return null;
        }
    }

    /**
     * 路线吸附算法
     * @param {Array} position - 原始位置 [lng, lat]
     * @returns {Array|null} - 吸附后的位置 [lng, lat] 或 null
     */
    function snapToRoute(position) {
        if (!routePolylines || routePolylines.length === 0) {
            return null;
        }

        const SNAP_THRESHOLD = 10; // 吸附阈值10米（与导航常规吸附阈值一致）
        let minDistance = Infinity;
        let closestPoint = null;

        // 遍历所有路线
        routePolylines.forEach(polyline => {
            const path = polyline.getPath();
            if (!path || path.length === 0) return;

            // 遍历路线上的所有点
            path.forEach(point => {
                const distance = calculateDistance(
                    position[1], position[0],
                    point.lat, point.lng
                );

                if (distance < minDistance) {
                    minDistance = distance;
                    closestPoint = [point.lng, point.lat];
                }
            });
        });

        // 如果最近距离在阈值内，返回吸附点
        if (minDistance <= SNAP_THRESHOLD) {
            return closestPoint;
        }

        return null;
    }

    /**
     * 路线吸附算法（带方向计算）
     * @param {Array} position - 原始位置 [lng, lat]
     * @returns {Object|null} - {position: [lng, lat], angle: number} 或 null
     */
    function snapToRouteWithDirection(position) {
        if (!routePolylines || routePolylines.length === 0) {
            return null;
        }

        const SNAP_THRESHOLD = 10; // 吸附阈值10米（与导航常规吸附阈值一致）
        let minDistance = Infinity;
        let closestSegment = null;
        let closestProjection = null;

        // 遍历所有路线
        routePolylines.forEach(polyline => {
            const path = polyline.getPath();
            if (!path || path.length < 2) return;

            // 遍历路线上的所有线段
            for (let i = 0; i < path.length - 1; i++) {
                const segStart = path[i];
                const segEnd = path[i + 1];

                // 计算点到线段的最近距离和投影点
                const projection = projectPointToSegment(
                    position[0], position[1],
                    segStart.lng, segStart.lat,
                    segEnd.lng, segEnd.lat
                );

                if (projection.distance < minDistance) {
                    minDistance = projection.distance;
                    closestProjection = projection.point;
                    closestSegment = {
                        start: {lng: segStart.lng, lat: segStart.lat},
                        end: {lng: segEnd.lng, lat: segEnd.lat}
                    };
                }
            }
        });

        // 如果最近距离在阈值内，返回吸附点和方向
        if (minDistance <= SNAP_THRESHOLD && closestSegment && closestProjection) {
            // 计算线段的方向角度（从起点到终点）
            const angle = calculateSegmentAngle(
                closestSegment.start.lng,
                closestSegment.start.lat,
                closestSegment.end.lng,
                closestSegment.end.lat
            );

            return {
                position: closestProjection,
                angle: angle
            };
        }

        return null;
    }

    /**
     * 将点投影到线段上，返回最近点和距离
     * @param {number} px - 点的经度
     * @param {number} py - 点的纬度
     * @param {number} x1 - 线段起点经度
     * @param {number} y1 - 线段起点纬度
     * @param {number} x2 - 线段终点经度
     * @param {number} y2 - 线段终点纬度
     * @returns {Object} - {point: [lng, lat], distance: number}
     */
    function projectPointToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len2 = dx * dx + dy * dy;

        // 如果线段长度为0，返回起点
        if (len2 === 0) {
            const dist = calculateDistance(py, px, y1, x1);
            return {
                point: [x1, y1],
                distance: dist
            };
        }

        // 计算投影参数 t
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;

        // 限制 t 在 [0, 1] 范围内
        t = Math.max(0, Math.min(1, t));

        // 计算投影点
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        // 计算距离
        const dist = calculateDistance(py, px, projY, projX);

        return {
            point: [projX, projY],
            distance: dist
        };
    }

    /**
     * 计算线段的方向角度（用于车头朝向）
     * @param {number} lng1 - 起点经度
     * @param {number} lat1 - 起点纬度
     * @param {number} lng2 - 终点经度
     * @param {number} lat2 - 终点纬度
     * @returns {number} - 角度（度数，0-360，正北为0）
     */
    function calculateSegmentAngle(lng1, lat1, lng2, lat2) {
        const dLng = lng2 - lng1;
        const dLat = lat2 - lat1;

        // 使用 atan2 计算角度（弧度）
        let angleRad = Math.atan2(dLng, dLat);

        // 转换为度数
        let angleDeg = angleRad * 180 / Math.PI;

        // 确保角度在 0-360 范围内
        if (angleDeg < 0) {
            angleDeg += 360;
        }

        return angleDeg;
    }

    /**
     * 计算两点之间的距离（米）
     * @param {number} lat1 - 纬度1
     * @param {number} lng1 - 经度1
     * @param {number} lat2 - 纬度2
     * @param {number} lng2 - 经度2
     * @returns {number} - 距离（米）
     */
    function calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球半径（米）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * 切换车辆类型筛选
     * @param {string} type - 'temp' 或 'fixed'
     */
    function toggleVehicleFilter(type) {
        filterState[type] = !filterState[type];

        // 更新UI样式
        const legendItems = document.querySelectorAll('.vehicle-legend .legend-item');
        const index = type === 'temp' ? 0 : 1;

        if (legendItems[index]) {
            if (filterState[type]) {
                legendItems[index].style.backgroundColor = 'rgba(42, 134, 255, 0.1)';
            } else {
                legendItems[index].style.backgroundColor = '#ffffff';
            }
        }

        // 重新显示车辆
        displayVehiclesOnMap();

        console.log('[车辆管理器] 筛选状态:', filterState);
    }

    /**
     * 清除所有车辆标记
     */
    function clearVehicleMarkers() {
        // 清除临时车标记
        vehicleMarkers.temp.forEach(marker => {
            if (marker && map) {
                map.remove(marker);
            }
        });
        vehicleMarkers.temp = [];

        // 清除固定车标记
        vehicleMarkers.fixed.forEach(marker => {
            if (marker && map) {
                map.remove(marker);
            }
        });
        vehicleMarkers.fixed = [];
    }

    /**
     * 刷新车辆数据
     */
    async function refresh() {
        if (currentProjectId) {
            await loadVehicleData(currentProjectId);
        }
    }

    /**
     * 启动自动刷新
     */
    function startAutoRefresh() {
        // 清除旧的定时器（如果存在）
        stopAutoRefresh();

        // 启动新的定时器
        refreshTimer = setInterval(() => {
            if (currentProjectId) {
                console.log('[车辆管理器] 定时刷新车辆数据...');
                loadVehicleData(currentProjectId);
            }
        }, REFRESH_INTERVAL);

        console.log(`[车辆管理器] 已启动定时刷新，间隔${REFRESH_INTERVAL / 1000}秒`);
    }

    /**
     * 停止自动刷新
     */
    function stopAutoRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
            console.log('[车辆管理器] 已停止定时刷新');
        }
    }

    /**
     * 销毁车辆管理器
     */
    function destroy() {
        stopAutoRefresh();
        clearVehicleMarkers();
        vehicleData = { temp: [], fixed: [] };
        currentProjectId = null;
        isInitialized = false;
        console.log('[车辆管理器] 已销毁');
    }

    // 导出API
    return {
        init: init,
        refresh: refresh,
        destroy: destroy,
        stopAutoRefresh: stopAutoRefresh,
        startAutoRefresh: startAutoRefresh,
        getVehicleData: () => vehicleData,
        getFilterState: () => filterState
    };
})();

console.log('[车辆管理器] 模块已加载');

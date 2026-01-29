/**
 * nav-core.js
 * 导航核心逻辑模块
 * 整合所有子模块，提供统一的导航控制接口
 */

const NavCore = (function() {
    'use strict';

    // ==================== 吸附阈值配置（全局变量，便于调整）====================
    const SNAP_THRESHOLD_NORMAL = 10;     // 常规吸附阈值（直线路段、偏离后KML吸附、回归原路线）
    const SNAP_THRESHOLD_TURNING = 11;    // 转弯处吸附阈值（转弯时GPS误差大，放宽阈值）
    const SNAP_THRESHOLD_BUFFER = 12;     // 偏离缓冲阈值（10-12米需要连续确认）
    const DEVIATION_CONFIRM_COUNT = 5;    // 偏离确认次数（连续5次10-12米才确认偏离）
    const WAYPOINT_ARRIVAL_DISTANCE = 6;  // 途径点到达判断距离（GPS距离途径点≤6米）
    const WAYPOINT_CHECK_DISTANCE = 12;   // 途径点优先检查距离（偏离确认后优先检查是否到达）
    // ========================================================================

    // 导航状态
    let isNavigating = false;
    let isStartingNavigation = false;  // 是否正在启动导航（用于心跳检测启动过程中的卡死）
    let navigationStartingTime = 0;    // 导航启动开始时间
    let navigationPath = [];
    let routeData = null;

    // 定时器
    let updateTimer = null;

    // 上一次播报
    let lastPromptMessage = '';
    let lastPromptTime = 0;

    // 点集吸附相关
    let currentSnappedIndex = -1;  // 当前吸附的点索引
    let lastSnappedIndex = -1;     // 上一次吸附的点索引
    let snappedPosition = null;    // 当前吸附的位置
    let lastTurningPointIndex = -1; // 上一次触发旋转的转向点索引
    let currentMapRotation = 0;    // 当前地图旋转角度（记录状态，避免重复旋转）

    // 暴露地图旋转角度给位置上报器（管理端用这个角度显示车辆）
    window.currentMapRotation = 0;

    // 分段导航相关
    let currentSegmentIndex = 0;   // 当前路段索引（0=起点到途径点1/终点，1=途径点1到途径点2...）
    let segmentRanges = [];        // 每段在点集中的索引范围 [{start, end, name}, ...]
    let completedSegments = [];    // 已完成的路段灰色路线（用于降低层级）

    // 导航提示相关
    let currentGuidance = null;     // 当前导航提示 { type, distance, action, ... }
    let lastGuidanceTime = 0;       // 上一次提示更新时间
    let nextTurningPointIndex = -1; // 下一个转向点索引
    let hasPrompted1_4 = false;     // 是否已提示过1/4距离
    let hasPromptedBefore = false;  // 是否已提示过转向点前一个点
    let isInSegmentTransition = false; // 是否在段间过渡中

    // 速度计算相关
    let gpsHistory = [];            // GPS历史记录 [{position, time, segmentIndex}, ...]
    let currentSpeed = 8.33;        // 当前速度（m/s），初始值为8.33m/s（30km/h）
    let lastStraightPromptTime = 0; // 上一次直行提示时间
    let lastPromptType = null;      // 上一次提示类型（用于避免重复）

    // 导航阶段状态
    let hasReachedStart = false;    // 是否已到达起点（用于切换位置图标）

    // 导航统计数据
    let navigationStartTime = null;  // 导航开始时间
    let totalTravelDistance = 0;     // 总行程距离（米）

    // 偏离检测（次数确认机制）
    let deviationConfirmCount = 0;   // 连续偏离确认计数（9-12米范围内）
    let hasAnnouncedDeviation = false; // 是否已播报偏离
    let lastReplanTime = 0;          // 上次重新规划的时间戳（用于防抖）
    let isDeviationConfirmed = false; // 是否已确认偏离
    let savedOriginalGreenPointSet = null; // 【新增】偏离时保存的原始绿色点集（用于判断回归）
    let replanedSegmentEndPoints = null;   // 【新增】重规划后当前段的最后两个点（用于段间转向检测）

    // GPS处理节流与心跳检测
    let lastGPSProcessTime = 0;      // 上次GPS处理完成时间
    let isProcessingGPS = false;     // 是否正在处理GPS更新
    let gpsProcessStartTime = 0;     // GPS处理开始时间
    let heartbeatCheckerId = null;   // 心跳检测定时器
    let lastDisplayPosition = null;  // 上次显示的位置（用于检测位置卡死） 
    const GPS_MIN_INTERVAL = 300;    // GPS处理最小间隔（毫秒）
    const GPS_TIMEOUT = 3000;        // GPS处理超时时间（毫秒）

    // 转弯期间校验控制
    let isTurningPhase = false;      // 是否处于转弯阶段
    let turningPhaseEndTime = 0;     // 转弯阶段结束时间（播报"转弯"后3秒）

    // 设备朝向（导航页未引入首页 map-core.js，需要独立监听）
    let deviceHeading = null;       // 设备方向（0-360，正北为0，顺时针）
    let lastRawHeading = null;      // 上一次用于UI的有效朝向
    let lastPreStartPosition = null; // 起点前上一次GPS位置
    let orientationListening = false;
    let dynamicAngleOffset = 0;     // 0或180，自动校准用
    let calibrationLocked = false;
    let lastSmoothedAngle = null;   // 起点前用于显示的平滑角度

    function initDeviceOrientationListener() {
        if (orientationListening) return;
        try {
            const ua = navigator.userAgent || '';
            const isIOS = /iP(ad|hone|od)/i.test(ua);
            const isAndroid = /Android/i.test(ua);
            const requestIOS = () => {
                if (isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                    DeviceOrientationEvent.requestPermission().then(state => {
                        if (state === 'granted') attachOrientationEvents();
                    }).catch(() => {});
                } else {
                    attachOrientationEvents();
                }
            };
            function attachOrientationEvents() {
                const handler = (e) => {
                    let heading = null;
                    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
                        heading = e.webkitCompassHeading;
                    } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
                        // 使用 absolute 优先；普通 alpha 需转换为顺时针
                        heading = e.absolute === true ? e.alpha : (360 - e.alpha);
                        // Android 机型可能需要反转 absolute alpha
                        try {
                            if (e.absolute === true && isAndroid && MapConfig && MapConfig.orientationConfig && MapConfig.orientationConfig.androidNeedsInversion) {
                                heading = 360 - heading;
                            }
                        } catch (invErr) {}
                    }
                    if (heading !== null) {
                        if (heading < 0) heading += 360;
                        heading = heading % 360;
                        deviceHeading = heading;

                        // 起点前实时用设备朝向驱动图标旋转（与首页一致地“跟手”）
                        try {
                            if (isNavigating && !hasReachedStart) {
                                const finalAngleRaw = getAdjustedAngle(deviceHeading);
                                const finalAngle = smoothAngleEMA(lastSmoothedAngle, finalAngleRaw);
                                lastSmoothedAngle = finalAngle;
                                if (typeof NavRenderer.setUserMarkerAngle === 'function') {
                                    NavRenderer.setUserMarkerAngle(finalAngle);
                                }
                            }
                        } catch (err) {}
                    }
                };
                if ('ondeviceorientationabsolute' in window) {
                    window.addEventListener('deviceorientationabsolute', handler, true);
                } else {
                    window.addEventListener('deviceorientation', handler, true);
                }
                orientationListening = true;
            }
            requestIOS();
        } catch (e) {
            console.warn('[NavCore] 设备方向监听失败:', e);
        }
    }

    // 角度归一化 0..360
    function normAngle(a) {
        if (a === null || a === undefined || isNaN(a)) return 0;
        a = a % 360; if (a < 0) a += 360; return a;
    }

    // 角度绝对差 0..180
    function angleAbsDiff(a, b) {
        let d = ((a - b + 540) % 360) - 180; return Math.abs(d);
    }

    // 动态校准：对比设备heading与基于移动的bearing，稳定在180°附近则加180°偏移
    function attemptAutoCalibrationPreStart(curr, heading) {
        if (calibrationLocked) return;
        if (!lastPreStartPosition) return;
        if (heading === null || heading === undefined || isNaN(heading)) return;

        const dist = haversineDistance(lastPreStartPosition[1], lastPreStartPosition[0], curr[1], curr[0]);
        if (!isFinite(dist) || dist < 5) return; // 移动太小不校准

        const bearing = calculateBearing(lastPreStartPosition, curr);
        const diff = angleAbsDiff(heading, bearing);

        if (diff >= 155) { // 接近180°
            dynamicAngleOffset = 180;
            calibrationLocked = true;
        } else if (diff <= 25) { // 接近0°
            dynamicAngleOffset = 0;
            calibrationLocked = true;
        }
    }

    // 结合配置与地图旋转修正最终用于图标的角度
    function getAdjustedAngle(baseHeading) {
        let angle = normAngle(baseHeading);
        try {
            let cfgOffset = 0;
            if (MapConfig && MapConfig.orientationConfig && typeof MapConfig.orientationConfig.angleOffset === 'number') {
                cfgOffset = MapConfig.orientationConfig.angleOffset;
            }
            const mapObj = (typeof NavRenderer !== 'undefined' && NavRenderer.getMap) ? NavRenderer.getMap() : null;
            const mapRotation = mapObj && typeof mapObj.getRotation === 'function' ? (mapObj.getRotation() || 0) : 0;
            angle = angle + cfgOffset + (dynamicAngleOffset || 0) - (mapRotation || 0);
            angle = normAngle(angle);
        } catch (e) {}
        return angle;
    }

    // 角度EMA平滑（考虑环形角度，取最短差值）
    function smoothAngleEMA(prevAngle, currAngle) {
        try {
            const alpha = (MapConfig && MapConfig.orientationConfig && typeof MapConfig.orientationConfig.smoothingAlpha === 'number')
                ? Math.max(0, Math.min(1, MapConfig.orientationConfig.smoothingAlpha))
                : 0.25; // 默认平滑强度
            if (prevAngle === null || prevAngle === undefined || isNaN(prevAngle)) return normAngle(currAngle);
            const prev = normAngle(prevAngle);
            const curr = normAngle(currAngle);
            const delta = ((curr - prev + 540) % 360) - 180; // -180..180 最近路径
            return normAngle(prev + alpha * delta);
        } catch (e) {
            return normAngle(currAngle);
        }
    }

    /**
     * 初始化导航核心模块
     * @param {string} mapContainerId - 地图容器ID
     * @returns {boolean}
     */
    function init(mapContainerId) {
        try {
            if (!NavTTS.init()) {
                console.warn('[NavCore] TTS初始化失败');
            }

            if (!NavGPS.init()) {
                console.error('[NavCore] GPS初始化失败');
                return false;
            }

            const map = NavRenderer.initMap(mapContainerId);
            if (!map) {
                console.error('[NavCore] 地图初始化失败');
                return false;
            }

            // 初始化设备方向监听（用于起点前“我的位置”图标朝向）
            initDeviceOrientationListener();

            // 初始化熄屏/亮屏监测
            initVisibilityChangeListener();

            map.on('complete', onMapComplete);
            NavGuidance.init();

            return true;
        } catch (e) {
            console.error('[NavCore] 初始化失败:', e);
            return false;
        }
    }

    // 熄屏监测相关
    let lastVisibilityChangeTime = 0;
    let wasHidden = false;

    /**
     * 初始化熄屏/亮屏监测
     */
    function initVisibilityChangeListener() {
        try {
            document.addEventListener('visibilitychange', function() {
                const now = Date.now();
                if (document.hidden) {
                    wasHidden = true;
                    lastVisibilityChangeTime = now;
                    console.log('[熄屏监测] 页面隐藏');
                } else {
                    if (wasHidden && isNavigating) {
                        const hiddenDuration = now - lastVisibilityChangeTime;
                        console.log(`[熄屏监测] 页面恢复可见，隐藏时长: ${(hiddenDuration / 1000).toFixed(1)}秒`);
                        if (hiddenDuration > 2000) {
                            console.log('[熄屏监测] 重新获取GPS位置...');
                            refreshGPSPosition();
                        }
                    }
                    wasHidden = false;
                }
            });
            console.log('[NavCore] 熄屏监测已初始化');
        } catch (e) {
            console.error('[NavCore] 熄屏监测初始化失败:', e);
        }
    }

    /**
     * 刷新GPS位置（熄屏恢复后调用）
     */
    function refreshGPSPosition() {
        try {
            // 1. 立即获取一次最新位置
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lng = pos.coords.longitude;
                    const lat = pos.coords.latitude;
                    const accuracy = pos.coords.accuracy;
                    const converted = NavGPS.convertCoordinates(lng, lat);
                    console.log('[熄屏监测] GPS位置刷新成功:', converted, `精度:${accuracy}米`);
                    onGPSUpdate(converted, accuracy, 0);
                },
                (error) => {
                    console.warn('[熄屏监测] GPS位置刷新失败:', error.message);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );

            // 2. 确保GPS持续监听正常工作（某些设备熄屏后可能停止）
            if (NavGPS && typeof NavGPS.ensureWatching === 'function') {
                NavGPS.ensureWatching();
            }
        } catch (e) {
            console.error('[熄屏监测] 刷新GPS失败:', e);
        }
    }

    /**
     * 地图加载完成回调
     */
    function onMapComplete() {
        // 【关键修复】等待地图容器尺寸确定，避免 Pixel(NaN, NaN) 错误
        const mapContainer = document.getElementById('navigation-map-container');
        if (!mapContainer || mapContainer.offsetWidth === 0 || mapContainer.offsetHeight === 0) {
            console.warn('[NavCore] 地图容器尺寸未确定，等待300ms后重试...');
            setTimeout(onMapComplete, 300);
            return;
        }

        console.log('[NavCore] ✓ 地图容器尺寸:', mapContainer.offsetWidth, 'x', mapContainer.offsetHeight);

        // 加载KML数据
        loadKMLData();

        // 等待道路状态加载完成后再处理路线
        window.onRoadStatusLoaded = function() {
            console.log('[NavCore] 道路状态加载完成，开始处理路线...');
            handleRouteAfterMapReady();
            window.onRoadStatusLoaded = null;
        };

        // 设置超时，如果5秒内道路状态没有加载完成，也继续处理路线
        setTimeout(function() {
            if (window.onRoadStatusLoaded) {
                console.warn('[NavCore] 道路状态加载超时，直接处理路线');
                handleRouteAfterMapReady();
                window.onRoadStatusLoaded = null;
            }
        }, 5000);
    }

    /**
     * 地图准备好后处理路线（统一入口）
     */
    function handleRouteAfterMapReady() {
        // 延迟执行，确保地图完全渲染
        setTimeout(function() {
            // 【重构】统一使用普通导航流程
            // 任务导航现在也使用标准的 navigationRoute 格式存储数据
            // 不再需要检测 taskNavigationData
            console.log('[NavCore] 加载导航路线...');
            loadRouteData();
            // 同时恢复UI显示
            if (typeof NavUI !== 'undefined' && NavUI.restoreRoutePlanningData) {
                NavUI.restoreRoutePlanningData();
            }
        }, 500);  // 增加延迟，确保地图完全准备好
    }

    /**
     * 加载KML数据
     */
    function loadKMLData() {
        try {
            const processedData = NavDataStore.getProcessedKMLData();
            if (processedData) {
                NavRenderer.loadKMLData(processedData);
                syncKMLLayersToGlobal();
            }
        } catch (e) {
            console.error('[NavCore] 加载KML数据失败:', e);
        }
    }

    /**
     * 同步KML图层到全局变量
     */
    function syncKMLLayersToGlobal() {
        try {
            if (typeof window.kmlLayers === 'undefined') {
                console.error('[NavCore] window.kmlLayers 未定义');
                return false;
            }

            const layers = NavRenderer.getKMLLayers();
            if (layers && layers.length > 0) {
                window.kmlLayers.length = 0;
                window.kmlLayers.push(...layers);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[NavCore] 同步KML图层失败:', e);
            return false;
        }
    }

    /**
     * 加载路线数据
     */
    async function loadRouteData() {
        try {
            routeData = NavDataStore.getRoute();
            if (routeData) {
                await planRoute();
            }
        } catch (e) {
            console.error('[NavCore] 加载路线数据失败:', e);
        }
    }

    /**
     * 规划路线（支持途径点的多段路线规划）
     * 【问题7优化】当起点是"我的位置"且不在道路上时，自动找到最近的道路点作为实际起点
     */
    async function planRoute() {
        try {
            if (!routeData || !routeData.start || !routeData.end) {
                console.error('[NavCore] 路线数据不完整');
                return;
            }

            let startPos = routeData.start.position;
            const endPos = routeData.end.position;
            const waypoints = routeData.waypoints || [];

            // 验证终点坐标
            if (!endPos || !Array.isArray(endPos) || endPos.length < 2 ||
                isNaN(endPos[0]) || isNaN(endPos[1])) {
                console.error('[NavCore] 终点坐标无效:', endPos);
                return;
            }

            // 【新增】如果起点是"我的位置"，先获取最新的GPS位置
            const isMyLocationStart = routeData.start.name === '我的位置' ||
                                      routeData.start.isMyLocation === true;

            if (isMyLocationStart) {
                console.log('[NavCore] 起点是"我的位置"，获取最新GPS位置...');
                try {
                    const currentGPS = await getCurrentGPSPosition();
                    if (currentGPS && !isNaN(currentGPS[0]) && !isNaN(currentGPS[1])) {
                        startPos = currentGPS;
                        routeData.start.position = currentGPS;
                        console.log('[NavCore] 已更新起点为最新GPS位置:', currentGPS);

                        // 移动地图视野到当前位置
                        const mapInstance = NavRenderer.getMap();
                        if (mapInstance) {
                            mapInstance.setCenter(currentGPS);
                            console.log('[NavCore] 地图已移动到当前位置');
                        }
                    } else {
                        console.warn('[NavCore] GPS返回无效坐标');
                    }
                } catch (e) {
                    console.warn('[NavCore] 获取GPS位置失败:', e);
                }
            }

            // 验证起点坐标
            if (!startPos || !Array.isArray(startPos) || startPos.length < 2 ||
                isNaN(startPos[0]) || isNaN(startPos[1])) {
                console.error('[NavCore] 起点坐标无效，无法规划路线:', startPos);
                // 对于"我的位置"，提示用户需要允许定位权限
                if (isMyLocationStart) {
                    console.warn('[NavCore] 请允许获取位置权限后重试');
                }
                return;
            }

            const syncSuccess = syncKMLLayersToGlobal();
            if (!syncSuccess) {
                console.warn('[NavCore] KML图层同步失败');
            }

            // 【问题7】检查起点是否是"我的位置"，如果是，检查是否在道路上
            if (isMyLocationStart && typeof findNearestKMLSegment === 'function') {
                // 构建KML图（如果还没构建）
                if (!window.kmlGraph && typeof buildKMLGraph === 'function') {
                    buildKMLGraph();
                }
                
                // 查找最近的道路点
                const nearestSegment = findNearestKMLSegment(startPos);
                if (nearestSegment) {
                    const distanceToRoad = nearestSegment.distance;
                    console.log(`[NavCore] 我的位置距离最近道路: ${distanceToRoad.toFixed(2)}米`);
                    
                    // 如果距离道路超过5米，使用投影点作为实际起点
                    if (distanceToRoad > 5) {
                        const projPoint = nearestSegment.projectionPoint;
                        const actualStartPos = [projPoint.lng, projPoint.lat];
                        
                        console.log(`[NavCore] 我的位置不在道路上，实际起点调整为最近道路点:`, actualStartPos);
                        
                        // 保存原始位置和实际起点，用于引导
                        routeData.start.originalPosition = startPos;
                        routeData.start.actualStartPosition = actualStartPos;
                        routeData.start.distanceToRoad = distanceToRoad;
                        
                        // 使用实际起点进行路线规划
                        startPos = actualStartPos;
                    } else {
                        console.log(`[NavCore] 我的位置在道路上或附近，直接使用`);
                        routeData.start.actualStartPosition = null;
                        routeData.start.distanceToRoad = distanceToRoad;
                    }
                }
            }

            // 构建路线点序列
            const routePoints = [startPos];
            waypoints.forEach(wp => {
                if (wp && wp.position) {
                    routePoints.push(wp.position);
                }
            });
            routePoints.push(endPos);

            let path = [];

            if (typeof planKMLRoute === 'function' && syncSuccess) {
                let allSegmentsSuccess = true;

                for (let i = 0; i < routePoints.length - 1; i++) {
                    const segmentStart = routePoints[i];
                    const segmentEnd = routePoints[i + 1];

                    if (typeof resetKMLGraph === 'function') {
                        resetKMLGraph();
                    }

                    try {
                        const segmentResult = planKMLRoute(segmentStart, segmentEnd);

                        if (segmentResult && segmentResult.path && segmentResult.path.length >= 2) {
                            if (path.length > 0) {
                                for (let j = 1; j < segmentResult.path.length; j++) {
                                    path.push(segmentResult.path[j]);
                                }
                            } else {
                                path = path.concat(segmentResult.path);
                            }
                        } else {
                            if (path.length > 0) {
                                path.push(segmentEnd);
                            } else {
                                path.push(segmentStart);
                                path.push(segmentEnd);
                            }
                            allSegmentsSuccess = false;
                        }
                    } catch (e) {
                        console.error('[NavCore] 路段规划异常:', e);
                        if (path.length > 0) {
                            path.push(segmentEnd);
                        } else {
                            path.push(segmentStart);
                            path.push(segmentEnd);
                        }
                        allSegmentsSuccess = false;
                    }
                }
            }

            if (path.length < 2) {
                path = routePoints;
            }

            NavRenderer.drawRoute(path);
            NavRenderer.addRouteMarkers(startPos, endPos, routeData);

            if (waypoints.length > 0) {
                NavRenderer.addWaypointMarkers(waypoints);
            }

            navigationPath = path;

            const totalDistance = calculatePathDistance(path);
            const estimatedTime = Math.ceil(totalDistance / 8.33); // 使用8.33m/s（30km/h）计算预计时间

            if (typeof NavUI !== 'undefined' && NavUI.updateRouteInfo) {
                NavUI.updateRouteInfo({
                    distance: totalDistance,
                    time: estimatedTime
                });
            }

            const pointSet = resamplePathWithOriginalPoints(path, 3);
            window.navigationPointSet = pointSet;

            const turningPoints = detectTurningPoints(pointSet, 30);
            window.navigationTurningPoints = turningPoints;

            // 显示转向标签（导航开始前）- 暂时隐藏
            // if (turningPoints.length > 0) {
            //     NavRenderer.showTurnLabels(turningPoints);
            // }

            calculateSegmentRanges(path, waypoints);
        } catch (e) {
            console.error('[NavCore] 规划路线失败:', e);
        }
    }

    /**
     * 计算分段范围（基于途径点位置匹配）
     * @param {Array} path - 原始路径
     * @param {Array} waypoints - 途径点数组
     */
    function calculateSegmentRanges(path, waypoints) {
        segmentRanges = [];
        const pointSet = window.navigationPointSet;

        if (!pointSet || pointSet.length === 0) {
            console.error('[分段] 点集未生成');
            return;
        }

        console.log('[分段] 开始计算分段...');
        console.log('[分段] 原始路径点数:', path.length);
        console.log('[分段] 途径点数:', waypoints.length);
        console.log('[分段] 点集大小:', pointSet.length);

        // 构建分段：起点 -> 途径点1 -> 途径点2 -> ... -> 终点
        if (waypoints.length === 0) {
            // 没有途径点，只有一段
            segmentRanges.push({
                start: 0,
                end: pointSet.length - 1,
                name: '起点到终点'
            });
        } else {
            // 有途径点，通过坐标匹配找到途径点在点集中的位置
            let lastIndex = 0;

            for (let i = 0; i < waypoints.length; i++) {
                const waypoint = waypoints[i];

                // 检查途径点是否有位置信息
                if (!waypoint.position) {
                    console.warn(`[分段] 途径点${i + 1} (${waypoint.name}) 没有位置信息，跳过`);
                    continue;
                }

                const wpLng = Array.isArray(waypoint.position) ? waypoint.position[0] : waypoint.position.lng;
                const wpLat = Array.isArray(waypoint.position) ? waypoint.position[1] : waypoint.position.lat;

                console.log(`[分段] 查找途径点${i + 1}: [${wpLng}, ${wpLat}]`);

                // 在点集中查找最接近途径点的原始点
                let closestIndex = -1;
                let minDistance = Infinity;

                for (let j = lastIndex; j < pointSet.length; j++) {
                    const point = pointSet[j];
                    if (!point.isOriginal) continue; // 只检查原始路径点

                    const pos = point.position;
                    const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                    const lat = Array.isArray(pos) ? pos[1] : pos.lat;

                    const dist = haversineDistance(wpLat, wpLng, lat, lng);

                    if (dist < minDistance) {
                        minDistance = dist;
                        closestIndex = j;
                    }

                    // 如果距离小于5米，认为找到了
                    if (dist < 5) {
                        break;
                    }
                }

                if (closestIndex > lastIndex) {
                    console.log(`[分段] 找到途径点${i + 1}在点集索引${closestIndex}（距离${minDistance.toFixed(2)}米）`);
                    
                    segmentRanges.push({
                        start: lastIndex,
                        end: closestIndex,
                        name: `${i === 0 ? '起点' : '途径点' + i}到途径点${i + 1}`
                    });
                    lastIndex = closestIndex;
                } else {
                    console.warn(`[分段] 未找到途径点${i + 1}的匹配点（最近距离${minDistance.toFixed(2)}米）`);
                }
            }

            // 最后一段：最后一个途径点到终点
            segmentRanges.push({
                start: lastIndex,
                end: pointSet.length - 1,
                name: `途径点${waypoints.length}到终点`
            });
        }

        console.log('[分段] 路线分段完成:', segmentRanges.length, '段');
        segmentRanges.forEach((seg, idx) => {
            const segmentLength = seg.end - seg.start + 1;
            console.log(`  段${idx}: ${seg.name}, 点索引${seg.start}-${seg.end} (${segmentLength}个点)`);
        });

        // 初始化当前段索引
        currentSegmentIndex = 0;

        // 暴露到全局供UI使用
        window.segmentRanges = segmentRanges;
        window.currentSegmentIndex = currentSegmentIndex;
    }

    /**
     * 检查段间转向（从上一段末到当前段首）
     * 只在首次吸附到段首附近（前5个点）时播报
     * 【改进】优先使用重规划后保存的段末点
     */
    function checkSegmentTransition() {
        try {
            const fullPointSet = window.navigationPointSet;
            const currentSegmentPointSet = window.currentSegmentPointSet;

            if (!fullPointSet || !currentSegmentPointSet || currentSegmentIndex === 0) {
                return; // 第一段没有段间转向
            }

            // 【改进】只有在首次吸附到段首附近时才播报转向
            // 如果吸附到后面的节，说明用户已经完成转向，不需要播报
            if (currentSnappedIndex > 5) {
                console.log(`[段间转向] 已吸附到第${currentSnappedIndex}个点，跳过段间转向播报`);
                return;
            }

            let prevPrevPoint, prevEndPoint;

            // 【关键】检查上一段是否有重规划后的数据
            // 如果上一段（currentSegmentIndex - 1）进行过重规划，使用保存的点
            if (replanedSegmentEndPoints && replanedSegmentEndPoints.segmentIndex === currentSegmentIndex - 1) {
                prevPrevPoint = replanedSegmentEndPoints.prevPoint;
                prevEndPoint = replanedSegmentEndPoints.endPoint;
                console.log('[段间转向] 使用重规划后保存的段末点');
            } else {
                // 使用原始点集中的点
                const prevSegment = segmentRanges[currentSegmentIndex - 1];
                if (prevSegment.end < 2) return; // 上一段点不够
                prevPrevPoint = fullPointSet[prevSegment.end - 1].position;
                prevEndPoint = fullPointSet[prevSegment.end].position;
            }

            // 获取当前段的前两个点
            if (currentSegmentPointSet.length < 2) return;
            const currStartPoint = currentSegmentPointSet[0].position; // 途经点
            const currNextPoint = currentSegmentPointSet[1].position;

            // 计算段间转向角
            const bearingIn = calculateBearing(prevPrevPoint, prevEndPoint);  // 上一段进入途经点的方向
            const bearingOut = calculateBearing(currStartPoint, currNextPoint); // 当前段离开途经点的方向

            let turnAngle = bearingOut - bearingIn;
            if (turnAngle > 180) turnAngle -= 360;
            if (turnAngle < -180) turnAngle += 360;

            const absTurnAngle = Math.abs(turnAngle);
            const turnType = getTurnType(turnAngle);

            console.log(`[段间转向] 转向角: ${turnAngle.toFixed(1)}°, 类型: ${turnType}, 当前吸附索引: ${currentSnappedIndex}`);

            // 如果转向角度 >= 30度，播报转向指令
            if (absTurnAngle >= 30) {
                const action = getTurnActionText(turnType);
                console.log(`[段间转向] 播报: ${action}`);
                NavTTS.speak(`请${action}`, { force: true });
            } else {
                console.log(`[段间转向] 角度较小，继续直行`);
            }

            // 【清理】段间转向检测完成后清除保存的重规划点（已使用）
            if (replanedSegmentEndPoints && replanedSegmentEndPoints.segmentIndex === currentSegmentIndex - 1) {
                replanedSegmentEndPoints = null;
            }
        } catch (e) {
            console.error('[段间转向] 检测失败:', e);
        }
    }

    /**
     * 检查是否完成当前路段并切换到下一段
     * @param {number} currentIndex - 当前点索引（段内相对索引）
     * @param {Array} gpsPosition - GPS原始位置 [lng, lat]
     * @returns {boolean} 是否切换了路段或完成导航
     */
    function checkSegmentCompletion(currentIndex, gpsPosition) {
        const pointSet = window.currentSegmentPointSet;

        if (!pointSet || pointSet.length === 0) {
            return false;
        }

        // 获取段末点（途径点或终点）位置
        const endPoint = pointSet[pointSet.length - 1].position;
        const endLng = Array.isArray(endPoint) ? endPoint[0] : endPoint.lng;
        const endLat = Array.isArray(endPoint) ? endPoint[1] : endPoint.lat;

        // 判断到达条件：
        // 1. 点集索引到达最后1-2个点
        // 2. 或GPS实际位置距离途径点/终点 ≤ WAYPOINT_ARRIVAL_DISTANCE米
        const isNearEnd = currentIndex >= pointSet.length - 3; // 最后2个点范围

        let actualDistance = Infinity;
        if (gpsPosition) {
            actualDistance = haversineDistance(
                gpsPosition[1], gpsPosition[0],
                endLat, endLng
            );
        }

        const isWithinArrivalDistance = actualDistance <= WAYPOINT_ARRIVAL_DISTANCE;

        // 任一条件满足即判定到达
        if (isNearEnd || isWithinArrivalDistance) {
            console.log(`[分段] 完成路段${currentSegmentIndex}: ${segmentRanges[currentSegmentIndex].name} (点集索引:${currentIndex}/${pointSet.length-1}, 实际距离:${actualDistance.toFixed(2)}米, 到达阈值:${WAYPOINT_ARRIVAL_DISTANCE}米)`);

            // 【修复】到达途径点时，补全灰色路线到整段末尾
            // 防止因吸附跳跃导致中间路线没有变灰
            const segmentEndIndex = pointSet.length - 1;
            if (currentIndex < segmentEndIndex) {
                console.log(`[分段] 补全灰色路线: ${currentIndex} -> ${segmentEndIndex}`);
                currentSnappedIndex = segmentEndIndex;
            }
            NavRenderer.updatePassedRoute(segmentEndIndex, gpsPosition);

            // 降低已完成路段的层级
            NavRenderer.lowerCompletedSegmentZIndex();

            // 检查是否还有下一段
            if (currentSegmentIndex < segmentRanges.length - 1) {
                // 设置段间过渡标志
                isInSegmentTransition = true;

                // 播报到达途径点
                const currentSegmentName = segmentRanges[currentSegmentIndex].name;
                const waypointName = currentSegmentName.split('到')[1]; // 提取途径点名称
                NavTTS.speak(`已到达${waypointName}`, { force: true });

                // 切换到下一段
                currentSegmentIndex++;
                const nextSegment = segmentRanges[currentSegmentIndex];
                console.log(`[分段] 开始路段${currentSegmentIndex}: ${nextSegment.name}`);

                // 更新全局变量
                window.currentSegmentIndex = currentSegmentIndex;

                // 重置吸附索引和导航提示状态
                currentSnappedIndex = -1;
                lastSnappedIndex = -1;
                lastTurningPointIndex = -1;
                nextTurningPointIndex = -1;
                hasPrompted1_4 = false;
                hasPromptedBefore = false;

                // 重置偏离相关状态
                savedOriginalGreenPointSet = null;

                // 显示下一段的绿色路线（会重新计算转向点）
                showCurrentSegmentRoute();

                // 【改进】不再使用固定1.5秒延迟，而是在首次吸附后检测段间转向
                // 段间转向检测会在 onGPSUpdate 中首次吸附成功后触发
                isInSegmentTransition = true;  // 标记为段间过渡中

                return true;
            } else {
                // 所有路段已完成，导航结束
                console.log('[分段] 所有路段已完成，导航结束');
                completeNavigation();
                return true;
            }
        }

        return false;
    }

    /**
     * 计算路径总距离
     * @param {Array} path - 路径点数组 [[lng,lat], ...]
     * @returns {number} 距离（米）
     */
    function calculatePathDistance(path) {
        if (!path || path.length < 2) return 0;

        let totalDistance = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];

            const lng1 = Array.isArray(p1) ? p1[0] : p1.lng;
            const lat1 = Array.isArray(p1) ? p1[1] : p1.lat;
            const lng2 = Array.isArray(p2) ? p2[0] : p2.lng;
            const lat2 = Array.isArray(p2) ? p2[1] : p2.lat;

            totalDistance += haversineDistance(lat1, lng1, lat2, lng2);
        }

        return totalDistance;
    }

    /**
     * Haversine公式计算两点距离
     * @returns {number} 距离（米）
     */
    function haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 地球半径（米）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * 重采样路径：在原始点之间按3米间隔插点
     * @param {Array} originalPath - 原始路径 [[lng, lat], ...]
     * @param {number} interval - 插点间隔（米），默认3米
     * @returns {Array} 点集数组
     */
    function resamplePathWithOriginalPoints(originalPath, interval = 3) {
        if (!originalPath || originalPath.length < 2) return [];

        const pointSet = [];
        let totalDistance = 0;

        // 添加起点
        pointSet.push({
            position: originalPath[0],
            index: 0,
            distance: 0,
            isOriginal: true,
            originalIndex: 0
        });

        for (let i = 0; i < originalPath.length - 1; i++) {
            const start = originalPath[i];
            const end = originalPath[i + 1];

            const lng1 = Array.isArray(start) ? start[0] : start.lng;
            const lat1 = Array.isArray(start) ? start[1] : start.lat;
            const lng2 = Array.isArray(end) ? end[0] : end.lng;
            const lat2 = Array.isArray(end) ? end[1] : end.lat;

            const segmentDist = haversineDistance(lat1, lng1, lat2, lng2);

            if (segmentDist >= interval) {
                // 这段够长，插入等间距点
                const numPoints = Math.floor(segmentDist / interval);

                for (let j = 1; j <= numPoints; j++) {
                    const ratio = (j * interval) / segmentDist;
                    const interpLng = lng1 + (lng2 - lng1) * ratio;
                    const interpLat = lat1 + (lat2 - lat1) * ratio;

                    totalDistance += interval;
                    pointSet.push({
                        position: [interpLng, interpLat],
                        index: pointSet.length,
                        distance: totalDistance,
                        isOriginal: false,
                        originalIndex: null
                    });
                }

                // 更新累计距离（插值点到原始点end的剩余距离）
                const remainingDist = segmentDist - (numPoints * interval);
                totalDistance += remainingDist;
            } else {
                // 这段不足3米，直接累加距离
                totalDistance += segmentDist;
            }

            // 添加原始路径点（除了最后一个点，后面单独加）
            // 【修复】如果与前一个点距离小于1米，跳过以避免微小折点导致的假转向
            if (i < originalPath.length - 2) {
                const lastPoint = pointSet[pointSet.length - 1];
                const lastPos = lastPoint.position;
                const distToLast = haversineDistance(
                    lastPos[1], lastPos[0],
                    lat2, lng2
                );

                if (distToLast >= 1) {  // 距离 >= 1米才添加
                    pointSet.push({
                        position: [lng2, lat2],
                        index: pointSet.length,
                        distance: totalDistance,
                        isOriginal: true,
                        originalIndex: i + 1
                    });
                }
            }
        }

        // 添加终点
        const lastPoint = originalPath[originalPath.length - 1];
        const lastLng = Array.isArray(lastPoint) ? lastPoint[0] : lastPoint.lng;
        const lastLat = Array.isArray(lastPoint) ? lastPoint[1] : lastPoint.lat;

        pointSet.push({
            position: [lastLng, lastLat],
            index: pointSet.length,
            distance: totalDistance,
            isOriginal: true,
            originalIndex: originalPath.length - 1
        });

        console.log(`[重采样] 原始${originalPath.length}个点 → 点集${pointSet.length}个点`);
        return pointSet;
    }

    /**
     * 检测转向点（相邻点检测法，包含段首和段末）
     * @param {Array} pointSet - 重采样后的点集
     * @param {number} angleThreshold - 角度阈值（度），默认30度
     * @returns {Array} 转向点数组
     */
    function detectTurningPoints(pointSet, angleThreshold = 30) {
        const turningPoints = [];

        if (!pointSet || pointSet.length < 2) {
            return turningPoints;
        }

        for (let i = 0; i < pointSet.length; i++) {
            let prev, curr, next;
            let bearingIn, bearingOut;
            let turnAngle;

            if (i === 0) {
                // 段首起点：检测是否需要立即转向/掉头
                // 使用：前一段的最后方向 vs 当前段的第一段方向
                // 但在当前段点集中，无法获取前一段信息，所以这里跳过
                // 段首转向检测由段切换逻辑处理（checkSegmentCompletion中）
                continue;

            } else if (i === pointSet.length - 1) {
                // 段末终点：检测从倒数第二个点到终点的转向
                if (i < 1) continue;
                prev = pointSet[i - 1].position;
                curr = pointSet[i].position;

                // 如果有下一段，需要检测终点的转向（用于段末掉头提示）
                // 但这里只能检测段内转向，段间转向由段切换逻辑处理
                // 所以这里先检测倒数第二个点到终点是否有转向
                if (i >= 2) {
                    // 有足够的点，可以计算终点转向
                    const prevPrev = pointSet[i - 2].position;
                    bearingIn = calculateBearing(prevPrev, prev);
                    bearingOut = calculateBearing(prev, curr);

                    turnAngle = bearingOut - bearingIn;
                    if (turnAngle > 180) turnAngle -= 360;
                    if (turnAngle < -180) turnAngle += 360;

                    if (Math.abs(turnAngle) >= angleThreshold) {
                        turningPoints.push({
                            pointIndex: i,
                            position: curr,
                            turnAngle: turnAngle,
                            turnType: getTurnType(turnAngle),
                            isOriginalPoint: pointSet[i].isOriginal,
                            bearingAfterTurn: bearingOut,
                            isSegmentEnd: true  // 标记为段末转向点
                        });
                    }
                }
                continue;

            } else {
                // 中间点：正常检测
                prev = pointSet[i - 1].position;
                curr = pointSet[i].position;
                next = pointSet[i + 1].position;

                bearingIn = calculateBearing(prev, curr);
                bearingOut = calculateBearing(curr, next);

                turnAngle = bearingOut - bearingIn;
                if (turnAngle > 180) turnAngle -= 360;
                if (turnAngle < -180) turnAngle += 360;

                if (Math.abs(turnAngle) >= angleThreshold) {
                    const detectedTurnType = getTurnType(turnAngle);

                    turningPoints.push({
                        pointIndex: i,
                        position: curr,
                        turnAngle: turnAngle,
                        turnType: detectedTurnType,
                        isOriginalPoint: pointSet[i].isOriginal,
                        bearingAfterTurn: bearingOut
                    });
                }
            }
        }

        // 过滤掉"抵消转向"（S型小弯）
        return filterCancelingTurns(turningPoints, pointSet);
    }

    /**
     * 过滤掉相互抵消的转向点（S型小弯）和假转向点
     * @param {Array} turningPoints - 转向点数组
     * @param {Array} pointSet - 点集
     * @returns {Array} 过滤后的转向点数组
     */
    function filterCancelingTurns(turningPoints, pointSet) {
        if (!turningPoints || turningPoints.length === 0) {
            return turningPoints;
        }

        const filtered = [];
        let i = 0;

        while (i < turningPoints.length) {
            const current = turningPoints[i];

            // 【新增】单点假转向检测：检查转向点前后更远距离的整体方向变化
            // 如果前后10个点（约30米）的整体方向变化很小，说明是假转向
            const checkRange = 10; // 前后各检查10个点
            const beforeIdx = Math.max(0, current.pointIndex - checkRange);
            const afterIdx = Math.min(pointSet.length - 1, current.pointIndex + checkRange);

            if (afterIdx - beforeIdx >= 6) { // 至少有6个点才能判断
                const beforePos = pointSet[beforeIdx].position;
                const afterPos = pointSet[afterIdx].position;
                const currentPos = pointSet[current.pointIndex].position;

                // 计算整体方向：从前面的点到后面的点
                const overallBearing = calculateBearing(beforePos, afterPos);
                
                // 计算进入转向点的方向
                const bearingIn = calculateBearing(beforePos, currentPos);
                
                // 计算离开转向点的方向
                const bearingOut = calculateBearing(currentPos, afterPos);

                // 计算整体方向变化
                let overallChange = bearingOut - bearingIn;
                if (overallChange > 180) overallChange -= 360;
                if (overallChange < -180) overallChange += 360;

                // 如果整体方向变化 ≤ 20度，认为是假转向（路线数据噪声）
                if (Math.abs(overallChange) <= 20) {
                    console.log(`[转向点过滤] 跳过假转向：点${current.pointIndex}(${current.turnAngle.toFixed(1)}°)，整体方向变化${overallChange.toFixed(1)}°`);
                    i++;
                    continue;
                }
            }

            // 检查是否有下一个转向点（S型小弯检测）
            if (i < turningPoints.length - 1) {
                const next = turningPoints[i + 1];

                // 计算两个转向点之间的路径距离（沿着点集走）
                let pathDistance = 0;
                for (let j = current.pointIndex; j < next.pointIndex && j < pointSet.length - 1; j++) {
                    const p1 = pointSet[j].position;
                    const p2 = pointSet[j + 1].position;
                    pathDistance += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
                }

                // 判断是否为抵消转向（S型小弯）- 放宽距离限制到15米
                const isCanceling =
                    pathDistance <= 15 &&  // 路径距离 ≤ 15米
                    ((current.turnAngle > 0 && next.turnAngle < 0) ||  // 转向相反（左右或右左）
                     (current.turnAngle < 0 && next.turnAngle > 0)) &&
                    Math.abs(Math.abs(current.turnAngle) - Math.abs(next.turnAngle)) <= 20;  // 角度接近抵消（误差≤20度）

                if (isCanceling) {
                    // 再次确认：检查转向前后的总体方向变化
                    const beforeIdx2 = Math.max(0, current.pointIndex - 5);
                    const afterIdx2 = Math.min(pointSet.length - 1, next.pointIndex + 5);

                    if (beforeIdx2 < current.pointIndex && afterIdx2 > next.pointIndex) {
                        const beforePos = pointSet[beforeIdx2].position;
                        const afterPos = pointSet[afterIdx2].position;

                        const bearingBefore = calculateBearing(beforePos, pointSet[current.pointIndex].position);
                        const bearingAfter = calculateBearing(pointSet[next.pointIndex].position, afterPos);

                        let directionChange = bearingAfter - bearingBefore;
                        if (directionChange > 180) directionChange -= 360;
                        if (directionChange < -180) directionChange += 360;

                        // 如果前后方向变化 ≤ 25度，确认是S弯，跳过这两个转向点
                        if (Math.abs(directionChange) <= 25) {
                            console.log(`[转向点过滤] 跳过S型小弯：点${current.pointIndex}(${current.turnAngle.toFixed(1)}°)和点${next.pointIndex}(${next.turnAngle.toFixed(1)}°)，路径距离${pathDistance.toFixed(2)}米，方向变化${directionChange.toFixed(1)}°`);
                            i += 2;  // 跳过这两个点
                            continue;
                        }
                    }
                }
            }

            // 保留当前转向点
            filtered.push(current);
            i++;
        }

        if (filtered.length < turningPoints.length) {
            console.log(`[转向点过滤] 原始${turningPoints.length}个转向点 → 过滤后${filtered.length}个转向点`);
        }

        return filtered;
    }

    /**
     * 计算方位角（0-360度，正北为0）
     */
    function calculateBearing(from, to) {
        const lng1 = Array.isArray(from) ? from[0] : from.lng;
        const lat1 = Array.isArray(from) ? from[1] : from.lat;
        const lng2 = Array.isArray(to) ? to[0] : to.lng;
        const lat2 = Array.isArray(to) ? to[1] : to.lat;

        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        bearing = (bearing + 360) % 360; // 归一化到0-360

        return bearing;
    }

    /**
     * 根据转向角度判断转向类型
     */
    function getTurnType(angle) {
        const absAngle = Math.abs(angle);
        let result;

        if (absAngle >= 150) {
            result = 'uturn';
        } else if (angle < -30) {
            result = 'left';
        } else if (angle > 30) {
            result = 'right';
        } else {
            result = 'straight';
        }

        return result;
    }

    /**
     * 显示当前路段的绿色路线
     */
    function showCurrentSegmentRoute() {
        try {
            if (segmentRanges.length === 0 || currentSegmentIndex >= segmentRanges.length) {
                console.error('[分段显示] 无有效路段');
                return;
            }

            const segment = segmentRanges[currentSegmentIndex];
            const pointSet = window.navigationPointSet;

            if (!pointSet || pointSet.length === 0) {
                console.error('[分段显示] 点集未生成');
                return;
            }

            const segmentPath = [];
            for (let i = segment.start; i <= segment.end; i++) {
                if (i < pointSet.length) {
                    segmentPath.push(pointSet[i].position);
                }
            }

            if (segmentPath.length < 2) {
                console.error('[分段显示] 当前段路径点不足');
                return;
            }

            NavRenderer.drawRoute(segmentPath);
            generateSegmentPointSet(segment);
        } catch (e) {
            console.error('[分段显示] 显示当前路段失败:', e);
        }
    }

    /**
     * 为当前路段生成独立的点集和重新计算转向点
     * @param {Object} segment - 路段信息 {start, end, name}
     */
    function generateSegmentPointSet(segment) {
        try {
            const fullPointSet = window.navigationPointSet;

            if (!fullPointSet) return;

            // 提取当前段的点集
            const segmentPointSet = [];
            for (let i = segment.start; i <= segment.end; i++) {
                if (i < fullPointSet.length) {
                    const point = fullPointSet[i];
                    segmentPointSet.push({
                        position: point.position,
                        index: segmentPointSet.length, // 重新索引（从0开始）
                        globalIndex: i, // 保存全局索引
                        distance: point.distance,
                        isOriginal: point.isOriginal,
                        originalIndex: point.originalIndex
                    });
                }
            }

            // 保存当前段的点集（用于吸附）
            window.currentSegmentPointSet = segmentPointSet;

            // 重新计算当前段的转向点（避免筛选漏点）
            const segmentTurningPoints = detectTurningPoints(segmentPointSet, 30);
            window.currentSegmentTurningPoints = segmentTurningPoints;

            console.log(`[分段点集] 当前段点集: ${segmentPointSet.length}个点, 转向点: ${segmentTurningPoints.length}个`);
        } catch (e) {
            console.error('[分段点集] 生成失败:', e);
        }
    }

    /**
     * 开始导航
     */
    async function startNavigation() {
        try {
            if (isNavigating) {
                console.warn('[NavCore] 导航已在进行中');
                return false;
            }

            if (!routeData || navigationPath.length < 2) {
                alert('请先规划路线');
                return false;
            }

            // 【提前启动心跳检测】在任何可能卡死的操作之前启动，确保能检测到启动过程中的卡死
            isStartingNavigation = true;
            navigationStartingTime = Date.now();
            startHeartbeatChecker();
            console.log('[NavCore] 心跳检测已提前启动（启动保护模式）');

            console.log('[NavCore] 正在获取当前位置...');

            // 直接获取当前GPS位置（会自动触发权限请求）
            const currentPosition = await getCurrentGPSPosition();
            if (!currentPosition) {
                console.error('[NavCore] 无法获取当前位置，导航启动失败');
                return false;
            }

            console.log('[NavCore] 当前位置已获取:', currentPosition);

            // 【新增】移动地图视野到用户当前位置
            const mapInstance = NavRenderer.getMap();
            if (mapInstance) {
                mapInstance.setZoomAndCenter(17, currentPosition, false, 500);
                console.log('[NavCore] 地图已移动到用户位置');
            }

            // 绘制从当前位置到起点的蓝色指引线
            drawGuidanceToStart(currentPosition);

            console.log('[NavCore] 开始导航...');

            isNavigating = true;
            isStartingNavigation = false;  // 启动完成，退出启动保护模式
            hasReachedStart = false;  // 重置到达起点状态
            window.hasReachedStart = false;  // 同步到全局
            window.hasAnnouncedNavigationStart = false;  // 重置播报标志

            // 隐藏主地图的selfMarker（避免与导航系统的userMarker冲突）
            if (typeof window.selfMarker !== 'undefined' && window.selfMarker) {
                window.selfMarker.hide();
                console.log('[NavCore] 已隐藏主地图的selfMarker');
            }

            // 清除转向标签（导航开始后不再显示）
            NavRenderer.clearTurnLabels();

            // 隐藏完整路线，只显示第一段
            showCurrentSegmentRoute();

            // 更新底部目的地信息
            updateDestinationInfo();

            // 启动GPS监听
            NavGPS.startWatch(onGPSUpdate, onGPSError);

            // 启动定时更新
            startUpdateTimer();

            // 心跳检测已在函数开头提前启动，这里不再重复启动

            // 注意：语音提示已在 drawGuidanceToStart() 中根据距离判断播报
            // 不在这里重复播报

            console.log('[NavCore] ✓ 导航已启动');
            return true;
        } catch (e) {
            console.error('[NavCore] 启动导航失败:', e);
            isNavigating = false;
            isStartingNavigation = false;
            stopHeartbeatChecker();
            return false;
        }
    }

    /**
     * 获取当前GPS位置（Promise方式，快速获取）
     * @returns {Promise<Array|null>} [lng, lat] 或 null
     */
    /**
     * 获取当前GPS位置（Promise方式，快速获取）
     * @returns {Promise<Array|null>} [lng, lat] 或 null
     */
    function getCurrentGPSPosition() {
        return new Promise((resolve) => {
            if (!('geolocation' in navigator)) {
                console.error('[NavCore] 浏览器不支持定位');
                resolve(null);
                return;
            }

            // 先尝试快速获取（使用缓存位置，5秒超时）
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    let lng = position.coords.longitude;
                    let lat = position.coords.latitude;

                    // 坐标转换
                    const converted = NavGPS.convertCoordinates(lng, lat);
                    console.log('[NavCore] GPS位置获取成功:', converted);
                    resolve(converted);
                },
                (error) => {
                    console.error('[NavCore] 快速获取GPS位置失败:', error);

                    // 如果快速获取失败，尝试高精度获取（10秒超时）
                    if (error.code === error.TIMEOUT) {
                        console.log('[NavCore] 尝试高精度定位...');
                        navigator.geolocation.getCurrentPosition(
                            (position) => {
                                let lng = position.coords.longitude;
                                let lat = position.coords.latitude;
                                const converted = NavGPS.convertCoordinates(lng, lat);
                                console.log('[NavCore] 高精度GPS位置获取成功:', converted);
                                resolve(converted);
                            },
                            (error2) => {
                                console.error('[NavCore] 高精度获取GPS位置失败:', error2);
                                handleGPSError(error2);
                                resolve(null);
                            },
                            {
                                enableHighAccuracy: true,
                                timeout: 10000,  // 10秒超时
                                maximumAge: 0
                            }
                        );
                    } else {
                        handleGPSError(error);
                        resolve(null);
                    }
                },
                {
                    enableHighAccuracy: false,  // 先不用高精度，快速获取
                    timeout: 5000,  // 5秒超时
                    maximumAge: 10000  // 允许使用10秒内的缓存位置
                }
            );
        });
    }

    /**
     * 处理GPS错误
     * @param {GeolocationPositionError} error
     */
    function handleGPSError(error) {
        if (error.code === error.PERMISSION_DENIED) {
            alert('定位权限被拒绝');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
            alert('位置信息不可用，请检查GPS是否开启');
        } else if (error.code === error.TIMEOUT) {
            alert('获取位置超时，请移动到空旷位置或稍后重试');
        }
    }

    /**
     * 绘制从当前位置到起点的蓝色指引线
     * 【问题7优化】如果有实际起点（最近道路点），引导到实际起点
     * @param {Array} currentPos - [lng, lat]
     */
    function drawGuidanceToStart(currentPos) {
        try {
            if (!routeData || !routeData.start) return;

            // 优先使用实际起点（最近道路点），否则使用原始起点
            const startPos = routeData.start.actualStartPosition || routeData.start.position;

            // 计算距离
            const distance = NavGPS.calculateDistance(currentPos, startPos);

            console.log(`[NavCore] 当前位置距起点: ${distance.toFixed(1)}米`);

            // 创建用户位置标记（到达起点前显示"我的位置"图标）
            NavRenderer.updateUserMarker(currentPos, 0, false, false);

            // 如果距离超过20米，绘制蓝色引导线并提示
            if (distance > 20) {
                NavRenderer.drawGuidanceLine(currentPos, startPos);
                console.log('[NavCore] 已绘制蓝色指引线');

                // 更新上方提示栏：显示"请前往起点"
                if (typeof NavUI !== 'undefined' && NavUI.updateNavigationTip) {
                    const distanceText = distance < 1000
                        ? `${Math.round(distance)}米`
                        : `${(distance / 1000).toFixed(1)}公里`;

                    NavUI.updateNavigationTip({
                        type: 'straight',
                        action: '前往起点',
                        distance: Math.round(distance),
                        message: `前往起点 ${distanceText}`
                    });
                }

                // 语音播报：请前往起点
                const distanceText = distance < 1000
                    ? `${Math.round(distance)}米`
                    : `${(distance / 1000).toFixed(1)}公里`;
                NavTTS.speak(`距离起点${distanceText}，请先前往起点`, { force: true });
            } else {
                console.log('[NavCore] 已在起点附近，无需绘制指引线');

                // 在起点附近，播报正常的导航开始提示
                const firstSegment = segmentRanges[0];
                const targetName = firstSegment.name.split('到')[1];
                NavTTS.speak(`导航已开始，前往${targetName}`, { force: true });
            }
        } catch (e) {
            console.error('[NavCore] 绘制指引线失败:', e);
        }
    }

    /**
     * 更新底部目的地信息（始终显示最终目的地）
     */
    function updateDestinationInfo() {
        try {
            if (!routeData) return;

            // 底部卡片始终显示最终目的地（终点）
            const targetInfo = {
                name: routeData.end.name || '终点',
                type: 'end',
                distance: 0,
                time: 0
            };

            // 计算到终点的剩余距离和时间（从当前位置到终点的所有剩余路段）
            const pointSet = window.navigationPointSet;
            if (pointSet && segmentRanges.length > 0) {
                let totalDistance = 0;
                
                // 累加当前段及后续所有段的距离
                for (let segIdx = currentSegmentIndex; segIdx < segmentRanges.length; segIdx++) {
                    const segment = segmentRanges[segIdx];
                    for (let i = segment.start; i < segment.end; i++) {
                        if (i < pointSet.length - 1) {
                            const p1 = pointSet[i].position;
                            const p2 = pointSet[i + 1].position;
                            totalDistance += NavGPS.calculateDistance(p1, p2);
                        }
                    }
                }

                targetInfo.distance = totalDistance;
                targetInfo.time = Math.ceil(totalDistance / 8.33); // 使用8.33m/s（30km/h）计算时间
            }

            // 更新UI
            NavUI.updateDestinationInfo(targetInfo);

            console.log('[NavCore] 目的地信息已更新:', targetInfo);
        } catch (e) {
            console.error('[NavCore] 更新目的地信息失败:', e);
        }
    }

    /**
     * 停止导航
     */
    function stopNavigation() {
        try {
            if (!isNavigating) {
                return;
            }

            console.log('[NavCore] 停止导航...');

            isNavigating = false;
            hasReachedStart = false;  // 重置到达起点状态
            window.hasReachedStart = false;  // 【修复】同步到全局
            window.hasAnnouncedNavigationStart = false;  // 重置播报标志

            // 停止GPS监听
            NavGPS.stopWatch();

            // 停止定时器
            stopUpdateTimer();

            // 停止心跳检测
            stopHeartbeatChecker();

            // 重置偏离检测状态
            deviationConfirmCount = 0;
            isDeviationConfirmed = false;
            hasAnnouncedDeviation = false;
            savedOriginalGreenPointSet = null; // 清除保存的原始绿色点集
            replanedSegmentEndPoints = null;   // 清除重规划段末点

            // 重置GPS处理状态
            isProcessingGPS = false;
            lastGPSProcessTime = 0;
            lastDisplayPosition = null;
            lastPositionChangeTime = 0;

            // 停止语音
            NavTTS.stop();

            // 关闭路线箭头
            NavRenderer.toggleRouteArrows(false);

            // 显示KML线
            // NavRenderer.showKMLLines(); // 可选

            // 清除用户标记
            // NavRenderer.clearAll(); // 可选，根据需求
            
            // 恢复显示主地图的selfMarker
            if (typeof window.selfMarker !== 'undefined' && window.selfMarker) {
                window.selfMarker.show();
                console.log('[NavCore] 已恢复显示主地图的selfMarker');
            }

            console.log('[NavCore] ✓ 导航已停止');
        } catch (e) {
            console.error('[NavCore] 停止导航失败:', e);
        }
    }

    /**
     * 在当前段点集中查找8米范围内最近的点（只在当前节内吸附）
     * @param {Array} gpsPosition - GPS位置 [lng, lat]
     * @returns {Object|null} { index, position, distance, globalIndex }
     */
    function findNearestPointInSet(gpsPosition) {
        // 使用当前段的点集
        const pointSet = window.currentSegmentPointSet;
        const turningPoints = window.currentSegmentTurningPoints;

        if (!pointSet || pointSet.length === 0) {
            return null;
        }

        // 如果当前处于偏离状态，扩大搜索范围到整个当前段
        const isDeviated = NavRenderer.isDeviated();

        // 确定当前节的范围（两个转向点之间为一节）
        let sectionStart = 0;  // 当前节起始点索引
        let sectionEnd = pointSet.length - 1;  // 当前节结束点索引

        if (!isDeviated && turningPoints && turningPoints.length > 0) {
            // 非偏离状态：只在当前节内查找
            if (currentSnappedIndex >= 0) {
                // 找到当前吸附点所在节的范围
                let prevTurnIndex = -1;
                let nextTurnIndex = pointSet.length - 1;

                for (let i = 0; i < turningPoints.length; i++) {
                    if (turningPoints[i].pointIndex <= currentSnappedIndex) {
                        prevTurnIndex = turningPoints[i].pointIndex;
                    }
                    if (turningPoints[i].pointIndex > currentSnappedIndex && nextTurnIndex === pointSet.length - 1) {
                        nextTurnIndex = turningPoints[i].pointIndex;
                        break;
                    }
                }

                sectionStart = prevTurnIndex >= 0 ? prevTurnIndex : 0;
                sectionEnd = nextTurnIndex;

                // 【修复】始终允许向前搜索一定范围，避免吸附索引卡住
                // 即使不在转向点附近，也允许向前搜索15个点（约45米）
                const forwardSearchRange = Math.min(currentSnappedIndex + 15, pointSet.length - 1);
                if (forwardSearchRange > sectionEnd) {
                    // 扩大搜索范围到下一节或更远
                    let extendedEnd = forwardSearchRange;
                    // 找到覆盖forwardSearchRange的转向点
                    for (let i = 0; i < turningPoints.length; i++) {
                        if (turningPoints[i].pointIndex > forwardSearchRange) {
                            extendedEnd = turningPoints[i].pointIndex;
                            break;
                        }
                    }
                    sectionEnd = Math.max(sectionEnd, extendedEnd);
                    console.log(`[点集吸附] 扩大向前搜索范围: ${sectionStart} - ${sectionEnd}`);
                }

                // 【关键优化】如果接近转向点（距离转向点<8个点），扩大搜索范围到下一节
                // 这样可以避免V字急转弯和直角转弯时误判为偏离
                // 8个点 × 3米/点 = 24米的提前搜索距离
                if (nextTurnIndex < pointSet.length - 1) {
                    const distanceToTurn = nextTurnIndex - currentSnappedIndex;
                    if (distanceToTurn < 8) {
                        // 找到下下个转向点
                        for (let i = 0; i < turningPoints.length; i++) {
                            if (turningPoints[i].pointIndex > nextTurnIndex) {
                                sectionEnd = Math.max(sectionEnd, turningPoints[i].pointIndex);
                                console.log(`[点集吸附] 接近转向点(${distanceToTurn}个点)，扩大搜索到下一节: ${sectionStart} - ${sectionEnd}`);
                                break;
                            }
                        }
                    }
                }
            } else {
                // 首次吸附或段切换后：搜索整个当前段（避免段切换时定位不准）
                sectionStart = 0;
                sectionEnd = pointSet.length - 1;
            }
        } else if (isDeviated) {
            // 偏离状态：搜索整个当前段，允许往回吸附（但会在调用处判断）
            sectionStart = 0;
            sectionEnd = pointSet.length - 1;
            console.log(`[点集吸附] 偏离状态，搜索整个段: 0 - ${sectionEnd}`);
        }

        // 在指定范围内查找最近点
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        let nearestPosition = null;
        let nearestGlobalIndex = -1;

        for (let i = sectionStart; i <= sectionEnd && i < pointSet.length; i++) {
            const point = pointSet[i];
            const pos = point.position;
            const lng = Array.isArray(pos) ? pos[0] : pos.lng;
            const lat = Array.isArray(pos) ? pos[1] : pos.lat;

            const distance = haversineDistance(
                gpsPosition[1], gpsPosition[0],
                lat, lng
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
                nearestPosition = [lng, lat];
                nearestGlobalIndex = point.globalIndex;
            }
        }

        // 【优化】动态吸附阈值：根据场景调整（使用全局配置）
        let snapThreshold = SNAP_THRESHOLD_NORMAL; // 基础阈值（直线路段）

        // 1. 转弯处放宽阈值（GPS在转弯时误差更大）
        if (turningPoints && turningPoints.length > 0 && nearestIndex >= 0) {
            for (let i = 0; i < turningPoints.length; i++) {
                const turnPointIndex = turningPoints[i].pointIndex;
                const distanceToTurnPoint = Math.abs(nearestIndex - turnPointIndex);

                // 距离转向点±10个点（约30米）范围内，使用转弯阈值
                if (distanceToTurnPoint <= 10) {
                    snapThreshold = SNAP_THRESHOLD_TURNING;
                    console.log(`[点集吸附] 接近转向点，放宽吸附阈值到${snapThreshold}米`);
                    break;
                }
            }
        }

        // 2. 偏离状态下使用转弯阈值（帮助用户更容易回归路线）
        if (isDeviated) {
            snapThreshold = SNAP_THRESHOLD_TURNING;
            console.log(`[点集吸附] 偏离状态，放宽吸附阈值到${snapThreshold}米`);
        }

        if (nearestDistance <= snapThreshold) {
            return {
                index: nearestIndex, // 当前段内的相对索引
                globalIndex: nearestGlobalIndex, // 全局索引
                position: nearestPosition,
                distance: nearestDistance,
                crossedSection: isDeviated // 标记是否跨节接入
            };
        }

        return null;
    }

    /**
     * 查找GPS位置到当前段点集的最近距离（不判断阈值，仅返回距离）
     * 用于偏离确认时判断是否在缓冲区内
     * @param {Array} gpsPosition - GPS位置 [lng, lat]
     * @returns {number} 最近距离（米），如果无法计算返回Infinity
     */
    function findNearestDistanceInSet(gpsPosition) {
        const pointSet = window.currentSegmentPointSet;

        if (!pointSet || pointSet.length === 0) {
            return Infinity;
        }

        let nearestDistance = Infinity;

        // 搜索整个当前段
        for (let i = 0; i < pointSet.length; i++) {
            const point = pointSet[i];
            const pos = point.position;
            const lng = Array.isArray(pos) ? pos[0] : pos.lng;
            const lat = Array.isArray(pos) ? pos[1] : pos.lat;

            const distance = haversineDistance(
                gpsPosition[1], gpsPosition[0],
                lat, lng
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
            }
        }

        return nearestDistance;
    }

    /**
     * 计算当前的行进方向（基于当前段点集）
     * @param {number} currentIndex - 当前点索引（段内相对索引）
     * @returns {number} 方向角（0-360度，正北为0）
     */
    function calculateCurrentBearing(currentIndex) {
        const pointSet = window.currentSegmentPointSet;

        if (!pointSet || currentIndex < 0) {
            return 0;
        }

        // 如果已经到达终点，返回上一段的方向
        if (currentIndex >= pointSet.length - 1) {
            if (currentIndex >= 1) {
                const prev = pointSet[currentIndex - 1].position;
                const curr = pointSet[currentIndex].position;
                return calculateBearing(prev, curr);
            }
            return 0;
        }

        // 使用当前点到下一个点的方向
        const curr = pointSet[currentIndex].position;
        const next = pointSet[currentIndex + 1].position;
        return calculateBearing(curr, next);
    }

    /**
     * 更新导航提示（核心逻辑 - 简化版）
     * @param {number} currentIndex - 当前点索引（段内相对索引）
     * @param {Array} currentPosition - 当前GPS位置 [lng, lat]（可选，用于更准确的距离计算）
     */
    function updateNavigationGuidance(currentIndex, currentPosition) {
        try {
            const pointSet = window.currentSegmentPointSet;
            const turningPoints = window.currentSegmentTurningPoints;

            if (!pointSet || pointSet.length === 0) return;

            const now = Date.now();

            // 查找下一个转向点
            let nextTurnPoint = null;
            let nextTurnIndex = -1;

            if (turningPoints && turningPoints.length > 0) {
                for (let i = 0; i < turningPoints.length; i++) {
                    const tp = turningPoints[i];
                    if (tp.pointIndex > currentIndex) {
                        nextTurnPoint = tp;
                        nextTurnIndex = i;
                        break;
                    }
                }
            }

            if (!nextTurnPoint) {
                // 没有下一个转向点，显示直行
                // 【修复】无论剩余多少距离，都要更新UI显示"直行"
                const remainingPoints = pointSet.length - currentIndex - 1;
                
                // 计算剩余距离（更准确的方式）
                let remainingDistance = 0;
                if (currentPosition && currentIndex < pointSet.length - 1) {
                    // 从GPS位置到终点的距离
                    const endPoint = pointSet[pointSet.length - 1].position;
                    const endLng = Array.isArray(endPoint) ? endPoint[0] : endPoint.lng;
                    const endLat = Array.isArray(endPoint) ? endPoint[1] : endPoint.lat;
                    remainingDistance = haversineDistance(
                        currentPosition[1], currentPosition[0],
                        endLat, endLng
                    );
                } else {
                    // 沿路线累加距离
                    for (let i = currentIndex; i < pointSet.length - 1; i++) {
                        const p1 = pointSet[i].position;
                        const p2 = pointSet[i + 1].position;
                        remainingDistance += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
                    }
                }
                
                // 更新UI显示直行
                if (remainingPoints < 10) {
                    // 接近段末，显示即将到达
                    updateGuidanceUI({
                        type: 'straight',
                        action: '直行',
                        distance: Math.round(remainingDistance),
                        message: '即将到达'
                    });
                } else {
                    // 还有较长距离，显示继续直行
                    updateGuidanceUI({
                        type: 'straight',
                        action: '直行',
                        distance: Math.round(remainingDistance),
                        message: '继续直行'
                    });
                }
                return;
            }

            // 计算到下一个转向点的距离
            // 【修复】优先使用GPS位置直接计算到转向点的距离，更准确
            let distanceToTurn = 0;
            const turnPointPos = pointSet[nextTurnPoint.pointIndex].position;
            const turnLng = Array.isArray(turnPointPos) ? turnPointPos[0] : turnPointPos.lng;
            const turnLat = Array.isArray(turnPointPos) ? turnPointPos[1] : turnPointPos.lat;

            if (currentPosition) {
                // 方案1：直接计算GPS位置到转向点的直线距离（最准确）
                const directDistance = haversineDistance(
                    currentPosition[1], currentPosition[0],
                    turnLat, turnLng
                );
                
                // 方案2：沿路线计算距离（用于对比）
                let routeDistance = 0;
                if (currentIndex >= 0 && currentIndex < pointSet.length - 1) {
                    // GPS位置到下一个吸附点
                    const nextPoint = pointSet[currentIndex + 1].position;
                    routeDistance += haversineDistance(
                        currentPosition[1], currentPosition[0],
                        nextPoint[1], nextPoint[0]
                    );
                    // 累加剩余路段
                    for (let i = currentIndex + 1; i < nextTurnPoint.pointIndex && i < pointSet.length - 1; i++) {
                        const p1 = pointSet[i].position;
                        const p2 = pointSet[i + 1].position;
                        routeDistance += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
                    }
                }
                
                // 使用两者中较小的值（避免吸附索引落后导致距离偏大）
                distanceToTurn = Math.min(directDistance, routeDistance > 0 ? routeDistance : directDistance);
            } else {
                // 从吸附点开始累加
                for (let i = currentIndex; i < nextTurnPoint.pointIndex && i < pointSet.length - 1; i++) {
                    const p1 = pointSet[i].position;
                    const p2 = pointSet[i + 1].position;
                    distanceToTurn += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
                }
            }

            // 确保距离不为负
            distanceToTurn = Math.max(0, distanceToTurn);

            // 计算两个转向点之间的总距离
            let totalDistanceBetweenTurns = distanceToTurn;
            if (currentIndex > 0) {
                // 查找上一个转向点
                let prevTurnPointIndex = -1;
                for (let i = turningPoints.length - 1; i >= 0; i--) {
                    if (turningPoints[i].pointIndex < currentIndex) {
                        prevTurnPointIndex = turningPoints[i].pointIndex;
                        break;
                    }
                }

                if (prevTurnPointIndex >= 0) {
                    // 计算从上一个转向点到当前转向点的总距离
                    totalDistanceBetweenTurns = 0;
                    for (let i = prevTurnPointIndex; i < nextTurnPoint.pointIndex && i < pointSet.length - 1; i++) {
                        const p1 = pointSet[i].position;
                        const p2 = pointSet[i + 1].position;
                        totalDistanceBetweenTurns += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
                    }
                }
            }

            // 判断两个转向点是否太近（<5米不提前播报）
            const isTooClose = totalDistanceBetweenTurns < 5;

            // 计算1/4距离
            const quarterDistance = totalDistanceBetweenTurns / 4;

            // 获取转向动作文本
            const turnAction = getTurnActionText(nextTurnPoint.turnType);

            // 提示逻辑
            if (nextTurnPoint.pointIndex !== nextTurningPointIndex) {
                // 新的转向点，重置提示状态
                nextTurningPointIndex = nextTurnPoint.pointIndex;
                hasPrompted1_4 = false;
                hasPromptedBefore = false;

                // 转弯阶段重置
                if (isTurningPhase) {
                    isTurningPhase = false;
                    turningPhaseEndTime = 0;
                }
            }

            // 【优化】基于当前速度的两阶段播报逻辑（避免高速时来不及播报）
            // 计算预警与执行距离（单位：米），根据速度动态调整，带上下限保护
            const prepWarnDistance = Math.max(15, Math.min(120, currentSpeed * 6)); // 预警：约提前6秒，范围[15,120]
            const execDistance = Math.max(5, Math.min(30, currentSpeed * 1.5));     // 执行：约1.5秒内到达，范围[5,30]

            // 阶段2：非常接近时播报执行指令（距离<=execDistance 或 前若干点）
            const isVeryNear = (distanceToTurn <= execDistance) || 
                              (currentIndex >= nextTurnPoint.pointIndex - Math.ceil(execDistance / 3) && currentIndex < nextTurnPoint.pointIndex);

            if (isVeryNear) {
                if (!hasPromptedBefore) {
                    const guidance = {
                        type: nextTurnPoint.turnType,
                        action: turnAction,
                        distance: Math.round(distanceToTurn),
                        message: turnAction
                    };
                    updateGuidanceUI(guidance);
                    NavTTS.speak(turnAction, { force: true });
                    hasPromptedBefore = true;
                    lastGuidanceTime = now;

                    // 进入转弯阶段
                    isTurningPhase = true;
                    turningPhaseEndTime = now + 5000;
                    
                    console.log(`[转向播报] ${turnAction}, 索引=${currentIndex}/${nextTurnPoint.pointIndex}, 距离=${distanceToTurn.toFixed(1)}米, 执行阈值=${execDistance}米`);
                }
                return;
            }
            
            // 阶段1：距离≤prepWarnDistance且>execDistance时，播报"前方准备xx"
            if (distanceToTurn <= prepWarnDistance && distanceToTurn > execDistance) {
                if (!hasPrompted1_4) {
                    const guidance = {
                        type: nextTurnPoint.turnType,
                        action: turnAction,
                        distance: Math.round(distanceToTurn),
                        message: `前方准备${turnAction}`
                    };
                    updateGuidanceUI(guidance);
                    NavTTS.speak(`前方准备${turnAction}`, { force: true });
                    hasPrompted1_4 = true;
                    lastGuidanceTime = now;

                    // 进入转弯准备阶段
                    isTurningPhase = true;
                    
                    console.log(`[转向预警] 前方准备${turnAction}, 索引=${currentIndex}/${nextTurnPoint.pointIndex}, 距离=${distanceToTurn.toFixed(1)}米, 预警阈值=${prepWarnDistance}米`);
                }
                return;
            }

            // 3. 默认：显示距离和方向（只更新UI，不播报）
            if (distanceToTurn > 0) {
                updateGuidanceUI({
                    type: nextTurnPoint.turnType,
                    action: turnAction,
                    distance: Math.round(distanceToTurn),
                    message: `前方准备${turnAction}`
                }, false); // 不播报

                // 尝试智能直行提示（在转向点之间的长距离路段）
                if (distanceToTurn > 50) {
                    handleStraightPrompt(currentIndex, distanceToTurn);
                }
            }

        } catch (e) {
            console.error('[导航提示] 更新失败:', e);
        }
    }

    /**
     * 更新速度计算（只计算当前段内的移动）
     * @param {Array} position - [lng, lat]
     */
    function updateSpeed(position) {
        try {
            const now = Date.now();

            // 添加到历史记录（包含当前段索引）
            gpsHistory.push({
                position: position,
                time: now,
                segmentIndex: currentSegmentIndex
            });

            // 只保留最近8个点（约8秒内），增加平滑度
            if (gpsHistory.length > 8) {
                gpsHistory.shift();
            }

            // 过滤掉不在当前段的历史点（段切换后清理）
            gpsHistory = gpsHistory.filter(h => h.segmentIndex === currentSegmentIndex);

            // 至少需要2个点才能计算速度
            if (gpsHistory.length >= 2) {
                const oldest = gpsHistory[0];
                const newest = gpsHistory[gpsHistory.length - 1];

                // 计算总距离（只计算当前段内的点）
                let totalDistance = 0;
                for (let i = 0; i < gpsHistory.length - 1; i++) {
                    const p1 = gpsHistory[i].position;
                    const p2 = gpsHistory[i + 1].position;
                    totalDistance += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
                }

                // 计算时间差（秒）
                const timeDiff = (newest.time - oldest.time) / 1000;

                if (timeDiff > 0.5 && totalDistance > 0.3) { // 至少0.5秒，移动0.3米
                    const newSpeed = totalDistance / timeDiff;

                    // 平滑处理（移动平均，更平滑）
                    currentSpeed = currentSpeed * 0.8 + newSpeed * 0.2;

                    // 限制速度范围：1-20 m/s（3.6-72 km/h）
                    currentSpeed = Math.max(1, Math.min(20, currentSpeed));

                    console.log(`[速度计算] 当前速度: ${currentSpeed.toFixed(2)} m/s (${(currentSpeed * 3.6).toFixed(1)} km/h), 采样点:${gpsHistory.length}`);
                }
            }
        } catch (e) {
            console.error('[速度计算] 失败:', e);
        }
    }

    /**
     * 判断直线类型（规范直线 vs 不规范直线）
     * @param {number} currentIndex - 当前点索引
     * @param {number} lookAheadPoints - 向前检查的点数
     * @returns {string} 'regular' | 'irregular'
     */
    function checkStraightType(currentIndex, lookAheadPoints = 10) {
        try {
            const pointSet = window.currentSegmentPointSet;
            if (!pointSet || currentIndex < 0) return 'irregular';

            const endIndex = Math.min(currentIndex + lookAheadPoints, pointSet.length - 1);
            if (endIndex - currentIndex < 3) return 'irregular'; // 点太少

            // 计算连续点之间的方向角变化
            let maxAngleChange = 0;
            let totalAngleChange = 0;
            let angleCount = 0;

            for (let i = currentIndex; i < endIndex - 1; i++) {
                const p1 = pointSet[i].position;
                const p2 = pointSet[i + 1].position;
                const p3 = pointSet[i + 2].position;

                const bearing1 = calculateBearing(p1, p2);
                const bearing2 = calculateBearing(p2, p3);

                // 归一化角度差到 -180~180
                let angleDiff = bearing2 - bearing1;
                if (angleDiff > 180) angleDiff -= 360;
                if (angleDiff < -180) angleDiff += 360;

                const absAngleDiff = Math.abs(angleDiff);
                maxAngleChange = Math.max(maxAngleChange, absAngleDiff);
                totalAngleChange += absAngleDiff;
                angleCount++;
            }

            const avgAngleChange = angleCount > 0 ? totalAngleChange / angleCount : 0;

            // 判断标准：
            // 规范直线：最大角度变化<5度，平均角度变化<2度
            // 不规范直线：有明显弯曲
            if (maxAngleChange < 5 && avgAngleChange < 2) {
                return 'regular'; // 很规范的直线
            } else {
                return 'irregular'; // 不规范的直线（有弯曲）
            }
        } catch (e) {
            console.error('[直线类型判断] 失败:', e);
            return 'irregular';
        }
    }

    /**
     * 计算自指定时间点以来的实际移动距离（基于 gpsHistory）
     * @param {number} sinceTimeMs
     * @returns {number} 米
     */
    function getMovedDistanceSince(sinceTimeMs) {
        try {
            if (!sinceTimeMs || gpsHistory.length < 2) return 0;
            // 找到第一个时间 >= sinceTimeMs 的索引
            let idx = -1;
            for (let i = gpsHistory.length - 1; i >= 0; i--) {
                if (gpsHistory[i].time >= sinceTimeMs) {
                    idx = i;
                }
            }
            if (idx <= 0) return 0;
            let moved = 0;
            for (let i = idx; i < gpsHistory.length - 1; i++) {
                const p1 = gpsHistory[i].position;
                const p2 = gpsHistory[i + 1].position;
                moved += haversineDistance(p1[1], p1[0], p2[1], p2[0]);
            }
            return moved;
        } catch (e) {
            console.error('[移动距离计算] 失败:', e);
            return 0;
        }
    }

    /**
     * 智能直行提示（确保5-6秒稳定播报）
     * @param {number} currentIndex - 当前点索引
     * @param {number} distanceToNextTurn - 到下一个转向点的距离（如果有）
     */
    function handleStraightPrompt(currentIndex, distanceToNextTurn = Infinity) {
        try {
            const now = Date.now();

            // 计算10秒后的预计位移
            const predictedDistance = currentSpeed * 10; // 10秒后移动的距离

            // 判断10秒内是否会有转向提示
            const willHaveTurnPrompt = distanceToNextTurn < predictedDistance + 15; // 提前15米缓冲

            // 如果10秒内会有转向提示，不播报直行（避免抑制转向）
            if (willHaveTurnPrompt) {
                console.log(`[直行提示] 跳过：10秒内将有转向 (距离:${distanceToNextTurn.toFixed(0)}米, 预测移动:${predictedDistance.toFixed(0)}米)`);
                return;
            }

            // 检查距离上次直行提示的时间
            const timeSinceLastPrompt = (now - lastStraightPromptTime) / 1000; // 秒

            // 计算自上次提示后实际移动的距离（使用gpsHistory以避免速度下限导致误判）
            let movedDistance = 0;
            if (lastStraightPromptTime && gpsHistory && gpsHistory.length > 1) {
                movedDistance = getMovedDistanceSince(lastStraightPromptTime);
            } else {
                movedDistance = currentSpeed * timeSinceLastPrompt; // 兜底
            }

            // 8秒播报频率：必须 ≥8秒 且 移动 ≥（currentSpeed * 8s）
            const minInterval = 8.0; // 最小8秒，减少频率
            const minDistance = currentSpeed * minInterval; // 动态计算最小距离

            if (timeSinceLastPrompt < minInterval) {
                return; // 还不到阈值
            }

            if (movedDistance < minDistance * 0.9) { // 允许10%误差
                return; // 实际移动距离不够
            }

            // 判断直线类型
            const straightType = checkStraightType(currentIndex);

            // 计算前方直行距离（到下一个转向点或段末）
            const pointSet = window.currentSegmentPointSet;
            let straightDistance = 0;
            const maxCheckPoints = Math.min(20, pointSet.length - currentIndex - 1); // 最多检查20个点

            for (let i = currentIndex; i < currentIndex + maxCheckPoints && i < pointSet.length - 1; i++) {
                const p1 = pointSet[i].position;
                const p2 = pointSet[i + 1].position;
                straightDistance += haversineDistance(p1[1], p1[0], p2[1], p2[0]);

                // 限制最大播报距离
                if (straightDistance >= Math.min(distanceToNextTurn, 100)) {
                    straightDistance = Math.min(distanceToNextTurn, 100);
                    break;
                }
            }

            // 如果直行距离太短（<15米），不播报
            if (straightDistance < 15) {
                console.log(`[直行提示] 跳过：前方距离太短 (${straightDistance.toFixed(0)}米)`);
                return;
            }

            // 构建提示消息
            let message;
            let actionType;
            if (straightType === 'regular') {
                message = `继续直行`;
                actionType = 'straight-regular';
            } else {
                message = `沿当前道路继续直行`;
                actionType = 'straight-irregular';
            }

            // 避免重复播报相同内容
            if (lastPromptType === actionType && timeSinceLastPrompt < 8) {
                console.log(`[直行提示] 跳过：重复播报 (${timeSinceLastPrompt.toFixed(1)}秒前已播报)`);
                return;
            }

            // 更新UI
            updateGuidanceUI({
                type: 'straight',
                action: straightType === 'regular' ? '直行' : '沿道路行走',
                distance: Math.round(straightDistance),
                message: message
            }, false); // 不立即播报，下面单独播报

            // 语音播报
            NavTTS.speak(message, { force: false });

            // 更新播报时间和类型
            lastStraightPromptTime = now;
            lastPromptType = actionType;

            console.log(`[直行提示] ✓ ${message} (类型:${straightType}, 速度:${currentSpeed.toFixed(2)}m/s, 间隔:${timeSinceLastPrompt.toFixed(1)}秒)`);
        } catch (e) {
            console.error('[直行提示] 失败:', e);
        }
    }

    /**
     * 获取转向动作文本
     * @param {string} turnType - 转向类型（left/right/uturn/straight）
     * @returns {string}
     */
    function getTurnActionText(turnType) {
        const actions = {
            'left': '左转',
            'right': '右转',
            'uturn': '掉头',
            'straight': '直行'
        };
        return actions[turnType] || '继续前进';
    }

    /**
     * 更新导航提示UI
     * @param {Object} guidance - 提示信息 { type, action, distance, message }
     * @param {boolean} speak - 是否语音播报，默认true
     */
    function updateGuidanceUI(guidance, speak = true) {
        try {
            currentGuidance = guidance;

            // 【调试】输出发送到UI的数据
            console.log(`[updateGuidanceUI] ===== 发送到UI的数据 =====`);
            console.log(`  type: ${guidance.type}`);
            console.log(`  action: ${guidance.action}`);
            console.log(`  distance: ${guidance.distance}`);
            console.log(`  message: ${guidance.message}`);
            console.log(`[updateGuidanceUI] =============================`);

            // 更新上方提示栏
            if (typeof NavUI !== 'undefined' && NavUI.updateNavigationTip) {
                NavUI.updateNavigationTip(guidance);
            }

            console.log('[导航提示]', guidance.message);
        } catch (e) {
            console.error('[导航提示] 更新UI失败:', e);
        }
    }

    /**
     * 检查是否到达转向点（需要旋转地图）
     * @param {number} currentIndex - 当前点索引（段内相对索引）
     * @returns {Object|null} { needRotate: boolean, bearing: number }
     */
    function checkTurningPoint(currentIndex) {
        const turningPoints = window.currentSegmentTurningPoints;

        if (!turningPoints || currentIndex < 0) {
            return null;
        }

        // 查找下一个转向点
        let nextTurnPoint = null;
        for (let i = 0; i < turningPoints.length; i++) {
            if (turningPoints[i].pointIndex > currentIndex) {
                nextTurnPoint = turningPoints[i];
                break;
            }
        }

        if (!nextTurnPoint) {
            return null; // 没有下一个转向点
        }

        // 【关键优化】只在转向点的前一个点触发旋转
        if (currentIndex === nextTurnPoint.pointIndex - 1 &&
            nextTurnPoint.pointIndex !== lastTurningPointIndex) {

            // 标记已处理此转向点
            lastTurningPointIndex = nextTurnPoint.pointIndex;

            // 使用预计算的方位角
            const newBearing = nextTurnPoint.bearingAfterTurn;

            console.log(`[转向点] 到达转向点前一个点(索引${currentIndex}), 转向类型: ${nextTurnPoint.turnType}, 预计算方位角: ${newBearing.toFixed(1)}°`);

            return {
                needRotate: true,
                bearing: newBearing,  // ← 使用预计算的方位角
                turnType: nextTurnPoint.turnType,
                turnAngle: nextTurnPoint.turnAngle
            };
        }

        return null;
    }

    /**
     * 检查道路是否竖直（接近南北走向）
     * @param {number} bearing - 道路方位角（0-360度）
     * @param {number} threshold - 竖直判定阈值，默认15度
     * @returns {boolean} 是否竖直
     */
    function isRoadVertical(bearing, threshold = 15) {
        if (bearing === null || bearing === undefined || isNaN(bearing)) {
            return false;
        }

        // 归一化到0-360
        const normalizedBearing = ((bearing % 360) + 360) % 360;

        // 计算与正北（0°）或正南（180°）的最小偏差
        const deviationFromNorth = Math.min(
            Math.abs(normalizedBearing - 0),
            Math.abs(normalizedBearing - 360)
        );
        const deviationFromSouth = Math.abs(normalizedBearing - 180);
        const minDeviation = Math.min(deviationFromNorth, deviationFromSouth);

        return minDeviation <= threshold;
    }



    // 实时校验相关状态
    let forceSecondaryCheck = false;     // 是否强制立即执行校验（偏离回归后）
    let lastAlignedBearing = null;       // 上次对齐的道路方向（用于平滑过渡）
    let lastRotationTime = 0;            // 上次旋转时间（用于防抖）
    let smoothedBearing = null;          // 平滑后的方向角

    /**
     * 【简化重写】计算当前位置的地图旋转角度
     * 
     * 核心策略：用"当前位置 → 下一个点"的方向，让道路始终竖直朝上
     * 
     * 特殊处理：
     * - 转向点前1个点或距离<4米：用"当前位置 → 转向点后1个点"的方向（提前预判）
     * 
     * @param {number} currentIndex - 当前吸附点索引
     * @returns {number} 地图旋转角度（度数）
     */
    function calculateMapRotation(currentIndex) {
        const pointSet = window.currentSegmentPointSet;
        const turningPoints = window.currentSegmentTurningPoints || [];
        
        if (!pointSet || currentIndex < 0 || currentIndex >= pointSet.length - 1) {
            return lastAlignedBearing || 0;
        }
        
        const currentPos = pointSet[currentIndex].position;
        let targetBearing;
        
        // 检查是否在转向点附近（前1个点或距离<4米）
        let nearTurningPoint = null;
        
        for (const tp of turningPoints) {
            const tpIndex = tp.pointIndex;
            
            // 条件1：转向点前1个点
            if (currentIndex === tpIndex - 1) {
                nearTurningPoint = tp;
                break;
            }
            
            // 条件2：距离转向点<4米（且还没到转向点）
            if (tpIndex < pointSet.length && currentIndex < tpIndex) {
                const tpPos = pointSet[tpIndex].position;
                const distToTurn = calculateDistanceBetween(currentPos, tpPos);
                if (distToTurn < 4 && distToTurn > 0) {
                    nearTurningPoint = tp;
                    break;
                }
            }
        }
        
        if (nearTurningPoint) {
            // 【转向点附近】用"当前位置 → 转向点后1个点"的方向（提前预判）
            const tpIndex = nearTurningPoint.pointIndex;
            const afterTurnIndex = Math.min(tpIndex + 1, pointSet.length - 1);
            const afterTurnPos = pointSet[afterTurnIndex].position;
            targetBearing = calculateBearing(currentPos, afterTurnPos);
            console.log(`[地图旋转] 转向点${tpIndex}附近，用当前→转向后点方向: ${targetBearing.toFixed(1)}°`);
        } else {
            // 【普通路段】用"当前位置 → 下一个点"的方向
            const nextPos = pointSet[currentIndex + 1].position;
            targetBearing = calculateBearing(currentPos, nextPos);
            // 只在角度变化较大时输出日志，避免刷屏
            if (lastAlignedBearing === null || Math.abs(targetBearing - lastAlignedBearing) > 5) {
                console.log(`[地图旋转] 当前→下一点方向: ${targetBearing.toFixed(1)}°`);
            }
        }
        
        // 记录上次对齐的方向
        lastAlignedBearing = targetBearing;
        
        return targetBearing;
    }
    
    /**
     * 计算两点间距离（米）
     */
    function calculateDistanceBetween(pos1, pos2) {
        const [lng1, lat1] = pos1;
        const [lng2, lat2] = pos2;
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * 【重写】实时道路对齐：确保道路始终竖直显示
     * 优化：添加角度平滑和时间防抖，避免跳跃飘移
     * 
     * @param {Array} position - 当前位置 [lng, lat]
     * @param {number} currentIndex - 当前吸附点索引
     */
    function secondaryVerticalCheck(position, currentIndex) {
        try {
            const map = NavRenderer.getMap();
            if (!map) return;
            
            const now = Date.now();
            
            // 计算目标旋转角度
            const targetBearing = calculateMapRotation(currentIndex);
            
            // 获取当前地图旋转角度
            const currentRotation = map.getRotation() || 0;
            
            // 归一化角度到 -180 ~ 180
            const normalize = (angle) => {
                angle = angle % 360;
                if (angle > 180) angle -= 360;
                if (angle < -180) angle += 360;
                return angle;
            };
            
            // 【优化1】角度平滑：使用EMA平滑，避免突然跳变
            if (smoothedBearing === null) {
                smoothedBearing = targetBearing;
            } else {
                // 计算角度差（考虑环形）
                let angleDelta = normalize(targetBearing - smoothedBearing);
                
                // 平滑系数：小角度变化用较小系数（更平滑），大角度变化用较大系数（更快响应）
                const absAngleDelta = Math.abs(angleDelta);
                let alpha;
                if (absAngleDelta > 45) {
                    alpha = 0.6;  // 大角度变化，快速响应（如转弯）
                } else if (absAngleDelta > 15) {
                    alpha = 0.4;  // 中等角度变化
                } else {
                    alpha = 0.25; // 小角度变化，更平滑
                }
                
                smoothedBearing = normalize(smoothedBearing + alpha * angleDelta);
            }
            
            // 计算平滑后的角度与当前地图角度的差值
            const angleDiff = Math.abs(normalize(smoothedBearing - currentRotation));
            
            // 【优化2】时间防抖：至少间隔200ms才执行旋转
            const timeSinceLastRotation = now - lastRotationTime;
            
            // 【优化3】角度阈值：只有角度差超过5度才旋转（提高阈值）
            // 但如果是大角度变化（>30度），立即响应
            const shouldRotate = (angleDiff > 30) || 
                                 (angleDiff > 5 && timeSinceLastRotation > 200);
            
            if (shouldRotate) {
                // 只在角度变化较大时输出日志
                if (angleDiff > 10) {
                    console.log(`[地图旋转] 当前=${currentRotation.toFixed(1)}°, 目标=${smoothedBearing.toFixed(1)}°, 差值=${angleDiff.toFixed(1)}°`);
                }
                NavRenderer.setHeadingUpMode(position, smoothedBearing, true);
                currentMapRotation = smoothedBearing;
                window.currentMapRotation = smoothedBearing;  // 暴露给位置上报器
                lastRotationTime = now;
            }
        } catch (e) {
            console.error('[地图旋转] 执行失败:', e);
        }
    }
    /**
     * 比较新旧路线是否相似（用于判断是否需要重新规划）
     * @param {Array} oldPointSet - 旧点集
     * @param {Array} newPath - 新路径 [[lng, lat], ...]
     * @returns {boolean} true表示路线相似，不需要重新规划
     */
    function compareRoutes(oldPointSet, newPath) {
        try {
            if (!oldPointSet || oldPointSet.length === 0 || !newPath || newPath.length < 2) {
                return false; // 数据不完整，认为不相似
            }

            // 1. 比较终点是否相同（终点必须一致）
            const oldEndPos = oldPointSet[oldPointSet.length - 1].position;
            const newEndPos = newPath[newPath.length - 1];
            const oldEndLng = Array.isArray(oldEndPos) ? oldEndPos[0] : oldEndPos.lng;
            const oldEndLat = Array.isArray(oldEndPos) ? oldEndPos[1] : oldEndPos.lat;
            const newEndLng = Array.isArray(newEndPos) ? newEndPos[0] : newEndPos.lng;
            const newEndLat = Array.isArray(newEndPos) ? newEndPos[1] : newEndPos.lat;
            
            const endDistance = haversineDistance(oldEndLat, oldEndLng, newEndLat, newEndLng);
            if (endDistance > 5) {
                console.log(`[路线比较] 终点不同，距离${endDistance.toFixed(1)}米`);
                return false;
            }

            // 2. 比较路线长度差异（如果长度差异超过20%，认为不相似）
            let oldLength = 0;
            for (let i = 1; i < oldPointSet.length; i++) {
                const p1 = oldPointSet[i - 1].position;
                const p2 = oldPointSet[i].position;
                oldLength += haversineDistance(
                    Array.isArray(p1) ? p1[1] : p1.lat,
                    Array.isArray(p1) ? p1[0] : p1.lng,
                    Array.isArray(p2) ? p2[1] : p2.lat,
                    Array.isArray(p2) ? p2[0] : p2.lng
                );
            }

            let newLength = 0;
            for (let i = 1; i < newPath.length; i++) {
                const p1 = newPath[i - 1];
                const p2 = newPath[i];
                newLength += haversineDistance(
                    Array.isArray(p1) ? p1[1] : p1.lat,
                    Array.isArray(p1) ? p1[0] : p1.lng,
                    Array.isArray(p2) ? p2[1] : p2.lat,
                    Array.isArray(p2) ? p2[0] : p2.lng
                );
            }

            const lengthDiff = Math.abs(newLength - oldLength) / Math.max(oldLength, 1);
            if (lengthDiff > 0.2) {
                console.log(`[路线比较] 长度差异${(lengthDiff * 100).toFixed(1)}%，认为路线不同`);
                return false;
            }

            // 3. 采样比较路线中间点（每隔一定距离取点比较）
            // 如果大部分点都在旧路线附近（10米内），认为相似
            const sampleInterval = Math.max(1, Math.floor(newPath.length / 5)); // 取5个采样点
            let matchCount = 0;
            let sampleCount = 0;

            for (let i = sampleInterval; i < newPath.length - 1; i += sampleInterval) {
                sampleCount++;
                const newPoint = newPath[i];
                const newLng = Array.isArray(newPoint) ? newPoint[0] : newPoint.lng;
                const newLat = Array.isArray(newPoint) ? newPoint[1] : newPoint.lat;

                // 在旧点集中找最近的点
                let minDist = Infinity;
                for (let j = 0; j < oldPointSet.length; j++) {
                    const oldPoint = oldPointSet[j].position;
                    const oldLng = Array.isArray(oldPoint) ? oldPoint[0] : oldPoint.lng;
                    const oldLat = Array.isArray(oldPoint) ? oldPoint[1] : oldPoint.lat;
                    const dist = haversineDistance(newLat, newLng, oldLat, oldLng);
                    if (dist < minDist) minDist = dist;
                }

                if (minDist <= 10) {
                    matchCount++;
                }
            }

            // 如果80%以上的采样点都在旧路线附近，认为相似
            const matchRatio = sampleCount > 0 ? matchCount / sampleCount : 0;
            const isSimilar = matchRatio >= 0.8;
            
            console.log(`[路线比较] 采样点匹配率${(matchRatio * 100).toFixed(0)}%，${isSimilar ? '路线相似' : '路线不同'}`);
            return isSimilar;
        } catch (e) {
            console.error('[路线比较] 执行失败:', e);
            return false;
        }
    }

    /**
     * 将GPS位置吸附到KML路网上（用于偏离轨迹显示）
     * @param {Array} position - GPS位置 [lng, lat]
     * @returns {Array|null} 吸附后的位置 [lng, lat]，如果无法吸附则返回null
     */
    function snapToKMLNetwork(position) {
        try {
            // 检查是否有KML路线吸附功能
            if (typeof findNearestKMLSegment !== 'function') {
                return null;
            }

            // 查找最近的KML线段
            const nearest = findNearestKMLSegment(position);
            
            if (!nearest || !nearest.projectionPoint) {
                return null;
            }

            // 检查距离是否在吸附范围内（使用常规吸附阈值）
            if (nearest.distance > SNAP_THRESHOLD_NORMAL) {
                console.log(`[偏离吸附] 距离KML路网${nearest.distance.toFixed(1)}米，超出吸附范围${SNAP_THRESHOLD_NORMAL}米`);
                return null;
            }

            // 返回投影点位置
            const projPoint = nearest.projectionPoint;
            const snappedPos = [projPoint.lng, projPoint.lat];
            
            console.log(`[偏离吸附] 吸附到KML路网，距离${nearest.distance.toFixed(1)}米`);
            return snappedPos;
        } catch (e) {
            console.error('[偏离吸附] 执行失败:', e);
            return null;
        }
    }

    /**
     * 检查用户是否回归到原路线（绿色点集）
     * 【简化版】只要在绿色点集上找到距离≤8米的点，就算回归
     * @param {Array} position - 检测位置 [lng, lat]（应传入KML吸附后的位置）
     * @param {Array} pointSet - 原路线点集（偏离时保存的绿色点集）
     * @returns {Object} { rejoined: boolean, index: number, distance: number }
     */
    function checkRejoinOriginalRoute(position, pointSet) {
        try {
            if (!pointSet || pointSet.length === 0) {
                return { rejoined: false };
            }

            const posLng = position[0];
            const posLat = position[1];

            let nearestIndex = -1;
            let nearestDistance = Infinity;

            // 搜索整个点集，找到最近的点
            for (let i = 0; i < pointSet.length; i++) {
                const point = pointSet[i].position;
                const lng = Array.isArray(point) ? point[0] : point.lng;
                const lat = Array.isArray(point) ? point[1] : point.lat;

                const distance = haversineDistance(posLat, posLng, lat, lng);

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestIndex = i;
                }
            }

            // 回归阈值设为9米，与吸附阈值一致
            const REJOIN_THRESHOLD = SNAP_THRESHOLD_NORMAL;

            if (nearestDistance <= REJOIN_THRESHOLD) {
                console.log(`[回归检测] ✓ 距离绿色点集${nearestDistance.toFixed(1)}米，索引${nearestIndex}，判定为回归`);
                return {
                    rejoined: true,
                    index: nearestIndex,
                    distance: nearestDistance
                };
            }

            console.log(`[回归检测] × 距离绿色点集${nearestDistance.toFixed(1)}米，最近索引${nearestIndex}，未达到回归阈值`);
            return { rejoined: false };
        } catch (e) {
            console.error('[回归检测] 执行失败:', e);
            return { rejoined: false };
        }
    }

    // ==================== 前方路况实时检测 ====================
    // 检测 KML 图层中的灰色路段（不可通行），不是导航系统绘制的"已走过"灰色路线
    let lastRoadConditionCheckTime = 0;          // 上次路况检查时间
    let lastRoadStatusRefreshTime = 0;           // 上次道路状态刷新时间
    const ROAD_CONDITION_CHECK_INTERVAL = 2000;  // 路况检查间隔（毫秒）
    const ROAD_STATUS_REFRESH_INTERVAL = 10000;  // 道路状态刷新间隔（毫秒）- 每10秒从后端拉取最新状态
    const ROAD_CONDITION_CHECK_DISTANCE = 100;   // 检查前方多少米的路况（米）

    /**
     * 刷新道路状态（从后端拉取最新的摄像头检测结果，更新 KML 图层颜色）
     * 导航过程中定时调用，确保能感知到路况变化
     */
    async function refreshRoadStatus() {
        try {
            const now = Date.now();
            // 防抖：避免频繁刷新
            if (now - lastRoadStatusRefreshTime < ROAD_STATUS_REFRESH_INTERVAL) {
                return;
            }
            lastRoadStatusRefreshTime = now;

            console.log('[路况刷新] 开始刷新道路状态...');

            // 检查是否有道路状态刷新函数
            if (typeof autoLoadDriverRoadStatus === 'function') {
                await autoLoadDriverRoadStatus();
                console.log('[路况刷新] ✓ 道路状态已刷新');
            } else {
                console.log('[路况刷新] autoLoadDriverRoadStatus 函数不存在，跳过刷新');
            }
        } catch (e) {
            console.error('[路况刷新] 刷新失败:', e);
        }
    }

    /**
     * 检查前方路段是否有不可通行的灰色路段（KML图层中的原始灰色路段）
     * 注意：这里检测的是 KML 图层中 strokeColor === '#808080' 的路段，
     * 而不是导航系统绘制的"已走过"灰色路线（passedPolyline）
     *
     * @param {number} currentIndex - 当前吸附点索引
     * @returns {Object|null} 如果检测到灰色路段，返回 {found: true, distance: 距离米数}，否则返回 null
     */
    function checkAheadRoadCondition(currentIndex) {
        try {
            const now = Date.now();
            // 防抖：避免频繁检查
            if (now - lastRoadConditionCheckTime < ROAD_CONDITION_CHECK_INTERVAL) {
                return null;
            }
            lastRoadConditionCheckTime = now;

            // 【新增】先刷新道路状态，确保 kmlLayers 中的颜色是最新的
            refreshRoadStatus();

            // 检查必要的全局变量
            if (typeof window.kmlLayers === 'undefined' || !window.kmlLayers) {
                console.log('[路况检测] kmlLayers 不存在，跳过检测');
                return null;
            }

            const pointSet = window.currentSegmentPointSet;
            if (!pointSet || pointSet.length === 0 || currentIndex < 0) {
                console.log('[路况检测] 点集无效，跳过检测');
                return null;
            }

            // 计算需要检查的点的范围（当前位置往前100米）
            let checkDistance = 0;
            let endCheckIndex = currentIndex;

            for (let i = currentIndex; i < pointSet.length - 1; i++) {
                const p1 = pointSet[i].position;
                const p2 = pointSet[i + 1].position;
                const segDist = haversineDistance(
                    Array.isArray(p1) ? p1[1] : p1.lat,
                    Array.isArray(p1) ? p1[0] : p1.lng,
                    Array.isArray(p2) ? p2[1] : p2.lat,
                    Array.isArray(p2) ? p2[0] : p2.lng
                );
                checkDistance += segDist;
                endCheckIndex = i + 1;

                if (checkDistance >= ROAD_CONDITION_CHECK_DISTANCE) {
                    break;
                }
            }

            // 获取需要检查的路径点
            const checkPoints = [];
            for (let i = currentIndex; i <= endCheckIndex && i < pointSet.length; i++) {
                checkPoints.push(pointSet[i].position);
            }

            if (checkPoints.length < 2) {
                return null;
            }

            console.log(`[路况检测] 检查前方路况: 当前索引=${currentIndex}, 检查到索引=${endCheckIndex}, 检查距离=${checkDistance.toFixed(0)}米, 检查点数=${checkPoints.length}`);

            // 统计 KML 图层中的灰色路段数量（调试用）
            let graySegmentCount = 0;
            window.kmlLayers.forEach(layer => {
                if (!layer.visible) return;
                layer.markers.forEach(marker => {
                    if (!marker || typeof marker.getExtData !== 'function') return;
                    const extData = marker.getExtData();
                    if (!extData || extData.type !== '线') return;
                    const strokeColor = marker.getOptions ? marker.getOptions().strokeColor : null;
                    if (strokeColor === '#808080') {
                        graySegmentCount++;
                    }
                });
            });
            console.log(`[路况检测] KML图层中灰色路段数量: ${graySegmentCount}`);

            // 【调试】输出检测路径的首尾坐标
            const firstPoint = checkPoints[0];
            const lastPoint = checkPoints[checkPoints.length - 1];
            console.log(`[路况检测] 检测路径: 起点[${Array.isArray(firstPoint) ? firstPoint[0].toFixed(6) : firstPoint.lng.toFixed(6)}, ${Array.isArray(firstPoint) ? firstPoint[1].toFixed(6) : firstPoint.lat.toFixed(6)}] -> 终点[${Array.isArray(lastPoint) ? lastPoint[0].toFixed(6) : lastPoint.lng.toFixed(6)}, ${Array.isArray(lastPoint) ? lastPoint[1].toFixed(6) : lastPoint.lat.toFixed(6)}]`);

            // 遍历路径上的点，检查每个点附近是否有 KML 图层中的灰色路段
            for (let i = 0; i < checkPoints.length; i++) {
                const pos = checkPoints[i];
                const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                const lat = Array.isArray(pos) ? pos[1] : pos.lat;

                // 检查这个点是否在 KML 图层的灰色路段上
                const graySegment = findNearestGrayKMLSegment([lng, lat]);

                // 【调试】每隔5个点输出一次与最近灰色路段的距离
                if (i % 5 === 0 && graySegment) {
                    console.log(`[路况检测] 点${i} [${lng.toFixed(6)}, ${lat.toFixed(6)}] 距离最近灰色路段: ${graySegment.distance.toFixed(1)}米`);
                }

                if (graySegment && graySegment.distance < 5) { // 5米内认为在灰色路段上
                    // 计算从当前位置到灰色路段的距离
                    let distanceToGray = 0;
                    for (let j = currentIndex; j < currentIndex + i && j < pointSet.length - 1; j++) {
                        const p1 = pointSet[j].position;
                        const p2 = pointSet[j + 1].position;
                        distanceToGray += haversineDistance(
                            Array.isArray(p1) ? p1[1] : p1.lat,
                            Array.isArray(p1) ? p1[0] : p1.lng,
                            Array.isArray(p2) ? p2[1] : p2.lat,
                            Array.isArray(p2) ? p2[0] : p2.lng
                        );
                    }

                    console.log(`[路况检测] ⚠ 检测到前方${distanceToGray.toFixed(0)}米处有KML灰色路段（不可通行）: ${graySegment.name}, 距离路段=${graySegment.distance.toFixed(1)}米`);
                    return {
                        found: true,
                        distance: distanceToGray,
                        segmentName: graySegment.name || '未知路段'
                    };
                }
            }

            console.log('[路况检测] ✓ 前方路况正常，无灰色路段');
            return null;
        } catch (e) {
            console.error('[路况检测] 执行失败:', e);
            return null;
        }
    }

    /**
     * 查找距离某点最近的 KML 图层中的灰色（不可通行）路段
     * 注意：只检查 KML 图层中 strokeColor === '#808080' 的原始路段
     *
     * @param {Array} coordinate - [lng, lat]
     * @returns {Object|null} 最近的灰色线段信息，或 null
     */
    function findNearestGrayKMLSegment(coordinate) {
        try {
            if (typeof window.kmlLayers === 'undefined' || !window.kmlLayers) {
                return null;
            }

            const coordLng = Array.isArray(coordinate) ? coordinate[0] : coordinate.lng;
            const coordLat = Array.isArray(coordinate) ? coordinate[1] : coordinate.lat;

            let minDistance = Infinity;
            let nearestGray = null;

            // 遍历所有 KML 图层
            window.kmlLayers.forEach(layer => {
                if (!layer.visible) return;

                layer.markers.forEach(marker => {
                    if (!marker || typeof marker.getExtData !== 'function') return;

                    const extData = marker.getExtData();
                    if (!extData || extData.type !== '线') return;

                    // 【关键】只检查 KML 图层中的灰色路段（#808080）
                    // 这是原始的不可通行路段，不是导航系统绘制的"已走过"路线
                    const strokeColor = marker.getOptions ? marker.getOptions().strokeColor : null;
                    if (strokeColor !== '#808080') return;

                    // 获取路径
                    if (typeof marker.getPath !== 'function') return;

                    let path;
                    try {
                        path = marker.getPath();
                    } catch (e) {
                        return;
                    }

                    if (!path || path.length < 2) return;

                    // 计算点到这条灰色线段的最近距离
                    for (let i = 0; i < path.length - 1; i++) {
                        const p1 = path[i];
                        const p2 = path[i + 1];

                        const p1Lng = p1.lng !== undefined ? p1.lng : p1[0];
                        const p1Lat = p1.lat !== undefined ? p1.lat : p1[1];
                        const p2Lng = p2.lng !== undefined ? p2.lng : p2[0];
                        const p2Lat = p2.lat !== undefined ? p2.lat : p2[1];

                        // 计算点到线段的距离
                        const dist = pointToSegmentDistance(
                            coordLng, coordLat,
                            p1Lng, p1Lat,
                            p2Lng, p2Lat
                        );

                        if (dist < minDistance) {
                            minDistance = dist;
                            nearestGray = {
                                distance: dist,
                                name: extData.name || '灰色路段',
                                marker: marker
                            };
                        }
                    }
                });
            });

            return nearestGray;
        } catch (e) {
            console.error('[查找KML灰色路段] 执行失败:', e);
            return null;
        }
    }

    /**
     * 计算点到线段的距离（米）
     */
    function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;

        if (dx === 0 && dy === 0) {
            // 线段退化为点
            return haversineDistance(py, px, y1, x1);
        }

        // 计算投影参数 t
        const t = Math.max(0, Math.min(1,
            ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
        ));

        // 投影点
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;

        return haversineDistance(py, px, projY, projX);
    }

    /**
     * 处理前方路况变化：检测到 KML 图层中的灰色路段时重新规划
     * @param {Array} position - 当前GPS位置 [lng, lat]
     * @param {number} currentIndex - 当前吸附点索引
     * @returns {boolean} 是否触发了重新规划
     */
    function handleRoadConditionChange(position, currentIndex) {
        try {
            // 检查前方路况
            const grayAhead = checkAheadRoadCondition(currentIndex);

            if (!grayAhead || !grayAhead.found) {
                return false;
            }

            console.log(`[路况变化] 前方${grayAhead.distance.toFixed(0)}米处检测到不可通行路段: ${grayAhead.segmentName}`);

            // 检查是否需要重新规划（带防抖）
            const now = Date.now();
            if (now - lastReplanTime < 5000) {
                console.log('[路况变化] 跳过重新规划（距上次<5秒，防抖中）');
                return false;
            }

            // 播报提示
            NavTTS.speak(`前方道路不可通行，正在重新规划路线`, { force: true });

            // 重新规划路线
            const replanSuccess = replanRouteFromPosition(position);

            if (replanSuccess) {
                lastReplanTime = now;
                console.log('[路况变化] ✓ 路线已重新规划，绕开不可通行路段');
                NavTTS.speak('已重新规划路线', { force: true });
                return true;
            } else {
                console.log('[路况变化] × 重新规划失败，可能没有可用的替代路线');
                NavTTS.speak('无法绕行，请注意前方路况', { force: true });
                return false;
            }
        } catch (e) {
            console.error('[路况变化处理] 执行失败:', e);
            return false;
        }
    }

    /**
     * 从当前位置重新规划路线到段终点
     * 【简化版】只做重新规划，回归判断已在调用方完成
     * @param {Array} position - 当前位置 [lng, lat]
     * @returns {boolean} 重新规划是否成功
     */
    function replanRouteFromPosition(position) {
        try {
            // 检查是否有KML路线规划功能
            if (typeof planKMLRoute !== 'function' || typeof resetKMLGraph !== 'function') {
                console.log('[重新规划] KML路线规划功能不可用');
                return false;
            }

            // 获取当前段的终点
            const currentSegment = segmentRanges[currentSegmentIndex];
            if (!currentSegment) {
                console.log('[重新规划] 无法获取当前段信息');
                return false;
            }

            const fullPointSet = window.navigationPointSet;
            if (!fullPointSet || fullPointSet.length === 0) {
                console.log('[重新规划] 点集不存在');
                return false;
            }

            // 获取当前段终点位置
            const segmentEndPoint = fullPointSet[currentSegment.end];
            if (!segmentEndPoint) {
                console.log('[重新规划] 无法获取段终点');
                return false;
            }

            const endPos = segmentEndPoint.position;
            const endLng = Array.isArray(endPos) ? endPos[0] : endPos.lng;
            const endLat = Array.isArray(endPos) ? endPos[1] : endPos.lat;

            console.log('[重新规划] 从当前位置规划到段终点:', {
                当前位置: position,
                段终点: [endLng, endLat],
                当前段: currentSegmentIndex,
                段名称: currentSegment.name
            });

            // 重置KML图，准备重新规划
            resetKMLGraph();

            // 尝试规划新路线
            const newRoute = planKMLRoute(position, [endLng, endLat]);

            if (!newRoute || !newRoute.path || newRoute.path.length < 2) {
                console.log('[重新规划] 无法规划新路线（可能不在KML路网上）');
                return false;
            }

            console.log('[重新规划] 新路线规划成功:', {
                路径点数: newRoute.path.length,
                总距离: newRoute.distance ? newRoute.distance.toFixed(1) + '米' : '未知'
            });

            const newPath = newRoute.path;

            // 固化当前已走过的灰色路线
            NavRenderer.lowerCompletedSegmentZIndex();

            // 重新生成点集（只更新当前段）
            const newPointSet = resamplePathWithOriginalPoints(newPath, 3);
            window.currentSegmentPointSet = newPointSet.map((point, idx) => ({
                ...point,
                index: idx,
                globalIndex: currentSegment.start + idx
            }));

            // 重新计算转向点
            const newTurningPoints = detectTurningPoints(window.currentSegmentPointSet, 30);
            window.currentSegmentTurningPoints = newTurningPoints;

            console.log('[重新规划] 新点集生成:', {
                点数: window.currentSegmentPointSet.length,
                转向点数: newTurningPoints.length
            });

            // 重新绘制新的绿色路线（清除旧的）
            NavRenderer.drawRoute(newPath);

            // 重置吸附状态
            currentSnappedIndex = 0;
            lastSnappedIndex = -1;
            lastTurningPointIndex = -1;
            nextTurningPointIndex = -1;
            hasPrompted1_4 = false;
            hasPromptedBefore = false;

            // 更新用户位置到新路线起点
            NavRenderer.updateUserMarker(position, 0, false, true);
            NavRenderer.setLastSnappedPosition(newPointSet[0].position);

            // 居中地图并对齐道路
            if (newPointSet.length >= 2) {
                const bearing = calculateBearing(newPointSet[0].position, newPointSet[1].position);
                NavRenderer.setHeadingUpMode(position, bearing, true);
            }

            // 【关键】保存重规划后当前段的最后两个点，用于段间转向检测
            // 当切换到下一段时，需要用这些点来计算正确的转向角度
            if (newPointSet.length >= 2) {
                replanedSegmentEndPoints = {
                    segmentIndex: currentSegmentIndex,
                    prevPoint: newPointSet[newPointSet.length - 2].position,
                    endPoint: newPointSet[newPointSet.length - 1].position
                };
                console.log('[重新规划] 已保存段末两点用于段间转向检测:', {
                    段索引: currentSegmentIndex,
                    倒数第二点: replanedSegmentEndPoints.prevPoint,
                    末点: replanedSegmentEndPoints.endPoint
                });
            }

            return true;
        } catch (e) {
            console.error('[重新规划] 执行失败:', e);
            return false;
        }
    }

    /**
     * GPS位置更新回调
     * @param {Array} position - [lng, lat]
     * @param {number} accuracy - 精度（米）
     * @param {number} gpsHeading - GPS方向（度）
     */
    function onGPSUpdate(position, accuracy, gpsHeading = 0) {
        try {
            if (!isNavigating) return;

            const now = Date.now();

            // 【节流保护】如果距离上次处理时间太短，跳过本次
            if (now - lastGPSProcessTime < GPS_MIN_INTERVAL) {
                // 节流跳过不输出日志，避免刷屏
                return;
            }

            // 【防卡死】如果上次处理还没完成且超时，强制重置
            if (isProcessingGPS && (now - gpsProcessStartTime > GPS_TIMEOUT)) {
                console.warn('[NavCore] GPS处理超时，强制重置');
                isProcessingGPS = false;
            }

            // 【防重入】如果正在处理中，跳过本次
            if (isProcessingGPS) {
                console.log('[NavCore] GPS处理中，跳过本次更新');
                return;
            }

            // 标记开始处理
            isProcessingGPS = true;
            gpsProcessStartTime = now;

            // 0. 更新速度计算
            updateSpeed(position);

            // 1. 尝试吸附到当前段点集
            const snapped = findNearestPointInSet(position);

            // 2. 判断是否到达起点（只有吸附成功才算到达）
            if (!hasReachedStart && snapped !== null) {
                // 第一次吸附到路网，说明到达起点
                hasReachedStart = true;
                window.hasReachedStart = true;

                // 【新增】记录导航开始时间
                navigationStartTime = Date.now();
                totalTravelDistance = 0;  // 重置总距离
                console.log('[NavCore] 导航开始时间记录:', new Date(navigationStartTime).toLocaleTimeString());

                // 清除引导线
                NavRenderer.clearGuideLine();

                // 初始化最后吸附位置（用于偏离轨迹起点）
                NavRenderer.setLastSnappedPosition(snapped.position);

                // 播报"已到达起点"
                if (!window.hasAnnouncedNavigationStart) {
                    window.hasAnnouncedNavigationStart = true;
                    const firstSegment = segmentRanges[0];
                    const targetName = firstSegment.name.split('到')[1];
                    NavTTS.speak(`已到达起点，前往${targetName}`, { force: true });
                    console.log('[NavCore] ✓ 已到达起点，开始正式导航');
                }
            }

            // 3. 处理未到达起点的情况（绘制蓝色引导线）
            // 【问题7优化】引导线连接用户位置和绿色路线的起点（路线第一个点）
            if (!hasReachedStart) {
                // 使用路线的第一个点作为引导目标（绿色路线的起点）
                const routeFirstPoint = navigationPath && navigationPath.length > 0 ? navigationPath[0] : null;
                const startPos = routeFirstPoint || routeData.start.actualStartPosition || routeData.start.position;
                const distanceToStart = haversineDistance(
                    position[1], position[0],
                    Array.isArray(startPos) ? startPos[1] : startPos.lat,
                    Array.isArray(startPos) ? startPos[0] : startPos.lng
                );

                // 计算稳定朝向：优先设备方向；否则使用与上一点的方位角；小于0.5m不更新
                let headingForMarker = deviceHeading;
                if (headingForMarker === null || headingForMarker === undefined) {
                    if (lastPreStartPosition) {
                        const moveDist = haversineDistance(lastPreStartPosition[1], lastPreStartPosition[0], position[1], position[0]);
                        if (moveDist >= 0.5) {
                            headingForMarker = calculateBearing(lastPreStartPosition, position);
                        } else {
                            headingForMarker = lastRawHeading; // 保持上次
                        }
                    }
                }
                if (headingForMarker === null || headingForMarker === undefined || isNaN(headingForMarker)) {
                    headingForMarker = lastRawHeading || 0;
                }
                lastRawHeading = headingForMarker;
                lastPreStartPosition = position;

                // 自动校准一次（防180°反向）
                attemptAutoCalibrationPreStart(position, headingForMarker);
                // 应用偏移与地图旋转，得到最终角度
                const finalAngleRaw = getAdjustedAngle(headingForMarker);
                // EMA 平滑
                const finalAngle = smoothAngleEMA(lastSmoothedAngle, finalAngleRaw);
                lastSmoothedAngle = finalAngle;
                // 更新用户位置标记（使用稳定朝向）
                NavRenderer.updateUserMarker(position, finalAngle, false, false);

                // 实时绘制引导线
                NavRenderer.drawGuidanceLine(position, startPos);

                // 保存距离到全局变量
                window.distanceToStart = distanceToStart;

                // 更新上方提示栏：显示"前往起点"
                if (typeof NavUI !== 'undefined' && NavUI.updateNavigationTip) {
                    const distanceText = distanceToStart < 1000
                        ? `${Math.round(distanceToStart)}米`
                        : `${(distanceToStart / 1000).toFixed(1)}公里`;

                    NavUI.updateNavigationTip({
                        type: 'straight',
                        action: '前往起点',
                        distance: Math.round(distanceToStart),
                        message: `前往起点 ${distanceText}`
                    });
                }

                // 地图跟随用户位置
                NavRenderer.setCenterOnly(position, true);

                // 更新精度圈
                NavRenderer.updateAccuracyCircle(position, accuracy);

                // 【关键】提前return前必须重置处理标志
                isProcessingGPS = false;
                lastGPSProcessTime = Date.now();

                // 未到达起点，后续逻辑不执行
                return;
            }

            // 4. 已到达起点，处理正常导航逻辑
            let displayPosition = position; // 默认显示GPS原始位置
            let displayHeading = gpsHeading; // 默认显示GPS方向

            if (snapped) {
                // ========== 吸附成功（≤8米）==========

                // 【重置偏离确认计数】
                if (deviationConfirmCount > 0 || isDeviationConfirmed) {
                    console.log('[点集吸附] 重新吸附成功，重置偏离状态');
                    deviationConfirmCount = 0;
                    isDeviationConfirmed = false;
                    hasAnnouncedDeviation = false;
                }

                // 检查是否从偏离状态恢复
                if (NavRenderer.isDeviated()) {
                    // 判断是否跨节接入（偏离后接入到不同的节）
                    const crossedSection = snapped.crossedSection || false;
                    const isSameSegment = true; // 当前逻辑下，吸附成功必然是当前段
                    const deviationInfo = NavRenderer.endDeviation(snapped.position, isSameSegment);

                    if (deviationInfo) {
                        console.log('[NavCore] 偏离后重新接入路网:',
                            `偏离前索引=${currentSnappedIndex}`,
                            `接入索引=${snapped.index}`,
                            crossedSection ? '(跨节接入)' : '(同节接入)',
                            isSameSegment ? '(同一路段)' : '(不同路段)');

                        // 【关键修复】确保接入点不能比偏离前的点还靠前
                        // 如果接入点索引小于当前索引，说明吸附逻辑有误，强制使用接入点
                        if (snapped.index < currentSnappedIndex) {
                            console.warn(`[NavCore] 警告：接入点索引(${snapped.index})小于偏离前索引(${currentSnappedIndex})，这不应该发生！`);
                        }

                        // 无论如何，都要重置转向点提示状态（因为可能跨过了转向点）
                        lastTurningPointIndex = -1;
                        hasPrompted1_4 = false;
                        hasPromptedBefore = false;
                        console.log('[NavCore] 偏离后重新接入，已重置转向点提示状态');

                        // 设置强制校验标志，偏离回归后立即执行实时对齐
                        forceSecondaryCheck = true;

                        // 不在这里播报，播报逻辑在偏离处理的主流程中统一处理
                        if (typeof NavTTS !== 'undefined' && NavTTS.resetSuppression) NavTTS.resetSuppression();
                    }
                }

                // 使用吸附位置
                displayPosition = snapped.position;
                snappedPosition = snapped.position;

                // 更新最后吸附位置（用于下次偏离的起点）
                NavRenderer.setLastSnappedPosition(snapped.position);

                // 更新吸附索引（使用段内相对索引）
                lastSnappedIndex = currentSnappedIndex;
                currentSnappedIndex = snapped.index;

                // 【新增】累计行程距离（只有前进时才累计）
                if (hasReachedStart && lastSnappedIndex >= 0 && currentSnappedIndex > lastSnappedIndex) {
                    // 计算从上一个点到当前点的距离
                    const pointSet = window.currentSegmentPointSet;
                    if (pointSet && lastSnappedIndex < pointSet.length && currentSnappedIndex < pointSet.length) {
                        const prevPos = pointSet[lastSnappedIndex].position;
                        const currPos = pointSet[currentSnappedIndex].position;
                        const stepDistance = haversineDistance(
                            prevPos[1], prevPos[0],
                            currPos[1], currPos[0]
                        );
                        totalTravelDistance += stepDistance;
                        console.log(`[统计] 行程累计: +${stepDistance.toFixed(1)}米, 总计${totalTravelDistance.toFixed(1)}米`);
                    }
                }

                // 暴露到全局供UI使用
                window.currentSnappedIndex = currentSnappedIndex;

                console.log(`[点集吸附] 吸附到段内点${snapped.index}（全局${snapped.globalIndex}）, 距离${snapped.distance.toFixed(2)}米`);

                // 【新增】段间过渡时，首次吸附成功后立即检测段间转向
                if (isInSegmentTransition && lastSnappedIndex === -1) {
                    console.log('[段间转向] 首次吸附成功，立即检测段间转向');
                    checkSegmentTransition();
                    isInSegmentTransition = false;
                }

                // 检查是否完成当前路段（到达段末）
                const segmentCompleted = checkSegmentCompletion(currentSnappedIndex, position);

                if (!segmentCompleted) {
                    // 更新导航提示（只在段内更新，段间切换时不更新）
                    // 传入当前GPS位置，用于更准确的距离计算
                    updateNavigationGuidance(currentSnappedIndex, position);

                    // 【新增】检查前方路况，如果检测到不可通行的灰色路段则重新规划
                    const roadConditionChanged = handleRoadConditionChange(position, currentSnappedIndex);
                    if (roadConditionChanged) {
                        // 路线已重新规划，本次GPS更新结束
                        isProcessingGPS = false;
                        lastGPSProcessTime = Date.now();
                        return;
                    }
                }

                // 更新已走路线（灰色）
                NavRenderer.updatePassedRoute(currentSnappedIndex, displayPosition);

               // 计算路网方向：从当前吸附位置到下一个转向点的方向
                const pointSet = window.currentSegmentPointSet;
                const turningPoints = window.currentSegmentTurningPoints;

                // 找到下一个转向点（基于当前吸附点，查找绿色路线上的下一个转向点）
                let nextTurnPointIndex = pointSet.length - 1; // 默认段末
                if (turningPoints && turningPoints.length > 0) {
                    for (let i = 0; i < turningPoints.length; i++) {
                        // 查找当前吸附点之后的第一个转向点
                        if (turningPoints[i].pointIndex > currentSnappedIndex) {
                            nextTurnPointIndex = turningPoints[i].pointIndex;
                            console.log(`[下一个转向点] 索引=${nextTurnPointIndex}, 类型=${turningPoints[i].turnType}, 当前吸附点=${currentSnappedIndex}`);
                            break;
                        }
                    }
                }

                // 计算从当前吸附位置到下一个转向点的方向
                const currentPos = pointSet[currentSnappedIndex].position;
                const nextTurnPos = pointSet[nextTurnPointIndex].position;
                const roadBearing = calculateBearing(currentPos, nextTurnPos);

                // 获取地图当前旋转角度
                const map = NavRenderer.getMap();
                const mapRotation = map && typeof map.getRotation === 'function' 
                    ? (map.getRotation() || 0) 
                    : 0;

                // 车辆图标始终保持0度（朝上），通过地图旋转让道路竖直
                displayHeading = 0;

                // 【简化】统一使用secondaryVerticalCheck处理所有旋转
                // 该函数内部会判断是否在转向点附近，并使用对应的角度
                secondaryVerticalCheck(displayPosition, currentSnappedIndex);
            } else {
                // ========== 未吸附到路网（偏离路线超过8米）==========
                const now = Date.now();

                // 【关键】到达起点前不进行偏离检测和重新规划
                // 避免E字型道路等场景下，用户还没到起点就被重新规划到"捷径"
                if (!hasReachedStart) {
                    console.log('[偏离检测] 尚未到达起点，跳过偏离检测');
                    // 只更新位置显示，不做偏离处理
                    NavRenderer.updateUserMarker(position, 0, true, false);
                    NavRenderer.updateAccuracyCircle(position, accuracy);
                    NavRenderer.setCenterOnly(position, true);
                    
                    isProcessingGPS = false;
                    lastGPSProcessTime = Date.now();
                    return;
                }

                // 【统一吸附】先尝试吸附KML全路网（可能用户走了其他道路）
                const kmlSnapped = snapToKMLNetwork(position);
                
                // 【次数确认机制】检查是否在12米缓冲区内
                const nearestDistance = findNearestDistanceInSet(position);

                if (nearestDistance <= SNAP_THRESHOLD_BUFFER && !isDeviationConfirmed) {
                    // 在9-12米缓冲区内，需要连续确认
                    deviationConfirmCount++;
                    console.log(`[偏离确认] 距离${nearestDistance.toFixed(1)}米（9-12米缓冲区），计数 ${deviationConfirmCount}/${DEVIATION_CONFIRM_COUNT}`);

                    if (deviationConfirmCount < DEVIATION_CONFIRM_COUNT) {
                        // 还未达到确认次数，继续显示上次吸附位置
                        displayPosition = NavRenderer.getLastSnappedPosition() || position;
                        displayHeading = 0;

                        // 更新用户标记和精度圈
                        NavRenderer.updateUserMarker(displayPosition, displayHeading, true, true);
                        NavRenderer.updateAccuracyCircle(position, accuracy);

                        // 【修复】缓冲区确认期间也需要旋转地图对齐道路
                        secondaryVerticalCheck(displayPosition, currentSnappedIndex);

                        // 【关键】提前return前必须重置处理标志
                        isProcessingGPS = false;
                        lastGPSProcessTime = Date.now();
                        return;
                    }
                    // 达到确认次数，确认偏离
                    console.log('[偏离确认] 连续5次在缓冲区内，确认偏离');
                    isDeviationConfirmed = true;
                } else if (nearestDistance > SNAP_THRESHOLD_BUFFER && !isDeviationConfirmed) {
                    // 超过12米，直接确认偏离
                    console.log(`[偏离确认] 距离${nearestDistance.toFixed(1)}米（超过12米），直接确认偏离`);
                    isDeviationConfirmed = true;
                    deviationConfirmCount = DEVIATION_CONFIRM_COUNT; // 设置为已确认
                }

                // 【新增】首次确认偏离时，保存原始绿色点集
                if (isDeviationConfirmed && !savedOriginalGreenPointSet) {
                    const currentPointSet = window.currentSegmentPointSet;
                    if (currentPointSet && currentPointSet.length > 0) {
                        savedOriginalGreenPointSet = [...currentPointSet];
                        console.log('[偏离确认] 已保存原始绿色点集，点数:', savedOriginalGreenPointSet.length);
                    }
                }

                // 【新增】偏离确认后优先检查是否到达途径点（≤12米范围内）
                // 避免在途径点附近因GPS漂移误判为偏离
                if (isDeviationConfirmed) {
                    const currentPointSet = window.currentSegmentPointSet;
                    if (currentPointSet && currentPointSet.length > 0) {
                        const endPoint = currentPointSet[currentPointSet.length - 1].position;
                        const endLng = Array.isArray(endPoint) ? endPoint[0] : endPoint.lng;
                        const endLat = Array.isArray(endPoint) ? endPoint[1] : endPoint.lat;
                        const distanceToWaypoint = haversineDistance(
                            position[1], position[0],
                            endLat, endLng
                        );
                        
                        if (distanceToWaypoint <= WAYPOINT_CHECK_DISTANCE) {
                            console.log(`[途径点检查] 距离途径点${distanceToWaypoint.toFixed(1)}米，优先检查是否到达`);
                            
                            // 检查是否满足到达条件
                            if (distanceToWaypoint <= WAYPOINT_ARRIVAL_DISTANCE) {
                                console.log(`[途径点检查] ✓ 距离≤${WAYPOINT_ARRIVAL_DISTANCE}米，判定为到达途径点`);
                                
                                // 直接触发段完成检查
                                const segmentCompleted = checkSegmentCompletion(currentPointSet.length - 1, position);
                                if (segmentCompleted) {
                                    // 重置偏离状态
                                    deviationConfirmCount = 0;
                                    isDeviationConfirmed = false;
                                    hasAnnouncedDeviation = false;
                                    savedOriginalGreenPointSet = null;
                                    NavRenderer.endDeviation(position, true);
                                    
                                    isProcessingGPS = false;
                                    lastGPSProcessTime = Date.now();
                                    return;
                                }
                            }
                        }
                    }
                }

                // 已确认偏离，进入偏离处理逻辑
                console.log('[点集吸附] 已确认偏离，显示真实GPS轨迹');

                // 【简化方案】偏离后持续尝试吸附KML全路网
                let replanResult = false;

                if (kmlSnapped) {
                    console.log('[KML吸附] 成功吸附到KML路网:', kmlSnapped);

                    // 【核心逻辑】使用偏离时保存的原始绿色点集判断是否回归
                    // savedOriginalGreenPointSet 在首次确认偏离时保存，始终代表偏离前的绿色路线
                    if (savedOriginalGreenPointSet && savedOriginalGreenPointSet.length > 0) {
                        const rejoinCheck = checkRejoinOriginalRoute(kmlSnapped, savedOriginalGreenPointSet);

                        if (rejoinCheck.rejoined) {
                            // ========== 回归原路线 ==========
                            console.log('[KML吸附] ✓ 吸附点在原始绿色点集上，判定为回归原路线');

                            // 恢复原始绿色路线点集
                            window.currentSegmentPointSet = savedOriginalGreenPointSet;

                            // 重新计算转向点
                            const restoredTurningPoints = detectTurningPoints(savedOriginalGreenPointSet, 30);
                            window.currentSegmentTurningPoints = restoredTurningPoints;

                            // 重新绘制原始绿色路线
                            const originalPath = savedOriginalGreenPointSet.map(p => p.position);
                            NavRenderer.drawRoute(originalPath);

                            // 更新吸附索引
                            currentSnappedIndex = rejoinCheck.index;
                            lastSnappedIndex = rejoinCheck.index - 1;

                            // 重置所有偏离相关状态
                            deviationConfirmCount = 0;
                            isDeviationConfirmed = false;
                            hasAnnouncedDeviation = false;
                            savedOriginalGreenPointSet = null; // 清除保存的点集
                            NavRenderer.endDeviation(kmlSnapped, true);

                            // 重置转向点提示状态
                            lastTurningPointIndex = -1;
                            nextTurningPointIndex = -1;
                            hasPrompted1_4 = false;
                            hasPromptedBefore = false;

                            // 重置TTS抑制状态
                            if (typeof NavTTS !== 'undefined' && NavTTS.resetSuppression) {
                                NavTTS.resetSuppression();
                            }

                            // 播报"已回到规划路线"
                            NavTTS.speak('已回到规划路线', { force: true });

                            // 更新显示位置
                            displayPosition = kmlSnapped;
                            displayHeading = 0;

                            // 更新导航提示
                            updateNavigationGuidance(currentSnappedIndex, kmlSnapped);

                            replanResult = true;
                        } else {
                            // ========== 不在原始绿色点集上，需要重新规划 ==========
                            console.log('[KML吸附] × 吸附点不在原始绿色点集上，需要重新规划');

                            // 检查是否需要重新规划（带2秒防抖）
                            if (now - lastReplanTime > 2000) {
                                console.log('[KML吸附] 开始重新规划到当前段终点...');
                                replanResult = replanRouteFromPosition(kmlSnapped);
                                lastReplanTime = now;

                                if (replanResult) {
                                    console.log('[KML吸附] ✓ 重新规划成功');

                                    // 重置所有偏离相关状态
                                    deviationConfirmCount = 0;
                                    isDeviationConfirmed = false;
                                    hasAnnouncedDeviation = false;
                                    savedOriginalGreenPointSet = null; // 清除原始点集，不需要回归
                                    NavRenderer.endDeviation(kmlSnapped, true);

                                    if (typeof NavTTS !== 'undefined' && NavTTS.resetSuppression) {
                                        NavTTS.resetSuppression();
                                    }

                                    NavTTS.speak('已重新规划路线', { force: true });

                                    displayPosition = kmlSnapped;
                                    displayHeading = 0;
                                    updateNavigationGuidance(0, kmlSnapped);
                                } else {
                                    console.log('[KML吸附] × 重新规划失败，继续偏离状态');
                                }
                            } else {
                                console.log('[KML吸附] 跳过重新规划（距上次<2秒，防抖中）');
                                displayPosition = kmlSnapped;
                                displayHeading = 0;
                            }
                        }
                    } else {
                        console.warn('[KML吸附] 没有保存的原始绿色点集，无法判断回归');
                    }
                } else {
                    console.log('[KML吸附] 无法吸附到KML路网，继续显示偏离轨迹');
                }

                if (!replanResult) {
                    // 未能重新规划，继续偏离状态
                    // 获取最后吸附位置作为偏离起点
                    const lastSnappedPos = NavRenderer.getLastSnappedPosition();

                    if (lastSnappedPos) {
                        // 启动偏离轨迹（如果尚未启动）
                        if (!NavRenderer.isDeviated()) {
                            NavRenderer.startDeviation(lastSnappedPos);
                            console.log('[NavCore] 开始偏离轨迹，起点:', lastSnappedPos);
                            
                            // 首次进入偏离状态时播报
                            if (!hasAnnouncedDeviation) {
                                NavTTS.speak('您已偏离规划路线', { force: true });
                                hasAnnouncedDeviation = true;
                            }
                        }

                        // 【偏离轨迹吸附】尝试将GPS位置吸附到KML路网上
                        const snappedDeviationPos = snapToKMLNetwork(position);
                        const deviationDisplayPos = snappedDeviationPos || position;
                        
                        // 更新偏离轨迹（使用吸附后的位置绘制黄色线）
                        NavRenderer.updateDeviationLine(deviationDisplayPos);
                        
                        // 显示位置（优先使用吸附位置）
                        displayPosition = deviationDisplayPos;
                        displayHeading = gpsHeading;
                    } else {
                        // 没有最后吸附位置，使用GPS原始位置
                        displayPosition = position;
                        displayHeading = gpsHeading;
                    }

                    // 地图跟随显示位置移动
                    NavRenderer.setCenterOnly(displayPosition, true);

                    // 更新导航提示：提示偏离路线
                    if (typeof NavUI !== 'undefined' && NavUI.updateNavigationTip) {
                        NavUI.updateNavigationTip({
                            type: 'deviation',
                            action: '偏离路线',
                            distance: 0,
                            message: '您已偏离规划路线'
                        });
                    }
                }
            }

            // 5. 更新用户位置标记（已到达起点后）
            NavRenderer.updateUserMarker(displayPosition, displayHeading, true, true);

            // 6. 更新精度圈（始终使用GPS原始位置）
            NavRenderer.updateAccuracyCircle(position, accuracy);

            // 记录位置变化（用于心跳检测）
            if (!lastDisplayPosition || 
                Math.abs(displayPosition[0] - lastDisplayPosition[0]) > 0.00001 ||
                Math.abs(displayPosition[1] - lastDisplayPosition[1]) > 0.00001) {
                lastDisplayPosition = displayPosition;
                lastPositionChangeTime = Date.now();
            }

            // 标记处理完成
            isProcessingGPS = false;
            lastGPSProcessTime = Date.now();

        } catch (e) {
            console.error('[NavCore] GPS更新处理失败:', e);
            // 异常时也要重置处理标志，避免卡死
            isProcessingGPS = false;
            lastGPSProcessTime = Date.now();
        }
    }

    /**
     * GPS错误回调
     * @param {Error} error
     */
    function onGPSError(error) {
        console.error('[NavCore] GPS错误:', error);
        // 可以在UI上显示错误提示
    }

    /**
     * 完成导航
     */
    function completeNavigation() {
        try {
            console.log('[NavCore] 导航完成！');

            // 计算导航统计数据
            const navigationEndTime = Date.now();
            const totalTime = navigationStartTime ? (navigationEndTime - navigationStartTime) / 1000 : 0; // 秒

            console.log('[NavCore] 导航统计:');
            console.log(`  总行程: ${totalTravelDistance.toFixed(1)}米`);
            console.log(`  总时间: ${Math.ceil(totalTime)}秒 (${Math.ceil(totalTime/60)}分钟)`);

            stopNavigation();

            // 语音提示
            NavTTS.speak('您已到达目的地，导航结束', { force: true });

            // 显示完成弹窗（传递统计数据）
            if (typeof NavUI !== 'undefined' && NavUI.showNavigationCompleteModal) {
                NavUI.showNavigationCompleteModal({
                    distance: totalTravelDistance,  // 米
                    time: totalTime  // 秒
                });
            }
        } catch (e) {
            console.error('[NavCore] 完成导航失败:', e);
        }
    }

    /**
     * 启动定时更新
     */
    function startUpdateTimer() {
        if (updateTimer) return;

        updateTimer = setInterval(() => {
            if (!isNavigating) {
                stopUpdateTimer();
                return;
            }

            // 定期更新UI（如剩余时间等）
            // 暂时留空，后续UI模块可能需要
        }, 1000); // 每秒更新
    }

    /**
     * 停止定时更新
     */
    function stopUpdateTimer() {
        if (updateTimer) {
            clearInterval(updateTimer);
            updateTimer = null;
        }
    }

    /**
     * 启动心跳检测（检测GPS处理是否卡死）
     */
    function startHeartbeatChecker() {
        if (heartbeatCheckerId !== null) {
            clearInterval(heartbeatCheckerId);
        }

        heartbeatCheckerId = setInterval(() => {
            const now = Date.now();

            // 【启动超时检测】如果正在启动导航但超过15秒还没完成，说明启动过程卡死
            if (isStartingNavigation && !isNavigating) {
                const startingDuration = now - navigationStartingTime;
                if (startingDuration > 15000) {
                    console.error('[心跳检测] 导航启动超时（超过15秒），强制重置状态');
                    isStartingNavigation = false;
                    // 提示用户
                    try {
                        NavTTS.speak('导航启动超时，请重试', { force: true });
                    } catch (e) {}
                    // 停止心跳检测
                    stopHeartbeatChecker();
                    return;
                }
                // 启动过程中，每3秒输出一次进度
                if (startingDuration > 3000 && startingDuration % 3000 < 2000) {
                    console.log(`[心跳检测] 导航启动中... 已耗时${(startingDuration / 1000).toFixed(1)}秒`);
                }
                return;
            }

            if (!isNavigating) return;

            // 检查GPS处理是否超时
            if (isProcessingGPS && (now - gpsProcessStartTime > GPS_TIMEOUT)) {
                console.warn('[心跳检测] GPS处理超时，强制重置状态');
                isProcessingGPS = false;
                lastGPSProcessTime = now;

                // 尝试重新获取GPS位置
                try {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const converted = NavGPS.convertCoordinates(
                                pos.coords.longitude,
                                pos.coords.latitude
                            );
                            console.log('[心跳检测] GPS位置恢复:', converted);
                            // 重置状态，确保onGPSUpdate能执行
                            lastGPSProcessTime = 0;
                            isProcessingGPS = false;
                            onGPSUpdate(converted, pos.coords.accuracy || 10, pos.coords.heading || 0);
                        },
                        (err) => {
                            console.warn('[心跳检测] GPS恢复失败:', err.message);
                        },
                        { enableHighAccuracy: true, timeout: 3000, maximumAge: 0 }
                    );
                } catch (e) {
                    console.error('[心跳检测] 恢复GPS失败:', e);
                }
            }

            // 检查GPS是否长时间没有更新（超过5秒）
            if (lastGPSProcessTime > 0 && (now - lastGPSProcessTime > 5000)) {
                console.warn('[心跳检测] GPS长时间未更新（超过5秒），尝试重新获取');
                // 重置处理标志，允许新的GPS更新
                isProcessingGPS = false;
                // 更新时间戳，避免重复触发（5秒内不再重复）
                lastGPSProcessTime = now; // 重置为当前时间
                // 确保GPS监听正常
                if (NavGPS && typeof NavGPS.ensureWatching === 'function') {
                    NavGPS.ensureWatching();
                }
                // 主动获取一次GPS位置
                try {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const converted = NavGPS.convertCoordinates(
                                pos.coords.longitude,
                                pos.coords.latitude
                            );
                            console.log('[心跳检测] GPS位置刷新成功:', converted);
                            // 重置状态，确保onGPSUpdate能执行
                            lastGPSProcessTime = 0;
                            isProcessingGPS = false;
                            onGPSUpdate(converted, pos.coords.accuracy || 10, pos.coords.heading || 0);
                        },
                        (err) => {
                            console.warn('[心跳检测] GPS刷新失败:', err.message);
                        },
                        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                    );
                } catch (e) {
                    console.error('[心跳检测] GPS刷新异常:', e);
                }
            }

            // 【新增】检查是否从未收到GPS更新（导航启动后5秒内没有任何GPS更新）
            if (lastGPSProcessTime === 0 && isNavigating && navigationStartingTime > 0 && (now - navigationStartingTime > 5000)) {
                console.warn('[心跳检测] 导航启动后5秒内未收到GPS更新，尝试重新获取');
                // 重置处理标志
                isProcessingGPS = false;
                // 设置一个临时值，避免重复触发（5秒内不再重复）
                navigationStartingTime = now;
                // 主动获取一次GPS位置
                try {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const converted = NavGPS.convertCoordinates(
                                pos.coords.longitude,
                                pos.coords.latitude
                            );
                            console.log('[心跳检测] 首次GPS位置获取成功:', converted);
                            // 重置状态，确保onGPSUpdate能执行
                            lastGPSProcessTime = 0;
                            isProcessingGPS = false;
                            onGPSUpdate(converted, pos.coords.accuracy || 10, pos.coords.heading || 0);
                        },
                        (err) => {
                            console.warn('[心跳检测] 首次GPS获取失败:', err.message);
                        },
                        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                    );
                } catch (e) {
                    console.error('[心跳检测] 首次GPS获取异常:', e);
                }
            }

            // 【新增】检查位置是否长时间没有变化（超过8秒位置不变，可能是卡死）
            if (lastPositionChangeTime > 0 && (now - lastPositionChangeTime > 8000)) {
                console.warn('[心跳检测] 位置长时间未变化（超过8秒），尝试刷新');
                // 重置处理标志
                isProcessingGPS = false;
                // 重置NavGPS的历史记录，避免被过滤
                if (NavGPS && typeof NavGPS.clearHistory === 'function') {
                    NavGPS.clearHistory();
                }
                // 主动获取一次GPS位置
                try {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            const converted = NavGPS.convertCoordinates(
                                pos.coords.longitude,
                                pos.coords.latitude
                            );
                            console.log('[心跳检测] 位置刷新成功:', converted);
                            // 强制更新位置
                            lastPositionChangeTime = Date.now(); // 重置时间，避免重复触发
                            // 重置状态，确保onGPSUpdate能执行
                            lastGPSProcessTime = 0;
                            isProcessingGPS = false;
                            onGPSUpdate(converted, pos.coords.accuracy || 10, pos.coords.heading || 0);
                        },
                        (err) => {
                            console.warn('[心跳检测] 位置刷新失败:', err.message);
                            lastPositionChangeTime = now; // 重置时间，避免重复触发
                        },
                        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                    );
                } catch (e) {
                    console.error('[心跳检测] 位置刷新异常:', e);
                    lastPositionChangeTime = now;
                }
            }
        }, 2000); // 每2秒检查一次

        console.log('[NavCore] 心跳检测已启动');
    }

    /**
     * 停止心跳检测
     */
    function stopHeartbeatChecker() {
        if (heartbeatCheckerId !== null) {
            clearInterval(heartbeatCheckerId);
            heartbeatCheckerId = null;
            console.log('[NavCore] 心跳检测已停止');
        }
    }

    /**
     * 获取导航状态
     * @returns {Object}
     */
    function getStatus() {
        return {
            isNavigating: isNavigating,
            hasRoute: navigationPath.length > 0,
            pathLength: navigationPath.length,
            currentTarget: NavGuidance.getCurrentTarget(),
            gpsStatus: NavGPS.getStatus(),
            ttsStatus: NavTTS.getStatus()
        };
    }

    /**
     * 清理资源
     */
    function cleanup() {
        try {
            stopNavigation();
            NavRenderer.destroy();
            NavGPS.stopWatch();
            NavTTS.stop();

            isNavigating = false;
            navigationPath = [];
            routeData = null;

            console.log('[NavCore] 资源已清理');
        } catch (e) {
            console.error('[NavCore] 清理资源失败:', e);
        }
    }

    /**
     * 获取当前速度
     * @returns {number} 当前速度（m/s）
     */
    function getCurrentSpeed() {
        return currentSpeed;
    }

    // 公开API
    return {
        init,
        startNavigation,
        stopNavigation,
        getStatus,
        cleanup,
        getRouteData: () => routeData,
        getNavigationPath: () => navigationPath,
        getCurrentSpeed,
        onGPSUpdate  // 暴露给虚拟GPS使用
    };
})();

window.NavCore = NavCore;

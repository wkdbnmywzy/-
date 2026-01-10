/**
 * nav-ui.js
 * UI事件处理模块
 * 负责所有UI交互、事件监听、模态框控制
 */

const NavUI = (function() {
    'use strict';

    /**
     * 初始化UI事件
     */
    function init() {
        try {
            console.log('[NavUI] 初始化UI事件...');

            // 绑定开始导航按钮
            bindStartNavigationButton();

            // 绑定路线规划相关按钮
            bindRoutePlanningButtons();

            // 绑定退出/完成按钮
            bindExitButtons();

            // 绑定底部导航栏
            bindBottomNavigation();

            // 绑定键盘快捷键
            bindKeyboardShortcuts();

            console.log('[NavUI] UI事件初始化完成');
            return true;
        } catch (e) {
            console.error('[NavUI] UI初始化失败:', e);
            return false;
        }
    }

    /**
     * 绑定开始导航按钮
     */
    function bindStartNavigationButton() {
        const startBtn = document.getElementById('start-navigation-btn');
        if (startBtn) {
            startBtn.addEventListener('click', async function() {
                console.log('[NavUI] 点击开始导航');

                // 禁用按钮,防止重复点击
                startBtn.disabled = true;
                const originalText = startBtn.textContent;
                startBtn.textContent = '正在启动...';

                try {
                    // 启动导航核心(异步,会检查GPS权限)
                    const success = await NavCore.startNavigation();

                    if (success) {
                        // 显示提示卡片
                        showTipCard();

                        // 切换底部卡片为导航状态
                        const navigationCard = document.getElementById('navigation-card');
                        if (navigationCard) {
                            navigationCard.classList.add('navigating');
                        }
                    } else {
                        // 启动失败,恢复按钮
                        startBtn.disabled = false;
                        startBtn.textContent = originalText;
                    }
                } catch (e) {
                    console.error('[NavUI] 启动导航异常:', e);
                    startBtn.disabled = false;
                    startBtn.textContent = originalText;
                    alert('启动导航失败,请重试');
                }
            });
            console.log('[NavUI] ✓ 开始导航按钮已绑定');
        }
    }

    /**
     * 绑定路线规划按钮
     */
    function bindRoutePlanningButtons() {
        // 起点输入框点击
        const startInput = document.getElementById('nav-start-location');
        if (startInput) {
            startInput.addEventListener('click', function() {
                console.log('[NavUI] 点击起点输入框');
                navigateToPointSelection('start');
            });
        }

        // 终点输入框点击
        const endInput = document.getElementById('nav-end-location');
        if (endInput) {
            endInput.addEventListener('click', function() {
                console.log('[NavUI] 点击终点输入框');
                navigateToPointSelection('end');
            });
        }

        // 添加途经点按钮
        const addWaypointBtn = document.getElementById('nav-add-waypoint-btn');
        if (addWaypointBtn) {
            addWaypointBtn.addEventListener('click', function() {
                console.log('[NavUI] 点击添加途经点');

                // 检查途经点数量
                const waypointsContainer = document.getElementById('nav-waypoints-container');
                let currentCount = 0;
                if (waypointsContainer) {
                    currentCount = waypointsContainer.querySelectorAll('.waypoint-input').length;
                }

                if (currentCount >= 5) {
                    alert('最多只能添加 5 个途经点');
                    return;
                }

                navigateToPointSelection('waypoint');
            });
        }

        // 交换起终点按钮
        const swapBtn = document.getElementById('nav-swap-btn');
        if (swapBtn) {
            swapBtn.addEventListener('click', function() {
                console.log('[NavUI] 点击交换起终点');
                swapStartAndEnd();
            });
        }

        console.log('[NavUI] ✓ 路线规划按钮已绑定');
    }

    /**
     * 绑定退出/完成按钮
     */
    function bindExitButtons() {
        // 底部卡片关闭按钮
        const closeBtn = document.getElementById('destination-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                console.log('[NavUI] 点击关闭导航');
                showExitNavigationModal();
            });
        }

        // 退出导航-取消
        const exitCancelBtn = document.getElementById('exit-cancel-btn');
        if (exitCancelBtn) {
            exitCancelBtn.addEventListener('click', function() {
                hideExitNavigationModal();
            });
        }

        // 退出导航-确认
        const exitConfirmBtn = document.getElementById('exit-confirm-btn');
        if (exitConfirmBtn) {
            exitConfirmBtn.addEventListener('click', function() {
                hideExitNavigationModal();
                NavCore.stopNavigation();

                // 隐藏提示卡片
                hideTipCard();

                // 恢复底部卡片状态
                const navigationCard = document.getElementById('navigation-card');
                if (navigationCard) {
                    navigationCard.classList.remove('navigating');
                }

                // 保存地图状态并返回首页
                saveNavigationMapState();
                window.location.href = 'index.html';
            });
        }

        // 导航完成-返回首页
        const completeFinishBtn = document.getElementById('complete-finish-btn');
        if (completeFinishBtn) {
            completeFinishBtn.addEventListener('click', function() {
                hideNavigationCompleteModal();
                saveNavigationMapState();
                window.location.href = 'index.html';
            });
        }

        console.log('[NavUI] ✓ 退出/完成按钮已绑定');
    }

    /**
     * 绑定底部导航栏
     */
    function bindBottomNavigation() {
        // 这里可以绑定底部导航栏的事件
        // 如果有的话
        console.log('[NavUI] ✓ 底部导航栏已绑定');
    }

    /**
     * 绑定键盘快捷键
     */
    function bindKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // 按 C 键模拟导航完成（测试用）
            if (e.key === 'c' || e.key === 'C') {
                const status = NavCore.getStatus();
                if (status.isNavigating) {
                    console.log('[NavUI] 键盘快捷键：模拟导航完成');
                    showNavigationCompleteModal();
                }
            }
        });
        console.log('[NavUI] ✓ 键盘快捷键已绑定');
    }

    // ========== UI操作函数 ==========

    /**
     * 跳转到点位选择页面
     * @param {string} type - 'start' | 'end' | 'waypoint'
     */
    function navigateToPointSelection(type) {
        try {
            // 获取当前路线数据
            const startInput = document.getElementById('nav-start-location');
            const endInput = document.getElementById('nav-end-location');
            const waypointsContainer = document.getElementById('nav-waypoints-container');

            const startValue = startInput ? startInput.value : '';
            const endValue = endInput ? endInput.value : '';

            const waypoints = [];
            if (waypointsContainer) {
                const waypointTexts = waypointsContainer.querySelectorAll('.waypoint-text');
                waypointTexts.forEach(textEl => {
                    const text = textEl.textContent.trim();
                    if (text) {
                        waypoints.push(text);
                    }
                });
            }
            console.log('[NavUI] 收集到的途径点:', waypoints);

            // 构建路线数据
            const data = {
                startLocation: startValue,
                endLocation: endValue,
                waypoints: waypoints,
                inputType: type
            };

            if (type === 'waypoint') {
                data.autoAddWaypoint = true;
            } else {
                data.activeInput = type === 'start' ? 'nav-start-location' : 'nav-end-location';
            }

            console.log('[NavUI] 保存路线规划数据:', data);

            // 保存到 sessionStorage
            NavDataStore.setRoutePlanningData(data);
            NavDataStore.setPointSelectionReferrer('navigation.html');

            // 跳转
            window.location.href = 'point-selection.html';
        } catch (e) {
            console.error('[NavUI] 跳转到点位选择页面失败:', e);
        }
    }

    /**
     * 交换起点和终点
     */
    function swapStartAndEnd() {
        try {
            const startInput = document.getElementById('nav-start-location');
            const endInput = document.getElementById('nav-end-location');

            if (!startInput || !endInput) return;

            const temp = startInput.value;
            startInput.value = endInput.value;
            endInput.value = temp;

            // 更新路线数据
            const routeData = NavCore.getRouteData();
            if (routeData) {
                const tempData = routeData.start;
                routeData.start = routeData.end;
                routeData.end = tempData;

                NavDataStore.setRoute(routeData);
            }

            // 重新规划路线（需要核心模块支持）
            console.log('[NavUI] 起终点已交换');
        } catch (e) {
            console.error('[NavUI] 交换起终点失败:', e);
        }
    }

    /**
     * 显示导航提示卡片
     */
    function showTipCard() {
        const tipCard = document.getElementById('navigation-tip-card');
        if (tipCard) {
            tipCard.classList.add('active');
        }
    }

    /**
     * 隐藏导航提示卡片
     */
    function hideTipCard() {
        const tipCard = document.getElementById('navigation-tip-card');
        if (tipCard) {
            tipCard.classList.remove('active');
        }
    }

    /**
     * 更新导航提示卡片内容
     * @param {Object} guidance - 提示信息 { type, action, distance, message }
     */
    // 格式化距离：当 >=1000米时按公里显示，保留1位小数并四舍五入；否则按米显示（四舍五入）
    function formatDistanceForUI(meters) {
        try {
            if (typeof meters !== 'number' || !isFinite(meters)) return { text: '-', unit: '' };
            if (Math.abs(meters) >= 1000) {
                return { text: (meters / 1000).toFixed(1), unit: '公里' };
            } else {
                return { text: Math.round(meters).toString(), unit: '米' };
            }
        } catch (e) {
            return { text: '-', unit: '' };
        }
    }

    function updateNavigationTip(guidance) {
        try {
            // 更新转向图标
            const directionImg = document.getElementById('tip-direction-img');
            if (directionImg) {
                const iconMap = {
                    'left': 'images/工地数字导航小程序切图/司机/2X/导航/左转.png',
                    'right': 'images/工地数字导航小程序切图/司机/2X/导航/右转.png',
                    'uturn': 'images/工地数字导航小程序切图/司机/2X/导航/掉头.png',
                    'straight': 'images/工地数字导航小程序切图/司机/2X/导航/直行.png'
                };
                directionImg.src = iconMap[guidance.type] || iconMap['straight'];
                directionImg.alt = guidance.action;
            }

            // 更新距离（支持米/公里自动单位）
            const distanceAhead = document.getElementById('tip-distance-ahead');
            const distanceUnitEl = document.querySelector('.tip-distance-unit');
            if (distanceAhead) {
                const formatted = formatDistanceForUI(typeof guidance.distance === 'number' ? guidance.distance : Number(guidance.distance));
                distanceAhead.textContent = formatted.text;
                if (distanceUnitEl) {
                    // 单位位置为“米后/公里后”，保留后缀“后”以符合页面文案
                    distanceUnitEl.textContent = `${formatted.unit}后`;
                }
            }

            // 更新动作文本
            const actionText = document.getElementById('tip-action-text');
            if (actionText) {
                actionText.textContent = guidance.action;
            }

            // 更新当前段的剩余距离和时间
            updateSegmentRemaining();

        } catch (e) {
            console.error('[NavUI] 更新导航提示失败:', e);
        }
    }

    /**
     * 更新当前段的剩余距离和时间（上方提示栏小字）
     */
    function updateSegmentRemaining() {
        try {
            const pointSet = window.currentSegmentPointSet;
            const currentIndex = window.currentSnappedIndex || 0;
            const segmentRanges = window.segmentRanges || [];
            const currentSegmentIndex = window.currentSegmentIndex || 0;
            const hasReachedStart = window.hasReachedStart || false;

            if (!pointSet || pointSet.length === 0) return;

            // 确定当前段的目标名称
            let targetLabel = '剩余';
            let remainingDistance = 0;
            const routeData = NavDataStore.getRoute();
            
            if (!hasReachedStart) {
                // 未到达起点，使用到起点的实际距离
                targetLabel = '距离起点';
                
                // 从全局变量获取到起点的距离（由nav-core计算）
                if (typeof window.distanceToStart !== 'undefined') {
                    remainingDistance = window.distanceToStart;
                } else {
                    // 降级：计算当前位置到起点的直线距离
                    const currentPos = NavDataStore.getCurrentPosition();
                    if (currentPos && routeData && routeData.start && routeData.start.position) {
                        const startPos = routeData.start.position;
                        const lat1 = currentPos[1];
                        const lng1 = currentPos[0];
                        const lat2 = startPos[1];
                        const lng2 = startPos[0];
                        
                        const R = 6371000;
                        const dLat = (lat2 - lat1) * Math.PI / 180;
                        const dLng = (lng2 - lng1) * Math.PI / 180;
                        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                        remainingDistance = R * c;
                    }
                }
            } else {
                // 已到达起点，根据当前段确定目标
                const isLastSegment = currentSegmentIndex === segmentRanges.length - 1;
                const hasWaypoints = routeData && routeData.waypoints && Array.isArray(routeData.waypoints) && routeData.waypoints.length > 0;
                
                if (!hasWaypoints || isLastSegment) {
                    // 没有途径点，或者是最后一段
                    targetLabel = '距离终点';
                } else {
                    // 有途径点且不是最后一段
                    const waypointIndex = currentSegmentIndex;
                    targetLabel = `距离途径点${waypointIndex + 1}`;
                }
                
                // 计算当前段剩余距离
                for (let i = currentIndex; i < pointSet.length - 1; i++) {
                    const p1 = pointSet[i].position;
                    const p2 = pointSet[i + 1].position;
                    const lat1 = Array.isArray(p1) ? p1[1] : p1.lat;
                    const lng1 = Array.isArray(p1) ? p1[0] : p1.lng;
                    const lat2 = Array.isArray(p2) ? p2[1] : p2.lat;
                    const lng2 = Array.isArray(p2) ? p2[0] : p2.lng;

                    // Haversine公式
                    const R = 6371000;
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLng = (lng2 - lng1) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                              Math.sin(dLng / 2) * Math.sin(dLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    remainingDistance += R * c;
                }
            }

            // 获取当前动态速度（导航开始后会根据实际移动速度动态调整）
            const currentSpeed = (typeof NavCore !== 'undefined' && NavCore.getCurrentSpeed)
                ? NavCore.getCurrentSpeed()
                : 8.33; // 未开始导航时使用默认8.33m/s（30km/h）

            // 计算预计时间（使用动态速度），防止速度为0导致Infinity
            const speedForCalc = Math.max(0.2, currentSpeed);
            const remainingTime = Math.ceil(remainingDistance / speedForCalc / 60); // 分钟

            // 更新目标标签
            const remainingLabelEl = document.getElementById('tip-remaining-label');
            if (remainingLabelEl) {
                remainingLabelEl.textContent = targetLabel;
            }

            // 更新UI
            const remainingDistanceEl = document.getElementById('tip-remaining-distance');
            const remainingUnitEl = document.getElementById('tip-remaining-unit');
            const remainingTimeEl = document.getElementById('tip-estimated-time');

            if (remainingDistanceEl) {
                if (remainingDistance >= 1000) {
                    remainingDistanceEl.textContent = (remainingDistance / 1000).toFixed(1);
                    if (remainingUnitEl) remainingUnitEl.textContent = '公里';
                } else {
                    remainingDistanceEl.textContent = Math.round(remainingDistance);
                    if (remainingUnitEl) remainingUnitEl.textContent = '米';
                }
            }

            if (remainingTimeEl) {
                remainingTimeEl.textContent = remainingTime;
            }

            // 同时更新下方卡片的总距离和时间（到终点）
            updateTotalToDestination(currentIndex);

        } catch (e) {
            console.error('[NavUI] 更新段剩余距离/时间失败:', e);
        }
    }

    /**
     * 更新到终点的总距离和时间（下方卡片）
     * @param {number} currentIndex - 当前点索引（段内相对索引）
     */
    function updateTotalToDestination(currentIndex) {
        try {
            // 获取当前路线数据
            const routeData = NavDataStore.getRoute();
            if (!routeData || !routeData.end) return;

            // 计算总距离：当前段剩余 + 后续所有段
            let totalDistance = 0;

            // 1. 当前段剩余距离
            const currentSegmentPointSet = window.currentSegmentPointSet;
            if (currentSegmentPointSet) {
                for (let i = currentIndex; i < currentSegmentPointSet.length - 1; i++) {
                    const p1 = currentSegmentPointSet[i].position;
                    const p2 = currentSegmentPointSet[i + 1].position;
                    totalDistance += haversineDistance(p1, p2);
                }
            }

            // 2. 后续所有段的距离
            const fullPointSet = window.navigationPointSet;
            const segmentRanges = window.segmentRanges || [];
            const currentSegmentIndex = window.currentSegmentIndex || 0;

            if (fullPointSet && segmentRanges.length > 0) {
                // 遍历后续段
                for (let segIdx = currentSegmentIndex + 1; segIdx < segmentRanges.length; segIdx++) {
                    const segment = segmentRanges[segIdx];
                    for (let i = segment.start; i < segment.end && i < fullPointSet.length - 1; i++) {
                        const p1 = fullPointSet[i].position;
                        const p2 = fullPointSet[i + 1].position;
                        totalDistance += haversineDistance(p1, p2);
                    }
                }
            }

            // 获取当前动态速度（导航开始后会根据实际移动速度动态调整）
            const currentSpeed = (typeof NavCore !== 'undefined' && NavCore.getCurrentSpeed)
                ? NavCore.getCurrentSpeed()
                : 8.33; // 未开始导航时使用默认8.33m/s（30km/h）

            // 计算预计时间（使用动态速度）
            const totalTime = Math.ceil(totalDistance / currentSpeed / 60); // 分钟

            // 更新下方卡片UI
            const destDistanceEl = document.getElementById('destination-distance');
            const destTimeEl = document.getElementById('destination-time');
            const destNameEl = document.getElementById('destination-name');

            if (destNameEl && routeData.end.name) {
                destNameEl.textContent = routeData.end.name;
            }

            if (destDistanceEl) {
                if (totalDistance >= 1000) {
                    destDistanceEl.textContent = (totalDistance / 1000).toFixed(1);
                    // 更新单位为"公里"
                    const unitEl = destDistanceEl.nextElementSibling;
                    if (unitEl && unitEl.classList.contains('unit')) {
                        unitEl.textContent = '公里';
                    }
                } else {
                    destDistanceEl.textContent = Math.round(totalDistance);
                    // 更新单位为"米"
                    const unitEl = destDistanceEl.nextElementSibling;
                    if (unitEl && unitEl.classList.contains('unit')) {
                        unitEl.textContent = '米';
                    }
                }
            }

            if (destTimeEl) {
                destTimeEl.textContent = totalTime;
            }

        } catch (e) {
            console.error('[NavUI] 更新总距离/时间失败:', e);
        }
    }

    /**
     * Haversine距离计算辅助函数
     * @param {Array|Object} p1 - 点1 [lng, lat] 或 {lng, lat}
     * @param {Array|Object} p2 - 点2 [lng, lat] 或 {lng, lat}
     * @returns {number} 距离（米）
     */
    function haversineDistance(p1, p2) {
        const lat1 = Array.isArray(p1) ? p1[1] : p1.lat;
        const lng1 = Array.isArray(p1) ? p1[0] : p1.lng;
        const lat2 = Array.isArray(p2) ? p2[1] : p2.lat;
        const lng2 = Array.isArray(p2) ? p2[0] : p2.lng;

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
     * 显示退出导航确认弹窗
     */
    function showExitNavigationModal() {
        const modal = document.getElementById('exit-navigation-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    /**
     * 隐藏退出导航确认弹窗
     */
    function hideExitNavigationModal() {
        const modal = document.getElementById('exit-navigation-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * 显示导航完成弹窗
     * @param {Object} stats - 统计数据 { distance: 米, time: 秒 }
     */
    function showNavigationCompleteModal(stats = {}) {
        const modal = document.getElementById('navigation-complete-modal');
        if (modal) {
            // 获取统计数据
            const totalDistance = stats.distance || 0; // 米
            const totalTime = stats.time || 0; // 秒

            console.log('[NavUI] 显示完成弹窗，统计数据:', stats);

            // 更新弹窗内容
            const distanceElem = document.getElementById('complete-distance');
            const timeElem = document.getElementById('complete-time');
            const distanceUnitElem = distanceElem ? distanceElem.parentElement.querySelector('.complete-unit') : null;

            if (distanceElem) {
                // 距离显示：大于1000米显示公里，否则显示米
                if (totalDistance >= 1000) {
                    distanceElem.textContent = (totalDistance / 1000).toFixed(1);
                    if (distanceUnitElem) distanceUnitElem.textContent = '公里';
                } else {
                    distanceElem.textContent = Math.round(totalDistance);
                    if (distanceUnitElem) distanceUnitElem.textContent = '米';
                }
            }
            if (timeElem) {
                // 时间显示：大于60秒显示分钟，否则显示秒
                if (totalTime >= 60) {
                    timeElem.textContent = Math.ceil(totalTime / 60);
                    // 单位已经是"分钟"，不需要修改
                } else {
                    timeElem.textContent = Math.ceil(totalTime);
                    // 可以改为"秒"，但这里保持"分钟"显示0
                }
            }

            modal.classList.add('active');
        }
    }

    /**
     * 隐藏导航完成弹窗
     */
    function hideNavigationCompleteModal() {
        const modal = document.getElementById('navigation-complete-modal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * 保存地图状态（用于返回首页）
     */
    function saveNavigationMapState() {
        try {
            const map = NavRenderer.getMap();
            if (!map) return;

            const zoom = map.getZoom();
            const center = map.getCenter();

            // 计算KML边界（如果有）
            const kmlData = NavDataStore.getKMLLayers();
            let kmlBounds = null;

            if (kmlData && kmlData.length > 0) {
                const allCoords = [];
                kmlData.forEach(layer => {
                    if (layer.features) {
                        layer.features.forEach(feature => {
                            if (feature.geometry && feature.geometry.coordinates) {
                                if (feature.type === '点') {
                                    allCoords.push(feature.geometry.coordinates);
                                } else if (feature.type === '线' || feature.type === '面') {
                                    allCoords.push(...feature.geometry.coordinates);
                                }
                            }
                        });
                    }
                });

                if (allCoords.length > 0) {
                    let minLng = allCoords[0][0], maxLng = allCoords[0][0];
                    let minLat = allCoords[0][1], maxLat = allCoords[0][1];

                    allCoords.forEach(coord => {
                        minLng = Math.min(minLng, coord[0]);
                        maxLng = Math.max(maxLng, coord[0]);
                        minLat = Math.min(minLat, coord[1]);
                        maxLat = Math.max(maxLat, coord[1]);
                    });

                    kmlBounds = { minLng, maxLng, minLat, maxLat };
                }
            }

            const mapState = {
                zoom: zoom,
                center: [center.lng, center.lat],
                angle: 0,
                fromNavigation: true,
                kmlBounds: kmlBounds
            };

            NavDataStore.setMapState(mapState);
            console.log('[NavUI] 地图状态已保存');
        } catch (e) {
            console.error('[NavUI] 保存地图状态失败:', e);
        }
    }

    /**
     * 更新路线信息显示
     * @param {Object} routeInfo - { distance, time }
     */
    function updateRouteInfo(routeInfo) {
        try {
            const distanceElem = document.getElementById('route-distance');
            const timeElem = document.getElementById('route-time');

            if (distanceElem && routeInfo.distance !== undefined) {
                const distance = routeInfo.distance;
                if (distance < 1000) {
                    distanceElem.textContent = Math.round(distance);
                    const unitElem = distanceElem.nextElementSibling;
                    if (unitElem) unitElem.textContent = '米';
                } else {
                    distanceElem.textContent = (distance / 1000).toFixed(1);
                    const unitElem = distanceElem.nextElementSibling;
                    if (unitElem) unitElem.textContent = '公里';
                }
            }

            if (timeElem && routeInfo.time !== undefined) {
                const minutes = Math.ceil(routeInfo.time / 60);
                timeElem.textContent = minutes;
            }
        } catch (e) {
            console.error('[NavUI] 更新路线信息失败:', e);
        }
    }

    /**
     * 更新目的地信息显示
     * @param {Object} targetInfo - { name, type, distance, time }
     */
    function updateDestinationInfo(targetInfo) {
        try {
            const orgElem = document.getElementById('destination-org');
            const nameElem = document.getElementById('destination-name');
            const distanceElem = document.getElementById('destination-distance');
            const timeElem = document.getElementById('destination-time');

            if (orgElem && targetInfo.type) {
                const typeLabels = {
                    'start': '起点',
                    'waypoint': '途径点',
                    'end': '终点'
                };
                orgElem.textContent = typeLabels[targetInfo.type] || '目的地';
            }

            if (nameElem && targetInfo.name) {
                nameElem.textContent = targetInfo.name;
            }

            if (distanceElem && targetInfo.distance !== undefined) {
                const formatted = formatDistanceForUI(targetInfo.distance);
                distanceElem.textContent = formatted.text;
                const unitElem = document.getElementById('destination-unit');
                if (unitElem) unitElem.textContent = formatted.unit;
            }

            if (timeElem && targetInfo.time !== undefined) {
                const minutes = Math.ceil(targetInfo.time / 60);
                timeElem.textContent = minutes;
            }
        } catch (e) {
            console.error('[NavUI] 更新目的地信息失败:', e);
        }
    }

    /**
     * 恢复路线规划数据（从sessionStorage）
     */
    function restoreRoutePlanningData() {
        try {
            // 【新增】优先检查是否有任务导航数据（从任务页跳转过来）
            const taskNavDataStr = sessionStorage.getItem('taskNavigationData');
            if (taskNavDataStr) {
                console.log('[NavUI] 检测到任务导航数据，开始自动导航流程...');
                handleTaskNavigation(taskNavDataStr);
                return;
            }

            // 【修复】直接读取 point-selection.js 保存的完整路线数据
            const routeData = NavDataStore.getRoute();
            if (!routeData) {
                console.warn('[NavUI] 没有找到路线数据');
                return;
            }

            console.log('[NavUI] 恢复路线数据:', routeData);

            const startInput = document.getElementById('nav-start-location');
            const endInput = document.getElementById('nav-end-location');

            // 填充起点和终点
            if (startInput && routeData.start) {
                startInput.value = routeData.start.name || '';
            }
            if (endInput && routeData.end) {
                endInput.value = routeData.end.name || '';
            }

            // 恢复途经点
            const waypointsContainer = document.getElementById('nav-waypoints-container');
            if (routeData.waypoints && routeData.waypoints.length > 0) {
                if (waypointsContainer) {
                    waypointsContainer.innerHTML = '';
                    routeData.waypoints.forEach(waypoint => {
                        addWaypointToUI(waypoint.name || waypoint);
                    });
                }
            } else {
                // 没有途径点时，确保容器为空（以便CSS :empty生效）
                if (waypointsContainer) {
                    waypointsContainer.innerHTML = '';
                }
            }

            // 路线数据已经完整（包含坐标），无需再次转换
            console.log('[NavUI] ✓ 路线数据已恢复完成');
        } catch (e) {
            console.error('[NavUI] 恢复路线规划数据失败:', e);
        }
    }

    /**
     * 处理任务导航（从任务页跳转过来的导航请求）
     * @param {string} taskNavDataStr - 任务导航数据JSON字符串
     */
    async function handleTaskNavigation(taskNavDataStr) {
        try {
            // 1. 解析任务导航数据
            const taskNavData = JSON.parse(taskNavDataStr);
            console.log('[任务导航] 解析任务数据:', taskNavData);

            // 2. 转换为导航系统所需的路线格式
            const routeData = {
                start: {
                    name: taskNavData.startPoint.name,
                    position: [taskNavData.startPoint.lng, taskNavData.startPoint.lat],
                    isMyLocation: false
                },
                end: {
                    name: taskNavData.endPoint.name,
                    position: [taskNavData.endPoint.lng, taskNavData.endPoint.lat]
                },
                waypoints: [] // 任务导航不包含途径点
            };

            console.log('[任务导航] 转换后的路线数据:', routeData);

            // 3. 保存路线数据到NavDataStore
            NavDataStore.setRoute(routeData);

            // 4. 更新UI显示
            const startInput = document.getElementById('nav-start-location');
            const endInput = document.getElementById('nav-end-location');
            const waypointsContainer = document.getElementById('nav-waypoints-container');

            if (startInput) {
                startInput.value = routeData.start.name;
            }
            if (endInput) {
                endInput.value = routeData.end.name;
            }

            // 清空途径点容器（确保完全为空，以便CSS :empty生效）
            if (waypointsContainer) {
                waypointsContainer.innerHTML = '';
            }

            // 5. 触发路线规划（手动调用KML路线规划）
            console.log('[任务导航] 开始规划路线...');

            // 确保KML图已构建
            if (typeof buildKMLGraph === 'function' && (!window.kmlGraph || !window.kmlNodes || window.kmlNodes.length === 0)) {
                console.log('[任务导航] 构建KML图...');
                buildKMLGraph();
            }

            // 调用KML路线规划
            let routeResult = null;
            if (typeof planKMLRoute === 'function') {
                const startCoord = [taskNavData.startPoint.lng, taskNavData.startPoint.lat];
                const endCoord = [taskNavData.endPoint.lng, taskNavData.endPoint.lat];
                console.log('[任务导航] 规划路线:', { start: startCoord, end: endCoord });
                routeResult = planKMLRoute(startCoord, endCoord);

                if (routeResult && routeResult.path && routeResult.path.length >= 2) {
                    console.log('[任务导航] 路线规划成功，路径点数:', routeResult.path.length);

                    // 显示路线
                    if (typeof displayKMLRoute === 'function') {
                        displayKMLRoute(routeResult);
                    }
                } else {
                    console.error('[任务导航] 路线规划失败');
                    alert('无法规划路线，请检查起点和终点是否在道路上');
                    sessionStorage.removeItem('taskNavigationData');
                    return;
                }
            } else {
                console.error('[任务导航] 未找到路线规划函数');
                alert('路线规划功能不可用');
                sessionStorage.removeItem('taskNavigationData');
                return;
            }

            // 6. 路线规划完成，清除任务导航数据
            // 用户需要手动点击"开始导航"按钮
            console.log('[任务导航] ✓ 路线规划完成，等待用户点击"开始导航"按钮');

            // 清除任务导航数据，避免刷新时重复执行
            sessionStorage.removeItem('taskNavigationData');

        } catch (error) {
            console.error('[任务导航] 处理任务导航失败:', error);
            alert('加载任务导航失败: ' + error.message);
            // 清除无效数据
            sessionStorage.removeItem('taskNavigationData');
        }
    }

    /**
     * 添加途经点到UI
     * @param {string} waypointName
     */
    function addWaypointToUI(waypointName) {
        try {
            const waypointsContainer = document.getElementById('nav-waypoints-container');
            if (!waypointsContainer) return;

            const waypointId = 'nav-waypoint-' + Date.now();
            const waypointRow = document.createElement('div');
            waypointRow.className = 'waypoint-row';
            waypointRow.id = waypointId;
            waypointRow.innerHTML = `<span class="waypoint-text">${waypointName}</span>`;

            waypointsContainer.appendChild(waypointRow);

            console.log('[NavUI] 途经点已添加:', waypointName);
        } catch (e) {
            console.error('[NavUI] 添加途经点失败:', e);
        }
    }

    // 公开API
    return {
        init,
        showTipCard,
        hideTipCard,
        updateNavigationTip,
        showExitNavigationModal,
        hideExitNavigationModal,
        showNavigationCompleteModal,
        hideNavigationCompleteModal,
        updateRouteInfo,
        updateDestinationInfo,
        restoreRoutePlanningData,
        addWaypointToUI
    };
})();

// 导出到全局
window.NavUI = NavUI;

// 导出函数到全局（兼容旧代码）
window.showNavigationCompleteModal = NavUI.showNavigationCompleteModal;
window.hideNavigationCompleteModal = NavUI.hideNavigationCompleteModal;
window.showExitNavigationModal = NavUI.showExitNavigationModal;
window.hideExitNavigationModal = NavUI.hideExitNavigationModal;

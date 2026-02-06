/**
 * nav-renderer.js
 * 地图渲染模块
 * 负责地图初始化、路线绘制、标记管理、KML显示
 */

const NavRenderer = (function() {
    'use strict';

    const DEBUG_NAV_RENDERER = false; // 调试开关：位置与角度日志

    // 地图实例
    let map = null;

    // 地图覆盖物
    let routePolyline = null;        // 主路线（绿色）
    let routeBorderPolyline = null;  // 主路线边框（浅绿色）
    let passedPolyline = null;       // 当前段已走路线（灰色）
    let passedConnectLine = null;    // 用户位置到上一个点的灰色连接线
    let completedSegmentPolylines = [];  // 已完成路段的灰色路线数组（固化保存）
    let deviationPolyline = null;    // 当前偏移轨迹（黄色）
    let deviationHistory = [];       // 偏移轨迹历史（保存已完成的黄色线段）
    let lastSnappedPosition = null;  // 最后吸附的位置（偏移起点）
    let isCurrentlyDeviated = false; // 当前是否处于偏移状态
    let deviationGpsTrack = [];      // 偏离期间的GPS轨迹点数组
    let startMarker = null;          // 起点标记
    let endMarker = null;            // 终点标记
    let waypointMarkers = [];        // 途经点标记
    let userMarker = null;           // 用户位置标记
    let accuracyCircle = null;       // GPS精度圈
    let compassIndicator = null;     // 指北针
    let directionIndicator = null;   // 方向指示器（东南西北）
    let debugDirectionArrow = null;  // 调试用方向箭头
    let turnLabelMarkers = [];       // 转向标签标记数组

    // KML图层
    let kmlLayers = [];

    // 路线样式配置
    const ROUTE_STYLES = {
        planned: {
            strokeColor: '#00C853',
            strokeWeight: 8,         // 绿色路线宽度：8像素
            strokeOpacity: 1.0,      // 完全不透明
            zIndex: 185,             // 未走路线在下层
            borderWeight: 2,         // 边框宽度：2像素 (加宽一点)
            borderColor: '#007A33'   // 深绿色边框 (模拟阴影/立体感)
        },
        passed: {
            strokeColor: '#999999',
            strokeWeight: 8,         // 灰色路线宽度：8像素
            strokeOpacity: 1.0,      // 完全不透明（改为1.0）
            zIndex: 200              // 已走路线在上层
        },
        deviation: {
            strokeColor: '#FFA500',  // 橙黄色偏移轨迹
            strokeWeight: 6,         // 偏移线宽度：6像素
            strokeOpacity: 0.9,      // 稍微透明
            zIndex: 210              // 偏移线在最上层
        }
    };

    /**
     * 初始化地图
     * @param {string} containerId - 地图容器ID
     * @param {Object} options - 地图配置
     * @returns {AMap.Map|null}
     */
    function initMap(containerId, options = {}) {
        try {
            const defaultOptions = {
                zoom: (typeof MapConfig !== 'undefined' && MapConfig.mapConfig.zoom) ? MapConfig.mapConfig.zoom : 20,
                center: (typeof MapConfig !== 'undefined' && MapConfig.mapConfig.center) ? MapConfig.mapConfig.center : [116.397428, 39.90923],
                mapStyle: 'amap://styles/normal',
                viewMode: '2D',
                features: ['bg', 'road', 'building'],
                showLabel: true
            };

            const mapOptions = Object.assign({}, defaultOptions, options);
            map = new AMap.Map(containerId, mapOptions);

            // 将地图对象也设置到全局，供其他模块使用（如kml-route-planning.js）
            window.map = map;

            return map;
        } catch (e) {
            console.error('[NavRenderer] 地图初始化失败:', e);
            return null;
        }
    }

    /**
     * 获取地图实例
     * @returns {AMap.Map|null}
     */
    function getMap() {
        return map;
    }

    /**
     * 绘制路线（带浅绿色边框效果）
     * @param {Array} path - 路径点数组 [[lng,lat], ...]
     * @param {Object} options - 样式选项
     * @returns {AMap.Polyline|null}
     */
    function drawRoute(path, options = {}) {
        console.log('[NavRenderer] drawRoute 被调用，路径点数:', path ? path.length : 0);
        try {
            if (!map) {
                console.error('[NavRenderer] 地图未初始化');
                return null;
            }

            if (!path || path.length < 2) {
                console.error('[NavRenderer] 路径数据无效');
                return null;
            }

            // 过滤无效坐标点（NaN、null、undefined）
            const validPath = path.filter(point => {
                if (!point) return false;
                const lng = Array.isArray(point) ? point[0] : point.lng;
                const lat = Array.isArray(point) ? point[1] : point.lat;
                return lng != null && lat != null && !isNaN(lng) && !isNaN(lat);
            });

            console.log('[NavRenderer] drawRoute 有效路径点:', validPath.length);

            if (validPath.length < 2) {
                console.error('[NavRenderer] 过滤后有效路径点不足2个，原始:', path.length, '有效:', validPath.length);
                return null;
            }

            if (validPath.length !== path.length) {
                console.warn('[NavRenderer] 过滤了无效坐标点，原始:', path.length, '有效:', validPath.length);
            }

            // 清除旧路线（包括边框）
            if (routePolyline) {
                map.remove(routePolyline);
                routePolyline = null;
            }
            if (routeBorderPolyline) {
                map.remove(routeBorderPolyline);
                routeBorderPolyline = null;
            }

            // 【关键修复】检查地图容器是否已准备好
            try {
                const container = map.getContainer();
                if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
                    console.warn('[NavRenderer] 地图容器尺寸无效，延迟300ms后重试 drawRoute');
                    setTimeout(() => drawRoute(path, options), 300);
                    return null;
                }
            } catch (e) {
                console.warn('[NavRenderer] 检查地图容器失败:', e);
            }

            // 【关键修复】检查地图中心点是否有效
            try {
                const center = map.getCenter();
                if (!center || typeof center.getLng !== 'function') {
                    console.warn('[NavRenderer] 地图中心点无效，延迟300ms后重试 drawRoute');
                    setTimeout(() => drawRoute(path, options), 300);
                    return null;
                }
                const centerLng = center.getLng();
                const centerLat = center.getLat();
                if (isNaN(centerLng) || isNaN(centerLat)) {
                    console.warn('[NavRenderer] 地图中心点坐标无效，延迟300ms后重试 drawRoute');
                    setTimeout(() => drawRoute(path, options), 300);
                    return null;
                }
            } catch (e) {
                console.warn('[NavRenderer] 检查地图中心点失败:', e);
            }

            const style = Object.assign({}, ROUTE_STYLES.planned, options);

            // 1. 先绘制边框（浅绿色，更宽）
            routeBorderPolyline = new AMap.Polyline({
                path: validPath,
                strokeColor: style.borderColor || '#7FD89F',
                strokeWeight: style.strokeWeight + (style.borderWeight || 1) * 2,  // 8 + 2 = 10px
                strokeOpacity: style.strokeOpacity,
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: style.zIndex - 1  // 边框在主线下方
            });
            map.add(routeBorderPolyline);

            // 2. 再绘制主路线（绿色）
            routePolyline = new AMap.Polyline({
                path: validPath,
                strokeColor: style.strokeColor,
                strokeWeight: style.strokeWeight,
                strokeOpacity: style.strokeOpacity,
                lineJoin: 'round',
                lineCap: 'round',
                showDir: true,
                dirColor: '#FFFFFF',
                zIndex: style.zIndex
            });
            map.add(routePolyline);

            console.log('[NavRenderer] ✓ 路线已绘制到地图');

            adjustViewToPath(validPath);
            return routePolyline;
        } catch (e) {
            console.error('[NavRenderer] 绘制路线失败:', e);
            return null;
        }
    }

    /**
     * 更新已走路线（基于点集索引）
     * @param {number} currentIndex - 当前吸附的点索引
     * @param {Array} currentPosition - 当前用户位置 [lng, lat]
     */
    function updatePassedRoute(currentIndex, currentPosition) {
        try {
            if (!map) return;

            // 验证坐标辅助函数
            const isValidPos = (pos) => {
                if (!pos) return false;
                const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                const lat = Array.isArray(pos) ? pos[1] : pos.lat;
                return lng != null && lat != null && !isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat);
            };

            // 使用当前段的点集（避免跨段绘制灰色路线）
            const pointSet = window.currentSegmentPointSet;
            if (!pointSet || pointSet.length === 0) return;

            if (currentIndex >= 1) {
                const passedPath = [];
                for (let i = 0; i <= currentIndex; i++) {
                    const pos = pointSet[i]?.position;
                    if (isValidPos(pos)) {
                        passedPath.push(pos);
                    }
                }

                // 确保路径有效后再更新
                if (passedPath.length >= 2) {
                    // 使用 setPath 更新路径，避免删除重建导致的闪烁
                    if (passedPolyline) {
                        passedPolyline.setPath(passedPath);
                    } else {
                        passedPolyline = new AMap.Polyline({
                            path: passedPath,
                            strokeColor: ROUTE_STYLES.passed.strokeColor,
                            strokeWeight: ROUTE_STYLES.passed.strokeWeight,
                            strokeOpacity: ROUTE_STYLES.passed.strokeOpacity,
                            lineJoin: 'round',
                            lineCap: 'round',
                            zIndex: ROUTE_STYLES.passed.zIndex,
                            map: map
                        });
                    }
                }
            }

            // 绘制从最后点集点到当前GPS位置的连接线
            if (currentIndex >= 0 && currentPosition && isValidPos(currentPosition)) {
                const lastPoint = pointSet[currentIndex]?.position;
                if (isValidPos(lastPoint)) {
                    const connectPath = [lastPoint, currentPosition];

                    // 使用 setPath 更新连接线，避免删除重建导致的闪烁
                    if (passedConnectLine) {
                        passedConnectLine.setPath(connectPath);
                    } else {
                        passedConnectLine = new AMap.Polyline({
                            path: connectPath,
                            strokeColor: ROUTE_STYLES.passed.strokeColor,
                            strokeWeight: ROUTE_STYLES.passed.strokeWeight,
                            strokeOpacity: ROUTE_STYLES.passed.strokeOpacity,
                            lineJoin: 'round',
                            lineCap: 'round',
                            zIndex: ROUTE_STYLES.passed.zIndex,
                            map: map
                        });
                    }
                }
            }
        } catch (e) {
            console.error('[NavRenderer] 更新已走路线失败:', e);
        }
    }

    /**
     * 固化已完成路段的灰色路线（保存并降低层级到绿色之下）
     */
    function lowerCompletedSegmentZIndex() {
        try {
            if (!map) return;

            // 将当前段的灰色路线保存到已完成数组中
            if (passedPolyline) {
                // 降低层级到绿色下方（zIndex: 180）
                passedPolyline.setOptions({ zIndex: 180 });
                // 保存到数组
                completedSegmentPolylines.push(passedPolyline);
                console.log('[NavRenderer] 已完成路段灰色路线已固化，总数:', completedSegmentPolylines.length);
                // 清除当前变量引用（准备绘制下一段）
                passedPolyline = null;
            }

            if (passedConnectLine) {
                // 连接线是临时GPS位置线，直接删除，不固化保存
                map.remove(passedConnectLine);
                // 清除当前变量引用
                passedConnectLine = null;
            }
        } catch (e) {
            console.error('[NavRenderer] 固化灰色路线失败:', e);
        }
    }

    /**
     * 清除当前段的灰色路线（重新规划时使用）
     * 不影响已完成路段的灰色路线
     */
    function clearPassedRoute() {
        try {
            if (!map) return;

            // 清除当前段的灰色路线
            if (passedPolyline) {
                map.remove(passedPolyline);
                passedPolyline = null;
                console.log('[NavRenderer] 已清除当前段灰色路线');
            }

            // 清除连接线
            if (passedConnectLine) {
                map.remove(passedConnectLine);
                passedConnectLine = null;
            }
        } catch (e) {
            console.error('[NavRenderer] 清除灰色路线失败:', e);
        }
    }

    /**
     * 开启/关闭路线方向箭头
     * @param {boolean} show - 是否显示
     */
    function toggleRouteArrows(show) {
        try {
            if (!routePolyline) return;

            if (typeof routePolyline.setOptions === 'function') {
                routePolyline.setOptions({
                    showDir: show,
                    dirColor: show ? '#FFFFFF' : undefined
                });
            }
        } catch (e) {
            console.error('[NavRenderer] 切换路线箭头失败:', e);
        }
    }

    /**
     * 添加起点终点标记
     * @param {Array} startPos - 起点 [lng, lat]
     * @param {Array} endPos - 终点 [lng, lat]
     * @param {Object} routeData - 路线数据（用于判断是否为"我的位置"）
     */
    function addRouteMarkers(startPos, endPos, routeData) {
        try {
            if (!map) return;

            clearRouteMarkers();

            // 验证坐标是否有效
            const isValidPosition = (pos) => {
                if (!pos) return false;
                const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                const lat = Array.isArray(pos) ? pos[1] : pos.lat;
                return lng != null && lat != null && !isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat);
            };

            const isMyLocationStart = routeData?.start?.name === '我的位置' ||
                                     routeData?.start?.isMyLocation === true;

            if (!isMyLocationStart && startPos && isValidPosition(startPos)) {
                const startIcon = new AMap.Icon({
                    size: new AMap.Size(30, 38),
                    image: 'images/工地数字导航小程序切图/司机/2X/地图icon/起点.png',
                    imageSize: new AMap.Size(30, 38)
                });

                startMarker = new AMap.Marker({
                    position: startPos,
                    icon: startIcon,
                    offset: new AMap.Pixel(-15, -38),
                    zIndex: 100,
                    map: map,
                    title: routeData?.start?.name || '起点'
                });
            }

            if (endPos && isValidPosition(endPos)) {
                const endIcon = new AMap.Icon({
                    size: new AMap.Size(30, 38),
                    image: 'images/工地数字导航小程序切图/司机/2X/地图icon/终点.png',
                    imageSize: new AMap.Size(30, 38)
                });

                endMarker = new AMap.Marker({
                    position: endPos,
                    icon: endIcon,
                    offset: new AMap.Pixel(-15, -38),
                    zIndex: 100,
                    map: map,
                    title: routeData?.end?.name || '终点'
                });
            }
        } catch (e) {
            console.error('[NavRenderer] 添加标记失败:', e);
        }
    }

    /**
     * 添加途经点标记
     * @param {Array} waypoints - 途经点数组 [{name, position}, ...]
     */
    function addWaypointMarkers(waypoints) {
        try {
            if (!map || !waypoints || waypoints.length === 0) return;

            clearWaypointMarkers();

            // 验证坐标是否有效
            const isValidPosition = (pos) => {
                if (!pos) return false;
                const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                const lat = Array.isArray(pos) ? pos[1] : pos.lat;
                return lng != null && lat != null && !isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat);
            };

            const waypointCount = waypoints.length;

            waypoints.forEach((wp, index) => {
                const pos = resolvePosition(wp);
                if (!pos || !isValidPosition(pos)) return;

                let marker;

                if (waypointCount === 1) {
                    const content = createWaypointHTML('途径点');
                    marker = new AMap.Marker({
                        position: pos,
                        content: content.element,
                        offset: new AMap.Pixel(-content.width / 2, -34),
                        zIndex: 99,
                        map: map,
                        title: wp?.name || '途径点'
                    });
                } else {
                    const content = createWaypointHTML(`途径点${index + 1}`);
                    marker = new AMap.Marker({
                        position: pos,
                        content: content.element,
                        offset: new AMap.Pixel(-content.width / 2, -34),
                        zIndex: 99,
                        map: map,
                        title: `途径点${index + 1}: ${wp?.name || ''}`
                    });
                }

                waypointMarkers.push(marker);
            });
        } catch (e) {
            console.error('[NavRenderer] 添加途经点标记失败:', e);
        }
    }

    /**
     * 创建途经点HTML标记
     * @param {string} text - 显示文本
     * @returns {Object} { element, width, height }
     */
    function createWaypointHTML(text) {
        // 计算文字宽度
        let textWidth = 0;
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = 'bold 10px "Microsoft YaHei","SimHei",Arial,sans-serif';
            textWidth = ctx.measureText(text).width;
        } catch (e) {
            textWidth = text.length * 10 * 0.55;
        }

        const adaptiveWidth = Math.max(26, Math.ceil(textWidth) + 8);
        const baseHeight = 34;

        const div = document.createElement('div');
        div.style.cssText = `position: relative; width: ${adaptiveWidth}px; height: ${baseHeight}px;`;

        const img = document.createElement('img');
        img.src = 'images/工地数字导航小程序切图/司机/2X/地图icon/途径点1.png';
        img.style.cssText = `width: ${adaptiveWidth}px; height: ${baseHeight}px; display: block;`;

        const label = document.createElement('div');
        label.textContent = text;
        label.style.cssText = `
            position: absolute;
            top: 7px;
            left: 50%;
            transform: translateX(-50%);
            color: #FFFFFF;
            font-size: 10px;
            font-weight: bold;
            font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif;
            pointer-events: none;
            line-height: 1;
            z-index: 2;
            white-space: nowrap;
            text-shadow: 0 0 2px rgba(0,0,0,0.3);
        `;

        div.appendChild(img);
        div.appendChild(label);

        return { element: div, width: adaptiveWidth, height: baseHeight };
    }

    /**
     * 更新用户位置标记（支持平滑移动和图标切换）
     * @param {Array} position - [lng, lat]
     * @param {number} heading - 方向角（度）
     * @param {boolean} smooth - 是否平滑移动，默认true
     * @param {boolean} hasStarted - 是否已到达起点开始导航，默认false
     */
    function updateUserMarker(position, heading = 0, smooth = true, hasStarted = false) {
        try {
            if (!map) return;

            // 验证坐标是否有效
            if (!position) return;
            const lng = Array.isArray(position) ? position[0] : position.lng;
            const lat = Array.isArray(position) ? position[1] : position.lat;
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
                console.warn('[NavRenderer] updateUserMarker: 无效的坐标', position);
                return;
            }

            // 根据导航状态选择图标和尺寸
            const iconImage = hasStarted
                ? 'images/工地数字导航小程序切图/管理/2X/运输管理/临时车.png'  // 导航中：车辆图标
                : 'images/工地数字导航小程序切图/司机/2X/地图icon/我的位置.png';  // 未开始：我的位置图标

            // 图标尺寸：缩小到 0.7 倍
            // 原始尺寸：到达起点后车辆图标 39x75，未开始 42x50
            const iconSize = hasStarted
                ? new AMap.Size(39 * 0.7, 75 * 0.7)  // 27.3 x 52.5
                : new AMap.Size(42 * 0.7, 50 * 0.7); // 29.4 x 35

            // 偏移：使用宽高一半使旋转中心居中
            const iconOffset = hasStarted
                ? new AMap.Pixel(-39 * 0.7 / 2, -75 * 0.7 / 2)  // -13.65, -26.25
                : new AMap.Pixel(-42 * 0.7 / 2, -50 * 0.7 / 2); // -14.7, -17.5

            if (!userMarker) {
                // 创建用户位置标记
                console.log('[NavRenderer] 创建用户位置标记:', position, hasStarted ? '(导航中)' : '(前往起点)');

                try {
                    userMarker = new AMap.Marker({
                        position: position,
                        icon: new AMap.Icon({
                            size: iconSize,
                            image: iconImage,
                            imageSize: iconSize  // 使用相同尺寸，保持原图比例
                        }),
                        offset: iconOffset,
                        zIndex: 300,
                        map: map,
                        visible: true,  // 确保可见
                        clickable: false  // 不可点击，避免干扰地图交互
                    });
                    console.log('[NavRenderer] ✓ 用户位置标记创建成功');
                } catch (iconError) {
                    console.error('[NavRenderer] 图标创建失败，使用默认圆点:', iconError);
                    // 如果图标创建失败，使用简单的圆点标记
                    userMarker = new AMap.CircleMarker({
                        center: position,
                        radius: 10,
                        fillColor: hasStarted ? '#FF6B35' : '#007AFF',
                        fillOpacity: 1,
                        strokeColor: '#FFFFFF',
                        strokeWeight: 2,
                        zIndex: 300,
                        map: map
                    });
                    console.log('[NavRenderer] ✓ 使用圆点标记作为备用');
                }
            } else {
                // 确保标记在地图上且可见
                if (!userMarker.getMap()) {
                    console.warn('[NavRenderer] 用户标记不在地图上，重新添加');
                    userMarker.setMap(map);
                }

                // 确保标记可见
                if (typeof userMarker.show === 'function') {
                    userMarker.show();
                }

                // 更新图标（如果状态改变且是Marker类型）
                if (typeof userMarker.setIcon === 'function') {
                    const currentIcon = userMarker.getIcon();
                    // 检查是否需要切换图标（比较图标图片路径）
                    let needIconChange = false;
                    if (currentIcon) {
                        try {
                            // 尝试获取当前图标的图片URL
                            const currentImageUrl = currentIcon.getImageUrl ? currentIcon.getImageUrl() : currentIcon.image;
                            needIconChange = (currentImageUrl !== iconImage);
                        } catch (e) {
                            // 如果获取失败，默认需要更新
                            needIconChange = true;
                        }
                    } else {
                        needIconChange = true;
                    }

                    if (needIconChange) {
                        console.log('[NavRenderer] 切换位置图标:', hasStarted ? '临时车' : '我的位置');
                        try {
                            userMarker.setIcon(new AMap.Icon({
                                size: iconSize,
                                image: iconImage,
                                imageSize: iconSize  // 使用相同尺寸，保持原图比例
                            }));
                            userMarker.setOffset(iconOffset);  // 同时更新偏移量
                        } catch (iconError) {
                            console.error('[NavRenderer] 图标切换失败:', iconError);
                        }
                    }
                }

                // 更新位置（统一使用直接设置，避免 moveTo 在未加载动画插件时静默失败）
                if (typeof userMarker.setPosition === 'function') {
                    userMarker.setPosition(position);
                } else if (typeof userMarker.setCenter === 'function') {
                    userMarker.setCenter(position);
                }
            }

            // 更新方向（如果需要且支持）
            if (heading !== null && heading !== undefined && typeof userMarker.setAngle === 'function') {
                userMarker.setAngle(heading);
            }

            if (DEBUG_NAV_RENDERER) {
                console.debug('[NavRenderer] marker update', {
                    pos: position,
                    heading,
                    started: hasStarted
                });
            }

            // 更新指北针（始终显示，指向地图真北方向）
            updateDirectionIndicator(position, true);
        } catch (e) {
            console.error('[NavRenderer] 更新用户标记失败:', e);
        }
    }

    // 仅更新用户标记角度（不改变位置和图标）
    function setUserMarkerAngle(angle) {
        try {
            if (!map || !userMarker) return;
            if (angle === null || angle === undefined || isNaN(angle)) return;
            if (typeof userMarker.setAngle === 'function') {
                userMarker.setAngle(angle);
            } else if (typeof userMarker.setRotation === 'function') {
                userMarker.setRotation(angle);
            }
        } catch (e) {
            console.error('[NavRenderer] 设置用户标记角度失败:', e);
        }
    }

    /**
     * 创建指北针HTML内容（带东南西北文字）
     * @returns {string} HTML字符串
     */
    function createCompassHTML() {
        const size = 80; // 整体尺寸
        const imgSize = 50; // 图片尺寸（缩小一倍）
        const labelOffset = 32; // 文字距离中心的距离

        return `
            <div style="position:relative; width:${size}px; height:${size}px; pointer-events:none;">
                <!-- 指北针图片 -->
                <img src="images/工地数字导航小程序切图/司机/2X/导航/方向指示.png" 
                     style="position:absolute; left:${(size - imgSize) / 2}px; top:${(size - imgSize) / 2}px; width:${imgSize}px; height:${imgSize}px; opacity:0.9;">
                <!-- 北 -->
                <span style="position:absolute; left:50%; top:0; transform:translateX(-50%); font-size:10px; font-weight:bold; color:#E53935; text-shadow:0 0 2px #fff;">北</span>
                <!-- 南 -->
                <span style="position:absolute; left:50%; bottom:0; transform:translateX(-50%); font-size:10px; font-weight:bold; color:#666; text-shadow:0 0 2px #fff;">南</span>
                <!-- 东 -->
                <span style="position:absolute; right:0; top:50%; transform:translateY(-50%); font-size:10px; font-weight:bold; color:#666; text-shadow:0 0 2px #fff;">东</span>
                <!-- 西 -->
                <span style="position:absolute; left:0; top:50%; transform:translateY(-50%); font-size:10px; font-weight:bold; color:#666; text-shadow:0 0 2px #fff;">西</span>
            </div>
        `;
    }

    /**
     * 创建或更新方向指示器（指北针 - 东南西北）
     * 指北针始终指向地图的真北方向，随地图旋转而反向旋转
     * @param {Array} position - 位置 [lng, lat]
     * @param {boolean} show - 是否显示（默认始终显示）
     */
    function updateDirectionIndicator(position, show = true) {
        try {
            if (!map) return;

            // 验证坐标是否有效
            if (!position) return;
            const lng = Array.isArray(position) ? position[0] : position.lng;
            const lat = Array.isArray(position) ? position[1] : position.lat;
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
                console.warn('[NavRenderer] updateDirectionIndicator: 无效的坐标', position);
                return;
            }

            const compassSize = 80; // 整体尺寸

            if (!directionIndicator) {
                // 使用自定义HTML内容创建指北针（带东南西北文字）
                directionIndicator = new AMap.Marker({
                    position: position,
                    content: createCompassHTML(),
                    offset: new AMap.Pixel(-compassSize / 2, -compassSize / 2),
                    zIndex: 299,
                    angle: 0,
                    map: map,
                    clickable: false
                });

                // 监听地图旋转事件，实时更新指北针方向
                map.on('rotatechange', function() {
                    if (directionIndicator) {
                        const mapRotation = map.getRotation() || 0;
                        // 高德地图：getRotation返回的是地图顺时针旋转的角度
                        // Marker.setAngle也是顺时针旋转
                        // 要让指北针指向真北，需要让指北针顺时针旋转mapRotation度
                        // 这样当地图逆时针旋转时，指北针顺时针旋转，保持指向真北
                        directionIndicator.setAngle(mapRotation);
                    }
                });

                console.log('[NavRenderer] 指北针已创建（带东南西北），位置:', position);
            } else {
                // 更新位置
                directionIndicator.setPosition(position);
                // 更新旋转角度
                const mapRotation = map.getRotation() || 0;
                directionIndicator.setAngle(mapRotation);
            }
        } catch (e) {
            console.error('[NavRenderer] 更新指北针失败:', e);
        }
    }

    // 引导线（从当前位置到起点的虚线）
    let guideLineToStart = null;

    /**
     * 绘制从当前位置到起点的引导线（虚线）
     * @param {Array} currentPos - 当前位置 [lng, lat]
     * @param {Array} startPos - 起点位置 [lng, lat]
     */
    function drawGuideLineToStart(currentPos, startPos) {
        try {
            if (!map) return;

            // 验证坐标是否有效
            const isValidPos = (pos) => {
                if (!pos) return false;
                const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                const lat = Array.isArray(pos) ? pos[1] : pos.lat;
                return lng != null && lat != null && !isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat);
            };

            if (!isValidPos(currentPos) || !isValidPos(startPos)) {
                console.warn('[NavRenderer] drawGuideLineToStart: 坐标无效', currentPos, startPos);
                return;
            }

            // 清除旧的引导线
            if (guideLineToStart) {
                map.remove(guideLineToStart);
                guideLineToStart = null;
            }

            // 创建虚线引导线
            guideLineToStart = new AMap.Polyline({
                path: [currentPos, startPos],
                strokeColor: '#1E6FFF',  // 蓝色（与导航按钮颜色一致）
                strokeWeight: 4,
                strokeOpacity: 0.8,
                strokeStyle: 'dashed',   // 虚线
                strokeDasharray: [10, 5], // 虚线样式
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: 195,  // 在绿色路线下方，灰色路线上方
                map: map
            });

            console.log('[NavRenderer] 引导线已绘制');
        } catch (e) {
            console.error('[NavRenderer] 绘制引导线失败:', e);
        }
    }

    /**
     * 清除引导线
     */
    function clearGuideLine() {
        try {
            if (guideLineToStart && map) {
                map.remove(guideLineToStart);
                guideLineToStart = null;
                console.log('[NavRenderer] 引导线已清除');
            }
        } catch (e) {
            console.error('[NavRenderer] 清除引导线失败:', e);
        }
    }

    /**
     * 绘制引导线（别名函数，兼容nav-core.js的调用）
     * @param {Array} currentPos - 当前位置 [lng, lat]
     * @param {Array} targetPos - 目标位置 [lng, lat]
     */
    function drawGuidanceLine(currentPos, targetPos) {
        drawGuideLineToStart(currentPos, targetPos);
    }

    /**
     * 更新GPS精度圈
     * @param {Array} position - [lng, lat]
     * @param {number} accuracy - 精度（米）
     */
    function updateAccuracyCircle(position, accuracy) {
        try {
            if (!map) return;

            // 验证坐标是否有效
            if (!position) return;
            const lng = Array.isArray(position) ? position[0] : position.lng;
            const lat = Array.isArray(position) ? position[1] : position.lat;
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
                console.warn('[NavRenderer] updateAccuracyCircle: 无效的坐标', position);
                return;
            }

            if (!accuracyCircle) {
                accuracyCircle = new AMap.Circle({
                    center: position,
                    radius: accuracy,
                    strokeColor: '#007AFF',
                    strokeWeight: 1,
                    strokeOpacity: 0.3,
                    fillColor: '#007AFF',
                    fillOpacity: 0.1,
                    zIndex: 290,
                    map: map
                });
            } else {
                accuracyCircle.setCenter(position);
                accuracyCircle.setRadius(accuracy);
            }
        } catch (e) {
            console.error('[NavRenderer] 更新精度圈失败:', e);
        }
    }

    /**
     * 车头朝上模式：地图居中并旋转
     * @param {Array} position - 用户位置 [lng, lat]
     * @param {number} bearing - 行进方向（度数，0-360，正北为0）
     * @param {boolean} smooth - 是否平滑过渡
     */
    // 调试信息显示函数
    function showDebug(msg) {
        const el = document.getElementById('debug-info');
        if (el) {
            const time = new Date().toLocaleTimeString();
            el.innerHTML = `[${time}] ${msg}<br>` + el.innerHTML;
            // 限制行数
            const lines = el.innerHTML.split('<br>');
            if (lines.length > 20) {
                el.innerHTML = lines.slice(0, 20).join('<br>');
            }
        }
        console.log(msg);
    }

    function setHeadingUpMode(position, bearing, smooth = true) {
        try {
            if (!map) {
                showDebug('setHeadingUpMode: map不存在');
                return;
            }

            // 验证坐标是否有效
            if (!position) return;
            const lng = Array.isArray(position) ? position[0] : position.lng;
            const lat = Array.isArray(position) ? position[1] : position.lat;
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
                console.warn('[NavRenderer] setHeadingUpMode: 无效的坐标', position);
                return;
            }

            // bearing 是道路方向（0=北，90=东，180=南，270=西）
            // 高德地图 setRotation(X) 是让地图顺时针旋转X度
            // 要让道路方向朝上，需要逆时针旋转bearing度
            let targetRotation = -bearing;

            // 归一化目标角度到 -180 ~ 180 范围
            while (targetRotation > 180) targetRotation -= 360;
            while (targetRotation < -180) targetRotation += 360;

            // 获取当前地图旋转角度
            const currentRotation = map.getRotation() || 0;

            // 计算最短旋转路径
            let angleDiff = targetRotation - currentRotation;
            // 确保走最短路径（不超过180度）
            while (angleDiff > 180) angleDiff -= 360;
            while (angleDiff < -180) angleDiff += 360;

            // 最终旋转角度 = 当前角度 + 最短差值
            const mapRotation = currentRotation + angleDiff;

            // 【优化】使用 setZoomAndCenter 同时设置中心和缩放，减少飘移
            // 然后单独设置旋转
            if (smooth) {
                // 先设置中心点（不改变缩放）
                const currentZoom = map.getZoom();
                map.setZoomAndCenter(currentZoom, position, false, 300);
                // 稍微延迟设置旋转，避免同时操作导致的飘移
                setTimeout(() => {
                    if (map) {
                        map.setRotation(mapRotation, false, 200);
                    }
                }, 50);
            } else {
                map.setCenter(position);
                map.setRotation(mapRotation);
            }

            if (map.getZoom() < ((typeof MapConfig !== 'undefined' && MapConfig.mapConfig.zoom) ? MapConfig.mapConfig.zoom : 20)) {
                map.setZoom((typeof MapConfig !== 'undefined' && MapConfig.mapConfig.zoom) ? MapConfig.mapConfig.zoom : 20, false, 300);
            }
        } catch (e) {
            showDebug('旋转失败: ' + e.message);
        }
    }

    /**
     * 只移动地图中心，不旋转（直行时使用）
     * @param {Array} position - 用户位置 [lng, lat]
     * @param {boolean} smooth - 是否平滑过渡
     */
    function setCenterOnly(position, smooth = true) {
        try {
            if (!map) return;

            // 验证坐标是否有效
            if (!position) return;
            const lng = Array.isArray(position) ? position[0] : position.lng;
            const lat = Array.isArray(position) ? position[1] : position.lat;
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
                console.warn('[NavRenderer] setCenterOnly: 无效的坐标', position);
                return;
            }

            if (smooth) {
                map.setCenter(position, false, 300);
            } else {
                map.setCenter(position);
            }

            if (map.getZoom() < ((typeof MapConfig !== 'undefined' && MapConfig.mapConfig.zoom) ? MapConfig.mapConfig.zoom : 20)) {
                map.setZoom((typeof MapConfig !== 'undefined' && MapConfig.mapConfig.zoom) ? MapConfig.mapConfig.zoom : 20, false, 300);
            }
        } catch (e) {
            console.error('[NavRenderer] 移动地图中心失败:', e);
        }
    }

    /**
     * 重置地图旋转（北朝上）
     */
    function resetMapRotation() {
        try {
            if (!map) return;
            map.setRotation(0, false, 300);
        } catch (e) {
            console.error('[NavRenderer] 重置地图旋转失败:', e);
        }
    }

    /**
     * 加载并显示KML数据
     * @param {Object} kmlData - KML数据 { features, fileName }
     */
    function loadKMLData(kmlData) {
        try {
            if (!map || !kmlData || !kmlData.features) {
                console.warn('[NavRenderer] KML数据无效');
                return;
            }

            console.log('[NavRenderer] 加载KML数据...');

            // 验证坐标有效性的辅助函数
            const isValidCoord = (val) => val != null && !isNaN(val) && isFinite(val);
            const isValidPoint = (point) => {
                if (!point) return false;
                const lng = Array.isArray(point) ? point[0] : point.lng;
                const lat = Array.isArray(point) ? point[1] : point.lat;
                return isValidCoord(lng) && isValidCoord(lat);
            };
            const filterValidPath = (coords) => {
                if (!coords || !Array.isArray(coords)) return [];
                return coords.filter(isValidPoint);
            };

            const features = kmlData.features;
            const layerId = 'kml-' + Date.now();
            const displayMarkers = [];

            // 分离线和面
            const lines = features.filter(f => f.geometry?.type === 'line');
            const polygons = features.filter(f => f.geometry?.type === 'polygon');

            // 绘制面（按面积排序）
            const polygonsWithArea = polygons.map(p => ({
                ...p,
                area: calculatePolygonArea(p.geometry.coordinates)
            }));
            polygonsWithArea.sort((a, b) => b.area - a.area);

            polygonsWithArea.forEach((feature, index) => {
                const validPath = filterValidPath(feature.geometry.coordinates);
                if (validPath.length < 3) {
                    console.warn('[NavRenderer] 跳过无效多边形，有效点数:', validPath.length);
                    return;
                }
                const style = feature.geometry.style || {};
                const polygon = new AMap.Polygon({
                    path: validPath,
                    strokeColor: 'transparent',
                    strokeWeight: 0,
                    fillColor: style.fillColor || '#CCCCCC',
                    fillOpacity: style.fillOpacity || 0.3,
                    zIndex: 10 + index,
                    map: map
                });
                displayMarkers.push(polygon);
            });

            // 绘制线（统一样式：1px，#9AE59D）
            lines.forEach(feature => {
                const validPath = filterValidPath(feature.geometry.coordinates);
                if (validPath.length < 2) {
                    console.warn('[NavRenderer] 跳过无效线段，有效点数:', validPath.length);
                    return;
                }
                const polyline = new AMap.Polyline({
                    path: validPath,
                    strokeColor: '#9AE59D',
                    strokeWeight: 3,
                    strokeOpacity: 1,
                    zIndex: 20,
                    map: map
                });

                // 【关键】设置 extData，供 kml-route-planning.js 使用
                polyline.setExtData({
                    name: feature.name || '未命名线',
                    type: '线',
                    description: feature.description || '',
                    coordinates: validPath
                });

                displayMarkers.push(polyline);
            });

            // 保存图层
            kmlLayers.push({
                id: layerId,
                name: kmlData.fileName || 'KML',
                visible: true,
                markers: displayMarkers,
                features: features
            });

            console.log('[NavRenderer] KML数据已加载，图层数:', kmlLayers.length);

            // 保存 polylines 到全局变量（供道路状态管理使用）
            window.polylines = [];
            console.log('[NavRenderer] displayMarkers 总数:', displayMarkers.length);

            displayMarkers.forEach((marker, index) => {
                // 调试：输出每个 marker 的类型信息
                if (index < 3) {
                    console.log('[NavRenderer] marker[' + index + ']:', {
                        CLASS_NAME: marker.CLASS_NAME,
                        constructorName: marker.constructor ? marker.constructor.name : 'undefined',
                        type: typeof marker,
                        keys: Object.keys(marker).slice(0, 5)
                    });
                }

                // 尝试多种方式识别 Polyline
                const isPolyline = marker.CLASS_NAME === 'AMap.Polyline' ||
                    (marker.constructor && marker.constructor.name === 'Polyline') ||
                    (marker.constructor && marker.constructor.name === 'bo') || // AMap 压缩后的类名
                    (typeof marker.getPath === 'function'); // 有 getPath 方法的就是 Polyline

                if (isPolyline) {
                    window.polylines.push(marker);
                }
            });
            console.log('[NavRenderer] 保存了', window.polylines.length, '条 polylines');

            // 自动加载道路状态颜色（导航页面）
            if (typeof autoLoadDriverRoadStatus === 'function') {
                console.log('[NavRenderer] 开始加载道路状态...');
                autoLoadDriverRoadStatus();
            }
        } catch (e) {
            console.error('[NavRenderer] 加载KML数据失败:', e);
        }
    }

    /**
     * 隐藏KML线要素
     */
    function hideKMLLines() {
        kmlLayers.forEach(layer => {
            if (!layer.markers) return;
            layer.markers.forEach(marker => {
                if (marker.CLASS_NAME === 'AMap.Polyline' ||
                    (marker.constructor && marker.constructor.name === 'Polyline')) {
                    marker.hide();
                }
            });
        });
    }

    /**
     * 显示KML线要素
     */
    function showKMLLines() {
        kmlLayers.forEach(layer => {
            if (!layer.markers) return;
            layer.markers.forEach(marker => {
                if (marker.CLASS_NAME === 'AMap.Polyline' ||
                    (marker.constructor && marker.constructor.name === 'Polyline')) {
                    marker.show();
                }
            });
        });
    }

    /**
     * 调整视野到路径
     * @param {Array} path - 路径点
     */
    function adjustViewToPath(path) {
        try {
            if (!map || !path || path.length === 0) return;

            // 验证坐标有效性的辅助函数
            const isValidCoord = (val) => val != null && !isNaN(val) && isFinite(val);

            // 过滤出有效的坐标点
            const validPoints = path.filter(point => {
                if (!point) return false;
                const lng = Array.isArray(point) ? point[0] : point.lng;
                const lat = Array.isArray(point) ? point[1] : point.lat;
                return isValidCoord(lng) && isValidCoord(lat);
            });

            if (validPoints.length === 0) {
                console.warn('[NavRenderer] adjustViewToPath: 没有有效坐标点');
                return;
            }

            let minLng = Array.isArray(validPoints[0]) ? validPoints[0][0] : validPoints[0].lng;
            let maxLng = minLng;
            let minLat = Array.isArray(validPoints[0]) ? validPoints[0][1] : validPoints[0].lat;
            let maxLat = minLat;

            validPoints.forEach(point => {
                const lng = Array.isArray(point) ? point[0] : point.lng;
                const lat = Array.isArray(point) ? point[1] : point.lat;
                minLng = Math.min(minLng, lng);
                maxLng = Math.max(maxLng, lng);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });

            // 最终验证边界值
            if (!isValidCoord(minLng) || !isValidCoord(maxLng) ||
                !isValidCoord(minLat) || !isValidCoord(maxLat)) {
                console.warn('[NavRenderer] adjustViewToPath: 计算出的边界无效');
                return;
            }

            const bounds = new AMap.Bounds([minLng, minLat], [maxLng, maxLat]);
            map.setBounds(bounds, false, [100, 100, 100, 100]);
        } catch (e) {
            console.error('[NavRenderer] 调整视野失败:', e);
        }
    }

    /**
     * 清除路线标记
     */
    function clearRouteMarkers() {
        if (startMarker && map) {
            map.remove(startMarker);
            startMarker = null;
        }
        if (endMarker && map) {
            map.remove(endMarker);
            endMarker = null;
        }
    }

    /**
     * 清除途经点标记
     */
    function clearWaypointMarkers() {
        if (waypointMarkers.length > 0 && map) {
            map.remove(waypointMarkers);
            waypointMarkers = [];
        }
    }

    /**
     * 清除所有覆盖物
     */
    function clearAll() {
        try {
            if (!map) return;

            if (routePolyline) map.remove(routePolyline);
            if (routeBorderPolyline) map.remove(routeBorderPolyline);
            if (passedPolyline) map.remove(passedPolyline);
            if (passedConnectLine) map.remove(passedConnectLine);

            // 清除所有已完成路段的灰色路线
            if (completedSegmentPolylines.length > 0) {
                map.remove(completedSegmentPolylines);
                completedSegmentPolylines = [];
                console.log('[NavRenderer] 已清除所有已完成路段的灰色路线');
            }

            // 清除偏离轨迹
            clearDeviationHistory();

            clearRouteMarkers();
            clearWaypointMarkers();
            if (userMarker) map.remove(userMarker);
            if (accuracyCircle) map.remove(accuracyCircle);
            if (directionIndicator) map.remove(directionIndicator);

            routePolyline = null;
            routeBorderPolyline = null;
            passedPolyline = null;
            passedConnectLine = null;
            userMarker = null;
            accuracyCircle = null;
            directionIndicator = null;
        } catch (e) {
            console.error('[NavRenderer] 清除覆盖物失败:', e);
        }
    }

    /**
     * 销毁地图
     */
    function destroy() {
        try {
            clearAll();
            if (map) {
                map.destroy();
                map = null;
            }
            kmlLayers = [];
        } catch (e) {
            console.error('[NavRenderer] 销毁地图失败:', e);
        }
    }

    // ========== 工具函数 ==========

    function resolvePosition(point) {
        if (!point) return null;
        if (Array.isArray(point)) return point;
        if (point.position && Array.isArray(point.position)) return point.position;
        return null;
    }

    function calculatePolygonArea(coordinates) {
        if (!coordinates || coordinates.length < 3) return 0;
        let area = 0;
        const n = coordinates.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += coordinates[i][0] * coordinates[j][1];
            area -= coordinates[j][0] * coordinates[i][1];
        }
        return Math.abs(area) / 2;
    }

    // ========== 偏离轨迹管理 ==========

    /**
     * 开始偏离轨迹记录
     * @param {Array} lastSnappedPos - 最后吸附的位置 [lng, lat]
     */
    function startDeviation(lastSnappedPos) {
        try {
            if (!map) return;

            // 如果已经在偏离状态，不重复启动
            if (isCurrentlyDeviated) {
                console.log('[NavRenderer] 已在偏离状态，跳过启动');
                return;
            }

            console.log('[NavRenderer] 开始偏离轨迹记录，起点:', lastSnappedPos);

            lastSnappedPosition = lastSnappedPos;
            isCurrentlyDeviated = true;
            
            // 初始化GPS轨迹数组，起点是最后吸附位置
            deviationGpsTrack = [lastSnappedPos];

            // 清除之前的偏离线（如果有）
            if (deviationPolyline) {
                map.remove(deviationPolyline);
                deviationPolyline = null;
            }
        } catch (e) {
            console.error('[NavRenderer] 开始偏离轨迹失败:', e);
        }
    }

    /**
     * 更新偏离轨迹（实时绘制黄色线，记录真实GPS轨迹）
     * @param {Array} currentGpsPos - 当前GPS位置 [lng, lat]
     */
    function updateDeviationLine(currentGpsPos) {
        try {
            if (!map || !isCurrentlyDeviated || !lastSnappedPosition) {
                return;
            }

            // 添加当前GPS点到轨迹数组
            if (deviationGpsTrack.length === 0) {
                // 如果轨迹数组为空（异常情况），重新初始化
                deviationGpsTrack = [lastSnappedPosition, currentGpsPos];
            } else {
                // 检查是否与上一个点重复（避免GPS漂移导致重复点）
                const lastPoint = deviationGpsTrack[deviationGpsTrack.length - 1];
                const distance = calculateLineDistance(lastPoint, currentGpsPos);
                
                // 只有移动距离 > 0.5米才添加新点（过滤GPS抖动）
                if (distance > 0.5) {
                    deviationGpsTrack.push(currentGpsPos);
                }
            }

            // 清除旧的偏离线
            if (deviationPolyline) {
                map.remove(deviationPolyline);
            }

            // 绘制完整的GPS轨迹（从最后吸附点开始，经过所有GPS点）
            deviationPolyline = new AMap.Polyline({
                path: deviationGpsTrack,
                strokeColor: ROUTE_STYLES.deviation.strokeColor,
                strokeWeight: ROUTE_STYLES.deviation.strokeWeight,
                strokeOpacity: ROUTE_STYLES.deviation.strokeOpacity,
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: ROUTE_STYLES.deviation.zIndex,
                map: map
            });

            console.log('[NavRenderer] 偏离轨迹已更新，轨迹点数:', deviationGpsTrack.length);
        } catch (e) {
            console.error('[NavRenderer] 更新偏离轨迹失败:', e);
        }
    }

    /**
     * 结束偏离状态（重新接入路网）
     * @param {Array} rejoinPos - 重新接入的位置 [lng, lat]
     * @param {boolean} isSameSegment - 是否在同一路段接入
     * @returns {Object} 偏离信息 { startPos, endPos, preserved }
     */
    function endDeviation(rejoinPos, isSameSegment) {
        try {
            if (!map || !isCurrentlyDeviated) {
                return null;
            }

            console.log('[NavRenderer] 结束偏离状态，接入点:', rejoinPos,
                isSameSegment ? '(同一路段)' : '(不同路段)');

            const deviationInfo = {
                startPos: lastSnappedPosition,
                endPos: rejoinPos,
                isSameSegment: isSameSegment,
                preserved: false
            };

            // 隐藏偏离线但保留数据
            if (deviationPolyline) {
                deviationPolyline.hide(); // 隐藏偏离线
                deviationInfo.preserved = true;
                deviationInfo.trackPoints = deviationGpsTrack.length; // 记录轨迹点数

                console.log('[NavRenderer] 偏离轨迹已隐藏，轨迹点数:', deviationGpsTrack.length);
            }

            // 重置偏离状态
            isCurrentlyDeviated = false;
            lastSnappedPosition = null;
            deviationGpsTrack = []; // 清空GPS轨迹数组

            return deviationInfo;
        } catch (e) {
            console.error('[NavRenderer] 结束偏离状态失败:', e);
            return null;
        }
    }

    /**
     * 检查是否处于偏离状态
     * @returns {boolean}
     */
    function isDeviated() {
        return isCurrentlyDeviated;
    }

    /**
     * 获取最后吸附位置
     * @returns {Array|null}
     */
    function getLastSnappedPosition() {
        return lastSnappedPosition;
    }

    /**
     * 更新最后吸附位置（在正常吸附时调用）
     * @param {Array} position - [lng, lat]
     */
    function setLastSnappedPosition(position) {
        lastSnappedPosition = position;
    }

    /**
     * 清除所有偏离轨迹历史
     */
    function clearDeviationHistory() {
        try {
            if (!map) return;

            // 清除当前偏离线
            if (deviationPolyline) {
                map.remove(deviationPolyline);
                deviationPolyline = null;
            }

            // 清除历史偏离线
            if (deviationHistory.length > 0) {
                map.remove(deviationHistory);
                deviationHistory = [];
            }

            isCurrentlyDeviated = false;
            lastSnappedPosition = null;
            deviationGpsTrack = []; // 清空GPS轨迹数组

            console.log('[NavRenderer] 偏离轨迹历史已清除');
        } catch (e) {
            console.error('[NavRenderer] 清除偏离轨迹失败:', e);
        }
    }

    /**
     * 计算两点距离（简单版）
     * @param {Array} pos1 - [lng, lat]
     * @param {Array} pos2 - [lng, lat]
     * @returns {number} 距离（米）
     */
    function calculateLineDistance(pos1, pos2) {
        if (typeof AMap !== 'undefined' && AMap.GeometryUtil) {
            return AMap.GeometryUtil.distance(pos1, pos2);
        }
        // 简单计算（Haversine）
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
     * 显示转向标签（在导航开始前显示所有转向点）
     * @param {Array} turningPoints - 转向点数组
     */
    function showTurnLabels(turningPoints) {
        try {
            // 先清除旧的转向标签
            clearTurnLabels();

            if (!map || !turningPoints || turningPoints.length === 0) {
                console.log('[NavRenderer] 无转向点需要显示');
                return;
            }

            // 按位置分组转向点（同一位置可能有多个转向）
            const positionGroups = {};
            turningPoints.forEach(tp => {
                const pos = tp.position;
                const key = `${pos[0].toFixed(6)},${pos[1].toFixed(6)}`;
                if (!positionGroups[key]) {
                    positionGroups[key] = {
                        position: pos,
                        turns: [],
                        pointIndex: tp.pointIndex
                    };
                }
                positionGroups[key].turns.push(tp.turnType);
            });

            // 按pointIndex排序
            const sortedGroups = Object.values(positionGroups).sort((a, b) => a.pointIndex - b.pointIndex);

            // 为每个位置创建标签
            sortedGroups.forEach((group, index) => {
                // 验证坐标是否有效
                const pos = group.position;
                if (!pos) return;
                const lng = Array.isArray(pos) ? pos[0] : pos.lng;
                const lat = Array.isArray(pos) ? pos[1] : pos.lat;
                if (lng == null || lat == null || isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
                    console.warn('[NavRenderer] showTurnLabels: 跳过无效坐标', pos);
                    return;
                }

                // 去重并按顺序排列转向类型
                const turnOrder = ['left', 'right', 'uturn'];
                const uniqueTurns = [...new Set(group.turns)];
                uniqueTurns.sort((a, b) => turnOrder.indexOf(a) - turnOrder.indexOf(b));

                // 转换为中文
                const turnTextMap = {
                    'left': '左',
                    'right': '右',
                    'uturn': '掉头',
                    'slight-left': '左',
                    'slight-right': '右',
                    'sharp-left': '左',
                    'sharp-right': '右'
                };

                const labelText = uniqueTurns.map(t => turnTextMap[t] || t).join(',');

                // 创建标签
                const labelContent = `<div style="
                    background: rgba(255, 152, 0, 0.9);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: bold;
                    white-space: nowrap;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.5);
                ">${labelText}</div>`;

                const marker = new AMap.Marker({
                    position: group.position,
                    content: labelContent,
                    offset: new AMap.Pixel(-20, -30),
                    zIndex: 300,
                    map: map
                });

                turnLabelMarkers.push(marker);
            });

            console.log(`[NavRenderer] 已显示 ${turnLabelMarkers.length} 个转向标签`);
        } catch (e) {
            console.error('[NavRenderer] 显示转向标签失败:', e);
        }
    }

    /**
     * 清除转向标签
     */
    function clearTurnLabels() {
        try {
            if (turnLabelMarkers.length > 0) {
                turnLabelMarkers.forEach(marker => {
                    if (marker) {
                        map.remove(marker);
                    }
                });
                turnLabelMarkers = [];
                console.log('[NavRenderer] 转向标签已清除');
            }
        } catch (e) {
            console.error('[NavRenderer] 清除转向标签失败:', e);
        }
    }

    // 公开API
    return {
        initMap,
        getMap,
        drawRoute,
        updatePassedRoute,
        lowerCompletedSegmentZIndex,
        clearPassedRoute,
        toggleRouteArrows,
        addRouteMarkers,
        addWaypointMarkers,
        updateUserMarker,
        updateDirectionIndicator,
        setUserMarkerAngle,
        updateAccuracyCircle,
        setHeadingUpMode,
        setCenterOnly,  // 【新增】只移动中心，不旋转
        resetMapRotation,
        loadKMLData,
        hideKMLLines,
        showKMLLines,
        adjustViewToPath,
        clearRouteMarkers,
        clearWaypointMarkers,
        clearAll,
        destroy,

        // 【新增】引导线相关
        drawGuideLineToStart,
        drawGuidanceLine,  // 别名函数
        clearGuideLine,

        // 【新增】偏离轨迹相关
        startDeviation,
        updateDeviationLine,
        endDeviation,
        isDeviated,
        getLastSnappedPosition,
        setLastSnappedPosition,
        clearDeviationHistory,

        // 【新增】转向标签相关
        showTurnLabels,
        clearTurnLabels,

        // 暴露KML图层给路径规划模块使用
        getKMLLayers: () => kmlLayers
    };
})();

// 导出到全局
window.NavRenderer = NavRenderer;

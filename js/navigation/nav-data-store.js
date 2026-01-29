/**
 * nav-data-store.js
 * 导航数据统一存储层
 * 负责所有跨页面数据的存储、读取和校验
 */

const NavDataStore = (function() {
    'use strict';

    // 存储键名常量
    const STORAGE_KEYS = {
        NAVIGATION_ROUTE: 'navigationRoute',
        ROUTE_PLANNING_DATA: 'routePlanningData',
        KML_RAW_DATA: 'kmlRawData',
        KML_FILE_NAME: 'kmlFileName',
        PROCESSED_KML_DATA: 'processedKMLData',
        KML_DATA: 'kmlData',
        CURRENT_POSITION: 'currentPosition',
        MAP_STATE: 'mapState',
        POINT_SELECTION_REFERRER: 'pointSelectionReferrer'
    };

    // ==================== 路线数据 ====================

    /**
     * 保存导航路线数据
     * @param {Object} data - 路线数据 { start, end, waypoints }
     * @returns {boolean} 是否保存成功
     */
    function setRoute(data) {
        try {
            // 数据校验
            if (!data) {
                console.error('[NavDataStore] 路线数据为空');
                return false;
            }

            if (!data.start || !data.end) {
                console.error('[NavDataStore] 路线数据缺少起点或终点');
                return false;
            }

            // 校验起点坐标
            if (!isValidPosition(data.start.position) && data.start.name !== '我的位置') {
                console.warn('[NavDataStore] 起点坐标无效:', data.start);
            }

            // 校验终点坐标
            if (!isValidPosition(data.end.position)) {
                console.error('[NavDataStore] 终点坐标无效:', data.end);
                return false;
            }

            // 校验途经点
            if (data.waypoints && Array.isArray(data.waypoints)) {
                data.waypoints = data.waypoints.filter(wp => {
                    if (!wp || !wp.name) return false;
                    if (!isValidPosition(wp.position)) {
                        console.warn('[NavDataStore] 途经点坐标无效，已过滤:', wp.name);
                        return false;
                    }
                    return true;
                });
            }

            sessionStorage.setItem(STORAGE_KEYS.NAVIGATION_ROUTE, JSON.stringify(data));
            console.log('[NavDataStore] 路线数据已保存:', data);
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存路线数据失败:', e);
            return false;
        }
    }

    /**
     * 获取导航路线数据
     * @returns {Object|null} 路线数据
     */
    function getRoute() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEYS.NAVIGATION_ROUTE);
            if (!data) return null;

            const parsed = JSON.parse(data);

            // 修复"我的位置"的坐标问题
            if (parsed.start && parsed.start.name === '我的位置') {
                const currentPos = getCurrentPosition();
                if (currentPos && isValidPosition(currentPos)) {
                    parsed.start.position = currentPos;
                    parsed.start.isMyLocation = true;
                } else {
                    // 如果没有有效的当前位置，检查保存的起点坐标
                    if (!isValidPosition(parsed.start.position)) {
                        console.warn('[NavDataStore] "我的位置"没有有效坐标，等待GPS定位');
                        parsed.start.position = null; // 明确设为null，让调用方知道需要等待
                        parsed.start.isMyLocation = true;
                        parsed.start.needsGPS = true; // 标记需要GPS定位
                    }
                }
            }

            // 验证终点坐标
            if (parsed.end && !isValidPosition(parsed.end.position)) {
                console.error('[NavDataStore] 终点坐标无效');
                return null;
            }

            return parsed;
        } catch (e) {
            console.error('[NavDataStore] 读取路线数据失败:', e);
            return null;
        }
    }

    /**
     * 清除路线数据
     */
    function clearRoute() {
        sessionStorage.removeItem(STORAGE_KEYS.NAVIGATION_ROUTE);
    }

    // ==================== 路线规划数据（点位选择页面用） ====================

    /**
     * 保存路线规划数据（用于点位选择页面）
     * @param {Object} data - 规划数据
     */
    function setRoutePlanningData(data) {
        try {
            sessionStorage.setItem(STORAGE_KEYS.ROUTE_PLANNING_DATA, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存路线规划数据失败:', e);
            return false;
        }
    }

    /**
     * 获取路线规划数据
     * @returns {Object|null}
     */
    function getRoutePlanningData() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEYS.ROUTE_PLANNING_DATA);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('[NavDataStore] 读取路线规划数据失败:', e);
            return null;
        }
    }

    /**
     * 清除路线规划数据
     */
    function clearRoutePlanningData() {
        sessionStorage.removeItem(STORAGE_KEYS.ROUTE_PLANNING_DATA);
    }

    // ==================== KML数据 ====================

    /**
     * 保存原始KML数据
     * @param {string} rawData - KML原始XML字符串
     * @param {string} fileName - 文件名
     */
    function setKMLRawData(rawData, fileName) {
        try {
            sessionStorage.setItem(STORAGE_KEYS.KML_RAW_DATA, rawData);
            sessionStorage.setItem(STORAGE_KEYS.KML_FILE_NAME, fileName || 'unknown.kml');
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存KML原始数据失败:', e);
            return false;
        }
    }

    /**
     * 获取原始KML数据
     * @returns {Object|null} { rawData, fileName }
     */
    function getKMLRawData() {
        try {
            const rawData = sessionStorage.getItem(STORAGE_KEYS.KML_RAW_DATA);
            const fileName = sessionStorage.getItem(STORAGE_KEYS.KML_FILE_NAME);
            if (!rawData) return null;
            return { rawData, fileName };
        } catch (e) {
            console.error('[NavDataStore] 读取KML原始数据失败:', e);
            return null;
        }
    }

    /**
     * 保存处理后的KML数据
     * @param {Object} data - 处理后的数据 { features, fileName }
     */
    function setProcessedKMLData(data) {
        try {
            sessionStorage.setItem(STORAGE_KEYS.PROCESSED_KML_DATA, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存处理后KML数据失败:', e);
            return false;
        }
    }

    /**
     * 获取处理后的KML数据
     * @returns {Object|null}
     */
    function getProcessedKMLData() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEYS.PROCESSED_KML_DATA);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('[NavDataStore] 读取处理后KML数据失败:', e);
            return null;
        }
    }

    /**
     * 保存KML图层数据（用于搜索等）
     * @param {Array} layers - KML图层数组
     */
    function setKMLLayers(layers) {
        try {
            sessionStorage.setItem(STORAGE_KEYS.KML_DATA, JSON.stringify(layers));
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存KML图层数据失败:', e);
            return false;
        }
    }

    /**
     * 获取KML图层数据
     * @returns {Array|null}
     */
    function getKMLLayers() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEYS.KML_DATA);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('[NavDataStore] 读取KML图层数据失败:', e);
            return null;
        }
    }

    /**
     * 清除所有KML数据
     */
    function clearKMLData() {
        sessionStorage.removeItem(STORAGE_KEYS.KML_RAW_DATA);
        sessionStorage.removeItem(STORAGE_KEYS.KML_FILE_NAME);
        sessionStorage.removeItem(STORAGE_KEYS.PROCESSED_KML_DATA);
        sessionStorage.removeItem(STORAGE_KEYS.KML_DATA);
    }

    // ==================== 当前位置 ====================

    /**
     * 保存当前位置
     * @param {Array} position - [lng, lat]
     */
    function setCurrentPosition(position) {
        try {
            if (!isValidPosition(position)) {
                console.warn('[NavDataStore] 无效的位置数据:', position);
                return false;
            }
            sessionStorage.setItem(STORAGE_KEYS.CURRENT_POSITION, JSON.stringify(position));
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存当前位置失败:', e);
            return false;
        }
    }

    /**
     * 获取当前位置
     * @returns {Array|null} [lng, lat]
     */
    function getCurrentPosition() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEYS.CURRENT_POSITION);
            if (!data) return null;
            const pos = JSON.parse(data);
            return isValidPosition(pos) ? pos : null;
        } catch (e) {
            console.error('[NavDataStore] 读取当前位置失败:', e);
            return null;
        }
    }

    // ==================== 地图状态 ====================

    /**
     * 保存地图状态
     * @param {Object} state - { zoom, center, angle, fromNavigation, kmlBounds }
     */
    function setMapState(state) {
        try {
            sessionStorage.setItem(STORAGE_KEYS.MAP_STATE, JSON.stringify(state));
            return true;
        } catch (e) {
            console.error('[NavDataStore] 保存地图状态失败:', e);
            return false;
        }
    }

    /**
     * 获取地图状态
     * @returns {Object|null}
     */
    function getMapState() {
        try {
            const data = sessionStorage.getItem(STORAGE_KEYS.MAP_STATE);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('[NavDataStore] 读取地图状态失败:', e);
            return null;
        }
    }

    /**
     * 清除地图状态
     */
    function clearMapState() {
        sessionStorage.removeItem(STORAGE_KEYS.MAP_STATE);
    }

    // ==================== 页面跳转来源 ====================

    /**
     * 设置点位选择页面的来源
     * @param {string} referrer - 来源页面
     */
    function setPointSelectionReferrer(referrer) {
        sessionStorage.setItem(STORAGE_KEYS.POINT_SELECTION_REFERRER, referrer);
    }

    /**
     * 获取点位选择页面的来源
     * @returns {string|null}
     */
    function getPointSelectionReferrer() {
        return sessionStorage.getItem(STORAGE_KEYS.POINT_SELECTION_REFERRER);
    }

    /**
     * 清除点位选择页面的来源
     */
    function clearPointSelectionReferrer() {
        sessionStorage.removeItem(STORAGE_KEYS.POINT_SELECTION_REFERRER);
    }

    // ==================== 工具函数 ====================

    /**
     * 校验位置数据是否有效
     * @param {Array} position - [lng, lat]
     * @returns {boolean}
     */
    function isValidPosition(position) {
        if (!position || !Array.isArray(position) || position.length < 2) {
            return false;
        }
        const [lng, lat] = position;
        // 检查是否为有效数字
        if (typeof lng !== 'number' || typeof lat !== 'number') {
            return false;
        }
        // 检查是否为NaN或Infinity
        if (!isFinite(lng) || !isFinite(lat)) {
            return false;
        }
        // 检查是否为占位符坐标 [0, 0]
        if (lng === 0 && lat === 0) {
            return false;
        }
        // 检查经纬度范围（中国范围大致）
        if (lng < 73 || lng > 136 || lat < 3 || lat > 54) {
            console.warn('[NavDataStore] 坐标超出中国范围:', position);
            // 不返回false，因为可能是测试数据
        }
        return true;
    }

    /**
     * 根据名称从KML数据中查找点位坐标
     * @param {string} name - 点位名称
     * @returns {Array|null} [lng, lat]
     */
    function findPositionByName(name) {
        if (!name) return null;

        try {
            // 从处理后的KML数据中查找
            const processedData = getProcessedKMLData();
            if (processedData && processedData.features) {
                for (const feature of processedData.features) {
                    if (feature.name === name && feature.geometry && feature.geometry.coordinates) {
                        return feature.geometry.coordinates;
                    }
                }
            }

            // 从KML图层数据中查找
            const layers = getKMLLayers();
            if (layers && Array.isArray(layers)) {
                for (const layer of layers) {
                    if (layer.features) {
                        for (const feature of layer.features) {
                            if (feature.name === name && feature.geometry && feature.geometry.coordinates) {
                                return feature.geometry.coordinates;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[NavDataStore] 查找点位失败:', e);
        }

        return null;
    }

    /**
     * 清除所有导航相关数据
     */
    function clearAll() {
        Object.values(STORAGE_KEYS).forEach(key => {
            sessionStorage.removeItem(key);
        });
        console.log('[NavDataStore] 已清除所有导航数据');
    }

    // 公开API
    return {
        // 存储键名
        STORAGE_KEYS,

        // 路线数据
        setRoute,
        getRoute,
        clearRoute,

        // 路线规划数据
        setRoutePlanningData,
        getRoutePlanningData,
        clearRoutePlanningData,

        // KML数据
        setKMLRawData,
        getKMLRawData,
        setProcessedKMLData,
        getProcessedKMLData,
        setKMLLayers,
        getKMLLayers,
        clearKMLData,

        // 当前位置
        setCurrentPosition,
        getCurrentPosition,

        // 地图状态
        setMapState,
        getMapState,
        clearMapState,

        // 页面跳转
        setPointSelectionReferrer,
        getPointSelectionReferrer,
        clearPointSelectionReferrer,

        // 工具函数
        isValidPosition,
        findPositionByName,
        clearAll
    };
})();

// 导出到全局
window.NavDataStore = NavDataStore;

// main.js
// 应用程序主入口

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const currentUser = sessionStorage.getItem('currentUser');

    if (!isLoggedIn || !currentUser) {
        // 未登录，跳转到登录页
        window.location.href = 'login.html';
        return false;
    }

    return true;
}

document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    if (!checkLoginStatus()) {
        return;
    }

    // 初始化地图
    initMap();

    // 初始化KML导入功能
    initKMLImport();

    // 加载地图数据（优先使用API，失败则回退到KML文件）
    const useAPIData = true; // 使用真实API（已集成登录认证）

    if (useAPIData) {
        loadMapDataFromAPI();
    } else {
        loadDefaultKMLFile();
    }

    // 等待地图加载完成后，尝试从sessionStorage恢复KML数据
    setTimeout(function() {
        if (typeof loadKMLFromSession === 'function') {
            loadKMLFromSession();
        }

        // 延迟检查：如果API加载失败且没有恢复到数据，才提示用户
        setTimeout(function() {
            if (window.apiLoadFailed && (!window.kmlLayers || window.kmlLayers.length === 0)) {
                console.warn('[数据加载检查] API加载失败且无缓存数据');
                alert('您所在位置周边无项目现场');
            } else if (window.apiLoadFailed && window.kmlLayers && window.kmlLayers.length > 0) {
                console.log('[数据加载检查] API加载失败，但已从缓存恢复数据');
            }
        }, 1000);
    }, 500);

    // 初始化点选择面板
    initPointSelectionPanel();

    // 初始化底部导航栏
    initBottomNav();

    // 等待地图初始化完成后设置事件监听器
    setTimeout(function() {
        setupEventListeners();

        // 检查URL参数，是否需要自动显示点位选择界面并添加途径点
        checkURLAction();

        // 从sessionStorage恢复路线规划数据
        restoreRoutePlanningData();
    }, 1000);
});

/**
 * 检查URL参数并执行相应操作
 */
function checkURLAction() {
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');

    // 检查是否从任务页来进行导航，如果是则清除标记和地图状态
    const fromTaskNav = sessionStorage.getItem('fromTaskNavigation');
    if (fromTaskNav === 'true') {
        sessionStorage.removeItem('fromTaskNavigation');
        sessionStorage.removeItem('mapState');
        console.log('从任务页导航进入，已清除地图状态缓存');
    }

    if (action === 'addWaypoint') {
        console.log('检测到添加途径点操作，跳转到点位选择界面');
        // 跳转到点位选择界面
        if (typeof showPickerPanel === 'function') {
            currentInputType = 'waypoint';
            showPickerPanel();
        }

        // 清除URL参数，避免刷新时重复执行
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

/**
 * 初始化底部导航栏
 */
function initBottomNav() {
    const navItems = document.querySelectorAll('.nav-item');
    console.log('初始化底部导航栏, 找到', navItems.length, '个导航项');

    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            console.log('导航项被点击:', this.getAttribute('data-page'));
            const page = this.getAttribute('data-page');

            // 更新导航栏状态
            navItems.forEach(nav => {
                const img = nav.querySelector('.nav-icon-img');
                const text = nav.querySelector('.nav-text');

                if (nav === this) {
                    nav.classList.add('active');
                    img.src = img.getAttribute('data-active');
                    text.style.color = '#5BA8E3';
                } else {
                    nav.classList.remove('active');
                    img.src = img.getAttribute('data-inactive');
                    text.style.color = '#666666';
                }
            });

            // 页面跳转
            navigateToPage(page);
        });
    });
}

/**
 * 页面导航
 */
function navigateToPage(page) {
    console.log('准备跳转到页面:', page);

    // 只有从首页跳转到其他页面时才保存地图状态（用于返回时恢复）
    // 注意：从任务页切换到首页时，不应保存状态，而是重新定位
    if (page !== 'index' && typeof map !== 'undefined' && map) {
        try {
            const zoom = map.getZoom();
            const center = map.getCenter();
            const position = currentPosition || null;
            const angle = (selfMarker && typeof selfMarker.getAngle === 'function') ? selfMarker.getAngle() : 0;

            const mapState = {
                zoom: zoom,
                center: [center.lng, center.lat],
                position: position,
                angle: angle
            };
            sessionStorage.setItem('mapState', JSON.stringify(mapState));
            console.log('保存地图状态:', mapState);
        } catch (e) {
            console.warn('保存地图状态失败:', e);
        }
    }

    switch(page) {
        case 'index':
            // 从其他页面跳转到首页时，清除地图状态，强制重新定位
            sessionStorage.removeItem('mapState');
            console.log('清除地图状态，将重新定位');
            // 当前页面不需要跳转
            if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                console.log('已经在首页，无需跳转');
            } else {
                window.location.href = 'index.html';
            }
            break;
        case 'task':
            console.log('跳转到任务页面');
            window.location.href = 'task.html';
            break;
        case 'profile':
            console.log('跳转到我的页面');
            window.location.href = 'profile.html';
            break;
        default:
            console.warn('未知页面:', page);
    }
}

/**
 * 从API加载地图数据（点、线、面）
 * 根据选择的项目ID请求对应的点线面数据，并以项目经纬度为地图中心
 */
async function loadMapDataFromAPI() {
    try {
        console.log('[API加载] 开始从API加载地图数据...');
        
        // 提前禁用自动聚焦，防止定位完成后跳转到用户位置
        if (typeof disableAutoCenter !== 'undefined') {
            disableAutoCenter = true;
            console.log('[API加载] 已禁用自动聚焦');
        }

        // 1. 获取项目选择信息
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        
        let projectId = null;
        let projectName = '所有项目';
        let projectCenter = null; // 项目中心经纬度
        
        if (projectSelection) {
            const selection = JSON.parse(projectSelection);
            projectName = selection.project;
            
            // 从用户的项目列表中找到选择的项目，获取项目ID和经纬度
            const userProjects = currentUser.projects || [];
            const selectedProject = userProjects.find(p => p.projectName === projectName);
            
            if (selectedProject) {
                projectId = selectedProject.projectCode || selectedProject.id;
                // 项目经纬度（如果有的话）
                if (selectedProject.longitude && selectedProject.latitude) {
                    projectCenter = [selectedProject.longitude, selectedProject.latitude];
                }
                console.log('[API加载] 选择的项目:', {
                    name: projectName,
                    id: projectId,
                    center: projectCenter
                });
            }
        }

        // 2. 准备请求headers（地图API不需要token认证）
        const baseURL = 'https://dmap.cscec3bxjy.cn/api/map';
        const headers = {
            'Content-Type': 'application/json'
        };
        
        console.log('[API加载] 使用无认证请求');

        // 3. 获取当前启用的地图版本号
        if (!projectId) {
            console.warn('[API加载] 没有项目ID，无法获取地图');
            alert('请先选择项目');
            return;
        }
        
        let versionId = null;
        try {
            console.log('[API加载] 获取项目地图版本...');
            const versionRes = await fetch(`${baseURL}/map-versions/project/${projectId}/active`, { headers });
            
            if (versionRes.ok) {
                const versionData = await versionRes.json();
                console.log('[API加载] 版本信息:', versionData);

                if (versionData.code === 200 && versionData.data) {
                    // 使用 MapVersion_Id 字段（bigint类型）
                    versionId = versionData.data.MapVersion_Id || versionData.data.id;
                    console.log('[API加载] 当前启用版本ID:', versionId);
                }
            }
        } catch (e) {
            console.warn('[API加载] 获取版本信息失败:', e);
        }
        
        // 如果没有版本号，提示无地图
        if (!versionId) {
            console.warn('[API加载] 该项目没有启用的地图版本');
            alert('该项目暂无地图数据');
            
            // 即使没有地图数据，如果有项目中心也设置地图中心
            if (projectCenter && map) {
                console.log('[API加载] 设置地图中心为项目位置:', projectCenter);
                map.setCenter(projectCenter);
                map.setZoom(15);
            }
            
            // 启动定位
            startLocationTracking();
            return;
        }

        // 4. 构建请求URL（点使用 /points 接口，线面使用原接口）
        let pointsUrl = `${baseURL}/points?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;
        let polylinesUrl = `${baseURL}/polylines?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;
        let polygonsUrl = `${baseURL}/polygons?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;

        console.log('[API加载] 项目ID:', projectId, '版本ID:', versionId);
        console.log('[API加载] 请求URL:', { pointsUrl, polylinesUrl, polygonsUrl });

        // 5. 并行请求点、线、面数据
        console.log('[API加载] 请求点线面数据...');
        const [pointsRes, polylinesRes, polygonsRes] = await Promise.all([
            fetch(pointsUrl, { headers }),
            fetch(polylinesUrl, { headers }),
            fetch(polygonsUrl, { headers })
        ]);

        // 6. 检查响应
        if (!pointsRes.ok || !polylinesRes.ok || !polygonsRes.ok) {
            console.error('[API加载] API请求失败:', {
                points: pointsRes.status,
                polylines: polylinesRes.status,
                polygons: polygonsRes.status
            });
            throw new Error('API请求失败');
        }

        // 7. 解析数据
        const pointsData = await pointsRes.json();
        const polylinesData = await polylinesRes.json();
        const polygonsData = await polygonsRes.json();

        console.log('[API加载] 原始API返回:', {
            points: pointsData,
            polylines: polylinesData,
            polygons: polygonsData
        });

        // 提取实际的数据数组（处理分页响应格式）
        let points = pointsData.data?.list || pointsData.data || [];
        let polylines = polylinesData.data?.list || polylinesData.data || [];
        let polygons = polygonsData.data?.list || polygonsData.data || [];

        // 【新增】过滤数据：只保留当前版本的数据，去除其他版本的重复数据
        console.log('[API加载] ========== 数据版本过滤 ==========');
        console.log('[API加载] 当前请求的版本ID:', versionId);
        console.log('[API加载] 过滤前数据量 - 点:', points.length, '线:', polylines.length, '面:', polygons.length);

        // 【新增】打印点数据示例，查看字段
        if (points.length > 0) {
            console.log('[API加载] ========== 点数据字段检查 ==========');
            console.log('[API加载] 点数据示例 (完整对象):', points[0]);
            console.log('[API加载] 点数据所有字段名:', Object.keys(points[0]));
            console.log('[API加载] 检查版本字段:');
            console.log('  - map_version_id:', points[0].map_version_id);
            console.log('  - MapVersion_Id:', points[0].MapVersion_Id);
            console.log('  - version_id:', points[0].version_id);
            console.log('  - mapVersionId:', points[0].mapVersionId);
            console.log('[API加载] ==========================================');
        }

        // 统计点数据的版本分布（尝试多个可能的字段名）
        const pointVersions = {};
        points.forEach(point => {
            const v = point.map_version_id || point.MapVersion_Id || point.version_id || '无版本字段';
            pointVersions[v] = (pointVersions[v] || 0) + 1;
        });
        console.log('[API加载] 点数据版本分布:', pointVersions);

        // 统计线数据的版本分布
        const lineVersions = {};
        polylines.forEach(line => {
            const v = line.map_version_id || '无版本字段';
            lineVersions[v] = (lineVersions[v] || 0) + 1;
        });
        console.log('[API加载] 线数据版本分布:', lineVersions);

        // 统计面数据的版本分布
        const polygonVersions = {};
        polygons.forEach(polygon => {
            const v = polygon.map_version_id || '无版本字段';
            polygonVersions[v] = (polygonVersions[v] || 0) + 1;
        });
        console.log('[API加载] 面数据版本分布:', polygonVersions);

        // 过滤点数据（新的 /points 接口返回的数据包含 map_version_id 字段）
        const pointsBeforeFilter = points.length;
        points = points.filter(point => {
            const versionField = point.map_version_id || point.MapVersion_Id || point.version_id;
            // 如果没有版本字段，保留该数据
            if (!versionField) return true;
            // 只保留匹配当前版本的数据
            return versionField == versionId;
        });
        const pointsFiltered = pointsBeforeFilter - points.length;

        // 过滤线数据
        const linesBeforeFilter = polylines.length;
        polylines = polylines.filter(line => {
            // 如果没有 map_version_id 字段，保留该数据
            if (!line.map_version_id) return true;
            // 只保留匹配当前版本的数据
            return line.map_version_id == versionId;
        });
        const linesFiltered = linesBeforeFilter - polylines.length;

        // 过滤面数据
        const polygonsBeforeFilter = polygons.length;
        polygons = polygons.filter(polygon => {
            // 如果没有 map_version_id 字段，保留该数据
            if (!polygon.map_version_id) return true;
            // 只保留匹配当前版本的数据
            return polygon.map_version_id == versionId;
        });
        const polygonsFiltered = polygonsBeforeFilter - polygons.length;

        console.log('[API加载] 过滤后数据量 - 点:', points.length, '线:', polylines.length, '面:', polygons.length);
        console.log('[API加载] 已过滤 - 点:', pointsFiltered, '个, 线:', linesFiltered, '条, 面:', polygonsFiltered, '个');
        console.log('[API加载] =====================================');

        // 打印第一条数据看看格式
        if (points.length > 0) console.log('[API加载] 点数据示例:', points[0]);
        if (polylines.length > 0) console.log('[API加载] 线数据示例:', polylines[0]);
        if (polygons.length > 0) console.log('[API加载] 面数据示例:', polygons[0]);

        console.log('[API加载] 数据加载成功:', {
            点数量: points.length,
            线数量: polylines.length,
            面数量: polygons.length
        });

        // 7. 打印数据摘要（调试用）
        if (window.APIDataConverter) {
            APIDataConverter.printSummary(points, polylines, polygons);
        }

        // 8. 转换为KML格式的features（使用新的转换器）
        let features;
        if (window.APIDataConverter) {
            features = APIDataConverter.convert(points, polylines, polygons);
        } else {
            features = convertAPIDataToFeatures(points, polylines, polygons);
        }

        console.log('[API加载] 转换后的features数量:', features.length);

        // 9. 对线数据进行分割处理（与KML导入时一样）
        console.log('[API加载] 开始分割线段...');
        let processedFeatures = features;
        if (typeof processLineIntersections === 'function') {
            try {
                processedFeatures = processLineIntersections(features);
                console.log('[API加载] 线段分割完成，处理后features数量:', processedFeatures.length);
            } catch (e) {
                console.warn('[API加载] 线段分割失败，使用原始数据:', e);
                processedFeatures = features;
            }
        } else {
            console.warn('[API加载] processLineIntersections函数不存在，跳过分割');
        }

        // 10. 构建KML数据对象
        const kmlData = {
            features: processedFeatures,
            fileName: `${projectName} (API数据)`
        };

        // 11. 显示地图数据（如果有数据）
        if (processedFeatures.length > 0) {
            window.isFirstKMLImport = true;

            // 保存到全局变量
            window.kmlData = kmlData;

            // 调用 kml-handler.js 中的显示函数
            console.log('[API加载] 调用displayKMLFeatures显示地图数据');
            displayKMLFeatures(processedFeatures, kmlData.fileName);

            console.log('[API加载] 地图数据已显示');
            
            // 如果有项目中心经纬度，设置地图中心
            if (projectCenter && map) {
                console.log('[API加载] 设置地图中心为项目位置:', projectCenter);
                map.setCenter(projectCenter);
                map.setZoom(15); // 设置合适的缩放级别
            }
        } else {
            console.warn('[API加载] 无地图数据，跳过显示');
            
            // 即使没有数据，如果有项目中心也设置地图中心
            if (projectCenter && map) {
                console.log('[API加载] 设置地图中心为项目位置:', projectCenter);
                map.setCenter(projectCenter);
                map.setZoom(15);
            }
        }

        // 12. 启动定位（无论是否有地图数据都要定位）
        startLocationTracking();

        console.log('[API加载] 地图数据加载完成');
        window.apiLoadFailed = false; // 标记API加载成功

    } catch (error) {
        console.error('[API加载] 加载地图数据失败:', error);
        // 不立即弹出alert，因为可能还有sessionStorage中的数据
        console.warn('[API加载] API加载失败，将尝试从sessionStorage恢复数据');
        window.apiLoadFailed = true; // 标记API加载失败

        // 启动定位
        startLocationTracking();
    }
}

/**
 * 启动定位追踪（辅助函数）
 */
function startLocationTracking() {
    setTimeout(() => {
        if (typeof startRealtimeLocationTracking === 'function') {
            try {
                startRealtimeLocationTracking();
            } catch (e) {
                console.warn('启动实时定位失败', e);
            }
        } else if (typeof getCurrentLocation === 'function') {
            try {
                getCurrentLocation();
            } catch (e) {
                console.warn('一次性定位失败', e);
            }
        }
    }, 300);
}

/**
 * 将API数据转换为KML格式的features
 */
function convertAPIDataToFeatures(points, polylines, polygons) {
    const features = [];

    // 转换点
    points.forEach(point => {
        features.push({
            name: point.name || '未命名点',
            description: point.description || '',
            geometry: {
                type: 'point',
                coordinates: [point.longitude, point.latitude]
            },
            properties: {
                icon: point.icon_url || '',
                ...point
            }
        });
    });

    // 转换线
    polylines.forEach(line => {
        // API字段名是 line_position，不是 coordinates
        const coordsField = line.line_position;

        if (!coordsField) {
            console.warn('线缺少坐标数据:', line.line_name);
            return;
        }

        let coords = [];
        try {
            if (typeof coordsField === 'string') {
                // 检查是否是分号分隔的格式: "lng,lat;lng,lat;..."
                if (coordsField.includes(';') && !coordsField.includes('[')) {
                    coords = coordsField.split(';').map(point => {
                        const [lng, lat] = point.split(',').map(Number);
                        return [lng, lat];
                    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
                    console.log('[转换] 线坐标(分号格式):', line.line_name, '点数:', coords.length);
                } else {
                    // 尝试直接解析JSON
                    try {
                        coords = JSON.parse(coordsField);
                    } catch (jsonError) {
                        // 如果失败，尝试提取坐标数组部分
                        const match = coordsField.match(/\[\[[\d.,\s\[\]-]+\]\]/);
                        if (match) {
                            coords = JSON.parse(match[0]);
                        } else {
                            throw new Error('无法提取坐标');
                        }
                    }
                }
            } else if (Array.isArray(coordsField)) {
                coords = coordsField;
            } else {
                throw new Error('未知坐标格式');
            }
        } catch (e) {
            console.warn('解析线坐标失败:', line.line_name, e);
            return;
        }

        // 确保coords是数组格式
        if (!Array.isArray(coords) || coords.length === 0) {
            console.warn('线坐标格式错误:', line.line_name, coords);
            return;
        }

        features.push({
            name: line.line_name || '未命名线',
            description: line.description || '',
            geometry: {
                type: 'line',
                coordinates: coords,
                style: {
                    strokeColor: line.line_color || '#9AE59D',
                    strokeWeight: line.line_width || 3,
                    strokeOpacity: 1
                }
            }
        });
    });

    // 转换面
    polygons.forEach(polygon => {
        // API字段名是 pg_position，不是 coordinates
        const coordsField = polygon.pg_position;

        if (!coordsField) {
            console.warn('面缺少坐标数据:', polygon.polygon_name);
            return;
        }

        let coords = [];
        try {
            if (typeof coordsField === 'string') {
                // 检查是否是分号分隔的格式: "lng,lat;lng,lat;..."
                if (coordsField.includes(';') && !coordsField.includes('[')) {
                    coords = coordsField.split(';').map(point => {
                        const [lng, lat] = point.split(',').map(Number);
                        return [lng, lat];
                    }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
                    console.log('[转换] 面坐标(分号格式):', polygon.polygon_name, '点数:', coords.length);
                } else {
                    // 尝试直接解析JSON
                    try {
                        coords = JSON.parse(coordsField);
                    } catch (jsonError) {
                        // 如果失败，尝试提取坐标数组部分
                        const match = coordsField.match(/\[\[[\d.,\s\[\]-]+\]\]/);
                        if (match) {
                            coords = JSON.parse(match[0]);
                        } else {
                            throw new Error('无法提取坐标');
                        }
                    }
                }
            } else if (Array.isArray(coordsField)) {
                coords = coordsField;
            } else {
                throw new Error('未知坐标格式');
            }
        } catch (e) {
            console.warn('解析面坐标失败:', polygon.polygon_name, e);
            return;
        }

        // 确保coords是数组格式
        if (!Array.isArray(coords) || coords.length === 0) {
            console.warn('面坐标格式错误:', polygon.polygon_name, coords);
            return;
        }

        features.push({
            name: polygon.polygon_name || '未命名面',
            description: polygon.description || '',
            geometry: {
                type: 'polygon',
                coordinates: coords,
                style: {
                    fillColor: polygon.pg_color || '#CCCCCC',
                    fillOpacity: 0.3,
                    strokeColor: polygon.pg_frame_color || 'transparent',
                    strokeWeight: polygon.pg_frame_width || 0
                }
            }
        });
    });

    return features;
}

/**
 * 恢复路线规划数据
 */
function restoreRoutePlanningData() {
    const routeData = sessionStorage.getItem('routePlanningData');
    if (!routeData) {
        return;
    }

    try {
        const data = JSON.parse(routeData);
        console.log('恢复路线规划数据:', data);

        const startInput = document.getElementById('start-location');
        const endInput = document.getElementById('end-location');

        if (data.startLocation && startInput) {
            startInput.value = data.startLocation;
        }
        if (data.endLocation && endInput) {
            endInput.value = data.endLocation;
        }

        // 恢复途经点
        if (data.waypoints && data.waypoints.length > 0) {
            // 先清空现有途经点
            const waypointsContainer = document.getElementById('waypoints-container');
            if (waypointsContainer) {
                waypointsContainer.innerHTML = '';
            }

            // 添加途经点
            data.waypoints.forEach((waypoint, index) => {
                if (typeof addWaypointToUI === 'function') {
                    addWaypointToUI(waypoint, index);
                }
            });
        }

        // 清除sessionStorage中的数据（已恢复）
        sessionStorage.removeItem('routePlanningData');
    } catch (e) {
        console.error('恢复路线规划数据失败:', e);
    }
}

// 管理员导航页面 JavaScript
// map 变量已在 config.js 中声明，这里直接使用

// 全局变量：存储地图点位数据和摄像头标记
let mapPoints = [];  // 存储所有地图点位数据
let cameraMarkers = [];  // 存储摄像头标记
let isCameraLayerVisible = false;  // 摄像头图层是否可见

// 工地监控页面模式状态：'vehicle'（车辆管理）或 'camera'（监控管理）
let currentAdminDataMode = 'vehicle';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 检查登录状态
    checkLoginStatus();

    // 初始化地图
    initMap();

    // 初始化事件监听
    initEventListeners();

    // 加载项目地图数据
    loadProjectMapData();
});

// 检查登录状态
function checkLoginStatus() {
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
    
    if (!isLoggedIn || (currentUser.role !== 'manager' && !currentUser.isAdmin)) {
        // 未登录或不是管理员，跳转到登录页
        window.location.href = 'login.html';
        return;
    }
    
    console.log('管理员已登录:', currentUser);
}

// 初始化地图
function initMap() {
    // 获取项目中心点（如果有）
    const projectCenter = getProjectCenter();

    // 创建地图实例
    map = new AMap.Map('map-container', {
        zoom: MapConfig.mapConfig.zoom,
        center: projectCenter || [114.305215, 30.593099], // 优先使用项目中心，否则默认武汉
        mapStyle: 'amap://styles/normal',
        viewMode: '2D',
        pitch: 0,
        rotation: 0,
        showLabel: true,
        features: ['bg', 'road', 'building', 'point']
    });

    console.log('管理员地图初始化完成，中心点:', projectCenter || '默认');

    // 监听地图加载完成事件
    map.on('complete', function() {
        console.log('[管理员首页] 地图加载完成');

        // 检查是否从搜索页返回并选择了位置
        const selectedLocationStr = sessionStorage.getItem('selectedLocation');
        if (selectedLocationStr) {
            try {
                const selectedLocation = JSON.parse(selectedLocationStr);
                console.log('[管理员首页] 从搜索页返回，选中的位置:', selectedLocation);

                // 清除标记，避免重复处理
                sessionStorage.removeItem('selectedLocation');

                // 保存待处理的位置，等待KML数据加载完成后处理
                window.pendingSelectedLocation = selectedLocation;
            } catch (e) {
                console.error('[管理员首页] 处理选中位置失败:', e);
            }
        }
    });
}

// 获取项目中心点
function getProjectCenter() {
    try {
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

        if (projectSelection) {
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

            if (selectedProject && selectedProject.longitude && selectedProject.latitude) {
                return [selectedProject.longitude, selectedProject.latitude];
            }
        }
    } catch (e) {
        console.error('获取项目中心点失败:', e);
    }
    return null;
}

// 加载项目地图数据（点、线、面）- 使用与司机端相同的处理逻辑
async function loadProjectMapData() {
    try {
        // 1. 获取项目选择信息
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
        
        let projectId = null;
        let projectName = '所有项目';
        let projectCenter = null;
        
        if (projectSelection) {
            const selection = JSON.parse(projectSelection);
            projectName = selection.project;

            // 从用户的项目列表中找到选择的项目
            const userProjects = currentUser.projects || [];
            console.log('[管理端] 用户项目列表:', userProjects);
            console.log('[管理端] 选择的项目名称:', projectName);
            console.log('[管理端] 选择的项目Code:', selection.projectCode);

            // 优先使用 projectCode 精确匹配，避免重名项目混淆
            let selectedProject = null;
            if (selection.projectCode) {
                selectedProject = userProjects.find(p =>
                    (p.projectCode === selection.projectCode) || (p.id === selection.projectCode)
                );
                console.log('[管理端] 通过projectCode匹配:', selectedProject ? '成功' : '失败');
            }

            // 如果projectCode匹配失败，回退到名称匹配
            if (!selectedProject) {
                selectedProject = userProjects.find(p => p.projectName === projectName);
                console.log('[管理端] 通过projectName匹配:', selectedProject ? '成功' : '失败');
            }

            if (selectedProject) {
                // projectCode 才是API需要的项目ID
                projectId = selectedProject.projectCode || selectedProject.id;
                if (selectedProject.longitude && selectedProject.latitude) {
                    projectCenter = [selectedProject.longitude, selectedProject.latitude];
                }
                console.log('[管理端] 选择的项目:', {
                    name: projectName,
                    id: projectId,
                    center: projectCenter,
                    fullProject: selectedProject
                });
            } else {
                console.warn('[管理端] 未在用户项目列表中找到匹配项目:', projectName);
            }
        }

        // 2. 准备请求headers
        const baseURL = 'https://dmap.cscec3bxjy.cn/api/map';
        const headers = {
            'Content-Type': 'application/json'
        };

        const token = sessionStorage.getItem('authToken') || '';
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // 3. 获取当前启用的地图版本号
        if (!projectId) {
            console.warn('[管理端] 没有项目ID，无法获取地图');
            alert('请先选择项目');
            return;
        }
        
        let versionId = null;
        try {
            console.log('[管理端] 获取项目地图版本...');
            const versionRes = await fetch(`${baseURL}/map-versions/project/${projectId}/active`, { headers });
            
            if (versionRes.ok) {
                const versionData = await versionRes.json();
                console.log('[管理端] 版本信息:', versionData);

                if (versionData.code === 200 && versionData.data) {
                    // 使用 MapVersion_Id 字段（bigint类型）
                    versionId = versionData.data.MapVersion_Id || versionData.data.id;
                    console.log('[管理端] 当前启用版本ID:', versionId);
                }
            }
        } catch (e) {
            console.warn('[管理端] 获取版本信息失败:', e);
        }
        
        // 如果没有版本号，提示无地图
        if (!versionId) {
            console.warn('[管理端] 该项目没有启用的地图版本');
            alert('该项目暂无地图数据');
            
            // 即使没有地图数据，如果有项目中心也设置地图中心
            if (projectCenter && map) {
                map.setCenter(projectCenter);
                map.setZoom(MapConfig.mapConfig.zoom);
            }
            return;
        }

        // 4. 构建请求URL（点使用 /points 接口，线面使用原接口）
        let pointsUrl = `${baseURL}/points?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;
        let polylinesUrl = `${baseURL}/polylines?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;
        let polygonsUrl = `${baseURL}/polygons?page=1&page_size=1000&project_id=${projectId}&map_version_id=${versionId}`;

        console.log('[管理端] 项目ID:', projectId, '版本ID:', versionId);
        console.log('[管理端] 请求URL:', { pointsUrl, polylinesUrl, polygonsUrl });

        // 5. 并行请求数据
        console.log('[管理端] 请求地图数据...');
        const [pointsRes, polylinesRes, polygonsRes] = await Promise.all([
            fetch(pointsUrl, { headers }),
            fetch(polylinesUrl, { headers }),
            fetch(polygonsUrl, { headers })
        ]);

        if (!pointsRes.ok || !polylinesRes.ok || !polygonsRes.ok) {
            console.error('[管理端] API请求失败');
            return;
        }

        // 6. 解析数据
        const pointsData = await pointsRes.json();
        const polylinesData = await polylinesRes.json();
        const polygonsData = await polygonsRes.json();

        let points = pointsData.data?.list || pointsData.data || [];
        let polylines = polylinesData.data?.list || polylinesData.data || [];
        let polygons = polygonsData.data?.list || polygonsData.data || [];

        // 保存点位数据到全局变量（供摄像头功能使用）
        mapPoints = points;
        console.log('[管理端] 保存点位数据:', mapPoints.length, '个点');

        // 【新增】过滤数据：只保留当前版本的数据，去除其他版本的重复数据
        console.log('[管理端] ========== 数据版本过滤 ==========');
        console.log('[管理端] 当前请求的版本ID:', versionId);
        console.log('[管理端] 过滤前数据量 - 点:', points.length, '线:', polylines.length, '面:', polygons.length);

        // 【新增】打印点数据示例，查看字段
        if (points.length > 0) {
            console.log('[管理端] ========== 点数据字段检查 ==========');
            console.log('[管理端] 点数据示例 (完整对象):', points[0]);
            console.log('[管理端] 点数据所有字段名:', Object.keys(points[0]));
            console.log('[管理端] 检查版本字段:');
            console.log('  - map_version_id:', points[0].map_version_id);
            console.log('  - MapVersion_Id:', points[0].MapVersion_Id);
            console.log('  - version_id:', points[0].version_id);
            console.log('  - mapVersionId:', points[0].mapVersionId);
            console.log('[管理端] ==========================================');
        }

        // 统计点数据的版本分布（尝试多个可能的字段名）
        const pointVersions = {};
        points.forEach(point => {
            const v = point.map_version_id || point.MapVersion_Id || point.version_id || '无版本字段';
            pointVersions[v] = (pointVersions[v] || 0) + 1;
        });
        console.log('[管理端] 点数据版本分布:', pointVersions);

        // 统计线数据的版本分布
        const lineVersions = {};
        polylines.forEach(line => {
            const v = line.map_version_id || '无版本字段';
            lineVersions[v] = (lineVersions[v] || 0) + 1;
        });
        console.log('[管理端] 线数据版本分布:', lineVersions);

        // 统计面数据的版本分布
        const polygonVersions = {};
        polygons.forEach(polygon => {
            const v = polygon.map_version_id || '无版本字段';
            polygonVersions[v] = (polygonVersions[v] || 0) + 1;
        });
        console.log('[管理端] 面数据版本分布:', polygonVersions);

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
            if (!line.map_version_id) return true;
            return line.map_version_id == versionId;
        });
        const linesFiltered = linesBeforeFilter - polylines.length;

        // 过滤面数据
        const polygonsBeforeFilter = polygons.length;
        polygons = polygons.filter(polygon => {
            if (!polygon.map_version_id) return true;
            return polygon.map_version_id == versionId;
        });
        const polygonsFiltered = polygonsBeforeFilter - polygons.length;

        console.log('[管理端] 过滤后数据量 - 点:', points.length, '线:', polylines.length, '面:', polygons.length);
        console.log('[管理端] 已过滤 - 点:', pointsFiltered, '个, 线:', linesFiltered, '条, 面:', polygonsFiltered, '个');
        console.log('[管理端] =====================================');

        console.log('[管理端] 数据加载成功:', {
            点数量: points.length,
            线数量: polylines.length,
            面数量: polygons.length
        });

        // 7. 使用 APIDataConverter 转换数据（与司机端相同）
        let features = [];
        if (window.APIDataConverter) {
            features = APIDataConverter.convert(points, polylines, polygons);
            console.log('[管理端] 转换后的features数量:', features.length);
        } else {
            console.warn('[管理端] APIDataConverter 不可用，使用简单显示');
            displayMapDataSimple(points, polylines, polygons);
            return;
        }

        // 8. 对线数据进行分割处理（与司机端相同）
        let processedFeatures = features;
        if (typeof processLineIntersections === 'function') {
            try {
                processedFeatures = processLineIntersections(features);
                console.log('[管理端] 线段分割完成，处理后features数量:', processedFeatures.length);
            } catch (e) {
                console.warn('[管理端] 线段分割失败，使用原始数据:', e);
                processedFeatures = features;
            }
        }

        // 8. 构建KML数据对象
        const kmlData = {
            features: processedFeatures,
            fileName: `${projectName} (API数据)`
        };

        // 9. 使用 displayKMLFeatures 显示地图数据（与司机端相同）
        if (processedFeatures.length > 0 && typeof displayKMLFeatures === 'function') {
            window.isFirstKMLImport = true;
            window.kmlData = kmlData;

            console.log('[管理端] 调用displayKMLFeatures显示地图数据');
            displayKMLFeatures(processedFeatures, kmlData.fileName);

            // 保存路线数据到全局变量（供车辆管理器使用）
            window.polylines = window.polylines || [];

            // 地图数据加载完成后，处理待选中的位置（如果有）
            if (typeof handlePendingSelectedLocation === 'function') {
                setTimeout(() => {
                    handlePendingSelectedLocation();
                }, 300);
            }

            // 初始化车辆管理器（延迟一点确保地图完全加载）
            setTimeout(() => {
                if (typeof AdminVehicleManager !== 'undefined' && map) {
                    console.log('[管理端] 初始化车辆管理器');
                    AdminVehicleManager.init(map);
                }

                // 初始化围栏管理器
                if (typeof AdminFenceManager !== 'undefined' && map && projectId) {
                    console.log('[管理端] 初始化围栏管理器');
                    AdminFenceManager.init(map, projectId);
                }

                // 【新增】自动加载道路状态颜色（不显示摄像头标记）
                console.log('[管理端] 自动加载道路状态颜色...');
                autoLoadRoadStatus();
            }, 500);
        } else {
            console.warn('[管理端] 无地图数据或displayKMLFeatures不可用');
        }

        // 10. 如果有项目中心，设置地图中心和缩放级别
        if (projectCenter && map) {
            console.log('[管理端] 设置地图中心为项目位置:', projectCenter);
            map.setCenter(projectCenter);
            map.setZoom(MapConfig.mapConfig.zoom);
        }

    } catch (error) {
        console.error('[管理端] 加载地图数据失败:', error);
    }
}

// 简单显示数据（备用方案，当 APIDataConverter 不可用时）
function displayMapDataSimple(points, polylines, polygons) {
    if (!map) return;

    // 初始化全局 polylines 数组
    window.polylines = window.polylines || [];

    // 显示点
    points.forEach(point => {
        try {
            const lng = parseFloat(point.longitude);
            const lat = parseFloat(point.latitude);
            if (isNaN(lng) || isNaN(lat)) return;

            const pointName = (point.point_name || point.name || '').toLowerCase();
            if (pointName.includes('new_point') || pointName.includes('new point')) return;

            const marker = new AMap.Marker({
                position: [lng, lat],
                title: point.point_name || point.name || ''
            });
            marker.setMap(map);
        } catch (e) {
            console.warn('创建点标记失败:', e);
        }
    });

    // 显示线
    polylines.forEach(line => {
        try {
            const coordsField = line.line_position || line.coordinates;
            if (!coordsField) return;

            const path = parseLineCoordinates(coordsField);
            if (!path || path.length < 2) return;

            const polyline = new AMap.Polyline({
                path: path,
                strokeColor: line.line_color || '#9AE59D',
                strokeWeight: parseInt(line.line_width) || 4
            });
            polyline.setMap(map);

            // 保存到全局数组（供车辆管理器使用）
            window.polylines.push(polyline);
        } catch (e) {
            console.warn('创建线失败:', e);
        }
    });

    // 显示面
    polygons.forEach(poly => {
        try {
            const coordsField = poly.pg_position || poly.coordinates;
            if (!coordsField) return;

            const path = parseLineCoordinates(coordsField);
            if (!path || path.length < 3) return;

            const polygon = new AMap.Polygon({
                path: path,
                fillColor: poly.pg_color || '#CCCCCC',
                fillOpacity: poly.pg_opacity || 0.7
            });
            polygon.setMap(map);
        } catch (e) {
            console.warn('创建面失败:', e);
        }
    });

    console.log('[管理端] 简单模式地图数据显示完成');
}

// 解析线/面坐标（支持 "lng,lat;lng,lat;..." 格式）- 备用
function parseLineCoordinates(coordsField) {
    if (!coordsField) return null;

    try {
        if (typeof coordsField === 'string') {
            const trimmed = coordsField.trim();
            if (trimmed.includes(';')) {
                return trimmed.split(';')
                    .filter(p => p.trim())
                    .map(point => {
                        const [lng, lat] = point.split(',').map(Number);
                        return [lng, lat];
                    })
                    .filter(p => !isNaN(p[0]) && !isNaN(p[1]));
            } else if (trimmed.startsWith('[')) {
                return JSON.parse(trimmed);
            }
        } else if (Array.isArray(coordsField)) {
            return coordsField;
        }
    } catch (e) {
        console.warn('坐标解析失败:', e);
    }
    return null;
}

// 初始化事件监听
function initEventListeners() {
    // 底部导航切换
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            handleNavigation(page);
        });
    });
    
    // 搜索框点击 - 跳转到搜索页面（与普通用户首页一致）
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('click', function() {
            console.log('跳转到搜索页面');
            // 保存来源页面
            sessionStorage.setItem('searchReferrer', 'admin_index.html');
            window.location.href = 'search.html';
        });
    }
    
    // 筛选项点击
    const filterItems = document.querySelectorAll('.filter-item');
    filterItems.forEach(item => {
        item.addEventListener('click', function() {
            const filterType = this.querySelector('span').textContent;
            console.log('筛选:', filterType);

            // 如果是车辆筛选，切换车辆图例显示
            if (filterType === '车辆') {
                if (typeof AdminVehicleManager !== 'undefined') {
                    AdminVehicleManager.toggleVehicleLegend();
                }
            }
            // TODO: 实现任务类型和任务状态筛选功能
        });
    });
    
    // 右侧控制按钮
    const locateBtn = document.getElementById('locate-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const vehicleToggleBtn = document.getElementById('vehicle-toggle-btn');
    const modeToggleBtn = document.getElementById('mode-toggle-btn');
    const switchProjectBtn = document.getElementById('switch-project-btn');
    const vehicleLegend = document.getElementById('vehicle-legend');

    // 定位按钮 - 定位到当前位置
    if (locateBtn) {
        locateBtn.addEventListener('click', function() {
            console.log('[定位] 开始获取当前位置...');
            locateToCurrentPosition();
        });
    }

    // 摄像头按钮（旧版）
    if (cameraBtn) {
        cameraBtn.addEventListener('click', function() {
            console.log('[摄像头] 切换摄像头图层显示');
            toggleCameraLayer();
        });
    }

    // 模式切换按钮（工地监控页面专用）
    if (modeToggleBtn) {
        // 默认显示车辆管理模式，初始化时显示车辆图例
        initAdminDataMode();

        modeToggleBtn.addEventListener('click', function() {
            console.log('[模式切换] 当前模式:', currentAdminDataMode);
            toggleAdminDataMode();
        });
    }

    // 切换项目按钮 - 已移除，功能转移至管理员"我的"页面

    // 车辆切换按钮 - 已移到 admin-vehicle-manager.js 中处理
    // 相关逻辑在车辆管理器模块中统一管理

    // 底部卡片展开/收起
    const bottomCard = document.getElementById('bottom-card');
    const cardHandle = document.getElementById('card-handle');
    const mapControls = document.querySelector('.admin-map-controls');
    
    if (cardHandle && bottomCard) {
        cardHandle.addEventListener('click', function() {
            bottomCard.classList.toggle('expanded');
            
            // 卡片展开时，右侧按钮和车辆图例上移
            if (bottomCard.classList.contains('expanded')) {
                if (mapControls) mapControls.classList.add('card-expanded');
                if (vehicleLegend) vehicleLegend.classList.add('card-expanded');
            } else {
                if (mapControls) mapControls.classList.remove('card-expanded');
                if (vehicleLegend) vehicleLegend.classList.remove('card-expanded');
            }
        });
    }
    
    // 起点终点输入框点击 - 跳转到点位选择页面
    const startLocation = document.getElementById('start-location');
    const endLocation = document.getElementById('end-location');
    
    if (startLocation) {
        startLocation.addEventListener('click', function() {
            sessionStorage.setItem('selectingPointType', 'start');
            sessionStorage.setItem('navigationReferrer', 'admin_index.html');
            window.location.href = 'point-selection.html';
        });
    }

    if (endLocation) {
        endLocation.addEventListener('click', function() {
            sessionStorage.setItem('selectingPointType', 'end');
            sessionStorage.setItem('navigationReferrer', 'admin_index.html');
            window.location.href = 'point-selection.html';
        });
    }
    
    // 添加途径点按钮
    const addWaypointBtn = document.getElementById('add-waypoint-btn');
    if (addWaypointBtn) {
        addWaypointBtn.addEventListener('click', function() {
            console.log('添加途径点功能待实现');
            // TODO: 实现添加途径点功能
        });
    }
}

// 处理导航切换
function handleNavigation(page) {
    console.log('导航到:', page);
    
    // 根据不同页面跳转
    switch(page) {
        case 'admin-navigation':
            // 判断当前在哪个页面
            if (window.location.pathname.includes('admin_index.html') ||
                (window.location.pathname.endsWith('/') && !window.location.pathname.includes('admin_data'))) {
                // 当前就是导航页面
            } else {
                window.location.href = 'admin_index.html';
            }
            break;
        case 'admin-data':
            // 跳转到工地监控页面
            if (window.location.pathname.includes('admin_data.html')) {
                // 当前就是工地监控页面
            } else {
                window.location.href = 'admin_data.html';
            }
            break;
        case 'admin-transport':
            window.location.href = 'admin_transport.html';
            break;
        case 'admin-profile':
            window.location.href = 'admin_profile.html';
            break;
    }
}

// ==================== 摄像头功能相关函数 ====================

/**
 * 切换摄像头图层显示
 */
async function toggleCameraLayer() {
    if (isCameraLayerVisible) {
        // 隐藏摄像头图层
        hideCameraLayer();
    } else {
        // 显示摄像头图层
        await showCameraLayer();
    }
}

/**
 * 显示摄像头图层
 */
async function showCameraLayer() {
    try {
        console.log('[摄像头] 开始显示摄像头图层');

        // 获取当前项目ID
        const projectId = getCurrentProjectId();
        if (!projectId) {
            alert('请先选择项目');
            return;
        }

        console.log('[摄像头] 当前项目ID:', projectId);

        // 获取摄像头列表
        const cameras = await fetchCameras(projectId);
        if (!cameras || cameras.length === 0) {
            console.warn('[摄像头] 该项目暂无摄像头数据');
            return;
        }

        console.log('[摄像头] 获取到摄像头数量:', cameras.length);

        // 保存摄像头数据到全局变量
        window.camerasData = cameras;

        // 在地图上显示摄像头
        await displayCamerasOnMap(cameras);

        isCameraLayerVisible = true;

        // 设置按钮为选中状态
        const cameraBtn = document.getElementById('camera-btn');
        if (cameraBtn) {
            cameraBtn.classList.add('active');
        }

        // 自动更新所有摄像头控制的路段颜色
        console.log('[摄像头] 开始自动更新所有路段颜色...');
        for (const camera of cameras) {
            if (camera.start_id && camera.end_id && camera.c_point) {
                await updateRoadSegmentStatus(camera.start_id, camera.end_id, camera.c_point);
            }
        }
        console.log('[摄像头] 所有路段颜色更新完成');

        // 监听地图缩放事件，重新加载摄像头标记
        if (!window.cameraZoomListener) {
            window.cameraZoomListener = function() {
                if (isCameraLayerVisible && window.camerasData) {
                    console.log('[摄像头] 地图缩放，重新加载标记');
                    // 先清除旧标记
                    cameraMarkers.forEach(marker => marker.setMap(null));
                    cameraMarkers = [];
                    // 重新显示
                    displayCamerasOnMap(window.camerasData);
                }
            };
            map.on('zoomend', window.cameraZoomListener);
        }

        console.log('[摄像头] 摄像头图层显示完成');

    } catch (error) {
        console.error('[摄像头] 显示摄像头图层失败:', error);
    }
}

/**
 * 隐藏摄像头图层
 */
function hideCameraLayer() {
    console.log('[摄像头] 隐藏摄像头图层');

    // 移除所有摄像头标记
    cameraMarkers.forEach(marker => {
        if (marker) {
            marker.setMap(null);
        }
    });

    cameraMarkers = [];
    isCameraLayerVisible = false;

    // 移除按钮选中状态
    const cameraBtn = document.getElementById('camera-btn');
    if (cameraBtn) {
        cameraBtn.classList.remove('active');
    }

    console.log('[摄像头] 摄像头图层已隐藏');
}

/**
 * 自动加载并显示道路状态颜色（不显示摄像头标记）
 * 用于司机端和管理端在地图加载时自动显示道路状态
 */
async function autoLoadRoadStatus() {
    try {
        console.log('[道路状态] ========== 开始自动加载道路状态 ==========');

        // 获取当前项目ID
        const projectId = getCurrentProjectId();
        if (!projectId) {
            console.warn('[道路状态] 未找到项目ID，无法加载道路状态');
            return;
        }

        console.log('[道路状态] 当前项目ID:', projectId);

        // 获取摄像头列表（用于获取路段状态）
        const cameras = await fetchCameras(projectId);
        if (!cameras || cameras.length === 0) {
            console.warn('[道路状态] 该项目暂无摄像头数据，无法更新道路状态');
            return;
        }

        console.log('[道路状态] 获取到摄像头数量:', cameras.length);

        // 只更新路段颜色，不显示摄像头标记
        console.log('[道路状态] 开始更新所有路段颜色...');
        let updatedCount = 0;
        for (const camera of cameras) {
            if (camera.start_id && camera.end_id && camera.c_point) {
                await updateRoadSegmentStatus(camera.start_id, camera.end_id, camera.c_point);
                updatedCount++;
            }
        }
        console.log(`[道路状态] ✓ 路段颜色更新完成，共更新 ${updatedCount} 个路段`);

        // 重新构建KML图，确保灰色道路不参与路线规划
        if (typeof buildKMLGraph === 'function') {
            console.log('[道路状态] 重新构建KML图，排除灰色道路...');
            buildKMLGraph();
            console.log('[道路状态] ✓ KML图重新构建完成');
        }

        console.log('[道路状态] ========== 道路状态加载完成 ==========');

    } catch (error) {
        console.error('[道路状态] 自动加载道路状态失败:', error);
    }
}

/**
 * 获取当前项目ID
 */
function getCurrentProjectId() {
    try {
        const projectSelection = sessionStorage.getItem('projectSelection');
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');

        if (projectSelection) {
            const selection = JSON.parse(projectSelection);
            const projectName = selection.project;

            // 从用户的项目列表中找到选择的项目
            const userProjects = currentUser.projects || [];

            // 优先使用 projectCode 精确匹配
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
                return selectedProject.projectCode || selectedProject.id;
            }
        }
    } catch (e) {
        console.error('[摄像头] 获取项目ID失败:', e);
    }
    return null;
}

/**
 * 获取摄像头列表
 * @param {string} projectId - 项目ID
 * @returns {Promise<Array>} 摄像头列表
 */
async function fetchCameras(projectId) {
    try {
        const url = `http://115.159.67.12:8085/api/video/cameras?page=1&page_size=1000&project_id=${projectId}`;
        console.log('[摄像头] 请求URL:', url);

        const token = sessionStorage.getItem('authToken') || '';
        const headers = {
            'accept': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[摄像头] API响应:', data);

        if (data.code === 200 && data.data) {
            // 返回摄像头列表
            return data.data.list || data.data.items || data.data;
        }

        return [];
    } catch (error) {
        console.error('[摄像头] 获取摄像头列表失败:', error);
        throw error;
    }
}

/**
 * 通过pointid获取点位的经纬度
 * @param {string} pointId - 点位ID
 * @returns {Object|null} {longitude, latitude}
 */
function getCameraPosition(pointId) {
    if (!pointId || !mapPoints || mapPoints.length === 0) {
        console.warn('[摄像头] 无法查询点位，pointId:', pointId, 'mapPoints:', mapPoints?.length);
        return null;
    }

    // 在地图点位数据中查找匹配的点
    const point = mapPoints.find(p =>
        p.point_id === pointId ||
        p.id === pointId ||
        p.Point_Id === pointId ||
        String(p.point_id) === String(pointId) ||
        String(p.id) === String(pointId)
    );

    if (point) {
        const lng = parseFloat(point.longitude);
        const lat = parseFloat(point.latitude);

        if (!isNaN(lng) && !isNaN(lat)) {
            console.log('[摄像头] 找到点位坐标:', pointId, '->', [lng, lat]);
            return { longitude: lng, latitude: lat };
        }
    }

    console.warn('[摄像头] 未找到点位:', pointId);
    return null;
}

/**
 * 在地图上显示摄像头标记
 * @param {Array} cameras - 摄像头列表
 */
async function displayCamerasOnMap(cameras) {
    if (!map) {
        console.error('[摄像头] 地图实例不存在');
        return;
    }

    console.log('[摄像头] 开始在地图上显示摄像头...');

    for (const camera of cameras) {
        try {
            // 获取摄像头的点位ID
            const pointId = camera.point_id || camera.pointId;
            if (!pointId) {
                console.warn('[摄像头] 摄像头缺少point_id，跳过显示:', {
                    id: camera.id,
                    name: camera.camera_name,
                    point_id: camera.point_id,
                    完整数据: camera
                });
                continue;
            }

            // 获取点位的经纬度
            const position = getCameraPosition(pointId);
            if (!position) {
                console.warn('[摄像头] 无法获取摄像头位置:', camera.id, 'pointId:', pointId);
                continue;
            }

            // 获取摄像头详情（包含名称）
            let cameraName = camera.camera_name || camera.name || '未命名摄像头';

            // 如果没有名称，尝试获取详情
            if (!camera.camera_name && !camera.name) {
                const details = await getCameraDetails(camera.id);
                if (details && details.camera_name) {
                    cameraName = details.camera_name;
                }
            }

            // 创建自定义HTML内容：图标 + 文本标签 + 指向三角形
            const cameraContent = document.createElement('div');
            cameraContent.className = 'camera-marker-container';
            cameraContent.innerHTML = `
                <div class="camera-label-wrapper">
                    <div class="camera-label-content">
                        <img class="camera-icon" src="images/工地数字导航小程序切图/图标/Property 1=摄像头up-1.png" alt="摄像头" width="20" height="20">
                        <span class="camera-name">${cameraName}</span>
                    </div>
                    <div class="camera-label-arrow"></div>
                </div>
            `;

            // 添加样式（如果还没有添加）
            if (!document.getElementById('camera-marker-styles')) {
                const style = document.createElement('style');
                style.id = 'camera-marker-styles';
                style.textContent = `
                    .camera-marker-container {
                        position: relative;
                        cursor: pointer;
                    }
                    .camera-label-wrapper {
                        position: relative;
                        display: inline-block;
                    }
                    .camera-label-content {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
                        padding: 6px 12px;
                        border-radius: 6px;
                        box-shadow: 0 3px 8px rgba(24, 144, 255, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2);
                        white-space: nowrap;
                        border: 2px solid rgba(255, 255, 255, 0.9);
                    }
                    .camera-label-content:hover {
                        background: linear-gradient(135deg, #40a9ff 0%, #1890ff 100%);
                        box-shadow: 0 4px 12px rgba(24, 144, 255, 0.6), 0 2px 4px rgba(0, 0, 0, 0.3);
                        transform: translateY(-1px);
                        transition: all 0.2s ease;
                    }
                    .camera-icon {
                        flex-shrink: 0;
                        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
                    }
                    .camera-name {
                        color: #ffffff;
                        font-size: 13px;
                        font-weight: 500;
                        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
                        letter-spacing: 0.3px;
                    }
                    .camera-label-arrow {
                        position: absolute;
                        bottom: -8px;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 0;
                        height: 0;
                        border-left: 8px solid transparent;
                        border-right: 8px solid transparent;
                        border-top: 8px solid #096dd9;
                        filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.2));
                    }
                    .camera-label-arrow::before {
                        content: '';
                        position: absolute;
                        top: -10px;
                        left: -8px;
                        width: 0;
                        height: 0;
                        border-left: 8px solid transparent;
                        border-right: 8px solid transparent;
                        border-top: 8px solid rgba(255, 255, 255, 0.9);
                    }
                `;
                document.head.appendChild(style);
            }

            // 创建摄像头标记（使用自定义HTML内容）
            const marker = new AMap.Marker({
                position: [position.longitude, position.latitude],
                content: cameraContent,
                anchor: 'bottom-center',
                extData: {
                    type: 'camera',
                    cameraId: camera.id,
                    cameraName: cameraName,
                    pointId: pointId
                }
            });

            // 添加点击事件
            marker.on('click', function() {
                const data = this.getExtData();
                showCameraInfo(data.cameraId, data.cameraName, camera);
            });

            // 添加到地图
            marker.setMap(map);
            cameraMarkers.push(marker);

            console.log('[摄像头] 添加标记:', cameraName, 'at', [position.longitude, position.latitude]);

        } catch (error) {
            console.error('[摄像头] 创建摄像头标记失败:', error, camera);
        }
    }

    console.log('[摄像头] 共添加', cameraMarkers.length, '个摄像头标记');
}

/**
 * 获取摄像头详情
 * @param {string} cameraId - 摄像头ID
 * @returns {Promise<Object|null>} 摄像头详情
 */
async function getCameraDetails(cameraId) {
    try {
        const url = `http://115.159.67.12:8085/api/video/cameras/${cameraId}`;
        console.log('[摄像头] 获取详情URL:', url);

        const token = sessionStorage.getItem('authToken') || '';
        const headers = {
            'accept': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.code === 200 && data.data) {
            return data.data;
        }

        return null;
    } catch (error) {
        console.error('[摄像头] 获取摄像头详情失败:', error);
        return null;
    }
}

/**
 * 显示摄像头信息窗口
 * @param {string} cameraId - 摄像头ID
 * @param {string} cameraName - 摄像头名称
 * @param {Object} cameraData - 摄像头数据（包含start_id, end_id, c_point）
 */
async function showCameraInfo(cameraId, cameraName, cameraData) {
    console.log('[摄像头] ========== 点击摄像头 ==========');
    console.log('[摄像头] cameraId:', cameraId);
    console.log('[摄像头] cameraName:', cameraName);
    console.log('[摄像头] cameraData 完整数据:', cameraData);
    console.log('[摄像头] start_id:', cameraData.start_id);
    console.log('[摄像头] end_id:', cameraData.end_id);
    console.log('[摄像头] c_point:', cameraData.c_point);

    try {
        // 处理路段状态
        if (cameraData.start_id && cameraData.end_id && cameraData.c_point) {
            console.log('[摄像头] ✓ 摄像头有路段控制数据，开始更新路段状态...');
            await updateRoadSegmentStatus(cameraData.start_id, cameraData.end_id, cameraData.c_point);
        } else {
            console.warn('[摄像头] ✗ 摄像头缺少路段控制数据，跳过路段状态更新');
        }

        // 获取视频流URL
        const videoUrl = cameraData.video_stream_url || cameraData.url || '暂无视频流';

        // 构建信息内容
        let infoContent = `
            <div style="padding: 10px; min-width: 200px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">${cameraName}</h3>
                <p style="margin: 5px 0;"><strong>摄像头ID:</strong> ${cameraId}</p>
                <p style="margin: 5px 0;"><strong>类型:</strong> ${cameraData.camera_type === 1 ? 'AI识别' : '普通'}</p>
        `;

        if (videoUrl !== '暂无视频流') {
            infoContent += `
                <p style="margin: 5px 0;"><strong>视频流URL:</strong></p>
                <p style="margin: 5px 0; word-break: break-all; font-size: 12px;">${videoUrl}</p>
                <button onclick="window.open('${videoUrl}', '_blank')" style="margin-top: 10px; padding: 5px 15px; background: #4A90E2; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    打开视频流
                </button>
            `;
        } else {
            infoContent += `<p style="margin: 5px 0; color: #999;">暂无视频流</p>`;
        }

        infoContent += `</div>`;

        // 创建信息窗口
        const infoWindow = new AMap.InfoWindow({
            content: infoContent,
            offset: new AMap.Pixel(0, -30)
        });

        // 找到对应的标记
        const marker = cameraMarkers.find(m => m.getExtData().cameraId === cameraId);
        if (marker) {
            infoWindow.open(map, marker.getPosition());
        }

        console.log('[摄像头] 视频流URL:', videoUrl);

    } catch (error) {
        console.error('[摄像头] 显示摄像头信息失败:', error);
        alert('显示摄像头信息失败');
    }
}

/**
 * 更新路段状态颜色
 * @param {number} startId - 起点ID
 * @param {number} endId - 终点ID
 * @param {number} cPoint - 检测点ID
 */
async function updateRoadSegmentStatus(startId, endId, cPoint) {
    try {
        console.log('[路段状态] ========== 开始更新路段状态 ==========');
        console.log('[路段状态] start_id:', startId, '类型:', typeof startId);
        console.log('[路段状态] end_id:', endId, '类型:', typeof endId);
        console.log('[路段状态] c_point:', cPoint, '类型:', typeof cPoint);

        // 获取c_point的状态
        const pointDetails = await getPointDetails(cPoint);
        console.log('[路段状态] 点详情完整数据:', JSON.stringify(pointDetails, null, 2));

        if (!pointDetails) {
            console.warn('[路段状态] ✗ 未获取到点详情，无法更新路段颜色');
            return;
        }

        const pointCol = pointDetails.point_col;
        console.log('[路段状态] point_col 原始值:', pointCol, '类型:', typeof pointCol);

        // 根据point_col确定颜色 (0-4)
        let color = '#9AE59D'; // 默认绿色
        if (pointCol === 0 || pointCol === '0') {
            color = '#00FF00'; // 畅通-绿色
            console.log('[路段状态] ✓ 匹配到状态: 畅通(0) -> 绿色');
        } else if (pointCol === 1 || pointCol === '1') {
            color = '#FFFF00'; // 缓行-黄色
            console.log('[路段状态] ✓ 匹配到状态: 缓行(1) -> 黄色');
        } else if (pointCol === 2 || pointCol === '2') {
            color = '#FF0000'; // 拥堵-红色
            console.log('[路段状态] ✓ 匹配到状态: 拥堵(2) -> 红色');
        } else if (pointCol === 3 || pointCol === '3') {
            color = '#808080'; // 阻断-灰色
            console.log('[路段状态] ✓ 匹配到状态: 阻断(3) -> 灰色');
        } else if (pointCol === 4 || pointCol === '4') {
            color = '#000000'; // 未知-黑色
            console.log('[路段状态] ✓ 匹配到状态: 未知(4) -> 黑色');
        } else {
            console.warn('[路段状态] ✗ 未知的point_col值:', pointCol, '使用默认绿色');
        }

        console.log('[路段状态] 最终使用颜色:', color);

        // 获取起点和终点的坐标
        const startPoint = await getPointDetails(startId);
        const endPoint = await getPointDetails(endId);

        if (!startPoint || !endPoint) {
            console.warn('[路段状态] ✗ 无法获取起点或终点坐标');
            return;
        }

        const startCoord = [startPoint.longitude, startPoint.latitude];
        const endCoord = [endPoint.longitude, endPoint.latitude];

        console.log('[路段状态] 起点坐标:', startCoord);
        console.log('[路段状态] 终点坐标:', endCoord);

        // 通过坐标查找并更新线段
        updatePolylineColorByCoords(startCoord, endCoord, color);
        console.log('[路段状态] ========== 路段状态更新完成 ==========');

    } catch (error) {
        console.error('[路段状态] ✗ 更新失败:', error);
    }
}

/**
 * 获取点详情
 * @param {number} pointId - 点ID
 * @returns {Promise<Object|null>}
 */
async function getPointDetails(pointId) {
    try {
        const url = `http://115.159.67.12:8088/api/map/points/${pointId}`;
        console.log('[点详情] 请求URL:', url);

        const token = sessionStorage.getItem('authToken') || '';
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('[点详情] 响应状态:', response.status);

        if (!response.ok) {
            console.warn('[点详情] ✗ 请求失败，状态码:', response.status);
            return null;
        }

        const data = await response.json();
        console.log('[点详情] API返回完整数据:', JSON.stringify(data, null, 2));

        if (data.code === 200 && data.data) {
            console.log('[点详情] ✓ 成功获取点详情');
            return data.data;
        }

        console.warn('[点详情] ✗ 数据格式不正确，code:', data.code);
        return null;
    } catch (error) {
        console.error('[点详情] ✗ 获取失败:', error);
        return null;
    }
}

/**
 * 通过坐标更新线段颜色（优化版：使用最短路径算法精确显色）
 * @param {Array} startCoord - 起点坐标 [lng, lat]
 * @param {Array} endCoord - 终点坐标 [lng, lat]
 * @param {string} color - 颜色
 */
function updatePolylineColorByCoords(startCoord, endCoord, color) {
    console.log('[路段颜色] ========== 通过最短路径算法精确显色 ==========');

    if (!window.polylines || window.polylines.length === 0) {
        console.warn('[路段颜色] ✗ 没有线段数据');
        return;
    }

    console.log('[路段颜色] 总线段数:', window.polylines.length);
    console.log('[路段颜色] 起点坐标:', startCoord);
    console.log('[路段颜色] 终点坐标:', endCoord);
    console.log('[路段颜色] 目标颜色:', color);

    // 1. 构建图结构（如果还没有构建）
    if (!window.roadGraph) {
        console.log('[路段颜色] 构建道路图结构...');
        window.roadGraph = buildRoadGraph(window.polylines);
        console.log('[路段颜色] ✓ 道路图构建完成，节点数:', Object.keys(window.roadGraph.nodes).length);
    }

    // 2. 在图中查找起点和终点对应的节点
    const COORD_THRESHOLD = 0.00001; // 坐标匹配阈值（约1米）
    const startNodeId = findNearestNode(window.roadGraph.nodes, startCoord, COORD_THRESHOLD);
    const endNodeId = findNearestNode(window.roadGraph.nodes, endCoord, COORD_THRESHOLD);

    if (!startNodeId || !endNodeId) {
        console.warn('[路段颜色] ✗ 未找到起点或终点对应的节点');
        console.warn('[路段颜色] 起点节点:', startNodeId);
        console.warn('[路段颜色] 终点节点:', endNodeId);
        return;
    }

    console.log('[路段颜色] ✓ 找到起点节点:', startNodeId);
    console.log('[路段颜色] ✓ 找到终点节点:', endNodeId);

    // 3. 使用 Dijkstra 算法计算最短路径
    const path = dijkstraShortestPath(window.roadGraph, startNodeId, endNodeId);

    if (!path || path.length === 0) {
        console.warn('[路段颜色] ✗ 未找到从起点到终点的路径');
        return;
    }

    console.log('[路段颜色] ✓ 最短路径节点序列:', path);

    // 4. 根据路径中的节点，更新相应的线段颜色
    let updatedCount = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const fromNode = path[i];
        const toNode = path[i + 1];

        // 查找连接这两个节点的线段
        const polylineIndices = window.roadGraph.edges[fromNode]?.[toNode];

        if (polylineIndices && polylineIndices.length > 0) {
            polylineIndices.forEach(index => {
                const polyline = window.polylines[index];
                if (polyline) {
                    polyline.setOptions({
                        strokeColor: color,
                        zIndex: 15
                    });
                    updatedCount++;
                    console.log(`[路段颜色] ✓ 更新线段[${index}] (${fromNode} -> ${toNode}) 颜色:`, color);
                }
            });
        }
    }

    if (updatedCount === 0) {
        console.warn('[路段颜色] ✗ 未更新任何线段');
    } else {
        console.log(`[路段颜色] ✓ 共更新了 ${updatedCount} 条线段`);
    }

    console.log('[路段颜色] ========== 精确显色完成 ==========');
}

/**
 * 构建道路图结构
 * @param {Array} polylines - 线段数组
 * @returns {Object} { nodes: {nodeId: [lng, lat]}, edges: {fromNode: {toNode: [polylineIndices]}} }
 */
function buildRoadGraph(polylines) {
    const nodes = {}; // nodeId -> [lng, lat]
    const edges = {}; // fromNode -> toNode -> [polylineIndices]
    const MERGE_THRESHOLD = 0.000001; // 节点合并阈值（约0.1米）

    polylines.forEach((polyline, polylineIndex) => {
        const path = polyline.getPath();
        if (!path || path.length < 2) return;

        // 提取起点和终点
        const start = [path[0].lng, path[0].lat];
        const end = [path[path.length - 1].lng, path[path.length - 1].lat];

        // 查找或创建起点节点
        const startNodeId = findOrCreateNode(nodes, start, MERGE_THRESHOLD);
        // 查找或创建终点节点
        const endNodeId = findOrCreateNode(nodes, end, MERGE_THRESHOLD);

        // 添加边（双向）
        addEdge(edges, startNodeId, endNodeId, polylineIndex);
        addEdge(edges, endNodeId, startNodeId, polylineIndex);
    });

    return { nodes, edges };
}

/**
 * 查找或创建节点
 * @param {Object} nodes - 节点集合
 * @param {Array} coord - 坐标 [lng, lat]
 * @param {number} threshold - 合并阈值
 * @returns {string} 节点ID
 */
function findOrCreateNode(nodes, coord, threshold) {
    // 查找是否有距离很近的节点（可以合并）
    for (const [nodeId, nodeCoord] of Object.entries(nodes)) {
        const dist = Math.sqrt(
            Math.pow(coord[0] - nodeCoord[0], 2) +
            Math.pow(coord[1] - nodeCoord[1], 2)
        );
        if (dist < threshold) {
            return nodeId;
        }
    }

    // 创建新节点
    const nodeId = `${coord[0].toFixed(6)}_${coord[1].toFixed(6)}`;
    nodes[nodeId] = coord;
    return nodeId;
}

/**
 * 添加边
 * @param {Object} edges - 边集合
 * @param {string} fromNode - 起点节点ID
 * @param {string} toNode - 终点节点ID
 * @param {number} polylineIndex - 线段索引
 */
function addEdge(edges, fromNode, toNode, polylineIndex) {
    if (!edges[fromNode]) {
        edges[fromNode] = {};
    }
    if (!edges[fromNode][toNode]) {
        edges[fromNode][toNode] = [];
    }
    edges[fromNode][toNode].push(polylineIndex);
}

/**
 * 查找距离最近的节点
 * @param {Object} nodes - 节点集合
 * @param {Array} coord - 坐标 [lng, lat]
 * @param {number} threshold - 阈值
 * @returns {string|null} 节点ID
 */
function findNearestNode(nodes, coord, threshold) {
    let nearestNodeId = null;
    let minDist = Infinity;

    for (const [nodeId, nodeCoord] of Object.entries(nodes)) {
        const dist = Math.sqrt(
            Math.pow(coord[0] - nodeCoord[0], 2) +
            Math.pow(coord[1] - nodeCoord[1], 2)
        );
        if (dist < minDist) {
            minDist = dist;
            nearestNodeId = nodeId;
        }
    }

    // 只有距离小于阈值才返回
    if (minDist < threshold) {
        return nearestNodeId;
    }

    return null;
}

/**
 * Dijkstra 最短路径算法
 * @param {Object} graph - 图结构 { nodes, edges }
 * @param {string} startNode - 起点节点ID
 * @param {string} endNode - 终点节点ID
 * @returns {Array|null} 路径节点序列
 */
function dijkstraShortestPath(graph, startNode, endNode) {
    const distances = {}; // 节点 -> 从起点到该节点的最短距离
    const previous = {};  // 节点 -> 前驱节点
    const unvisited = new Set(Object.keys(graph.nodes));

    // 初始化距离
    for (const node of unvisited) {
        distances[node] = Infinity;
    }
    distances[startNode] = 0;

    while (unvisited.size > 0) {
        // 找到未访问节点中距离最小的节点
        let currentNode = null;
        let minDist = Infinity;
        for (const node of unvisited) {
            if (distances[node] < minDist) {
                minDist = distances[node];
                currentNode = node;
            }
        }

        if (currentNode === null || minDist === Infinity) {
            // 无法到达任何未访问节点
            break;
        }

        // 如果到达终点，提前结束
        if (currentNode === endNode) {
            break;
        }

        unvisited.delete(currentNode);

        // 更新相邻节点的距离
        const neighbors = graph.edges[currentNode] || {};
        for (const [neighbor, polylineIndices] of Object.entries(neighbors)) {
            if (!unvisited.has(neighbor)) continue;

            // 计算边的长度（使用线段的实际长度）
            const edgeLength = calculateEdgeLength(
                graph.nodes[currentNode],
                graph.nodes[neighbor]
            );

            const altDistance = distances[currentNode] + edgeLength;
            if (altDistance < distances[neighbor]) {
                distances[neighbor] = altDistance;
                previous[neighbor] = currentNode;
            }
        }
    }

    // 如果无法到达终点
    if (distances[endNode] === Infinity) {
        console.warn('[Dijkstra] 无法从起点到达终点');
        return null;
    }

    // 回溯路径
    const path = [];
    let current = endNode;
    while (current !== undefined) {
        path.unshift(current);
        current = previous[current];
    }

    return path;
}

/**
 * 计算边的长度（Haversine距离）
 * @param {Array} coord1 - 坐标1 [lng, lat]
 * @param {Array} coord2 - 坐标2 [lng, lat]
 * @returns {number} 距离（米）
 */
function calculateEdgeLength(coord1, coord2) {
    const R = 6371000; // 地球半径（米）
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const dLng = (coord2[0] - coord1[0]) * Math.PI / 180;

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// ==================== 工地监控页面模式切换功能 ====================

/**
 * 初始化工地监控页面模式
 * 默认为车辆管理模式，显示车辆图例
 */
function initAdminDataMode() {
    console.log('[模式切换] 初始化工地监控页面模式...');
    currentAdminDataMode = 'vehicle';

    // 显示车辆图例
    const vehicleLegend = document.getElementById('vehicle-legend');
    if (vehicleLegend) {
        vehicleLegend.style.display = 'flex';
    }

    // 确保摄像头图层隐藏
    if (isCameraLayerVisible) {
        hideCameraLayer();
    }

    console.log('[模式切换] 初始化完成，当前模式: 车辆管理');
}

/**
 * 切换工地监控页面模式
 * 在车辆管理和监控管理之间切换
 */
function toggleAdminDataMode() {
    const vehicleLegend = document.getElementById('vehicle-legend');

    if (currentAdminDataMode === 'vehicle') {
        // 切换到监控管理模式
        currentAdminDataMode = 'camera';
        console.log('[模式切换] 切换到监控管理模式');

        // 隐藏车辆图例
        if (vehicleLegend) {
            vehicleLegend.style.display = 'none';
        }

        // 隐藏车辆标记
        if (typeof AdminVehicleManager !== 'undefined') {
            AdminVehicleManager.hideAllVehicles();
        }

        // 显示摄像头图层
        showCameraLayer();

    } else {
        // 切换到车辆管理模式
        currentAdminDataMode = 'vehicle';
        console.log('[模式切换] 切换到车辆管理模式');

        // 隐藏摄像头图层
        hideCameraLayer();

        // 显示车辆图例
        if (vehicleLegend) {
            vehicleLegend.style.display = 'flex';
        }

        // 显示车辆标记
        if (typeof AdminVehicleManager !== 'undefined') {
            AdminVehicleManager.showAllVehicles();
        }
    }
}

// ==================== 定位功能 ====================

/**
 * 定位到当前位置
 * 使用浏览器地理位置API获取当前位置，并在地图上显示
 */
function locateToCurrentPosition() {
    if (!map) {
        console.error('[定位] 地图实例不存在');
        alert('地图未加载完成，请稍后再试');
        return;
    }

    // 检查浏览器是否支持地理位置
    if (!navigator.geolocation) {
        console.error('[定位] 浏览器不支持地理位置');
        alert('您的浏览器不支持定位功能');
        return;
    }

    // 显示定位中提示
    const locateBtn = document.getElementById('locate-btn');
    if (locateBtn) {
        locateBtn.classList.add('locating');
    }

    console.log('[定位] 正在获取当前位置...');

    // 获取当前位置
    navigator.geolocation.getCurrentPosition(
        // 成功回调
        function(position) {
            const lng = position.coords.longitude;
            const lat = position.coords.latitude;
            console.log('[定位] 获取到WGS84坐标:', lng, lat);

            // WGS84 转 GCJ02（高德地图使用GCJ02坐标系）
            let gcjCoord = [lng, lat];
            if (typeof CoordinateConvert !== 'undefined' && CoordinateConvert.wgs84togcj02) {
                gcjCoord = CoordinateConvert.wgs84togcj02(lng, lat);
                console.log('[定位] 转换为GCJ02坐标:', gcjCoord);
            } else {
                // 如果没有坐标转换工具，使用高德API转换
                AMap.convertFrom([lng, lat], 'gps', function(status, result) {
                    if (status === 'complete' && result.locations && result.locations.length > 0) {
                        const gcjLng = result.locations[0].lng;
                        const gcjLat = result.locations[0].lat;
                        console.log('[定位] 高德API转换后坐标:', gcjLng, gcjLat);
                        showCurrentLocation([gcjLng, gcjLat]);
                    } else {
                        // 转换失败，直接使用原坐标（可能有偏差）
                        console.warn('[定位] 坐标转换失败，使用原坐标');
                        showCurrentLocation([lng, lat]);
                    }
                });
                return;
            }

            showCurrentLocation(gcjCoord);
        },
        // 失败回调
        function(error) {
            console.error('[定位] 获取位置失败:', error);
            if (locateBtn) {
                locateBtn.classList.remove('locating');
            }

            let errorMsg = '定位失败';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMsg = '您拒绝了定位权限，请在浏览器设置中允许定位';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMsg = '无法获取位置信息';
                    break;
                case error.TIMEOUT:
                    errorMsg = '定位超时，请重试';
                    break;
            }
            alert(errorMsg);
        },
        // 选项
        {
            enableHighAccuracy: true, // 高精度
            timeout: 10000, // 超时时间10秒
            maximumAge: 0 // 不使用缓存
        }
    );
}

/**
 * 在地图上显示当前位置
 * @param {Array} coord - GCJ02坐标 [lng, lat]
 */
function showCurrentLocation(coord) {
    const locateBtn = document.getElementById('locate-btn');
    if (locateBtn) {
        locateBtn.classList.remove('locating');
    }

    console.log('[定位] 显示当前位置:', coord);

    // 移除之前的定位标记
    if (window.currentLocationMarker) {
        window.currentLocationMarker.setMap(null);
    }

    // 创建定位标记
    const markerContent = document.createElement('div');
    markerContent.className = 'current-location-marker';
    markerContent.innerHTML = `
        <div class="location-dot"></div>
        <div class="location-pulse"></div>
    `;

    // 添加样式（如果还没有添加）
    if (!document.getElementById('current-location-styles')) {
        const style = document.createElement('style');
        style.id = 'current-location-styles';
        style.textContent = `
            .current-location-marker {
                position: relative;
                width: 24px;
                height: 24px;
            }
            .location-dot {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 12px;
                height: 12px;
                background: #4A90E2;
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
                z-index: 2;
            }
            .location-pulse {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                background: rgba(74, 144, 226, 0.3);
                border-radius: 50%;
                animation: pulse 2s ease-out infinite;
                z-index: 1;
            }
            @keyframes pulse {
                0% {
                    transform: translate(-50%, -50%) scale(0.5);
                    opacity: 1;
                }
                100% {
                    transform: translate(-50%, -50%) scale(1.5);
                    opacity: 0;
                }
            }
            .admin-control-btn.locating {
                animation: locating-spin 1s linear infinite;
            }
            @keyframes locating-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // 创建标记
    window.currentLocationMarker = new AMap.Marker({
        position: coord,
        content: markerContent,
        anchor: 'center',
        zIndex: 200
    });

    window.currentLocationMarker.setMap(map);

    // 将地图中心移动到当前位置
    map.setCenter(coord);
    map.setZoom(MapConfig.mapConfig.zoom);

    console.log('[定位] ✓ 定位完成');
}

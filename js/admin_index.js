// 管理员导航页面 JavaScript
// map 变量已在 config.js 中声明，这里直接使用

// 全局变量：存储地图点位数据和摄像头标记
let mapPoints = [];  // 存储所有地图点位数据
let cameraMarkers = [];  // 存储摄像头标记
let isCameraLayerVisible = false;  // 摄像头图层是否可见

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
        zoom: 15,
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
                map.setZoom(15);
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
            }, 500);
        } else {
            console.warn('[管理端] 无地图数据或displayKMLFeatures不可用');
        }

        // 10. 如果有项目中心，设置地图中心和缩放级别
        if (projectCenter && map) {
            console.log('[管理端] 设置地图中心为项目位置:', projectCenter);
            map.setCenter(projectCenter);
            map.setZoom(18); // 更大的缩放级别，能看清工地细节
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
            // TODO: 实现筛选功能
        });
    });
    
    // 右侧控制按钮
    const locateBtn = document.getElementById('locate-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const vehicleToggleBtn = document.getElementById('vehicle-toggle-btn');
    const switchProjectBtn = document.getElementById('switch-project-btn');
    const vehicleLegend = document.getElementById('vehicle-legend');

    // 定位按钮
    if (locateBtn) {
        locateBtn.addEventListener('click', function() {
            console.log('定位功能待实现');
            // TODO: 实现定位功能
        });
    }

    // 摄像头按钮
    if (cameraBtn) {
        cameraBtn.addEventListener('click', function() {
            console.log('[摄像头] 切换摄像头图层显示');
            toggleCameraLayer();
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
            window.location.href = 'point-selection.html';
        });
    }
    
    if (endLocation) {
        endLocation.addEventListener('click', function() {
            sessionStorage.setItem('selectingPointType', 'end');
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
            // 当前就是导航页面
            break;
        case 'admin-data':
            // 跳转到外部工地数据系统
            window.location.href = 'http://sztymap.0x3d.cn:11080/#/pages/login/login';
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
            alert('该项目暂无摄像头数据');
            return;
        }

        console.log('[摄像头] 获取到摄像头数量:', cameras.length);

        // 在地图上显示摄像头
        await displayCamerasOnMap(cameras);

        isCameraLayerVisible = true;

        // 设置按钮为选中状态
        const cameraBtn = document.getElementById('camera-btn');
        if (cameraBtn) {
            cameraBtn.classList.add('active');
        }

        console.log('[摄像头] 摄像头图层显示完成');

    } catch (error) {
        console.error('[摄像头] 显示摄像头图层失败:', error);
        alert('加载摄像头数据失败');
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

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
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
                console.warn('[摄像头] 摄像头缺少point_id:', camera);
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
                        <svg class="camera-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                            <circle cx="12" cy="12" r="10" fill="white"/>
                            <path d="M7 9 L7 15 L10 15 L10 9 Z M12 7.5 L16.5 12 L12 16.5 Z" fill="#1890ff"/>
                        </svg>
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
                offset: new AMap.Pixel(0, -8), // 向上偏移，让箭头指向准确位置
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
                showCameraInfo(data.cameraId, data.cameraName);
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

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json'
            }
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
 */
async function showCameraInfo(cameraId, cameraName) {
    console.log('[摄像头] 点击摄像头:', cameraId, cameraName);

    try {
        // 获取摄像头详情（包含视频流URL）
        const details = await getCameraDetails(cameraId);

        if (!details) {
            alert('无法获取摄像头详情');
            return;
        }

        // 获取视频流URL
        const videoUrl = details.url || details.video_url || details.stream_url || '暂无视频流';

        // 构建信息内容
        let infoContent = `
            <div style="padding: 10px; min-width: 200px;">
                <h3 style="margin: 0 0 10px 0; color: #333;">${cameraName}</h3>
                <p style="margin: 5px 0;"><strong>摄像头ID:</strong> ${cameraId}</p>
                <p style="margin: 5px 0;"><strong>类型:</strong> ${details.camera_type === 1 ? 'AI识别' : '普通'}</p>
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

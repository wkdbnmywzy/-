// 管理员导航页面 JavaScript
// map 变量已在 config.js 中声明，这里直接使用

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
            const selectedProject = userProjects.find(p => p.projectName === projectName);
            
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
            
            const selectedProject = userProjects.find(p => p.projectName === projectName);
            
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

        // 3. 构建请求URL
        let pointsUrl = `${baseURL}/points-with-icons?page=1&page_size=1000`;
        let polylinesUrl = `${baseURL}/polylines?page=1&page_size=1000`;
        let polygonsUrl = `${baseURL}/polygons?page=1&page_size=1000`;
        
        if (projectId) {
            pointsUrl += `&project_id=${projectId}`;
            polylinesUrl += `&project_id=${projectId}`;
            polygonsUrl += `&project_id=${projectId}`;
            console.log('[管理端] 按项目ID筛选:', projectId);
        } else {
            console.log('[管理端] 未指定项目ID，加载所有数据');
        }

        // 4. 并行请求数据
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

        // 5. 解析数据
        const pointsData = await pointsRes.json();
        const polylinesData = await polylinesRes.json();
        const polygonsData = await polygonsRes.json();

        const points = pointsData.data?.list || pointsData.data || [];
        const polylines = polylinesData.data?.list || polylinesData.data || [];
        const polygons = polygonsData.data?.list || polygonsData.data || [];

        console.log('[管理端] 数据加载成功:', {
            点数量: points.length,
            线数量: polylines.length,
            面数量: polygons.length
        });

        // 6. 使用 APIDataConverter 转换数据（与司机端相同）
        let features = [];
        if (window.APIDataConverter) {
            features = APIDataConverter.convert(points, polylines, polygons);
            console.log('[管理端] 转换后的features数量:', features.length);
        } else {
            console.warn('[管理端] APIDataConverter 不可用，使用简单显示');
            displayMapDataSimple(points, polylines, polygons);
            return;
        }

        // 7. 对线数据进行分割处理（与司机端相同）
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
    
    // 搜索框点击
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('click', function() {
            console.log('搜索功能待实现');
            // TODO: 跳转到搜索页面
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
            console.log('摄像头功能待实现');
            // TODO: 实现摄像头功能
        });
    }
    
    // 车辆切换按钮
    if (vehicleToggleBtn && vehicleLegend) {
        vehicleToggleBtn.addEventListener('click', function() {
            // 切换按钮激活状态
            this.classList.toggle('active');
            
            // 切换车辆图例显示/隐藏
            if (vehicleLegend.style.display === 'none') {
                vehicleLegend.style.display = 'flex';
                console.log('车辆图例显示');
            } else {
                vehicleLegend.style.display = 'none';
                console.log('车辆图例隐藏');
            }
        });
    }
    
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

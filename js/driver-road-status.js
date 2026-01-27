// driver-road-status.js
// 司机端道路状态显示功能

/**
 * 自动加载道路状态并显示颜色
 * 在KML数据加载完成后调用
 */
async function autoLoadDriverRoadStatus() {
    console.log('[司机端道路状态] 开始自动加载道路状态...');

    try {
        // 获取所有摄像头数据
        const cameras = await fetchAllCameras();

        if (!cameras || cameras.length === 0) {
            console.warn('[司机端道路状态] 没有摄像头数据');
            // 即使没有摄像头数据，也触发完成回调
            if (typeof window.onRoadStatusLoaded === 'function') {
                window.onRoadStatusLoaded();
            }
            return;
        }

        console.log(`[司机端道路状态] 获取到 ${cameras.length} 个摄像头`);

        // 遍历每个摄像头，更新对应的道路状态
        for (const camera of cameras) {
            if (camera.start_id && camera.end_id && camera.c_point) {
                await updateDriverRoadSegmentStatus(camera.start_id, camera.end_id, camera.c_point);
            }
        }

        console.log('[司机端道路状态] 道路状态加载完成');

        // 触发道路状态加载完成回调
        if (typeof window.onRoadStatusLoaded === 'function') {
            window.onRoadStatusLoaded();
        }
    } catch (error) {
        console.error('[司机端道路状态] 加载失败:', error);
        // 即使失败，也触发完成回调
        if (typeof window.onRoadStatusLoaded === 'function') {
            window.onRoadStatusLoaded();
        }
    }
}

/**
 * 获取所有摄像头数据
 * @returns {Promise<Array>}
 */
async function fetchAllCameras() {
    try {
        // 获取当前项目ID
        const projectId = getCurrentProjectIdDriver();

        if (!projectId) {
            console.warn('[获取摄像头] 无法获取项目ID');
            return [];
        }

        const url = `http://115.159.67.12:8085/api/video/cameras?page=1&page_size=1000&project_id=${projectId}`;
        console.log('[获取摄像头] 请求URL:', url);

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
            console.warn('[获取摄像头] 请求失败，状态码:', response.status);
            return [];
        }

        const data = await response.json();
        console.log('[获取摄像头] API响应:', data);

        if (data.code === 200 && data.data) {
            // 返回摄像头列表
            return data.data.list || data.data.items || data.data;
        }

        console.warn('[获取摄像头] 数据格式不正确:', data);
        return [];
    } catch (error) {
        console.error('[获取摄像头] 请求失败:', error);
        return [];
    }
}

/**
 * 获取当前项目ID（司机端）
 * @returns {string|null}
 */
function getCurrentProjectIdDriver() {
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
        console.error('[司机端] 获取项目ID失败:', e);
    }
    return null;
}

/**
 * 更新道路段状态颜色
 * @param {number} startId - 起点ID
 * @param {number} endId - 终点ID
 * @param {number} cPoint - 检测点ID
 */
async function updateDriverRoadSegmentStatus(startId, endId, cPoint) {
    try {
        console.log('[司机端路段状态] 更新路段:', { startId, endId, cPoint });

        // 获取检测点的状态
        const pointDetails = await getDriverPointDetails(cPoint);

        if (!pointDetails) {
            console.warn('[司机端路段状态] 未获取到检测点详情:', cPoint);
            return;
        }

        const pointCol = pointDetails.point_col;
        console.log('[司机端路段状态] 检测点状态 point_col:', pointCol);

        // 根据point_col确定颜色 (0-4)
        let color = '#9AE59D'; // 默认绿色
        if (pointCol === 0 || pointCol === '0') {
            color = '#00FF00'; // 畅通-绿色
        } else if (pointCol === 1 || pointCol === '1') {
            color = '#FFFF00'; // 缓行-黄色
        } else if (pointCol === 2 || pointCol === '2') {
            color = '#FF0000'; // 拥堵-红色
        } else if (pointCol === 3 || pointCol === '3') {
            color = '#808080'; // 阻断-灰色
        } else if (pointCol === 4 || pointCol === '4') {
            color = '#000000'; // 未知-黑色
        }

        console.log('[司机端路段状态] 路段颜色:', color);

        // 获取起点和终点的坐标
        const startPoint = await getDriverPointDetails(startId);
        const endPoint = await getDriverPointDetails(endId);

        if (!startPoint || !endPoint) {
            console.warn('[司机端路段状态] 无法获取起点或终点坐标');
            return;
        }

        const startCoord = [startPoint.longitude, startPoint.latitude];
        const endCoord = [endPoint.longitude, endPoint.latitude];

        console.log('[司机端路段状态] 起点坐标:', startCoord, '终点坐标:', endCoord);

        // 通过坐标查找并更新线段
        updateDriverPolylineColorByCoords(startCoord, endCoord, color);

    } catch (error) {
        console.error('[司机端路段状态] 更新失败:', error);
    }
}

/**
 * 获取点详情
 * @param {number} pointId - 点ID
 * @returns {Promise<Object|null>}
 */
async function getDriverPointDetails(pointId) {
    try {
        const url = `http://115.159.67.12:8088/api/map/points/${pointId}`;
        const token = sessionStorage.getItem('authToken') || '';

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (data.code === 200 && data.data) {
            return data.data;
        }

        return null;
    } catch (error) {
        console.error('[司机端点详情] 获取失败:', error);
        return null;
    }
}

/**
 * 通过坐标更新线段颜色（使用最短路径算法）
 * @param {Array} startCoord - 起点坐标 [lng, lat]
 * @param {Array} endCoord - 终点坐标 [lng, lat]
 * @param {string} color - 颜色
 */
function updateDriverPolylineColorByCoords(startCoord, endCoord, color) {
    console.log('[司机端路段颜色] 开始更新路段颜色:', { startCoord, endCoord, color });

    if (!window.polylines || window.polylines.length === 0) {
        console.warn('[司机端路段颜色] window.polylines 为空或未定义');
        return;
    }

    console.log('[司机端路段颜色] 当前 polylines 数量:', window.polylines.length);

    // 构建图结构（如果还没有构建）
    if (!window.driverRoadGraph) {
        console.log('[司机端路段颜色] 构建道路图...');
        window.driverRoadGraph = buildDriverRoadGraph(window.polylines);
        console.log('[司机端路段颜色] 道路图构建完成，节点数:', Object.keys(window.driverRoadGraph.nodes).length);
    }

    // 在图中查找起点和终点对应的节点
    const COORD_THRESHOLD = 0.00001; // 坐标匹配阈值（约1米）
    const startNodeId = findDriverNearestNode(window.driverRoadGraph.nodes, startCoord, COORD_THRESHOLD);
    const endNodeId = findDriverNearestNode(window.driverRoadGraph.nodes, endCoord, COORD_THRESHOLD);

    if (!startNodeId && startNodeId !== 0) {
        console.warn('[司机端路段颜色] 未找到起点对应的节点');
        return;
    }

    if (!endNodeId && endNodeId !== 0) {
        console.warn('[司机端路段颜色] 未找到终点对应的节点');
        return;
    }

    console.log('[司机端路段颜色] 找到节点:', { startNodeId, endNodeId });

    // 使用 Dijkstra 算法计算最短路径
    const path = dijkstraDriverShortestPath(window.driverRoadGraph, startNodeId, endNodeId);

    if (!path || path.length === 0) {
        console.warn('[司机端路段颜色] 未找到路径');
        return;
    }

    console.log('[司机端路段颜色] 找到路径，节点数:', path.length);

    // 根据路径中的节点，更新相应的线段颜色
    let updatedCount = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const fromNode = path[i];
        const toNode = path[i + 1];

        // 查找连接这两个节点的线段
        const polylineIndices = window.driverRoadGraph.edges[fromNode]?.[toNode];

        if (polylineIndices && polylineIndices.length > 0) {
            polylineIndices.forEach(index => {
                const polyline = window.polylines[index];
                if (polyline) {
                    polyline.setOptions({
                        strokeColor: color,
                        zIndex: 15
                    });
                    updatedCount++;
                }
            });
        }
    }

    console.log('[司机端路段颜色] 更新完成，共更新了', updatedCount, '条线段');
}

/**
 * 构建道路图结构
 * @param {Array} polylines - 线段数组
 * @returns {Object}
 */
function buildDriverRoadGraph(polylines) {
    const nodes = {}; // nodeId -> [lng, lat]
    const edges = {}; // fromNode -> toNode -> [polylineIndices]
    let nodeIdCounter = 0;

    polylines.forEach((polyline, polylineIndex) => {
        if (!polyline || typeof polyline.getPath !== 'function') {
            return;
        }

        const path = polyline.getPath();
        if (!path || path.length < 2) {
            return;
        }

        // 获取起点和终点
        const startPos = path[0];
        const endPos = path[path.length - 1];

        const startCoord = [startPos.lng, startPos.lat];
        const endCoord = [endPos.lng, endPos.lat];

        // 查找或创建节点
        const startNodeId = findDriverOrCreateNode(nodes, startCoord, 0.00001, nodeIdCounter);
        if (startNodeId >= nodeIdCounter) nodeIdCounter = startNodeId + 1;

        const endNodeId = findDriverOrCreateNode(nodes, endCoord, 0.00001, nodeIdCounter);
        if (endNodeId >= nodeIdCounter) nodeIdCounter = endNodeId + 1;

        // 添加边（双向）
        if (!edges[startNodeId]) edges[startNodeId] = {};
        if (!edges[startNodeId][endNodeId]) edges[startNodeId][endNodeId] = [];
        edges[startNodeId][endNodeId].push(polylineIndex);

        if (!edges[endNodeId]) edges[endNodeId] = {};
        if (!edges[endNodeId][startNodeId]) edges[endNodeId][startNodeId] = [];
        edges[endNodeId][startNodeId].push(polylineIndex);
    });

    return { nodes, edges };
}

/**
 * 查找或创建节点
 * @param {Object} nodes - 节点对象
 * @param {Array} coord - 坐标 [lng, lat]
 * @param {number} threshold - 阈值
 * @param {number} nextId - 下一个节点ID
 * @returns {number}
 */
function findDriverOrCreateNode(nodes, coord, threshold, nextId) {
    // 查找是否已存在相近的节点
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        const distance = Math.sqrt(
            Math.pow(node[0] - coord[0], 2) +
            Math.pow(node[1] - coord[1], 2)
        );
        if (distance < threshold) {
            return parseInt(nodeId);
        }
    }

    // 创建新节点
    nodes[nextId] = coord;
    return nextId;
}

/**
 * 查找最近的节点
 * @param {Object} nodes - 节点对象
 * @param {Array} coord - 坐标 [lng, lat]
 * @param {number} threshold - 阈值
 * @returns {number|null}
 */
function findDriverNearestNode(nodes, coord, threshold) {
    let nearestNodeId = null;
    let minDistance = threshold;

    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        const distance = Math.sqrt(
            Math.pow(node[0] - coord[0], 2) +
            Math.pow(node[1] - coord[1], 2)
        );
        if (distance < minDistance) {
            minDistance = distance;
            nearestNodeId = parseInt(nodeId);
        }
    }

    return nearestNodeId;
}

/**
 * Dijkstra最短路径算法
 * @param {Object} graph - 图结构
 * @param {number} startNode - 起点节点ID
 * @param {number} endNode - 终点节点ID
 * @returns {Array|null}
 */
function dijkstraDriverShortestPath(graph, startNode, endNode) {
    const distances = {};
    const previous = {};
    const unvisited = new Set();

    // 初始化
    for (const nodeId in graph.nodes) {
        const id = parseInt(nodeId);
        distances[id] = Infinity;
        previous[id] = null;
        unvisited.add(id);
    }
    distances[startNode] = 0;

    while (unvisited.size > 0) {
        // 找到未访问节点中距离最小的
        let currentNode = null;
        let minDistance = Infinity;

        for (const nodeId of unvisited) {
            if (distances[nodeId] < minDistance) {
                minDistance = distances[nodeId];
                currentNode = nodeId;
            }
        }

        if (currentNode === null || minDistance === Infinity) {
            break;
        }

        unvisited.delete(currentNode);

        if (currentNode === endNode) {
            break;
        }

        // 更新邻居节点的距离
        const neighbors = graph.edges[currentNode] || {};
        for (const neighborId in neighbors) {
            const neighbor = parseInt(neighborId);
            if (unvisited.has(neighbor)) {
                const currentCoord = graph.nodes[currentNode];
                const neighborCoord = graph.nodes[neighbor];
                const distance = Math.sqrt(
                    Math.pow(neighborCoord[0] - currentCoord[0], 2) +
                    Math.pow(neighborCoord[1] - currentCoord[1], 2)
                );

                const newDistance = distances[currentNode] + distance;
                if (newDistance < distances[neighbor]) {
                    distances[neighbor] = newDistance;
                    previous[neighbor] = currentNode;
                }
            }
        }
    }

    // 重构路径
    if (distances[endNode] === Infinity) {
        return null;
    }

    const path = [];
    let currentNode = endNode;
    while (currentNode !== null) {
        path.unshift(currentNode);
        currentNode = previous[currentNode];
    }

    return path;
}

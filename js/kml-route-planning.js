// kml-route-planning.js
// 基于KML路径的路径规划功能

// 全局变量
let kmlGraph = null;
let kmlNodes = [];
let kmlEdges = [];

// 构建KML路径图
function buildKMLGraph() {
    kmlNodes = [];
    kmlEdges = [];

    if (!kmlLayers || kmlLayers.length === 0) {
        console.warn('没有KML数据用于路径规划');
        return false;
    }

    console.log('使用导入时已分割的KML数据构建路径图...');

    // 从KML图层中提取线路信息
    // 注意:线段已经在导入时被分割,每条线的端点都是连接点或交点
    kmlLayers.forEach(function(layer, layerIndex) {
        if (!layer.visible) return;

        layer.markers.forEach(function(marker, markerIndex) {
            // 跳过没有 getExtData 方法的对象
            if (!marker || typeof marker.getExtData !== 'function') {
                return;
            }

            const extData = marker.getExtData();

            if (extData && extData.type === '线') {
                // 确保 marker 有 getPath 方法（是 Polyline 对象）
                if (typeof marker.getPath !== 'function') {
                    console.warn('Marker 没有 getPath 方法，跳过:', marker);
                    return;
                }

                let path;
                try {
                    path = marker.getPath();
                } catch (error) {
                    console.error('获取路径时出错:', error, marker);
                    return;
                }

                if (path && path.length > 1) {
                    // 验证并过滤有效坐标
                    const validPath = [];
                    for (let i = 0; i < path.length; i++) {
                        const coord = path[i];
                        // 检查坐标是否有效
                        if (coord &&
                            (coord.lng !== undefined && coord.lat !== undefined) &&
                            !isNaN(coord.lng) && !isNaN(coord.lat) &&
                            isFinite(coord.lng) && isFinite(coord.lat)) {
                            validPath.push(coord);
                        } else if (coord &&
                                   Array.isArray(coord) &&
                                   coord.length >= 2 &&
                                   !isNaN(coord[0]) && !isNaN(coord[1]) &&
                                   isFinite(coord[0]) && isFinite(coord[1])) {
                            validPath.push({lng: coord[0], lat: coord[1]});
                        } else {
                            console.warn('坐标无效:', coord);
                        }
                    }

                    // 每个线段直接使用起点和终点作为节点
                    // 由于线段已经在导入时被分割,所以不需要再检测交点
                    const startNode = findOrCreateNode(validPath[0]);
                    const endNode = findOrCreateNode(validPath[validPath.length - 1]);

                    if (startNode && endNode) {
                        // 计算线段总距离
                        let segmentDistance = 0;
                        for (let j = 0; j < validPath.length - 1; j++) {
                            segmentDistance += calculateDistance(validPath[j], validPath[j + 1]);
                        }

                        // 创建边，保存完整路径坐标（用于渲染）
                        addEdge(startNode.id, endNode.id, segmentDistance, validPath);
                    }
                }
            }
        });
    });

    // 由于线段已经在导入时处理,不再需要检测交点和分割
    // 直接构建图结构
    kmlGraph = buildAdjacencyList();

    console.log(`路径图构建完成: ${kmlNodes.length}个节点, ${kmlEdges.length}条边`);

    // 调试：输出图的连通性信息
    console.log('图结构调试信息:');
    const nodeConnectivity = {};
    for (let i = 0; i < kmlNodes.length; i++) {
        const neighbors = kmlGraph[i] || [];
        nodeConnectivity[i] = neighbors.length;
    }
    console.log('每个节点的邻居数量:', nodeConnectivity);

    // 检查孤立节点
    const isolatedNodes = Object.keys(nodeConnectivity).filter(id => nodeConnectivity[id] === 0);
    if (isolatedNodes.length > 0) {
        console.warn(`发现${isolatedNodes.length}个孤立节点（无连接）:`, isolatedNodes);
    }

    return kmlNodes.length > 0 && kmlEdges.length > 0;
}

// 查找或创建节点
function findOrCreateNode(coordinate) {
    // 使用较大的容差专门用于合并分割后的交点
    // 因为同一个交点在不同线段中可能作为终点和起点存储两次
    const tolerance = 5.0; // 5米容差，足够合并交点但不会误合并不同的点

    // 提取经纬度
    let lng, lat;
    if (coordinate.lng !== undefined && coordinate.lat !== undefined) {
        lng = coordinate.lng;
        lat = coordinate.lat;
    } else if (Array.isArray(coordinate) && coordinate.length >= 2) {
        lng = coordinate[0];
        lat = coordinate[1];
    } else {
        console.error('无效的坐标格式:', coordinate);
        return null;
    }

    // 验证坐标
    if (isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
        console.error('坐标包含无效值:', {lng, lat});
        return null;
    }

    // 查找是否已存在相近的节点
    const existingNode = kmlNodes.find(node => {
        const dist = calculateDistance({lng, lat}, {lng: node.lng, lat: node.lat});
        return dist < tolerance;
    });

    if (existingNode) {
        return existingNode;
    }

    // 创建新节点
    const newNode = {
        id: kmlNodes.length,
        lng: lng,
        lat: lat
    };

    kmlNodes.push(newNode);
    return newNode;
}

// 添加边
function addEdge(startId, endId, distance, coordinates) {
    if (startId === endId) {
        console.warn('检测到自环边，已跳过 (节点' + startId + ')');
        return;
    }

    // 检查是否已存在该边
    const existingEdge = kmlEdges.find(edge =>
        (edge.start === startId && edge.end === endId) ||
        (edge.start === endId && edge.end === startId)
    );

    if (!existingEdge) {
        kmlEdges.push({
            start: startId,
            end: endId,
            distance: distance,
            coordinates: coordinates || [] // 保存边上的完整坐标点
        });
    }
}

// 构建邻接表
function buildAdjacencyList() {
    const graph = {};

    // 初始化所有节点
    kmlNodes.forEach(node => {
        graph[node.id] = [];
    });

    // 添加边（包含坐标信息）
    kmlEdges.forEach(edge => {
        graph[edge.start].push({
            node: edge.end,
            distance: edge.distance,
            coordinates: edge.coordinates || []
        });
        graph[edge.end].push({
            node: edge.start,
            distance: edge.distance,
            coordinates: edge.coordinates ? edge.coordinates.slice().reverse() : []
        });
    });

    return graph;
}

// 查找最近的KML节点
function findNearestKMLNode(coordinate) {
    if (kmlNodes.length === 0) return null;

    let nearestNode = null;
    let minDistance = Infinity;

    kmlNodes.forEach(node => {
        const distance = calculateDistance(coordinate, [node.lng, node.lat]);
        if (distance < minDistance) {
            minDistance = distance;
            nearestNode = node;
        }
    });

    return nearestNode;
}

// Dijkstra算法实现
function dijkstra(startNodeId, endNodeId) {
    if (!kmlGraph || !kmlGraph[startNodeId] || !kmlGraph[endNodeId]) {
        console.error('Dijkstra算法输入检查失败:', {
            图是否存在: !!kmlGraph,
            起点节点是否在图中: kmlGraph ? !!kmlGraph[startNodeId] : false,
            终点节点是否在图中: kmlGraph ? !!kmlGraph[endNodeId] : false,
            起点邻居数量: kmlGraph && kmlGraph[startNodeId] ? kmlGraph[startNodeId].length : 0,
            终点邻居数量: kmlGraph && kmlGraph[endNodeId] ? kmlGraph[endNodeId].length : 0
        });
        return null;
    }

    const distances = {};
    const previous = {};
    const previousEdge = {}; // 记录每个节点的前驱边（包含坐标信息）
    const unvisited = new Set();

    // 初始化距离
    kmlNodes.forEach(node => {
        distances[node.id] = Infinity;
        previous[node.id] = null;
        previousEdge[node.id] = null;
        unvisited.add(node.id);
    });

    distances[startNodeId] = 0;

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
            break; // 无法到达
        }

        unvisited.delete(currentNode);

        // 如果到达目标节点
        if (currentNode === endNodeId) {
            console.log('Dijkstra算法找到终点，总距离:', distances[endNodeId], '米');
            break;
        }

        // 更新邻居节点的距离
        const neighbors = kmlGraph[currentNode] || [];
        neighbors.forEach(neighbor => {
            if (unvisited.has(neighbor.node)) {
                const newDistance = distances[currentNode] + neighbor.distance;
                if (newDistance < distances[neighbor.node]) {
                    distances[neighbor.node] = newDistance;
                    previous[neighbor.node] = currentNode;
                    previousEdge[neighbor.node] = neighbor; // 保存边信息（包含坐标）
                }
            }
        });
    }

    // 重构路径（使用边上的完整坐标）
    const path = [];
    let currentNode = endNodeId;

    // 检查是否找到了路径
    if (distances[endNodeId] === Infinity) {
        console.error('起点和终点在图中不连通！无法找到路径');
        console.log('调试信息:', {
            总节点数: kmlNodes.length,
            总边数: kmlEdges.length,
            起点到终点的距离: distances[endNodeId],
            起点邻居: kmlGraph[startNodeId],
            终点邻居: kmlGraph[endNodeId]
        });
        return null;
    }

    while (currentNode !== null) {
        const edge = previousEdge[currentNode];
        if (edge && edge.coordinates && edge.coordinates.length > 0) {
            // 使用边上保存的完整坐标点
            const edgeCoords = edge.coordinates.map(coord => {
                if (coord.lng !== undefined && coord.lat !== undefined) {
                    return [coord.lng, coord.lat];
                } else if (Array.isArray(coord) && coord.length >= 2) {
                    return [coord[0], coord[1]];
                }
                return null;
            }).filter(c => c !== null);

            // 添加边上的所有坐标（倒序，因为是从终点往回走）
            for (let i = edgeCoords.length - 1; i >= 0; i--) {
                path.unshift(edgeCoords[i]);
            }
        } else {
            // 如果边没有保存坐标，回退到使用节点坐标
            const node = kmlNodes.find(n => n.id === currentNode);
            if (node) {
                path.unshift([node.lng, node.lat]);
            }
        }
        currentNode = previous[currentNode];
    }

    // 去重相邻的重复点
    const uniquePath = [];
    for (let i = 0; i < path.length; i++) {
        if (i === 0 || path[i][0] !== path[i-1][0] || path[i][1] !== path[i-1][1]) {
            uniquePath.push(path[i]);
        }
    }

    // 检测并移除回溯段（A->B->A模式）
    // 这种情况发生在路径中包含不必要的往返
    const cleanedPath = [];
    let i = 0;
    while (i < uniquePath.length) {
        cleanedPath.push(uniquePath[i]);

        // 检查是否存在回溯：当前点在后续路径中重复出现
        let backtrackIndex = -1;
        for (let j = i + 2; j < uniquePath.length; j++) {
            const current = uniquePath[i];
            const future = uniquePath[j];

            // 如果坐标非常接近（小于0.00001度），认为是同一点
            if (Math.abs(current[0] - future[0]) < 0.00001 &&
                Math.abs(current[1] - future[1]) < 0.00001) {
                backtrackIndex = j;
                break;
            }
        }

        if (backtrackIndex !== -1) {
            // 发现回溯，跳过中间的所有点
            console.log(`检测到回溯: 索引${i}到${backtrackIndex}`);
            i = backtrackIndex;
        } else {
            i++;
        }
    }

    console.log(`Dijkstra路径处理: 原始${path.length}点 -> 去重${uniquePath.length}点 -> 清理回溯${cleanedPath.length}点`);

    if (cleanedPath.length === 0) {
        console.error('清理回溯后路径为空！原始路径:', path);
        return null; // 无路径
    }

    return {
        path: cleanedPath,
        distance: distances[endNodeId]
    };
}

// 查找距离某点最近的KML线段及其投影点
function findNearestKMLSegment(coordinate) {
    let minDistance = Infinity;
    let nearestSegment = null;
    let projectionPoint = null;
    let projectionInfo = null;

    const coordLng = Array.isArray(coordinate) ? coordinate[0] : coordinate.lng;
    const coordLat = Array.isArray(coordinate) ? coordinate[1] : coordinate.lat;

    // 遍历所有边，找到最近的线段
    kmlEdges.forEach((edge, edgeIdx) => {
        if (!edge.coordinates || edge.coordinates.length < 2) return;

        // 遍历边上的每个线段
        for (let i = 0; i < edge.coordinates.length - 1; i++) {
            const p1 = edge.coordinates[i];
            const p2 = edge.coordinates[i + 1];

            const p1Lng = p1.lng !== undefined ? p1.lng : p1[0];
            const p1Lat = p1.lat !== undefined ? p1.lat : p1[1];
            const p2Lng = p2.lng !== undefined ? p2.lng : p2[0];
            const p2Lat = p2.lat !== undefined ? p2.lat : p2[1];

            // 计算点到线段的投影点和距离
            const projection = projectPointToSegment(
                {lng: coordLng, lat: coordLat},
                {lng: p1Lng, lat: p1Lat},
                {lng: p2Lng, lat: p2Lat}
            );

            if (projection.distance < minDistance) {
                minDistance = projection.distance;
                projectionPoint = projection.point;
                nearestSegment = edge;
                projectionInfo = {
                    segmentIndex: i,
                    t: projection.t,  // 保存投影参数
                    isAtStart: projection.t <= 0.01,  // 容差0.01，避免浮点误差
                    isAtEnd: projection.t >= 0.99,
                    edgeIndex: edgeIdx,
                    segmentStart: [p1Lng, p1Lat],
                    segmentEnd: [p2Lng, p2Lat]
                };
            }
        }
    });

    if (!nearestSegment || !projectionPoint) {
        console.error('未找到最近的KML线段');
        return null;
    }

    return {
        edge: nearestSegment,
        projectionPoint: projectionPoint,
        distance: minDistance,
        info: projectionInfo
    };
}

// 计算点到线段的投影点和距离
function projectPointToSegment(point, segStart, segEnd) {
    const dx = segEnd.lng - segStart.lng;
    const dy = segEnd.lat - segStart.lat;

    if (dx === 0 && dy === 0) {
        // 线段退化为点
        return {
            point: {lng: segStart.lng, lat: segStart.lat},
            distance: calculateDistance(point, segStart)
        };
    }

    // 计算投影参数 t
    const t = ((point.lng - segStart.lng) * dx + (point.lat - segStart.lat) * dy) / (dx * dx + dy * dy);

    let projectionPoint;
    if (t < 0) {
        // 投影点在线段起点之前
        projectionPoint = {lng: segStart.lng, lat: segStart.lat};
    } else if (t > 1) {
        // 投影点在线段终点之后
        projectionPoint = {lng: segEnd.lng, lat: segEnd.lat};
    } else {
        // 投影点在线段上
        projectionPoint = {
            lng: segStart.lng + t * dx,
            lat: segStart.lat + t * dy
        };
    }

    const distance = calculateDistance(point, projectionPoint);

    return {
        point: projectionPoint,
        distance: distance,
        t: t  // 投影参数，用于判断位置
    };
}

// 基于KML的路径规划
function planKMLRoute(startCoordinate, endCoordinate) {
    console.log('开始KML路径规划:', {
        起点: startCoordinate,
        终点: endCoordinate
    });

    // 构建或更新KML图
    if (!kmlGraph) {
        const success = buildKMLGraph();
        if (!success) {
            console.error('KML图构建失败');
            return null;
        }
    }

    // 找到起点和终点最近的KML线段
    const startSegment = findNearestKMLSegment(startCoordinate);
    const endSegment = findNearestKMLSegment(endCoordinate);

    if (!startSegment || !endSegment) {
        console.error('无法找到合适的KML线段');
        return null;
    }

    console.log('找到最近的线段:', {
        起点最近线段距离: `${startSegment.distance.toFixed(2)}米`,
        终点最近线段距离: `${endSegment.distance.toFixed(2)}米`
    });

    let actualStartNodeId = null;
    let actualEndNodeId = null;

    // 处理起点
    const startEdge = startSegment.edge;
    const startInfo = startSegment.info;

    // 检查投影点是否在线段端点附近
    if (startInfo.isAtStart) {
        // 投影点在线段起点，直接使用边的起点节点
        actualStartNodeId = startEdge.start;
    } else if (startInfo.isAtEnd) {
        // 投影点在线段终点，直接使用边的终点节点
        actualStartNodeId = startEdge.end;
    } else {
        // 投影点在线段中间，需要分割边并创建新节点
        const tempStartNode = {
            id: kmlNodes.length,
            lng: startSegment.projectionPoint.lng,
            lat: startSegment.projectionPoint.lat
        };
        kmlNodes.push(tempStartNode);
        actualStartNodeId = tempStartNode.id;

        // 分割边
        splitEdgeAtPoint(startEdge, startSegment.projectionPoint, tempStartNode, startInfo.segmentIndex);
    }

    // 处理终点
    const endEdge = endSegment.edge;
    const endInfo = endSegment.info;

    // 获取边的实际起点和终点坐标
    const edgeStartNode = kmlNodes.find(n => n.id === endEdge.start);
    const edgeEndNode = kmlNodes.find(n => n.id === endEdge.end);

    // 不依赖isAtStart/isAtEnd，而是计算投影点到边的起点和终点的实际距离
    const distToStart = edgeStartNode ? calculateDistance(endSegment.projectionPoint, edgeStartNode) : Infinity;
    const distToEnd = edgeEndNode ? calculateDistance(endSegment.projectionPoint, edgeEndNode) : Infinity;
    const threshold = 0.5; // 0.5米容差

    if (distToStart < threshold) {
        // 投影点非常接近边的起点
        actualEndNodeId = endEdge.start;
    } else if (distToEnd < threshold) {
        // 投影点非常接近边的终点
        actualEndNodeId = endEdge.end;
    } else {
        // 投影点在线段中间，需要分割边
        const tempEndNode = {
            id: kmlNodes.length,
            lng: endSegment.projectionPoint.lng,
            lat: endSegment.projectionPoint.lat
        };
        kmlNodes.push(tempEndNode);
        actualEndNodeId = tempEndNode.id;

        // 分割边
        splitEdgeAtPoint(endEdge, endSegment.projectionPoint, tempEndNode, endInfo.segmentIndex);
    }

    // 重新构建邻接表（如果创建了新节点）
    kmlGraph = buildAdjacencyList();

    console.log('准备使用Dijkstra算法:', {
        起点节点ID: actualStartNodeId,
        终点节点ID: actualEndNodeId,
        起点坐标: kmlNodes.find(n => n.id === actualStartNodeId),
        终点坐标: kmlNodes.find(n => n.id === actualEndNodeId)
    });

    // 使用Dijkstra算法计算路径
    const result = dijkstra(actualStartNodeId, actualEndNodeId);

    if (!result) {
        console.error('Dijkstra算法未找到连接路径');
        return null;
    }

    console.log(`Dijkstra算法返回路径，共${result.path.length}个点`);

    // 验证路径中的所有坐标
    const validPath = [];
    for (let i = 0; i < result.path.length; i++) {
        const coord = result.path[i];
        if (Array.isArray(coord) && coord.length >= 2) {
            const lng = coord[0];
            const lat = coord[1];
            if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
                validPath.push([lng, lat]);
            } else {
                console.error('路径中发现无效坐标:', coord);
            }
        } else {
            console.error('路径中坐标格式错误:', coord);
        }
    }

    console.log(`坐标验证后，有效路径点${validPath.length}个`);

    if (validPath.length < 2) {
        console.error('有效路径点不足，Dijkstra返回的路径:', result.path);
        return null;
    }

    return {
        path: validPath,
        distance: result.distance
    };
}

// 在指定点处分割边
function splitEdgeAtPoint(edge, point, newNode, segmentIndex) {
    if (segmentIndex === undefined || !edge.coordinates || edge.coordinates.length < 2) {
        console.warn('无法分割边：缺少必要信息');
        return;
    }

    // 获取边的起点和终点节点ID
    const edgeStartNodeId = edge.start;
    const edgeEndNodeId = edge.end;

    // 找到分割点在坐标数组中的位置
    const coords = edge.coordinates;

    // 创建两段新的坐标数组
    // 第一段：从边起点到投影点
    const coords1 = coords.slice(0, segmentIndex + 1);
    coords1.push({lng: point.lng, lat: point.lat});

    // 第二段：从投影点到边终点
    const coords2 = [{lng: point.lng, lat: point.lat}];
    coords2.push(...coords.slice(segmentIndex + 1));

    // 计算两段的距离
    let dist1 = 0;
    for (let i = 0; i < coords1.length - 1; i++) {
        dist1 += calculateDistance(coords1[i], coords1[i + 1]);
    }

    let dist2 = 0;
    for (let i = 0; i < coords2.length - 1; i++) {
        dist2 += calculateDistance(coords2[i], coords2[i + 1]);
    }

    // 移除原边
    const edgeIndex = kmlEdges.indexOf(edge);
    if (edgeIndex > -1) {
        kmlEdges.splice(edgeIndex, 1);
    }

    // 添加两条新边
    addEdge(edgeStartNodeId, newNode.id, dist1, coords1);
    addEdge(newNode.id, edgeEndNodeId, dist2, coords2);

    console.log(`边已分割: ${edgeStartNodeId}->${newNode.id}->${edgeEndNodeId}`);
}

// 计算两点之间的距离（米）
function calculateDistance(coord1, coord2) {
    const R = 6371000; // 地球半径（米）

    // 统一坐标格式
    let lng1, lat1, lng2, lat2;

    if (Array.isArray(coord1)) {
        lng1 = coord1[0];
        lat1 = coord1[1];
    } else if (coord1.lng !== undefined && coord1.lat !== undefined) {
        lng1 = coord1.lng;
        lat1 = coord1.lat;
    } else {
        console.error('无效的 coord1 格式:', coord1);
        return 0;
    }

    if (Array.isArray(coord2)) {
        lng2 = coord2[0];
        lat2 = coord2[1];
    } else if (coord2.lng !== undefined && coord2.lat !== undefined) {
        lng2 = coord2.lng;
        lat2 = coord2.lat;
    } else {
        console.error('无效的 coord2 格式:', coord2);
        return 0;
    }

    // 验证坐标有效性
    if (isNaN(lng1) || isNaN(lat1) || isNaN(lng2) || isNaN(lat2)) {
        console.error('坐标包含 NaN:', { lng1, lat1, lng2, lat2 });
        return 0;
    }

    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLat = (lat2 - lat1) * Math.PI / 180;
    const deltaLng = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// 显示KML路径
function displayKMLRoute(routeResult) {
    if (!routeResult || !routeResult.path) return;

    // 清除之前的路径
    clearPreviousRoute();

    // 清理旧的路线Polyline（保留KML线作为底图参考）
    try {
        const allOverlays = map.getAllOverlays();

        allOverlays.forEach(overlay => {
            if (overlay.CLASS_NAME === 'AMap.Polyline') {
                const extData = overlay.getExtData ? overlay.getExtData() : null;
                if (extData && extData.type === '线') {
                    // 这是KML的线，保持可见作为底图参考
                } else if (!extData || extData.type !== '线') {
                    // 清除旧的路线 Polyline
                    map.remove(overlay);
                }
            }
        });
    } catch (e) {
        console.warn('清理覆盖物时出错:', e);
    }

    // 验证并清理路径坐标
    const validPath = [];
    for (let i = 0; i < routeResult.path.length; i++) {
        const coord = routeResult.path[i];
        let lng, lat;

        if (Array.isArray(coord) && coord.length >= 2) {
            lng = coord[0];
            lat = coord[1];
        } else if (coord && coord.lng !== undefined && coord.lat !== undefined) {
            lng = coord.lng;
            lat = coord.lat;
        } else {
            console.error('无效的坐标格式:', coord);
            continue;
        }

        // 验证坐标值有效性
        if (isNaN(lng) || isNaN(lat) || !isFinite(lng) || !isFinite(lat)) {
            console.error('坐标包含无效值:', { lng, lat });
            continue;
        }

        validPath.push([lng, lat]);
    }

    if (validPath.length < 2) {
        console.error('有效路径点不足，无法显示路径');
        alert('路径数据无效，无法显示路线');
        return;
    }

    // 转换为 AMap.LngLat 对象数组
    const amapPath = validPath.map(coord => {
        return new AMap.LngLat(coord[0], coord[1]);
    });

    // 创建路径线 - 使用更醒目的颜色和宽度
    let polyline;
    try {
        polyline = new AMap.Polyline({
            path: amapPath,
            strokeColor: '#00C853',  // 更亮的绿色
            strokeWeight: 8,          // 增加线宽，更容易看到
            strokeOpacity: 1.0,       // 完全不透明
            strokeStyle: 'solid',
            lineJoin: 'round',        // 圆角连接
            lineCap: 'round',         // 圆角端点
            zIndex: 150               // 更高的 z-index，确保在KML线上方
        });

        // 直接添加到地图，不使用延迟
        // 延迟可能导致在某些情况下添加失败
        map.add(polyline);

        // 强制刷新地图渲染
        try {
            map.setZoom(map.getZoom()); // 触发地图重绘
        } catch (refreshError) {
            console.warn('触发地图重绘失败（非关键错误）:', refreshError);
        }
    } catch (error) {
        console.error('创建或添加Polyline时出错:', error);
        console.error('错误详情:', error.stack);
        alert('显示路径时出错: ' + error.message);
        return;
    }

    // 添加起点与终点标记，满足“起点/终点/路径/实时位置”同时展示的需求
    let startMarker = null;
    let endMarker = null;
    try {
        const startIconUrl = (MapConfig && MapConfig.markerStyles && (MapConfig.markerStyles.start?.icon || MapConfig.markerStyles.currentLocation?.icon)) || '';
        const endIconUrl = (MapConfig && MapConfig.markerStyles && (MapConfig.markerStyles.destination?.icon || MapConfig.markerStyles.currentLocation?.icon)) || '';

        // 起点
        if (validPath.length >= 1 && startIconUrl) {
            const sIcon = new AMap.Icon({ size: new AMap.Size(30, 38), image: startIconUrl, imageSize: new AMap.Size(30, 38) });
            startMarker = new AMap.Marker({
                position: validPath[0],
                icon: sIcon,
                offset: new AMap.Pixel(-15, -38),
                zIndex: 150,
                map: map,
                title: '起点'
            });
        }
        // 终点
        if (validPath.length >= 2 && endIconUrl) {
            const eIcon = new AMap.Icon({ size: new AMap.Size(30, 38), image: endIconUrl, imageSize: new AMap.Size(30, 38) });
            endMarker = new AMap.Marker({
                position: validPath[validPath.length - 1],
                icon: eIcon,
                offset: new AMap.Pixel(-15, -38),
                zIndex: 150,
                map: map,
                title: '终点'
            });
        }
    } catch (e) {
        console.warn('创建起终点标记失败:', e);
    }

    // 保存路径对象供后续使用
    window.currentKMLRoute = {
        polyline: polyline,
        startMarker: startMarker,
        endMarker: endMarker,
        path: validPath,  // 使用验证后的路径
        distance: routeResult.distance
    };

    // 调整地图视野以显示完整路径
    // 使用 setBounds 来确保整个路径都在视野内
    if (validPath.length >= 2) {
        try {
            // 创建包含所有路径点的边界
            const bounds = new AMap.Bounds(validPath[0], validPath[0]);
            validPath.forEach(point => {
                bounds.extend(point);
            });

            // 设置地图边界，添加内边距以确保路径不紧贴边缘
            map.setBounds(bounds, false, [50, 50, 50, 50]); // 上右下左的内边距
        } catch (e) {
            console.error('设置地图边界时出错:', e);
            // 备选方案：设置到路径中心点
            try {
                const midLng = (validPath[0][0] + validPath[validPath.length - 1][0]) / 2;
                const midLat = (validPath[0][1] + validPath[validPath.length - 1][1]) / 2;
                map.setCenter([midLng, midLat]);
                map.setZoom(17);
            } catch (e2) {
                console.error('设置地图中心时出错:', e2);
            }
        }
    }

    return polyline;
}

// 清除之前的路径
function clearPreviousRoute() {
    if (window.currentKMLRoute) {
        try {
            if (window.currentKMLRoute.polyline) {
                map.remove(window.currentKMLRoute.polyline);
            }
            if (window.currentKMLRoute.startMarker) {
                map.remove(window.currentKMLRoute.startMarker);
            }
            if (window.currentKMLRoute.endMarker) {
                map.remove(window.currentKMLRoute.endMarker);
            }
        } catch (e) {
            console.warn('清除之前的路径时出错:', e);
        }
        window.currentKMLRoute = null;
    }
}
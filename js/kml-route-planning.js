// kml-route-planning.js
// 基于KML路径的路径规划功能

// 全局变量
let kmlGraph = null;
let kmlNodes = [];
let kmlEdges = [];

/**
 * 重置KML图（用于多段路线规划前清理临时节点）
 * 每次规划可能会添加临时投影节点，多段规划需要从干净状态开始
 */
function resetKMLGraph() {
    kmlGraph = null;
    kmlNodes = [];
    kmlEdges = [];
    console.log('[resetKMLGraph] KML图已重置');
}

// 构建KML路径图
function buildKMLGraph() {
    kmlNodes = [];
    kmlEdges = [];

    // 【调试】检查 kmlLayers 的状态
    console.log('[buildKMLGraph] typeof kmlLayers:', typeof kmlLayers);
    console.log('[buildKMLGraph] kmlLayers:', kmlLayers);
    console.log('[buildKMLGraph] window.kmlLayers:', window.kmlLayers);
    console.log('[buildKMLGraph] kmlLayers === window.kmlLayers:', kmlLayers === window.kmlLayers);

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
                // 检查路段颜色,灰色路段不可通行
                const strokeColor = marker.getOptions ? marker.getOptions().strokeColor : null;
                if (strokeColor === '#808080') {
                    console.log(`跳过灰色路段(不可通行): ${extData.name}`);
                    return;
                }

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
                    // 由于线段已经在导入时被分割,端点就是交点或连接点
                    const startNode = findOrCreateNode(validPath[0]);
                    const endNode = findOrCreateNode(validPath[validPath.length - 1]);

                    if (startNode && endNode) {
                        // 计算线段总距离
                        let segmentDistance = 0;
                        for (let j = 0; j < validPath.length - 1; j++) {
                            segmentDistance += calculateDistance(validPath[j], validPath[j + 1]);
                        }

                        // 创建边，保存完整路径坐标（用于渲染）
                        console.log(`准备添加边 ${extData.name}: validPath.length=${validPath.length}, 起点到终点距离=${segmentDistance.toFixed(2)}米`);
                        addEdge(startNode.id, endNode.id, segmentDistance, validPath);

                        // 调试输出
                        console.log(`添加边: ${extData.name}, 节点${startNode.id}->${endNode.id}, 距离${segmentDistance.toFixed(2)}米`);
                    }
                }
            }
        });
    });

    // 构建图结构
    kmlGraph = buildAdjacencyList();

    console.log(`路径图构建完成: ${kmlNodes.length}个节点, ${kmlEdges.length}条边`);

    // 【连通性修复】使用并查集检测连通分量，然后连接不同分量
    // 这确保整个图是连通的，同时只添加必要的最短连接
    let addedConnections = 0;
    
    // 并查集实现
    const parent = [];
    const rank = [];
    for (let i = 0; i < kmlNodes.length; i++) {
        parent[i] = i;
        rank[i] = 0;
    }
    
    function find(x) {
        if (parent[x] !== x) {
            parent[x] = find(parent[x]); // 路径压缩
        }
        return parent[x];
    }
    
    function union(x, y) {
        const px = find(x);
        const py = find(y);
        if (px === py) return false;
        
        // 按秩合并
        if (rank[px] < rank[py]) {
            parent[px] = py;
        } else if (rank[px] > rank[py]) {
            parent[py] = px;
        } else {
            parent[py] = px;
            rank[px]++;
        }
        return true;
    }
    
    // 根据现有边初始化并查集
    kmlEdges.forEach(edge => {
        union(edge.start, edge.end);
    });
    
    // 统计连通分量数量
    const components = new Set();
    for (let i = 0; i < kmlNodes.length; i++) {
        components.add(find(i));
    }
    console.log(`[连通性修复] 检测到 ${components.size} 个连通分量`);
    
    // 如果有多个连通分量，需要连接它们
    if (components.size > 1) {
        // 收集所有跨分量的潜在连接
        const crossComponentConnections = [];
        
        for (let i = 0; i < kmlNodes.length; i++) {
            for (let j = i + 1; j < kmlNodes.length; j++) {
                // 只考虑不同连通分量的节点
                if (find(i) !== find(j)) {
                    const nodeA = kmlNodes[i];
                    const nodeB = kmlNodes[j];
                    const dist = calculateDistance(
                        {lng: nodeA.lng, lat: nodeA.lat},
                        {lng: nodeB.lng, lat: nodeB.lat}
                    );
                    
                    crossComponentConnections.push({
                        nodeA: i,
                        nodeB: j,
                        dist: dist,
                        coordA: {lng: nodeA.lng, lat: nodeA.lat},
                        coordB: {lng: nodeB.lng, lat: nodeB.lat}
                    });
                }
            }
        }
        
        // 按距离排序
        crossComponentConnections.sort((a, b) => a.dist - b.dist);
        
        // 使用Kruskal算法思想：只添加能连接不同分量的最短边
        for (const conn of crossComponentConnections) {
            if (find(conn.nodeA) !== find(conn.nodeB)) {
                console.log(`[连通性修复] 连接分量: 节点${conn.nodeA}和${conn.nodeB}，距离${conn.dist.toFixed(2)}米`);
                addEdge(conn.nodeA, conn.nodeB, conn.dist, [conn.coordA, conn.coordB]);
                union(conn.nodeA, conn.nodeB);
                addedConnections++;
                
                // 检查是否已经完全连通
                const remainingComponents = new Set();
                for (let i = 0; i < kmlNodes.length; i++) {
                    remainingComponents.add(find(i));
                }
                if (remainingComponents.size === 1) {
                    console.log(`[连通性修复] 图已完全连通`);
                    break;
                }
            }
        }
    }
    
    if (addedConnections > 0) {
        console.log(`[连通性修复] 总共添加了${addedConnections}条连接边`);
        // 重新构建邻接表
        kmlGraph = buildAdjacencyList();
    }

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

    // 检查图的连通性
    console.log('=== 图连通性检查 ===');
    console.log(`总节点数: ${kmlNodes.length}, 总边数: ${kmlEdges.length}`);
    console.log(`孤立节点: ${isolatedNodes.length}个`);
    console.log(`交点数: ${window.kmlIntersectionPoints ? window.kmlIntersectionPoints.length : 0}`);
    
    // 显示前10个节点的连接情况
    for (let i = 0; i < Math.min(10, kmlNodes.length); i++) {
        const neighbors = kmlGraph[i] || [];
        console.log(`节点${i}: 有${neighbors.length}个邻居, 坐标=(${kmlNodes[i].lng.toFixed(6)}, ${kmlNodes[i].lat.toFixed(6)})`);
    }

    return kmlNodes.length > 0 && kmlEdges.length > 0;
}

// 查找或创建节点
function findOrCreateNode(coordinate) {
    // 使用容差来合并节点
    // 注意：容差不能太大，否则短线段的两端会被合并成同一个节点（自环）
    // 3米容差可以合并端点对齐误差，同时保留4-5米的短边
    const tolerance = 3; // 3米容差

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

    // 【交点优先策略】检查当前坐标是否接近任何已知交点
    // 如果是，使用交点坐标代替原始坐标
    if (window.kmlIntersectionPoints && window.kmlIntersectionPoints.length > 0) {
        const nearestIntersection = window.kmlIntersectionPoints.find(inter => {
            const dist = calculateDistance({lng, lat}, {lng: inter.lng, lat: inter.lat});
            return dist < tolerance;
        });
        
        if (nearestIntersection) {
            // 使用交点坐标
            const oldLng = lng, oldLat = lat;
            lng = nearestIntersection.lng;
            lat = nearestIntersection.lat;
            console.log(`节点合并：使用交点坐标 (${oldLng.toFixed(8)}, ${oldLat.toFixed(8)}) -> (${lng.toFixed(8)}, ${lat.toFixed(8)})`);
        }
    }

    // 查找是否已存在相近的节点
    const existingNode = kmlNodes.find(node => {
        const dist = calculateDistance({lng, lat}, {lng: node.lng, lat: node.lat});
        return dist < tolerance;
    });

    if (existingNode) {
        console.log(`节点复用: ID=${existingNode.id}, 坐标=(${existingNode.lng.toFixed(8)}, ${existingNode.lat.toFixed(8)})`);
        return existingNode;
    }

    // 创建新节点
    const newNode = {
        id: kmlNodes.length,
        lng: lng,
        lat: lat
    };

    kmlNodes.push(newNode);
    console.log(`节点创建: ID=${newNode.id}, 坐标=(${newNode.lng.toFixed(8)}, ${newNode.lat.toFixed(8)})`);
    return newNode;
}

// 添加边
function addEdge(startId, endId, distance, coordinates) {
    console.log(`addEdge 被调用: startId=${startId}, endId=${endId}, distance=${distance.toFixed(2)}, coordinates.length=${coordinates ? coordinates.length : 0}`);

    if (startId === endId) {
        console.warn(`检测到自环边，已跳过 (节点${startId}, 距离${distance.toFixed(2)}米) - 这可能是节点合并容差设置过大导致的`);
        return;
    }

    // 检查是否为极短的无效边（小于0.1米）
    if (distance < 0.1) {
        console.warn(`检测到极短边，已跳过 (节点${startId}->${endId}, 距离${distance.toFixed(4)}米) - 可能是交点计算误差`);
        return;
    }

    // 检查是否已存在该边
    const existingEdge = kmlEdges.find(edge =>
        (edge.start === startId && edge.end === endId) ||
        (edge.start === endId && edge.end === startId)
    );

    if (!existingEdge) {
        const edgeData = {
            start: startId,
            end: endId,
            distance: distance,
            coordinates: coordinates || [] // 保存边上的完整坐标点
        };
        kmlEdges.push(edgeData);
        console.log(`边已添加到 kmlEdges: 节点${startId}->${endId}, 坐标数=${edgeData.coordinates.length}`);
    } else {
        console.log(`边已存在，跳过: 节点${startId}->${endId}`);
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
        console.log(`buildAdjacencyList 处理边: ${edge.start}->${edge.end}, coordinates.length=${edge.coordinates ? edge.coordinates.length : 0}`);

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

    // 验证构建后的图
    console.log('邻接表构建完成，验证第一个节点的邻居:');
    if (graph[0] && graph[0].length > 0) {
        console.log(`节点0的第一个邻居: node=${graph[0][0].node}, coordinates.length=${graph[0][0].coordinates.length}`);
    }

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
                    // 调试：检查边的坐标数量
                    if (neighbor.coordinates) {
                        console.log(`更新节点${neighbor.node}: 坐标数=${neighbor.coordinates.length}`);
                    }
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

            console.log(`添加边坐标: 从节点${previous[currentNode]}到${currentNode}, 坐标数:${edgeCoords.length}`);

            // 添加边上的所有坐标（倒序，因为是从终点往回走）
            for (let i = edgeCoords.length - 1; i >= 0; i--) {
                path.unshift(edgeCoords[i]);
            }
        } else {
            // 如果边没有保存坐标，回退到使用节点坐标
            const node = kmlNodes.find(n => n.id === currentNode);
            if (node) {
                console.log(`添加节点坐标: 节点${currentNode}`);
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

// 查找距离某点最近的KML线段及其投影点（智能版：考虑方向）
function findNearestKMLSegmentSmart(coordinate, targetCoordinate, pointType) {
    // 先使用基础方法找到最近的线段
    const basicResult = findNearestKMLSegment(coordinate);

    if (!basicResult) return null;

    // 计算直线距离和预期路径距离的比例
    const directDist = calculateDistance(coordinate, targetCoordinate);

    // 如果找到的线段距离很近（<5米），直接使用
    if (basicResult.distance < 5) {
        console.log(`${pointType}投影距离很近(${basicResult.distance.toFixed(2)}米)，直接使用`);
        return basicResult;
    }

    // 如果直线距离很短（<50米），检查是否应该在同一条边上
    if (directDist < 50) {
        console.log(`${pointType}直线距离很短(${directDist.toFixed(2)}米)，尝试寻找更优投影...`);

        // 查找目标点附近的所有候选线段
        const candidates = [];
        const coordLng = Array.isArray(coordinate) ? coordinate[0] : coordinate.lng;
        const coordLat = Array.isArray(coordinate) ? coordinate[1] : coordinate.lat;

        kmlEdges.forEach((edge, edgeIdx) => {
            if (!edge.coordinates || edge.coordinates.length < 2) return;

            for (let i = 0; i < edge.coordinates.length - 1; i++) {
                const p1 = edge.coordinates[i];
                const p2 = edge.coordinates[i + 1];

                const p1Lng = p1.lng !== undefined ? p1.lng : p1[0];
                const p1Lat = p1.lat !== undefined ? p1.lat : p1[1];
                const p2Lng = p2.lng !== undefined ? p2.lng : p2[0];
                const p2Lat = p2.lat !== undefined ? p2.lat : p2[1];

                const projection = projectPointToSegment(
                    {lng: coordLng, lat: coordLat},
                    {lng: p1Lng, lat: p1Lat},
                    {lng: p2Lng, lat: p2Lat}
                );

                // 只考���距离<20米的候选
                if (projection.distance < 20) {
                    candidates.push({
                        edge: edge,
                        projection: projection,
                        distance: projection.distance,
                        segmentIndex: i,
                        edgeIdx: edgeIdx
                    });
                }
            }
        });

        console.log(`找到${candidates.length}个候选线段（距离<20米）`);

        // 如果有多个候选，选择最接近直线路径的
        if (candidates.length > 1) {
            // 计算从当前点到目标点的方向向量
            const targetLng = Array.isArray(targetCoordinate) ? targetCoordinate[0] : targetCoordinate.lng;
            const targetLat = Array.isArray(targetCoordinate) ? targetCoordinate[1] : targetCoordinate.lat;
            const directionToTarget = Math.atan2(targetLat - coordLat, targetLng - coordLng);

            // 为每个候选计算得分（距离权重60% + 方向匹配40%）
            candidates.forEach(cand => {
                const projLng = cand.projection.point.lng;
                const projLat = cand.projection.point.lat;

                // 计算从投影点到目标的方向
                const directionFromProj = Math.atan2(targetLat - projLat, targetLng - projLng);
                const angleDiff = Math.abs(directionToTarget - directionFromProj);
                const angleScore = Math.min(angleDiff, 2 * Math.PI - angleDiff) / Math.PI; // 0-1, 越小越好

                // 综合得分
                cand.score = cand.distance * 0.6 + angleScore * directDist * 0.4;
            });

            // 选择得分最低的
            candidates.sort((a, b) => a.score - b.score);
            const best = candidates[0];

            console.log(`选择得分最优的候选: 距离${best.distance.toFixed(2)}米, 得分${best.score.toFixed(2)}`);

            return {
                edge: best.edge,
                projectionPoint: best.projection.point,
                distance: best.distance,
                info: {
                    segmentIndex: best.segmentIndex,
                    t: best.projection.t,
                    isAtStart: best.projection.t <= 0.01,
                    isAtEnd: best.projection.t >= 0.99,
                    edgeIndex: best.edgeIdx
                }
            };
        }
    }

    // 默认返回基础结果
    return basicResult;
}

// 查找距离某点最近的KML线段及其投影点（基础版）
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

    //构建或更新KML图
    if (!kmlGraph) {
        const success = buildKMLGraph();
        if (!success) {
            console.error('KML图构建失败');
            return null;
        }
    }

    // 计算起点到终点的直线距离（用于智能投影判断）
    const directDistance = calculateDistance(startCoordinate, endCoordinate);
    console.log(`起终点直线距离: ${directDistance.toFixed(2)}米`);

    // 找到起点和终点最近的KML线段（使用智能投影）
    const startSegment = findNearestKMLSegmentSmart(startCoordinate, endCoordinate, '起点');
    const endSegment = findNearestKMLSegmentSmart(endCoordinate, startCoordinate, '终点');

    if (!startSegment || !endSegment) {
        console.error('无法找到合适的KML线段');
        return null;
    }

    console.log('找到最近的线段:', {
        起点最近线段距离: `${startSegment.distance.toFixed(2)}米`,
        终点最近线段距离: `${endSegment.distance.toFixed(2)}米`,
        起点所在边: `节点${startSegment.edge.start}->节点${startSegment.edge.end}`,
        终点所在边: `节点${endSegment.edge.start}->节点${endSegment.edge.end}`,
        是否同一条边: startSegment.edge === endSegment.edge
    });

    // 特殊情况：检查起点和终点是否在同一条边上
    if (startSegment.edge === endSegment.edge) {
        console.log('起点和终点在同一条线段上，沿线段路径规划');

        // 获取线段的坐标数组
        const edgeCoords = startSegment.edge.coordinates;
        if (!edgeCoords || edgeCoords.length < 2) {
            console.error('线段坐标无效');
            return null;
        }

        // 获取起点和终点在线段上的位置索引
        const startSegIdx = startSegment.info.segmentIndex;
        const endSegIdx = endSegment.info.segmentIndex;
        const startProj = startSegment.projectionPoint;
        const endProj = endSegment.projectionPoint;

        console.log('线段索引:', { 起点索引: startSegIdx, 终点索引: endSegIdx, 线段总长度: edgeCoords.length });

        // 构建起点到终点的路径（沿着线段的实际形状）
        let segmentPath = [];

        // 统一处理投影点格式（可能是数组或对象）
        const getCoordArray = (proj) => {
            if (Array.isArray(proj)) {
                return proj;
            } else if (proj && typeof proj === 'object') {
                return [proj.lng || proj[0], proj.lat || proj[1]];
            }
            return null;
        };

        const startProjArr = getCoordArray(startProj);
        const endProjArr = getCoordArray(endProj);

        if (!startProjArr || !endProjArr) {
            console.error('投影点格式无效');
            return null;
        }

        if (startSegIdx === endSegIdx) {
            // 起点和终点投影在同一小段上，直接连接两个投影点
            segmentPath.push(startProjArr);
            segmentPath.push(endProjArr);
        } else {
            // 起点和终点在不同的小段上
            // 添加起点投影点
            segmentPath.push(startProjArr);

            // 确定遍历方向
            if (startSegIdx < endSegIdx) {
                // 正向遍历：从起点向终点
                for (let i = startSegIdx + 1; i <= endSegIdx; i++) {
                    const coord = edgeCoords[i];
                    if (coord && coord.lng !== undefined && coord.lat !== undefined) {
                        segmentPath.push([coord.lng, coord.lat]);
                    }
                }
            } else {
                // 反向遍历：从起点向终点（终点索引更小）
                for (let i = startSegIdx; i >= endSegIdx + 1; i--) {
                    const coord = edgeCoords[i];
                    if (coord && coord.lng !== undefined && coord.lat !== undefined) {
                        segmentPath.push([coord.lng, coord.lat]);
                    }
                }
            }

            // 添加终点投影点
            segmentPath.push(endProjArr);
        }

        // 计算路径距离
        let pathDistance = 0;
        for (let i = 0; i < segmentPath.length - 1; i++) {
            pathDistance += calculateDistance(
                {lng: segmentPath[i][0], lat: segmentPath[i][1]},
                {lng: segmentPath[i + 1][0], lat: segmentPath[i + 1][1]}
            );
        }

        console.log(`同一线段路径规划完成: ${segmentPath.length}个点, 距离${pathDistance.toFixed(2)}米`);

        return {
            path: segmentPath,
            distance: pathDistance
        };
    }

    let actualStartNodeId = null;
    let actualEndNodeId = null;
    let needRebuildGraph = false; // 标记是否需要重建图

    // 处理起点
    const startEdge = startSegment.edge;
    const startInfo = startSegment.info;

    // 检查��影点是否在线段端点附近
    if (startInfo.isAtStart) {
        // 投影点在线段起点，直接使用边的起点节点
        actualStartNodeId = startEdge.start;
    } else if (startInfo.isAtEnd) {
        // 投影点在线段终点，直接使用边的终点节点
        actualStartNodeId = startEdge.end;
    } else {
        // 投影点在线段中间，需要分割边并创建新节点
        // 确保投影点格式为对象
        const projPoint = Array.isArray(startSegment.projectionPoint)
            ? {lng: startSegment.projectionPoint[0], lat: startSegment.projectionPoint[1]}
            : startSegment.projectionPoint;

        const tempStartNode = {
            id: kmlNodes.length,
            lng: projPoint.lng,
            lat: projPoint.lat
        };
        kmlNodes.push(tempStartNode);
        actualStartNodeId = tempStartNode.id;

        // 分割边
        splitEdgeAtPoint(startEdge, projPoint, tempStartNode, startInfo.segmentIndex);
        needRebuildGraph = true; // 标记需要重建
    }

    // 处理终点
    const endEdge = endSegment.edge;
    const endInfo = endSegment.info;

    console.log(`终点投影信息: isAtStart=${endInfo.isAtStart}, isAtEnd=${endInfo.isAtEnd}, t=${endInfo.t}`);

    // 优先使用投影信息中的端点标志
    if (endInfo.isAtStart) {
        // 投影点在线段起点
        console.log(`终点在边起点，使用节点${endEdge.start}`);
        actualEndNodeId = endEdge.start;
    } else if (endInfo.isAtEnd) {
        // 投影点在线段终点
        console.log(`终点在边终点，使用节点${endEdge.end}`);
        actualEndNodeId = endEdge.end;
    } else {
        // 投影点在线段中间，需要分割边
        // 确保投影点格式为对象
        const projPoint = Array.isArray(endSegment.projectionPoint)
            ? {lng: endSegment.projectionPoint[0], lat: endSegment.projectionPoint[1]}
            : endSegment.projectionPoint;

        const tempEndNode = {
            id: kmlNodes.length,
            lng: projPoint.lng,
            lat: projPoint.lat
        };
        kmlNodes.push(tempEndNode);
        actualEndNodeId = tempEndNode.id;

        // 分割边
        splitEdgeAtPoint(endEdge, projPoint, tempEndNode, endInfo.segmentIndex);
        needRebuildGraph = true; // 标记需要重建
    }

    // 重新构建邻接表（如果创建了新节点）
    if (needRebuildGraph) {
        kmlGraph = buildAdjacencyList();
        console.log(`已重建邻接表，起点${actualStartNodeId}邻居数: ${kmlGraph[actualStartNodeId]?.length || 0}, 终点${actualEndNodeId}邻居数: ${kmlGraph[actualEndNodeId]?.length || 0}`);
    }

    console.log('准备使用Dijkstra算法:', {
        起点节点ID: actualStartNodeId,
        终点节点ID: actualEndNodeId,
        起点坐标: kmlNodes.find(n => n.id === actualStartNodeId),
        终点坐标: kmlNodes.find(n => n.id === actualEndNodeId),
        起点邻居数: kmlGraph[actualStartNodeId] ? kmlGraph[actualStartNodeId].length : 0,
        终点邻居数: kmlGraph[actualEndNodeId] ? kmlGraph[actualEndNodeId].length : 0
    });

    // 使用Dijkstra算法计算路径
    let result = dijkstra(actualStartNodeId, actualEndNodeId);

    // 如果正向查找失败，尝试反向查找
    if (!result) {
        console.warn('正向Dijkstra未找到路径，尝试反向查找...');
        const reverseResult = dijkstra(actualEndNodeId, actualStartNodeId);

        if (reverseResult) {
            console.log('反向查找成功！自动反转路径返回');

            // 反转路径
            const reversedPath = [];
            for (let i = reverseResult.path.length - 1; i >= 0; i--) {
                reversedPath.push(reverseResult.path[i]);
            }

            // 用反转后的路径替换result
            result = {
                path: reversedPath,
                distance: reverseResult.distance
            };
        } else {
            console.error('正向和反向都未找到路径');
            return null;
        }
    }

    console.log(`路径规划完成，共${result.path.length}个点，总距离${result.distance.toFixed(2)}米`);

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

    // 验证point格式
    if (!point || (point.lng === undefined || point.lat === undefined)) {
        console.error('splitEdgeAtPoint: 无效的point格式', point);
        return;
    }

    // 获取边的起点和终点节点ID
    const edgeStartNodeId = edge.start;
    const edgeEndNodeId = edge.end;

    // 找到分割点在坐标数组中的位置
    const coords = edge.coordinates;

    // 辅助函数：安全地提取坐标
    const extractCoord = (c) => {
        if (!c) return null;
        if (c.lng !== undefined && c.lat !== undefined) {
            return {lng: c.lng, lat: c.lat};
        } else if (Array.isArray(c) && c.length >= 2) {
            return {lng: c[0], lat: c[1]};
        }
        console.error('无效的坐标格式:', c);
        return null;
    };

    // 创建两段新的坐标数组
    // 第一段：从边起点到投影点
    const coords1 = [];
    for (let i = 0; i <= segmentIndex; i++) {
        const coord = extractCoord(coords[i]);
        if (coord) {
            coords1.push(coord);
        }
    }
    coords1.push({lng: point.lng, lat: point.lat});

    // 第二段：从投影点到边终点
    const coords2 = [{lng: point.lng, lat: point.lat}];
    for (let i = segmentIndex + 1; i < coords.length; i++) {
        const coord = extractCoord(coords[i]);
        if (coord) {
            coords2.push(coord);
        }
    }

    // 验证坐标数组
    if (coords1.length < 2 || coords2.length < 2) {
        console.error('分割后坐标不足:', {coords1长度: coords1.length, coords2长度: coords2.length});
        return;
    }

    // 计算两段的距离
    let dist1 = 0;
    for (let i = 0; i < coords1.length - 1; i++) {
        const d = calculateDistance(coords1[i], coords1[i + 1]);
        if (!isNaN(d) && isFinite(d)) {
            dist1 += d;
        }
    }

    let dist2 = 0;
    for (let i = 0; i < coords2.length - 1; i++) {
        const d = calculateDistance(coords2[i], coords2[i + 1]);
        if (!isNaN(d) && isFinite(d)) {
            dist2 += d;
        }
    }

    console.log(`分割边距离: 第一段${dist1.toFixed(2)}米, 第二段${dist2.toFixed(2)}米`);

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

    // 获取地图对象（兼容主页面和导航页面）
    let mapInstance = null;
    if (window.NavRenderer && typeof window.NavRenderer.getMap === 'function') {
        // 导航页面：通过NavRenderer获取
        mapInstance = window.NavRenderer.getMap();
    } else if (window.map) {
        // 主页面：使用全局map变量
        mapInstance = window.map;
    }

    if (!mapInstance) {
        console.error('[路径显示] 地图对象未初始化');
        alert('地图未初始化，请稍后再试');
        return;
    }

    // 检查地图容器是否已准备好
    try {
        const container = mapInstance.getContainer();
        if (!container || container.offsetWidth === 0 || container.offsetHeight === 0) {
            console.warn('[路径显示] 地图容器尺寸无效，延迟300ms后重试');
            setTimeout(() => displayKMLRoute(routeResult), 300);
            return;
        }
    } catch (e) {
        console.warn('[路径显示] 检查地图容器失败:', e);
    }

    console.log('[路径显示] ✓ 地图对象已获取');

    // 清除之前的路径
    clearPreviousRoute();

    // 清理旧的路线Polyline（保留KML线作为底图参考）
    try {
        const allOverlays = mapInstance.getAllOverlays();

        allOverlays.forEach(overlay => {
            if (overlay.CLASS_NAME === 'AMap.Polyline') {
                const extData = overlay.getExtData ? overlay.getExtData() : null;
                if (extData && extData.type === '线') {
                    // 这是KML的线，保持可见作为底图参考
                } else if (!extData || extData.type !== '线') {
                    // 清除旧的路线 Polyline
                    mapInstance.remove(overlay);
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

    console.log('[路径显示] 坐标验证通过，有效路径点:', validPath.length);

    // 【关键修复】检查地图是否已完成初始化
    // 通过检查getCenter()返回值是否有效来判断地图状态
    try {
        const center = mapInstance.getCenter();
        if (!center || typeof center.getLng !== 'function') {
            console.warn('[路径显示] 地图中心点无效，延迟300ms后重试');
            setTimeout(() => displayKMLRoute(routeResult), 300);
            return;
        }
        const centerLng = center.getLng();
        const centerLat = center.getLat();
        if (isNaN(centerLng) || isNaN(centerLat) || !isFinite(centerLng) || !isFinite(centerLat)) {
            console.warn('[路径显示] 地图中心点坐标无效，延迟300ms后重试');
            setTimeout(() => displayKMLRoute(routeResult), 300);
            return;
        }
        console.log('[路径显示] ✓ 地图状态正常，中心点:', centerLng, centerLat);
    } catch (e) {
        console.warn('[路径显示] 检查地图中心点失败，延迟300ms后重试:', e);
        setTimeout(() => displayKMLRoute(routeResult), 300);
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

        // 添加到地图
        mapInstance.add(polyline);
        console.log('[路径显示] ✓ Polyline已添加到地图');

        // 强制刷新地图渲染
        try {
            mapInstance.setZoom(mapInstance.getZoom()); // 触发地图重绘
        } catch (refreshError) {
            console.warn('触发地图重绘失败（非关键错误）:', refreshError);
        }
    } catch (error) {
        console.error('创建或添加Polyline时出错:', error);
        console.error('错误详情:', error.stack);
        // 不要弹窗提示，让用户刷新页面重试
        console.warn('[路径显示] 路线显示失败，可能需要刷新页面');
        return;
    }

    // 保存路径对象供后续使用（先不包含marker，后面会更新）
    window.currentKMLRoute = {
        polyline: polyline,
        startMarker: null,
        endMarker: null,
        path: validPath,
        distance: routeResult.distance
    };

    // 【关键修复】先调整地图视野到路线所在区域
    // 必须先执行这一步，否则添加marker时会因为地图中心点与marker坐标差距过大导致Pixel(NaN,NaN)错误
    if (validPath.length >= 2) {
        try {
            // 创建包含所有路径点的边界
            const bounds = new AMap.Bounds(validPath[0], validPath[0]);
            validPath.forEach(point => {
                bounds.extend(point);
            });

            // 设置地图边界，添加内边距以确保路径不紧贴边缘
            mapInstance.setBounds(bounds, false, [50, 50, 50, 50]);
            console.log('[路径显示] ✓ 地图边界已设置到路线区域');
        } catch (e) {
            console.error('[路径显示] 设置地图边界时出错:', e);
            // 备选方案：设置到路径中心点
            try {
                const midLng = (validPath[0][0] + validPath[validPath.length - 1][0]) / 2;
                const midLat = (validPath[0][1] + validPath[validPath.length - 1][1]) / 2;
                mapInstance.setCenter([midLng, midLat]);
                mapInstance.setZoom(17);
                console.log('[路径显示] ✓ 地图中心已设置（备选方案）');
            } catch (e2) {
                console.error('[路径显示] 设置地图中心时出错:', e2);
            }
        }
    }

    // 【关键修复】在地图视野调整完成后，延迟添加起点和终点标记
    // 必须等待地图完成视野变换后再添加marker，否则会出现Pixel(NaN,NaN)错误
    setTimeout(function() {
        try {
            // 检查MapConfig是否已加载
            if (typeof MapConfig === 'undefined' || !MapConfig.markerStyles) {
                console.warn('[路径显示] MapConfig未加载，跳过起终点标记');
                return;
            }

            const startIconUrl = (MapConfig.markerStyles.start?.icon || MapConfig.markerStyles.currentLocation?.icon) || '';
            const endIconUrl = (MapConfig.markerStyles.destination?.icon || MapConfig.markerStyles.currentLocation?.icon) || '';
            let startMarker = null;
            let endMarker = null;

            // 起点
            if (validPath.length >= 1 && startIconUrl) {
                const startPos = validPath[0];
                if (Array.isArray(startPos) && startPos.length >= 2 &&
                    !isNaN(startPos[0]) && !isNaN(startPos[1])) {
                    startMarker = new AMap.Marker({
                        position: new AMap.LngLat(startPos[0], startPos[1]),
                        content: '<img src="' + startIconUrl + '" style="width:30px;height:38px;transform:translate(-50%,-100%);">',
                        anchor: 'bottom-center',
                        zIndex: 150,
                        title: '起点'
                    });
                    mapInstance.add(startMarker);
                    console.log('[路径显示] ✓ 起点marker已添加，位置:', startPos);
                }
            }

            // 终点
            if (validPath.length >= 2 && endIconUrl) {
                const endPos = validPath[validPath.length - 1];
                if (Array.isArray(endPos) && endPos.length >= 2 &&
                    !isNaN(endPos[0]) && !isNaN(endPos[1])) {
                    endMarker = new AMap.Marker({
                        position: new AMap.LngLat(endPos[0], endPos[1]),
                        content: '<img src="' + endIconUrl + '" style="width:30px;height:38px;transform:translate(-50%,-100%);">',
                        anchor: 'bottom-center',
                        zIndex: 150,
                        title: '终点'
                    });
                    mapInstance.add(endMarker);
                    console.log('[路径显示] ✓ 终点marker已添加，位置:', endPos);
                }
            }

            // 更新保存的路径对象
            if (window.currentKMLRoute) {
                window.currentKMLRoute.startMarker = startMarker;
                window.currentKMLRoute.endMarker = endMarker;
            }
        } catch (e) {
            console.warn('[路径显示] 创建起终点标记失败:', e);
        }
    }, 500); // 等待500ms让地图完成视野变换

    // 检查是否从任务页发起的导航，如果是则自动跳转到导航页面
    const urlParams = new URLSearchParams(window.location.search);
    const isFromTaskNav = urlParams.get('nav') === 'true';

    if (isFromTaskNav) {
        console.log('[路线规划] 检测到任务导航，路线规划完成，2秒后跳转到导航页面...');
        setTimeout(() => {
            if (window.currentKMLRoute) {
                console.log('[路线规划] 跳转到导航页面');
                window.location.href = 'navigation.html';
            }
        }, 2000); // 延迟2秒，让用户看到路线
    }

    return polyline;
}

// 清除之前的路径
function clearPreviousRoute() {
    if (window.currentKMLRoute) {
        try {
            // 获取正确的地图实例（兼容导航页面和主页面）
            let mapInstance = null;
            if (window.NavRenderer && typeof window.NavRenderer.getMap === 'function') {
                mapInstance = window.NavRenderer.getMap();
            } else if (window.map) {
                mapInstance = window.map;
            }

            if (mapInstance) {
                if (window.currentKMLRoute.polyline) {
                    mapInstance.remove(window.currentKMLRoute.polyline);
                }
                if (window.currentKMLRoute.startMarker) {
                    mapInstance.remove(window.currentKMLRoute.startMarker);
                }
                if (window.currentKMLRoute.endMarker) {
                    mapInstance.remove(window.currentKMLRoute.endMarker);
                }
            }
        } catch (e) {
            console.warn('清除之前的路径时出错:', e);
        }
        window.currentKMLRoute = null;
    }
}
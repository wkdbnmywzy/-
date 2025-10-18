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

    console.log('开始构建KML路径图，图层数:', kmlLayers.length);

    // 保存原始线段数据用于交点检测
    const originalLines = [];

    // 从KML图层中提取线路信息
    kmlLayers.forEach(function(layer, layerIndex) {
        console.log(`处理图层${layerIndex}:`, layer.name, 'markers数量:', layer.markers.length);
        if (!layer.visible) return;

        layer.markers.forEach(function(marker, markerIndex) {
            // 跳过没有 getExtData 方法的对象
            if (!marker || typeof marker.getExtData !== 'function') {
                return;
            }

            const extData = marker.getExtData();

            if (extData && extData.type === '线') {
                console.log(`找到线要素 marker${markerIndex}:`, extData.name);

                // 确保 marker 有 getPath 方法（是 Polyline 对象）
                if (typeof marker.getPath !== 'function') {
                    console.warn('Marker 没有 getPath 方法，跳过:', marker);
                    return;
                }

                let path;
                try {
                    path = marker.getPath();
                    console.log(`  线路径长度: ${path ? path.length : 0}`);
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
                            console.warn(`    坐标${i}无效:`, coord);
                        }
                    }

                    console.log(`  有效坐标数: ${validPath.length}`);

                    // 保存原始线段用于交点检测
                    originalLines.push({
                        name: extData.name,
                        path: validPath.slice()
                    });

                    // 简化逻辑：每个线段直接使用起点和终点作为节点
                    // 这样保证了每条KML线段都能成为图中的一条边
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
                        console.log(`  创建边: 节点${startNode.id} -> 节点${endNode.id}, 距离: ${segmentDistance.toFixed(2)}m`);
                    }
                }
            }
        });
    });

    console.log(`初步构建完成: ${kmlNodes.length} 节点, ${kmlEdges.length} 边`);

    // 禁用节点合并功能 - 保持端点的独立性
    // mergeCloseNodes();

    // 启用相交检测功能 - 在线段交点处创建连接节点，实现道路网络联通
    connectIntersectingLines(originalLines);

    // 构建图结构
    kmlGraph = buildAdjacencyList();

    console.log(`KML路径图构建完成: ${kmlNodes.length} 节点, ${kmlEdges.length} 边`);
    console.log('路径规划基于KML线段端点和交点，通过Dijkstra算法计算最短路径');
    return kmlNodes.length > 0 && kmlEdges.length > 0;
}

// 合并距离很近的节点
function mergeCloseNodes() {
    const mergeThreshold = 0.5; // 0.5米以内的节点合并
    const nodesToMerge = [];

    console.log('开始合并距离很近的节点，阈值:', mergeThreshold, 'm');

    // 找出需要合并的节点对
    for (let i = 0; i < kmlNodes.length; i++) {
        for (let j = i + 1; j < kmlNodes.length; j++) {
            const dist = calculateDistance(
                {lng: kmlNodes[i].lng, lat: kmlNodes[i].lat},
                {lng: kmlNodes[j].lng, lat: kmlNodes[j].lat}
            );

            if (dist < mergeThreshold) {
                nodesToMerge.push({from: j, to: i, distance: dist});
            }
        }
    }

    if (nodesToMerge.length === 0) {
        console.log('没有需要合并的节点');
        return;
    }

    console.log(`发现 ${nodesToMerge.length} 对需要合并的节点`);

    // 按照from节点ID降序排序，从后往前合并，避免索引混乱
    nodesToMerge.sort((a, b) => b.from - a.from);

    // 创建节点映射表
    const nodeMapping = {};
    for (let i = 0; i < kmlNodes.length; i++) {
        nodeMapping[i] = i;
    }

    // 执行合并
    nodesToMerge.forEach(merge => {
        console.log(`合并节点 ${merge.from} -> ${merge.to} (距离: ${merge.distance.toFixed(3)}m)`);
        nodeMapping[merge.from] = merge.to;
    });

    // 更新所有边的节点引用
    kmlEdges.forEach(edge => {
        edge.start = nodeMapping[edge.start] !== undefined ? nodeMapping[edge.start] : edge.start;
        edge.end = nodeMapping[edge.end] !== undefined ? nodeMapping[edge.end] : edge.end;
    });

    // 移除自环边（起点终点相同的边）
    const validEdges = kmlEdges.filter(edge => edge.start !== edge.end);
    const removedEdges = kmlEdges.length - validEdges.length;
    if (removedEdges > 0) {
        console.log(`移除了 ${removedEdges} 条自环边`);
        kmlEdges = validEdges;
    }

    console.log(`节点合并完成，保留 ${Object.keys(new Set(Object.values(nodeMapping))).length} 个有效节点`);
}

// 查找或创建节点
function findOrCreateNode(coordinate) {
    // 非常严格的坐标容差，只合并几乎完全相同的点
    const tolerance = 0.01; // 0.01米 = 1厘米，只合并真正重复的点

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
        return dist < tolerance; // 直接使用米作为单位
    });

    if (existingNode) {
        console.log('   复用已存在节点', existingNode.id, '距离:',
            calculateDistance({lng, lat}, {lng: existingNode.lng, lat: existingNode.lat}).toFixed(3), 'm');
        return existingNode;
    }

    // 创建新节点
    const newNode = {
        id: kmlNodes.length,
        lng: lng,
        lat: lat
    };

    kmlNodes.push(newNode);
    console.log('   创建新节点', newNode.id, '位置:', [lng, lat]);
    return newNode;
}

// 添加边
function addEdge(startId, endId, distance, coordinates) {
    if (startId === endId) {
        console.warn('⚠️ 检测到自环边 (起点=终点=节点' + startId + '), 已跳过');
        console.warn('   这通常意味着线段太短，起点和终点被合并了');
        console.warn('   线段坐标:', coordinates);
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
        console.log('   ✅ 边已添加: 节点' + startId + ' <-> 节点' + endId + ', 距离: ' + distance.toFixed(2) + 'm');
    } else {
        console.log('   ℹ️ 边已存在，跳过重复添加');
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
            console.log(`检测到回溯: 点${i}在点${backtrackIndex}处重复出现，跳过中间${backtrackIndex - i}个点`);
            i = backtrackIndex;
        } else {
            i++;
        }
    }

    if (cleanedPath.length === 0) {
        return null; // 无路径
    }

    console.log(`路径优化: 原始${path.length}点 -> 去重后${uniquePath.length}点 -> 清理回溯后${cleanedPath.length}点`);

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

    console.log('🔍 查找最近KML线段, 目标点:', [coordLng, coordLat]);
    console.log('   当前图中边数:', kmlEdges.length);

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
        console.error('❌ 未找到最近的KML线段!');
        return null;
    }

    console.log('✅ 找到最近线段:');
    console.log('   距离:', minDistance.toFixed(2), 'm');
    console.log('   投影点:', [projectionPoint.lng, projectionPoint.lat]);
    console.log('   线段:', projectionInfo.segmentStart, '->', projectionInfo.segmentEnd);
    console.log('   边起点节点ID:', nearestSegment.start, '终点节点ID:', nearestSegment.end);

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
    console.log('=====================================');
    console.log('🚀 开始KML路径规划');
    console.log('起点坐标:', startCoordinate);
    console.log('终点坐标:', endCoordinate);
    console.log('=====================================');

    // 构建或更新KML图
    if (!kmlGraph) {
        console.log('⚙️ KML图未构建，开始构建...');
        const success = buildKMLGraph();
        if (!success) {
            console.error('❌ KML图构建失败');
            return null;
        }
        console.log('✅ KML图构建成功');
    } else {
        console.log('✅ KML图已存在，节点数:', kmlNodes.length, '边数:', kmlEdges.length);
    }

    // 找到起点和终点最近的KML线段
    const startSegment = findNearestKMLSegment(startCoordinate);
    const endSegment = findNearestKMLSegment(endCoordinate);

    console.log('-------------------------------------');
    console.log('📍 找到的最近线段:');
    console.log('  起点距离:', startSegment ? startSegment.distance.toFixed(2) + 'm' : 'N/A');
    console.log('  终点距离:', endSegment ? endSegment.distance.toFixed(2) + 'm' : 'N/A');
    console.log('  起点在线段边缘:', startSegment ? (startSegment.info.isAtStart || startSegment.info.isAtEnd) : false);
    console.log('  终点在线段边缘:', endSegment ? (endSegment.info.isAtStart || endSegment.info.isAtEnd) : false);
    console.log('-------------------------------------');

    if (!startSegment || !endSegment) {
        console.error('❌ 无法找到合适的KML线段');
        return null;
    }

    let actualStartNodeId = null;
    let actualEndNodeId = null;

    // 处理起点
    const startEdge = startSegment.edge;
    const startInfo = startSegment.info;

    // 检查投影点是否在线段端点附近
    if (startInfo.isAtStart) {
        // 投影点在线段起点，直接使用边的起点节点
        actualStartNodeId = startEdge.start;
        console.log('起点投影在线段起点，使用节点:', actualStartNodeId);
    } else if (startInfo.isAtEnd) {
        // 投影点在线段终点，直接使用边的终点节点
        actualStartNodeId = startEdge.end;
        console.log('起点投影在线段终点，使用节点:', actualStartNodeId);
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
        console.log('起点投影在线段中间，创建新节点:', actualStartNodeId);
    }

    // 处理终点
    const endEdge = endSegment.edge;
    const endInfo = endSegment.info;

    // 获取边的实际起点和终点坐标用于调试
    const edgeStartNode = kmlNodes.find(n => n.id === endEdge.start);
    const edgeEndNode = kmlNodes.find(n => n.id === endEdge.end);
    console.log('终点所在边的信息:', {
        edgeStartNodeId: endEdge.start,
        edgeStartCoord: edgeStartNode ? [edgeStartNode.lng, edgeStartNode.lat] : null,
        edgeEndNodeId: endEdge.end,
        edgeEndCoord: edgeEndNode ? [edgeEndNode.lng, edgeEndNode.lat] : null,
        projectionPoint: [endSegment.projectionPoint.lng, endSegment.projectionPoint.lat],
        isAtStart: endInfo.isAtStart,
        isAtEnd: endInfo.isAtEnd,
        t: endInfo.t
    });

    // 不依赖isAtStart/isAtEnd，而是计算投影点到边的起点和终点的实际距离
    const distToStart = edgeStartNode ? calculateDistance(endSegment.projectionPoint, edgeStartNode) : Infinity;
    const distToEnd = edgeEndNode ? calculateDistance(endSegment.projectionPoint, edgeEndNode) : Infinity;
    const threshold = 0.5; // 0.5米容差

    console.log('终点投影距离判断:', {
        distToStart: distToStart.toFixed(3) + 'm',
        distToEnd: distToEnd.toFixed(3) + 'm',
        threshold: threshold + 'm'
    });

    if (distToStart < threshold) {
        // 投影点非常接近边的起点
        actualEndNodeId = endEdge.start;
        console.log('终点投影接近线段起点（距离' + distToStart.toFixed(3) + 'm），使用节点:', actualEndNodeId);
    } else if (distToEnd < threshold) {
        // 投影点非常接近边的终点
        actualEndNodeId = endEdge.end;
        console.log('终点投影接近线段终点（距离' + distToEnd.toFixed(3) + 'm），使用节点:', actualEndNodeId);
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
        console.log('终点投影在线段中间（距起点' + distToStart.toFixed(3) + 'm，距终点' + distToEnd.toFixed(3) + 'm），创建新节点:', actualEndNodeId);
    }

    // 重新构建邻接表（如果创建了新节点）
    kmlGraph = buildAdjacencyList();
    console.log('✅ 图重建完成，节点数:', kmlNodes.length, '边数:', kmlEdges.length);

    // 使用Dijkstra算法计算路径
    console.log('-------------------------------------');
    console.log('🔍 开始Dijkstra算法');
    console.log('  起点节点ID:', actualStartNodeId);
    console.log('  终点节点ID:', actualEndNodeId);
    console.log('-------------------------------------');

    const result = dijkstra(actualStartNodeId, actualEndNodeId);

    if (!result) {
        console.error('❌ Dijkstra算法未找到连接路径');
        console.error('  起点节点ID:', actualStartNodeId, '-> 节点坐标:', kmlNodes.find(n => n.id === actualStartNodeId));
        console.error('  终点节点ID:', actualEndNodeId, '-> 节点坐标:', kmlNodes.find(n => n.id === actualEndNodeId));
        console.error('  请检查这两个节点是否在同一个连通图中');
        return null;
    }

    console.log('✅ Dijkstra算法成功找到路径');
    console.log('  路径点数:', result.path.length);
    console.log('  路径总距离:', result.distance.toFixed(2), '米');
    console.log('  路径前5个点:', result.path.slice(0, 5));
    console.log('  路径完整数据:', JSON.stringify(result.path));
    console.log('=====================================');

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
        }
    }

    if (validPath.length < 2) {
        console.error('有效路径点不足');
        return null;
    }

    console.log('最终路径点数:', validPath.length);

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

    console.log('displayKMLRoute 开始，清除之前的覆盖物');

    // 清除之前的路径
    clearPreviousRoute();

    // 清理旧的路线Polyline（保留KML线作为底图参考）
    try {
        const allOverlays = map.getAllOverlays();
        console.log('当前地图上的所有覆盖物数量:', allOverlays.length);

        allOverlays.forEach(overlay => {
            if (overlay.CLASS_NAME === 'AMap.Polyline') {
                const extData = overlay.getExtData ? overlay.getExtData() : null;
                if (extData && extData.type === '线') {
                    // 这是KML的线，保持可见作为底图参考
                    console.log('保留KML线作为底图:', extData.name);
                } else if (!extData || extData.type !== '线') {
                    // 清除旧的路线 Polyline
                    console.log('清除旧的路线 Polyline');
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

    console.log('准备创建Polyline，路径点数:', validPath.length);
    console.log('validPath详细内容:', JSON.stringify(validPath));

    // 再次验证每个点
    for (let i = 0; i < validPath.length; i++) {
        const point = validPath[i];
        console.log(`点${i}:`, point, 'lng:', point[0], 'lat:', point[1]);
        if (isNaN(point[0]) || isNaN(point[1])) {
            console.error(`点${i}包含NaN!`);
        }
    }

    // 检查地图对象
    console.log('地图对象存在:', !!map);
    console.log('地图中心:', map ? map.getCenter() : 'N/A');
    console.log('地图缩放:', map ? map.getZoom() : 'N/A');

    // 转换为 AMap.LngLat 对象数组
    const amapPath = validPath.map(coord => {
        return new AMap.LngLat(coord[0], coord[1]);
    });

    console.log('转换后的AMap路径:', amapPath);

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
        console.log('✅ Polyline创建成功');
        console.log('   路径点数:', amapPath.length);
        console.log('   颜色: #00C853, 线宽: 8px, 不透明度: 100%, zIndex: 150');

        // 直接添加到地图，不使用延迟
        // 延迟可能导致在某些情况下添加失败
        map.add(polyline);
        console.log('✅ Polyline已立即添加到地图');

        // 强制刷新地图渲染
        try {
            map.setZoom(map.getZoom()); // 触发地图重绘
            console.log('✅ 已触发地图重绘');
        } catch (refreshError) {
            console.warn('触发地图重绘失败（非关键错误）:', refreshError);
        }
    } catch (error) {
        console.error('❌ 创建或添加Polyline时出错:', error);
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

            console.log('设置地图边界以显示完整路径');
            console.log('路径边界:', bounds);

            // 设置地图边界，添加内边距以确保路径不紧贴边缘
            map.setBounds(bounds, false, [50, 50, 50, 50]); // 上右下左的内边距
            console.log('✅ 已设置地图边界');
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

// 检测并连接相交的线段（检查所有线段对，而不仅仅是边）
function connectIntersectingLines(originalLines) {
    console.log('开始检测线段相交...');

    let intersectionCount = 0;

    // 遍历所有原始线段对，检测每个线段内部的相交
    for (let i = 0; i < originalLines.length; i++) {
        const line1 = originalLines[i];

        for (let j = i + 1; j < originalLines.length; j++) {
            const line2 = originalLines[j];

            // 检查line1和line2的每一对线段
            for (let seg1 = 0; seg1 < line1.path.length - 1; seg1++) {
                const p1Start = line1.path[seg1];
                const p1End = line1.path[seg1 + 1];

                for (let seg2 = 0; seg2 < line2.path.length - 1; seg2++) {
                    const p2Start = line2.path[seg2];
                    const p2End = line2.path[seg2 + 1];

                    // 提取坐标
                    const x1 = p1Start.lng !== undefined ? p1Start.lng : p1Start[0];
                    const y1 = p1Start.lat !== undefined ? p1Start.lat : p1Start[1];
                    const x2 = p1End.lng !== undefined ? p1End.lng : p1End[0];
                    const y2 = p1End.lat !== undefined ? p1End.lat : p1End[1];
                    const x3 = p2Start.lng !== undefined ? p2Start.lng : p2Start[0];
                    const y3 = p2Start.lat !== undefined ? p2Start.lat : p2Start[1];
                    const x4 = p2End.lng !== undefined ? p2End.lng : p2End[0];
                    const y4 = p2End.lat !== undefined ? p2End.lat : p2End[1];

                    // 检测两条线段是否相交
                    const intersection = getLineSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4);

                    if (intersection) {
                        console.log(`发现相交点: (${intersection.lng}, ${intersection.lat})`);
                        intersectionCount++;

                        // 强制创建新的交点节点（不使用findOrCreateNode以避免合并）
                        const intersectionNode = {
                            id: kmlNodes.length,
                            lng: intersection.lng,
                            lat: intersection.lat
                        };
                        kmlNodes.push(intersectionNode);

                        // 查找包含这两个线段的边并分割它们
                        const edge1 = findEdgeContainingSegment(p1Start, p1End);
                        const edge2 = findEdgeContainingSegment(p2Start, p2End);

                        if (edge1) {
                            splitEdgeAtIntersection(edge1, p1Start, p1End, intersectionNode);
                        }
                        if (edge2) {
                            splitEdgeAtIntersection(edge2, p2Start, p2End, intersectionNode);
                        }
                    }
                }
            }
        }
    }

    // 如果添加了新的连接，需要清理被分割的旧边并重新构建邻接表
    if (intersectionCount > 0) {
        console.log(`共检测到 ${intersectionCount} 个相交点`);

        // 清理被标记删除的边
        const originalEdgeCount = kmlEdges.length;
        kmlEdges = kmlEdges.filter(edge => !edge.toDelete);
        const removedEdgeCount = originalEdgeCount - kmlEdges.length;

        if (removedEdgeCount > 0) {
            console.log(`清理了 ${removedEdgeCount} 条被分割的旧边`);
        }

        console.log(`重新构建图结构: ${kmlNodes.length} 节点, ${kmlEdges.length} 边`);
        kmlGraph = buildAdjacencyList();
    } else {
        console.log('未检测到线段相交');
    }
}

// 计算两条线段的相交点
function getLineSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    // 使用参数方程求解线段相交
    // 线段1: P1 + t * (P2 - P1), t ∈ [0, 1]
    // 线段2: P3 + u * (P4 - P3), u ∈ [0, 1]

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // 平行或共线
    if (Math.abs(denom) < 1e-10) {
        return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // 检查交点是否在线段范围内
    // 修改逻辑：允许一条线段的端点在另一条线段上（支路连接主路的情况）
    const epsilon = 0.0001; // 减小容差，更精确

    // t是交点在线段1上的位置，u是交点在线段2上的位置
    // 至少有一个参数需要在内部（不在端点），这样才是真正的相交
    const t_valid = t > -epsilon && t < (1 + epsilon); // 在线段1范围内（含端点）
    const u_valid = u > -epsilon && u < (1 + epsilon); // 在线段2范围内（含端点）

    const t_interior = t > epsilon && t < (1 - epsilon); // 在线段1内部
    const u_interior = u > epsilon && u < (1 - epsilon); // 在线段2内部

    // 情况1：两条线段真正相交（至少一个在内部）
    // 情况2：一条线段的端点在另一条线段上（支路）
    if (t_valid && u_valid && (t_interior || u_interior)) {
        // 计算交点坐标
        const intersectionX = x1 + t * (x2 - x1);
        const intersectionY = y1 + t * (y2 - y1);

        return {
            lng: intersectionX,
            lat: intersectionY,
            t: t,  // 保存参数，用于判断是否在端点
            u: u
        };
    }

    return null;
}

// 计算点到点之间的转向角度
function calculateTurnAngleAtPoint(point1, point2, point3) {
    // 计算从point1到point2的方位角
    const bearing1 = calculateBearing(point1, point2);
    // 计算从point2到point3的方位角
    const bearing2 = calculateBearing(point2, point3);

    // 计算转向角度
    let angle = bearing2 - bearing1;

    // 规范化角度到 -180 到 180 范围
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;

    return angle;
}

// 计算两点之间的方位角（度，0-360）
function calculateBearing(coord1, coord2) {
    let lng1, lat1, lng2, lat2;

    // 处理不同的坐标格式
    if (coord1.lng !== undefined && coord1.lat !== undefined) {
        lng1 = coord1.lng;
        lat1 = coord1.lat;
    } else if (Array.isArray(coord1)) {
        lng1 = coord1[0];
        lat1 = coord1[1];
    } else {
        return 0;
    }

    if (coord2.lng !== undefined && coord2.lat !== undefined) {
        lng2 = coord2.lng;
        lat2 = coord2.lat;
    } else if (Array.isArray(coord2)) {
        lng2 = coord2[0];
        lat2 = coord2[1];
    } else {
        return 0;
    }

    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLng = (lng2 - lng1) * Math.PI / 180;

    const y = Math.sin(deltaLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLng);

    const bearing = Math.atan2(y, x) * 180 / Math.PI;

    // 规范化到 0-360 范围
    return (bearing + 360) % 360;
}

// 查找包含指定线段的边
function findEdgeContainingSegment(segStart, segEnd) {
    const tolerance = 0.00001; // 容差

    for (const edge of kmlEdges) {
        if (!edge.coordinates || edge.coordinates.length < 2) continue;

        // 检查边的坐标序列中是否包含这个线段
        for (let i = 0; i < edge.coordinates.length - 1; i++) {
            const coord1 = edge.coordinates[i];
            const coord2 = edge.coordinates[i + 1];

            const lng1 = coord1.lng !== undefined ? coord1.lng : coord1[0];
            const lat1 = coord1.lat !== undefined ? coord1.lat : coord1[1];
            const lng2 = coord2.lng !== undefined ? coord2.lng : coord2[0];
            const lat2 = coord2.lat !== undefined ? coord2.lat : coord2[1];

            const sLng = segStart.lng !== undefined ? segStart.lng : segStart[0];
            const sLat = segStart.lat !== undefined ? segStart.lat : segStart[1];
            const eLng = segEnd.lng !== undefined ? segEnd.lng : segEnd[0];
            const eLat = segEnd.lat !== undefined ? segEnd.lat : segEnd[1];

            // 检查是否匹配（考虑容差）
            if ((Math.abs(lng1 - sLng) < tolerance && Math.abs(lat1 - sLat) < tolerance &&
                 Math.abs(lng2 - eLng) < tolerance && Math.abs(lat2 - eLat) < tolerance) ||
                (Math.abs(lng1 - eLng) < tolerance && Math.abs(lat1 - eLat) < tolerance &&
                 Math.abs(lng2 - sLng) < tolerance && Math.abs(lat2 - sLat) < tolerance)) {
                return edge;
            }
        }
    }

    return null;
}

// 在交点处分割边
function splitEdgeAtIntersection(edge, segmentP1, segmentP2, intersectionNode) {
    if (!edge.coordinates || edge.coordinates.length < 2) return;

    const tolerance = 0.00001;
    const intersectionPos = { lng: intersectionNode.lng, lat: intersectionNode.lat };

    // 找到线段在边坐标序列中的位置
    let segmentIndex = -1;
    for (let i = 0; i < edge.coordinates.length - 1; i++) {
        const coord1 = edge.coordinates[i];
        const coord2 = edge.coordinates[i + 1];

        const lng1 = coord1.lng !== undefined ? coord1.lng : coord1[0];
        const lat1 = coord1.lat !== undefined ? coord1.lat : coord1[1];
        const lng2 = coord2.lng !== undefined ? coord2.lng : coord2[0];
        const lat2 = coord2.lat !== undefined ? coord2.lat : coord2[1];

        const sLng = segmentP1.lng !== undefined ? segmentP1.lng : segmentP1[0];
        const sLat = segmentP1.lat !== undefined ? segmentP1.lat : segmentP1[1];
        const eLng = segmentP2.lng !== undefined ? segmentP2.lng : segmentP2[0];
        const eLat = segmentP2.lat !== undefined ? segmentP2.lat : segmentP2[1];

        if ((Math.abs(lng1 - sLng) < tolerance && Math.abs(lat1 - sLat) < tolerance &&
             Math.abs(lng2 - eLng) < tolerance && Math.abs(lat2 - eLat) < tolerance) ||
            (Math.abs(lng1 - eLng) < tolerance && Math.abs(lat1 - eLat) < tolerance &&
             Math.abs(lng2 - sLng) < tolerance && Math.abs(lat2 - sLat) < tolerance)) {
            segmentIndex = i;
            break;
        }
    }

    if (segmentIndex === -1) {
        console.warn('未找到要分割的线段');
        return;
    }

    // 获取原边的起点和终点节点
    const startNode = kmlNodes.find(n => n.id === edge.start);
    const endNode = kmlNodes.find(n => n.id === edge.end);

    if (!startNode || !endNode) return;

    // 不再检查交点是否接近端点，所有交点都创建独立节点并分割边

    // 分割坐标序列
    const coords1 = edge.coordinates.slice(0, segmentIndex + 1);
    coords1.push(intersectionPos);

    const coords2 = [intersectionPos];
    coords2.push(...edge.coordinates.slice(segmentIndex + 1));

    // 计算两段的距离
    let dist1 = 0;
    for (let i = 0; i < coords1.length - 1; i++) {
        dist1 += calculateDistance(coords1[i], coords1[i + 1]);
    }

    let dist2 = 0;
    for (let i = 0; i < coords2.length - 1; i++) {
        dist2 += calculateDistance(coords2[i], coords2[i + 1]);
    }

    // 添加新边（不删除旧边，稍后统一清理）
    addEdge(startNode.id, intersectionNode.id, dist1, coords1);
    addEdge(intersectionNode.id, endNode.id, dist2, coords2);

    // 标记原边为待删除
    edge.toDelete = true;

    console.log(`边分割: ${edge.start}->${edge.end} 在交点 ${intersectionNode.id} 处分为两段`);
}
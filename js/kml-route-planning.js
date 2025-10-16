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

                    // 为每个线段的端点创建节点
                    for (let i = 0; i < validPath.length - 1; i++) {
                        const startNode = findOrCreateNode(validPath[i]);
                        const endNode = findOrCreateNode(validPath[i + 1]);

                        // 只有当两个节点都有效时才创建边
                        if (startNode && endNode) {
                            // 创建边
                            const distance = calculateDistance(validPath[i], validPath[i + 1]);
                            addEdge(startNode.id, endNode.id, distance);
                        }
                    }
                }
            }
        });
    });

    // 构建图结构
    kmlGraph = buildAdjacencyList();

    // 检测并连接相交的线段
    connectIntersectingLines();

    console.log(`KML路径图构建完成: ${kmlNodes.length} 节点, ${kmlEdges.length} 边`);
    return kmlNodes.length > 0 && kmlEdges.length > 0;
}

// 查找或创建节点
function findOrCreateNode(coordinate) {
    const tolerance = 0.0001; // 坐标容差

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
        return dist < tolerance * 111000; // 转换为米
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
function addEdge(startId, endId, distance) {
    if (startId === endId) return;

    // 检查是否已存在该边
    const existingEdge = kmlEdges.find(edge =>
        (edge.start === startId && edge.end === endId) ||
        (edge.start === endId && edge.end === startId)
    );

    if (!existingEdge) {
        kmlEdges.push({
            start: startId,
            end: endId,
            distance: distance
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

    // 添加边
    kmlEdges.forEach(edge => {
        graph[edge.start].push({
            node: edge.end,
            distance: edge.distance
        });
        graph[edge.end].push({
            node: edge.start,
            distance: edge.distance
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
    const unvisited = new Set();

    // 初始化距离
    kmlNodes.forEach(node => {
        distances[node.id] = Infinity;
        previous[node.id] = null;
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
                }
            }
        });
    }

    // 重构路径
    const path = [];
    let currentNode = endNodeId;

    while (currentNode !== null) {
        const node = kmlNodes.find(n => n.id === currentNode);
        if (node) {
            path.unshift([node.lng, node.lat]);
        }
        currentNode = previous[currentNode];
    }

    if (path.length === 0 || path[0][0] !== kmlNodes.find(n => n.id === startNodeId).lng) {
        return null; // 无路径
    }

    return {
        path: path,
        distance: distances[endNodeId]
    };
}

// 基于KML的路径规划
function planKMLRoute(startCoordinate, endCoordinate) {
    console.log('planKMLRoute 输入坐标:', { startCoordinate, endCoordinate });

    // 构建或更新KML图
    if (!kmlGraph) {
        const success = buildKMLGraph();
        if (!success) {
            return null;
        }
    }

    // 找到最近的起点和终点节点
    const startNode = findNearestKMLNode(startCoordinate);
    const endNode = findNearestKMLNode(endCoordinate);

    console.log('找到的节点:', { startNode, endNode });

    if (!startNode || !endNode) {
        console.error('无法找到合适的KML节点');
        return null;
    }

    // 验证节点坐标有效性
    if (isNaN(startNode.lng) || isNaN(startNode.lat) || isNaN(endNode.lng) || isNaN(endNode.lat)) {
        console.error('节点坐标包含NaN:', { startNode, endNode });
        return null;
    }

    // 使用Dijkstra算法计算路径
    const result = dijkstra(startNode.id, endNode.id);

    if (!result) {
        console.error('无法在KML路径中找到连接');
        return null;
    }

    console.log('Dijkstra返回路径:', result.path);

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

    return {
        path: validPath,
        distance: result.distance,
        startNode: startNode,
        endNode: endNode
    };
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

    // 额外的清理：移除所有 Polyline 类型的覆盖物（除了KML的线）
    // 临时隐藏KML的线，避免渲染冲突
    const kmlLines = [];
    try {
        const allOverlays = map.getAllOverlays();
        console.log('当前地图上的所有覆盖物数量:', allOverlays.length);

        allOverlays.forEach(overlay => {
            if (overlay.CLASS_NAME === 'AMap.Polyline') {
                const extData = overlay.getExtData ? overlay.getExtData() : null;
                if (extData && extData.type === '线') {
                    // 这是KML的线，临时隐藏
                    console.log('临时隐藏KML线:', extData.name);
                    kmlLines.push(overlay);
                    overlay.hide();
                } else if (!extData || extData.type !== '线') {
                    // 清除旧的路线 Polyline
                    console.log('清除旧的路线 Polyline');
                    map.remove(overlay);
                }
            }
        });

        // 保存KML线的引用，稍后恢复显示
        window.hiddenKMLLines = kmlLines;
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

    // 创建路径线
    let polyline;
    try {
        polyline = new AMap.Polyline({
            path: amapPath,
            strokeColor: '#00AA00',
            strokeWeight: 6,
            strokeOpacity: 0.8,
            strokeStyle: 'solid',
            zIndex: 100  // 设置较高的 z-index
        });
        console.log('Polyline创建成功，准备添加到地图');

        // 延迟添加到地图，等待地图渲染完成
        setTimeout(() => {
            try {
                map.add(polyline);
                console.log('Polyline已添加到地图');
            } catch (addError) {
                console.error('添加Polyline到地图时出错:', addError);
            }
        }, 100);
    } catch (error) {
        console.error('创建Polyline时出错:', error);
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

    // 不调整地图视野，避免触发渲染错误
    // 改为直接设置中心点和缩放级别
    if (validPath.length >= 2) {
        const midLng = (validPath[0][0] + validPath[validPath.length - 1][0]) / 2;
        const midLat = (validPath[0][1] + validPath[validPath.length - 1][1]) / 2;

        console.log('设置地图中心到:', midLng, midLat);

        // 延迟设置地图中心，等待Polyline渲染完成
        setTimeout(() => {
            try {
                map.setCenter([midLng, midLat]);
                // 不调用 setBounds，因为它可能触发有问题的覆盖物的渲染

                // 恢复KML线的显示
                if (window.hiddenKMLLines && window.hiddenKMLLines.length > 0) {
                    console.log('恢复显示KML线:', window.hiddenKMLLines.length);
                    window.hiddenKMLLines.forEach(line => {
                        try {
                            line.show();
                        } catch (e) {
                            console.warn('恢复显示KML线时出错:', e);
                        }
                    });
                    window.hiddenKMLLines = [];
                }
            } catch (e) {
                console.error('设置地图中心时出错:', e);
            }
        }, 200);
    }

    return polyline;
}

// 清除之前的路径
function clearPreviousRoute() {
    if (window.currentKMLRoute) {
        map.remove(window.currentKMLRoute.polyline);
        if (window.currentKMLRoute.startMarker) {
            map.remove(window.currentKMLRoute.startMarker);
        }
        if (window.currentKMLRoute.endMarker) {
            map.remove(window.currentKMLRoute.endMarker);
        }
        window.currentKMLRoute = null;
    }
}

// 检测并连接相交的线段
function connectIntersectingLines() {
    console.log('开始检测线段相交...');

    let intersectionCount = 0;
    const edgesCount = kmlEdges.length;

    // 遍历所有边对，检测相交
    for (let i = 0; i < edgesCount; i++) {
        const edge1 = kmlEdges[i];
        const node1Start = kmlNodes.find(n => n.id === edge1.start);
        const node1End = kmlNodes.find(n => n.id === edge1.end);

        if (!node1Start || !node1End) continue;

        for (let j = i + 1; j < edgesCount; j++) {
            const edge2 = kmlEdges[j];

            // 跳过共享端点的边（它们已经连接）
            if (edge1.start === edge2.start || edge1.start === edge2.end ||
                edge1.end === edge2.start || edge1.end === edge2.end) {
                continue;
            }

            const node2Start = kmlNodes.find(n => n.id === edge2.start);
            const node2End = kmlNodes.find(n => n.id === edge2.end);

            if (!node2Start || !node2End) continue;

            // 检测两条线段是否相交
            const intersection = getLineSegmentIntersection(
                node1Start.lng, node1Start.lat, node1End.lng, node1End.lat,
                node2Start.lng, node2Start.lat, node2End.lng, node2End.lat
            );

            if (intersection) {
                console.log(`发现相交点: (${intersection.lng}, ${intersection.lat})`);
                intersectionCount++;

                // 在相交点创建新节点
                const intersectionNode = findOrCreateNode({
                    lng: intersection.lng,
                    lat: intersection.lat
                });

                if (intersectionNode) {
                    // 将第一条边分割为两段
                    const dist1ToIntersection = calculateDistance(
                        {lng: node1Start.lng, lat: node1Start.lat},
                        {lng: intersectionNode.lng, lat: intersectionNode.lat}
                    );
                    const distIntersectionTo1End = calculateDistance(
                        {lng: intersectionNode.lng, lat: intersectionNode.lat},
                        {lng: node1End.lng, lat: node1End.lat}
                    );

                    // 将第二条边分割为两段
                    const dist2ToIntersection = calculateDistance(
                        {lng: node2Start.lng, lat: node2Start.lat},
                        {lng: intersectionNode.lng, lat: intersectionNode.lat}
                    );
                    const distIntersectionTo2End = calculateDistance(
                        {lng: intersectionNode.lng, lat: intersectionNode.lat},
                        {lng: node2End.lng, lat: node2End.lat}
                    );

                    // 添加新的边（连接相交点和原始边的端点）
                    addEdge(node1Start.id, intersectionNode.id, dist1ToIntersection);
                    addEdge(intersectionNode.id, node1End.id, distIntersectionTo1End);
                    addEdge(node2Start.id, intersectionNode.id, dist2ToIntersection);
                    addEdge(intersectionNode.id, node2End.id, distIntersectionTo2End);

                    console.log(`已在相交点创建连接节点 ID: ${intersectionNode.id}`);
                }
            }
        }
    }

    // 如果添加了新的连接，需要重新构建邻接表
    if (intersectionCount > 0) {
        console.log(`共检测到 ${intersectionCount} 个相交点，重新构建图结构`);
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

    // 检查交点是否在两条线段内部（不包括端点）
    // 使用较小的容差避免端点被误判为相交
    const epsilon = 0.001;
    if (t > epsilon && t < (1 - epsilon) && u > epsilon && u < (1 - epsilon)) {
        // 计算交点坐标
        const intersectionX = x1 + t * (x2 - x1);
        const intersectionY = y1 + t * (y2 - y1);

        return {
            lng: intersectionX,
            lat: intersectionY
        };
    }

    return null;
}
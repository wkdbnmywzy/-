/**
 * 线段分割与交点处理模块
 * 功能：
 * 1. 从KML提取所有线段
 * 2. 检测所有线段间的交点
 * 3. 按交点分割线段（端点在线上→3段，内部交点→4段）
 * 4. 构建图时以交点坐标为准进行节点合并
 */

// 容差设置：两点距离小于此值视为同一点（度数单位，约1米）
const COORD_TOLERANCE = 0.00001;

/**
 * 计算两点间的欧氏距离（平面近似）
 */
function distance(p1, p2) {
    const dx = p1.lng - p2.lng;
    const dy = p1.lat - p2.lat;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 判断两点是否为同一点（在容差范围内）
 */
function isSamePoint(p1, p2) {
    return distance(p1, p2) < COORD_TOLERANCE;
}

/**
 * 从KML文档提取所有线段
 * @param {Document} kmlDoc - KML文档对象
 * @returns {Array} segments - 线段数组，每个线段格式: {start: {lng, lat}, end: {lng, lat}, id: uniqueId}
 */
function extractSegmentsFromKML(kmlDoc) {
    const segments = [];
    let segmentId = 0;
    
    const placemarks = kmlDoc.getElementsByTagName('Placemark');
    
    for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        const lineStrings = placemark.getElementsByTagName('LineString');
        
        for (let j = 0; j < lineStrings.length; j++) {
            const lineString = lineStrings[j];
            const coordsText = lineString.getElementsByTagName('coordinates')[0]?.textContent.trim();
            
            if (!coordsText) continue;
            
            // 解析坐标
            const coords = coordsText.split(/\s+/).map(coord => {
                const parts = coord.split(',');
                return {
                    lng: parseFloat(parts[0]),
                    lat: parseFloat(parts[1])
                };
            }).filter(c => !isNaN(c.lng) && !isNaN(c.lat));
            
            // 将LineString拆分为多个线段
            for (let k = 0; k < coords.length - 1; k++) {
                segments.push({
                    id: `seg_${segmentId++}`,
                    start: coords[k],
                    end: coords[k + 1],
                    originalPlacemark: placemark
                });
            }
        }
    }
    
    console.log(`从KML提取了 ${segments.length} 个线段`);
    return segments;
}

/**
 * 计算线段AB与线段CD的交点
 * @returns {Object|null} - 交点信息或null
 *   {
 *     point: {lng, lat},
 *     onAB: {isEndpoint: bool, param: t},  // t in [0,1]
 *     onCD: {isEndpoint: bool, param: s}   // s in [0,1]
 *   }
 */
function segmentIntersection(A, B, C, D) {
    const dxAB = B.lng - A.lng;
    const dyAB = B.lat - A.lat;
    const dxCD = D.lng - C.lng;
    const dyCD = D.lat - C.lat;
    
    const denominator = dxAB * dyCD - dyAB * dxCD;
    
    // 平行或共线
    if (Math.abs(denominator) < 1e-10) {
        return null;
    }
    
    const dxAC = C.lng - A.lng;
    const dyAC = C.lat - A.lat;
    
    const t = (dxAC * dyCD - dyAC * dxCD) / denominator;
    const s = (dxAC * dyAB - dyAC * dxAB) / denominator;
    
    // 检查是否在线段范围内（严格内部或端点）
    const epsilon = 1e-9;
    if (t < -epsilon || t > 1 + epsilon || s < -epsilon || s > 1 + epsilon) {
        return null;
    }
    
    // 计算交点
    const point = {
        lng: A.lng + t * dxAB,
        lat: A.lat + t * dyAB
    };
    
    // 判断是否为端点交点
    const tIsEndpoint = t < epsilon || t > 1 - epsilon;
    const sIsEndpoint = s < epsilon || s > 1 - epsilon;
    
    return {
        point,
        onAB: { isEndpoint: tIsEndpoint, param: t },
        onCD: { isEndpoint: sIsEndpoint, param: s }
    };
}

/**
 * 检测所有线段间的交点
 * @param {Array} segments - 线段数组
 * @returns {Array} intersections - 交点数组
 */
function detectAllIntersections(segments) {
    const intersections = [];
    
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const seg1 = segments[i];
            const seg2 = segments[j];
            
            const intersection = segmentIntersection(
                seg1.start, seg1.end,
                seg2.start, seg2.end
            );
            
            if (intersection) {
                // 如果两端点完全重合，跳过（这是连接点，不需要分割）
                const bothEndpoints = intersection.onAB.isEndpoint && intersection.onCD.isEndpoint;
                
                if (!bothEndpoints) {
                    intersections.push({
                        point: intersection.point,
                        seg1: seg1.id,
                        seg2: seg2.id,
                        type: getIntersectionType(intersection)
                    });
                }
            }
        }
    }
    
    console.log(`检测到 ${intersections.length} 个交点`);
    return intersections;
}

/**
 * 判断交点类型
 */
function getIntersectionType(intersection) {
    const onABEndpoint = intersection.onAB.isEndpoint;
    const onCDEndpoint = intersection.onCD.isEndpoint;
    
    if (!onABEndpoint && !onCDEndpoint) {
        return 'INTERIOR_INTERIOR'; // 内部相交，形成4段
    } else if (onABEndpoint && !onCDEndpoint) {
        return 'ENDPOINT_ON_LINE'; // seg1的端点在seg2上，形成3段
    } else if (!onABEndpoint && onCDEndpoint) {
        return 'ENDPOINT_ON_LINE'; // seg2的端点在seg1上，形成3段
    }
    return 'ENDPOINT_ENDPOINT'; // 双端点（已过滤）
}

/**
 * 按交点分割所有线段
 * @param {Array} segments - 原始线段数组
 * @param {Array} intersections - 交点数组
 * @returns {Array} newSegments - 分割后的新线段数组
 */
function splitSegmentsByIntersections(segments, intersections) {
    // 为每个线段建立需要分割的点列表
    const segmentSplitPoints = new Map();
    segments.forEach(seg => {
        segmentSplitPoints.set(seg.id, []);
    });
    
    // 收集所有交点到对应线段
    intersections.forEach(inter => {
        segmentSplitPoints.get(inter.seg1).push({
            point: inter.point,
            isIntersection: true
        });
        segmentSplitPoints.get(inter.seg2).push({
            point: inter.point,
            isIntersection: true
        });
    });
    
    // 对每个线段进行分割
    const newSegments = [];
    let newSegId = 0;
    
    segments.forEach(seg => {
        const splitPoints = segmentSplitPoints.get(seg.id);
        
        if (splitPoints.length === 0) {
            // 无交点，保持原线段（保留原始信息）
            newSegments.push({
                id: `new_seg_${newSegId++}`,
                start: seg.start,
                end: seg.end,
                originalLine: seg.originalLine,
                originalLineIndex: seg.originalLineIndex
            });
        } else {
            // 有交点，需要分割
            // 按照在线段上的位置排序
            const allPoints = [
                { point: seg.start, param: 0, isIntersection: false },
                ...splitPoints.map(sp => ({
                    point: sp.point,
                    param: calculateParam(seg.start, seg.end, sp.point),
                    isIntersection: sp.isIntersection
                })),
                { point: seg.end, param: 1, isIntersection: false }
            ];
            
            // 按param排序
            allPoints.sort((a, b) => a.param - b.param);
            
            // 生成新线段（保留原始信息）
            for (let i = 0; i < allPoints.length - 1; i++) {
                const p1 = allPoints[i].point;
                const p2 = allPoints[i + 1].point;
                
                // 跳过重复点
                if (!isSamePoint(p1, p2)) {
                    newSegments.push({
                        id: `new_seg_${newSegId++}`,
                        start: p1,
                        end: p2,
                        originalLine: seg.originalLine,
                        originalLineIndex: seg.originalLineIndex
                    });
                }
            }
        }
    });
    
    console.log(`分割后生成 ${newSegments.length} 个新线段`);
    return newSegments;
}

/**
 * 计算点P在线段AB上的参数t (0到1)
 */
function calculateParam(A, B, P) {
    const dxAB = B.lng - A.lng;
    const dyAB = B.lat - A.lat;
    const dxAP = P.lng - A.lng;
    const dyAP = P.lat - A.lat;
    
    const lengthAB = Math.sqrt(dxAB * dxAB + dyAB * dyAB);
    if (lengthAB < 1e-10) return 0;
    
    const lengthAP = Math.sqrt(dxAP * dxAP + dyAP * dyAP);
    return lengthAP / lengthAB;
}

/**
 * 从分割后的线段构建图（节点以交点为准）
 * @param {Array} segments - 线段数组
 * @param {Array} intersections - 交点数组（用于优先级）
 * @returns {Object} graph - { nodes: Map<string, {lng, lat}>, edges: Array }
 */
function buildGraphFromSegments(segments, intersections) {
    // 收集所有交点坐标（优先级最高）
    const intersectionPoints = new Set();
    intersections.forEach(inter => {
        const key = coordToKey(inter.point);
        intersectionPoints.add(key);
    });
    
    // 节点映射：坐标key -> 节点对象
    const nodeMap = new Map();
    let nodeId = 0;
    
    /**
     * 获取或创建节点（优先使用交点坐标）
     */
    function getOrCreateNode(point) {
        let key = coordToKey(point);
        
        // 检查是否有交点在容差范围内
        if (!intersectionPoints.has(key)) {
            // 遍历所有交点，找到最近的
            for (const interKey of intersectionPoints) {
                const interPoint = keyToCoord(interKey);
                if (isSamePoint(point, interPoint)) {
                    // 找到匹配的交点，使用交点坐标
                    key = interKey;
                    point = interPoint;
                    break;
                }
            }
        }
        
        if (!nodeMap.has(key)) {
            nodeMap.set(key, {
                id: `node_${nodeId++}`,
                lng: point.lng,
                lat: point.lat
            });
        }
        
        return nodeMap.get(key);
    }
    
    // 构建边
    const edges = [];
    segments.forEach(seg => {
        const startNode = getOrCreateNode(seg.start);
        const endNode = getOrCreateNode(seg.end);
        
        // 跳过自环
        if (startNode.id !== endNode.id) {
            const dist = distance(seg.start, seg.end);
            edges.push({
                from: startNode.id,
                to: endNode.id,
                weight: dist,
                coords: [seg.start, seg.end]
            });
            
            // 无向图，添加反向边
            edges.push({
                from: endNode.id,
                to: startNode.id,
                weight: dist,
                coords: [seg.end, seg.start]
            });
        }
    });
    
    console.log(`构建图: ${nodeMap.size} 个节点, ${edges.length / 2} 条边`);
    
    return {
        nodes: nodeMap,
        edges: edges
    };
}

/**
 * 坐标转key（用于去重）
 */
function coordToKey(point) {
    return `${point.lng.toFixed(8)},${point.lat.toFixed(8)}`;
}

/**
 * key转坐标
 */
function keyToCoord(key) {
    const parts = key.split(',');
    return {
        lng: parseFloat(parts[0]),
        lat: parseFloat(parts[1])
    };
}

/**
 * 主入口：处理KML并返回分割后的图
 */
function processKMLWithIntersections(kmlDoc) {
    console.log('开始处理KML线段分割...');
    
    // 1. 提取所有线段
    const segments = extractSegmentsFromKML(kmlDoc);
    
    if (segments.length === 0) {
        console.warn('KML中没有找到线段');
        return null;
    }
    
    // 2. 检测交点
    const intersections = detectAllIntersections(segments);
    
    // 3. 按交点分割线段
    const newSegments = splitSegmentsByIntersections(segments, intersections);
    
    // 4. 构建图（以交点为准）
    const graph = buildGraphFromSegments(newSegments, intersections);
    
    console.log('KML处理完成');
    
    return {
        segments: newSegments,
        intersections: intersections,
        graph: graph
    };
}

/**
 * 生成新的KML文档（包含分割后的线段）
 */
function generateNewKML(segments) {
    let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>分割后的路网</name>
    <Style id="lineStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>2</width>
      </LineStyle>
    </Style>
`;
    
    segments.forEach(seg => {
        kmlContent += `    <Placemark>
      <name>${seg.id}</name>
      <styleUrl>#lineStyle</styleUrl>
      <LineString>
        <coordinates>
          ${seg.start.lng},${seg.start.lat},0
          ${seg.end.lng},${seg.end.lat},0
        </coordinates>
      </LineString>
    </Placemark>
`;
    });
    
    kmlContent += `  </Document>
</kml>`;
    
    return kmlContent;
}

// 导出函数
window.SegmentSplitter = {
    processKMLWithIntersections,
    generateNewKML,
    extractSegmentsFromKML,
    detectAllIntersections,
    splitSegmentsByIntersections,
    buildGraphFromSegments,
    COORD_TOLERANCE
};


// kml-handler.js
// KML文件导入、解析和显示功能（支持KML原生样式）

function initKMLImport() {
    const importBtn = document.getElementById('import-btn');
    const fileInput = document.getElementById('file-input');
    
    // 点击导入按钮触发文件选择
    importBtn.addEventListener('click', function() {
        fileInput.click();
    });
    
    // 文件选择变化
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            handleKMLFile(file);
        }
    });
    
    // 拖放功能
    setupDragAndDrop();
}

function setupDragAndDrop() {
    // 阻止默认拖放行为
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // 高亮拖放区域
    ['dragenter', 'dragover'].forEach(eventName => {
        document.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        document.body.style.backgroundColor = '#f0f8ff';
    }
    
    function unhighlight() {
        document.body.style.backgroundColor = '';
    }
    
    // 处理文件拖放
    document.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            const file = files[0];
            if (file.name.toLowerCase().endsWith('.kml')) {
                handleKMLFile(file);
            } else {
                alert('请选择KML文件');
            }
        }
    }
}

function handleKMLFile(file) {
    currentKmlFile = file;

    const reader = new FileReader();
    reader.onload = function(e) {
        const kmlContent = e.target.result;

        // 清除旧的KML数据（包括原始数据和结构化数据）
        sessionStorage.removeItem('kmlRawData');
        sessionStorage.removeItem('kmlFileName');
        sessionStorage.removeItem('kmlData');
        console.log('已清除旧的KML数据');

        // 保存新的原始KML文本到sessionStorage
        sessionStorage.setItem('kmlRawData', kmlContent);
        sessionStorage.setItem('kmlFileName', file.name);
        console.log('已保存新的原始KML数据到sessionStorage');

        // 标记为首次导入（用户主动选择文件）
        window.isFirstKMLImport = true;

        parseKML(kmlContent, file.name);
    };
    reader.onerror = function() {
        alert('文件读取失败');
    };
    reader.readAsText(file);
}

function parseKML(kmlContent, fileName) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(kmlContent, 'text/xml');

        // 检查解析错误
        const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
        if (parserError) {
            throw new Error('KML文件格式错误');
        }

        // 提取所有Placemark
        const placemarks = xmlDoc.getElementsByTagName('Placemark');
        const features = [];

        for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            const feature = parsePlacemark(placemark, xmlDoc);  // 传入xmlDoc用于解析外部样式
            if (feature) {
                features.push(feature);
            }
        }

        if (features.length === 0) {
            alert('未找到有效的地理要素');
            return;
        }

        // 在导入时识别交点并分割线段
        const processedFeatures = processLineIntersections(features);

        // 在地图上显示KML要素
        displayKMLFeatures(processedFeatures, fileName);

    } catch (error) {
        console.error('KML解析错误:', error);
        alert('KML文件解析失败: ' + error.message);
    }
}

function parsePlacemark(placemark, xmlDoc) {
    const name = placemark.getElementsByTagName('name')[0]?.textContent || '未命名要素';

    // 过滤掉名称为 "New Point" 的点要素（通常是路线规划的中间点）
    if (name === 'New Point') {
        return null;
    }

    // 解析样式信息（新增）
    const style = parseStyle(placemark, xmlDoc);
    
    // 解析几何要素
    let geometry = null;
    let type = '';
    
    // 点要素
    const point = placemark.getElementsByTagName('Point')[0];
    if (point) {
        const coordinates = point.getElementsByTagName('coordinates')[0]?.textContent;
        if (coordinates) {
            const [lng, lat] = coordinates.split(',').map(coord => parseFloat(coord.trim()));
            // 坐标转换：WGS84转GCJ02
            const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
            geometry = { 
                type: 'point', 
                coordinates: [gcjLng, gcjLat], 
                originalCoordinates: [lng, lat],
                style: style.pointStyle  // 关联点样式
            };
            type = '点';
        }
    }
    
    // 线要素
    const lineString = placemark.getElementsByTagName('LineString')[0];
    if (lineString) {
        const coordinates = lineString.getElementsByTagName('coordinates')[0]?.textContent;
        if (coordinates) {
            // 清理坐标字符串，处理各种空白字符
            const cleanedCoords = coordinates.trim().replace(/\s+/g, ' ');
            const coordsArray = cleanedCoords.split(' ')
                .filter(coord => coord.trim().length > 0)
                .map(coord => {
                    const parts = coord.split(',');
                    if (parts.length >= 2) {
                        const lng = parseFloat(parts[0].trim());
                        const lat = parseFloat(parts[1].trim());

                        // 验证坐标有效性
                        if (!isNaN(lng) && !isNaN(lat) && isFinite(lng) && isFinite(lat)) {
                            // 坐标转换：WGS84转GCJ02
                            const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
                            return [gcjLng, gcjLat];
                        }
                    }
                    return null;
                })
                .filter(coord => coord !== null); // 过滤无效坐标

            if (coordsArray.length >= 2) {
                geometry = { 
                    type: 'line', 
                    coordinates: coordsArray,
                    style: style.lineStyle  // 关联线样式
                };
                type = '线';
            }
        }
    }
    
    // 面要素
    const polygon = placemark.getElementsByTagName('Polygon')[0];
    if (polygon) {
        const outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
        const linearRing = outerBoundary?.getElementsByTagName('LinearRing')[0];
        const coordinates = linearRing?.getElementsByTagName('coordinates')[0]?.textContent;
        
        if (coordinates) {
            const coordsArray = coordinates.trim().split(' ').map(coord => {
                const [lng, lat] = coord.split(',').map(c => parseFloat(c.trim()));
                // 坐标转换：WGS84转GCJ02
                const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
                return [gcjLng, gcjLat];
            });
            geometry = { 
                type: 'polygon', 
                coordinates: coordsArray,
                style: style.polyStyle  // 关联面样式
            };
            type = '面';
        }
    }
    
    if (!geometry) return null;
    
    return {
        name: name,
        type: type,
        geometry: geometry,
        description: placemark.getElementsByTagName('description')[0]?.textContent || ''
    };
}

// 解析KML中的样式信息（新增）
function parseStyle(placemark, xmlDoc) {
    // 从Placemark直接获取样式
    let styleNode = placemark.getElementsByTagName('Style')[0];

    // 如果没有直接样式，尝试通过StyleUrl关联（处理#开头的内部样式）
    if (!styleNode) {
        const styleUrl = placemark.getElementsByTagName('styleUrl')[0]?.textContent;
        console.log(`解析样式 - styleUrl: ${styleUrl}`);
        if (styleUrl && styleUrl.startsWith('#')) {
            const styleId = styleUrl.slice(1);
            // 从整个XML文档中查找对应ID的样式
            styleNode = xmlDoc.querySelector(`Style[id="${styleId}"]`);
            console.log(`查找样式ID: ${styleId}, 找到: ${styleNode ? '是' : '否'}`);
        }
    } else {
        console.log('使用内联样式');
    }

    // 解析点样式（默认使用系统样式，可根据需求扩展）
    const pointStyle = {};
    const pointStyleNode = styleNode?.getElementsByTagName('PointStyle')[0];
    if (pointStyleNode) {
        // 可根据需要扩展点样式解析（如图标、大小等）
        const color = pointStyleNode.getElementsByTagName('color')[0]?.textContent;
        if (color) {
            pointStyle.color = kmlColorToRgba(color);
        }
    }

    // 解析线样式
    const lineStyle = {};
    const lineStyleNode = styleNode?.getElementsByTagName('LineStyle')[0];
    if (lineStyleNode) {
        const colorText = lineStyleNode.getElementsByTagName('color')[0]?.textContent || 'ff0000ff';
        const colorResult = kmlColorToRgba(colorText);
        lineStyle.color = colorResult.color;
        lineStyle.opacity = colorResult.opacity;
        const widthText = lineStyleNode.getElementsByTagName('width')[0]?.textContent;
        lineStyle.width = widthText ? parseFloat(widthText) : 2;
        if (lineStyle.width < 1) lineStyle.width = 1;
        lineStyle.width = Math.max(lineStyle.width * 1.5, 3);
    } else {
        // 默认线样式（使用系统配置）
        lineStyle.color = MapConfig.routeStyles.polyline.strokeColor;
        lineStyle.opacity = 1;
        lineStyle.width = MapConfig.routeStyles.polyline.strokeWeight;
    }

    // 解析面样式
    const polyStyle = {};
    const polyStyleNode = styleNode?.getElementsByTagName('PolyStyle')[0];
    if (polyStyleNode) {
        const colorText = polyStyleNode.getElementsByTagName('color')[0]?.textContent || '880000ff'; // 默认半透明红
        const colorResult = kmlColorToRgba(colorText);
        polyStyle.fillColor = colorResult.color;
        polyStyle.fillOpacity = Math.max(colorResult.opacity, 0.7);
        polyStyle.strokeColor = lineStyle.color;
        polyStyle.strokeOpacity = lineStyle.opacity;
        polyStyle.strokeWidth = Math.max(lineStyle.width, 2);
    } else {
        // 默认面样式（使用系统配置）
        polyStyle.fillColor = MapConfig.routeStyles.polygon.fillColor;
        polyStyle.fillOpacity = 0.7;
        polyStyle.strokeColor = MapConfig.routeStyles.polygon.strokeColor;
        polyStyle.strokeOpacity = 1;
        polyStyle.strokeWidth = MapConfig.routeStyles.polygon.strokeWeight;
    }

    return { pointStyle, lineStyle, polyStyle };
}

// KML颜色格式转换（ABGR -> RGBA）（新增）
function kmlColorToRgba(kmlColor) {
    // KML颜色格式：8位十六进制，前2位Alpha，后6位BGR
    // 例如：ff0000ff -> Alpha=ff, B=00, G=00, R=ff -> 红色
    const alpha = parseInt(kmlColor.substring(0, 2), 16) / 255;
    const blue = parseInt(kmlColor.substring(2, 4), 16);
    const green = parseInt(kmlColor.substring(4, 6), 16);
    const red = parseInt(kmlColor.substring(6, 8), 16);

    // 返回RGB十六进制颜色和alpha值
    const hexColor = '#' +
        red.toString(16).padStart(2, '0') +
        green.toString(16).padStart(2, '0') +
        blue.toString(16).padStart(2, '0');

    return {
        color: hexColor,
        opacity: alpha
    };
}

// 处理线段的交点,分割相交的线段（重构版）
function processLineIntersections(features) {
    const lines = features.filter(f => f.geometry.type === 'line');
    const points = features.filter(f => f.geometry.type === 'point');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    if (lines.length < 2) {
        console.log('线段数量不足,无需处理交点');
        return features;
    }

    console.log(`开始处理${lines.length}条线段的交点（重构版）...`);

    // 为每条线建立分割点列表
    const lineSplitPoints = lines.map(line => ({
        line: line,
        coords: line.geometry.coordinates,
        splits: [] // {segmentIndex, point, t}
    }));

    // 检测所有真实的几何交点
    for (let i = 0; i < lines.length; i++) {
        const tree1 = lineSplitPoints[i];
        const coords1 = tree1.coords;

        for (let j = i + 1; j < lines.length; j++) {
            const tree2 = lineSplitPoints[j];
            const coords2 = tree2.coords;

            // 检查两条完整折线的所有小段对
            for (let seg1 = 0; seg1 < coords1.length - 1; seg1++) {
                const p1a = coords1[seg1];
                const p1b = coords1[seg1 + 1];

                for (let seg2 = 0; seg2 < coords2.length - 1; seg2++) {
                    const p2a = coords2[seg2];
                    const p2b = coords2[seg2 + 1];

                    const EPSILON = 1e-8;

                    // 1. 检查端点重合（已经是连接点，无需分割）
                    if (pointsEqual(p1a, p2a, EPSILON) || pointsEqual(p1a, p2b, EPSILON) ||
                        pointsEqual(p1b, p2a, EPSILON) || pointsEqual(p1b, p2b, EPSILON)) {
                        continue;
                    }

                    // 2. 检查T型交叉：某条线的端点在另一条线的中间
                    const p1aT = isPointOnSegmentStrictParam(p1a, p2a, p2b, EPSILON);
                    const p1bT = isPointOnSegmentStrictParam(p1b, p2a, p2b, EPSILON);
                    const p2aT = isPointOnSegmentStrictParam(p2a, p1a, p1b, EPSILON);
                    const p2bT = isPointOnSegmentStrictParam(p2b, p1a, p1b, EPSILON);

                    if (p1aT !== null) {
                        tree2.splits.push({segmentIndex: seg2, point: [p1a[0], p1a[1]], t: p1aT});
                    }
                    if (p1bT !== null) {
                        tree2.splits.push({segmentIndex: seg2, point: [p1b[0], p1b[1]], t: p1bT});
                    }
                    if (p2aT !== null) {
                        tree1.splits.push({segmentIndex: seg1, point: [p2a[0], p2a[1]], t: p2aT});
                    }
                    if (p2bT !== null) {
                        tree1.splits.push({segmentIndex: seg1, point: [p2b[0], p2b[1]], t: p2bT});
                    }

                    // 3. 检查十字交叉：两个小段在中间相交
                    if (p1aT === null && p1bT === null && p2aT === null && p2bT === null) {
                        const cross = getSegmentIntersection(
                            p1a[0], p1a[1], p1b[0], p1b[1],
                            p2a[0], p2a[1], p2b[0], p2b[1]
                        );

                        if (cross && cross.isInterior) {
                            const crossPoint = [cross.lng, cross.lat];
                            tree1.splits.push({segmentIndex: seg1, point: crossPoint, t: cross.t});
                            tree2.splits.push({segmentIndex: seg2, point: crossPoint, t: cross.u});
                        }
                    }
                }
            }
        }
    }

    // 统计交点
    const totalSplits = lineSplitPoints.reduce((sum, tree) => sum + tree.splits.length, 0);
    console.log(`检测到${totalSplits}个真实交点需要分割`);

    // 对每条线进行分割
    const newLines = [];
    let segmentCounter = 1;

    lineSplitPoints.forEach(tree => {
        const {line, coords, splits} = tree;

        if (splits.length === 0) {
            newLines.push(line);
            return;
        }

        // 排序并去重分割点
        splits.sort((a, b) => {
            if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex;
            return a.t - b.t;
        });

        const uniqueSplits = [];
        for (let i = 0; i < splits.length; i++) {
            if (i === 0 || !pointsEqual(splits[i].point, splits[i-1].point, 1e-8)) {
                uniqueSplits.push(splits[i]);
            }
        }

        // 执行分割
        const segments = splitLineByPoints2(coords, uniqueSplits);

        segments.forEach(segCoords => {
            if (segCoords.length >= 2) {
                newLines.push({
                    name: segments.length > 1 ? `${line.name}-段${segmentCounter++}` : line.name,
                    type: '线',
                    geometry: {
                        type: 'line',
                        coordinates: segCoords,
                        style: line.geometry.style
                    },
                    description: line.description + (segments.length > 1 ? ' (已分割)' : '')
                });
            }
        });
    });

    console.log(`线段处理完成: 原始${lines.length}条 -> 分割后${newLines.length}条`);
    return [...points, ...newLines, ...polygons];
}

// 判断两点是否相等
function pointsEqual(p1, p2, epsilon) {
    return Math.abs(p1[0] - p2[0]) < epsilon && Math.abs(p1[1] - p2[1]) < epsilon;
}

// 严格检查点是否在线段内部（返回参数t或null）
function isPointOnSegmentStrictParam(point, segStart, segEnd, epsilon) {
    const dx = segEnd[0] - segStart[0];
    const dy = segEnd[1] - segStart[1];
    const len2 = dx * dx + dy * dy;

    if (len2 < epsilon * epsilon) return null;

    const t = ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / len2;

    // 必须在(0, 1)内部
    if (t <= epsilon || t >= 1 - epsilon) return null;

    // 检查点是否真的在线段上
    const projX = segStart[0] + t * dx;
    const projY = segStart[1] + t * dy;
    const dist2 = (point[0] - projX) * (point[0] - projX) + (point[1] - projY) * (point[1] - projY);

    return dist2 < epsilon * epsilon ? t : null;
}

// 根据分割点列表切分坐标数组
function splitLineByPoints2(coords, splitPoints) {
    if (splitPoints.length === 0) return [coords];

    const segments = [];
    let current = [coords[0]];
    let coordIdx = 0;

    for (const split of splitPoints) {
        const {segmentIndex, point} = split;

        // 添加到分割点所在小段之前的所有坐标
        while (coordIdx < segmentIndex) {
            coordIdx++;
            current.push(coords[coordIdx]);
        }

        // 添加分割点
        if (!pointsEqual(point, current[current.length - 1], 1e-8)) {
            current.push(point);
        }

        if (current.length >= 2) {
            segments.push(current);
        }

        current = [point];
    }

    // 添加剩余坐标
    while (coordIdx < coords.length - 1) {
        coordIdx++;
        current.push(coords[coordIdx]);
    }

    if (current.length >= 2) {
        segments.push(current);
    }

    return segments;
}

// 计算两条线段的交点
function getSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

    // 平行或共线
    if (Math.abs(denom) < 1e-10) {
        return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    const epsilon = 0.0001;

    // 检查交点是否在两条线段的内部(不在端点)
    const t_interior = t > epsilon && t < (1 - epsilon);
    const u_interior = u > epsilon && u < (1 - epsilon);

    // 检查交点是否在两条线段上（包括端点）
    if (t >= -epsilon && t <= (1 + epsilon) &&
        u >= -epsilon && u <= (1 + epsilon)) {
        const intersectionX = x1 + t * (x2 - x1);
        const intersectionY = y1 + t * (y2 - y1);

        return {
            lng: intersectionX,
            lat: intersectionY,
            t: t,
            u: u,
            isInterior: t_interior && u_interior // 两条线段都在内部才算真正的交点
        };
    }

    return null;
}

function displayKMLFeatures(features, fileName) {
    const layerId = 'kml-' + Date.now();
    const layerMarkers = [];
    const allCoordinates = []; // 存储所有坐标点用于计算范围

    // 分离点、线、面
    const points = features.filter(f => f.geometry.type === 'point');
    const lines = features.filter(f => f.geometry.type === 'line');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    // 计算多边形面积并排序（面积大的在前，先渲染，这样会在底层）
    const polygonsWithArea = polygons.map(polygon => {
        const area = calculatePolygonArea(polygon.geometry.coordinates);
        return { ...polygon, area };
    });

    // 按面积从大到小排序
    polygonsWithArea.sort((a, b) => b.area - a.area);

    // 按顺序渲染：面（最下层）→ 线（中间层）→ 点（最上层）

    // 1. 先显示面（大面积的先渲染，zIndex递增）
    polygonsWithArea.forEach((feature, index) => {
        const featureCoordinates = feature.geometry.coordinates;
        allCoordinates.push(...featureCoordinates);

        const polyStyle = feature.geometry.style || {
            fillColor: MapConfig.routeStyles.polygon.fillColor,
            strokeColor: MapConfig.routeStyles.polygon.strokeColor,
            strokeWidth: MapConfig.routeStyles.polygon.strokeWeight
        };

        const marker = new AMap.Polygon({
            path: feature.geometry.coordinates,
            strokeColor: polyStyle.strokeColor || 'transparent',
            strokeWeight: 0,  // 不显示描边
            strokeOpacity: 0,  // 完全透明
            fillColor: polyStyle.fillColor,
            fillOpacity: polyStyle.fillOpacity || 0.7,
            zIndex: 10 + index,  // 大面积的zIndex较小，显示在底层
            map: map
        });

        marker.setExtData({
            name: feature.name,
            type: feature.type,
            description: feature.description
        });

        marker.on('click', function() {
            showFeatureInfo(feature);
        });

        layerMarkers.push(marker);

        // 添加面的名称文本标记
        // 只有当名称有意义时才显示
        if (isValidFeatureName(feature.name)) {
            // 计算面的中心点
            const center = calculatePolygonCenter(feature.geometry.coordinates);
            
            // 创建文本标记
            const textMarker = new AMap.Text({
                text: feature.name,
                position: center,
                anchor: 'center',
                style: {
                    'background-color': 'transparent',
                    'border': 'none',
                    'color': '#c8c8c8',
                    'font-size': '10px',
                    'font-weight': 'normal',
                    'text-align': 'center',
                    'padding': '0',
                    'text-shadow': '-1px -1px 0 #FFFFFF, 1px -1px 0 #FFFFFF, -1px 1px 0 #FFFFFF, 1px 1px 0 #FFFFFF'
                },
                zIndex: 11,
                map: map
            });

            textMarker.setExtData({
                name: feature.name,
                type: '面标签',
                parentType: feature.type
            });

            layerMarkers.push(textMarker);
        }
    });

    // 2. 再显示线（zIndex: 50）
    // 首页加载时不显示线要素，只在导航页显示
    lines.forEach(feature => {
        const featureCoordinates = feature.geometry.coordinates;

        // 验证坐标
        const validCoords = feature.geometry.coordinates.filter(coord => {
            return coord && Array.isArray(coord) && coord.length >= 2 &&
                   !isNaN(coord[0]) && !isNaN(coord[1]) &&
                   isFinite(coord[0]) && isFinite(coord[1]);
        });

        if (validCoords.length < 2) {
            console.error('线要素坐标无效:', feature.name, feature.geometry.coordinates);
            return;
        }

        allCoordinates.push(...featureCoordinates);

        const lineStyle = feature.geometry.style || {
            color: MapConfig.routeStyles.polyline.strokeColor,
            width: MapConfig.routeStyles.polyline.strokeWeight
        };

        // 创建线要素但不添加到地图上（map参数不设置）
        const marker = new AMap.Polyline({
            path: validCoords,
            strokeColor: lineStyle.color,
            strokeWeight: lineStyle.width,
            strokeOpacity: lineStyle.opacity || 1,
            zIndex: 50
            // 不添加 map: map，这样线要素不会显示在首页地图上
        });

        marker.setExtData({
            name: feature.name,
            type: feature.type,
            description: feature.description
        });

        marker.on('click', function() {
            showFeatureInfo(feature);
        });

        layerMarkers.push(marker);
    });

    // 3. 最后显示点（zIndex: 100，最上层）
    points.forEach((feature) => {
        const featureCoordinates = [feature.geometry.coordinates];
        allCoordinates.push(...featureCoordinates);

        // 使用图标标记
        const marker = new AMap.Marker({
            position: feature.geometry.coordinates,
            map: map,
            title: feature.name,
            content: createNamedPointMarkerContent(feature.name, feature.geometry.style),
            offset: new AMap.Pixel(-16, -35),  // 调整offset让点位在图标和文字之间
            zIndex: 100
        });

        marker.setExtData({
            name: feature.name,
            type: feature.type,
            description: feature.description
        });

        // 添加点击事件 - 切换图标状态
        marker.on('click', function() {
            toggleIconState(marker);
        });

        layerMarkers.push(marker);
    });

    // 保存图层信息
    kmlLayers.push({
        id: layerId,
        name: fileName,
        markers: layerMarkers,
        visible: true,
        features: features  // 保存要素信息（含样式）用于恢复
    });

    // 停止实时定位，避免地图自动移回用户位置
    if (typeof stopRealtimeLocationTracking === 'function') {
        stopRealtimeLocationTracking();
        console.log('导入KML后停止实时定位');
    }

    // 调整地图视野以显示所有要素
    if (allCoordinates.length > 0) {
        fitMapToCoordinates(allCoordinates);
    }

    // 显示导入成功消息（仅在首次导入时显示，从其他界面返回重新加载时不显示）
    if (window.isFirstKMLImport && !window.pendingSelectedLocation) {
        const pointCount = points.length;
        const lineCount = lines.length;
        const polygonCount = polygons.length;
        const message = `成功导入: ${pointCount}个点, ${lineCount}条线, ${polygonCount}个面`;
        showSuccessMessage(message);
        // 重置标记
        window.isFirstKMLImport = false;
    }

    // 更新图层列表
    updateKmlLayerList();

    // 检查是否有待处理的选中位置（从搜索页返回）
    if (window.pendingSelectedLocation) {
        console.log('KML加载完成，处理待选中的位置:', window.pendingSelectedLocation);
        handlePendingSelectedLocation();
    }

    // 保存结构化的KML数据到sessionStorage（供点位选择界面使用）
    saveKMLDataToSession(features, fileName);

    // 保存分割后的完整要素数据（包括分割后的线段）
    saveProcessedKMLData(features, fileName);
}

// 保存结构化KML数据到sessionStorage
function saveKMLDataToSession(features, fileName) {
    try {
        // 提取点位信息
        const points = features
            .filter(f => f.geometry.type === 'point')
            .map(f => ({
                name: f.name,
                description: f.description || '',
                position: f.geometry.coordinates
            }));

        // 获取现有的KML数据数组
        let kmlDataArray = [];
        const existingData = sessionStorage.getItem('kmlData');
        if (existingData) {
            try {
                kmlDataArray = JSON.parse(existingData);
                if (!Array.isArray(kmlDataArray)) {
                    kmlDataArray = [];
                }
            } catch (e) {
                console.warn('解析现有KML数据失败，创建新数组');
                kmlDataArray = [];
            }
        }

        // 检查是否已存在相同文件名的数据
        const existingIndex = kmlDataArray.findIndex(item => item.fileName === fileName);

        const newData = {
            fileName: fileName,
            points: points,
            timestamp: Date.now()
        };

        if (existingIndex !== -1) {
            // 如果已存在，替换旧数据
            kmlDataArray[existingIndex] = newData;
            console.log(`更新KML结构化数据: ${fileName}, ${points.length}个点位`);
        } else {
            // 如果不存在，添加新数据
            kmlDataArray.push(newData);
            console.log(`添加KML结构化数据: ${fileName}, ${points.length}个点位`);
        }

        // 保存到sessionStorage
        sessionStorage.setItem('kmlData', JSON.stringify(kmlDataArray));
    } catch (e) {
        console.error('保存KML数据到sessionStorage失败:', e);
    }
}

function saveProcessedKMLData(features, fileName) {
    try {
        const processedData = {
            fileName: fileName,
            features: features,
            timestamp: Date.now()
        };

        sessionStorage.setItem('processedKMLData', JSON.stringify(processedData));
    } catch (e) {
        console.error('保存处理后的KML数据失败:', e);
    }
}

// 调整地图视野到指定坐标范围
function fitMapToCoordinates(coordinates) {
    if (!coordinates || coordinates.length === 0) return;

    // 过滤掉无效坐标
    const validCoordinates = coordinates.filter(coord => {
        return coord &&
               Array.isArray(coord) &&
               coord.length >= 2 &&
               !isNaN(coord[0]) &&
               !isNaN(coord[1]) &&
               isFinite(coord[0]) &&
               isFinite(coord[1]);
    });

    if (validCoordinates.length === 0) {
        console.warn('没有有效的坐标用于调整地图视野');
        return;
    }

    // 计算边界范围
    let minLng = validCoordinates[0][0];
    let maxLng = validCoordinates[0][0];
    let minLat = validCoordinates[0][1];
    let maxLat = validCoordinates[0][1];

    validCoordinates.forEach(coord => {
        const [lng, lat] = coord;
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    });

    // 创建边界对象
    const bounds = new AMap.Bounds(
        [minLng, minLat],
        [maxLng, maxLat]
    );

    // 设置地图视野到边界范围，添加一些边距
    map.setBounds(bounds, 60, [20, 20, 20, 20]); // 60是动画时间，数组是上下左右的边距

    // 如果视野太小（缩放级别太大），适当缩小一点
    setTimeout(() => {
        const currentZoom = map.getZoom();
        if (currentZoom > 16) {
            map.setZoom(16);
        }
    }, 100);
}

function createPointMarkerContent(name, index, style) {
    // 支持从样式覆盖默认颜色
    const bgColor = style?.color || MapConfig.markerStyles.point.background;
    const textColor = style?.textColor || MapConfig.markerStyles.point.color;
    
    return `
        <div style="
            background: ${bgColor};
            color: ${textColor};
            border-radius: 50%;
            width: ${MapConfig.markerStyles.point.size}px;
            height: ${MapConfig.markerStyles.point.size}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: bold;
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        ">
            ${index}
        </div>
    `;
}

// 切换图标状态（down/up）
function toggleIconState(marker) {
    const content = marker.getContent();
    if (typeof content === 'string') {
        const div = document.createElement('div');
        div.innerHTML = content;
        const iconDiv = div.querySelector('.kml-icon-marker');

        if (iconDiv) {
            const currentState = iconDiv.dataset.state;
            const iconType = iconDiv.dataset.iconType;
            const name = iconDiv.dataset.name;

            // 切换状态
            const newState = currentState === 'down' ? 'up' : 'down';
            const newIconPath = getIconPath(iconType, newState);

            // 更新图标
            const img = iconDiv.querySelector('img');
            if (img) {
                img.src = newIconPath;
                iconDiv.dataset.state = newState;
                marker.setContent(div.innerHTML);
            }
        }
    }
}

// 根据名称确定图标类型
function getIconTypeByName(name) {
    if (!name) return 'building';

    const nameLower = name.toLowerCase();

    // 堆场（优先级最高，因为"堆场1号门"应该识别为堆场）
    if (name.includes('堆场')) {
        return 'yard';
    }
    // 加工厂/加工区
    if (name.includes('加工')) {
        return 'workshop';
    }
    // 门类（进出口）
    if (name.includes('门') || nameLower.includes('gate')) {
        return 'entrance';
    }
    // 默认建筑
    return 'building';
}

// 判断点位是否可选（可用于导航）
function isPointSelectable(name) {
    // "所有"或其他不可选的点位返回false
    if (!name || name === '所有' || name.includes('不可选')) {
        return false;
    }
    // 默认为可选
    return true;
}

// 获取图标路径
function getIconPath(iconType, state = 'up') {
    const iconMap = {
        'entrance': '出入口',
        'yard': '堆场',
        'workshop': '加工区',
        'building': '建筑'
    };

    const iconName = iconMap[iconType] || iconMap['building'];
    return `images/工地数字导航小程序切图/图标/${iconName}-${state}.png`;
}

// 获取标签样式（根据图标类型）
function getLabelStyle(iconType, isSelected = false, isSelectable = true) {
    // 不可选中文字的样式
    if (!isSelectable) {
        return {
            fillColor: '#C8C8C8',
            strokeColor: '#FFFFFF',
            strokeWidth: 0.5,
            fontSize: 10,
            fontWeight: 'normal'
        };
    }

    // 未选中状态的填充色配置
    const unselectedColors = {
        'workshop': '#C6B8F9',  // 加工区
        'yard': '#CCAE96',       // 堆场
        'building': '#B4B4B4',   // 建筑
        'entrance': '#8F8F8F'    // 出入口
    };

    // 选中状态的填充色配置
    const selectedColors = {
        'workshop': '#8B7CCD',   // 加工区
        'yard': '#B5835A',       // 堆场
        'building': '#949494',   // 建筑
        'entrance': '#54A338'    // 出入口
    };

    const fillColor = isSelected
        ? (selectedColors[iconType] || selectedColors['building'])
        : (unselectedColors[iconType] || unselectedColors['building']);

    return {
        fillColor: fillColor,
        strokeColor: '#FFFFFF',
        strokeWidth: 1,
        fontSize: 12,
        fontWeight: isSelected ? '600' : 'normal'  // SemiBold约600，Regular约400
    };
}

// 使用名称的点标记样式（支持样式覆盖）
function createNamedPointMarkerContent(name, style) {
    const iconType = getIconTypeByName(name);
    const iconPath = getIconPath(iconType, 'down');
    const selectable = isPointSelectable(name);
    const labelStyle = getLabelStyle(iconType, false, selectable);

    return `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0;
            position: relative;
        ">
            <div class="kml-icon-marker"
                 data-icon-type="${iconType}"
                 data-state="down"
                 data-name="${name}"
                 style="
                    width: 32px;
                    height: 32px;
                    cursor: ${selectable ? 'pointer' : 'default'};
                    transition: all 0.2s ease;
                    margin-bottom: -4px;
                 "
                 title="${name}">
                <img src="${iconPath}"
                     style="width: 100%; height: 100%; object-fit: contain;"
                     alt="${name}">
            </div>
            <div style="
                width: 6px;
                height: 6px;
                background-color: transparent;
                border-radius: 50%;
                position: relative;
            "></div>
            <div class="kml-label" style="
                color: ${labelStyle.fillColor};
                font-size: ${labelStyle.fontSize}px;
                font-weight: ${labelStyle.fontWeight};
                white-space: nowrap;
                text-align: center;
                user-select: none;
                margin-top: 0px;
                text-shadow:
                    -${labelStyle.strokeWidth}px -${labelStyle.strokeWidth}px 0 ${labelStyle.strokeColor},
                    ${labelStyle.strokeWidth}px -${labelStyle.strokeWidth}px 0 ${labelStyle.strokeColor},
                    -${labelStyle.strokeWidth}px ${labelStyle.strokeWidth}px 0 ${labelStyle.strokeColor},
                    ${labelStyle.strokeWidth}px ${labelStyle.strokeWidth}px 0 ${labelStyle.strokeColor};
            ">${name}</div>
        </div>
    `;
}

function showFeatureInfo(feature) {
    let coordinateInfo = '';
    if (feature.geometry.originalCoordinates) {
        const [lng, lat] = feature.geometry.originalCoordinates;
        coordinateInfo = `<p style="margin: 0 0 4px 0; color: #666;">原始坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)}</p>`;
    }
    
    const infoWindow = new AMap.InfoWindow({
        content: `
            <div style="padding: 10px; max-width: 200px;">
                <h3 style="margin: 0 0 8px 0; color: #333;">${feature.name}</h3>
                <p style="margin: 0 0 4px 0; color: #666;">类型: ${feature.type}</p>
                ${coordinateInfo}
                ${feature.description ? `<p style="margin: 0; color: #666;">${feature.description}</p>` : ''}
            </div>
        `,
        offset: new AMap.Pixel(0, -30)
    });
    
    // 对于点要素，可以直接使用坐标
    if (feature.geometry.type === 'point') {
        infoWindow.open(map, feature.geometry.coordinates);
    }
}

function updateKmlLayerList() {
    console.log('当前KML图层:', kmlLayers);
}

function clearKmlLayer(layerId) {
    const layerIndex = kmlLayers.findIndex(layer => layer.id === layerId);
    if (layerIndex !== -1) {
        const layer = kmlLayers[layerIndex];
        layer.markers.forEach(marker => {
            map.remove(marker);
        });
        kmlLayers.splice(layerIndex, 1);
        updateKmlLayerList();
    }
}

function toggleKmlLayer(layerId, visible) {
    const layer = kmlLayers.find(layer => layer.id === layerId);
    if (layer) {
        layer.visible = visible;
        layer.markers.forEach(marker => {
            marker.setVisible(visible);
        });
    }
}

// 从sessionStorage加载原始KML数据并重新解析
function loadKMLFromSession() {
    try {
        const kmlRawData = sessionStorage.getItem('kmlRawData');
        const kmlFileName = sessionStorage.getItem('kmlFileName');

        if (!kmlRawData) {
            console.log('sessionStorage中没有KML原始数据');
            return false;
        }

        console.log('从sessionStorage加载原始KML数据，文件名:', kmlFileName);

        // 标记为非首次导入（从缓存加载）
        window.isFirstKMLImport = false;

        // 重新解析KML
        parseKML(kmlRawData, kmlFileName || 'loaded.kml');

        return true;
    } catch (error) {
        console.error('从sessionStorage加载KML数据失败:', error);
        return false;
    }
}

// 处理待选中的位置（KML加载完成后调用）
function handlePendingSelectedLocation() {
    const selectedLocation = window.pendingSelectedLocation;
    if (!selectedLocation) return;

    // 清除标记
    window.pendingSelectedLocation = null;

    console.log('开始处理待选中位置:', selectedLocation.name);
    console.log('当前kmlLayers数量:', kmlLayers.length);

    // 定位到选中的位置
    if (selectedLocation.position && Array.isArray(selectedLocation.position) && selectedLocation.position.length >= 2) {
        map.setCenter(selectedLocation.position);
        map.setZoom(17);

        // 在KML图层中查找对应的点并高亮显示
        let foundInKML = false;
        if (kmlLayers && kmlLayers.length > 0) {
            for (const layer of kmlLayers) {
                console.log('检查图层:', layer.name, '可见:', layer.visible, 'markers数量:', layer.markers ? layer.markers.length : 0);

                if (!layer.visible || !layer.markers) continue;

                for (const marker of layer.markers) {
                    if (!marker || typeof marker.getExtData !== 'function') continue;

                    const extData = marker.getExtData();
                    if (extData && extData.name === selectedLocation.name) {
                        // 找到了对应的KML点，使用增强高亮
                        console.log('★★★ 在KML中找到对应点，使用高亮显示:', selectedLocation.name);

                        const kmlPoint = {
                            name: selectedLocation.name,
                            position: selectedLocation.position,
                            marker: marker,
                            extData: extData,
                            description: selectedLocation.address || extData.description
                        };

                        if (typeof createEnhancedHighlight === 'function') {
                            console.log('调用createEnhancedHighlight');
                            createEnhancedHighlight(kmlPoint);
                        } else {
                            console.error('createEnhancedHighlight函数不存在！');
                        }

                        foundInKML = true;
                        break;
                    }
                }

                if (foundInKML) break;
            }
        }

        console.log('是否在KML中找到:', foundInKML);

        // 如果不是KML点（比如历史搜索的非KML点），才创建标记
        if (!foundInKML) {
            console.log('未在KML中找到，创建临时标记');
            const marker = new AMap.Marker({
                position: selectedLocation.position,
                icon: new AMap.Icon({
                    size: new AMap.Size(30, 38),
                    image: 'images/工地数字导航小程序切图/司机/2X/地图icon/终点.png',
                    imageSize: new AMap.Size(30, 38)
                }),
                offset: new AMap.Pixel(-15, -38),
                map: map,
                title: selectedLocation.name
            });
        }

        // 显示位置名称
        if (typeof showSuccessMessage === 'function') {
            showSuccessMessage(`已定位到: ${selectedLocation.name}`);
        }
    }
}

// 计算多边形的中心点（几何中心）
function calculatePolygonCenter(coordinates) {
    if (!coordinates || coordinates.length === 0) {
        return [0, 0];
    }

    let sumLng = 0;
    let sumLat = 0;
    let count = coordinates.length;

    coordinates.forEach(coord => {
        sumLng += coord[0];
        sumLat += coord[1];
    });

    return [sumLng / count, sumLat / count];
}

// 计算多边形面积（使用Shoelace公式）
function calculatePolygonArea(coordinates) {
    if (!coordinates || coordinates.length < 3) {
        return 0;
    }

    let area = 0;
    const n = coordinates.length;

    // Shoelace公式计算多边形面积
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coordinates[i][0] * coordinates[j][1];
        area -= coordinates[j][0] * coordinates[i][1];
    }

    // 返回绝对值的一半（面积）
    return Math.abs(area) / 2;
}

// 判断要素名称是否有意义（用于决定是否显示标签）
function isValidFeatureName(name) {
    if (!name || typeof name !== 'string') {
        return false;
    }

    const trimmedName = name.trim();

    // 空字符串
    if (trimmedName === '') {
        return false;
    }

    // 常见的无意义默认名称
    const invalidPatterns = [
        /^未命名/i,
        /^unnamed/i,
        /^untitled/i,
        /^新建/i,
        /^无名称/i,
        /^面\d+$/i,
        /^polygon\d*$/i,
        /^new\s+polygon/i,  // 匹配 "New Polygon"
        /^区域\d+$/i,
        /^path\d+$/i,
        /^layer\d*$/i,      // 匹配 "Layer", "Layer1" 等
        /^shape\d*$/i       // 匹配 "Shape", "Shape1" 等
    ];

    for (const pattern of invalidPatterns) {
        if (pattern.test(trimmedName)) {
            return false;
        }
    }

    return true;
}

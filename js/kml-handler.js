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

// 处理线段的交点,分割相交的线段
function processLineIntersections(features) {
    // 提取所有线要素
    const lines = features.filter(f => f.geometry.type === 'line');
    const points = features.filter(f => f.geometry.type === 'point');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    if (lines.length < 2) {
        console.log('线段数量不足,无需处理交点');
        return features;
    }

    console.log(`开始处理${lines.length}条线段的交点...`);

    // 存储所有需要分割的信息
    const splitInfo = [];

    // 遍历所有线段对,检测交点
    for (let i = 0; i < lines.length; i++) {
        const line1 = lines[i];
        const coords1 = line1.geometry.coordinates;

        for (let j = i + 1; j < lines.length; j++) {
            const line2 = lines[j];
            const coords2 = line2.geometry.coordinates;

            // 检查line1和line2的每一对线段是否相交
            for (let seg1 = 0; seg1 < coords1.length - 1; seg1++) {
                const p1Start = coords1[seg1];
                const p1End = coords1[seg1 + 1];

                for (let seg2 = 0; seg2 < coords2.length - 1; seg2++) {
                    const p2Start = coords2[seg2];
                    const p2End = coords2[seg2 + 1];

                    // 计算交点
                    const intersection = getSegmentIntersection(
                        p1Start[0], p1Start[1], p1End[0], p1End[1],
                        p2Start[0], p2Start[1], p2End[0], p2End[1]
                    );

                    if (intersection) {
                        splitInfo.push({
                            lineIndex1: i,
                            segmentIndex1: seg1,
                            lineIndex2: j,
                            segmentIndex2: seg2,
                            intersection: [intersection.lng, intersection.lat],
                            t1: intersection.t,
                            t2: intersection.u
                        });
                    }
                }
            }
        }
    }

    console.log(`找到${splitInfo.length}个交点`);

    if (splitInfo.length === 0) {
        return features;
    }

    // 按线段索引分组交点
    const intersectionsByLine = {};
    splitInfo.forEach(info => {
        if (!intersectionsByLine[info.lineIndex1]) {
            intersectionsByLine[info.lineIndex1] = [];
        }
        if (!intersectionsByLine[info.lineIndex2]) {
            intersectionsByLine[info.lineIndex2] = [];
        }

        intersectionsByLine[info.lineIndex1].push({
            segmentIndex: info.segmentIndex1,
            t: info.t1,
            point: info.intersection
        });

        intersectionsByLine[info.lineIndex2].push({
            segmentIndex: info.segmentIndex2,
            t: info.t2,
            point: info.intersection
        });
    });

    // 处理每条线,将交点插入并分割
    const newLines = [];
    lines.forEach((line, lineIndex) => {
        if (!intersectionsByLine[lineIndex]) {
            // 没有交点,保持原样
            newLines.push(line);
        } else {
            // 有交点,需要分割
            const splitLines = splitLineAtIntersections(line, intersectionsByLine[lineIndex]);
            newLines.push(...splitLines);
        }
    });

    console.log(`线段处理完成: 原始${lines.length}条 -> 分割后${newLines.length}条`);

    // 返回处理后的要素集合(不包括交点标记)
    return [...points, ...newLines, ...polygons];
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

    // 至少有一个在内部才算真正的相交
    if (t > -epsilon && t < (1 + epsilon) &&
        u > -epsilon && u < (1 + epsilon) &&
        (t_interior || u_interior)) {
        const intersectionX = x1 + t * (x2 - x1);
        const intersectionY = y1 + t * (y2 - y1);

        return {
            lng: intersectionX,
            lat: intersectionY,
            t: t,
            u: u
        };
    }

    return null;
}

// 在交点处分割线段
function splitLineAtIntersections(line, intersections) {
    const coords = line.geometry.coordinates;

    // 按线段索引和t值排序交点
    intersections.sort((a, b) => {
        if (a.segmentIndex !== b.segmentIndex) {
            return a.segmentIndex - b.segmentIndex;
        }
        return a.t - b.t;
    });

    // 构建新的坐标序列,插入交点
    const newCoords = [];
    let currentSegment = 0;

    for (let i = 0; i < coords.length; i++) {
        newCoords.push(coords[i]);

        // 检查当前线段上是否有交点
        if (i < coords.length - 1) {
            const segmentIntersections = intersections.filter(
                inter => inter.segmentIndex === i
            );

            // 按t值排序,确保交点顺序正确
            segmentIntersections.sort((a, b) => a.t - b.t);

            // 插入所有交点
            segmentIntersections.forEach(inter => {
                newCoords.push(inter.point);
            });
        }
    }

    // 现在将包含交点的坐标序列分割成多条线段
    // 每个交点都是分割点
    const splitLines = [];
    let startIdx = 0;

    // 找到所有交点在新坐标序列中的位置
    const intersectionIndices = [];
    intersections.forEach(inter => {
        // 在newCoords中找到对应的交点
        for (let i = 0; i < newCoords.length; i++) {
            const coord = newCoords[i];
            if (Math.abs(coord[0] - inter.point[0]) < 1e-8 &&
                Math.abs(coord[1] - inter.point[1]) < 1e-8) {
                intersectionIndices.push(i);
                break;
            }
        }
    });

    // 去重并排序
    const uniqueIndices = [...new Set(intersectionIndices)].sort((a, b) => a - b);

    // 在每个交点处分割
    uniqueIndices.forEach(idx => {
        if (idx > startIdx) {
            const segmentCoords = newCoords.slice(startIdx, idx + 1);
            if (segmentCoords.length >= 2) {
                splitLines.push({
                    name: `${line.name}-分段${splitLines.length + 1}`,
                    type: line.type,
                    geometry: {
                        type: 'line',
                        coordinates: segmentCoords,
                        style: line.geometry.style
                    },
                    description: line.description + ' (已分割)'
                });
            }
            startIdx = idx;
        }
    });

    // 添加最后一段
    if (startIdx < newCoords.length - 1) {
        const segmentCoords = newCoords.slice(startIdx);
        if (segmentCoords.length >= 2) {
            splitLines.push({
                name: `${line.name}-分段${splitLines.length + 1}`,
                type: line.type,
                geometry: {
                    type: 'line',
                    coordinates: segmentCoords,
                    style: line.geometry.style
                },
                description: line.description + ' (已分割)'
            });
        }
    }

    if (splitLines.length === 0) {
        return [line];
    }

    return splitLines;
}

function displayKMLFeatures(features, fileName) {
    const layerId = 'kml-' + Date.now();
    const layerMarkers = [];
    const allCoordinates = []; // 存储所有坐标点用于计算范围

    // 分离点、线、面
    const points = features.filter(f => f.geometry.type === 'point');
    const lines = features.filter(f => f.geometry.type === 'line');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    // 按顺序渲染：面（最下层）→ 线（中间层）→ 点（最上层）

    // 1. 先显示面（zIndex: 10）
    polygons.forEach(feature => {
        const featureCoordinates = feature.geometry.coordinates;
        allCoordinates.push(...featureCoordinates);

        const polyStyle = feature.geometry.style || {
            fillColor: MapConfig.routeStyles.polygon.fillColor,
            strokeColor: MapConfig.routeStyles.polygon.strokeColor,
            strokeWidth: MapConfig.routeStyles.polygon.strokeWeight
        };

        const marker = new AMap.Polygon({
            path: feature.geometry.coordinates,
            strokeColor: polyStyle.strokeColor,
            strokeWeight: polyStyle.strokeWidth,
            strokeOpacity: polyStyle.strokeOpacity || 1,
            fillColor: polyStyle.fillColor,
            fillOpacity: polyStyle.fillOpacity || 0.7,
            zIndex: 10,
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
    });

    // 2. 再显示线（zIndex: 50）
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

        const marker = new AMap.Polyline({
            path: validCoords,
            strokeColor: lineStyle.color,
            strokeWeight: lineStyle.width,
            strokeOpacity: lineStyle.opacity || 1,
            zIndex: 50,
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
    });

    // 3. 最后显示点（zIndex: 100，最上层）
    points.forEach((feature) => {
        const featureCoordinates = [feature.geometry.coordinates];
        allCoordinates.push(...featureCoordinates);

        // 使用文本标记代替圆形序号
        const marker = new AMap.Marker({
            position: feature.geometry.coordinates,
            map: map,
            title: feature.name,
            content: createNamedPointMarkerContent(feature.name, feature.geometry.style),
            offset: new AMap.Pixel(-16, -16),
            zIndex: 100
        });

        marker.setExtData({
            name: feature.name,
            type: feature.type,
            description: feature.description
        });

        // 添加点击事件
        marker.on('click', function() {
            showFeatureInfo(feature);
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

// 使用名称的点标记样式（支持样式覆盖）
function createNamedPointMarkerContent(name, style) {
    const bgColor = style?.color || 'linear-gradient(135deg, #4A90E2 0%, #357ABD 100%)';
    
    return `
        <div style="
            background: ${bgColor};
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            border: 2px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
            cursor: pointer;
            transition: all 0.2s ease;
        "
        onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.35)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.25)';"
        title="${name}"
        >
            <i class="fas fa-map-marker-alt"></i>
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

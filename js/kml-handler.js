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
        // 保存原始KML文本到sessionStorage
        sessionStorage.setItem('kmlRawData', kmlContent);
        sessionStorage.setItem('kmlFileName', file.name);
        console.log('已保存原始KML数据到sessionStorage');

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
        
        // 在地图上显示KML要素
        displayKMLFeatures(features, fileName);
        
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
        // KML颜色格式：ABGR（透明度+蓝+绿+红），转换为HEX + opacity
        const colorText = lineStyleNode.getElementsByTagName('color')[0]?.textContent || 'ff0000ff'; // 默认红色
        const colorResult = kmlColorToRgba(colorText);
        lineStyle.color = colorResult.color;
        lineStyle.opacity = colorResult.opacity;
        const widthText = lineStyleNode.getElementsByTagName('width')[0]?.textContent;
        lineStyle.width = widthText ? parseFloat(widthText) : 2; // 默认线宽
        // 确保线宽至少为1，并且在合理范围内（KML线宽通常较细，需要放大以便观看）
        if (lineStyle.width < 1) lineStyle.width = 1;
        // 可以选择放大线宽以提升观感（可选）
        lineStyle.width = Math.max(lineStyle.width * 1.5, 3); // 放大1.5倍，最小3px
        console.log(`解析线样式 - 颜色: ${colorText} => ${lineStyle.color}, 不透明度: ${lineStyle.opacity}, 宽度: ${lineStyle.width}`);
    } else {
        // 默认线样式（使用系统配置）
        lineStyle.color = MapConfig.routeStyles.polyline.strokeColor;
        lineStyle.opacity = 1;
        lineStyle.width = MapConfig.routeStyles.polyline.strokeWeight;
        console.log('使用默认线样式');
    }

    // 解析面样式
    const polyStyle = {};
    const polyStyleNode = styleNode?.getElementsByTagName('PolyStyle')[0];
    if (polyStyleNode) {
        const colorText = polyStyleNode.getElementsByTagName('color')[0]?.textContent || '880000ff'; // 默认半透明红
        const colorResult = kmlColorToRgba(colorText);
        polyStyle.fillColor = colorResult.color;
        polyStyle.fillOpacity = Math.max(colorResult.opacity, 0.7); // 至少70%不透明度，使颜色更明显
        // 面边框使用线样式，确保边框清晰可见
        polyStyle.strokeColor = lineStyle.color;
        polyStyle.strokeOpacity = lineStyle.opacity;
        polyStyle.strokeWidth = Math.max(lineStyle.width, 2); // 面边框至少2px
        console.log(`解析面样式 - 填充色: ${colorText} => ${polyStyle.fillColor}, 填充不透明度: ${polyStyle.fillOpacity}, 边框色: ${polyStyle.strokeColor}`);
    } else {
        // 默认面样式（使用系统配置）
        polyStyle.fillColor = MapConfig.routeStyles.polygon.fillColor;
        polyStyle.fillOpacity = 0.7;
        polyStyle.strokeColor = MapConfig.routeStyles.polygon.strokeColor;
        polyStyle.strokeOpacity = 1;
        polyStyle.strokeWidth = MapConfig.routeStyles.polygon.strokeWeight;
        console.log('使用默认面样式');
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

        // 使用KML解析的面样式
        const polyStyle = feature.geometry.style || {
            fillColor: MapConfig.routeStyles.polygon.fillColor,
            strokeColor: MapConfig.routeStyles.polygon.strokeColor,
            strokeWidth: MapConfig.routeStyles.polygon.strokeWeight
        };

        console.log(`渲染面: ${feature.name}, 填充色: ${polyStyle.fillColor}, 填充不透明度: ${polyStyle.fillOpacity}, 边框色: ${polyStyle.strokeColor}, 边框宽: ${polyStyle.strokeWidth}`);

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

        // 使用KML解析的线样式
        const lineStyle = feature.geometry.style || {
            color: MapConfig.routeStyles.polyline.strokeColor,
            width: MapConfig.routeStyles.polyline.strokeWeight
        };

        console.log(`渲染线: ${feature.name}, 颜色: ${lineStyle.color}, 宽度: ${lineStyle.width}`);

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

    // 显示导入成功消息
    const pointCount = points.length;
    const lineCount = lines.length;
    const polygonCount = polygons.length;
    const message = `成功导入: ${pointCount}个点, ${lineCount}条线, ${polygonCount}个面`;
    showSuccessMessage(message);

    // 更新图层列表
    updateKmlLayerList();

    // 注意：原始KML数据已在handleKMLFile中保存到sessionStorage
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

        // 重新解析KML
        parseKML(kmlRawData, kmlFileName || 'loaded.kml');

        return true;
    } catch (error) {
        console.error('从sessionStorage加载KML数据失败:', error);
        return false;
    }
}

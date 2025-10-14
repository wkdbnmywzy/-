// kml-handler.js
// KML文件导入、解析和显示功能

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
            const feature = parsePlacemark(placemark);
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

function parsePlacemark(placemark) {
    const name = placemark.getElementsByTagName('name')[0]?.textContent || '未命名要素';
    
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
            geometry = { type: 'point', coordinates: [gcjLng, gcjLat], originalCoordinates: [lng, lat] };
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
                geometry = { type: 'line', coordinates: coordsArray };
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
            geometry = { type: 'polygon', coordinates: coordsArray };
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

function displayKMLFeatures(features, fileName) {
    const layerId = 'kml-' + Date.now();
    const layerMarkers = [];
    const allCoordinates = []; // 存储所有坐标点用于计算范围

    // 分离点和线
    const points = features.filter(f => f.geometry.type === 'point');
    const lines = features.filter(f => f.geometry.type === 'line');
    const polygons = features.filter(f => f.geometry.type === 'polygon');

    // 先显示线和面（在下层）
    [...lines, ...polygons].forEach(feature => {
        let marker = null;
        let featureCoordinates = [];

        switch (feature.geometry.type) {
            case 'line':
                featureCoordinates = feature.geometry.coordinates;
                // 验证坐标
                const validCoords = feature.geometry.coordinates.filter(coord => {
                    return coord && Array.isArray(coord) && coord.length >= 2 &&
                           !isNaN(coord[0]) && !isNaN(coord[1]) &&
                           isFinite(coord[0]) && isFinite(coord[1]);
                });

                if (validCoords.length < 2) {
                    console.error('线要素坐标无效:', feature.name, feature.geometry.coordinates);
                    return; // 跳过无效的线
                }

                marker = new AMap.Polyline({
                    path: validCoords,
                    strokeColor: MapConfig.routeStyles.polyline.strokeColor,
                    strokeWeight: MapConfig.routeStyles.polyline.strokeWeight,
                    strokeOpacity: MapConfig.routeStyles.polyline.strokeOpacity,
                    map: map
                });
                break;

            case 'polygon':
                featureCoordinates = feature.geometry.coordinates;
                marker = new AMap.Polygon({
                    path: feature.geometry.coordinates,
                    strokeColor: MapConfig.routeStyles.polygon.strokeColor,
                    strokeWeight: MapConfig.routeStyles.polygon.strokeWeight,
                    strokeOpacity: MapConfig.routeStyles.polygon.strokeOpacity,
                    fillColor: MapConfig.routeStyles.polygon.fillColor,
                    fillOpacity: MapConfig.routeStyles.polygon.fillOpacity,
                    map: map
                });
                break;
        }

        // 收集所有坐标点
        if (featureCoordinates.length > 0) {
            allCoordinates.push(...featureCoordinates);
        }

        if (marker) {
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
        }
    });

    // 再显示点（在上层）
    points.forEach((feature, index) => {
        const featureCoordinates = [feature.geometry.coordinates];
        allCoordinates.push(...featureCoordinates);

        // 使用文本标记代替圆形序号
        const marker = new AMap.Marker({
            position: feature.geometry.coordinates,
            map: map,
            title: feature.name,
            content: createNamedPointMarkerContent(feature.name),  // 使用名称而不是序号
            offset: new AMap.Pixel(-16, -16)  // 调整偏移使圆形标记居中
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
        visible: true
    });

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

    // 保存KML数据到sessionStorage
    saveKMLDataToSession();
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

function createPointMarkerContent(name, index) {
    const style = MapConfig.markerStyles.point;
    return `
        <div style="
            background: ${style.background};
            color: ${style.color};
            border-radius: 50%;
            width: ${style.size}px;
            height: ${style.size}px;
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

// 使用名称的点标记样式
function createNamedPointMarkerContent(name) {
    return `
        <div style="
            background: linear-gradient(135deg, #4A90E2 0%, #357ABD 100%);
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

// 从sessionStorage恢复KML数据
function restoreKMLDataFromSession() {
    try {
        const kmlDataStr = sessionStorage.getItem('kmlData');
        if (!kmlDataStr) {
            console.log('sessionStorage中没有KML数据需要恢复');
            return false;
        }

        const kmlData = JSON.parse(kmlDataStr);
        console.log('从sessionStorage恢复KML数据，图层数:', kmlData.length);

        // 重建每个图层
        kmlData.forEach(layerData => {
            const layerMarkers = [];
            const allCoordinates = [];

            // 分离点和线
            const points = layerData.features.filter(f => f.type === '点');
            const lines = layerData.features.filter(f => f.type === '线');
            const polygons = layerData.features.filter(f => f.type === '面');

            // 先显示线和面（在下层）
            [...lines, ...polygons].forEach(feature => {
                let marker = null;

                if (feature.type === '线' && feature.coordinates && feature.coordinates.length >= 2) {
                    // 验证坐标
                    const validCoords = feature.coordinates.filter(coord => {
                        return coord && Array.isArray(coord) && coord.length >= 2 &&
                               !isNaN(coord[0]) && !isNaN(coord[1]) &&
                               isFinite(coord[0]) && isFinite(coord[1]);
                    });

                    if (validCoords.length >= 2) {
                        marker = new AMap.Polyline({
                            path: validCoords,
                            strokeColor: MapConfig.routeStyles.polyline.strokeColor,
                            strokeWeight: MapConfig.routeStyles.polyline.strokeWeight,
                            strokeOpacity: MapConfig.routeStyles.polyline.strokeOpacity,
                            map: map
                        });

                        allCoordinates.push(...validCoords);
                    }
                } else if (feature.type === '面' && feature.coordinates && feature.coordinates.length >= 3) {
                    marker = new AMap.Polygon({
                        path: feature.coordinates,
                        strokeColor: MapConfig.routeStyles.polygon.strokeColor,
                        strokeWeight: MapConfig.routeStyles.polygon.strokeWeight,
                        strokeOpacity: MapConfig.routeStyles.polygon.strokeOpacity,
                        fillColor: MapConfig.routeStyles.polygon.fillColor,
                        fillOpacity: MapConfig.routeStyles.polygon.fillOpacity,
                        map: map
                    });

                    allCoordinates.push(...feature.coordinates);
                }

                if (marker) {
                    marker.setExtData({
                        name: feature.name,
                        type: feature.type,
                        description: feature.description
                    });

                    layerMarkers.push(marker);
                }
            });

            // 再显示点（在上层）
            points.forEach(feature => {
                if (feature.coordinates && feature.coordinates.length >= 2) {
                    const marker = new AMap.Marker({
                        position: feature.coordinates,
                        map: map,
                        title: feature.name,
                        content: createNamedPointMarkerContent(feature.name),
                        offset: new AMap.Pixel(-16, -16)
                    });

                    marker.setExtData({
                        name: feature.name,
                        type: feature.type,
                        description: feature.description
                    });

                    layerMarkers.push(marker);
                    allCoordinates.push(feature.coordinates);
                }
            });

            // 保存图层信息
            kmlLayers.push({
                id: layerData.id,
                name: layerData.name,
                markers: layerMarkers,
                visible: layerData.visible
            });

            // 调整地图视野
            if (allCoordinates.length > 0) {
                fitMapToCoordinates(allCoordinates);
            }
        });

        console.log('KML数据恢复完成，图层数:', kmlLayers.length);

        // 显示恢复成功消息
        const totalPoints = kmlLayers.reduce((sum, layer) => {
            return sum + layer.markers.filter(m => {
                const extData = m.getExtData ? m.getExtData() : null;
                return extData && extData.type === '点';
            }).length;
        }, 0);

        const totalLines = kmlLayers.reduce((sum, layer) => {
            return sum + layer.markers.filter(m => {
                const extData = m.getExtData ? m.getExtData() : null;
                return extData && extData.type === '线';
            }).length;
        }, 0);

        if (totalPoints > 0 || totalLines > 0) {
            showSuccessMessage(`已恢复KML数据: ${totalPoints}个点, ${totalLines}条线`);
        }

        return true;
    } catch (e) {
        console.error('恢复KML数据失败:', e);
        return false;
    }
}

// 保存KML数据到sessionStorage
function saveKMLDataToSession() {
    try {
        if (!kmlLayers || kmlLayers.length === 0) {
            console.log('没有KML数据需要保存');
            return;
        }

        const kmlData = kmlLayers.map(layer => {
            return {
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                features: layer.markers.map(marker => {
                    if (!marker || typeof marker.getExtData !== 'function') {
                        return null;
                    }
                    const extData = marker.getExtData();
                    if (!extData) return null;

                    let coordinates = null;
                    // 如果是点
                    if (extData.type === '点' && typeof marker.getPosition === 'function') {
                        const pos = marker.getPosition();
                        coordinates = pos ? [pos.lng, pos.lat] : null;
                    }
                    // 如果是线
                    else if (extData.type === '线' && typeof marker.getPath === 'function') {
                        const path = marker.getPath();
                        if (path && path.length > 0) {
                            coordinates = path.map(p =>
                                p.lng !== undefined ? [p.lng, p.lat] : p
                            );
                        }
                    }
                    // 如果是面
                    else if (extData.type === '面' && typeof marker.getPath === 'function') {
                        const path = marker.getPath();
                        if (path && path.length > 0) {
                            coordinates = path.map(p =>
                                p.lng !== undefined ? [p.lng, p.lat] : p
                            );
                        }
                    }

                    return coordinates ? {
                        name: extData.name,
                        type: extData.type,
                        description: extData.description,
                        coordinates: coordinates
                    } : null;
                }).filter(f => f !== null)
            };
        });

        sessionStorage.setItem('kmlData', JSON.stringify(kmlData));
        console.log('KML数据已保存到sessionStorage，图层数:', kmlData.length);
    } catch (e) {
        console.error('保存KML数据到sessionStorage失败:', e);
    }
}
// enhanced-highlight.js
// 增强的地图点突显效果

// 保存原始样式
let originalMarkerContent = null;
let currentHighlightedMarker = null;

// 持久高亮的标记（起点、终点、途经点）
let persistentHighlights = {
    start: null,
    end: null,
    waypoints: []
};

// 创建持久高亮效果（用于起点、终点、途经点）
function createPersistentHighlight(kmlPoint, type) {
    // type可以是 'start', 'end', 'waypoint'

    // 清除该类型之前的高亮
    clearPersistentHighlight(type);

    if (!kmlPoint || !kmlPoint.marker) return;

    // 保存标记
    if (type === 'start') {
        persistentHighlights.start = {
            marker: kmlPoint.marker,
            originalContent: kmlPoint.marker.getContent(),
            name: kmlPoint.name
        };
    } else if (type === 'end') {
        persistentHighlights.end = {
            marker: kmlPoint.marker,
            originalContent: kmlPoint.marker.getContent(),
            name: kmlPoint.name
        };
    } else if (type === 'waypoint') {
        persistentHighlights.waypoints.push({
            marker: kmlPoint.marker,
            originalContent: kmlPoint.marker.getContent(),
            name: kmlPoint.name
        });
    }

    // 设置持久高亮样式
    const highlightContent = createPersistentHighlightContent(kmlPoint.name, type);
    kmlPoint.marker.setContent(highlightContent);
    kmlPoint.marker.setzIndex(500);
}

// 创建持久高亮的内容
function createPersistentHighlightContent(name, type) {
    // 根据类型选择不同颜色
    let color1, color2;
    if (type === 'start') {
        color1 = '#4CAF50'; // 绿色
        color2 = '#388E3C';
    } else if (type === 'end') {
        color1 = '#F44336'; // 红色
        color2 = '#D32F2F';
    } else {
        color1 = '#FF9800'; // 橙色（途经点）
        color2 = '#F57C00';
    }

    return `
        <div style="
            background: linear-gradient(135deg, ${color1} 0%, ${color2} 100%);
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            border: 3px solid white;
            box-shadow: 0 3px 12px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: all 0.2s ease;
        "
        onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 5px 16px rgba(0,0,0,0.4)';"
        onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 3px 12px rgba(0,0,0,0.3)';"
        title="${name}"
        >
            <i class="fas fa-map-marker-alt"></i>
        </div>
    `;
}

// 清除特定类型的持久高亮
function clearPersistentHighlight(type) {
    if (type === 'start' && persistentHighlights.start) {
        try {
            persistentHighlights.start.marker.setContent(persistentHighlights.start.originalContent);
            persistentHighlights.start.marker.setzIndex(10);
        } catch (e) {
            console.error('清除起点高亮失败:', e);
        }
        persistentHighlights.start = null;
    } else if (type === 'end' && persistentHighlights.end) {
        try {
            persistentHighlights.end.marker.setContent(persistentHighlights.end.originalContent);
            persistentHighlights.end.marker.setzIndex(10);
        } catch (e) {
            console.error('清除终点高亮失败:', e);
        }
        persistentHighlights.end = null;
    } else if (type === 'waypoint') {
        persistentHighlights.waypoints.forEach(wp => {
            try {
                wp.marker.setContent(wp.originalContent);
                wp.marker.setzIndex(10);
            } catch (e) {
                console.error('清除途经点高亮失败:', e);
            }
        });
        persistentHighlights.waypoints = [];
    }
}

// 清除所有持久高亮
function clearAllPersistentHighlights() {
    clearPersistentHighlight('start');
    clearPersistentHighlight('end');
    clearPersistentHighlight('waypoint');
}

// 创建增强的高亮效果
function createEnhancedHighlight(kmlPoint) {
    // 清除之前的高亮
    clearHighlightElementsOnly();

    const position = kmlPoint.position;

    // 如果是KML点，直接修改其标记样式而不是创建新标记
    if (kmlPoint.marker && typeof kmlPoint.marker.setContent === 'function') {
        // 保存原始标记
        currentHighlightedMarker = kmlPoint.marker;

        try {
            // 保存原始内容（如果还没保存）
            if (!originalMarkerContent) {
                originalMarkerContent = kmlPoint.marker.getContent();
            }

            // 创建高亮样式的标记内容
            const highlightedContent = createHighlightedMarkerContent(kmlPoint.name);
            kmlPoint.marker.setContent(highlightedContent);

            // 提升标记层级
            kmlPoint.marker.setzIndex(1000);

        } catch (e) {
            console.error('设置标记高亮样式失败:', e);
            // 如果修改失败，回退到创建新标记的方式
            createFallbackHighlight(position, kmlPoint.name);
        }
    } else {
        // 如果没有marker对象，使用原来的方式创建高亮
        createFallbackHighlight(position, kmlPoint.name);
    }

    // 创建脉冲动画的圆圈
    window.highlightCircle = new AMap.Circle({
        center: position,
        radius: 50,
        strokeColor: '#FF6B6B',
        strokeWeight: 3,
        strokeOpacity: 0.8,
        fillColor: '#FF6B6B',
        fillOpacity: 0.2,
        map: map,
        zIndex: 999
    });

    // 添加脉冲动画效果
    animateHighlight();
}

// 创建高亮的标记内容
function createHighlightedMarkerContent(name) {
    return `
        <div style="
            background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%);
            color: white;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border: 3px solid white;
            box-shadow: 0 4px 16px rgba(255, 82, 82, 0.5);
            cursor: pointer;
            animation: pulse 1.5s ease-in-out infinite;
            transform: scale(1.15);
            z-index: 1000;
        "
        title="${name}"
        >
            <i class="fas fa-map-marker-alt" style="animation: bounce 1s ease-in-out infinite;"></i>
        </div>
        <style>
            @keyframes pulse {
                0%, 100% { box-shadow: 0 4px 16px rgba(255, 82, 82, 0.5); }
                50% { box-shadow: 0 6px 24px rgba(255, 82, 82, 0.8); }
            }
            @keyframes bounce {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-3px); }
            }
        </style>
    `;
}

// 备用高亮方式（创建新标记）
function createFallbackHighlight(position, name) {
    window.selectedMarker = new AMap.Marker({
        position: position,
        content: createHighlightedMarkerContent(name),
        map: map,
        offset: new AMap.Pixel(-20, -20),  // 调整为圆形标记的居中偏移
        zIndex: 1000
    });
}

// 只清除高亮元素，恢复原始样式
function clearHighlightElementsOnly() {
    // 清除动画
    if (window.highlightAnimation) {
        clearInterval(window.highlightAnimation);
        window.highlightAnimation = null;
    }

    // 恢复原始标记样式
    if (currentHighlightedMarker && originalMarkerContent) {
        try {
            currentHighlightedMarker.setContent(originalMarkerContent);
            currentHighlightedMarker.setzIndex(10);
        } catch (e) {
            console.error('恢复标记原始样式失败:', e);
        }
        currentHighlightedMarker = null;
        originalMarkerContent = null;
    }

    // 清除高亮圆圈
    if (window.highlightCircle) {
        map.remove(window.highlightCircle);
        window.highlightCircle = null;
    }

    // 清除备用选中标记（如果有）
    if (window.selectedMarker) {
        map.remove(window.selectedMarker);
        window.selectedMarker = null;
    }

    // 关闭信息窗口
    if (window.currentInfoWindow) {
        window.currentInfoWindow.close();
        window.currentInfoWindow = null;
    }
}

// 添加脉冲动画
function animateHighlight() {
    let scale = 1;
    let growing = true;
    let animationCount = 0;
    const maxAnimations = 6; // 脉冲6次

    window.highlightAnimation = setInterval(function() {
        if (growing) {
            scale += 0.1;
            if (scale >= 1.5) {
                growing = false;
                animationCount++;
            }
        } else {
            scale -= 0.1;
            if (scale <= 1) {
                growing = true;
            }
        }

        // 更新圆圈大小
        if (window.highlightCircle) {
            window.highlightCircle.setRadius(50 * scale);
        }

        // 动画完成后停止
        if (animationCount >= maxAnimations) {
            clearInterval(window.highlightAnimation);
            // 保持高亮显示，但停止动画
            if (window.highlightCircle) {
                window.highlightCircle.setRadius(50);
            }
        }
    }, 150);
}

// 显示选择信息
function showSelectionInfo(kmlPoint) {
    // 安全地获取坐标信息
    let coordinateText = '';
    if (kmlPoint.position && Array.isArray(kmlPoint.position) && kmlPoint.position.length >= 2) {
        const lng = kmlPoint.position[0];
        const lat = kmlPoint.position[1];
        if (typeof lng === 'number' && typeof lat === 'number') {
            coordinateText = `坐标: ${lng.toFixed(6)}, ${lat.toFixed(6)}`;
        }
    } else {
        coordinateText = '坐标: 无法获取';
    }

    // 创建信息窗口
    const infoWindow = new AMap.InfoWindow({
        content: `
            <div style="padding: 12px; max-width: 250px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <i class="fas fa-map-pin" style="color: #FF0000; font-size: 16px;"></i>
                    <h3 style="margin: 0; color: #333; font-size: 16px;">${kmlPoint.name || '未知点位'}</h3>
                </div>
                ${kmlPoint.description ? `<div style="color: #666; font-size: 14px; margin-bottom: 8px;">${kmlPoint.description}</div>` : ''}
                <div style="font-size: 12px; color: #999; margin-bottom: 8px;">
                    ${coordinateText}
                </div>
                <button onclick="clearPointHighlight()" style="
                    padding: 6px 12px;
                    background: #FF0000;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    width: 100%;
                ">清除选择</button>
            </div>
        `,
        offset: new AMap.Pixel(0, -40),
        closeWhenClickMap: false
    });

    // 显示信息窗口
    if (kmlPoint.position && Array.isArray(kmlPoint.position) && kmlPoint.position.length >= 2) {
        infoWindow.open(map, kmlPoint.position);
        window.currentInfoWindow = infoWindow;
    }
}

// 增强版清除点高亮
function clearPointHighlight() {
    // 清除动画
    if (window.highlightAnimation) {
        clearInterval(window.highlightAnimation);
        window.highlightAnimation = null;
    }

    // 清除高亮圆圈
    if (window.highlightCircle) {
        map.remove(window.highlightCircle);
        window.highlightCircle = null;
    }

    // 清除选中标记
    if (window.selectedMarker) {
        map.remove(window.selectedMarker);
        window.selectedMarker = null;
    }

    // 关闭信息窗口
    if (window.currentInfoWindow) {
        window.currentInfoWindow.close();
        window.currentInfoWindow = null;
    }

    // 清空搜索框
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
    }

    // 不显示任何消息，静默清除
}

// 重新定义selectKMLPointFromSearch函数以使用增强效果
function selectKMLPointFromSearchEnhanced(kmlPoint) {
    // 创建突显效果（内部已经会清除之前的高亮）
    createEnhancedHighlight(kmlPoint);

    // 添加到搜索历史
    if (typeof addToSearchHistory === 'function') {
        addToSearchHistory({
            name: kmlPoint.name,
            address: kmlPoint.description || 'KML导入点位',
            position: kmlPoint.position,
            type: 'kml-point'
        });
    }

    // 移动地图中心到选中位置
    map.setCenter(kmlPoint.position);
    map.setZoom(17);

    // 隐藏搜索结果面板
    document.getElementById('search-results').classList.remove('active');

    // 在搜索框中显示选中点的信息
    const searchInput = document.getElementById('search-input');
    searchInput.dataset.programmaticUpdate = 'true'; // 标记为程序设置，避免触发搜索
    searchInput.value = kmlPoint.name;
    searchInput.blur(); // 移除焦点，避免重新触发搜索

    // 恢复底部卡片位置，并确保只显示一段
    const bottomCard = document.getElementById('bottom-card');
    if (bottomCard) {
        bottomCard.style.transform = 'translateY(0)';
        bottomCard.classList.remove('expanded'); // 确保只显示一段
    }

    // 显示选择信息
    showSelectionInfo(kmlPoint);
}
// marker-utils.js
// 标记工具函数 - 统一创建和管理地图标记

/**
 * 创建"我的位置"标记（带朝向的用户位置标记）
 * @param {Object} options 配置选项
 * @param {Array} options.position - 位置坐标 [lng, lat]
 * @param {Object} options.map - 地图实例
 * @param {number} options.zIndex - 标记层级，默认120
 * @param {number} options.angle - 初始角度，默认0
 * @param {string} options.color - SVG箭头颜色，默认'#007bff'
 * @returns {AMap.Marker} 创建的标记实例
 */
function createLocationMarker(options) {
    const {
        position,
        map,
        zIndex = 120,
        angle = 0,
        color = '#007bff'
    } = options;

    // 从配置读取图标样式
    const iconCfg = (MapConfig && MapConfig.markerStyles && MapConfig.markerStyles.headingLocation) || {};
    const w = (iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
    const h = (iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;

    // 决定使用PNG图标还是SVG箭头
    let iconImage = iconCfg.icon;
    if (iconCfg.useSvgArrow === true || !iconImage) {
        // 使用SVG箭头（确保旋转效果明显）
        iconImage = createHeadingArrowDataUrl(color);
    }

    // 创建图标
    const icon = new AMap.Icon({
        size: new AMap.Size(w, h),
        image: iconImage,
        imageSize: new AMap.Size(w, h)
    });

    // 创建标记
    const marker = new AMap.Marker({
        position: position,
        icon: icon,
        offset: new AMap.Pixel(-(w/2), -(h/2)),
        zIndex: zIndex,
        angle: angle,
        map: map
    });

    return marker;
}

/**
 * 更新或创建"我的位置"标记
 * @param {Object} options 配置选项
 * @param {AMap.Marker|null} options.existingMarker - 已存在的标记（如果有）
 * @param {Array} options.position - 新位置坐标
 * @param {Object} options.map - 地图实例
 * @param {number} options.zIndex - 标记层级
 * @param {string} options.color - SVG箭头颜色
 * @returns {AMap.Marker} 标记实例
 */
function updateOrCreateLocationMarker(options) {
    const { existingMarker, position, map, zIndex, color } = options;

    if (existingMarker) {
        // 标记已存在，只更新位置
        existingMarker.setPosition(position);
        return existingMarker;
    } else {
        // 标记不存在，创建新的
        return createLocationMarker({
            position,
            map,
            zIndex,
            color
        });
    }
}

/**
 * 移除标记
 * @param {AMap.Marker} marker - 要移除的标记
 * @param {Object} map - 地图实例
 */
function removeMarker(marker, map) {
    if (marker && map) {
        try {
            map.remove(marker);
        } catch (e) {
            console.warn('移除标记失败:', e);
        }
    }
}

/**
 * 创建SVG箭头的Data URL（内联实现，可以移到这里统一管理）
 * @param {string} color - 箭头颜色
 * @returns {string} Data URL
 */
function createHeadingArrowDataUrl(color) {
    // 如果全局已有此函数，直接使用
    if (typeof window.createHeadingArrowDataUrl === 'function') {
        return window.createHeadingArrowDataUrl(color);
    }
    
    // 否则使用内置实现
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
            <g transform="translate(18, 18)">
                <path d="M 0,-12 L 6,12 L 0,8 L -6,12 Z" 
                      fill="${color}" 
                      stroke="white" 
                      stroke-width="1.5"/>
            </g>
        </svg>
    `;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg.trim());
}



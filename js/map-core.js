// map-core.js
// 地图初始化和基本操作

function initMap() {
    map = new AMap.Map('map-container', MapConfig.mapConfig);
    
    // 地图旋转时，标记会自动跟随地图旋转，无需手动处理

    // 等待地图完全加载后启动实时定位或恢复状态
    map.on('complete', function() {
        console.log('地图加载完成，准备启动实时定位或恢复状态');

        // 检查是否从搜索页返回并选择了位置
        const selectedLocationStr = sessionStorage.getItem('selectedLocation');
        if (selectedLocationStr) {
            try {
                const selectedLocation = JSON.parse(selectedLocationStr);
                console.log('从搜索页返回，选中的位置:', selectedLocation);

                // 清除标记，避免重复处理
                sessionStorage.removeItem('selectedLocation');

                // 延迟执行高亮逻辑，等待KML数据加载完成
                // 使用一个标记位，让KML加载完成后再处理
                window.pendingSelectedLocation = selectedLocation;

                // 不启动实时定位，等待KML加载完成后再处理
                return;
            } catch (e) {
                console.error('处理选中位置失败:', e);
            }
        }

        // 检查是否从导航页返回
        const mapStateStr = sessionStorage.getItem('mapState');
        let fromNavigation = false;
        let kmlBounds = null;

        if (mapStateStr) {
            try {
                const mapState = JSON.parse(mapStateStr);
                fromNavigation = mapState.fromNavigation === true;
                kmlBounds = mapState.kmlBounds;
                console.log('检测到地图状态:', { fromNavigation, hasKmlBounds: !!kmlBounds });
            } catch (e) {
                console.warn('解析地图状态失败:', e);
            }
        }

        // 如果从导航页返回且有 KML 边界，恢复到 KML 区域视图
        if (fromNavigation && kmlBounds) {
            console.log('从导航页返回，恢复到 KML 区域视图');
            try {
                const bounds = new AMap.Bounds(
                    [kmlBounds.minLng, kmlBounds.minLat],
                    [kmlBounds.maxLng, kmlBounds.maxLat]
                );
                map.setBounds(bounds, false, [60, 60, 60, 60]);

                // 恢复后清除状态标记，避免下次加载时重复恢复
                sessionStorage.removeItem('mapState');
            } catch (e) {
                console.error('恢复 KML 视图失败:', e);
            }

            // 不启动实时定位，保持 KML 区域视图
            return;
        }

        // 清除地图状态
        sessionStorage.removeItem('mapState');

        // 首页始终启动实时定位
        setTimeout(function() {
            if (typeof startRealtimeLocationTracking === 'function') {
                console.log('启动实时定位追踪');
                startRealtimeLocationTracking();
                // 兜底：若短时间内没有定位结果，则使用一次性定位
                setTimeout(function() {
                    if (!selfMarker && !currentPosition) {
                        console.log('实时定位无响应，使用一次性定位');
                        getCurrentLocation();
                    }
                }, 1500);
            } else {
                console.log('实时定位函数不存在，使用一次性定位');
                getCurrentLocation();
            }
        }, 100);
    });

    // 监听窗口可见性变化
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && map) {

            console.log('页面重新可见，刷新地图');
            setTimeout(function() {
                if (map && typeof map.resize === 'function') map.resize();
            }, 100);
            console.log('页面重新可见');
        }
    });

    // 监听窗口焦点变化
    window.addEventListener('focus', function() {
        if (map) {
            console.log('窗口获得焦点，刷新地图');
            setTimeout(function() {
                if (map && typeof map.resize === 'function') map.resize();
            }, 100);

            console.log('窗口获得焦点');
        }
    });

    // 监听窗口大小变化
    window.addEventListener('resize', function() {
        if (map) {
            map.resize();
        }
    });
}

function getCurrentLocation() {
    console.log('开始获取位置...');

    // 使用浏览器原生定位
    if (!('geolocation' in navigator)) {
        console.error('浏览器不支持定位');
        alert('当前浏览器不支持定位功能');
        if (document.getElementById('start-location')) {
            document.getElementById('start-location').value = '北京市';
        }
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
        function(position) {
            console.log('位置获取成功:', position);
            console.log('定位精度(米):', position.coords.accuracy);

            var lng = position.coords.longitude;
            var lat = position.coords.latitude;
            console.log('原始坐标(WGS84):', lng, lat);

            // 手动转换WGS84到GCJ02（高德坐标系）
            const converted = wgs84ToGcj02(lng, lat);
            lng = converted[0];
            lat = converted[1];
            console.log('转换后坐标(GCJ02):', lng, lat);

            currentPosition = [lng, lat];

            // 更新地图中心和缩放级别
            map.setZoomAndCenter(15, [lng, lat]);

            // 强制刷新地图
            setTimeout(function() {
                if (map && typeof map.resize === 'function') {
                    map.resize();
                }
            }, 200);

            // 添加当前位置标记
            var marker = new AMap.Marker({
                position: [lng, lat],
                icon: new AMap.Icon({
                    size: new AMap.Size(30, 30),
                    image: MapConfig.markerStyles.currentLocation.icon,
                    imageSize: new AMap.Size(30, 30)
                }),
                // 圆形"我的位置"图标用居中对齐
                offset: new AMap.Pixel(-15, -15),
                map: map,
                zIndex: 999
            });
            markers.push(marker);
            initialLocationMarker = marker;

            // 更新起点输入框
            if (document.getElementById('start-location')) {
                document.getElementById('start-location').value = '我的位置';
            }
        },
        function(error) {
            console.error('定位失败:', error);
            console.error('错误代码:', error.code);
            console.error('错误信息:', error.message);
            alert('无法获取位置，请检查定位权限\n错误: ' + error.message);
            // 使用默认位置
            if (document.getElementById('start-location')) {
                document.getElementById('start-location').value = '北京市';
            }
        },
        options
    );
}

function clearMarkers() {
    markers.forEach(function(marker) {
        map.remove(marker);
    });
    markers = [];
}

// ====== 首页地图：实时定位与箭头随手机方向旋转 ======
function startRealtimeLocationTracking() {
    if (isRealtimeLocating) return;

    console.log('启动浏览器原生实时定位');

    // 使用浏览器原生定位
    if (!('geolocation' in navigator)) {
        console.error('浏览器不支持定位');
        alert('当前浏览器不支持定位功能');
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    // 开始持续监听位置变化
    const watchId = navigator.geolocation.watchPosition(
        function(position) {
            console.log('浏览器定位成功:', position);
            console.log('定位精度(米):', position.coords.accuracy);

            let lng = position.coords.longitude;
            let lat = position.coords.latitude;
            console.log('原始坐标(WGS84):', lng, lat);

            // 手动转换WGS84到GCJ02（高德坐标系）
            const converted = wgs84ToGcj02(lng, lat);
            lng = converted[0];
            lat = converted[1];
            console.log('转换后坐标(GCJ02):', lng, lat);

            const curr = [lng, lat];
            currentPosition = curr;

            // 开启实时定位时，移除一次性初始定位标记，避免重复
            if (initialLocationMarker) {
                try { map.remove(initialLocationMarker); } catch (e) {}
                initialLocationMarker = null;
            }

            // 初始化或更新自身标记
            if (!selfMarker) {
                const iconCfg = MapConfig.markerStyles.headingLocation || {};
                var w = (iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
                var h = (iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;

                let iconImage = iconCfg.icon;
                // 如果开启箭头模式或 PNG 未配置，则改用 SVG 箭头，以确保旋转效果明显
                if (iconCfg.useSvgArrow === true || !iconImage) {
                    iconImage = createHeadingArrowDataUrl('#007bff');
                }

                const icon = new AMap.Icon({
                    size: new AMap.Size(w, h),
                    image: iconImage,
                    imageSize: new AMap.Size(w, h)
                });
                selfMarker = new AMap.Marker({
                    position: curr,
                    icon: icon,
                    offset: new AMap.Pixel(-(w/2), -(h/2)),
                    zIndex: 1000,
                    angle: 0,
                    map: map
                });
            } else {
                selfMarker.setPosition(curr);
            }

            // 处理方向角（从浏览器API获取）
            let heading = null;
            if (position.coords.heading !== undefined && position.coords.heading !== null && !isNaN(position.coords.heading)) {
                heading = position.coords.heading;
                lastDeviceHeadingIndex = position.coords.heading;
                console.log('使用浏览器返回的heading:', position.coords.heading);
            } else {
                // 如果没有方向角，尝试使用设备方向或根据移动计算
                if (lastDeviceHeadingIndex !== null) {
                    heading = lastDeviceHeadingIndex;
                    console.log('使用设备方向角:', lastDeviceHeadingIndex);
                } else if (lastGpsPosIndex) {
                    const bearing = calcBearingSimple(lastGpsPosIndex, curr);
                    console.log('根据GPS位置计算方位角:', bearing, '从', lastGpsPosIndex, '到', curr);
                    if (!isNaN(bearing)) {
                        heading = bearing;
                    }
                }
            }

            // 应用朝向角度（图标固定指向真实世界的手机头部方向）
            // 使用绝对角度，让图标始终指向真北参考系下的手机朝向
            // 当地图旋转时，图标会自动随地图一起旋转，保持指向真实方向
            if (heading !== null) {
                try {
                    // 获取地图当前旋转角度
                    const mapRotation = map.getRotation() || 0;
                    
                    // 如果地图没有旋转，图标随设备方向旋转
                    // 如果地图旋转了，图标要减去地图旋转的角度，这样图标就会和地图一起旋转
                    const finalAngle = heading - mapRotation;
                    
                    if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(finalAngle);
                    else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(finalAngle);
                } catch (err) {
                    console.error('设置标记角度失败:', err);
                }
            }

            lastGpsPosIndex = curr;

            // 首次进入或用户点击定位后，自动居中
            if (!isRealtimeLocating) {
                map.setZoomAndCenter(17, curr);
            } else {
                // 跟随中心
                map.setCenter(curr);
            }

            // 更新输入框
            const startInput = document.getElementById('start-location');
            if (startInput && (!startInput.value || startInput.value === '北京市')) {
                startInput.value = '我的位置';
            }

            // 启动设备方向监听（用于更精确的箭头旋转）
            tryStartDeviceOrientationIndex();
        },
        function(error) {
            console.error('浏览器定位失败:', error);
            alert('无法获取实时定位: ' + error.message);
            stopRealtimeLocationTracking();
        },
        options
    );

    // 保存watchId，用于停止定位
    window.browserGeolocationWatchId = watchId;

    isRealtimeLocating = true;

    // 在用户手势触发时优先尝试开启设备方向监听，提升 iOS 权限通过概率
    tryStartDeviceOrientationIndex();

    // 更新定位按钮UI
    try {
        const locateBtn = document.getElementById('locate-btn');
        if (locateBtn) {
            locateBtn.classList.add('active');
            locateBtn.title = '定位到当前位置';
        }
    } catch (e) {}
}

function stopRealtimeLocationTracking() {
    try {
        // 停止浏览器定位
        if (window.browserGeolocationWatchId !== undefined && window.browserGeolocationWatchId !== null) {
            navigator.geolocation.clearWatch(window.browserGeolocationWatchId);
            window.browserGeolocationWatchId = null;
        }
    } catch (e) {
        console.error('停止浏览器定位失败:', e);
    }

    isRealtimeLocating = false;
    lastGpsPosIndex = null;
    // 不强制移除标记，保留当前位置；如需清除可在此移除
    tryStopDeviceOrientationIndex();
    // 更新定位按钮UI
    try {
        const locateBtn = document.getElementById('locate-btn');
        if (locateBtn) {
            locateBtn.classList.remove('active');
            locateBtn.title = '定位到当前位置';
        }
    } catch (e) {}
}

function clearMarkers() {
    markers.forEach(function(marker) {
        map.remove(marker);
    });
    markers = [];
}

// ====== 首页地图：实时定位与箭头随手机方向旋转 ======
function startRealtimeLocationTracking() {
    if (isRealtimeLocating) return;

    console.log('启动浏览器原生实时定位');

    // 使用浏览器原生定位
    if (!('geolocation' in navigator)) {
        console.error('浏览器不支持定位');
        alert('当前浏览器不支持定位功能');
        return;
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
    };

    // 开始持续监听位置变化
    const watchId = navigator.geolocation.watchPosition(
        function(position) {
            console.log('浏览器定位成功:', position);
            console.log('定位精度(米):', position.coords.accuracy);

            let lng = position.coords.longitude;
            let lat = position.coords.latitude;
            console.log('原始坐标(WGS84):', lng, lat);

            // 手动转换WGS84到GCJ02（高德坐标系）
            const converted = wgs84ToGcj02(lng, lat);
            lng = converted[0];
            lat = converted[1];
            console.log('转换后坐标(GCJ02):', lng, lat);

            const curr = [lng, lat];
            currentPosition = curr;

            // 开启实时定位时，移除一次性初始定位标记，避免重复
            if (initialLocationMarker) {
                try { map.remove(initialLocationMarker); } catch (e) {}
                initialLocationMarker = null;
            }

            // 初始化或更新自身标记
            if (!selfMarker) {
                const iconCfg = MapConfig.markerStyles.headingLocation || {};
                var w = (iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
                var h = (iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;

                let iconImage = iconCfg.icon;
                // 如果开启箭头模式或 PNG 未配置，则改用 SVG 箭头，以确保旋转效果明显
                if (iconCfg.useSvgArrow === true || !iconImage) {
                    iconImage = createHeadingArrowDataUrl('#007bff');
                }

                const icon = new AMap.Icon({
                    size: new AMap.Size(w, h),
                    image: iconImage,
                    imageSize: new AMap.Size(w, h)
                });
                selfMarker = new AMap.Marker({
                    position: curr,
                    icon: icon,
                    offset: new AMap.Pixel(-(w/2), -(h/2)),
                    zIndex: 1000,
                    angle: 0,
                    map: map
                });
            } else {
                selfMarker.setPosition(curr);
            }

            // 处理方向角（从浏览器API获取）
            let heading = null;
            if (position.coords.heading !== undefined && position.coords.heading !== null && !isNaN(position.coords.heading)) {
                heading = position.coords.heading;
                lastDeviceHeadingIndex = position.coords.heading;
                console.log('使用浏览器返回的heading:', position.coords.heading);
            } else {
                // 如果没有方向角，尝试使用设备方向或根据移动计算
                if (lastDeviceHeadingIndex !== null) {
                    heading = lastDeviceHeadingIndex;
                    console.log('使用设备方向角:', lastDeviceHeadingIndex);
                } else if (lastGpsPosIndex) {
                    const bearing = calcBearingSimple(lastGpsPosIndex, curr);
                    console.log('根据GPS位置计算方位角:', bearing, '从', lastGpsPosIndex, '到', curr);
                    if (!isNaN(bearing)) {
                        heading = bearing;
                    }
                }
            }

            // 应用朝向角度（图标固定指向真实世界的���机头部方向）
            // setAngle设置的是相对于地图坐标系的角度，地图旋转时标记会自动跟随
            if (heading !== null) {
                try {
                    if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(heading);
                    else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(heading);
                } catch (e) {
                    console.error('设置标记角度失败:', e);
                }
            }

            lastGpsPosIndex = curr;

            // 首次进入或用户点击定位后，自动居中
            if (!isRealtimeLocating) {
                map.setZoomAndCenter(17, curr);
            } else {
                // 跟随中心
                map.setCenter(curr);
            }

            // 更新输入框
            const startInput = document.getElementById('start-location');
            if (startInput && (!startInput.value || startInput.value === '北京市')) {
                startInput.value = '我的位置';
            }

            // 启动设备方向监听（用于更精确的箭头旋转）
            tryStartDeviceOrientationIndex();
        },
        function(error) {
            console.error('浏览器定位失败:', error);
            alert('无法获取实时定位: ' + error.message);
            stopRealtimeLocationTracking();
        },
        options
    );

    // 保存watchId，用于停止定位
    window.browserGeolocationWatchId = watchId;

    isRealtimeLocating = true;

    // 在用户手势触发时优先尝试开启设备方向监听，提升 iOS 权限通过概率
    tryStartDeviceOrientationIndex();

    // 更新定位按钮UI
    try {
        const locateBtn = document.getElementById('locate-btn');
        if (locateBtn) {
            locateBtn.classList.add('active');
            locateBtn.title = '定位到当前位置';
        }
    } catch (e) {}
}

function stopRealtimeLocationTracking() {
    try {
        // 停止浏览器定位
        if (window.browserGeolocationWatchId !== undefined && window.browserGeolocationWatchId !== null) {
            navigator.geolocation.clearWatch(window.browserGeolocationWatchId);
            window.browserGeolocationWatchId = null;
        }
    } catch (e) {
        console.error('停止浏览器定位失败:', e);
    }

    isRealtimeLocating = false;
    lastGpsPosIndex = null;
    // 不强制移除标记，保留当前位置；如需清除可在此移除
    tryStopDeviceOrientationIndex();
    // 更新定位按钮UI
    try {
        const locateBtn = document.getElementById('locate-btn');
        if (locateBtn) {
            locateBtn.classList.remove('active');
            locateBtn.title = '定位到当前位置';
        }
    } catch (e) {}
}

// 开启设备方向监听（iOS 权限处理）
function tryStartDeviceOrientationIndex() {
    if (trackingDeviceOrientationIndex) return;

    // 检测设备类型
    const ua = navigator.userAgent;
    const isIOS = /iP(ad|hone|od)/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);

    console.log('设备检测:', {
        userAgent: ua,
        isIOS: isIOS,
        isAndroid: isAndroid,
        isMobile: isMobile
    });

    const start = () => {
        deviceOrientationHandlerIndex = function(e) {
            if (!e) return;
            let heading = null;

            if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
                // iOS: webkitCompassHeading 是正确的罗盘方向（0-360，正北为0，顺时针）
                heading = e.webkitCompassHeading;
                if (MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
                    console.log('使用 iOS webkitCompassHeading:', heading);
                }
            } else if (typeof e.alpha === 'number' && !isNaN(e.alpha) && e.absolute === true) {
                // Android: 优先使用 absolute=true 的 alpha（真实罗盘方向）
                heading = e.alpha;
                if (MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
                    console.log('使用 absolute alpha (真实罗盘):', heading);
                }
            } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
                // 降级方案：使用相对 alpha，转换为顺时针
                heading = 360 - e.alpha;
                if (MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
                    console.log('使���相对 alpha:', 'alpha=', e.alpha, '→ heading=', heading);
                }
            }

            if (heading === null) return;

            // 规范化角度到 0-360 范围
            if (heading < 0) heading += 360;
            heading = heading % 360;

            // 应用角度偏移量（处理设备特定的方向差异）
            if (MapConfig.orientationConfig && MapConfig.orientationConfig.angleOffset) {
                heading = (heading + MapConfig.orientationConfig.angleOffset) % 360;
                if (heading < 0) heading += 360;
                if (MapConfig.orientationConfig.debugMode) {
                    console.log('应用角度偏移:', MapConfig.orientationConfig.angleOffset, '度, 最终heading=', heading);
                }
            }

            lastDeviceHeadingIndex = heading;
            if (selfMarker) {
                // 应用朝向角度（图标固定指向真实世界的手机头部方向）
                // setAngle设置的是相对于地图坐标系的角度，地图旋转时标记会自动跟随
                try {
                    if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(heading);
                    else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(heading);
                } catch (err) {
                    console.error('设置标记角度失败:', err);
                }
            }
        };

        // 优先尝试监听 deviceorientationabsolute（提供绝对罗盘方向）
        if ('ondeviceorientationabsolute' in window) {
            window.addEventListener('deviceorientationabsolute', deviceOrientationHandlerIndex, true);
            console.log('使用 deviceorientationabsolute 事件（绝对罗盘方向）');
        } else {
            // 降级到普通 deviceorientation
            window.addEventListener('deviceorientation', deviceOrientationHandlerIndex, true);
            console.log('使用 deviceorientation 事件（相对方向）');
        }

        trackingDeviceOrientationIndex = true;
        if (MapConfig.orientationConfig && MapConfig.orientationConfig.debugMode) {
            console.log('设备方向监听已启动');
        }
    };

    try {
        if (isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            console.log('iOS 13+ 需要请求设备方向权限');
            DeviceOrientationEvent.requestPermission().then(state => {
                console.log('设备方向权限状态:', state);
                if (state === 'granted') start();
                else console.warn('用户拒绝设备方向权限');
            }).catch(err => console.warn('请求方向权限失败:', err));
        } else {
            start();
        }
    } catch (e) {
        console.warn('开启方向监听失败:', e);
    }
}

function tryStopDeviceOrientationIndex() {
    if (!trackingDeviceOrientationIndex) return;
    try {
        if (deviceOrientationHandlerIndex) {
            window.removeEventListener('deviceorientation', deviceOrientationHandlerIndex, true);
            deviceOrientationHandlerIndex = null;
        }
    } catch (e) {}
    trackingDeviceOrientationIndex = false;
    lastDeviceHeadingIndex = null;
}

// 简单方位角计算（输入为 [lng, lat]）
function calcBearingSimple(a, b) {
    if (!a || !b) return NaN;
    const lng1 = a[0] * Math.PI / 180;
    const lat1 = a[1] * Math.PI / 180;
    const lng2 = b[0] * Math.PI / 180;
    const lat2 = b[1] * Math.PI / 180;
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    const br = Math.atan2(y, x) * 180 / Math.PI;
    return (br + 360) % 360;
}

// 生成可旋转的箭头SVG数据URL（用于手机端）
function createHeadingArrowDataUrl(color) {
    const svg = `
        <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
                    <feOffset dx="0" dy="1" result="offsetblur"/>
                    <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <g filter="url(#shadow)">
                <circle cx="18" cy="18" r="14" fill="white"/>
                <path d="M18 5 L23 21 L18 17 L13 21 Z" fill="${color || '#007bff'}"/>
            </g>
        </svg>`;
    try {
        return 'data:image/svg+xml;base64,' + btoa(svg);
    } catch (e) {
        return MapConfig.markerStyles.currentLocation.icon;
    }
}
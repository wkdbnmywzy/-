// map-core.js
// 地图初始化和基本操作

function initMap() {
    map = new AMap.Map('map-container', MapConfig.mapConfig);

    // 等待地图完全加载后启动实时定位（失败则回退一次性定位）
    map.on('complete', function() {
        console.log('地图加载完成');
        setTimeout(function() {
            if (typeof startRealtimeLocationTracking === 'function') {
                startRealtimeLocationTracking();
                // 兜底：若短时间内没有定位结果，则使用一次性定位
                setTimeout(function() {
                    if (!selfMarker && !currentPosition) {
                        getCurrentLocation();
                    }
                }, 1500);
            } else {
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
    if (navigator.geolocation) {
        console.log('开始获取位置...');
        navigator.geolocation.getCurrentPosition(
            function(position) {
                console.log('位置获取成功:', position);
                var lng = position.coords.longitude;
                var lat = position.coords.latitude;

                // 将浏览器WGS84坐标转换为高德地图使用的GCJ-02坐标
                try {
                    if (typeof wgs84ToGcj02 === 'function') {
                        var converted = wgs84ToGcj02(lng, lat);
                        if (Array.isArray(converted) && converted.length === 2) {
                            lng = converted[0];
                            lat = converted[1];
                        }
                    }
                } catch (e) {
                    console.warn('WGS84->GCJ-02 转换失败，使用原始坐标:', e);
                }

                currentPosition = [lng, lat];

                // 更新地图中心和缩放级别
                map.setZoomAndCenter(15, [lng, lat]);

                // 强制刷新地图
                setTimeout(function() {
                    if (map && typeof map.resize === 'function') {
                        map.resize();
                    }
                }, 200);

                // 添加当前位置标记（使用本地“我的位置.png”）

                // 添加当前位置标记（使用本地"我的位置.png"）
                var marker = new AMap.Marker({
                    position: [lng, lat],
                    icon: new AMap.Icon({
                        size: new AMap.Size(30, 30),
                        image: MapConfig.markerStyles.currentLocation.icon,
                        imageSize: new AMap.Size(30, 30)
                    }),
                    // 圆形“我的位置”图标用居中对齐
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

                // 加载地理编码插件后进行逆地理编码（GCJ-02坐标）
                AMap.plugin('AMap.Geocoder', function() {
                    var geocoder = new AMap.Geocoder();
                    geocoder.getAddress([lng, lat], function(status, result) {
                        if (status === 'complete' && result.regeocode) {
                            if (document.getElementById('start-location')) {
                                document.getElementById('start-location').value = result.regeocode.formattedAddress;
                            }
                        }
                    });
                });
            },
            function(error) {
                console.error('获取位置失败:', error);
                console.error('错误代码:', error.code);
                console.error('错误信息:', error.message);
                // 使用默认位置
                document.getElementById('start-location').value = '北京市';
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        console.error('浏览器不支持地理位置');
        document.getElementById('start-location').value = '北京市';
    }
}

function clearMarkers() {
    markers.forEach(function(marker) {
        map.remove(marker);
    });
    markers = [];
}

// ====== 首页地图：实时定位与箭头随手机方向旋转 ======
function startRealtimeLocationTracking() {
    if (!('geolocation' in navigator)) {
        alert('当前浏览器不支持定位');
        return;
    }
    if (isRealtimeLocating) return;

    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 };
    try {
        // 在用户手势触发时优先尝试开启设备方向监听，提升 iOS 权限通过概率
        tryStartDeviceOrientationIndex();

        locationWatchId = navigator.geolocation.watchPosition(
            pos => {
                let lng = pos.coords.longitude;
                let lat = pos.coords.latitude;
                // 坐标系转换 WGS84 -> GCJ-02
                try {
                    if (typeof wgs84ToGcj02 === 'function') {
                        const c = wgs84ToGcj02(lng, lat);
                        if (Array.isArray(c) && c.length === 2) { lng = c[0]; lat = c[1]; }
                    }
                } catch (e) { console.warn('坐标系转换失败，使用原始坐标', e); }

                const curr = [lng, lat];
                currentPosition = curr;

                // 开启实时定位时，移除一次性初始定位标记，避免重复
                if (initialLocationMarker) {
                    try { map.remove(initialLocationMarker); } catch (e) {}
                    initialLocationMarker = null;
                }

                // 初始化或更新自身标记
                if (!selfMarker) {
                    const iconCfg = MapConfig.markerStyles.headingLocation;
                    var w = (iconCfg && iconCfg.size && iconCfg.size.w) ? iconCfg.size.w : 36;
                    var h = (iconCfg && iconCfg.size && iconCfg.size.h) ? iconCfg.size.h : 36;
                    const icon = new AMap.Icon({
                        size: new AMap.Size(w, h),
                        image: iconCfg.icon,
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

                // 旋转：优先用设备方向，回退用移动向量
                if (lastDeviceHeadingIndex !== null) {
                    try {
                        if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(lastDeviceHeadingIndex);
                        else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(lastDeviceHeadingIndex);
                    } catch (e) {}
                } else if (lastGpsPosIndex) {
                    const bearing = calcBearingSimple(lastGpsPosIndex, curr);
                    if (!isNaN(bearing)) {
                        try {
                            if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(bearing);
                            else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(bearing);
                        } catch (e) {}
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

                // 启动设备方向监听（再次确保，若前面未成功）
                tryStartDeviceOrientationIndex();
            },
            err => {
                console.error('实时定位失败:', err);
                alert('无法获取实时定位');
                stopRealtimeLocationTracking();
            },
            options
        );
        isRealtimeLocating = true;
        // 更新定位按钮UI
        try {
            const locateBtn = document.getElementById('locate-btn');
            if (locateBtn) {
                locateBtn.classList.add('active');
                locateBtn.title = '停止实时定位';
            }
        } catch (e) {}
    } catch (e) {
        console.error('开始实时定位异常:', e);
    }
}

function stopRealtimeLocationTracking() {
    try {
        if (locationWatchId !== null && navigator.geolocation && typeof navigator.geolocation.clearWatch === 'function') {
            navigator.geolocation.clearWatch(locationWatchId);
        }
    } catch (e) {}
    locationWatchId = null;
    isRealtimeLocating = false;
    lastGpsPosIndex = null;
    // 不强制移除标记，保留当前位置；如需清除可在此移除
    tryStopDeviceOrientationIndex();
    // 更新定位按钮UI
    try {
        const locateBtn = document.getElementById('locate-btn');
        if (locateBtn) {
            locateBtn.classList.remove('active');
            locateBtn.title = '开启实时定位';
        }
    } catch (e) {}
}

// 开启设备方向监听（iOS 权限处理）
function tryStartDeviceOrientationIndex() {
    if (trackingDeviceOrientationIndex) return;
    const isIOS = /iP(ad|hone|od)/i.test(navigator.userAgent);
    const start = () => {
        deviceOrientationHandlerIndex = function(e) {
            if (!e) return;
            // 优先使用 iOS Safari 的 webkitCompassHeading（已指向正北，0-360，顺时针）
            let heading = null;
            if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
                heading = e.webkitCompassHeading;
            } else if (typeof e.alpha === 'number' && !isNaN(e.alpha)) {
                heading = e.alpha;
            }
            if (heading === null) return;
            if (heading < 0) heading += 360;
            lastDeviceHeadingIndex = heading;
            if (selfMarker) {
                try {
                    if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(heading);
                    else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(heading);
                } catch (err) {}
            }
        };
        window.addEventListener('deviceorientation', deviceOrientationHandlerIndex, true);
        trackingDeviceOrientationIndex = true;
    };
    try {
        if (isIOS && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(state => {
                if (state === 'granted') start();
                else console.warn('用户拒绝设备方向权限');
            }).catch(err => console.warn('请求方向权限失败:', err));
        } else {
            start();
        }
    } catch (e) { console.warn('开启方向监听失败:', e); }
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
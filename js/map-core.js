// map-core.js
// 地图初始化和基本操作

// 高德实时定位相关全局变量（不使用浏览器原生定位）
let amapGeolocation = null;   // AMap.Geolocation 实例
let selfMarker = null;        // 自身位置箭头标记
let lastFix = null;           // 上一次定位点 [lng, lat]
let hasFirstFix = false;      // 是否已完成首次定位
let isAmapWatchActive = false;// 是否处于实时监听状态

// 生成朝向箭头的SVG图标（base64）
function createHeadingArrowIcon(color) {
    const svg = `
        <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="1"/>
                    <feOffset dx="0" dy="1" result="offsetblur"/>
                    <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
            </defs>
            <g filter="url(#shadow)">
                <circle cx="15" cy="15" r="12" fill="white"/>
                <path d="M15 4 L20 18 L15 15 L10 18 Z" fill="${color || '#007bff'}"/>
            </g>
        </svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

// 计算两点之间的方位角（度，0-360）
function calcBearing(from, to) {
    if (!from || !to || from.length < 2 || to.length < 2) return 0;
    const lng1 = from[0] * Math.PI / 180;
    const lat1 = from[1] * Math.PI / 180;
    const lng2 = to[0] * Math.PI / 180;
    const lat2 = to[1] * Math.PI / 180;
    const dLng = lng2 - lng1;
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    brng = (brng + 360) % 360;
    return brng;
}

// 启动基于高德API的实时定位（连续更新）
function startRealtimeAmapLocation() {
    if (!map || typeof AMap === 'undefined') return;

    // 确保只创建一次实例
    if (!amapGeolocation) {
        try {
            amapGeolocation = new AMap.Geolocation({
                enableHighAccuracy: true,
                timeout: 10000,
                position: 'RB',
                offset: [10, 20],
                zoomToAccuracy: false,
                showButton: false,
                showMarker: false,
                showCircle: false,
                panToLocation: false,
                extensions: 'all'
            });
            map.addControl(amapGeolocation);
        } catch (e) {
            console.error('创建 AMap.Geolocation 失败:', e);
            showLocationMessage('地图定位组件初始化失败，请检查网络或密钥', '#ff3b30');
            return;
        }
    }

    if (isAmapWatchActive) return; // 已经在监听

    try {
        amapGeolocation.watchPosition(function(status, result) {
            if (status === 'complete' && result && result.position) {
                const lng = result.position.lng;
                const lat = result.position.lat;
                currentPosition = [lng, lat];

                // 首次定位：设置视野
                if (!hasFirstFix) {
                    hasFirstFix = true;
                    try { map.setZoomAndCenter(17, currentPosition); } catch (e) {}

                    // 移除旧的“currentLocation”圆点标记
                    try {
                        markers.forEach(function(mk) {
                            if (mk && mk.getExtData && mk.getExtData().type === 'currentLocation') {
                                map.remove(mk);
                            }
                        });
                        markers = markers.filter(function(mk) {
                            return !(mk && mk.getExtData && mk.getExtData().type === 'currentLocation');
                        });
                    } catch (e) {}
                }

                // 更新/创建自身位置箭头
                if (!selfMarker) {
                    const icon = new AMap.Icon({
                        size: new AMap.Size(30, 30),
                        image: createHeadingArrowIcon('#007bff'),
                        imageSize: new AMap.Size(30, 30)
                    });
                    selfMarker = new AMap.Marker({
                        position: currentPosition,
                        icon,
                        offset: new AMap.Pixel(-15, -15),
                        zIndex: 999,
                        map: map,
                        angle: 0,
                        extData: { type: 'selfArrow' }
                    });
                } else {
                    selfMarker.setPosition(currentPosition);
                }

                // 根据移动方向旋转箭头（过滤微小抖动）
                if (lastFix) {
                    const dLng = lastFix[0] - currentPosition[0];
                    const dLat = lastFix[1] - currentPosition[1];
                    const moveSmall = Math.abs(dLng) < 1e-6 && Math.abs(dLat) < 1e-6;
                    if (!moveSmall) {
                        const bearing = calcBearing(lastFix, currentPosition);
                        if (typeof selfMarker.setAngle === 'function') selfMarker.setAngle(bearing);
                        else if (typeof selfMarker.setRotation === 'function') selfMarker.setRotation(bearing);
                    }
                }
                lastFix = currentPosition.slice();

            } else {
                // 失败提示（节流）
                console.warn('高德实时定位失败:', result && result.message);
            }
        });
        isAmapWatchActive = true;
        showLocationLoading('正在实时定位中...');
        // 2秒后隐藏加载提示（持续定位，无需长时间显示）
        setTimeout(hideLocationMessage, 2000);
    } catch (e) {
        console.error('启动 watchPosition 失败:', e);
        showLocationMessage('实时定位不可用，请检查权限或网络', '#ff3b30');
    }
}

// 停止实时定位监听
function stopRealtimeAmapLocation() {
    try {
        if (amapGeolocation && typeof amapGeolocation.clearWatch === 'function') {
            amapGeolocation.clearWatch();
        }
    } catch (e) {}
    isAmapWatchActive = false;
}

function initMap() {
    // 加载高德地图插件
    AMap.plugin([
        'AMap.Geolocation',
        'AMap.Geocoder'
    ], function() {
        console.log('地图插件加载完成');
    });

    map = new AMap.Map('map-container', MapConfig.mapConfig);

    // 等待地图完全加载后再获取位置
    map.on('complete', function() {
        console.log('地图加载完成');
        // 地图就绪后启动基于高德API的实时定位
        setTimeout(function() { startRealtimeAmapLocation(); }, 200);
    });

    // 监听窗口可见性变化，刷新地图
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && map) {
            console.log('页面重新可见，刷新地图');
            setTimeout(function() {
                map.refresh();
            }, 100);
        }
    });

    // 监听窗口焦点变化
    window.addEventListener('focus', function() {
        if (map) {
            console.log('窗口获得焦点，刷新地图');
            setTimeout(function() {
                map.refresh();
            }, 100);
        }
    });

    // 监听窗口大小变化
    window.addEventListener('resize', function() {
        if (map) {
            map.resize();
        }
    });

    // 页面卸载时停止实时定位
    window.addEventListener('beforeunload', function() {
        stopRealtimeAmapLocation();
    });
}

function getCurrentLocation() {
    console.log('开始获取位置...');
    showLocationLoading('正在获取您的位置...');

    // 使用高德地图API定位
    AMap.plugin('AMap.Geolocation', function() {
        var geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,   // 启用高精度定位
            timeout: 10000,              // 超时时间10秒
            position: 'RB',              // 定位按钮的停靠位置（右下）
            offset: [10, 20],            // 定位按钮与设置的停靠位置的偏移量
            zoomToAccuracy: false,       // 不自动调整地图视野
            showButton: false,           // 不显示定位按钮
            showMarker: false,           // 不显示定位标记
            showCircle: false,           // 不显示定位精度圈
            panToLocation: false,        // 不自动移动地图到定位点
            extensions: 'all'            // 返回详细地址信息
        });

        map.addControl(geolocation);

        geolocation.getCurrentPosition(function(status, result) {
            console.log('高德定位结果:', status, result);
            hideLocationMessage();

            if (status === 'complete') {
                // 定位成功
                var lng = result.position.lng;
                var lat = result.position.lat;
                var accuracy = result.accuracy;

                console.log('高德定位成功 (GCJ-02):', lng, lat, '精度:', accuracy + 'm');

                currentPosition = [lng, lat];

                // 更新地图中心和缩放级别
                map.setZoomAndCenter(15, [lng, lat]);

                // 强制刷新地图
                setTimeout(function() {
                    if (map) {
                        map.refresh();
                    }
                }, 200);

                // 移除旧的位置标记
                markers.forEach(function(marker) {
                    if (marker.getExtData && marker.getExtData().type === 'currentLocation') {
                        map.remove(marker);
                    }
                });
                markers = markers.filter(function(marker) {
                    return !(marker.getExtData && marker.getExtData().type === 'currentLocation');
                });

                // 添加当前位置标记（使用本地"我的位置.png"）
                var marker = new AMap.Marker({
                    position: [lng, lat],
                    icon: new AMap.Icon({
                        size: new AMap.Size(30, 30),
                        image: MapConfig.markerStyles.currentLocation.icon,
                        imageSize: new AMap.Size(30, 30)
                    }),
                    offset: new AMap.Pixel(-15, -15),
                    map: map,
                    zIndex: 999,
                    extData: { type: 'currentLocation' }
                });
                markers.push(marker);

                // 如果精度较低，给用户提示
                if (accuracy > 100) {
                    showLocationWarning('定位精度较低（±' + Math.round(accuracy) + '米），可能存在偏差');
                }

                // 更新起点输入框
                var startLocationInput = document.getElementById('start-location');
                if (startLocationInput) {
                    // 优先使用高德返回的地址信息
                    if (result.formattedAddress) {
                        startLocationInput.value = result.formattedAddress;
                        console.log('使用高德地址:', result.formattedAddress);
                    } else {
                        startLocationInput.value = '我的位置';
                    }
                }
            } else {
                // 高德定位失败，提示用户检查权限
                console.warn('高德定位失败:', result.message);
                hideLocationMessage();

                // 根据不同错误情况给出相应提示
                var errorMessage = '';
                if (result.message && result.message.indexOf('PERMISSION_DENIED') !== -1) {
                    errorMessage = '定位权限被拒绝，请在设置中允许定位权限';
                } else if (result.message && result.message.indexOf('POSITION_UNAVAILABLE') !== -1) {
                    errorMessage = '无法获取位置信息，请检查设备定位服务是否开启';
                } else if (result.message && result.message.indexOf('TIMEOUT') !== -1) {
                    errorMessage = '定位请求超时，请检查网络连接后重试';
                } else {
                    errorMessage = '定位失败，请确保已开启定位权限和定位服务';
                }

                showLocationError(errorMessage);

                // 使用默认位置
                var startLocationInput = document.getElementById('start-location');
                if (startLocationInput) {
                    startLocationInput.value = '北京市';
                }
            }
        });
    });
}


// 显示定位加载提示
function showLocationLoading(message) {
    var toast = document.getElementById('location-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'location-toast';
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.75);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        document.body.appendChild(toast);
    }

    toast.innerHTML = `
        <div style="width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>${message}</span>
    `;
    toast.style.display = 'flex';

    // 添加旋转动画
    if (!document.getElementById('location-toast-style')) {
        var style = document.createElement('style');
        style.id = 'location-toast-style';
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
}

// 显示定位错误提示
function showLocationError(message) {
    showLocationMessage(message, '#ff3b30');
}

// 显示定位警告提示
function showLocationWarning(message) {
    showLocationMessage(message, '#ff9500');
}

// 通用消息提示函数
function showLocationMessage(message, color) {
    hideLocationMessage();

    var toast = document.createElement('div');
    toast.className = 'location-message-toast';
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: ${color};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-size: 14px;
        max-width: 80%;
        text-align: center;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function() {
        if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 4000);
}

// 隐藏定位消息
function hideLocationMessage() {
    var toast = document.getElementById('location-toast');
    if (toast) {
        toast.style.display = 'none';
    }

    var messages = document.querySelectorAll('.location-message-toast');
    messages.forEach(function(msg) {
        if (msg.parentNode) {
            msg.parentNode.removeChild(msg);
        }
    });
}

function clearMarkers() {
    markers.forEach(function(marker) {
        map.remove(marker);
    });
    markers = [];
}

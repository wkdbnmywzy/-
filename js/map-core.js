// map-core.js
// 地图初始化和基本操作

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
        // 延迟获取定位，确保地图渲染完成
        setTimeout(function() {
            getCurrentLocation();
        }, 100);
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
}

function getCurrentLocation() {
    console.log('开始获取位置...');
    showLocationLoading('正在获取您的位置...');

    // 检测是否在微信环境
    var isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    console.log('当前环境:', isWeChat ? '微信' : '浏览器');

    // 优先使用高德地图API定位（支持微信环境）
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
                // 高德定位失败，使用浏览器定位作为备选方案
                console.warn('高德定位失败:', result.message, '尝试浏览器定位');
                hideLocationMessage();
                useBrowserGeolocation();
            }
        });
    });
}

// 备选方案：使用浏览器原生定位（微信环境可能不稳定）
function useBrowserGeolocation() {
    if (!navigator.geolocation) {
        console.error('浏览器不支持地理定位');
        showLocationError('您的浏览器不支持地理定位功能');
        var startLocationInput = document.getElementById('start-location');
        if (startLocationInput) {
            startLocationInput.value = '北京市';
        }
        return;
    }

    console.log('开始浏览器定位...');
    showLocationLoading('正在通过浏览器获取位置...');

    navigator.geolocation.getCurrentPosition(
        function(position) {
            console.log('浏览器定位成功:', position);
            hideLocationMessage();

            var lng = position.coords.longitude;
            var lat = position.coords.latitude;
            var accuracy = position.coords.accuracy;

            console.log('原始坐标 (WGS84):', lng, lat, '精度:', accuracy + 'm');

            // WGS84 坐标转换为 GCJ-02（高德坐标系）
            if (typeof wgs84ToGcj02 === 'function') {
                try {
                    var converted = wgs84ToGcj02(lng, lat);
                    if (Array.isArray(converted) && converted.length === 2) {
                        lng = converted[0];
                        lat = converted[1];
                        console.log('转换后坐标 (GCJ-02):', lng, lat);
                    }
                } catch (e) {
                    console.warn('坐标转换失败，使用原始坐标:', e);
                }
            }

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

            // 添加当前位置标记
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
                startLocationInput.value = '我的位置';
            }

            // 加载地理编码插件后进行逆地理编码
            AMap.plugin('AMap.Geocoder', function() {
                var geocoder = new AMap.Geocoder();
                geocoder.getAddress([lng, lat], function(status, result) {
                    if (status === 'complete' && result.regeocode) {
                        var address = result.regeocode.formattedAddress;
                        console.log('逆地理编码成功:', address);
                        if (startLocationInput) {
                            startLocationInput.value = address;
                        }
                    } else {
                        console.warn('逆地理编码失败:', status);
                    }
                });
            });
        },
        function(error) {
            console.error('浏览器定位失败:', error);
            hideLocationMessage();

            // 根据不同错误类型给出友好提示
            var errorMessage = '';
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = '您拒绝了定位权限请求，请允许定位权限';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = '无法获取位置信息，请检查设备定位服务是否开启';
                    break;
                case error.TIMEOUT:
                    errorMessage = '定位请求超时，请检查网络连接后重试';
                    break;
                default:
                    errorMessage = '定位失败：' + error.message;
            }

            showLocationError(errorMessage);

            // 使用默认位置
            var startLocationInput = document.getElementById('start-location');
            if (startLocationInput) {
                startLocationInput.value = '北京市';
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
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

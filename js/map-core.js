// map-core.js
// 地图初始化和基本操作

function initMap() {
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
                    if (map) {
                        map.refresh();
                    }
                }, 200);

                // 添加当前位置标记（使用本地“我的位置.png”）
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

                // 更新起点输入框
                document.getElementById('start-location').value = '我的位置';

                // 加载地理编码插件后进行逆地理编码（GCJ-02坐标）
                AMap.plugin('AMap.Geocoder', function() {
                    var geocoder = new AMap.Geocoder();
                    geocoder.getAddress([lng, lat], function(status, result) {
                        if (status === 'complete' && result.regeocode) {
                            document.getElementById('start-location').value = result.regeocode.formattedAddress;
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
// config.js - 高德地图配置（包含插件配置）
const MapConfig = {
    // API密钥（请确保已在高德开放平台申请并启用对应服务）
    key: '02e4976e38eb8bc8bcf71a9c485cc2ae',

    // 方向角配置
    orientationConfig: {
        // Android设备是否需要反转alpha值
        // true: heading = 360 - alpha (大多数Android设备)
        // false: heading = alpha (少数Android设备)
        androidNeedsInversion: true,

        // 方向角度偏移量（度）
        // 如果图标朝向与实际方向相差180度，设置为180
        // 如果图标朝向与实际方向相差90度，设置为90或-90
        // 默认为0（不偏移）
        angleOffset: 0,

        // 是否启用调试日志
        debugMode: true
    },

    // 地图初始配置
    mapConfig: {
        zoom: 13,
        center: [116.397428, 39.90923], // 北京天安门（默认中心）
        viewMode: '3D',
        resizeEnable: true, // 允许地图尺寸自适应窗口变化
        lang: 'zh_cn', // 中文显示
        showLabel: true, // 显示地图文字标记
        features: ['bg', 'road', 'building', 'point'], // 显示的地图要素
        logoUrl: '', // 隐藏logo
        copyright: '' // 隐藏版权信息
    },
    
    // 所需插件列表
    plugins: [
        'AMap.Geocoder',       // 地理编码插件（地址与坐标互转）
        'AMap.Riding',         // 骑行路线规划
        'AMap.Driving',        // 驾车路线规划
        'AMap.Walking',        // 步行路线规划
        'AMap.Scale',          // 比例尺插件
        'AMap.ToolBar'         // 工具栏插件（含缩放按钮）
    ],
    
    // 标记样式配置
    markerStyles: {
        point: {
            background: '#FF6B6B',
            color: 'white',
            size: 24
        },
        start: {
            icon: 'images/工地数字导航小程序切图/司机/2X/地图icon/起点.png'
        },
        currentLocation: {
            // 建议使用绝对路径或确保相对路径正确
            icon: 'images/工地数字导航小程序切图/司机/2X/地图icon/我的位置.png'
        },
        // 主地图“我的位置（带朝向）”标记的占位配置；若未提供，将退回为内置SVG箭头
        headingLocation: {
            // 使用 images 目录下的 我的位置.png（当前位于项目切图路径）
            icon: 'images/工地数字导航小程序切图/司机/2X/地图icon/我的位置.png',
            size: { w: 36, h: 36 },
            // 若希望显示可旋转的箭头图标（推荐在手机端），将此项改为 true
            useSvgArrow: false
        },
        destination: {
            icon: 'images/工地数字导航小程序切图/司机/2X/地图icon/终点.png'
        },
        navigation: {
            icon: 'https://webapi.amap.com/theme/v1.3/markers/n/car.png'
        }
    },
    
    // 路径样式配置
    routeStyles: {
        polyline: {
            strokeColor: '#3366FF',
            strokeWeight: 4,
            strokeOpacity: 0.8
        },
        polygon: {
            strokeColor: '#FF6633',
            strokeWeight: 2,
            strokeOpacity: 0.8,
            fillColor: '#FF6633',
            fillOpacity: 0.3
        },
        navigation: {
            strokeColor: '#3366FF',
            strokeWeight: 6,
            strokeOpacity: 0.8
        }
    },

    // 导航参数配置
    navigationConfig: {
        // 接近起点时，允许“以我为起点”自动对齐到路网的距离（米）
         startRebaseDistanceMeters: 15,
        // 判定到达终点的沿路网剩余距离（米）。建议10~15米，过大会提前结束
        endArrivalDistanceMeters: 12,
        // 是否要求到达起点附近再开始沿路网导航
        requireStartAtOrigin: true,
        // 提示模式：'path'（基于路网，默认）或 'heading'（基于用户朝向）
        promptMode: 'path'
    }
};

// 全局变量（避免重复声明）
let map = null;               // 地图实例
let markers = [];             // 标记点集合
let currentPosition = null;   // 当前位置坐标
let waypoints = [];           // 途经点集合
let currentRoute = null;      // 当前路线实例
let kmlLayers = [];           // KML图层集合
let currentKmlFile = null;    // 当前KML文件
// 首页实时定位相关全局变量
let selfMarker = null;                // 主地图上的“我的位置（带朝向）”标记
let isRealtimeLocating = false;       // 是否处于实时定位
let locationWatchId = null;           // geolocation.watchPosition 的ID
let lastDeviceHeadingIndex = null;    // 设备方向（度）
let trackingDeviceOrientationIndex = false; // 是否已监听 deviceorientation
let deviceOrientationHandlerIndex = null;   // 方向事件处理器
let lastGpsPosIndex = null;           // 上一次GPS点 [lng, lat]
let initialLocationMarker = null;     // 一次性定位创建的初始位置标记

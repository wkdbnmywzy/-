// config.js - 高德地图配置（包含插件配置）
const MapConfig = {
    // API密钥（请确保已在高德开放平台申请并启用对应服务）
    key: '0497193edd69fcf7a6938b2591348409',

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
        // 主地图"我的位置（带朝向）"标记的占位配置；若未提供，将退回为内置SVG箭头
        headingLocation: {
            // 使用 images 目录下的 我的位置.png（当前位于项目切图路径）
            icon: 'images/工地数字导航小程序切图/司机/2X/地图icon/我的位置.png',
            size: { w: 42, h: 50 },  // 保持原图比例，图标是竖向矩形
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
        // ====== 车头朝上模式配置 ======
        // 是否启用车头朝上模式（地图跟随车辆方向旋转）
        headingUpMode: true,
        // 地图旋转平滑动画时长（毫秒）
        mapRotationDuration: 300,
        // 地图旋转更新间隔（毫秒），避免频繁旋转
        mapRotationUpdateInterval: 500,

        // 强制基于路网（未经过的路线）计算提示与图标
        usePathBasedPrompts: true,
        // 优先使用"预计算的转向序列"来生成提示（基于规划路径，抖动更少）
        usePrecomputedManeuvers: true,
    // 接近起点时，允许"以我为起点"自动对齐到路网的距离（米）
     startRebaseDistanceMeters: 12,
        // 判定到达终点的距离阈值（米）。使用新的"索引+距离"双重判定
        endArrivalDistanceMeters: 3,
    // 是否要求到达起点附近再开始沿路网导航
    // true: 只有靠近规划起点(≤ startRebaseDistanceMeters)才开始；
    // false: 只要投影点在路网上即可开始
    requireStartAtOrigin: true,
        // 与下一个转向的距离大于该阈值时，顶部图标优先显示"直行"，避免误解为仍需立即转向（单位：米）
        turnPromptDistanceMeters: 40,
        // 超过该距离时，不优先提示"掉头"，而优先展示后续非掉头的转向或直行（单位：米）
        uturnPromptDistanceMeters: 20,
        // 【改进】判定"到达途径点"的距离阈值（米）。增加到8米，更早地检测到达
        // 原值：3米（需要非常接近才能触发）
        // 新值：8米（提前检测，考虑GPS精度±5-10米）
        waypointArrivalDistanceMeters: 8,
        // 吸附到路线的阈值（米）：当用户距离路线≤此值时，自动吸附到最近的路线点
        snapToRouteDistanceMeters: 12,
        // 仅当接近未到达的途径点时才允许显示“掉头”提示（米）
        waypointUturnTriggerMeters: 18,
        // 连续路口的提示合并最小间距（米）：小于该值的相邻拐点会被合并，避免抖动
        // 如需让短路径连续左/右都能提示，可调小（例如 3）
        turnMergeMinGapMeters: 3,
        // 短路径转弯识别的最小线段长度（米）：过大可能忽略短拐点
        // 若短拐点经常不提示，可调到 1~2 米
        minSegmentLengthMeters: 1.5,
        // 短段聚合角度的最小聚合长度（米）：当相邻线段过短时，聚合前后各若干米再计算夹角，避免漏检
        turnClusterMinMeters: 5,
        // 转向角度阈值（度），小于该角度视为直行
        turnAngleThresholdDegrees: 28,
        // 通过一个转向后，最少等待多久再显示下一条指示（毫秒），避免连跳
        postTurnNextPromptMinTimeMs: 1500,
        // 提示模式：'path'（基于路网，默认）或 'heading'（基于用户朝向）
        promptMode: 'path',
        
        // ====== GPS过滤配置（防止GPS漂移） ======
        // 是否启用GPS过滤（默认启用）
        gpsFilterEnabled: true,
        // GPS最大跳跃距离（米）：超过此距离的GPS数据将被视为异常并拒绝
        // 建议值：30-100米，根据实际场景调整
        gpsMaxJumpDistanceMeters: 50,
        // GPS历史记录大小：保留最近N个有效GPS位置用于异常检测
        gpsMaxHistorySize: 5
    }
};

// 全局变量（避免重复声明）
let map = null;               // 地图实例
let markers = [];             // 标记点集合
let currentPosition = null;   // 当前位置坐标
let waypoints = [];           // 途经点集合
let currentRoute = null;      // 当前路线实例
window.kmlLayers = [];        // KML图层集合（必须用 window.kmlLayers，供导航页面的 kml-route-planning.js 使用）
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

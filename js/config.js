// config.js - 高德地图配置（包含插件配置）
const MapConfig = {
    // API密钥（请确保已在高德开放平台申请并启用对应服务）
    key: '02e4976e38eb8bc8bcf71a9c485cc2ae',
    
    // 地图初始配置
    mapConfig: {
        zoom: 13,
        center: [116.397428, 39.90923], // 北京天安门（默认中心）
        viewMode: '3D',
        resizeEnable: true, // 允许地图尺寸自适应窗口变化
        lang: 'zh_cn' // 中文显示
    },
    
    // 所需插件列表（关键补充）
    plugins: [
        'AMap.Geolocation',    // 定位插件
        'AMap.Geocoder',       // 地理编码插件（地址与坐标互转）
        'AMap.Riding',         // 骑行路线规划（如果需要）
        'AMap.Driving',        // 驾车路线规划（如果需要）
        'AMap.Walking',        // 步行路线规划（如果需要）
        'AMap.Scale',          // 比例尺插件
        'AMap.ToolBar'         // 工具栏插件（含缩放、定位按钮）
    ],
    
    // 标记样式配置
    markerStyles: {
        point: {
            background: '#FF6B6B',
            color: 'white',
            size: 24
        },
        currentLocation: {
            // 建议使用绝对路径或确保相对路径正确
            icon: 'images/工地数字导航小程序切图/司机/2X/地图icon/我的位置.png'
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

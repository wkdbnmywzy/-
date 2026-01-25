/**
 * 虚拟GPS模拟器 - 用于测试导航功能
 * 使用：VirtualGPS.start() 开始, VirtualGPS.stop() 停止
 */

const VirtualGPS = {
    isRunning: false,
    timerId: null,
    routePoints: [],
    currentIndex: 0,
    speed: 30,

    start(speedKmh = 30) {
        if (this.isRunning) {
            console.warn('[虚拟GPS] 已在运行中');
            return;
        }

        const points = this.getRoutePoints();
        if (!points || points.length === 0) {
            console.error('[虚拟GPS] 未找到导航路线，请先开始导航');
            return;
        }

        // 停止真实GPS
        if (typeof NavGPS !== 'undefined' && NavGPS.stopWatch) {
            NavGPS.stopWatch();
            console.log('[虚拟GPS] 已停止真实GPS');
        }

        this.routePoints = points;
        this.currentIndex = 0;
        this.speed = speedKmh;
        this.isRunning = true;

        console.log(`%c[虚拟GPS] 🚗 启动模拟`, 'color: blue; font-weight: bold');
        console.log(`  路线点数: ${points.length}, 速度: ${speedKmh} km/h`);

        this.updatePosition();
        this.timerId = setInterval(() => this.updatePosition(), this.calculateInterval());
    },

    getRoutePoints() {
        if (typeof NavCore !== 'undefined' && NavCore.getNavigationPath) {
            return NavCore.getNavigationPath();
        }
        if (window.navigationPath) {
            return window.navigationPath;
        }
        return null;
    },

    calculateInterval() {
        const avgDistance = 8;
        const speedMs = (this.speed * 1000) / 3600;
        return Math.max(800, (avgDistance / speedMs) * 1000);
    },

    updatePosition() {
        if (this.currentIndex >= this.routePoints.length) {
            console.log('%c[虚拟GPS] ✅ 已到达终点', 'color: green; font-weight: bold');
            this.stop();
            return;
        }

        const point = this.routePoints[this.currentIndex];
        window.lastGpsPosIndex = [point[0], point[1]];

        // 计算方向（基于前后两点）
        let heading = 0;
        if (this.currentIndex > 0) {
            const prevPoint = this.routePoints[this.currentIndex - 1];
            heading = this.calculateBearing(prevPoint, point);
        }

        // 触发导航更新
        if (typeof window.NavCore !== 'undefined' && typeof window.NavCore.onGPSUpdate === 'function') {
            window.NavCore.onGPSUpdate(point, 10, heading);
        }

        // 触发位置上报（让管理端能看到）
        this.reportToServer();

        const progress = ((this.currentIndex / this.routePoints.length) * 100).toFixed(1);
        console.log(`[虚拟GPS] 📍 ${progress}% [${this.currentIndex}/${this.routePoints.length}]`);

        this.currentIndex++;
    },

    async reportToServer() {
        try {
            // 优先使用吸附后的位置
            let position = window.snappedPosition || window.lastGpsPosIndex;
            if (!position) return;

            // 获取车牌号和项目ID（和位置上报器使用相同的方式）
            let plateNumber, projectId;

            // 优先从位置上报器获取
            if (typeof window.VehicleLocationReporter !== 'undefined') {
                const status = window.VehicleLocationReporter.getStatus();
                plateNumber = status.licensePlate;
                projectId = status.projectId;
            }

            // 如果没有，从sessionStorage获取（和位置上报器初始化时一样）
            if (!plateNumber || !projectId) {
                const currentUser = JSON.parse(sessionStorage.getItem('currentUser') || '{}');
                const projectSelection = JSON.parse(sessionStorage.getItem('projectSelection') || '{}');

                plateNumber = plateNumber || currentUser.licensePlate;

                // 优先从projectSelection.projectCode获取，其次从project对象获取
                if (!projectId) {
                    if (projectSelection.projectCode) {
                        projectId = projectSelection.projectCode;
                    } else if (projectSelection.projectId) {
                        projectId = projectSelection.projectId;
                    } else if (typeof projectSelection.project === 'object' && projectSelection.project?.projectCode) {
                        projectId = projectSelection.project.projectCode;
                    }
                }
            }

            if (!plateNumber || !projectId) {
                console.warn('[虚拟GPS] 缺少车牌号或项目ID，无法上报位置');
                return;
            }

            // 获取车辆方向角度
            const direction = window.currentMapRotation || 0;

            const response = await fetch('http://115.159.67.12:8086/api/transport/temp-vehicle/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    latitude: position[1],
                    longitude: position[0],
                    plateNumber: plateNumber,
                    projectId: projectId,
                    direction: direction  // 车辆方向角度
                })
            });

            if (response.ok) {
                console.log('[虚拟GPS] ✓ 位置已上报到服务器');
            } else {
                console.warn('[虚拟GPS] 位置上报失败:', response.status);
            }
        } catch (e) {
            console.warn('[虚拟GPS] 位置上报异常:', e.message);
        }
    },

    calculateBearing(from, to) {
        const [lng1, lat1] = from;
        const [lng2, lat2] = to;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
        let brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    },

    stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
        this.isRunning = false;
        console.log('%c[虚拟GPS] ⏹️ 已停止', 'color: red; font-weight: bold');
    },

    setSpeed(speedKmh) {
        this.speed = speedKmh;
        console.log(`[虚拟GPS] 速度设置为 ${speedKmh} km/h`);
        if (this.isRunning && this.timerId) {
            clearInterval(this.timerId);
            this.timerId = setInterval(() => this.updatePosition(), this.calculateInterval());
        }
    },

    status() {
        console.log({
            运行中: this.isRunning,
            当前点: this.currentIndex,
            总点数: this.routePoints.length,
            速度: this.speed + ' km/h',
            进度: ((this.currentIndex / this.routePoints.length) * 100).toFixed(1) + '%'
        });
    }
};

window.VirtualGPS = VirtualGPS;
console.log('%c虚拟GPS已加载', 'color: blue; font-weight: bold');
console.log('使用：VirtualGPS.start() 开始, VirtualGPS.stop() 停止');

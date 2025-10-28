// navigation-controller.js
// 全新的导航核心控制器

class NavigationController {
    constructor(map, routeData, routePolyline, options = {}) {
        this.map = map;
        this.routeData = routeData;
        this.routePolyline = routePolyline;
        
        // 导航状态
        this.isNavigating = false;
        this.isOnRoute = false;  // 是否在路径上
        this.hasStarted = false; // 是否开始正式导航
        
        // 路径数据
        this.routePath = [];     // 完整路径点数组 [lng, lat]
        this.waypoints = [];     // 途径点信息数组
        this.currentWaypointIndex = 0; // 当前目标途径点索引
        
        // 位置相关 - 可以接收已存在的标记
        this.userMarker = options.existingMarker || null;
        this.userPosition = null;
        this.lastPosition = null;
        this.gpsWatchId = null;
        
        // 路径吸附和判定
        this.ON_ROUTE_THRESHOLD = 5; // 5米判定阈值（沿路径左右各5米，共10米宽走廊）
        this.ARRIVAL_THRESHOLD = 5;  // 5米到达判定
        
        // 轨迹记录
        this.actualPath = [];        // 实际走过的路径
        this.deviatedPath = [];      // 偏离的路径（黄色）
        
        // 已走路径跟踪（用于标灰）
        this.projectionStartDistance = 0;  // 导航起点在路径上的距离
        this.projectionMaxDistance = 0;    // 已走过的最远距离
        this.hasReachedRoute = false;      // 是否已到达路径（开始标灰）
        
        // 地图旋转
        this.lastRotation = 0;
        this.ROTATION_THRESHOLD = 20; // 20度变化触发旋转
        
        // 导航开始时间（用于统计）
        this.startTime = null;
        this.totalDistance = 0;
    }
    
    /**
     * 开始导航
     */
    start() {
        if (!this.routeData || !this.routePolyline) {
            console.error('缺少路线数据');
            return false;
        }
        
        // 初始化路径数据
        this.initializeRouteData();
        
        // 重置状态
        this.resetStates();
        
        // 启动GPS追踪
        this.startGPSTracking();
        
        this.isNavigating = true;
        this.startTime = Date.now();
        
        console.log('导航控制器已启动');
        return true;
    }
    
    /**
     * 停止导航
     * @param {boolean} keepMarker - 是否保留用户位置标记（用于继续显示实时位置）
     */
    stop(keepMarker = true) {
        this.isNavigating = false;
        this.hasStarted = false;
        
        // 停止GPS追踪
        this.stopGPSTracking();
        
        // 根据参数决定是否清理标记
        if (!keepMarker && this.userMarker) {
            removeMarker(this.userMarker, this.map);
            this.userMarker = null;
        } else {
            console.log('保留用户位置标记，可继续显示实时位置');
        }
        
        console.log('导航已停止');
    }
    
    /**
     * 初始化路径数据
     */
    initializeRouteData() {
        // 获取完整路径
        const rawPath = this.routePolyline.getPath() || [];
        this.routePath = rawPath.map(p => this.normalizeLngLat(p));
        
        // 获取途径点信息（从KML数据中提取）
        this.extractWaypoints();
        
        // 计算总距离
        this.totalDistance = this.calculatePathDistance(this.routePath);
        
        console.log('路径初始化完成:', {
            totalPoints: this.routePath.length,
            waypoints: this.waypoints.length,
            distance: this.totalDistance
        });
    }
    
    /**
     * 提取途径点信息
     */
    extractWaypoints() {
        this.waypoints = [];
        
        // 从routeData中提取途径点
        if (this.routeData && this.routeData.waypoints) {
            this.routeData.waypoints.forEach((wp, index) => {
                // 找到途径点在路径上的位置
                const wpPos = this.findWaypointOnPath(wp);
                if (wpPos) {
                    this.waypoints.push({
                        name: wp.name || `途径点${index + 1}`,
                        position: wpPos.position,
                        pathIndex: wpPos.index,
                        distance: wpPos.distance,
                        visited: false
                    });
                }
            });
        }
        
        // 按路径顺序排序
        this.waypoints.sort((a, b) => a.pathIndex - b.pathIndex);
        
        console.log('提取到途径点:', this.waypoints);
    }
    
    /**
     * 找到途径点在路径上的位置
     */
    findWaypointOnPath(waypoint) {
        if (!waypoint.position) return null;
        
        let minDist = Infinity;
        let bestIndex = -1;
        let bestPos = null;
        
        // 遍历路径线段，找到最近的投影点
        for (let i = 0; i < this.routePath.length - 1; i++) {
            const projection = this.projectPointOnSegment(
                waypoint.position,
                this.routePath[i],
                this.routePath[i + 1]
            );
            
            if (projection.distance < minDist) {
                minDist = projection.distance;
                bestIndex = i;
                bestPos = projection.point;
            }
        }
        
        if (bestIndex >= 0) {
            // 计算从起点到该点的距离
            const distanceFromStart = this.calculatePathDistance(
                this.routePath.slice(0, bestIndex + 1)
            ) + this.getDistance(this.routePath[bestIndex], bestPos);
            
            return {
                position: bestPos,
                index: bestIndex,
                distance: distanceFromStart
            };
        }
        
        return null;
    }
    
    /**
     * 重置导航状态
     */
    resetStates() {
        this.isOnRoute = false;
        this.hasStarted = false;
        this.currentWaypointIndex = 0;
        this.actualPath = [];
        this.deviatedPath = [];
        this.lastPosition = null;
        this.lastRotation = 0;
        
        // 重置已走路径跟踪
        this.projectionStartDistance = 0;
        this.projectionMaxDistance = 0;
        this.hasReachedRoute = false;
        
        // 重置途径点访问状态
        this.waypoints.forEach(wp => wp.visited = false);
    }
    
    /**
     * 启动GPS追踪
     */
    startGPSTracking() {
        if (!('geolocation' in navigator)) {
            alert('当前浏览器不支持定位');
            return;
        }
        
        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 2000
        };
        
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => this.onPositionUpdate(position),
            (error) => this.onPositionError(error),
            options
        );
        
        console.log('GPS追踪已启动');
    }
    
    /**
     * 停止GPS追踪
     */
    stopGPSTracking() {
        if (this.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
    }
    
    /**
     * GPS位置更新回调
     */
    onPositionUpdate(position) {
        if (!this.isNavigating) return;
        
        // 坐标转换 WGS84 -> GCJ02
        let lng = position.coords.longitude;
        let lat = position.coords.latitude;
        
        if (typeof wgs84ToGcj02 === 'function') {
            const converted = wgs84ToGcj02(lng, lat);
            if (Array.isArray(converted) && converted.length === 2) {
                lng = converted[0];
                lat = converted[1];
            }
        }
        
        const currentPos = [lng, lat];
        this.userPosition = currentPos;
        
        // 记录实际路径
        this.actualPath.push(currentPos);
        
        // 检查是否在路径上
        const routeCheck = this.checkOnRoute(currentPos);
        this.isOnRoute = routeCheck.onRoute;
        
        // 更新或创建用户标记
        this.updateUserMarker(currentPos, routeCheck);
        
        // 触发导航逻辑
        this.processNavigation(currentPos, routeCheck);
        
        // 更新地图视图
        this.updateMapView(currentPos);
        
        this.lastPosition = currentPos;
    }
    
    /**
     * GPS定位错误
     */
    onPositionError(error) {
        console.error('GPS定位失败:', error);
    }
    
    /**
     * 检查是否在路径上
     */
    checkOnRoute(position) {
        let minDist = Infinity;
        let nearestPoint = null;
        let nearestSegmentIndex = -1;
        
        // 检查每个路径线段
        for (let i = 0; i < this.routePath.length - 1; i++) {
            const projection = this.projectPointOnSegment(
                position,
                this.routePath[i],
                this.routePath[i + 1]
            );
            
            if (projection.distance < minDist) {
                minDist = projection.distance;
                nearestPoint = projection.point;
                nearestSegmentIndex = i;
            }
        }
        
        // 转换为米
        const distanceInMeters = minDist * 111000;
        const onRoute = distanceInMeters <= this.ON_ROUTE_THRESHOLD;
        
        return {
            onRoute,
            distance: distanceInMeters,
            nearestPoint,
            segmentIndex: nearestSegmentIndex
        };
    }
    
    /**
     * 更新用户标记
     */
    updateUserMarker(position, routeCheck) {
        // 如果在路径上，使用吸附后的位置显示
        const displayPosition = routeCheck.onRoute ? routeCheck.nearestPoint : position;
        
        this.userMarker = updateOrCreateLocationMarker({
            existingMarker: this.userMarker,
            position: displayPosition,
            map: this.map,
            zIndex: 200,
            color: '#007bff'
        });
    }
    
    /**
     * 处理导航逻辑
     */
    processNavigation(position, routeCheck) {
        if (!this.hasStarted) {
            // 尚未开始正式导航
            if (routeCheck.onRoute) {
                // 用户已到达路径，开始正式导航
                this.hasStarted = true;
                console.log('开始正式导航');
                
                // 通知渲染器移除引导线
                if (typeof window.navigationRenderer !== 'undefined') {
                    window.navigationRenderer.removeGuideLine();
                }
            } else {
                // 显示引导线到起点
                if (typeof window.navigationRenderer !== 'undefined') {
                    window.navigationRenderer.renderGuideLine(position, this.routePath[0]);
                    
                    // 更新下方信息栏，显示起点信息
                    const distanceToStart = this.getDistance(position, this.routePath[0]) * 111000; // 转换为米
                    const estimatedTime = (distanceToStart / 1000) / 10 * 60; // 假设10km/h，转换为分钟
                    
                    window.navigationRenderer.updateDestinationCard({
                        name: '起点',
                        org: '前往起点',
                        distance: distanceToStart,
                        time: estimatedTime
                    });
                }
            }
        } else {
            // 正式导航中
            this.updateNavigationGuidance(position, routeCheck);
            
            // 更新已走路径（标灰）
            if (routeCheck.onRoute) {
                this.updatePassedPath(position, routeCheck);
            }
            
            // 检查偏离
            if (!routeCheck.onRoute) {
                this.handleOffRoute(position);
            } else {
                // 在路径上，清除偏离轨迹
                this.deviatedPath = [];
                if (window.navigationRenderer) {
                    window.navigationRenderer.clearDeviatedPath();
                }
            }
            
            // 检查途径点和终点
            this.checkWaypointArrival(position);
            this.checkDestinationArrival(position);
        }
    }
    
    /**
     * 更新导航引导
     */
    updateNavigationGuidance(position, routeCheck) {
        // 由 navigation-guide.js 处理
        if (typeof window.navigationGuide !== 'undefined') {
            window.navigationGuide.update(position, routeCheck, this);
        }
    }
    
    /**
     * 处理偏离路径
     */
    handleOffRoute(position) {
        // 记录偏离路径
        this.deviatedPath.push(position);
        
        // 渲染黄色偏离轨迹
        if (typeof window.navigationRenderer !== 'undefined') {
            window.navigationRenderer.renderDeviatedPath(this.deviatedPath);
        }
    }
    
    /**
     * 检查途径点到达
     */
    checkWaypointArrival(position) {
        if (this.currentWaypointIndex >= this.waypoints.length) return;
        
        const waypoint = this.waypoints[this.currentWaypointIndex];
        if (waypoint.visited) return;
        
        const distance = this.getDistance(position, waypoint.position);
        const distanceInMeters = distance * 111000;
        
        if (distanceInMeters <= this.ARRIVAL_THRESHOLD) {
            // 到达途径点
            waypoint.visited = true;
            console.log('到达途径点:', waypoint.name);
            
            // 显示到达提示
            if (typeof window.navigationRenderer !== 'undefined') {
                window.navigationRenderer.showWaypointArrival(waypoint.name);
            }
            
            // 3秒后切换到下一途径点
            setTimeout(() => {
                this.currentWaypointIndex++;
                if (typeof window.navigationGuide !== 'undefined') {
                    window.navigationGuide.update(this.userPosition, null, this);
                }
            }, 3000);
        }
    }
    
    /**
     * 检查终点到达
     */
    checkDestinationArrival(position) {
        const destination = this.routePath[this.routePath.length - 1];
        const distance = this.getDistance(position, destination);
        const distanceInMeters = distance * 111000;
        
        if (distanceInMeters <= this.ARRIVAL_THRESHOLD) {
            this.finishNavigation();
        }
    }
    
    /**
     * 完成导航
     */
    finishNavigation() {
        const duration = Math.floor((Date.now() - this.startTime) / 1000 / 60); // 分钟
        const actualDistance = this.calculatePathDistance(this.actualPath);
        
        console.log('导航完成:', { duration, actualDistance });
        
        // 显示完成卡片
        if (typeof window.navigationRenderer !== 'undefined') {
            window.navigationRenderer.showCompletionModal(actualDistance, duration);
        }
        
        this.stop();
    }
    
    /**
     * 更新已走路径（标灰处理）
     */
    updatePassedPath(position, routeCheck) {
        if (!routeCheck.onRoute || !routeCheck.nearestPoint) return;
        
        // 计算投影点在路径上的累积距离
        const currentDistance = this.calculateDistanceAlongPath(
            routeCheck.nearestPoint,
            routeCheck.segmentIndex
        );
        
        // 初始化起始距离（第一次到达路径时）
        if (!this.hasReachedRoute) {
            this.hasReachedRoute = true;
            this.projectionStartDistance = currentDistance;
            this.projectionMaxDistance = currentDistance;
            console.log(`开始路径标灰，起点距离: ${currentDistance.toFixed(2)}米`);
        }
        
        // 更新最远距离（只增不减）
        if (currentDistance > this.projectionMaxDistance) {
            this.projectionMaxDistance = currentDistance;
        }
        
        // 构建已走路径（从起点到最远投影点）
        const passedPath = this.buildPassedPath();
        
        // 构建剩余路径（从最远投影点到终点）
        const remainingPath = this.buildRemainingPath();
        
        // 渲染灰色已走路径
        if (passedPath.length >= 2 && window.navigationRenderer) {
            window.navigationRenderer.renderPassedPath(passedPath);
        }
        
        // 更新绿色剩余路径
        if (remainingPath.length >= 2 && this.routePolyline) {
            this.routePolyline.setPath(remainingPath);
        }
        
        console.log(`路径更新 - 已走: ${passedPath.length}点, 剩余: ${remainingPath.length}点`);
    }
    
    /**
     * 计算点在路径上的累积距离（从路径起点算起）
     */
    calculateDistanceAlongPath(point, segmentIndex) {
        let distance = 0;
        
        // 累加到该线段起点的距离
        for (let i = 0; i < segmentIndex && i < this.routePath.length - 1; i++) {
            distance += this.getDistance(this.routePath[i], this.routePath[i + 1]) * 111000;
        }
        
        // 加上在当前线段上的距离
        if (segmentIndex < this.routePath.length - 1) {
            distance += this.getDistance(this.routePath[segmentIndex], point) * 111000;
        }
        
        return distance;
    }
    
    /**
     * 构建已走路径（灰色）
     */
    buildPassedPath() {
        const passedPath = [];
        
        if (this.projectionMaxDistance <= this.projectionStartDistance) {
            return passedPath;
        }
        
        let accumulatedDistance = 0;
        
        for (let i = 0; i < this.routePath.length - 1; i++) {
            const segStart = this.routePath[i];
            const segEnd = this.routePath[i + 1];
            const segLength = this.getDistance(segStart, segEnd) * 111000;
            const segStartDist = accumulatedDistance;
            const segEndDist = accumulatedDistance + segLength;
            
            // 检查这个线段是否在标灰范围内
            if (segEndDist <= this.projectionStartDistance) {
                // 整个线段在起点之前，跳过
                accumulatedDistance += segLength;
                continue;
            }
            
            if (segStartDist < this.projectionStartDistance && segEndDist > this.projectionStartDistance) {
                // 起点在这个线段内
                const t = (this.projectionStartDistance - segStartDist) / segLength;
                const startPoint = this.interpolatePoint(segStart, segEnd, t);
                passedPath.push(startPoint);
            } else if (segStartDist >= this.projectionStartDistance) {
                // 整个线段在标灰范围内
                passedPath.push(segStart);
            }
            
            if (segEndDist > this.projectionMaxDistance) {
                // 最远点在这个线段内
                if (segStartDist < this.projectionMaxDistance) {
                    const t = (this.projectionMaxDistance - segStartDist) / segLength;
                    const endPoint = this.interpolatePoint(segStart, segEnd, t);
                    passedPath.push(endPoint);
                }
                break;
            } else if (segEndDist <= this.projectionMaxDistance && segEndDist > this.projectionStartDistance) {
                // 线段终点在标灰范围内
                passedPath.push(segEnd);
            }
            
            accumulatedDistance += segLength;
        }
        
        return passedPath;
    }
    
    /**
     * 构建剩余路径（绿色）
     */
    buildRemainingPath() {
        const remainingPath = [];
        let accumulatedDistance = 0;
        let foundStart = false;
        
        for (let i = 0; i < this.routePath.length - 1; i++) {
            const segStart = this.routePath[i];
            const segEnd = this.routePath[i + 1];
            const segLength = this.getDistance(segStart, segEnd) * 111000;
            const segStartDist = accumulatedDistance;
            const segEndDist = accumulatedDistance + segLength;
            
            if (!foundStart && segEndDist > this.projectionMaxDistance) {
                // 找到最远点所在的线段
                foundStart = true;
                if (segStartDist < this.projectionMaxDistance) {
                    // 最远点在这个线段内，插值计算起点
                    const t = (this.projectionMaxDistance - segStartDist) / segLength;
                    const startPoint = this.interpolatePoint(segStart, segEnd, t);
                    remainingPath.push(startPoint);
                } else {
                    remainingPath.push(segStart);
                }
            }
            
            if (foundStart) {
                remainingPath.push(segEnd);
            }
            
            accumulatedDistance += segLength;
        }
        
        return remainingPath;
    }
    
    /**
     * 在两点之间插值
     */
    interpolatePoint(p1, p2, t) {
        return [
            p1[0] + (p2[0] - p1[0]) * t,
            p1[1] + (p2[1] - p1[1]) * t
        ];
    }
    
    /**
     * 更新地图视图（包括旋转）
     */
    updateMapView(position) {
        // 地图跟随
        this.map.setCenter(position);
        
        // 计算朝向并旋转地图
        if (this.lastPosition) {
            const bearing = this.calculateBearing(this.lastPosition, position);
            const rotationChange = Math.abs(bearing - this.lastRotation);
            
            if (rotationChange >= this.ROTATION_THRESHOLD) {
                this.map.setRotation(bearing);
                this.lastRotation = bearing;
            }
        }
    }
    
    // ========== 工具函数 ==========
    
    normalizeLngLat(point) {
        if (Array.isArray(point)) return point;
        if (point.lng !== undefined && point.lat !== undefined) {
            return [point.lng, point.lat];
        }
        return [point.getLng(), point.getLat()];
    }
    
    getDistance(p1, p2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    calculatePathDistance(path) {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            total += this.getDistance(path[i], path[i + 1]);
        }
        return total * 111000; // 转换为米
    }
    
    projectPointOnSegment(point, segStart, segEnd) {
        const dx = segEnd[0] - segStart[0];
        const dy = segEnd[1] - segStart[1];
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) {
            return {
                point: segStart,
                distance: this.getDistance(point, segStart)
            };
        }
        
        const t = Math.max(0, Math.min(1, 
            ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / len2
        ));
        
        const projection = [
            segStart[0] + t * dx,
            segStart[1] + t * dy
        ];
        
        return {
            point: projection,
            distance: this.getDistance(point, projection),
            t: t
        };
    }
    
    calculateBearing(from, to) {
        const dy = to[1] - from[1];
        const dx = to[0] - from[0];
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        angle = (angle + 90) % 360; // 转换为从正北开始
        if (angle < 0) angle += 360;
        return angle;
    }
}


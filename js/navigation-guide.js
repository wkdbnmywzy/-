// navigation-guide.js
// 导航引导模块 - 处理转向指令

class NavigationGuide {
    constructor() {
        // 图标路径映射
        this.iconMap = {
            '直行': 'images/工地数字导航小程序切图/司机/2X/导航/直行.png',
            '左转': 'images/工地数字导航小程序切图/司机/2X/导航/左转.png',
            '右转': 'images/工地数字导航小程序切图/司机/2X/导航/右转.png',
            '掉头': 'images/工地数字导航小程序切图/司机/2X/导航/掉头.png'
        };
        
        // 当前指令
        this.currentInstruction = null;
        this.nextTurnPoint = null;
    }
    
    /**
     * 更新导航引导
     */
    update(userPosition, routeCheck, controller) {
        if (!controller.hasStarted || !userPosition) return;
        
        // 获取当前目标途径点
        const targetWaypoint = this.getCurrentTargetWaypoint(controller);
        if (!targetWaypoint) {
            // 没有途径点，直接导航到终点
            this.guideToDestination(userPosition, controller);
            return;
        }
        
        // 导航到途径点
        this.guideToWaypoint(userPosition, targetWaypoint, controller);
    }
    
    /**
     * 获取当前目标途径点
     */
    getCurrentTargetWaypoint(controller) {
        // 找到最近的未访问途径点
        let nearestWaypoint = null;
        let minDistance = Infinity;
        
        for (let i = controller.currentWaypointIndex; i < controller.waypoints.length; i++) {
            const wp = controller.waypoints[i];
            if (wp.visited) continue;
            
            const distance = controller.getDistance(controller.userPosition, wp.position) * 111000;
            
            if (distance < minDistance) {
                minDistance = distance;
                nearestWaypoint = wp;
                
                // 更新索引（智能适应用户路线选择）
                if (i !== controller.currentWaypointIndex) {
                    console.log(`用户选择了其他路线，目标途径点切换到: ${wp.name}`);
                    controller.currentWaypointIndex = i;
                }
            }
        }
        
        return nearestWaypoint;
    }
    
    /**
     * 引导到途径点
     */
    guideToWaypoint(userPosition, waypoint, controller) {
        // 计算到途径点的距离
        const distance = controller.getDistance(userPosition, waypoint.position) * 111000;
        
        // 查找下一个转向点
        const turnInstruction = this.findNextTurn(userPosition, waypoint, controller);
        
        // 计算剩余路程和时间
        const remaining = this.calculateRemaining(userPosition, controller);
        
        // 更新UI
        if (typeof window.navigationRenderer !== 'undefined') {
            window.navigationRenderer.updateTipCard({
                icon: turnInstruction.icon,
                action: turnInstruction.action,
                distance: turnInstruction.distance,
                remaining: remaining.distance,
                estimatedTime: remaining.time
            });
            
            // 更新底部目的地卡片
            window.navigationRenderer.updateDestinationCard({
                name: waypoint.name,
                org: '',
                distance: distance,
                time: remaining.time
            });
        }
    }
    
    /**
     * 引导到终点
     */
    guideToDestination(userPosition, controller) {
        const destination = controller.routePath[controller.routePath.length - 1];
        const distance = controller.getDistance(userPosition, destination) * 111000;
        
        // 查找下一个转向点
        const turnInstruction = this.findNextTurnToDestination(userPosition, controller);
        
        // 计算剩余路程
        const remaining = this.calculateRemaining(userPosition, controller);
        
        // 更新UI
        if (typeof window.navigationRenderer !== 'undefined') {
            window.navigationRenderer.updateTipCard({
                icon: turnInstruction.icon,
                action: turnInstruction.action,
                distance: turnInstruction.distance,
                remaining: remaining.distance,
                estimatedTime: remaining.time
            });
            
            window.navigationRenderer.updateDestinationCard({
                name: '终点',
                org: '',
                distance: distance,
                time: remaining.time
            });
        }
    }
    
    /**
     * 查找下一个转向点
     */
    findNextTurn(userPosition, target, controller) {
        const path = controller.routePath;
        
        // 找到用户在路径上的位置
        let userIndex = this.findUserPositionOnPath(userPosition, path);
        
        // 向前查找转向点（角度变化超过30度）
        const ANGLE_THRESHOLD = 30;
        const LOOK_AHEAD_DISTANCE = 50; // 向前看50米
        
        let accumulatedDistance = 0;
        let lastDirection = null;
        
        for (let i = userIndex; i < path.length - 2; i++) {
            // 计算当前段的方向
            const currentDirection = this.calculateBearing(path[i], path[i + 1]);
            
            if (lastDirection !== null) {
                const angleDiff = this.getAngleDifference(lastDirection, currentDirection);
                
                if (Math.abs(angleDiff) >= ANGLE_THRESHOLD) {
                    // 找到转向点
                    const distanceToTurn = this.calculatePathDistance(path.slice(userIndex, i + 1)) * 111000;
                    const turnType = this.getTurnType(angleDiff);
                    
                    return {
                        action: turnType,
                        icon: this.iconMap[turnType] || this.iconMap['直行'],
                        distance: Math.round(distanceToTurn),
                        point: path[i + 1]
                    };
                }
            }
            
            lastDirection = currentDirection;
            
            // 累计距离
            const segmentDist = controller.getDistance(path[i], path[i + 1]) * 111000;
            accumulatedDistance += segmentDist;
            
            if (accumulatedDistance > LOOK_AHEAD_DISTANCE) {
                break;
            }
        }
        
        // 没有找到转向点，提示直行
        const distanceToTarget = controller.getDistance(userPosition, target.position) * 111000;
        
        return {
            action: '直行',
            icon: this.iconMap['直行'],
            distance: Math.round(distanceToTarget),
            point: target.position
        };
    }
    
    /**
     * 查找前往终点的转向
     */
    findNextTurnToDestination(userPosition, controller) {
        const destination = controller.routePath[controller.routePath.length - 1];
        return this.findNextTurn(userPosition, { position: destination }, controller);
    }
    
    /**
     * 找到用户在路径上的位置索引
     */
    findUserPositionOnPath(userPosition, path) {
        let minDist = Infinity;
        let bestIndex = 0;
        
        for (let i = 0; i < path.length - 1; i++) {
            const dist = this.getDistance(userPosition, path[i]);
            if (dist < minDist) {
                minDist = dist;
                bestIndex = i;
            }
        }
        
        return bestIndex;
    }
    
    /**
     * 计算剩余距离和时间
     */
    calculateRemaining(userPosition, controller) {
        // 计算用户到路径终点的距离
        const userIndex = this.findUserPositionOnPath(userPosition, controller.routePath);
        const remainingPath = controller.routePath.slice(userIndex);
        const distance = controller.calculatePathDistance(remainingPath);
        
        // 估算时间（假设速度10km/h）
        const SPEED_KMH = 10;
        const time = (distance / 1000) / SPEED_KMH * 60; // 分钟
        
        return {
            distance: distance,
            time: time
        };
    }
    
    /**
     * 判断转向类型
     */
    getTurnType(angleDiff) {
        if (angleDiff > 150 || angleDiff < -150) {
            return '掉头';
        } else if (angleDiff > 30) {
            return '右转';
        } else if (angleDiff < -30) {
            return '左转';
        } else {
            return '直行';
        }
    }
    
    /**
     * 计算角度差异
     */
    getAngleDifference(angle1, angle2) {
        let diff = angle2 - angle1;
        while (diff > 180) diff -= 360;
        while (diff < -180) diff += 360;
        return diff;
    }
    
    /**
     * 计算方位角
     */
    calculateBearing(from, to) {
        const dy = to[1] - from[1];
        const dx = to[0] - from[0];
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        angle = (angle + 90) % 360;
        if (angle < 0) angle += 360;
        return angle;
    }
    
    /**
     * 计算距离
     */
    getDistance(p1, p2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    /**
     * 计算路径距离
     */
    calculatePathDistance(path) {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            total += this.getDistance(path[i], path[i + 1]);
        }
        return total * 111000; // 转换为米
    }
}

// 创建全局实例
window.navigationGuide = new NavigationGuide();



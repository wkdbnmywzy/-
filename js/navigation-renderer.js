// navigation-renderer.js
// 导航UI渲染模块

class NavigationRenderer {
    constructor(map) {
        this.map = map;
        
        // 渲染对象
        this.guideLinePolyline = null;      // 绿色引导虚线
        this.deviatedPathPolyline = null;   // 黄色偏离轨迹
        this.passedPathPolyline = null;     // 灰色已走路径
        
        // UI元素
        this.tipCard = document.getElementById('navigation-tip-card');
        this.completionModal = document.getElementById('navigation-complete-modal');
    }
    
    /**
     * 渲染绿色引导虚线（前往起点）
     */
    renderGuideLine(userPos, startPos) {
        // 移除旧的虚线
        this.removeGuideLine();
        
        // 创建绿色虚线（与路线规划阶段的连接线样式统一）
        this.guideLinePolyline = new AMap.Polyline({
            path: [userPos, startPos],
            strokeColor: '#00C853',      // 深绿色，与导航路线一致
            strokeWeight: 21,            // 21px，与导航路线一致
            strokeOpacity: 0.8,          // 稍微透明
            strokeStyle: 'dashed',       // 虚线
            strokeDasharray: [15, 10],   // 虚线样式：15px实线，10px间隔
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: 149,                 // 比路线稍低，确保路线在上层
            map: this.map
        });
        
        // 更新提示卡片：前往起点
        this.updateTipCard({
            action: '前往起点',
            distance: this.calculateDistance(userPos, startPos),
            icon: 'images/工地数字导航小程序切图/司机/2X/导航/直行.png'
        });
    }
    
    /**
     * 移除引导虚线
     */
    removeGuideLine() {
        if (this.guideLinePolyline) {
            this.map.remove(this.guideLinePolyline);
            this.guideLinePolyline = null;
        }
    }
    
    /**
     * 渲染黄色偏离轨迹
     */
    renderDeviatedPath(deviatedPath) {
        // 移除旧的偏离轨迹
        if (this.deviatedPathPolyline) {
            this.map.remove(this.deviatedPathPolyline);
        }
        
        if (deviatedPath.length < 2) return;
        
        // 创建黄色轨迹
        this.deviatedPathPolyline = new AMap.Polyline({
            path: deviatedPath,
            strokeColor: '#FFD700',      // 黄色
            strokeWeight: 4,
            strokeOpacity: 0.8,
            zIndex: 60,
            map: this.map
        });
        
        // 更新提示：返回路径
        this.updateTipCard({
            action: '请返回路径',
            warning: true
        });
    }
    
    /**
     * 清除偏离轨迹
     */
    clearDeviatedPath() {
        if (this.deviatedPathPolyline) {
            this.map.remove(this.deviatedPathPolyline);
            this.deviatedPathPolyline = null;
        }
    }
    
    /**
     * 清除已走路径
     */
    clearPassedPath() {
        if (this.passedPathPolyline) {
            this.map.remove(this.passedPathPolyline);
            this.passedPathPolyline = null;
        }
    }
    
    /**
     * 渲染已走路径（灰色）
     */
    renderPassedPath(passedPath) {
        if (passedPath.length < 2) {
            // 如果路径太短，移除已有的灰色路径
            if (this.passedPathPolyline) {
                this.map.remove(this.passedPathPolyline);
                this.passedPathPolyline = null;
            }
            return;
        }
        
        if (this.passedPathPolyline) {
            // 更新已有路径
            this.passedPathPolyline.setPath(passedPath);
        } else {
            // 创建新的灰色路径
            this.passedPathPolyline = new AMap.Polyline({
                path: passedPath,
                strokeColor: '#9E9E9E',      // 灰色
                strokeWeight: 8,              // 比绿色路径粗一点，更醒目
                strokeOpacity: 0.9,
                lineJoin: 'round',
                lineCap: 'round',
                zIndex: 170,                  // 层级高于剩余路径
                map: this.map
            });
        }
    }
    
    /**
     * 更新提示卡片
     */
    updateTipCard(info) {
        if (!this.tipCard) return;
        
        // 显示卡片
        this.tipCard.style.display = 'block';
        
        // 更新图标
        const iconImg = document.getElementById('tip-direction-img');
        if (iconImg && info.icon) {
            iconImg.src = info.icon;
            iconImg.alt = info.action || '';
        }
        
        // 更新距离和动作
        const distanceElem = document.getElementById('tip-distance-ahead');
        const actionElem = document.getElementById('tip-action-text');
        
        if (info.distance !== undefined && distanceElem) {
            distanceElem.textContent = Math.round(info.distance);
        }
        
        if (info.action && actionElem) {
            actionElem.textContent = info.action;
        }
        
        // 剩余距离和时间
        if (info.remaining !== undefined) {
            const remainingElem = document.getElementById('tip-remaining-distance');
            const unitElem = document.getElementById('tip-remaining-unit');
            
            if (remainingElem) {
                if (info.remaining >= 1000) {
                    remainingElem.textContent = (info.remaining / 1000).toFixed(1);
                    if (unitElem) unitElem.textContent = 'km';
                } else {
                    remainingElem.textContent = Math.round(info.remaining);
                    if (unitElem) unitElem.textContent = 'm';
                }
            }
        }
        
        if (info.estimatedTime !== undefined) {
            const timeElem = document.getElementById('tip-estimated-time');
            if (timeElem) {
                timeElem.textContent = Math.ceil(info.estimatedTime);
            }
        }
        
        // 警告样式
        if (info.warning) {
            this.tipCard.classList.add('warning');
        } else {
            this.tipCard.classList.remove('warning');
        }
    }
    
    /**
     * 隐藏提示卡片
     */
    hideTipCard() {
        if (this.tipCard) {
            this.tipCard.style.display = 'none';
        }
    }
    
    /**
     * 显示途径点到达提示
     */
    showWaypointArrival(waypointName) {
        // 更新提示卡片显示"途径点XX已到达"
        this.updateTipCard({
            action: `${waypointName}已到达`,
            icon: 'images/工地数字导航小程序切图/司机/2X/导航/导航结束.png',
            distance: 0
        });
        
        // 可以添加音效或震动提示
        console.log(`途径点到达: ${waypointName}`);
    }
    
    /**
     * 显示完成弹窗
     */
    showCompletionModal(distance, duration) {
        if (!this.completionModal) return;
        
        // 更新完成信息
        const distanceElem = document.getElementById('complete-distance');
        const timeElem = document.getElementById('complete-time');
        
        if (distanceElem) {
            distanceElem.textContent = Math.round(distance);
        }
        
        if (timeElem) {
            timeElem.textContent = duration;
        }
        
        // 显示弹窗
        this.completionModal.style.display = 'flex';
        
        // 绑定关闭按钮
        const finishBtn = document.getElementById('complete-finish-btn');
        if (finishBtn) {
            finishBtn.onclick = () => {
                this.hideCompletionModal();
                // 返回主页或重置状态
                window.location.href = 'index.html';
            };
        }
    }
    
    /**
     * 隐藏完成弹窗
     */
    hideCompletionModal() {
        if (this.completionModal) {
            this.completionModal.style.display = 'none';
        }
    }
    
    /**
     * 更新底部目的地信息卡片
     */
    updateDestinationCard(info) {
        const nameElem = document.getElementById('destination-name');
        const orgElem = document.getElementById('destination-org');
        const distanceElem = document.getElementById('destination-distance');
        const timeElem = document.getElementById('destination-time');
        
        if (nameElem && info.name) {
            nameElem.textContent = info.name;
        }
        
        if (orgElem && info.org) {
            orgElem.textContent = info.org;
        }
        
        if (distanceElem && info.distance !== undefined) {
            distanceElem.textContent = Math.round(info.distance);
        }
        
        if (timeElem && info.time !== undefined) {
            timeElem.textContent = Math.ceil(info.time);
        }
        
        // 显示目的地卡片，隐藏路线选择器
        const navCard = document.getElementById('navigation-card');
        if (navCard) {
            navCard.classList.add('navigating');
        }
    }
    
    /**
     * 清理所有渲染对象
     */
    cleanup() {
        this.removeGuideLine();
        this.clearDeviatedPath();
        this.clearPassedPath();
        this.hideTipCard();
    }
    
    // ========== 工具函数 ==========
    
    calculateDistance(p1, p2) {
        const dx = p1[0] - p2[0];
        const dy = p1[1] - p2[1];
        const distance = Math.sqrt(dx * dx + dy * dy) * 111000; // 转换为米
        return distance;
    }
}

// 创建全局实例（在导航页面加载时初始化）
if (typeof navigationMap !== 'undefined') {
    window.navigationRenderer = new NavigationRenderer(navigationMap);
}



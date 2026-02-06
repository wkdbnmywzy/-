/**
 * 管理端 WebSocket 消息推送模块
 * 连接后端 WebSocket 接收实时报警消息
 * 使用 localStorage 锁防止多页面重复连接
 */

const AdminWebSocket = (function() {
    'use strict';

    // 配置
    const CONFIG = {
        wsUrl: 'ws://124.222.203.97:12344/api/ws/notifications',
        reconnectInterval: 5000,  // 重连间隔 5秒
        maxReconnectAttempts: 10,  // 最大重连次数
        enabled: false,  // 暂时禁用，等后端确认
        lockKey: 'ws_connection_lock',
        lockTimeout: 10000  // 锁超时 10秒
    };

    // 状态
    let ws = null;
    let isConnected = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let lockRefreshTimer = null;
    let currentProjectId = null;
    let tabId = Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    /**
     * 尝试获取连接锁（防止多页面重复连接）
     */
    function acquireLock() {
        const lockData = localStorage.getItem(CONFIG.lockKey);
        if (lockData) {
            try {
                const lock = JSON.parse(lockData);
                // 如果锁未过期且不是自己的，放弃连接
                if (lock.tabId !== tabId && (Date.now() - lock.timestamp) < CONFIG.lockTimeout) {
                    return false;
                }
            } catch (e) {}
        }
        // 获取锁
        localStorage.setItem(CONFIG.lockKey, JSON.stringify({
            tabId: tabId,
            timestamp: Date.now()
        }));
        return true;
    }

    /**
     * 刷新锁
     */
    function refreshLock() {
        localStorage.setItem(CONFIG.lockKey, JSON.stringify({
            tabId: tabId,
            timestamp: Date.now()
        }));
    }

    /**
     * 释放锁
     */
    function releaseLock() {
        const lockData = localStorage.getItem(CONFIG.lockKey);
        if (lockData) {
            try {
                const lock = JSON.parse(lockData);
                if (lock.tabId === tabId) {
                    localStorage.removeItem(CONFIG.lockKey);
                }
            } catch (e) {
                localStorage.removeItem(CONFIG.lockKey);
            }
        }
    }

    /**
     * 初始化 WebSocket 连接
     */
    function init() {
        if (!CONFIG.enabled) {
            console.log('[WebSocket] 已禁用，跳过连接');
            return;
        }

        currentProjectId = getProjectId();
        if (!currentProjectId) {
            console.log('[WebSocket] 未找到项目ID，延迟初始化');
            setTimeout(init, 3000);
            return;
        }

        // 尝试获取锁
        if (!acquireLock()) {
            console.log('[WebSocket] 其他页面已持有连接，本页面跳过连接');
            // 定期检查锁是否过期，过期则接管
            setTimeout(init, CONFIG.lockTimeout + 1000);
            return;
        }

        console.log('[WebSocket] 初始化，项目ID:', currentProjectId, '页面ID:', tabId);
        connect();

        // 定时刷新锁
        lockRefreshTimer = setInterval(refreshLock, CONFIG.lockTimeout / 2);
    }

    /**
     * 获取项目ID
     */
    function getProjectId() {
        const projectSelection = sessionStorage.getItem('projectSelection');
        if (projectSelection) {
            try {
                const selection = JSON.parse(projectSelection);
                return selection.projectCode || selection.projectId;
            } catch (e) {}
        }

        const currentUser = sessionStorage.getItem('currentUser');
        if (currentUser) {
            try {
                const user = JSON.parse(currentUser);
                if (user.projects && user.projects.length > 0) {
                    return user.projects[0].projectCode || user.projects[0].id;
                }
            } catch (e) {}
        }

        return null;
    }

    /**
     * 建立 WebSocket 连接
     */
    function connect() {
        if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
            console.log('[WebSocket] 已连接或正在连接中');
            return;
        }

        try {
            const token = sessionStorage.getItem('authToken') || '';

            let wsUrl = CONFIG.wsUrl;
            const params = [];
            if (token) {
                params.push(`token=${encodeURIComponent(token)}`);
            }
            if (currentProjectId) {
                params.push(`project_id=${encodeURIComponent(currentProjectId)}`);
            }
            if (params.length > 0) {
                wsUrl += '?' + params.join('&');
            }

            console.log('[WebSocket] 正在连接:', wsUrl);
            ws = new WebSocket(wsUrl);

            ws.onopen = onOpen;
            ws.onmessage = onMessage;
            ws.onerror = onError;
            ws.onclose = onClose;

        } catch (error) {
            console.error('[WebSocket] 连接失败:', error);
            scheduleReconnect();
        }
    }

    /**
     * 连接成功
     */
    function onOpen(event) {
        console.log('[WebSocket] 连接成功');
        isConnected = true;
        reconnectAttempts = 0;

        // 发送订阅
        subscribe(currentProjectId);
    }

    /**
     * 发送订阅信息
     */
    function subscribe(projectId) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocket] 未连接，无法订阅');
            return;
        }

        // SubscribeCommand 格式
        const subscribeMsg = {
            action: 'subscribe',
            project_ids: [projectId]
        };
        ws.send(JSON.stringify(subscribeMsg));
        console.log('[WebSocket] 已发送订阅:', subscribeMsg);
    }

    /**
     * 收到消息
     */
    function onMessage(event) {
        console.log('[WebSocket] 收到消息:', event.data);

        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.warn('[WebSocket] 消息解析失败:', error);
        }
    }

    /**
     * 处理消息
     */
    function handleMessage(message) {
        const msgType = message.type || message.msgType || message.event;

        switch (msgType) {
            case 'fence_alert':
            case 'fence_enter':
            case 'fence_leave':
            case 'fence_alarm':
            case 'warning':
            case 'alarm':
                handleFenceAlert(message);
                break;

            case 'gps':
            case 'vehicle_update':
            case 'location':
                console.log('[WebSocket] 车辆位置更新:', message);
                break;

            case 'device_status':
                console.log('[WebSocket] 设备状态:', message);
                break;

            case 'subscribed':
            case 'connected':
            case 'pong':
                console.log('[WebSocket] 系统消息:', msgType);
                break;

            default:
                if (message.vehicleId || message.fenceId || message.plateNumber || message.source_id) {
                    handleFenceAlert(message);
                } else {
                    console.log('[WebSocket] 未知消息类型:', message);
                }
        }
    }

    /**
     * 处理围栏报警
     */
    function handleFenceAlert(message) {
        console.warn('[WebSocket] 围栏报警:', message);

        // 提取字段（兼容 PushMessage 和其他格式）
        const data = message.data ? (typeof message.data === 'string' ? JSON.parse(message.data) : message.data) : message;
        const vehicleId = data.vehicleId || data.plateNumber || data.vehicle_id || message.source_id || '未知车辆';
        const fenceId = data.fenceId || data.fence_id || '';
        const fenceName = data.fenceName || data.fence_name || data.areaName || '围栏区域';
        const fenceType = data.fenceType || data.fence_type || data.areaType || 'prohibit';
        const eventType = data.eventType || data.event_type || data.event || 'enter';
        const latitude = data.latitude || data.lat || 0;
        const longitude = data.longitude || data.lng || data.lon || 0;

        // 添加到消息中心
        if (typeof AdminMessageManager !== 'undefined') {
            AdminMessageManager.addFenceAlertMessage(
                vehicleId,
                fenceId,
                fenceName,
                fenceType === 1 || fenceType === 'prohibit' ? 'prohibit' : 'fence',
                eventType === 'leave' || eventType === 'exit' ? 'leave' : 'enter',
                latitude,
                longitude
            );
            console.log('[WebSocket] 报警消息已添加到消息中心');
        }

        // 触发自定义事件
        window.dispatchEvent(new CustomEvent('fenceAlert', {
            detail: message
        }));
    }

    /**
     * 连接错误
     */
    function onError(error) {
        console.error('[WebSocket] 连接错误:', error);
    }

    /**
     * 连接关闭
     */
    function onClose(event) {
        console.log('[WebSocket] 连接关闭, code:', event.code, 'reason:', event.reason);
        isConnected = false;
        ws = null;

        scheduleReconnect();
    }

    /**
     * 安排重连
     */
    function scheduleReconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
        }

        if (reconnectAttempts >= CONFIG.maxReconnectAttempts) {
            console.warn('[WebSocket] 已达到最大重连次数，停止重连');
            releaseLock();
            return;
        }

        reconnectAttempts++;
        console.log(`[WebSocket] ${CONFIG.reconnectInterval / 1000}秒后尝试重连 (${reconnectAttempts}/${CONFIG.maxReconnectAttempts})`);

        reconnectTimer = setTimeout(() => {
            connect();
        }, CONFIG.reconnectInterval);
    }

    /**
     * 断开连接
     */
    function disconnect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (lockRefreshTimer) {
            clearInterval(lockRefreshTimer);
            lockRefreshTimer = null;
        }

        if (ws) {
            ws.close();
            ws = null;
        }

        isConnected = false;
        releaseLock();
        console.log('[WebSocket] 已断开连接');
    }

    /**
     * 发送消息
     */
    function send(data) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.warn('[WebSocket] 未连接，无法发送消息');
            return false;
        }

        const message = typeof data === 'string' ? data : JSON.stringify(data);
        ws.send(message);
        return true;
    }

    // 页面加载后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(init, 500);
        });
    } else {
        setTimeout(init, 500);
    }

    // 页面卸载时断开连接并释放锁
    window.addEventListener('beforeunload', disconnect);

    // 导出API
    return {
        init,
        connect,
        disconnect,
        send,
        subscribe,
        isConnected: () => isConnected
    };

})();

console.log('[WebSocket] 模块已加载');

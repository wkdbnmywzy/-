/**
 * 管理端 WebSocket 消息推送模块
 * 连接后端 WebSocket 接收实时报警消息
 */

const AdminWebSocket = (function() {
    'use strict';

    // 配置
    const CONFIG = {
        wsUrl: 'ws://124.222.203.97:12344/api/ws/notifications',
        reconnectInterval: 5000,  // 重连间隔 5秒
        maxReconnectAttempts: 10,  // 最大重连次数
        enabled: false  // 暂时禁用，等后端准备好后改为 true
    };

    // 状态
    let ws = null;
    let isConnected = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let currentProjectId = null;

    /**
     * 初始化 WebSocket 连接
     */
    function init() {
        // 检查是否启用
        if (!CONFIG.enabled) {
            console.log('[WebSocket] 已禁用，跳过连接');
            return;
        }

        // 获取项目ID
        currentProjectId = getProjectId();
        if (!currentProjectId) {
            console.log('[WebSocket] 未找到项目ID，延迟初始化');
            setTimeout(init, 3000);
            return;
        }

        console.log('[WebSocket] 初始化，项目ID:', currentProjectId);
        connect();
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
            console.log('[WebSocket] 正在连接:', CONFIG.wsUrl);
            ws = new WebSocket(CONFIG.wsUrl);

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

        // 发送订阅信息（项目ID）
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

        // 发送订阅消息
        const subscribeMsg = {
            type: 'subscribe',
            projectId: projectId
        };

        ws.send(JSON.stringify(subscribeMsg));
        console.log('[WebSocket] 已发送订阅:', projectId);
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
        // 根据消息类型处理
        const msgType = message.type || message.msgType || message.event;

        switch (msgType) {
            case 'fence_alert':
            case 'fence_enter':
            case 'fence_leave':
            case 'warning':
            case 'alarm':
                // 围栏报警消息
                handleFenceAlert(message);
                break;

            case 'vehicle_update':
            case 'location':
                // 车辆位置更新（可选处理）
                console.log('[WebSocket] 车辆位置更新:', message);
                break;

            case 'subscribed':
            case 'connected':
            case 'pong':
                // 系统消息
                console.log('[WebSocket] 系统消息:', msgType);
                break;

            default:
                // 尝试作为报警消息处理
                if (message.vehicleId || message.fenceId || message.plateNumber) {
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

        // 提取字段（兼容不同格式）
        const vehicleId = message.vehicleId || message.plateNumber || message.vehicle_id || '未知车辆';
        const fenceId = message.fenceId || message.fence_id || '';
        const fenceName = message.fenceName || message.fence_name || message.areaName || '围栏区域';
        const fenceType = message.fenceType || message.fence_type || message.areaType || 'prohibit';
        const eventType = message.eventType || message.event_type || message.event || 'enter';
        const latitude = message.latitude || message.lat || 0;
        const longitude = message.longitude || message.lng || message.lon || 0;

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

        // 触发自定义事件（供其他模块监听）
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

        // 尝试重连
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

        if (ws) {
            ws.close();
            ws = null;
        }

        isConnected = false;
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

    // 页面卸载时断开连接
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

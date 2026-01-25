/**
 * 管理端消息管理模块
 * 功能：存储、读取、标记已读围栏报警等消息
 */

const AdminMessageManager = (function() {
    'use strict';

    // 消息存储键
    const STORAGE_KEY = 'admin_messages';
    const MAX_MESSAGES = 100; // 最多保存100条消息

    // 消息类型
    const MESSAGE_TYPES = {
        FENCE_ENTER_PROHIBIT: 'fence_enter_prohibit',  // 进入禁行区
        FENCE_LEAVE_SITE: 'fence_leave_site'           // 离开工地范围
    };

    /**
     * 获取所有消息
     * @returns {Array}
     */
    function getMessages() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('[消息管理器] 读取消息失败:', error);
            return [];
        }
    }

    /**
     * 保存消息列表
     * @param {Array} messages
     */
    function saveMessages(messages) {
        try {
            // 限制消息数量
            if (messages.length > MAX_MESSAGES) {
                messages = messages.slice(0, MAX_MESSAGES);
            }
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        } catch (error) {
            console.error('[消息管理器] 保存消息失败:', error);
        }
    }

    /**
     * 添加新消息
     * @param {Object} message - 消息对象
     */
    function addMessage(message) {
        const messages = getMessages();

        const newMessage = {
            id: generateId(),
            type: message.type,
            title: message.title,
            content: message.content,
            vehicleId: message.vehicleId,
            fenceId: message.fenceId,
            fenceName: message.fenceName,
            latitude: message.latitude,
            longitude: message.longitude,
            timestamp: new Date().toISOString(),
            read: false
        };

        // 添加到列表开头（最新的在前面）
        messages.unshift(newMessage);
        saveMessages(messages);

        console.log('[消息管理器] 新消息已添加:', newMessage);

        // 触发消息更新事件
        dispatchMessageEvent();

        return newMessage;
    }

    /**
     * 添加围栏报警消息
     * @param {string} vehicleId - 车辆ID
     * @param {string} fenceId - 围栏ID
     * @param {string} fenceName - 围栏名称
     * @param {string} fenceType - 围栏类型
     * @param {string} eventType - 事件类型 enter/leave
     * @param {number} latitude - 纬度
     * @param {number} longitude - 经度
     */
    function addFenceAlertMessage(vehicleId, fenceId, fenceName, fenceType, eventType, latitude, longitude) {
        let type, title, content;

        if (fenceType === 'prohibit' && eventType === 'enter') {
            type = MESSAGE_TYPES.FENCE_ENTER_PROHIBIT;
            title = '禁行区警告';
            content = `车辆 ${vehicleId} 已进入禁行区域「${fenceName}」，请及时处理！`;
        } else if (fenceType === 'fence' && eventType === 'leave') {
            type = MESSAGE_TYPES.FENCE_LEAVE_SITE;
            title = '离开工地警告';
            content = `固定车辆 ${vehicleId} 已离开工地范围「${fenceName}」`;
        } else {
            // 其他类型暂不处理
            return null;
        }

        return addMessage({
            type,
            title,
            content,
            vehicleId,
            fenceId,
            fenceName,
            latitude,
            longitude
        });
    }

    /**
     * 获取未读消息数量
     * @returns {number}
     */
    function getUnreadCount() {
        const messages = getMessages();
        return messages.filter(m => !m.read).length;
    }

    /**
     * 标记消息为已读
     * @param {string} messageId - 消息ID
     */
    function markAsRead(messageId) {
        const messages = getMessages();
        const message = messages.find(m => m.id === messageId);
        if (message) {
            message.read = true;
            saveMessages(messages);
            dispatchMessageEvent();
        }
    }

    /**
     * 标记所有消息为已读
     */
    function markAllAsRead() {
        const messages = getMessages();
        messages.forEach(m => m.read = true);
        saveMessages(messages);
        dispatchMessageEvent();
    }

    /**
     * 删除消息
     * @param {string} messageId - 消息ID
     */
    function deleteMessage(messageId) {
        let messages = getMessages();
        messages = messages.filter(m => m.id !== messageId);
        saveMessages(messages);
        dispatchMessageEvent();
    }

    /**
     * 清空所有消息
     */
    function clearAllMessages() {
        saveMessages([]);
        dispatchMessageEvent();
    }

    /**
     * 生成唯一ID
     */
    function generateId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 触发消息更新事件
     */
    function dispatchMessageEvent() {
        const event = new CustomEvent('messageUpdated', {
            detail: {
                unreadCount: getUnreadCount(),
                totalCount: getMessages().length
            }
        });
        window.dispatchEvent(event);
    }

    /**
     * 格式化时间显示
     * @param {string} isoString - ISO时间字符串
     * @returns {string}
     */
    function formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        // 1分钟内
        if (diff < 60 * 1000) {
            return '刚刚';
        }
        // 1小时内
        if (diff < 60 * 60 * 1000) {
            return Math.floor(diff / (60 * 1000)) + '分钟前';
        }
        // 今天
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        // 昨天
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        }
        // 更早
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' +
               date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * 获取消息图标
     * @param {string} type - 消息类型
     * @returns {string}
     */
    function getMessageIcon(type) {
        switch (type) {
            case MESSAGE_TYPES.FENCE_ENTER_PROHIBIT:
                return 'images/工地数字导航小程序切图/管理/2X/我的/警告-红.png';
            case MESSAGE_TYPES.FENCE_LEAVE_SITE:
                return 'images/工地数字导航小程序切图/管理/2X/我的/警告-橙.png';
            default:
                return 'images/工地数字导航小程序切图/管理/2X/我的/消息.png';
        }
    }

    // 导出API
    return {
        getMessages,
        addMessage,
        addFenceAlertMessage,
        getUnreadCount,
        markAsRead,
        markAllAsRead,
        deleteMessage,
        clearAllMessages,
        formatTime,
        getMessageIcon,
        MESSAGE_TYPES
    };
})();

console.log('[消息管理器] 模块已加载');

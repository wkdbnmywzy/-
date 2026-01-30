/**
 * 管理端导航栏未读消息徽标
 * 在"我的"图标旁边显示未读消息数量
 */

(function() {
    'use strict';

    /**
     * 初始化未读消息徽标
     */
    function initNavBadge() {
        // 找到"我的"导航项
        const profileNavItem = document.querySelector('.nav-item[data-page="admin-profile"]');
        if (!profileNavItem) {
            console.log('[导航徽标] 未找到"我的"导航项');
            return;
        }

        // 检查是否已经添加过徽标
        if (profileNavItem.querySelector('.nav-badge')) {
            return;
        }

        // 设置导航项为相对定位
        profileNavItem.style.position = 'relative';

        // 创建徽标元素
        const badge = document.createElement('span');
        badge.className = 'nav-badge';
        badge.style.cssText = `
            position: absolute;
            top: 2px;
            right: 50%;
            transform: translateX(18px);
            min-width: 16px;
            height: 16px;
            background: #FF4D4F;
            color: white;
            font-size: 10px;
            font-weight: bold;
            border-radius: 8px;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            box-sizing: border-box;
            z-index: 10;
        `;

        profileNavItem.appendChild(badge);

        // 更新徽标显示
        updateNavBadge();

        // 监听消息更新事件
        window.addEventListener('messageUpdated', function(e) {
            updateNavBadge();
        });

        console.log('[导航徽标] 初始化完成');
    }

    /**
     * 更新徽标显示
     */
    function updateNavBadge() {
        const badge = document.querySelector('.nav-item[data-page="admin-profile"] .nav-badge');
        if (!badge) return;

        // 获取未读消息数量
        let unreadCount = 0;
        if (typeof AdminMessageManager !== 'undefined') {
            unreadCount = AdminMessageManager.getUnreadCount();
        }

        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            // 延迟执行，确保导航栏已渲染
            setTimeout(initNavBadge, 200);
        });
    } else {
        setTimeout(initNavBadge, 200);
    }

    // 暴露更新函数供外部调用
    window.updateNavBadge = updateNavBadge;

})();

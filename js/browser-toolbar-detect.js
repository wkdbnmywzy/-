// browser-toolbar-detect.js
// 适配浏览器底部工具栏高度
// 此脚本应在所有页面中尽早引入
//
// 2024更新：统一不上移，方便小程序中显示
// 如需在浏览器中使用，用户可手动调用 setToolbarHeight(56) 调整

(function() {
    'use strict';

    /**
     * 检测运行环境并设置底部工具栏高度
     * 统一返回0，不再区分浏览器类型
     */
    function detectBrowserToolbarHeight() {
        // 统一不上移，适配小程序环境
        var toolbarHeight = 0;
        console.log('[Toolbar] 统一模式，不上移底部导航栏');

        applyToolbarHeight(toolbarHeight);
        return toolbarHeight;
    }

    /**
     * 应用底部工具栏高度
     */
    function applyToolbarHeight(height) {
        // 设置 CSS 变量
        document.documentElement.style.setProperty('--browser-toolbar-height', height + 'px');

        // 更新所有底部导航栏
        var bottomNavs = document.querySelectorAll('.bottom-nav');
        for (var i = 0; i < bottomNavs.length; i++) {
            bottomNavs[i].style.bottom = height + 'px';
        }

        // 更新底部卡片（如果存在）
        var bottomCard = document.querySelector('.bottom-card');
        if (bottomCard) {
            bottomCard.style.bottom = (height + 76) + 'px';
        }

        // 更新管理端底部卡片
        var adminBottomCard = document.querySelector('.admin-bottom-card');
        if (adminBottomCard) {
            adminBottomCard.style.setProperty('--toolbar-offset', height + 'px');
        }

        console.log('[Toolbar] 应用高度:', height + 'px');
    }

    /**
     * 初始化
     */
    function init() {
        detectBrowserToolbarHeight();

        // 监听屏幕方向变化
        window.addEventListener('orientationchange', function() {
            setTimeout(detectBrowserToolbarHeight, 300);
        });
    }

    // 导出到全局（方便手动调用或调试）
    window.detectBrowserToolbarHeight = detectBrowserToolbarHeight;
    window.applyToolbarHeight = applyToolbarHeight;
    // 手动设置高度的便捷方法
    window.setToolbarHeight = function(height) {
        console.log('[Toolbar] 手动设置高度:', height);
        applyToolbarHeight(height);
    };

    // 页面加载时执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // 页面完全加载后再次应用（确保元素都已创建）
    window.addEventListener('load', function() {
        setTimeout(detectBrowserToolbarHeight, 100);
    });
})();

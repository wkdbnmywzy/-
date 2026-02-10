// browser-toolbar-detect.js
// 适配浏览器底部工具栏高度
// 此脚本应在所有页面中尽早引入

(function() {
    'use strict';

    /**
     * 检测运行环境并设置底部工具栏高度
     */
    function detectBrowserToolbarHeight() {
        var ua = navigator.userAgent;
        var toolbarHeight = 0;

        // 1. 检测小程序环境 - 没有浏览器工具栏
        var isWechatMiniProgram = /MicroMessenger/i.test(ua) && (/miniProgram/i.test(ua) || window.__wxjs_environment === 'miniprogram');
        var isAlipayMiniProgram = /AlipayClient/i.test(ua) && /MiniProgram/i.test(ua);
        var isMiniProgram = isWechatMiniProgram || isAlipayMiniProgram;

        // 2. 检测是否是 PWA 或添加到主屏幕 - 没有浏览器工具栏
        var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                          window.matchMedia('(display-mode: fullscreen)').matches ||
                          window.navigator.standalone === true;

        // 3. 检测设备类型
        var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        var isIOS = /iPhone|iPad|iPod/i.test(ua);
        var isAndroid = /Android/i.test(ua);

        // 4. 检测是否是电脑开发者工具模拟
        var isDevTools = !isMobile && window.innerWidth <= 480;

        // 5. 检测具体浏览器
        var isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);
        var isChrome = /Chrome/i.test(ua);
        var isFirefox = /Firefox/i.test(ua);
        var isUCBrowser = /UCBrowser/i.test(ua);
        var isQQBrowser = /MQQBrowser/i.test(ua);

        // 根据环境决定工具栏高度
        if (isMiniProgram) {
            toolbarHeight = 0;
            console.log('[Toolbar] 小程序环境');
        } else if (isStandalone) {
            toolbarHeight = 0;
            console.log('[Toolbar] PWA/主屏幕应用');
        } else if (isDevTools) {
            toolbarHeight = 0;
            console.log('[Toolbar] 开发者工具模拟');
        } else if (!isMobile) {
            toolbarHeight = 0;
            console.log('[Toolbar] 桌面浏览器');
        } else {
            // 真实移动端浏览器 - 根据浏览器类型设置固定值
            if (isIOS) {
                if (isSafari) {
                    // iOS Safari 底部工具栏约 44px（不含安全区域）
                    toolbarHeight = 44;
                } else {
                    // iOS 上的其他浏览器（Chrome、Firefox等）工具栏较小
                    toolbarHeight = 44;
                }
            } else if (isAndroid) {
                if (isChrome) {
                    // Android Chrome 底部工具栏约 56px
                    toolbarHeight = 56;
                } else if (isUCBrowser || isQQBrowser) {
                    // UC浏览器、QQ浏览器工具栏较大
                    toolbarHeight = 60;
                } else if (isFirefox) {
                    // Firefox 工具栏
                    toolbarHeight = 50;
                } else {
                    // 其他 Android 浏览器使用默认值
                    toolbarHeight = 50;
                }
            } else {
                // 其他移动设备
                toolbarHeight = 50;
            }
            console.log('[Toolbar] 移动端浏览器: ' + (isIOS ? 'iOS' : 'Android') + ', 工具栏高度: ' + toolbarHeight);
        }

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

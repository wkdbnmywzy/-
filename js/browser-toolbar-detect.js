// browser-toolbar-detect.js
// 检测并适配浏览器底部工具栏高度
// 此脚本应在所有页面中尽早引入

(function() {
    'use strict';

    /**
     * 检测运行环境和浏览器底部工具栏高度
     */
    function detectBrowserToolbarHeight() {
        let toolbarHeight = 0;

        // 1. 检测小程序环境
        const ua = navigator.userAgent;
        const isWechatMiniProgram = /MicroMessenger/i.test(ua) && (/miniProgram/i.test(ua) || window.__wxjs_environment === 'miniprogram');
        const isAlipayMiniProgram = /AlipayClient/i.test(ua) && /MiniProgram/i.test(ua);
        const isMiniProgram = isWechatMiniProgram || isAlipayMiniProgram;

        // 2. 检测是否是 PWA 或添加到主屏幕
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                            window.matchMedia('(display-mode: fullscreen)').matches ||
                            window.navigator.standalone === true;

        // 3. 检测是否是桌面浏览器（非移动设备）
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

        // 4. 检测是否是开发者工具模拟器（通过检查一些特征）
        const isDevTools = (function() {
            // 开发者工具模拟手机时，通常 window.outerWidth 会比 screen.width 小很多
            // 或者可以检测是否有特定的调试标记
            if (!isMobile && window.innerWidth <= 480) {
                // 桌面浏览器但窗口很窄，可能是开发者工具模拟
                return true;
            }
            return false;
        })();

        if (isMiniProgram) {
            // 小程序环境：没有浏览器工具栏
            toolbarHeight = 0;
            console.log('[Toolbar] 小程序环境，底部高度: 0');
        } else if (isStandalone) {
            // PWA/主屏幕应用：没有浏览器工具栏
            toolbarHeight = 0;
            console.log('[Toolbar] PWA/主屏幕应用，底部高度: 0');
        } else if (!isMobile || isDevTools) {
            // 桌面浏览器或开发者工具模拟：没有底部工具栏
            toolbarHeight = 0;
            console.log('[Toolbar] 桌面浏览器/开发工具，底部高度: 0');
        } else {
            // 真实移动端浏览器：尝试动态检测
            toolbarHeight = detectMobileToolbar();
        }

        applyToolbarHeight(toolbarHeight);
        return toolbarHeight;
    }

    /**
     * 在真实移动端浏览器中检测工具栏高度
     */
    function detectMobileToolbar() {
        let toolbarHeight = 0;

        if (window.visualViewport) {
            const diff = Math.round(window.innerHeight - window.visualViewport.height);

            // 差值在合理范围内（10-80px）认为是底部工具栏
            if (diff >= 10 && diff <= 80) {
                toolbarHeight = diff;
            } else if (diff < 10) {
                // 可能是全屏或隐藏了工具栏
                toolbarHeight = 0;
            } else {
                // 差值太大，可能是键盘弹出，使用默认值
                toolbarHeight = 50;
            }

            console.log('[Toolbar] visualViewport 检测，innerHeight:', window.innerHeight,
                        'viewportHeight:', window.visualViewport.height, '差值:', diff, '结果:', toolbarHeight);

            // 监听 viewport 变化
            window.visualViewport.addEventListener('resize', function() {
                const newDiff = Math.round(window.innerHeight - window.visualViewport.height);
                let newHeight = 0;

                if (newDiff >= 10 && newDiff <= 80) {
                    newHeight = newDiff;
                } else if (newDiff < 10) {
                    newHeight = 0;
                }
                // 差值太大时不更新（可能是键盘）

                if (newHeight !== toolbarHeight && newDiff < 100) {
                    toolbarHeight = newHeight;
                    applyToolbarHeight(toolbarHeight);
                    console.log('[Toolbar] viewport 变化，新高度:', toolbarHeight);
                }
            });
        } else {
            // 不支持 visualViewport，使用固定值
            // iOS Safari 底部工具栏约 44-50px
            // Android Chrome 底部工具栏约 56px
            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            toolbarHeight = isIOS ? 44 : 50;
            console.log('[Toolbar] 无 visualViewport，使用默认值:', toolbarHeight);
        }

        return toolbarHeight;
    }

    /**
     * 应用底部工具栏高度
     */
    function applyToolbarHeight(height) {
        // 设置 CSS 变量
        document.documentElement.style.setProperty('--browser-toolbar-height', height + 'px');

        // 更新所有底部导航栏
        const bottomNavs = document.querySelectorAll('.bottom-nav');
        bottomNavs.forEach(function(nav) {
            nav.style.bottom = height + 'px';
        });

        // 更新底部卡片（如果存在）
        const bottomCard = document.querySelector('.bottom-card');
        if (bottomCard) {
            // 导航栏高度 76px (60px + 8px padding * 2)
            bottomCard.style.bottom = (height + 76) + 'px';
        }

        // 更新管理端底部卡片
        const adminBottomCard = document.querySelector('.admin-bottom-card');
        if (adminBottomCard) {
            adminBottomCard.style.setProperty('--toolbar-offset', height + 'px');
        }

        console.log('[Toolbar] 应用高度:', height + 'px');
    }

    // 导出到全局
    window.detectBrowserToolbarHeight = detectBrowserToolbarHeight;
    window.applyToolbarHeight = applyToolbarHeight;

    // 页面加载时执行检测
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', detectBrowserToolbarHeight);
    } else {
        detectBrowserToolbarHeight();
    }

    // 页面完全加载后再次检测（确保准确）
    window.addEventListener('load', function() {
        setTimeout(detectBrowserToolbarHeight, 100);
    });

    // 屏幕方向变化时重新检测
    window.addEventListener('orientationchange', function() {
        setTimeout(detectBrowserToolbarHeight, 300);
    });

    // 窗口大小变化时重新检测
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(detectBrowserToolbarHeight, 200);
    });
})();

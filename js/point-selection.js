// point-selection.js
// 全屏点选择面板管理

// 全局变量
let searchHistory = [];
let currentActiveInput = null;
let currentInputType = ''; // 'start', 'end', 'waypoint'
let pickerPreferBelow = false; // 本页会话内，是否优先在下方显示"添加途径点"
let hideBelowAddSection = false; // 是否隐藏下方"添加途径点"区域（点击完成后）
const MAX_WAYPOINTS = 5; // 最大途经点数量

// 更新途经点提示文字
function updateWaypointHint() {
    const waypointsContainer = document.getElementById('picker-waypoints-container');
    const hintEl = document.getElementById('picker-waypoint-hint');
    if (!hintEl) return;

    const currentCount = waypointsContainer ? waypointsContainer.querySelectorAll('.picker-waypoint-row').length : 0;
    const remaining = MAX_WAYPOINTS - currentCount;

    if (remaining > 0) {
        hintEl.textContent = `还可添加${remaining}个途径点`;
    } else {
        hintEl.textContent = '已达到最大途径点数量';
    }
}

// 获取当前项目名称
function getProjectName() {
    try {
        const projectSelection = sessionStorage.getItem('projectSelection');
        if (projectSelection) {
            const selection = JSON.parse(projectSelection);
            return selection.project || '';
        }
    } catch (e) { /* ignore */ }
    return '';
}

// 判断是否处于"目的地输入"上下文
function isDestinationContext() {
    if (currentInputType === 'end') return true;
    try {
        const stored = sessionStorage.getItem('routePlanningData');
        if (stored) {
            const data = JSON.parse(stored);
            if (data && data.inputType === 'end') return true;
        }
    } catch (e) {
        // ignore
    }
    return false;
}

// 初始化点选择面板
function initPointSelectionPanel() {
    setupPickerEventListeners();
    loadSearchHistory();
    updateWaypointHint(); // 初始化时更新提示
}

// 设置面板事件监听器
function setupPickerEventListeners() {
    const startLocationInput = document.getElementById('start-location');
    const endLocationInput = document.getElementById('end-location');
    const pickerPanel = document.getElementById('point-picker-panel');
    const pickerCompleteBtn = document.getElementById('picker-complete-btn');
    const pickerAddWaypointBtn = document.getElementById('picker-add-waypoint-btn');
    const pickerAddWaypointBtnRight = document.getElementById('picker-add-waypoint-btn-right');
    const pickerAddWaypointRightCtrl = document.getElementById('picker-add-waypoint-right');
    const pickerAddWaypointSection = document.getElementById('picker-add-waypoint-section');
    const pickerStartInput = document.getElementById('picker-start-location');
    const pickerEndInput = document.getElementById('picker-end-location');
    const pickerLocationInputs = document.querySelector('.picker-location-inputs');

    // 起点输入框点击事件
    if (startLocationInput) {
        startLocationInput.addEventListener('click', function() {
            // 如果是切换输入框，恢复默认显示
            if (currentInputType !== '' && currentInputType !== 'start') {
                restoreDefaultDisplay();
            }
            currentActiveInput = 'start-location';
            currentInputType = 'start';
            showPickerPanel();
        });
    }

    // 终点输入框点击事件
    if (endLocationInput) {
        endLocationInput.addEventListener('click', function() {
            // 如果是切换输入框，恢复默认显示
            if (currentInputType !== '' && currentInputType !== 'end') {
                restoreDefaultDisplay();
            }
            currentActiveInput = 'end-location';
            currentInputType = 'end';
            showPickerPanel();
        });
    }

    // 面板内起点输入框焦点事件
    if (pickerStartInput) {
        let searchTimer;

        // 焦点事件 - 切换输入框时恢复默认显示
        pickerStartInput.addEventListener('focus', function() {
            // 【修复】如果输入类型被锁定，不要改变
            if (inputTypeLocked) {
                console.log('[起点焦点] 输入类型已锁定，跳过');
                return;
            }
            if (currentInputType !== 'start') {
                restoreDefaultDisplay();
                currentInputType = 'start';
                currentActiveInput = 'start-location';
                console.log('[起点焦点] 切换到起点输入');
            }
        });

        // 输入事件
        pickerStartInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            const keyword = this.value.trim();
            searchTimer = setTimeout(() => {
                if (keyword) {
                    // 实时搜索并显示结果
                    console.log('搜索起点:', keyword);
                    searchAndDisplayResults(keyword);
                } else {
                    // 如果输入为空，恢复默认显示
                    restoreDefaultDisplay();
                }
            }, 300);
        });

        // 回车键确认选择
        pickerStartInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const keyword = this.value.trim();
                if (keyword) {
                    autoSelectLocation(keyword, 'start');
                }
            }
        });
    }

    // 面板内终点输入框焦点事件
    if (pickerEndInput) {
        let searchTimer;

        // 焦点事件 - 切换输入框时恢复默认显示
        pickerEndInput.addEventListener('focus', function() {
            // 【修复】如果输入类型被锁定，不要改变
            if (inputTypeLocked) {
                console.log('[终点焦点] 输入类型已锁定，跳过');
                return;
            }
            if (currentInputType !== 'end') {
                restoreDefaultDisplay();
                currentInputType = 'end';
                currentActiveInput = 'end-location';
                console.log('[终点焦点] 切换到终点输入');
            }
        });

        // 输入事件
        pickerEndInput.addEventListener('input', function() {
            clearTimeout(searchTimer);
            const keyword = this.value.trim();
            searchTimer = setTimeout(() => {
                if (keyword) {
                    // 实时搜索并显示结果
                    console.log('搜索终点:', keyword);
                    searchAndDisplayResults(keyword);
                } else {
                    // 如果输入为空，恢复默认显示
                    restoreDefaultDisplay();
                }
            }, 300);
        });

        // 回车键确认选择
        pickerEndInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const keyword = this.value.trim();
                if (keyword) {
                    autoSelectLocation(keyword, 'end');
                }
            }
        });
    }

    // 监听途经点输入框的动态添加
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('waypoint-input')) {
            currentActiveInput = e.target.id || 'waypoint-input';
            currentInputType = 'waypoint';
            showPickerPanel();
        }
    });

    // 完成按钮
    if (pickerCompleteBtn) {
        pickerCompleteBtn.addEventListener('click', function() {
            // 在完成前，确保同步面板输入值到底部卡片
            syncPickerInputsToMainInputs();
            completeRouteSelection();
        });
    }

    // 添加途经点按钮（面板内，下方）- 在“请输入目的地”下面插入内联编辑行
    if (pickerAddWaypointBtn) {
        pickerAddWaypointBtn.addEventListener('click', function() {
            handlePickerAddWaypointClick('below');
        });
    }
    // 右侧悬浮按钮同样触发添加
    if (pickerAddWaypointBtnRight) {
        pickerAddWaypointBtnRight.addEventListener('click', function() {
            // 切换为“下方添加”模式
            pickerPreferBelow = true;
            const below = document.getElementById('picker-add-waypoint-section');
            const right = document.getElementById('picker-add-waypoint-right');
            const contentEl = document.querySelector('.picker-content');
            if (below) below.style.display = '';
            if (right) right.style.display = 'none';
            if (contentEl) contentEl.classList.remove('has-right-add');
            handlePickerAddWaypointClick('right');
        });
    }

    // 根据进入来源调整控件：
    // - 从首页点击“添加途径点”或处于途径点上下文：显示下方，隐藏右侧
    // - 从首页点击“我的位置/请输入目的地”进入：显示右侧，隐藏下方
    try {
        const stored = sessionStorage.getItem('routePlanningData');
        const ref = sessionStorage.getItem('pointSelectionReferrer');
    let showBelow = false;
        let showRight = false;

        if (pickerPreferBelow) {
            showBelow = true;
            showRight = false;
        } else if (stored) {
            const data = JSON.parse(stored);
            if (data && Array.isArray(data.waypoints) && data.waypoints.length > 0) {
                // 已有途径点：显示下方控件
                showBelow = true;
                showRight = false;
            } else if (data && (data.autoAddWaypoint === true || data.inputType === 'waypoint')) {
                showBelow = true;
                showRight = false;
            } else if (data && (data.inputType === 'start' || data.inputType === 'end')) {
                showBelow = false;
                showRight = true;
            } else {
                // 兜底：偏向右侧
                showBelow = false;
                showRight = true;
            }
        } else {
            // 无数据：偏向右侧
            showBelow = false;
            showRight = true;
        }

    // 若用户点击了下方完成，则强制隐藏下方
    if (hideBelowAddSection) showBelow = false;
    if (pickerAddWaypointSection) pickerAddWaypointSection.style.display = showBelow ? '' : 'none';
        if (pickerAddWaypointRightCtrl) pickerAddWaypointRightCtrl.style.display = showRight ? '' : 'none';
        const contentEl = document.querySelector('.picker-content');
        if (contentEl) {
            if (showRight) contentEl.classList.add('has-right-add'); else contentEl.classList.remove('has-right-add');
        }
    } catch (e) {
        // 解析失败时，兜底显示右侧
        const contentEl = document.querySelector('.picker-content');
        if (pickerAddWaypointRightCtrl) pickerAddWaypointRightCtrl.style.display = '';
        if (pickerAddWaypointSection) pickerAddWaypointSection.style.display = 'none';
        if (contentEl) contentEl.classList.add('has-right-add');
    }

    // 点选择面板的转换起点终点按钮
    const pickerSwapBtn = document.getElementById('picker-swap-btn');
    if (pickerSwapBtn) {
        pickerSwapBtn.addEventListener('click', function() {
            console.log('点选择面板：交换起点和终点');
            swapPickerLocations();
        });
    }
}

// 在点位选择界面添加途径点
function addPickerWaypoint(waypointValue) {
    const waypointsContainer = document.getElementById('picker-waypoints-container');
    if (!waypointsContainer) return;

    // 限制最多途经点数量
    const currentCount = waypointsContainer.querySelectorAll('.picker-waypoint-row').length;
    if (currentCount >= MAX_WAYPOINTS) {
        alert(`最多只能添加 ${MAX_WAYPOINTS} 个途经点`);
        return;
    }

    const waypointId = 'picker-waypoint-' + Date.now();
    const waypointRow = document.createElement('div');
    waypointRow.className = 'picker-waypoint-row';
    waypointRow.id = waypointId;

    // 如果提供了初始值，使用它；否则为空
    const initialValue = waypointValue || '';

    waypointRow.innerHTML = `
        <div class="picker-location-row">
            <i class="fas fa-dot-circle"></i>
            <input type="text" placeholder="请输入途经点" class="picker-waypoint-input" id="${waypointId}-input" value="${initialValue}">
        </div>
        <button class="picker-remove-waypoint-btn" data-id="${waypointId}">
            <i class="fas fa-times"></i>
        </button>
    `;

    waypointsContainer.appendChild(waypointRow);

    // 更新提示文字
    updateWaypointHint();

    // 绑定删除事件
    const removeBtn = waypointRow.querySelector('.picker-remove-waypoint-btn');
    removeBtn.addEventListener('click', function() {
        waypointRow.remove();
        // 更新提示文字
        updateWaypointHint();
        // 删除后若数量未达上限且没有内联编辑器，则恢复右侧添加控件
        const count = waypointsContainer.querySelectorAll('.picker-waypoint-row').length;
        if (count < 2 && !document.getElementById('picker-inline-waypoint-editor')) {
            showPickerAddControl();
        }
    });

    // 绑定输入框事件
    const inputEl = waypointRow.querySelector(`#${waypointId}-input`);
    if (inputEl) {
        let searchTimer;

        // 焦点事件
        inputEl.addEventListener('focus', function() {
            // 【修复】如果输入类型被锁定，不要改变
            if (inputTypeLocked) {
                console.log('[途经点焦点] 输入类型已锁定，跳过');
                return;
            }
            currentInputType = 'waypoint';
            currentActiveInput = `${waypointId}-input`;
            console.log('[途经点焦点] 切换到途经点输入:', currentActiveInput);
            if (!this.value.trim()) {
                restoreDefaultDisplay();
            }
        });

        // 输入事件
        inputEl.addEventListener('input', function() {
            clearTimeout(searchTimer);
            const keyword = this.value.trim();
            searchTimer = setTimeout(() => {
                if (keyword) {
                    searchAndDisplayResults(keyword);
                } else {
                    restoreDefaultDisplay();
                }
            }, 300);
        });

        // 回车键确认
        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const keyword = this.value.trim();
                if (keyword) {
                    autoSelectLocation(keyword, 'waypoint');
                }
            }
        });

        // 如果没有初始值，自动聚焦新输入框
        if (!initialValue) {
            setTimeout(() => inputEl.focus(), 50);
        }
    }
}

// ===== 内联“新建途径点”逻辑（目的地下方） =====
const INLINE_PICKER_WAYPOINT_EDITOR_ID = 'picker-inline-waypoint-editor';

function hidePickerAddControl() {
    // 下方保持可用；仅隐藏右侧
    const right = document.getElementById('picker-add-waypoint-right');
    if (right) right.style.display = 'none';
}

function showPickerAddControl() {
    // 根据来源或当前上下文恢复展示位置：
    // 若当前处于途径点编辑上下文（有内联编辑器刚关闭），优先显示下方；
    const below = document.getElementById('picker-add-waypoint-section');
    const right = document.getElementById('picker-add-waypoint-right');
    let preferBelow = !!document.getElementById(INLINE_PICKER_WAYPOINT_EDITOR_ID);

    // 若页面上已经存在途径点，则优先显示下方
    const waypointsContainer = document.getElementById('picker-waypoints-container');
    const domCount = waypointsContainer ? waypointsContainer.querySelectorAll('.picker-waypoint-row').length : 0;
    if (!preferBelow && domCount > 0) {
        preferBelow = true;
    }

    // 本页切换偏好优先
    if (!preferBelow && typeof pickerPreferBelow !== 'undefined' && pickerPreferBelow) {
        preferBelow = true;
    }

    // 若没有内联编辑器，根据进入来源再判断
    if (!preferBelow) {
        try {
            const stored = sessionStorage.getItem('routePlanningData');
            if (stored) {
                const data = JSON.parse(stored);
                if (data && (data.autoAddWaypoint === true || data.inputType === 'waypoint')) {
                    preferBelow = true;
                } else if (data && (data.inputType === 'start' || data.inputType === 'end')) {
                    preferBelow = false;
                }
            }
        } catch (e) { /* ignore */ }
    }

    const contentEl = document.querySelector('.picker-content');
    if (hideBelowAddSection) {
        // 完成后保持隐藏下方
        if (below) below.style.display = 'none';
        if (right) right.style.display = '';
        if (contentEl) contentEl.classList.add('has-right-add');
        return;
    }
    if (below) below.style.display = preferBelow ? '' : 'none';
    if (right) right.style.display = preferBelow ? 'none' : '';
    if (contentEl) {
        if (!preferBelow) contentEl.classList.add('has-right-add'); else contentEl.classList.remove('has-right-add');
    }
}

function handlePickerAddWaypointClick(source) {
    const waypointsContainer = document.getElementById('picker-waypoints-container');
        const currentCount = waypointsContainer ? waypointsContainer.querySelectorAll('.picker-waypoint-row').length : 0;
    if (currentCount >= MAX_WAYPOINTS) {
        alert(`最多只能添加 ${MAX_WAYPOINTS} 个途经点`);
        return;
    }

    // 下方按钮：直接在起点与终点之间添加正式的途径点行
        if (source === 'below') {
            addPickerWaypoint('');
            const inputs = document.querySelectorAll('.picker-waypoint-input');
            const last = inputs[inputs.length - 1];
            if (last) setTimeout(() => last.focus(), 30);
            return;
        }

    // 若已存在内联编辑器则聚焦（兜底逻辑）
    if (document.getElementById(INLINE_PICKER_WAYPOINT_EDITOR_ID)) {
        const input = document.getElementById('picker-inline-waypoint-input');
        if (input) input.focus();
        return;
    }

    // 点击右侧时：切换到“下方添加”模式，并直接添加正式的途径点行（计入数量）
    if (source === 'right') {
        pickerPreferBelow = true;
        const below = document.getElementById('picker-add-waypoint-section');
        const right = document.getElementById('picker-add-waypoint-right');
        const contentEl = document.querySelector('.picker-content');
        if (below) below.style.display = '';
        if (right) right.style.display = 'none';
        if (contentEl) contentEl.classList.remove('has-right-add');
        // 清理可能残留的内联编辑器
        const inlineRow = document.getElementById(INLINE_PICKER_WAYPOINT_EDITOR_ID);
        if (inlineRow) inlineRow.remove();

        // 添加正式途径点行并聚焦
        addPickerWaypoint('');
        const inputs = document.querySelectorAll('.picker-waypoint-input');
        const last = inputs[inputs.length - 1];
        if (last) setTimeout(() => last.focus(), 30);
        return;
    }

    // 其他来源（兜底）：使用目的地下方的内联编辑器
    createInlinePickerWaypointEditor();
}

function createInlinePickerWaypointEditor() {
    const endInput = document.getElementById('picker-end-location');
    const endRow = endInput ? endInput.closest('.picker-location-row') : null;
    if (!endRow) return;

    const row = document.createElement('div');
    row.className = 'picker-inline-waypoint-row';
    row.id = INLINE_PICKER_WAYPOINT_EDITOR_ID;
    row.innerHTML = `
        <div class="picker-location-row">
            <i class="fas fa-dot-circle" style="color:#BDBDBD"></i>
            <input type="text" placeholder="请输入途经点" class="picker-waypoint-input" id="picker-inline-waypoint-input">
        </div>
        <button class="picker-inline-complete-btn" id="picker-inline-complete-btn">完成</button>
    `;

    // 插入到目的地行后面
    endRow.insertAdjacentElement('afterend', row);

    // 不隐藏下方添加控件；若此前展示右侧，已在点击事件中切换为下方

    // 绑定事件
    const inputEl = document.getElementById('picker-inline-waypoint-input');
    const completeBtn = document.getElementById('picker-inline-complete-btn');
    if (inputEl) setTimeout(() => inputEl.focus(), 30);

    if (completeBtn) {
        completeBtn.addEventListener('click', function() {
            const value = (inputEl?.value || '').trim();
            if (!value) {
                alert('请输入途经点');
                inputEl?.focus();
                return;
            }
            // 将值添加到正式途经点容器（目的地上方）
            addPickerWaypoint(value);
            // 移除编辑器
            row.remove();
            // 若未达上限，恢复右侧控件
            const waypointsContainer = document.getElementById('picker-waypoints-container');
            const count = waypointsContainer ? waypointsContainer.querySelectorAll('.picker-waypoint-row').length : 0;
            if (count < 2) {
                showPickerAddControl();
            }
        });
    }
}

// 【核心修复】用于锁定当前输入类型，防止点击过程中被 focus 事件改变
let inputTypeLocked = false;
let lockedInputType = '';
let lockedActiveInput = '';

// 锁定当前输入类型
function lockCurrentInputType() {
    if (!inputTypeLocked) {
        lockedInputType = currentInputType;
        lockedActiveInput = currentActiveInput;
        inputTypeLocked = true;
        console.log('[锁定] 输入类型:', lockedInputType, '活动输入框:', lockedActiveInput);
    }
}

// 解锁并恢复输入类型
function unlockAndRestoreInputType() {
    if (inputTypeLocked) {
        currentInputType = lockedInputType;
        currentActiveInput = lockedActiveInput;
        inputTypeLocked = false;
        console.log('[解锁] 恢复输入类型:', currentInputType);
    }
}

// 分类标签点击事件
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('picker-tag')) {
        // 如果是区块标签（picker-tag-area），不执行选择逻辑，由区块卡片处理
        if (e.target.classList.contains('picker-tag-area')) {
            console.log('点击区块标签，跳过默认选择逻辑');
            return;
        }

        // 建筑标签：执行原有的选择逻辑
        // 先锁定当前输入类型
        lockCurrentInputType();
        const tagName = e.target.textContent;
        // 恢复并使用锁定的输入类型
        unlockAndRestoreInputType();
        selectTagLocation(tagName);
    }
});

// 地点列表项点击事件
document.addEventListener('click', function(e) {
    const locationItem = e.target.closest('.picker-location-item');
    if (locationItem) {
        // 【修复】在处理点击之前，先锁定当前的输入类型
        // 避免点击时触发其他元素的 focus 事件导致 currentInputType 被改变
        lockCurrentInputType();
        
        const locationText = locationItem.querySelector('.picker-location-text')?.textContent ||
                           locationItem.querySelector('.picker-location-name')?.textContent;
        if (locationText) {
            // 恢复锁定的输入类型
            unlockAndRestoreInputType();
            console.log('[点击地点] 使用输入类型:', currentInputType, '活动输入框:', currentActiveInput);
            selectLocationFromPicker(locationText, locationItem);
        } else {
            // 没有文本时也要解锁
            inputTypeLocked = false;
        }
    }
});

// 地点添加按钮点击事件（阻止冒泡，避免触发整行点击）
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('picker-add-icon')) {
        e.stopPropagation();
        // 先锁定当前输入类型
        lockCurrentInputType();
        
        const locationItem = e.target.closest('.picker-location-item');
        const locationText = locationItem?.querySelector('.picker-location-text')?.textContent ||
                           locationItem?.querySelector('.picker-location-name')?.textContent;
        if (locationText) {
            // 恢复锁定的输入类型
            unlockAndRestoreInputType();
            addLocationToCurrent(locationText);
        } else {
            inputTypeLocked = false;
        }
    }
});

// 显示全屏选择面板
function showPickerPanel() {
    // 保存当前路线规划数据
    const startValue = document.getElementById('start-location')?.value || '';
    const endValue = document.getElementById('end-location')?.value || '';

    const waypointsContainer = document.getElementById('waypoints-container');
    const waypoints = [];
    if (waypointsContainer) {
        const waypointInputs = waypointsContainer.querySelectorAll('.waypoint-input');
        waypointInputs.forEach(input => {
            if (input.value) {
                waypoints.push(input.value);
            }
        });
    }

    const routeData = {
        startLocation: startValue,
        endLocation: endValue,
        waypoints: waypoints,
        activeInput: currentActiveInput,
        inputType: currentInputType
    };

    sessionStorage.setItem('routePlanningData', JSON.stringify(routeData));

    // 保存来源页面
    sessionStorage.setItem('pointSelectionReferrer', 'index.html');

    // 跳转到点位选择页面
    window.location.href = 'point-selection.html';
}

// 同步面板输入值到底部卡片输入框
function syncPickerInputsToMainInputs() {
    const pickerStartInput = document.getElementById('picker-start-location');
    const pickerEndInput = document.getElementById('picker-end-location');
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    const pickerWaypointInputs = document.querySelectorAll('.picker-waypoint-input');

    if (pickerStartInput && startInput) {
        startInput.value = pickerStartInput.value.trim();
        console.log('同步起点值:', pickerStartInput.value);
    }
    if (pickerEndInput && endInput) {
        endInput.value = pickerEndInput.value.trim();
        console.log('同步终点值:', pickerEndInput.value);
    }

    // 可选：同步途经点到底部卡片（如果后续在首页展示需要）。
    // 目前导航完成后直接跳转到导航页，此处不同步到底部卡片，仅在完成时写入 routeData。
}

// 隐藏全屏选择面板
function hidePickerPanel() {
    const pickerPanel = document.getElementById('point-picker-panel');
    const pickerStartInput = document.getElementById('picker-start-location');
    const pickerEndInput = document.getElementById('picker-end-location');
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');

    // 同步面板的输入值回底部卡片（总是同步，即使是空值）
    if (pickerStartInput && startInput) {
        startInput.value = pickerStartInput.value;
        console.log('隐藏面板时同步起点值:', pickerStartInput.value);
    }
    if (pickerEndInput && endInput) {
        endInput.value = pickerEndInput.value;
        console.log('隐藏面板时同步终点值:', pickerEndInput.value);
    }

    // 恢复默认显示
    restoreDefaultDisplay();

    pickerPanel.classList.remove('active');
    currentActiveInput = null;
    currentInputType = '';
}

// 保存搜索历史到本地存储
function saveSearchHistory() {
    try {
        const dataToSave = JSON.stringify(searchHistory);
        localStorage.setItem('searchHistory', dataToSave);
        console.log('成功保存搜索历史到localStorage，条目数:', searchHistory.length);
    } catch (e) {
        console.error('保存搜索历史失败:', e);
    }
}

// 添加到搜索历史
function addToSearchHistory(item) {
    if (!item || !item.name) {
        console.warn('无效的搜索历史项');
        return;
    }

    // 【修改】跳过"我的位置"，因为它在顶部标签中固定显示，不需要在历史记录中
    if (item.name === '我的位置') {
        console.log('跳过添加"我的位置"到历史记录');
        return;
    }

    // 检查是否已存在相同的地点
    const existingIndex = searchHistory.findIndex(h => h.name === item.name);

    if (existingIndex !== -1) {
        // 如果已存在，移除旧的并添加到最前面
        searchHistory.splice(existingIndex, 1);
    }

    // 添加到数组开头
    searchHistory.unshift(item);

    // 限制历史记录数量（保留最近20条）
    if (searchHistory.length > 20) {
        searchHistory = searchHistory.slice(0, 20);
    }

    // 保存到本地存储
    saveSearchHistory();

    console.log('已添加到搜索历史:', item.name);
}

// 从本地存储加载搜索历史
function loadSearchHistory() {
    try {
        const stored = localStorage.getItem('searchHistory');

        if (stored && stored !== 'null' && stored !== 'undefined') {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                // 【修改】过滤掉"我的位置"，确保历史记录干净
                searchHistory = parsed.filter(item => item.name !== '我的位置');
                console.log('成功加载搜索历史，条目数:', searchHistory.length);

                // 如果过滤后数量变化了，重新保存一次
                if (searchHistory.length !== parsed.length) {
                    console.log('已过滤掉"我的位置"，重新保存历史记录');
                    saveSearchHistory();
                }
            } else {
                console.warn('localStorage中的搜索历史数据格式不正确');
                searchHistory = [];
            }
        } else {
            console.log('localStorage中没有有效的搜索历史数据');
            searchHistory = [];
        }
    } catch (e) {
        console.error('加载搜索历史失败:', e);
        searchHistory = [];
    }
}

// 选择分类标签位置
function selectTagLocation(tagName) {
    console.log('选择标签位置:', tagName, '当前输入类型:', currentInputType, '活动输入框:', currentActiveInput);

    // 根据当前活动的输入框设置值（兼容选择面板与首页）
    if (currentInputType === 'start') {
        const pickerStartInput = document.getElementById('picker-start-location');
        if (pickerStartInput) pickerStartInput.value = tagName;
        const startInput = document.getElementById('start-location');
        if (startInput) startInput.value = tagName;
        console.log('已更新起点为:', tagName);
    } else if (currentInputType === 'end') {
        const pickerEndInput = document.getElementById('picker-end-location');
        if (pickerEndInput) pickerEndInput.value = tagName;
        const endInput = document.getElementById('end-location');
        if (endInput) endInput.value = tagName;
        console.log('已更新终点为:', tagName);
    } else if (currentInputType === 'waypoint' && currentActiveInput) {
        const waypointInput = document.getElementById(currentActiveInput);
        if (waypointInput) {
            waypointInput.value = tagName;
            console.log('已更新途经点为:', tagName, '输入框ID:', currentActiveInput);
        } else {
            console.warn('[警告] 未找到途经点输入框:', currentActiveInput);
        }
    } else {
        console.warn('[警告] 无效的输入类型:', currentInputType, '将不更新任何输入框');
        return;
    }

    // 添加到搜索历史（标签选择）
    addToSearchHistory({
        name: tagName,
        address: '分类标签',
        position: null,
        type: 'tag'
    });

    // 恢复默认显示
    restoreDefaultDisplay();

    // 提示用户
    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage(`已选择: ${tagName}`);
    }
}

// 从面板选择地点
function selectLocationFromPicker(locationText, locationItem) {
    console.log('从面板选择地点:', locationText);
    console.log('当前输入类型:', currentInputType, '活动输入框:', currentActiveInput);

    // 【调试】打印更新前的值
    const pickerStartBefore = document.getElementById('picker-start-location')?.value;
    const pickerEndBefore = document.getElementById('picker-end-location')?.value;
    console.log('[调试] 更新前 - 起点:', pickerStartBefore, '终点:', pickerEndBefore);

    // 根据当前活动的输入框设置值
    if (currentInputType === 'start') {
        const startInput = document.getElementById('start-location');
        const pickerStartInput = document.getElementById('picker-start-location');

        if (startInput) {
            startInput.value = locationText;
            console.log('已更新起点输入框(start-location)值为:', locationText);
        }
        if (pickerStartInput) {
            pickerStartInput.value = locationText;
            console.log('已更新起点输入框(picker-start-location)值为:', locationText);
        }
        // 【重要】只更新起点，不要动终点
    } else if (currentInputType === 'end') {
        const endInput = document.getElementById('end-location');
        const pickerEndInput = document.getElementById('picker-end-location');

        if (endInput) {
            endInput.value = locationText;
            console.log('已更新终点输入框(end-location)值为:', locationText);
        }
        if (pickerEndInput) {
            pickerEndInput.value = locationText;
            console.log('已更新终点输入框(picker-end-location)值为:', locationText);
        }
        // 【重要】只更新终点，不要动起点
    } else if (currentInputType === 'waypoint' && currentActiveInput) {
        // 处理途径点选择 - 只更新指定的途经点输入框
        const waypointInput = document.getElementById(currentActiveInput);
        if (waypointInput) {
            waypointInput.value = locationText;
            console.log('已更新途径点输入框值为:', locationText, '输入框ID:', currentActiveInput);
        } else {
            console.warn('[警告] 未找到途经点输入框:', currentActiveInput);
        }
        // 【重要】只更新当前途经点，不要动其他输入框
    } else {
        console.warn('[警告] currentInputType 无效:', currentInputType, '将不更新任何输入框');
        return; // 不更新任何输入框
    }

    // 【调试】打印更新后的值
    const pickerStartAfter = document.getElementById('picker-start-location')?.value;
    const pickerEndAfter = document.getElementById('picker-end-location')?.value;
    console.log('[调试] 更新后 - 起点:', pickerStartAfter, '终点:', pickerEndAfter);

    // 如果是"我的位置"，则使用当前定位
    if (locationText === '我的位置') {
        console.log('使用当前位置');
        // 确保currentPosition已定义且有效
        if (typeof currentPosition !== 'undefined' && currentPosition && currentPosition.length === 2) {
            console.log('当前位置坐标:', currentPosition);
        } else {
            console.warn('当前位置未定义或无效，将尝试获取位置');
            // 可以在这里添加获取当前位置的逻辑
        }
    } else {
        // 如果不是"我的位置"，从历史记录或KML中获取完整信息
        const historyItem = searchHistory.find(h => h.name === locationText);
        if (historyItem) {
            // 重新添加到历史（更新时间戳）
            addToSearchHistory(historyItem);
        } else {
            // 如果是新选择的KML点，添加到历史
            const locationType = locationItem?.dataset?.locationType;
            if (locationType === 'kml-point') {
                // 从KML点位中获取详细信息
                if (typeof getAllKMLPoints === 'function') {
                    const kmlResults = getAllKMLPoints('');
                    const kmlPoint = kmlResults.find(p => p.name === locationText);
                    if (kmlPoint) {
                        addToSearchHistory({
                            name: kmlPoint.name,
                            address: kmlPoint.description || getProjectName(),
                            position: kmlPoint.position,
                            type: 'kml-point'
                        });
                    }
                }
            }
        }
    }

    // 恢复默认显示
    restoreDefaultDisplay();

    // 提示用户
    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage(`已选择: ${locationText}`);
    }
}

// 添加地点到当前输入框
function addLocationToCurrent(locationText) {
    console.log('添加地点到当前输入框:', locationText, '当前输入类型:', currentInputType, '活动输入框:', currentActiveInput);

    // 根据当前活动的输入框设置值
    if (currentInputType === 'start') {
        document.getElementById('start-location').value = locationText;
        const pickerStartInput = document.getElementById('picker-start-location');
        if (pickerStartInput) {
            pickerStartInput.value = locationText;
        }
        console.log('已添加到起点:', locationText);
    } else if (currentInputType === 'end') {
        document.getElementById('end-location').value = locationText;
        const pickerEndInput = document.getElementById('picker-end-location');
        if (pickerEndInput) {
            pickerEndInput.value = locationText;
        }
        console.log('已添加到终点:', locationText);
    } else if (currentInputType === 'waypoint' && currentActiveInput) {
        // 处理途径点选择
        const waypointInput = document.getElementById(currentActiveInput);
        if (waypointInput) {
            waypointInput.value = locationText;
            console.log('已添加到途经点:', locationText, '输入框ID:', currentActiveInput);
        } else {
            console.warn('[警告] 未找到途经点输入框:', currentActiveInput);
        }
    } else {
        console.warn('[警告] 无效的输入类型:', currentInputType, '将不添加');
        return;
    }

    // 如果不是"我的位置"，添加到历史
    if (locationText !== '我的位置') {
        const historyItem = searchHistory.find(h => h.name === locationText);
        if (historyItem) {
            // 重新添加到历史（更新时间戳）
            addToSearchHistory(historyItem);
        }
    }

    // 恢复默认显示
    restoreDefaultDisplay();

    // 提示用户
    if (typeof showSuccessMessage === 'function') {
        showSuccessMessage(`已添加: ${locationText}`);
    }
}

// 渲染搜索历史到面板
function renderSearchHistory() {
    const locationList = document.getElementById('picker-location-list');
    if (!locationList) return;

    // 获取"我的位置"元素
    const myLocationItem = locationList.querySelector('.picker-location-item');

    // 清除所有历史项（保留"我的位置"）
    const historyItems = locationList.querySelectorAll('.picker-location-item:not(:first-child)');
    historyItems.forEach(item => item.remove());

    // 终点输入时不显示历史选点记录（仅保留“我的位置”和分类）
    if (isDestinationContext()) {
        console.log('终点输入：隐藏历史记录');
        return;
    }

    // 如果没有搜索历史，直接返回
    if (!searchHistory || searchHistory.length === 0) {
        console.log('没有搜索历史');
        return;
    }

    // 渲染搜索历史（最多显示10条）
    const maxHistory = 10;
    const historyToShow = searchHistory.slice(0, maxHistory);

    historyToShow.forEach(function(historyItem) {
        const item = document.createElement('div');
        item.className = 'picker-location-item';

        // 构建HTML
        const iconHTML = '<img class="icon-history-location" src="images/工地数字导航小程序切图/司机/2X/导航/历史位置.png" alt="历史位置" />';
        const nameText = historyItem.name || '未知地点';
        const addressText = historyItem.address || '';

        item.innerHTML = `
            ${iconHTML}
            <div class="picker-location-info">
                <div class="picker-location-name">${nameText}</div>
                <div class="picker-location-desc">${addressText}</div>
            </div>
            <button class="picker-add-icon" aria-label="添加地点"></button>
        `;

        locationList.appendChild(item);
    });

    console.log(`已渲染 ${historyToShow.length} 条搜索历史`);
}

// 从sessionStorage获取所有KML点位
function getAllKMLPoints(keyword) {
    const kmlDataStr = sessionStorage.getItem('kmlData');
    if (!kmlDataStr) {
        return [];
    }

    try {
        const kmlDataArray = JSON.parse(kmlDataStr);
        const allPoints = [];

        kmlDataArray.forEach(kmlData => {
            if (kmlData.points && Array.isArray(kmlData.points)) {
                kmlData.points.forEach(point => {
                    // 只过滤掉名称为 "New Point" 的点
                    if (point.name && point.name !== 'New Point') {
                        allPoints.push({
                            name: point.name,
                            description: point.description || '',
                            position: point.position,
                            fileName: kmlData.fileName
                        });
                    }
                });
            }
        });

        // 如果提供了关键词，进行过滤
        if (keyword && keyword.trim()) {
            const lowerKeyword = keyword.toLowerCase();
            return allPoints.filter(point => {
                const name = point.name.toLowerCase();
                const desc = (point.description || '').toLowerCase();
                return name.includes(lowerKeyword) || desc.includes(lowerKeyword);
            });
        }

        return allPoints;
    } catch (e) {
        console.error('获取KML点位失败:', e);
        return [];
    }
}

// 搜索并显示结果
function searchAndDisplayResults(keyword) {
    if (!keyword || !keyword.trim()) {
        restoreDefaultDisplay();
        return;
    }

    const lowerKeyword = keyword.toLowerCase();
    const results = [];

    // 搜索KML点位
    if (typeof getAllKMLPoints === 'function') {
        const kmlResults = getAllKMLPoints(keyword);
        kmlResults.forEach(kmlPoint => {
            results.push({
                name: kmlPoint.name,
                address: kmlPoint.description || getProjectName(),
                type: 'kml-point',
                data: kmlPoint
            });
        });
    }

    // 搜索历史记录（终点输入时不加入历史）
    if (!isDestinationContext() && searchHistory && searchHistory.length > 0) {
        searchHistory.forEach(historyItem => {
            const name = historyItem.name.toLowerCase();
            const address = (historyItem.address || '').toLowerCase();

            // 检查是否匹配关键词
            if (name.includes(lowerKeyword) || address.includes(lowerKeyword)) {
                // 避免重复添加（如果KML点位已经在结果中）
                const isDuplicate = results.some(r => r.name === historyItem.name);
                if (!isDuplicate) {
                    results.push({
                        name: historyItem.name,
                        address: historyItem.address || '',
                        type: historyItem.type || 'history',
                        data: historyItem
                    });
                }
            }
        });
    }

    // 显示搜索结果
    displaySearchResults(results, keyword);
}

// 显示搜索结果
function displaySearchResults(results, keyword) {
    const locationList = document.getElementById('picker-location-list');
    const pickerCategories = document.querySelector('.picker-categories');

    if (!locationList) return;

    // 隐藏分类标签
    if (pickerCategories) {
        pickerCategories.style.display = 'none';
    }

    // 清空列表
    locationList.innerHTML = '';

    // 如果没有结果
    if (results.length === 0) {
        locationList.innerHTML = `
            <div class="picker-location-item" style="justify-content: center; color: #999;">
                <div class="picker-location-text">未找到匹配的地点</div>
            </div>
        `;
        return;
    }

    // 渲染搜索结果
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'picker-location-item';

        // 选择图标
        let iconHTML;
        if (result.type === 'kml-point') {
            iconHTML = '<img class="icon-location" src="images/工地数字导航小程序切图/司机/2X/导航/定位-1.png" alt="定位" />';
        } else if (result.type === 'history') {
            iconHTML = '<img class="icon-history-location" src="images/工地数字导航小程序切图/司机/2X/导航/历史位置.png" alt="历史位置" />';
        } else {
            iconHTML = '<img class="icon-location" src="images/工地数字导航小程序切图/司机/2X/导航/定位-1.png" alt="定位" />';
        }

        // 高亮匹配的文本
        const highlightedName = highlightText(result.name, keyword);
        const highlightedAddress = highlightText(result.address, keyword);

        item.innerHTML = `
            ${iconHTML}
            <div class="picker-location-info">
                <div class="picker-location-name">${highlightedName}</div>
                <div class="picker-location-desc">${highlightedAddress}</div>
            </div>
            <button class="picker-add-icon" aria-label="添加地点"></button>
        `;

        // 存储数据到元素
        item.dataset.locationName = result.name;
        item.dataset.locationType = result.type;

        locationList.appendChild(item);
    });

    console.log(`显示 ${results.length} 条搜索结果`);
}

// 高亮匹配的文本
function highlightText(text, keyword) {
    if (!text || !keyword) return text;

    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();

    // 使用正则表达式全局匹配（不区分大小写）
    const regex = new RegExp(escapeRegExp(keyword), 'gi');

    return text.replace(regex, match => {
        return `<span style="color: #5BA8E3; font-weight: 600;">${match}</span>`;
    });
}

// 转义正则表达式特殊字符
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 恢复默认显示（显示分类和历史）
function restoreDefaultDisplay() {
    const pickerCategories = document.querySelector('.picker-categories');
    const locationList = document.getElementById('picker-location-list');

    // 显示分类标签
    if (pickerCategories) {
        pickerCategories.style.display = 'flex';
    }

    // 恢复历史列表
    renderSearchHistory();

    // 重新插入"我的位置"
    if (locationList) {
        // 查找新的图片图标
        const myLocationExists = locationList.querySelector('.icon-my-location');
        if (!myLocationExists) {
            const myLocationItem = document.createElement('div');
            myLocationItem.className = 'picker-location-item';
            myLocationItem.innerHTML = `
                <img class="icon-my-location" src="images/工地数字导航小程序切图/司机/2X/导航/我的位置.png" alt="我的位置" />
                <div class="picker-location-text">我的位置</div>
                <button class="picker-add-icon" aria-label="添加地点"></button>
            `;
            locationList.insertBefore(myLocationItem, locationList.firstChild);
        }
    }
}

// 自动选择匹配的地点（用于回车键确认）
function autoSelectLocation(keyword, inputType) {
    console.log('自动选择地点:', keyword, '类型:', inputType);

    // 首先精确匹配KML点
    if (typeof getAllKMLPoints === 'function') {
        const kmlResults = getAllKMLPoints('');
        const exactMatch = kmlResults.find(p => p.name === keyword);

        if (exactMatch) {
            console.log('找到精确匹配的KML点:', exactMatch.name);

            // 更新输入框
            if (inputType === 'start') {
                document.getElementById('start-location').value = exactMatch.name;
                document.getElementById('picker-start-location').value = exactMatch.name;
            } else if (inputType === 'end') {
                document.getElementById('end-location').value = exactMatch.name;
                document.getElementById('picker-end-location').value = exactMatch.name;
            } else if (inputType === 'waypoint' && currentActiveInput) {
                const wpInput = document.getElementById(currentActiveInput);
                if (wpInput) wpInput.value = exactMatch.name;
            }

            // 添加到搜索历史
            addToSearchHistory({
                name: exactMatch.name,
                address: exactMatch.description || getProjectName(),
                position: exactMatch.position,
                type: 'kml-point'
            });

            // 显示成功消息
            if (typeof showSuccessMessage === 'function') {
                showSuccessMessage(`已选择: ${exactMatch.name}`);
            }

            // 恢复默认显示
            restoreDefaultDisplay();
            return;
        }
    }

    // 检查搜索历史
    if (searchHistory && searchHistory.length > 0) {
        const historyMatch = searchHistory.find(h => h.name === keyword);
        if (historyMatch) {
            console.log('找到历史记录匹配:', historyMatch.name);

            // 更新输入框
            if (inputType === 'start') {
                document.getElementById('start-location').value = historyMatch.name;
                document.getElementById('picker-start-location').value = historyMatch.name;
            } else if (inputType === 'end') {
                document.getElementById('end-location').value = historyMatch.name;
                document.getElementById('picker-end-location').value = historyMatch.name;
            } else if (inputType === 'waypoint' && currentActiveInput) {
                const wpInput = document.getElementById(currentActiveInput);
                if (wpInput) wpInput.value = historyMatch.name;
            }

            // 重新添加到历史（更新时间戳）
            addToSearchHistory(historyMatch);

            // 显示成功消息
            if (typeof showSuccessMessage === 'function') {
                showSuccessMessage(`已选择: ${historyMatch.name}`);
            }

            // 恢复默认显示
            restoreDefaultDisplay();
            return;
        }
    }

    // 如果没有找到匹配
    console.warn('未找到匹配的地点:', keyword);
    alert(`未找到名为"${keyword}"的地点\n请从下方列表中选择或输入完整的地点名称`);
}

// 完成路线选择，跳转到导航界面
function completeRouteSelection() {
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');
    const pickerWaypointInputs = document.querySelectorAll('.picker-waypoint-input');

    let startLocation = startInput ? startInput.value.trim() : '';
    let endLocation = endInput ? endInput.value.trim() : '';

    console.log('完成路线选择，起点:', startLocation, '终点:', endLocation);

    // 验证是否选择了起点和终点
    if (!startLocation) {
        alert('请选择起点');
        return;
    }

    if (!endLocation) {
        alert('请选择终点');
        return;
    }

    // 自动校验起点是否有效（如果是手动输入的，尝试匹配）
    const startPosition = validateAndGetPosition(startLocation);
    if (!startPosition) {
        alert(`起点"${startLocation}"无效\n请从KML点位中选择或输入完整的地点名称`);
        return;
    }

    // 自动校验终点是否有效
    const endPosition = validateAndGetPosition(endLocation);
    if (!endPosition) {
        alert(`终点"${endLocation}"无效\n请从KML点位中选择或输入完整的地点名称`);
        return;
    }

    // 收集途经点（如有）
    const waypointNames = Array.from(pickerWaypointInputs || [])
        .map(input => (input.value || '').trim())
        .filter(v => v);

    const waypointsData = waypointNames.map(name => {
        const pos = getLocationPosition(name);
        return pos ? { name, position: pos } : { name };
    });

    // 准备路线数据
    const routeData = {
        start: {
            name: startLocation,
            position: startPosition
        },
        end: {
            name: endLocation,
            position: endPosition
        },
        waypoints: waypointsData
    };

    console.log('路线数据:', routeData);

    // 保存到sessionStorage
    try {
        sessionStorage.setItem('navigationRoute', JSON.stringify(routeData));
        console.log('路线数据已保存到sessionStorage');

        // 设置导航结束后的返回页面为司机端首页
        sessionStorage.setItem('navigationReferrer', 'index.html');

        // 注意：KML原始数据已在导入时保存到sessionStorage，无需重复保存

        // 跳转到导航页面
        window.location.href = 'navigation.html';
    } catch (e) {
        console.error('保存路线数据失败:', e);
        alert('保存路线数据失败，请重试');
    }
}

// 获取地点的坐标位置
function getLocationPosition(locationName) {
    // 如果是"我的位置"，使用当前位置
    if (locationName === '我的位置') {
        if (typeof currentPosition !== 'undefined' && currentPosition && currentPosition.length === 2) {
            console.log('获取我的位置坐标:', currentPosition);
            return currentPosition;
        } else {
            console.warn('我的位置坐标无效:', currentPosition);
            return null;
        }
    }

    // 从搜索历史中查找
    if (searchHistory && searchHistory.length > 0) {
        const historyItem = searchHistory.find(h => h.name === locationName);
        if (historyItem && historyItem.position) {
            return historyItem.position;
        }
    }

    // 从KML点位中查找
    if (typeof getAllKMLPoints === 'function') {
        const kmlResults = getAllKMLPoints('');
        const kmlPoint = kmlResults.find(p => p.name === locationName);
        if (kmlPoint && kmlPoint.position) {
            return kmlPoint.position;
        }
    }

    // 如果找不到，返回null（导航页面会使用默认位置）
    return null;
}

// 验证地点名称并获取坐标（带校验）
function validateAndGetPosition(locationName) {
    console.log('验证地点:', locationName);

    // 如果是"我的位置"，使用当前位置
    if (locationName === '我的位置') {
        if (typeof currentPosition !== 'undefined' && currentPosition && currentPosition.length === 2) {
            console.log('验证通过: 我的位置, 坐标:', currentPosition);
            return currentPosition;
        } else {
            console.warn('我的位置未定位或坐标无效:', currentPosition);
            alert('我的位置坐标无效，请确保已开启定位权限');
            return null;
        }
    }

    // 从搜索历史中查找
    if (searchHistory && searchHistory.length > 0) {
        const historyItem = searchHistory.find(h => h.name === locationName);
        if (historyItem && historyItem.position) {
            console.log('验证通过: 从搜索历史找到', locationName);
            return historyItem.position;
        }
    }

    // 从KML点位中查找
    if (typeof getAllKMLPoints === 'function') {
        const kmlResults = getAllKMLPoints('');
        const kmlPoint = kmlResults.find(p => p.name === locationName);
        if (kmlPoint && kmlPoint.position) {
            console.log('验证通过: 从KML点位找到', locationName);
            return kmlPoint.position;
        }
    }

    // 如果找不到，返回null
    console.warn('验证失败: 未找到地点', locationName);
    return null;
}

// 点选择面板交换起点和终点
function swapPickerLocations() {
    console.log('点选择面板：交换起点和终点');

    const pickerStartInput = document.getElementById('picker-start-location');
    const pickerEndInput = document.getElementById('picker-end-location');
    const startInput = document.getElementById('start-location');
    const endInput = document.getElementById('end-location');

    if (pickerStartInput && pickerEndInput) {
        // 交换点选择面板的输入框值
        const tempValue = pickerStartInput.value;
        pickerStartInput.value = pickerEndInput.value;
        pickerEndInput.value = tempValue;

        // 同步到主页面的输入框
        if (startInput) {
            startInput.value = pickerStartInput.value;
        }
        if (endInput) {
            endInput.value = pickerEndInput.value;
        }

        console.log('已交换点选择面板的起点和终点');

        // 显示成功提示
        if (typeof showSuccessMessage === 'function') {
            showSuccessMessage('已交换起点和终点');
        }
    } else {
        console.warn('未找到点选择面板的起点或终点输入框');
    }
}

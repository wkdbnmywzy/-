// point-selection.js
// 全屏点选择面板管理

// 全局变量
let searchHistory = [];
let currentActiveInput = null;
let currentInputType = ''; // 'start', 'end', 'waypoint'

// 初始化点选择面板
function initPointSelectionPanel() {
    setupPickerEventListeners();
    loadSearchHistory();
}

// 设置面板事件监听器
function setupPickerEventListeners() {
    const startLocationInput = document.getElementById('start-location');
    const endLocationInput = document.getElementById('end-location');
    const pickerPanel = document.getElementById('point-picker-panel');
    const pickerCompleteBtn = document.getElementById('picker-complete-btn');
    const pickerBackBtn = document.getElementById('picker-back-btn');
    const pickerAddWaypointBtn = document.getElementById('picker-add-waypoint-btn');
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
            if (currentInputType !== 'start') {
                restoreDefaultDisplay();
                currentInputType = 'start';
                currentActiveInput = 'start-location';
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
            if (currentInputType !== 'end') {
                restoreDefaultDisplay();
                currentInputType = 'end';
                currentActiveInput = 'end-location';
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

    // 返回按钮
    if (pickerBackBtn) {
        pickerBackBtn.addEventListener('click', function() {
            hidePickerPanel();
        });
    }

    // 添加途经点按钮（面板内）
    if (pickerAddWaypointBtn) {
        pickerAddWaypointBtn.addEventListener('click', function() {
            // 在“我的位置”(起点)和“请输入目的地”(终点)之间插入一个“请输入途径点”的搜索框
            if (!pickerLocationInputs) return;

            // 限制最多 5 个途经点
            const currentCount = pickerLocationInputs.querySelectorAll('.picker-waypoint-row').length;
            if (currentCount >= 5) {
                alert('最多只能添加 5 个途经点');
                return;
            }

            const endRow = pickerLocationInputs.querySelector('#picker-end-location')?.parentElement;
            const waypointId = 'picker-waypoint-' + Date.now();

            const waypointRow = document.createElement('div');
            waypointRow.className = 'picker-location-row picker-waypoint-row';
            waypointRow.innerHTML = `
                <i class="fas fa-dot-circle picker-waypoint-icon"></i>
                <input type="text" placeholder="请输入途径点" class="picker-waypoint-input" id="${waypointId}">
                <button class="picker-waypoint-remove" title="删除">
                    <i class="fas fa-times"></i>
                </button>
            `;

            if (endRow) {
                pickerLocationInputs.insertBefore(waypointRow, endRow);
            } else {
                pickerLocationInputs.appendChild(waypointRow);
            }

            // 绑定事件：focus/input/enter
            const inputEl = waypointRow.querySelector('#' + waypointId);
            if (inputEl) {
                // 焦点事件
                inputEl.addEventListener('focus', function() {
                    currentInputType = 'waypoint';
                    currentActiveInput = waypointId;
                    // 恢复默认显示（分类+历史）
                    restoreDefaultDisplay();
                });

                // 输入事件（搜索）
                let wpTimer;
                inputEl.addEventListener('input', function() {
                    clearTimeout(wpTimer);
                    const keyword = this.value.trim();
                    wpTimer = setTimeout(() => {
                        currentInputType = 'waypoint';
                        currentActiveInput = waypointId;
                        if (keyword) {
                            searchAndDisplayResults(keyword);
                        } else {
                            restoreDefaultDisplay();
                        }
                    }, 300);
                });

                // 回车选择
                inputEl.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const keyword = this.value.trim();
                        if (keyword) {
                            currentInputType = 'waypoint';
                            currentActiveInput = waypointId;
                            autoSelectLocation(keyword, 'waypoint');
                        }
                    }
                });

                // 自动聚焦新输入框
                setTimeout(() => inputEl.focus(), 50);
            }
        });
    }

    // 途经点删除（事件委托）
    document.addEventListener('click', function(e) {
        const removeBtn = e.target.closest('.picker-waypoint-remove');
        if (removeBtn) {
            const row = removeBtn.closest('.picker-waypoint-row');
            if (row && row.parentElement) {
                row.parentElement.removeChild(row);
            }
        }
    });

    // 分类标签点击事件
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('picker-tag')) {
            const tagName = e.target.textContent;
            selectTagLocation(tagName);
        }
    });

    // 地点列表项点击事件
    document.addEventListener('click', function(e) {
        const locationItem = e.target.closest('.picker-location-item');
        if (locationItem) {
            const locationText = locationItem.querySelector('.picker-location-text')?.textContent ||
                               locationItem.querySelector('.picker-location-name')?.textContent;
            if (locationText) {
                selectLocationFromPicker(locationText, locationItem);
            }
        }
    });

    // 地点添加按钮点击事件（阻止冒泡，避免触发整行点击）
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('picker-add-icon')) {
            e.stopPropagation();
            const locationItem = e.target.closest('.picker-location-item');
            const locationText = locationItem?.querySelector('.picker-location-text')?.textContent ||
                               locationItem?.querySelector('.picker-location-name')?.textContent;
            if (locationText) {
                addLocationToCurrent(locationText);
            }
        }
    });
}

// 显示全屏选择面板
function showPickerPanel() {
    const pickerPanel = document.getElementById('point-picker-panel');
    const pickerStartInput = document.getElementById('picker-start-location');
    const pickerEndInput = document.getElementById('picker-end-location');
    const pickerCategories = document.querySelector('.picker-categories');

    // 同步底部卡片的输入值到面板
    const startValue = document.getElementById('start-location').value;
    const endValue = document.getElementById('end-location').value;

    if (pickerStartInput) {
        pickerStartInput.value = startValue;
    }
    if (pickerEndInput) {
        pickerEndInput.value = endValue;
    }

    // 显示分类标签
    if (pickerCategories) {
        pickerCategories.style.display = 'flex';
    }

    // 显示面板
    pickerPanel.classList.add('active');

    // 加载并显示搜索历史
    renderSearchHistory();

    // 延迟设置焦点，确保面板已经显示
    setTimeout(() => {
        if (currentInputType === 'start' && pickerStartInput) {
            pickerStartInput.focus();
        } else if (currentInputType === 'end' && pickerEndInput) {
            pickerEndInput.focus();
        }
    }, 100);
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
                searchHistory = parsed;
                console.log('成功加载搜索历史，条目数:', searchHistory.length);
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
    console.log('选择标签位置:', tagName);

    // 根据当前活动的输入框设置值
    if (currentInputType === 'start') {
        document.getElementById('start-location').value = tagName;
        const pickerStartInput = document.getElementById('picker-start-location');
        if (pickerStartInput) {
            pickerStartInput.value = tagName;
        }
    } else if (currentInputType === 'end') {
        document.getElementById('end-location').value = tagName;
        const pickerEndInput = document.getElementById('picker-end-location');
        if (pickerEndInput) {
            pickerEndInput.value = tagName;
        }
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
    console.log('当前输入类型:', currentInputType);

    // 根据当前活动的输入框设置值
    if (currentInputType === 'start') {
        const startInput = document.getElementById('start-location');
        const pickerStartInput = document.getElementById('picker-start-location');

        if (startInput) {
            startInput.value = locationText;
            console.log('已更新起点输入框值为:', locationText);
        }
        if (pickerStartInput) {
            pickerStartInput.value = locationText;
        }
    } else if (currentInputType === 'end') {
        const endInput = document.getElementById('end-location');
        const pickerEndInput = document.getElementById('picker-end-location');

        if (endInput) {
            endInput.value = locationText;
            console.log('已更新终点输入框值为:', locationText);
        }
        if (pickerEndInput) {
            pickerEndInput.value = locationText;
        }
    } else if (currentInputType === 'waypoint' && currentActiveInput) {
        // 处理途径点选择
        const waypointInput = document.getElementById(currentActiveInput);
        if (waypointInput) {
            waypointInput.value = locationText;
            console.log('已更新途径点输入框值为:', locationText);
        }
    }

    // 如果是"我的位置"，则使用当前定位
    if (locationText === '我的位置' && typeof currentPosition !== 'undefined') {
        console.log('使用当前位置');
        // 可以在这里添加使用当前位置的逻辑
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
                            address: kmlPoint.description || 'KML导入点位',
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
    console.log('添加地点到当前输入框:', locationText);

    // 根据当前活动的输入框设置值
    if (currentInputType === 'start') {
        document.getElementById('start-location').value = locationText;
        const pickerStartInput = document.getElementById('picker-start-location');
        if (pickerStartInput) {
            pickerStartInput.value = locationText;
        }
    } else if (currentInputType === 'end') {
        document.getElementById('end-location').value = locationText;
        const pickerEndInput = document.getElementById('picker-end-location');
        if (pickerEndInput) {
            pickerEndInput.value = locationText;
        }
    } else if (currentInputType === 'waypoint' && currentActiveInput) {
        // 处理途径点选择
        const waypointInput = document.getElementById(currentActiveInput);
        if (waypointInput) {
            waypointInput.value = locationText;
        }
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
        const iconHTML = '<i class="fas fa-clock"></i>';
        const nameText = historyItem.name || '未知地点';
        const addressText = historyItem.address || '';

        item.innerHTML = `
            ${iconHTML}
            <div class="picker-location-info">
                <div class="picker-location-name">${nameText}</div>
                <div class="picker-location-desc">${addressText}</div>
            </div>
            <button class="picker-add-icon">+</button>
        `;

        locationList.appendChild(item);
    });

    console.log(`已渲染 ${historyToShow.length} 条搜索历史`);
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
                address: kmlPoint.description || 'KML导入点位',
                type: 'kml-point',
                data: kmlPoint
            });
        });
    }

    // 搜索历史记录
    if (searchHistory && searchHistory.length > 0) {
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
            iconHTML = '<i class="fas fa-map-pin" style="color: #888;"></i>';
        } else {
            iconHTML = '<i class="fas fa-clock"></i>';
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
            <button class="picker-add-icon">+</button>
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
        const myLocationExists = locationList.querySelector('.fa-location-arrow');
        if (!myLocationExists) {
            const myLocationItem = document.createElement('div');
            myLocationItem.className = 'picker-location-item';
            myLocationItem.innerHTML = `
                <i class="fas fa-location-arrow"></i>
                <div class="picker-location-text">我的位置</div>
                <button class="picker-add-icon">+</button>
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
                address: exactMatch.description || 'KML导入点位',
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

        // 保存KML数据到sessionStorage（用于导航页面的路径规划）
        if (typeof kmlLayers !== 'undefined' && kmlLayers && kmlLayers.length > 0) {
            // 只保存必要的KML数据（不保存marker对象，只保存坐标和名称）
            const kmlData = kmlLayers.map(layer => {
                return {
                    id: layer.id,
                    name: layer.name,
                    visible: layer.visible,
                    features: layer.markers.map(marker => {
                        if (!marker || typeof marker.getExtData !== 'function') {
                            return null;
                        }
                        const extData = marker.getExtData();
                        if (!extData) return null;

                        let coordinates = null;
                        // 如果是点
                        if (extData.type === '点' && typeof marker.getPosition === 'function') {
                            const pos = marker.getPosition();
                            coordinates = pos ? [pos.lng, pos.lat] : null;
                        }
                        // 如果是线
                        else if (extData.type === '线' && typeof marker.getPath === 'function') {
                            const path = marker.getPath();
                            if (path && path.length > 0) {
                                coordinates = path.map(p =>
                                    p.lng !== undefined ? [p.lng, p.lat] : p
                                );
                            }
                        }

                        return coordinates ? {
                            name: extData.name,
                            type: extData.type,
                            description: extData.description,
                            coordinates: coordinates
                        } : null;
                    }).filter(f => f !== null)
                };
            });

            sessionStorage.setItem('kmlData', JSON.stringify(kmlData));
            console.log('KML数据已保存到sessionStorage，图层数:', kmlData.length);
        } else {
            console.warn('没有KML数据可保存');
        }

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
    if (locationName === '我的位置' && typeof currentPosition !== 'undefined') {
        return currentPosition;
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
        if (typeof currentPosition !== 'undefined' && currentPosition) {
            console.log('验证通过: 我的位置');
            return currentPosition;
        } else {
            console.warn('我的位置未定位');
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

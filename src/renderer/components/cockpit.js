/**
 * Cockpit Component
 * Handles real-time data display and device monitoring
 */

class CockpitManager {
    constructor(app) {
        this.app = app;
        this.currentDevice = null;
        this.isLiveMode = true;
        this.staleDataBanner = null;
        this.messages = [];
        this.lastStates = new Map(); // Track previous states for change detection
        this.stuckPositions = new Map(); // Track stuck detection
        this.config = {
            stuckThreshold: 90, // seconds
            batteryLowThreshold: 10, // percent
            liveRange: 5 * 60, // 5 minutes in seconds
            historyRange: 60 * 60 // 60 minutes in seconds
        };
        this.pollingInterval = null;
        this.realTimeEnabled = true;
    }

    async initialize() {
        await this.loadConfiguration();
        this.setupTimeRangeSelector();
        this.setupMessageFilters();
    }

    async loadConfiguration() {
        try {
            const result = await window.electronAPI.loadConfig();
            if (result.success) {
                this.config = {
                    stuckThreshold: result.config.StuckDetectionThreshold || 90,
                    batteryLowThreshold: result.config.BatteryLowThreshold || 10,
                    liveRange: this.parseTimeRange(result.config.LiveRange) || 5 * 60,
                    historyRange: this.parseTimeRange(result.config.HistoryRange) || 60 * 60
                };
                this.isLiveMode = result.config.DefaultView === 'Live';
                
                // Update time range selector
                document.getElementById('timeRangeSelector').value = this.isLiveMode ? 'live' : 'history';
            }
        } catch (error) {
            console.error('Failed to load configuration:', error);
        }
    }

    parseTimeRange(rangeStr) {
        if (!rangeStr) return null;
        
        const match = rangeStr.match(/(\d+)\s*(minute|hour)s?/i);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            return unit === 'hour' ? value * 3600 : value * 60;
        }
        return null;
    }

    setupTimeRangeSelector() {
        const selector = document.getElementById('timeRangeSelector');
        selector.addEventListener('change', (e) => {
            this.changeTimeRange(e.target.value === 'live');
        });
    }

    setupMessageFilters() {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setMessageFilter(e.target.dataset.filter);
            });
        });
    }

    async setDevice(device) {
        // Unsubscribe from previous device
        if (this.currentDevice) {
            await window.lawnmowerAPI.unsubscribeFromLawnmower(this.currentDevice.id);
            this.stopPolling();
        }

        this.currentDevice = device;
        this.messages = [];
        this.lastStates.clear();
        this.stuckPositions.clear();

        if (!device) {
            this.clearCockpitData();
            return;
        }

        // Update cockpit header
        this.updateDeviceHeader();

        // Subscribe to real-time updates
        try {
            if (this.realTimeEnabled) {
                await window.lawnmowerAPI.subscribeToLawnmower(device.id);
            } else {
                this.startPolling();
            }
        } catch (error) {
            console.error('Failed to subscribe to device updates:', error);
            this.startPolling(); // Fallback to polling
        }

        // Load initial data
        await this.loadInitialData();
        
        // Initialize map with device
        if (this.app.mapManager) {
            this.app.mapManager.setDevice(device);
        }
    }

    updateDeviceHeader() {
        if (!this.currentDevice) return;

        document.getElementById('deviceName').textContent = this.currentDevice.name;
        document.getElementById('deviceAddress').textContent = this.currentDevice.address;
        
        // Load and display avatar
        this.loadDeviceAvatar();
    }

    async loadDeviceAvatar() {
        try {
            const avatarResponse = await window.lawnmowerAPI.getLawnmowerAvatar(this.currentDevice.id);
            const avatarImg = document.getElementById('deviceAvatar');
            const placeholder = document.getElementById('avatarPlaceholder');

            if (avatarResponse && avatarResponse.ok) {
                const blob = await avatarResponse.blob();
                const url = URL.createObjectURL(blob);
                avatarImg.src = url;
                avatarImg.classList.remove('hidden');
                placeholder.classList.add('hidden');
            } else {
                avatarImg.classList.add('hidden');
                placeholder.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to load device avatar:', error);
        }
    }

    async loadInitialData() {
        if (!this.currentDevice) return;

        try {
            // Load current measurements
            const [battery, gps, state] = await Promise.allSettled([
                window.lawnmowerAPI.getCurrentBattery(this.currentDevice.id),
                window.lawnmowerAPI.getCurrentGps(this.currentDevice.id),
                window.lawnmowerAPI.getCurrentState(this.currentDevice.id)
            ]);

            if (battery.status === 'fulfilled') {
                this.updateBatteryLevel(battery.value.batteryLevel, battery.value.timestamp);
            }

            if (state.status === 'fulfilled') {
                this.updateDeviceState(state.value.state, state.value.timestamp);
            }

            if (gps.status === 'fulfilled') {
                this.updateGpsPosition(gps.value.latitude, gps.value.longitude, gps.value.timestamp);
            }

            // Generate initial status message
            this.addMessage('Cockpit initialized for ' + this.currentDevice.name, 'info');
            
            this.app.updateLastUpdateTime();

        } catch (error) {
            console.error('Failed to load initial device data:', error);
            this.addMessage('Failed to load initial device data', 'error');
        }
    }

    // Real-time data handlers
    handleBatteryUpdate(data) {
        if (!this.currentDevice || data.LawnmowerId !== this.currentDevice.id) return;
        
        this.updateBatteryLevel(data.BatteryLevel, new Date());
        this.checkBatteryWarnings(data.BatteryLevel);
        this.app.updateLastUpdateTime();
    }

    handleGpsUpdate(data) {
        if (!this.currentDevice || data.LawnmowerId !== this.currentDevice.id) return;
        
        this.updateGpsPosition(data.Latitude, data.Longitude, new Date());
        this.checkStuckDetection(data.Latitude, data.Longitude);
        this.app.updateLastUpdateTime();
    }

    handleStateUpdate(data) {
        if (!this.currentDevice || data.LawnmowerId !== this.currentDevice.id) return;
        
        const previousState = this.lastStates.get(this.currentDevice.id);
        this.updateDeviceState(data.State, new Date());
        
        if (previousState !== undefined && previousState !== data.State) {
            this.generateStateChangeMessage(previousState, data.State);
        }
        
        this.lastStates.set(this.currentDevice.id, data.State);
        this.app.updateLastUpdateTime();
    }

    // Data update methods
    updateBatteryLevel(level, timestamp) {
        const batteryElement = document.getElementById('batteryLevel');
        batteryElement.textContent = `${Math.round(level)}%`;
        
        // Apply color coding
        batteryElement.className = '';
        if (level <= 0) {
            batteryElement.className = 'battery-critical';
        } else if (level < this.config.batteryLowThreshold) {
            batteryElement.className = 'battery-low';
        } else {
            batteryElement.className = 'battery-normal';
        }

        // Update battery chart if visible and chart manager is available
        if (this.app.currentTab === 'battery' && this.app.chartManager) {
            this.app.chartManager.updateBatteryChart(level, timestamp);
        }
    }

    updateDeviceState(stateId, timestamp) {
        const statusElement = document.getElementById('deviceStatus');
        const stateName = window.lawnmowerAPI.constructor.getStateName(stateId);
        const stateClass = window.lawnmowerAPI.constructor.getStateClass(stateId);
        
        statusElement.textContent = stateName;
        statusElement.className = stateClass;

        // Handle error state visual feedback
        if (stateId === 5) { // Error state
            this.addMessage('Device entered error state', 'error');
        }
    }

    updateGpsPosition(latitude, longitude, timestamp) {
        // Update map if visible
        if (this.app.currentTab === 'map' && this.app.mapManager) {
            this.app.mapManager.updatePosition(latitude, longitude, timestamp);
        }

        // Store latest position for stuck detection
        this.lastPosition = { latitude, longitude, timestamp };
    }

    // Warning and alert systems
    checkBatteryWarnings(level) {
        if (level === 0) {
            this.addMessage('Battery empty - device shutting down', 'error');
        } else if (level < this.config.batteryLowThreshold) {
            this.addMessage(`Battery low: ${Math.round(level)}%`, 'warning');
        }
    }

    checkStuckDetection(latitude, longitude) {
        if (!this.currentDevice) return;

        const deviceId = this.currentDevice.id;
        const currentState = this.lastStates.get(deviceId);
        
        // Only check for stuck in Mowing or ReturningToStation states
        if (currentState !== 2 && currentState !== 3) {
            this.stuckPositions.delete(deviceId);
            return;
        }

        const now = Date.now();
        const stuckData = this.stuckPositions.get(deviceId);

        if (!stuckData) {
            // First position recorded
            this.stuckPositions.set(deviceId, {
                latitude,
                longitude,
                timestamp: now
            });
            return;
        }

        // Calculate distance moved
        const distance = window.lawnmowerAPI.constructor.calculateDistance(
            stuckData.latitude, stuckData.longitude,
            latitude, longitude
        );

        if (distance > 1) { // Moved more than 1 meter
            // Reset stuck detection
            this.stuckPositions.set(deviceId, {
                latitude,
                longitude,
                timestamp: now
            });
        } else {
            // Check if stuck for too long
            const stuckTime = (now - stuckData.timestamp) / 1000;
            if (stuckTime > this.config.stuckThreshold) {
                this.addMessage(`Device appears to be stuck (${Math.round(stuckTime)}s without movement)`, 'error');
                
                // Mark stuck location on map
                if (this.app.mapManager) {
                    this.app.mapManager.markStuckLocation(latitude, longitude);
                }

                // Reset to avoid spam
                this.stuckPositions.set(deviceId, {
                    latitude,
                    longitude,
                    timestamp: now
                });
            }
        }
    }

    generateStateChangeMessage(previousState, newState) {
        const previousName = window.lawnmowerAPI.constructor.getStateName(previousState);
        const newName = window.lawnmowerAPI.constructor.getStateName(newState);
        
        this.addMessage(`State changed: ${previousName} → ${newName}`, 'info');
        
        // Check for recovery from stuck
        if (previousState === 4 && newState === 2) { // Paused to Mowing
            this.addMessage('Device resumed operation', 'info');
        }
    }

    // Message system
    addMessage(text, type = 'info', timestamp = null) {
        const messageTimestamp = timestamp || new Date();
        const message = {
            id: Date.now() + Math.random(),
            text,
            type,
            timestamp: messageTimestamp
        };

        this.messages.unshift(message); // Add to beginning
        
        // Limit message history
        if (this.messages.length > 1000) {
            this.messages = this.messages.slice(0, 1000);
        }

        // Update message count
        document.getElementById('messageCount').textContent = this.messages.length;

        // Update message display if visible
        if (this.app.currentTab === 'messages') {
            this.renderMessages();
        }

        console.log(`[${type.toUpperCase()}] ${messageTimestamp.toLocaleTimeString()}: ${text}`);
    }

    renderMessages() {
        const messagesList = document.getElementById('messagesList');
        const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
        
        let filteredMessages = this.messages;
        if (activeFilter !== 'all') {
            filteredMessages = this.messages.filter(msg => msg.type === activeFilter);
        }

        if (filteredMessages.length === 0) {
            messagesList.innerHTML = '<div class="p-4 text-center text-gray-500">No messages matching filter</div>';
            return;
        }

        const messagesHtml = filteredMessages.slice(0, 100).map(msg => `
            <div class="message-item message-${msg.type} p-3 border-b border-gray-100">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <p class="text-sm text-gray-800">${msg.text}</p>
                    </div>
                    <span class="text-xs text-gray-500 ml-3 flex-shrink-0">
                        ${msg.timestamp.toLocaleTimeString()}
                    </span>
                </div>
            </div>
        `).join('');

        messagesList.innerHTML = messagesHtml;
    }

    setMessageFilter(filter) {
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.dataset.filter === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Re-render messages
        if (this.app.currentTab === 'messages') {
            this.renderMessages();
        }
    }

    // Time range management
    changeTimeRange(isLive) {
        this.isLiveMode = isLive;
        
        // Update selector
        document.getElementById('timeRangeSelector').value = isLive ? 'live' : 'history';
        
        // Reload current tab data
        if (this.currentDevice) {
            this.app.loadTabContent(this.app.currentTab);
        }
    }

    // Polling fallback for when SignalR is not available
    startPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            if (this.currentDevice) {
                try {
                    await this.pollDeviceData();
                } catch (error) {
                    console.error('Polling error:', error);
                }
            }
        }, 5000); // Poll every 5 seconds
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async pollDeviceData() {
        if (!this.currentDevice) return;

        try {
            const [battery, gps, state] = await Promise.allSettled([
                window.lawnmowerAPI.getCurrentBattery(this.currentDevice.id),
                window.lawnmowerAPI.getCurrentGps(this.currentDevice.id),
                window.lawnmowerAPI.getCurrentState(this.currentDevice.id)
            ]);

            if (battery.status === 'fulfilled') {
                this.handleBatteryUpdate({
                    LawnmowerId: this.currentDevice.id,
                    BatteryLevel: battery.value.batteryLevel
                });
            }

            if (gps.status === 'fulfilled') {
                this.handleGpsUpdate({
                    LawnmowerId: this.currentDevice.id,
                    Latitude: gps.value.latitude,
                    Longitude: gps.value.longitude
                });
            }

            if (state.status === 'fulfilled') {
                this.handleStateUpdate({
                    LawnmowerId: this.currentDevice.id,
                    State: state.value.state
                });
            }

        } catch (error) {
            console.error('Failed to poll device data:', error);
        }
    }

    // Chart update methods (placeholders for future implementation)
    updateBatteryChart(level, timestamp) {
        // Will be implemented in visualization milestone
        console.log('Battery chart update:', level, timestamp);
    }

    // Stale data management
    showStaleDataBanner() {
        if (this.staleDataBanner) return; // Already shown

        this.staleDataBanner = document.createElement('div');
        this.staleDataBanner.className = 'stale-data-banner';
        this.staleDataBanner.innerHTML = `
            <div class="flex items-center justify-center space-x-2">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                </svg>
                <span>Data may be outdated - no updates received for over 1 minute</span>
            </div>
        `;

        const cockpitView = document.getElementById('cockpitView');
        cockpitView.insertBefore(this.staleDataBanner, cockpitView.firstChild);
    }

    hideStaleDataBanner() {
        if (this.staleDataBanner) {
            this.staleDataBanner.remove();
            this.staleDataBanner = null;
        }
    }

    clearCockpitData() {
        // Clear all displayed data
        document.getElementById('batteryLevel').textContent = '--';
        document.getElementById('deviceStatus').textContent = 'Unknown';
        document.getElementById('messageCount').textContent = '0';
        
        // Clear messages
        this.messages = [];
        
        // Hide stale data banner
        this.hideStaleDataBanner();
    }

    // Public interface
    onStaleData() {
        this.showStaleDataBanner();
    }

    onFreshData() {
        this.hideStaleDataBanner();
    }

    getMessages() {
        return this.messages;
    }

    isInLiveMode() {
        return this.isLiveMode;
    }

    getConfig() {
        return this.config;
    }
}

// Export for use in main.js
window.CockpitManager = CockpitManager;
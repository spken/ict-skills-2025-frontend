/**
 * Main Renderer Process Logic
 * Handles UI interactions, device management, and real-time updates
 */

class LawnmowerApp {
    constructor() {
        this.currentDevice = null;
        this.lawnmowers = [];
        this.lastUpdate = null;
        this.staleDataTimeout = null;
        this.messageCount = 0;
        this.currentTab = 'map';
        this.isInitialized = false;
    }

    async initialize() {
        try {
            console.log('Initializing Lawnmower App...');
            
            // Initialize event listeners
            this.setupEventListeners();
            
            // Initialize SignalR connection
            await window.lawnmowerAPI.initializeSignalR();
            
            // Set up connection status monitoring
            window.lawnmowerAPI.onConnectionChange((connected) => {
                this.updateConnectionStatus(connected);
            });

            // Set up real-time data handlers
            this.setupRealTimeHandlers();
            
            // Load initial data
            await this.loadLawnmowers();
            
            // Initialize tabs
            this.initializeTabs();
            
            this.isInitialized = true;
            this.showToast('Application initialized successfully', 'success');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showToast('Failed to connect to backend. Please check if the backend is running.', 'error');
        }
    }

    setupEventListeners() {
        // Device selector
        const deviceSelector = document.getElementById('deviceSelector');
        deviceSelector.addEventListener('change', (e) => {
            this.selectDevice(e.target.value);
        });

        // Action buttons
        document.getElementById('addBtn').addEventListener('click', () => this.showAddMowerDialog());
        document.getElementById('editBtn').addEventListener('click', () => this.showEditMowerDialog());
        document.getElementById('deleteBtn').addEventListener('click', () => this.showDeleteMowerDialog());
        document.getElementById('importBtn').addEventListener('click', () => this.showImportDialog());
        document.getElementById('exportBtn').addEventListener('click', () => this.showExportDialog());
        document.getElementById('controlBtn').addEventListener('click', () => this.showRemoteControlDialog());

        // Quick action buttons
        document.getElementById('quickAddBtn').addEventListener('click', () => this.showAddMowerDialog());
        document.getElementById('quickImportBtn').addEventListener('click', () => this.showImportDialog());

        // Time range selector
        document.getElementById('timeRangeSelector').addEventListener('change', (e) => {
            this.changeTimeRange(e.target.value);
        });

        // Configuration button
        document.getElementById('configBtn').addEventListener('click', () => this.showConfiguration());
    }

    setupRealTimeHandlers() {
        // Battery measurements
        window.lawnmowerAPI.onMeasurement('battery', (data) => {
            if (this.currentDevice && data.LawnmowerId === this.currentDevice.id) {
                this.updateBatteryLevel(data.BatteryLevel);
                this.updateLastUpdateTime();
            }
        });

        // GPS measurements
        window.lawnmowerAPI.onMeasurement('gps', (data) => {
            if (this.currentDevice && data.LawnmowerId === this.currentDevice.id) {
                this.updateGpsPosition(data.Latitude, data.Longitude);
                this.updateLastUpdateTime();
            }
        });

        // State measurements
        window.lawnmowerAPI.onMeasurement('state', (data) => {
            if (this.currentDevice && data.LawnmowerId === this.currentDevice.id) {
                this.updateDeviceState(data.State);
                this.updateLastUpdateTime();
                this.generateStateChangeMessage(data.State);
            }
        });
    }

    async loadLawnmowers() {
        try {
            this.lawnmowers = await window.lawnmowerAPI.getLawnmowers();
            this.updateDeviceSelector();
            
            if (this.lawnmowers.length === 0) {
                this.showNoDeviceState();
            }
        } catch (error) {
            console.error('Failed to load lawnmowers:', error);
            this.showToast('Failed to load lawnmowers', 'error');
        }
    }

    updateDeviceSelector() {
        const selector = document.getElementById('deviceSelector');
        
        // Clear existing options except the first one
        while (selector.children.length > 1) {
            selector.removeChild(selector.lastChild);
        }

        // Add lawnmower options
        this.lawnmowers.forEach(mower => {
            const option = document.createElement('option');
            option.value = mower.id;
            option.textContent = `${mower.id}: ${mower.name} (${mower.address})`;
            selector.appendChild(option);
        });
    }

    async selectDevice(deviceId) {
        if (!deviceId) {
            this.currentDevice = null;
            this.showNoDeviceState();
            this.updateActionButtons();
            return;
        }

        try {
            // Unsubscribe from previous device
            if (this.currentDevice) {
                await window.lawnmowerAPI.unsubscribeFromLawnmower(this.currentDevice.id);
            }

            // Find and set current device
            this.currentDevice = this.lawnmowers.find(m => m.id == deviceId);
            if (!this.currentDevice) return;

            // Subscribe to real-time updates
            await window.lawnmowerAPI.subscribeToLawnmower(this.currentDevice.id);

            // Load device data and show cockpit
            await this.loadDeviceData();
            this.showCockpitView();
            this.updateActionButtons();

        } catch (error) {
            console.error('Failed to select device:', error);
            this.showToast('Failed to select device', 'error');
        }
    }

    async loadDeviceData() {
        if (!this.currentDevice) return;

        try {
            // Load avatar
            const avatar = await window.lawnmowerAPI.getLawnmowerAvatar(this.currentDevice.id);
            this.updateDeviceAvatar(avatar);

            // Load current measurements
            const [battery, gps, state] = await Promise.allSettled([
                window.lawnmowerAPI.getCurrentBattery(this.currentDevice.id),
                window.lawnmowerAPI.getCurrentGps(this.currentDevice.id),
                window.lawnmowerAPI.getCurrentState(this.currentDevice.id)
            ]);

            if (battery.status === 'fulfilled') {
                this.updateBatteryLevel(battery.value.batteryLevel);
            }

            if (state.status === 'fulfilled') {
                this.updateDeviceState(state.value.state);
            }

            if (gps.status === 'fulfilled') {
                this.updateGpsPosition(gps.value.latitude, gps.value.longitude);
            }

            this.updateLastUpdateTime();

        } catch (error) {
            console.error('Failed to load device data:', error);
        }
    }

    showNoDeviceState() {
        document.getElementById('noDeviceState').classList.remove('hidden');
        document.getElementById('cockpitView').classList.add('hidden');
    }

    showCockpitView() {
        document.getElementById('noDeviceState').classList.add('hidden');
        document.getElementById('cockpitView').classList.remove('hidden');

        // Update device info in cockpit header
        document.getElementById('deviceName').textContent = this.currentDevice.name;
        document.getElementById('deviceAddress').textContent = this.currentDevice.address;
    }

    updateActionButtons() {
        const hasDevice = !!this.currentDevice;
        document.getElementById('editBtn').disabled = !hasDevice;
        document.getElementById('deleteBtn').disabled = !hasDevice;
        document.getElementById('exportBtn').disabled = !hasDevice;
        document.getElementById('controlBtn').disabled = !hasDevice;
    }

    updateDeviceAvatar(avatarResponse) {
        const avatarImg = document.getElementById('deviceAvatar');
        const placeholder = document.getElementById('avatarPlaceholder');

        if (avatarResponse && avatarResponse.ok) {
            avatarResponse.blob().then(blob => {
                const url = URL.createObjectURL(blob);
                avatarImg.src = url;
                avatarImg.classList.remove('hidden');
                placeholder.classList.add('hidden');
            });
        } else {
            avatarImg.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    }

    updateBatteryLevel(level) {
        const batteryElement = document.getElementById('batteryLevel');
        batteryElement.textContent = `${Math.round(level)}%`;
        
        // Apply color coding based on level
        batteryElement.className = '';
        if (level <= 0) {
            batteryElement.className = 'battery-critical';
        } else if (level < 10) {
            batteryElement.className = 'battery-low';
        } else {
            batteryElement.className = 'battery-normal';
        }
    }

    updateDeviceState(stateId) {
        const statusElement = document.getElementById('deviceStatus');
        const stateName = window.lawnmowerAPI.constructor.getStateName(stateId);
        const stateClass = window.lawnmowerAPI.constructor.getStateClass(stateId);
        
        statusElement.textContent = stateName;
        statusElement.className = stateClass;
    }

    updateGpsPosition(latitude, longitude) {
        // This will be implemented in the map visualization milestone
        console.log('GPS position updated:', { latitude, longitude });
    }

    generateStateChangeMessage(newState) {
        const stateName = window.lawnmowerAPI.constructor.getStateName(newState);
        this.addMessage(`Device state changed to: ${stateName}`, 'info');
    }

    updateLastUpdateTime() {
        this.lastUpdate = new Date();
        document.getElementById('lastUpdate').textContent = this.lastUpdate.toLocaleTimeString();
        
        // Clear stale data timeout
        if (this.staleDataTimeout) {
            clearTimeout(this.staleDataTimeout);
        }
        
        // Set new stale data timeout (1 minute)
        this.staleDataTimeout = setTimeout(() => {
            this.showStaleDataBanner();
        }, 60000);
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (connected) {
            statusDot.className = 'w-3 h-3 rounded-full connection-connected';
            statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'w-3 h-3 rounded-full connection-disconnected';
            statusText.textContent = 'Disconnected';
        }
    }

    showStaleDataBanner() {
        // This will be implemented when we add the banner UI
        console.log('Data is stale - no updates for over 1 minute');
    }

    initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Update button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update content visibility
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
        });
        
        document.getElementById(`${tabName}Tab`).classList.remove('hidden');
        this.currentTab = tabName;

        // Initialize tab-specific content
        if (this.currentDevice) {
            this.loadTabContent(tabName);
        }
    }

    async loadTabContent(tabName) {
        switch (tabName) {
            case 'map':
                this.initializeMap();
                break;
            case 'battery':
                this.loadBatteryChart();
                break;
            case 'status':
                this.loadStatusChart();
                break;
            case 'messages':
                this.loadMessages();
                break;
        }
    }

    // Placeholder methods for tab content - to be implemented in future milestones
    initializeMap() {
        console.log('Initializing map...');
        // Map initialization will be implemented in the visualization milestone
    }

    loadBatteryChart() {
        console.log('Loading battery chart...');
        // Chart loading will be implemented in the visualization milestone
    }

    loadStatusChart() {
        console.log('Loading status chart...');
        // Chart loading will be implemented in the visualization milestone
    }

    loadMessages() {
        console.log('Loading messages...');
        // Message loading will be implemented in the visualization milestone
    }

    // Message system
    addMessage(text, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.messageCount++;
        document.getElementById('messageCount').textContent = this.messageCount;
        
        console.log(`[${type.toUpperCase()}] ${timestamp}: ${text}`);
        // Full message UI will be implemented in the visualization milestone
    }

    // Dialog placeholders - to be implemented in device management milestone
    showAddMowerDialog() {
        this.showToast('Add mower dialog - coming in next milestone', 'info');
    }

    showEditMowerDialog() {
        this.showToast('Edit mower dialog - coming in next milestone', 'info');
    }

    showDeleteMowerDialog() {
        this.showToast('Delete mower dialog - coming in next milestone', 'info');
    }

    showImportDialog() {
        this.showToast('Import dialog - coming in next milestone', 'info');
    }

    showExportDialog() {
        this.showToast('Export dialog - coming in next milestone', 'info');
    }

    showRemoteControlDialog() {
        this.showToast('Remote control dialog - coming in next milestone', 'info');
    }

    showConfiguration() {
        this.showToast('Configuration viewer - coming in next milestone', 'info');
    }

    changeTimeRange(range) {
        console.log('Time range changed to:', range);
        // Time range logic will be implemented in the visualization milestone
    }

    // Toast notification system
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        
        toast.className = `toast toast-${type} px-4 py-2 rounded shadow-lg mb-2 max-w-sm`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        // Trigger show animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Auto dismiss
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => container.removeChild(toast), 300);
        }, duration);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.lawnmowerApp = new LawnmowerApp();
    window.lawnmowerApp.initialize();
});
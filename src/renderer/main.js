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

        // Initialize managers
        this.deviceManager = null;
        this.cockpitManager = null;
        this.mapManager = null;
        this.chartManager = null;
        this.statusManager = null;
        this.importExportManager = null;
    }

    async initialize() {
        try {
            console.log('Initializing Lawnmower App...');

            // Wait for all required libraries to load
            await this.waitForDependencies();

            // Initialize managers
            this.deviceManager = new window.DeviceManager(this);
            this.cockpitManager = new window.CockpitManager(this);
            this.mapManager = new window.MapManager(this);
            this.chartManager = new window.ChartManager(this);
            this.statusManager = new window.StatusManager(this);
            this.importExportManager = new window.ImportExportManager(this);

            // Initialize components
            await this.cockpitManager.initialize();
            await this.chartManager.initialize();
            await this.statusManager.initialize();

            // Initialize the map right away since it's the default tab
            await this.initializeMap();

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
            console.error('Error details:', error.stack);
            this.showToast(`Failed to initialize: ${error.message}`, 'error');
        }
    }

    async waitForDependencies() {
        const dependencies = [
            { name: 'Chart.js', check: () => typeof Chart !== 'undefined' },
            { name: 'Leaflet', check: () => typeof L !== 'undefined' },
            { name: 'SignalR', check: () => typeof signalR !== 'undefined' },
            { name: 'LawnmowerAPI', check: () => typeof window.lawnmowerAPI !== 'undefined' }
        ];

        console.log('Waiting for dependencies to load...');

        for (const dep of dependencies) {
            console.log(`Checking ${dep.name}...`);
            await new Promise((resolve) => {
                if (dep.check()) {
                    console.log(`✓ ${dep.name} loaded`);
                    resolve();
                    return;
                }

                const pollForDependency = () => {
                    if (dep.check()) {
                        console.log(`✓ ${dep.name} loaded`);
                        resolve();
                    } else {
                        setTimeout(pollForDependency, 100);
                    }
                };

                pollForDependency();
            });
        }

        console.log('All dependencies loaded successfully');
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

        // Export buttons
        document.addEventListener('click', (e) => {
            if (e.target.id === 'exportBatteryBtn') {
                this.chartManager.exportBatteryData();
            } else if (e.target.id === 'exportStatusBtn') {
                this.statusManager.exportStatusData();
            }
        });
    }

    setupRealTimeHandlers() {
        // Battery measurements
        window.lawnmowerAPI.onMeasurement('battery', (data) => {
            this.cockpitManager.handleBatteryUpdate(data);
        });

        // GPS measurements
        window.lawnmowerAPI.onMeasurement('gps', (data) => {
            this.cockpitManager.handleGpsUpdate(data);
        });

        // State measurements
        window.lawnmowerAPI.onMeasurement('state', (data) => {
            this.cockpitManager.handleStateUpdate(data);
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
            await this.cockpitManager.setDevice(null);
            this.chartManager.setDevice(null);
            this.statusManager.setDevice(null);
            this.showNoDeviceState();
            this.updateActionButtons();
            return;
        }

        try {
            // Find and set current device
            this.currentDevice = this.lawnmowers.find(m => m.id == deviceId);
            if (!this.currentDevice) return;

            // Set device in all managers
            await this.cockpitManager.setDevice(this.currentDevice);
            this.chartManager.setDevice(this.currentDevice);
            this.statusManager.setDevice(this.currentDevice);

            // Show cockpit view
            this.showCockpitView();
            this.updateActionButtons();

            // Load current tab content
            await this.loadTabContent(this.currentTab);

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
            if (this.cockpitManager) {
                this.cockpitManager.onStaleData();
            }
        }, 60000);

        // Hide stale data banner if visible
        if (this.cockpitManager) {
            this.cockpitManager.onFreshData();
        }
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

        // Handle map resizing when switching to map tab
        if (tabName === 'map' && this.mapManager && this.mapManager.isInitialized) {
            // Immediate resize
            this.mapManager.resize();

            // Additional resize with delay to handle layout changes
            setTimeout(() => {
                this.mapManager.resize();
            }, 100);
        }

        // Initialize tab-specific content
        if (this.currentDevice) {
            this.loadTabContent(tabName);
        }
    }

    async loadTabContent(tabName) {
        if (!this.currentDevice) return;

        switch (tabName) {
            case 'map':
                await this.initializeMap();
                break;
            case 'battery':
                await this.loadBatteryChart();
                break;
            case 'status':
                await this.loadStatusChart();
                break;
            case 'messages':
                this.loadMessages();
                break;
        }
    }

    async initializeMap() {
        // Skip if already initialized
        if (this.mapManager.isInitialized) {
            // Just ensure proper sizing and device data
            this.mapManager.resize();
            if (this.currentDevice) {
                this.mapManager.setDevice(this.currentDevice);
            }
            return;
        }

        try {
            console.log('Initializing map for the first time...');
            await this.mapManager.initialize();

            // Resize map to ensure proper display after initialization
            setTimeout(() => {
                this.mapManager.resize();
            }, 100);

            // Load device data if device is selected
            if (this.currentDevice) {
                this.mapManager.setDevice(this.currentDevice);
            }

            console.log('Map initialized successfully');
        } catch (error) {
            console.error('Failed to initialize map:', error);
            this.mapManager.showMapError('Failed to load map');
        }
    }

    async loadBatteryChart() {
        const isLiveMode = this.cockpitManager.isInLiveMode();
        await this.chartManager.loadBatteryChart(isLiveMode);
    }

    async loadStatusChart() {
        const isLiveMode = this.cockpitManager.isInLiveMode();
        await this.statusManager.loadStatusVisualization(isLiveMode);
    }

    loadMessages() {
        if (this.cockpitManager) {
            this.cockpitManager.renderMessages();
        }
    }

    // Message system
    addMessage(text, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.messageCount++;
        document.getElementById('messageCount').textContent = this.messageCount;

        console.log(`[${type.toUpperCase()}] ${timestamp}: ${text}`);
        // Full message UI will be implemented in the visualization milestone
    }

    // Device management methods - now implemented
    showAddMowerDialog() {
        this.deviceManager.showAddMowerDialog();
    }

    showEditMowerDialog() {
        this.deviceManager.showEditMowerDialog();
    }

    showDeleteMowerDialog() {
        this.deviceManager.showDeleteMowerDialog();
    }

    showImportDialog() {
        this.importExportManager.showImportMowersDialog();
    }

    showExportDialog() {
        this.importExportManager.showExportMowerDialog();
    }

    showRemoteControlDialog() {
        this.showToast('Remote control dialog - coming in next milestone', 'info');
    }

    showConfiguration() {
        this.showToast('Configuration viewer - coming in next milestone', 'info');
    }

    async loadBatteryChart() {
        const isLiveMode = this.cockpitManager.isInLiveMode();
        await this.chartManager.loadBatteryChart(isLiveMode);
    }

    async loadStatusChart() {
        const isLiveMode = this.cockpitManager.isInLiveMode();
        await this.statusManager.loadStatusVisualization(isLiveMode);
    }

    loadMessages() {
        if (this.cockpitManager) {
            this.cockpitManager.renderMessages();
        }
    }

    // Message system
    addMessage(text, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.messageCount++;
        document.getElementById('messageCount').textContent = this.messageCount;

        console.log(`[${type.toUpperCase()}] ${timestamp}: ${text}`);
        // Full message UI will be implemented in the visualization milestone
    }

    // Device management methods - now implemented
    showAddMowerDialog() {
        this.deviceManager.showAddMowerDialog();
    }

    showEditMowerDialog() {
        this.deviceManager.showEditMowerDialog();
    }

    showDeleteMowerDialog() {
        this.deviceManager.showDeleteMowerDialog();
    }

    showImportDialog() {
        this.importExportManager.showImportMowersDialog();
    }

    showExportDialog() {
        this.importExportManager.showExportMowerDialog();
    }

    showRemoteControlDialog() {
        this.showToast('Remote control dialog - coming in next milestone', 'info');
    }

    showConfiguration() {
        this.showToast('Configuration viewer - coming in next milestone', 'info');
    }

    changeTimeRange(range) {
        if (this.cockpitManager) {
            this.cockpitManager.changeTimeRange(range === 'live');
        }
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
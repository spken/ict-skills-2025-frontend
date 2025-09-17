/**
 * Remote Control Manager Component
 * Handles lawnmower remote control operations with real-time state validation
 */

class RemoteControlManager {
    constructor(app) {
        this.app = app;
        this.currentDialog = null;
        this.currentDevice = null;
        this.currentState = null;
        this.lastPingTime = null;
        this.connectionStatus = 'unknown';
    }

    setDevice(device) {
        this.currentDevice = device;
        this.currentState = null;
        this.connectionStatus = 'unknown';
    }

    updateDeviceState(stateId) {
        this.currentState = stateId;
        if (this.currentDialog) {
            this.updateButtonStates();
            this.updateStateDisplay();
        }
    }

    async _showRemoteControlDialog() {
        if (!this.currentDevice) {
            this.app.showToast('Please select a device to control', 'warning');
            return;
        }

        // Get current state
        try {
            const currentState = await window.lawnmowerAPI.getCurrentState(this.currentDevice.id);
            this.currentState = currentState.state;
        } catch (error) {
            console.error('Failed to get current state:', error);
            this.currentState = null;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">Remote Control</h3>
                </div>
                
                <div class="px-6 py-6 space-y-6">
                    <!-- Current Status -->
                    <div class="text-center">
                        <div class="text-sm text-gray-600 mb-1">Current Status:</div>
                        <div id="remoteCurrentStatus" class="text-lg font-semibold">
                            ${this.currentState !== null ? window.lawnmowerAPI.constructor.getStateName(this.currentState) : 'Loading...'}
                        </div>
                        <div id="connectionIndicator" class="flex items-center justify-center mt-2">
                            <div class="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
                            <span class="text-xs text-gray-500">Connection: ${this.connectionStatus}</span>
                        </div>
                    </div>

                    <!-- Control Buttons -->
                    <div class="grid grid-cols-3 gap-4">
                        <!-- Start Button -->
                        <div class="text-center">
                            <button id="startBtn" class="control-button w-16 h-16 mx-auto mb-2 rounded-lg border-2 transition-all duration-200 hover:scale-105 active:scale-95" 
                                    title="Start mowing" disabled>
                                <img src="assets/StartButton.svg" alt="Start" class="w-full h-full">
                            </button>
                            <div class="text-xs text-gray-600">Start</div>
                        </div>

                        <!-- Stop Button -->
                        <div class="text-center">
                            <button id="stopBtn" class="control-button w-16 h-16 mx-auto mb-2 rounded-lg border-2 transition-all duration-200 hover:scale-105 active:scale-95" 
                                    title="Stop mowing" disabled>
                                <img src="assets/StopButton.svg" alt="Stop" class="w-full h-full">
                            </button>
                            <div class="text-xs text-gray-600">Stop</div>
                        </div>

                        <!-- Home Button -->
                        <div class="text-center">
                            <button id="homeBtn" class="control-button w-16 h-16 mx-auto mb-2 rounded-lg border-2 transition-all duration-200 hover:scale-105 active:scale-95" 
                                    title="Return to station" disabled>
                                <img src="assets/HomeButton.svg" alt="Home" class="w-full h-full">
                            </button>
                            <div class="text-xs text-gray-600">Home</div>
                        </div>
                    </div>

                    <!-- Additional Controls -->
                    <div class="grid grid-cols-2 gap-4">
                        <!-- Acknowledge Error Button -->
                        <div class="text-center">
                            <button id="ackErrorBtn" class="control-button w-16 h-16 mx-auto mb-2 rounded-lg border-2 transition-all duration-200 hover:scale-105 active:scale-95" 
                                    title="Acknowledge error" disabled>
                                <img src="assets/AckErrorButton.svg" alt="Ack Error" class="w-full h-full">
                            </button>
                            <div class="text-xs text-gray-600">Ack Error</div>
                        </div>

                        <!-- Ping Button -->
                        <div class="text-center">
                            <button id="pingBtn" class="control-button w-16 h-16 mx-auto mb-2 rounded-lg border-2 transition-all duration-200 hover:scale-105 active:scale-95 bg-blue-50 border-blue-200" 
                                    title="Ping device">
                                <svg class="w-8 h-8 mx-auto text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                </svg>
                            </button>
                            <div class="text-xs text-gray-600">Ping</div>
                        </div>
                    </div>

                    <!-- Command Feedback -->
                    <div id="commandFeedback" class="hidden p-3 rounded border-l-4">
                        <div id="feedbackText" class="text-sm"></div>
                    </div>

                    <!-- Last Ping Result -->
                    <div id="pingResult" class="text-center text-xs text-gray-500">
                        <span id="pingText">Click ping to test connection</span>
                    </div>
                </div>

                <div class="px-6 py-4 border-t border-gray-200 flex justify-end">
                    <button type="button" id="closeRemoteBtn" class="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentDialog = overlay;
        
        this.setupRemoteControlEvents();
        this.updateButtonStates();
        this.performInitialPing();
    }

    setupRemoteControlEvents() {
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const homeBtn = document.getElementById('homeBtn');
        const ackErrorBtn = document.getElementById('ackErrorBtn');
        const pingBtn = document.getElementById('pingBtn');
        const closeBtn = document.getElementById('closeRemoteBtn');

        startBtn.addEventListener('click', () => this.sendCommand(0, 'Start'));
        stopBtn.addEventListener('click', () => this.sendCommand(1, 'Stop'));
        homeBtn.addEventListener('click', () => this.sendCommand(2, 'Home'));
        ackErrorBtn.addEventListener('click', () => this.sendCommand(3, 'Ack Error'));
        pingBtn.addEventListener('click', () => this.pingDevice());
        closeBtn.addEventListener('click', () => this.closeRemoteControlDialog());

        // Close on overlay click
        this.currentDialog.addEventListener('click', (e) => {
            if (e.target === this.currentDialog) this.closeRemoteControlDialog();
        });
    }

    updateButtonStates() {
        if (!this.currentDialog || this.currentState === null) return;

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const homeBtn = document.getElementById('homeBtn');
        const ackErrorBtn = document.getElementById('ackErrorBtn');

        // Reset all buttons
        [startBtn, stopBtn, homeBtn, ackErrorBtn].forEach(btn => {
            btn.disabled = true;
            btn.classList.remove('control-button-enabled');
            btn.classList.add('control-button-disabled');
        });

        // Enable buttons based on current state
        switch (this.currentState) {
            case 0: // Station Charging
            case 1: // Station Charging Completed
            case 4: // Paused
                startBtn.disabled = false;
                startBtn.classList.add('control-button-enabled');
                startBtn.classList.remove('control-button-disabled');
                break;

            case 2: // Mowing
                stopBtn.disabled = false;
                stopBtn.classList.add('control-button-enabled');
                stopBtn.classList.remove('control-button-disabled');
                
                homeBtn.disabled = false;
                homeBtn.classList.add('control-button-enabled');
                homeBtn.classList.remove('control-button-disabled');
                break;

            case 3: // Returning to Station
                stopBtn.disabled = false;
                stopBtn.classList.add('control-button-enabled');
                stopBtn.classList.remove('control-button-disabled');
                break;

            case 5: // Error
                ackErrorBtn.disabled = false;
                ackErrorBtn.classList.add('control-button-enabled');
                ackErrorBtn.classList.remove('control-button-disabled');
                break;
        }
    }

    updateStateDisplay() {
        const statusElement = document.getElementById('remoteCurrentStatus');
        if (statusElement && this.currentState !== null) {
            const stateName = window.lawnmowerAPI.constructor.getStateName(this.currentState);
            const stateClass = window.lawnmowerAPI.constructor.getStateClass(this.currentState);
            
            statusElement.textContent = stateName;
            statusElement.className = `text-lg font-semibold ${stateClass}`;
        }
    }

    async sendCommand(actionId, actionName) {
        if (!this.currentDevice) return;

        this.showCommandFeedback(`Sending ${actionName} command...`, 'info');

        try {
            await window.lawnmowerAPI.controlLawnmower(this.currentDevice.id, actionId);
            this.showCommandFeedback(`${actionName} command sent successfully`, 'success');
            
            // Command was successful - update will come via real-time updates
            setTimeout(() => this.hideCommandFeedback(), 3000);

        } catch (error) {
            console.error(`Failed to send ${actionName} command:`, error);
            
            let errorMessage = `Failed to send ${actionName} command`;
            if (error.message.includes('400')) {
                errorMessage = `${actionName} command not valid in current state`;
            } else if (error.message.includes('404')) {
                errorMessage = 'Device not found';
            }
            
            this.showCommandFeedback(errorMessage, 'error');
            setTimeout(() => this.hideCommandFeedback(), 5000);
        }
    }

    async pingDevice() {
        if (!this.currentDevice) return;

        const pingBtn = document.getElementById('pingBtn');
        const pingText = document.getElementById('pingText');
        const connectionIndicator = document.getElementById('connectionIndicator');

        // Show loading state
        pingBtn.disabled = true;
        pingText.textContent = 'Pinging...';

        const startTime = Date.now();

        try {
            await window.lawnmowerAPI.pingLawnmower(this.currentDevice.id);
            const responseTime = Date.now() - startTime;
            
            this.connectionStatus = 'connected';
            this.lastPingTime = new Date();
            
            pingText.textContent = `Ping successful (${responseTime}ms) - ${this.lastPingTime.toLocaleTimeString()}`;
            pingText.className = 'text-xs text-green-600';
            
            // Update connection indicator
            connectionIndicator.innerHTML = `
                <div class="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span class="text-xs text-green-600">Connection: Online</span>
            `;

        } catch (error) {
            console.error('Ping failed:', error);
            
            this.connectionStatus = 'disconnected';
            
            let errorMessage = 'Ping failed - ';
            if (error.message.includes('503')) {
                errorMessage += 'Device unreachable';
            } else if (error.message.includes('404')) {
                errorMessage += 'Device not found';
            } else {
                errorMessage += 'Connection error';
            }
            
            pingText.textContent = errorMessage;
            pingText.className = 'text-xs text-red-600';
            
            // Update connection indicator
            connectionIndicator.innerHTML = `
                <div class="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                <span class="text-xs text-red-600">Connection: Offline</span>
            `;

        } finally {
            pingBtn.disabled = false;
        }
    }

    async performInitialPing() {
        // Wait a moment for dialog to render, then ping
        setTimeout(() => this.pingDevice(), 500);
    }

    showCommandFeedback(message, type) {
        const feedbackDiv = document.getElementById('commandFeedback');
        const feedbackText = document.getElementById('feedbackText');
        
        feedbackDiv.className = `p-3 rounded border-l-4 ${this.getFeedbackStyle(type)}`;
        feedbackText.textContent = message;
        feedbackDiv.classList.remove('hidden');
    }

    hideCommandFeedback() {
        const feedbackDiv = document.getElementById('commandFeedback');
        feedbackDiv.classList.add('hidden');
    }

    getFeedbackStyle(type) {
        switch (type) {
            case 'success': return 'bg-green-50 border-green-400 text-green-800';
            case 'error': return 'bg-red-50 border-red-400 text-red-800';
            case 'info': return 'bg-blue-50 border-blue-400 text-blue-800';
            default: return 'bg-gray-50 border-gray-400 text-gray-800';
        }
    }

    closeRemoteControlDialog() {
        if (this.currentDialog) {
            document.body.removeChild(this.currentDialog);
            this.currentDialog = null;
        }
    }

    // Public interface
    showRemoteControlDialog() {
        this._showRemoteControlDialog();
    }
}

// Export for use in main.js
window.RemoteControlManager = RemoteControlManager;
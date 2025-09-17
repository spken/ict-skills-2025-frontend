/**
 * Backend API Communication Module
 * Handles all REST API calls and SignalR connections to the lawnmower backend
 */

class LawnmowerAPI {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
        this.hubConnection = null;
        this.isConnected = false;
        this.subscribers = new Set();
        this.connectionHandlers = new Set();
        this.retryAttempts = 0;
        this.maxRetries = 3;
    }

    // Connection management
    onConnectionChange(handler) {
        this.connectionHandlers.add(handler);
    }

    offConnectionChange(handler) {
        this.connectionHandlers.delete(handler);
    }

    notifyConnectionChange(status) {
        this.isConnected = status;
        this.connectionHandlers.forEach(handler => handler(status));
    }

    // REST API Methods
    async request(endpoint, options = {}) {
        try {
            const url = `${this.baseUrl}${endpoint}`;
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Update connection status on successful request
            if (!this.isConnected) {
                this.notifyConnectionChange(true);
                this.retryAttempts = 0;
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return response;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            
            // Update connection status on failed request
            if (this.isConnected) {
                this.notifyConnectionChange(false);
            }
            
            throw error;
        }
    }

    // Lawnmower CRUD operations
    async getLawnmowers() {
        return await this.request('/api/lawnmowers');
    }

    async getLawnmower(id) {
        return await this.request(`/api/lawnmowers/${id}`);
    }

    async createLawnmower(data) {
        return await this.request('/api/lawnmowers', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateLawnmower(id, data) {
        return await this.request(`/api/lawnmowers/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteLawnmower(id) {
        return await this.request(`/api/lawnmowers/${id}`, {
            method: 'DELETE'
        });
    }

    // Avatar operations
    async getLawnmowerAvatar(id) {
        try {
            const response = await this.request(`/api/lawnmowers/${id}/avatar`);
            if (response.status === 204) {
                return null; // No avatar
            }
            return response;
        } catch (error) {
            if (error.message.includes('404')) {
                return null;
            }
            throw error;
        }
    }

    async uploadLawnmowerAvatar(id, file) {
        const formData = new FormData();
        formData.append('avatar', file);
        
        return await fetch(`${this.baseUrl}/api/lawnmowers/${id}/avatar`, {
            method: 'POST',
            body: formData
        });
    }

    async deleteLawnmowerAvatar(id) {
        return await this.request(`/api/lawnmowers/${id}/avatar`, {
            method: 'DELETE'
        });
    }

    // Measurement operations
    async getCurrentBattery(id) {
        return await this.request(`/api/lawnmowers/${id}/battery/current`);
    }

    async getBatteryHistory(id, from, to) {
        const params = new URLSearchParams({
            from: from.toISOString(),
            to: to.toISOString()
        });
        return await this.request(`/api/lawnmowers/${id}/battery/history?${params}`);
    }

    async getCurrentGps(id) {
        return await this.request(`/api/lawnmowers/${id}/gps/current`);
    }

    async getGpsHistory(id, from, to) {
        const params = new URLSearchParams({
            from: from.toISOString(),
            to: to.toISOString()
        });
        return await this.request(`/api/lawnmowers/${id}/gps/history?${params}`);
    }

    async getCurrentState(id) {
        return await this.request(`/api/lawnmowers/${id}/state/current`);
    }

    async getStateHistory(id, from, to) {
        const params = new URLSearchParams({
            from: from.toISOString(),
            to: to.toISOString()
        });
        return await this.request(`/api/lawnmowers/${id}/state/history?${params}`);
    }

    // Import operations
    async importBatteryMeasurements(id, measurements) {
        return await this.request(`/api/lawnmowers/${id}/battery/import`, {
            method: 'POST',
            body: JSON.stringify({ measurements })
        });
    }

    async importGpsMeasurements(id, measurements) {
        return await this.request(`/api/lawnmowers/${id}/gps/import`, {
            method: 'POST',
            body: JSON.stringify({ measurements })
        });
    }

    async importStateMeasurements(id, measurements) {
        return await this.request(`/api/lawnmowers/${id}/state/import`, {
            method: 'POST',
            body: JSON.stringify({ measurements })
        });
    }

    // Remote control operations
    async pingLawnmower(id) {
        return await this.request(`/api/lawnmowers/${id}/remote-control/ping`);
    }

    async controlLawnmower(id, action) {
        return await this.request(`/api/lawnmowers/${id}/remote-control/action/${action}`, {
            method: 'POST'
        });
    }

    // SignalR Hub Connection
    async initializeSignalR() {
        try {
            this.hubConnection = new signalR.HubConnectionBuilder()
                .withUrl(`${this.baseUrl}/hubs/measurements`)
                .withAutomaticReconnect({
                    nextRetryDelayInMilliseconds: retryContext => {
                        if (retryContext.previousRetryCount === 0) {
                            return 0;
                        }
                        return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
                    }
                })
                .build();

            // Set up event handlers
            this.hubConnection.onreconnecting(() => {
                console.log('SignalR reconnecting...');
                this.notifyConnectionChange(false);
            });

            this.hubConnection.onreconnected(() => {
                console.log('SignalR reconnected');
                this.notifyConnectionChange(true);
                // Re-subscribe to all lawnmowers
                this.resubscribeAll();
            });

            this.hubConnection.onclose(() => {
                console.log('SignalR connection closed');
                this.notifyConnectionChange(false);
            });

            // Register measurement callbacks
            this.hubConnection.on('ReceiveBatteryMeasurement', (data) => {
                this.notifySubscribers('battery', data);
            });

            this.hubConnection.on('ReceiveGpsMeasurement', (data) => {
                this.notifySubscribers('gps', data);
            });

            this.hubConnection.on('ReceiveStateMeasurement', (data) => {
                this.notifySubscribers('state', data);
            });

            // Start the connection
            await this.hubConnection.start();
            console.log('SignalR connected');
            this.notifyConnectionChange(true);

        } catch (error) {
            console.error('SignalR connection failed:', error);
            this.notifyConnectionChange(false);
            throw error;
        }
    }

    async subscribeToLawnmower(lawnmowerId) {
        if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.hubConnection.invoke('SubscribeLawnmower', lawnmowerId);
                this.subscribers.add(lawnmowerId);
                console.log(`Subscribed to lawnmower ${lawnmowerId}`);
            } catch (error) {
                console.error(`Failed to subscribe to lawnmower ${lawnmowerId}:`, error);
                throw error;
            }
        }
    }

    async unsubscribeFromLawnmower(lawnmowerId) {
        if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.hubConnection.invoke('UnsubscribeLawnmower', lawnmowerId);
                this.subscribers.delete(lawnmowerId);
                console.log(`Unsubscribed from lawnmower ${lawnmowerId}`);
            } catch (error) {
                console.error(`Failed to unsubscribe from lawnmower ${lawnmowerId}:`, error);
            }
        }
    }

    async resubscribeAll() {
        for (const lawnmowerId of this.subscribers) {
            try {
                await this.hubConnection.invoke('SubscribeLawnmower', lawnmowerId);
            } catch (error) {
                console.error(`Failed to resubscribe to lawnmower ${lawnmowerId}:`, error);
            }
        }
    }

    // Event handling for real-time data
    measurementHandlers = new Map();

    onMeasurement(type, handler) {
        if (!this.measurementHandlers.has(type)) {
            this.measurementHandlers.set(type, new Set());
        }
        this.measurementHandlers.get(type).add(handler);
    }

    offMeasurement(type, handler) {
        if (this.measurementHandlers.has(type)) {
            this.measurementHandlers.get(type).delete(handler);
        }
    }

    notifySubscribers(type, data) {
        if (this.measurementHandlers.has(type)) {
            this.measurementHandlers.get(type).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${type} measurement handler:`, error);
                }
            });
        }
    }

    // State mapping utilities
    static getStateName(stateId) {
        const stateNames = {
            0: 'Station Charging',
            1: 'Station Charging Completed',
            2: 'Mowing',
            3: 'Returning to Station',
            4: 'Paused',
            5: 'Error'
        };
        return stateNames[stateId] || 'Unknown';
    }

    static getStateClass(stateId) {
        const stateClasses = {
            0: 'status-charging',
            1: 'status-charging',
            2: 'status-mowing',
            3: 'status-returning',
            4: 'status-paused',
            5: 'status-error'
        };
        return stateClasses[stateId] || '';
    }

    // Remote control action mapping
    static getRemoteActions() {
        return {
            START: 0,
            STOP: 1,
            HOME: 2,
            ACK_ERROR: 3
        };
    }

    // Utility methods
    async checkConnection() {
        try {
            await this.getLawnmowers();
            return true;
        } catch (error) {
            return false;
        }
    }

    async disconnect() {
        if (this.hubConnection) {
            try {
                await this.hubConnection.stop();
            } catch (error) {
                console.error('Error stopping SignalR connection:', error);
            }
        }
        this.subscribers.clear();
        this.measurementHandlers.clear();
        this.connectionHandlers.clear();
    }

    // Data validation utilities
    static validateLawnmowerData(data) {
        const errors = [];
        
        if (!data.name || data.name.trim() === '') {
            errors.push('Name is required');
        }
        
        if (!data.address || data.address.trim() === '') {
            errors.push('Address is required');
        } else {
            // Validate IP:Port format
            const addressPattern = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
            if (!addressPattern.test(data.address.trim())) {
                errors.push('Address must be in format IP:PORT (e.g., 192.168.1.42:5467)');
            }
        }
        
        return errors;
    }

    // Format utilities
    static formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    }

    static formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI/180; // φ, λ in radians
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distance in meters
    }
}

// Export as global instance
window.lawnmowerAPI = new LawnmowerAPI();
/**
 * Configuration Manager Component
 * Handles client-side configuration viewing and management
 */

class ConfigurationManager {
    constructor(app) {
        this.app = app;
        this.currentDialog = null;
        this.config = {};
    }

    async showConfigurationDialog() {
        try {
            // Load current configuration
            const result = await window.electronAPI.loadConfig();
            this.config = result.success ? result.config : this.getDefaultConfig();

            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = `
                <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
                    <div class="px-6 py-4 border-b border-gray-200">
                        <h3 class="text-lg font-semibold text-gray-900">Configuration Settings</h3>
                        <p class="text-sm text-gray-600 mt-1">Current application configuration loaded from config file</p>
                    </div>
                    
                    <div class="px-6 py-4">
                        <div class="overflow-auto max-h-96">
                            <table class="min-w-full">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Setting</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                    </tr>
                                </thead>
                                <tbody class="bg-white divide-y divide-gray-200">
                                    ${this.generateConfigRows()}
                                </tbody>
                            </table>
                        </div>
                        
                        <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                            <div class="flex">
                                <svg class="w-5 h-5 text-blue-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
                                </svg>
                                <div class="text-sm">
                                    <p class="text-blue-800 font-medium">Configuration Management</p>
                                    <p class="text-blue-700 mt-1">
                                        Configuration is automatically loaded from the config file next to the executable. 
                                        To modify settings, edit the config file with a text editor and restart the application.
                                    </p>
                                    <p class="text-blue-600 mt-2 text-xs">
                                        Config file location: <code class="bg-blue-100 px-1 rounded">[executable-name].config</code>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                        <div class="text-xs text-gray-500">
                            Configuration loaded: ${new Date().toLocaleString()}
                        </div>
                        <div class="flex space-x-3">
                            <button type="button" id="refreshConfigBtn" class="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors text-sm">
                                Refresh
                            </button>
                            <button type="button" id="closeConfigBtn" class="px-4 py-2 bg-forest text-white rounded hover:bg-greenbot transition-colors">
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            this.currentDialog = overlay;
            this.setupConfigurationEvents();

        } catch (error) {
            console.error('Failed to load configuration:', error);
            this.app.showToast('Failed to load configuration', 'error');
        }
    }

    generateConfigRows() {
        const settingsInfo = {
            'StuckDetectionThreshold': {
                description: 'Time in seconds after which a device is considered stuck if GPS coordinates do not change',
                unit: 'seconds',
                range: '10-1800'
            },
            'DefaultView': {
                description: 'Default view mode when opening the cockpit (Live or History)',
                unit: '',
                range: 'Live, History'
            },
            'LiveRange': {
                description: 'Time span displayed in Live mode',
                unit: '',
                range: 'Text format (e.g., "up to 5 minutes")'
            },
            'HistoryRange': {
                description: 'Time span displayed in History mode',
                unit: '',
                range: 'Text format (e.g., "last 60 minutes")'
            },
            'BatteryLowThreshold': {
                description: 'Battery percentage below which low battery warnings are shown',
                unit: 'percent',
                range: '1-50'
            },
            'RefreshInterval': {
                description: 'Polling interval in seconds (only used if real-time updates are not available)',
                unit: 'seconds',
                range: '1-30'
            }
        };

        return Object.entries(this.config).map(([key, value]) => {
            const info = settingsInfo[key] || { description: 'Configuration setting', unit: '', range: '' };
            const displayValue = this.formatConfigValue(value, info.unit);
            
            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm font-medium text-gray-900">${key}</td>
                    <td class="px-4 py-3 text-sm text-gray-700">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-greenbot text-white">
                            ${displayValue}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600">
                        <div>${info.description}</div>
                        ${info.range ? `<div class="text-xs text-gray-500 mt-1">Range: ${info.range}</div>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

    formatConfigValue(value, unit) {
        if (typeof value === 'boolean') {
            return value ? 'Enabled' : 'Disabled';
        }
        if (typeof value === 'number' && unit) {
            return `${value} ${unit}`;
        }
        return String(value);
    }

    setupConfigurationEvents() {
        const refreshBtn = document.getElementById('refreshConfigBtn');
        const closeBtn = document.getElementById('closeConfigBtn');

        refreshBtn.addEventListener('click', () => this.refreshConfiguration());
        closeBtn.addEventListener('click', () => this.closeConfigurationDialog());

        // Close on overlay click
        this.currentDialog.addEventListener('click', (e) => {
            if (e.target === this.currentDialog) this.closeConfigurationDialog();
        });
    }

    async refreshConfiguration() {
        const refreshBtn = document.getElementById('refreshConfigBtn');
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';

        try {
            // Close current dialog and reopen with fresh data
            this.closeConfigurationDialog();
            await this.showConfigurationDialog();
            this.app.showToast('Configuration refreshed', 'success');
        } catch (error) {
            console.error('Failed to refresh configuration:', error);
            this.app.showToast('Failed to refresh configuration', 'error');
        }
    }

    getDefaultConfig() {
        return {
            StuckDetectionThreshold: 90,
            DefaultView: 'Live',
            LiveRange: 'up to 5 minutes',
            HistoryRange: 'last 60 minutes',
            BatteryLowThreshold: 10,
            RefreshInterval: 5
        };
    }

    closeConfigurationDialog() {
        if (this.currentDialog) {
            document.body.removeChild(this.currentDialog);
            this.currentDialog = null;
        }
    }

    // Public interface
    showConfiguration() {
        this.showConfigurationDialog();
    }
}

// Export for use in main.js
window.ConfigurationManager = ConfigurationManager;
/**
 * Import/Export Manager Component
 * Handles mower data import/export with validation and progress tracking
 */

class ImportExportManager {
    constructor(app) {
        this.app = app;
        this.currentDialog = null;
        this.importProgress = null;
    }

    // Import Mowers Dialog
    async showImportDialog() {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">Import mowers</h3>
                </div>
                
                <div class="px-6 py-4">
                    <!-- File Selection -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Select JSON file</label>
                        <div class="flex items-center space-x-3">
                            <button type="button" id="selectFileBtn" class="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50 transition-colors">
                                File...
                            </button>
                            <span id="selectedFileName" class="text-sm text-gray-600 italic">No file selected</span>
                        </div>
                        <input type="file" id="importFileInput" class="hidden" accept=".json">
                    </div>

                    <!-- Progress Area -->
                    <div id="progressArea" class="mb-4 hidden">
                        <div class="text-sm font-medium text-gray-700 mb-2" id="progressStatus">validating...</div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div id="progressBar" class="bg-greenbot h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                        <div id="progressSummary" class="text-xs text-gray-600 mt-2"></div>
                    </div>

                    <!-- Validation Results Table -->
                    <div id="resultsContainer" class="hidden">
                        <div class="overflow-auto max-h-64 border rounded">
                            <table class="min-w-full">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                                    </tr>
                                </thead>
                                <tbody id="resultsTableBody" class="bg-white divide-y divide-gray-200">
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button type="button" id="cancelImportBtn" class="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancel / Close
                    </button>
                    <button type="button" id="startImportBtn" class="px-4 py-2 bg-forest text-white rounded hover:bg-greenbot transition-colors" disabled>
                        <span id="importBtnText">Start import</span>
                        <div id="importBtnSpinner" class="hidden inline-block ml-2 spinner"></div>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentDialog = overlay;
        this.setupImportDialogEvents();
    }

    setupImportDialogEvents() {
        const selectFileBtn = document.getElementById('selectFileBtn');
        const fileInput = document.getElementById('importFileInput');
        const startImportBtn = document.getElementById('startImportBtn');
        const cancelBtn = document.getElementById('cancelImportBtn');

        selectFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileSelection(e.target.files[0]));
        startImportBtn.addEventListener('click', () => this.executeImport());
        cancelBtn.addEventListener('click', () => this.closeImportDialog());

        // Close on overlay click
        this.currentDialog.addEventListener('click', (e) => {
            if (e.target === this.currentDialog) this.closeImportDialog();
        });
    }

    async handleFileSelection(file) {
        if (!file) return;

        document.getElementById('selectedFileName').textContent = file.name;
        document.getElementById('progressArea').classList.remove('hidden');
        document.getElementById('resultsContainer').classList.add('hidden');
        
        try {
            const content = await this.readFileContent(file);
            const data = JSON.parse(content);
            await this.validateImportData(data);
        } catch (error) {
            this.showImportError('Invalid JSON file: ' + error.message);
        }
    }

    async validateImportData(data) {
        this.updateProgress('Validating...', 20);
        
        if (!data.mowers || !Array.isArray(data.mowers)) {
            throw new Error('File must contain a "mowers" array');
        }

        const existingMowers = await window.lawnmowerAPI.getLawnmowers();
        const results = [];

        for (let i = 0; i < data.mowers.length; i++) {
            const mower = data.mowers[i];
            const progress = 20 + (i / data.mowers.length) * 60;
            this.updateProgress(`Validating ${i + 1}/${data.mowers.length}...`, progress);

            const result = {
                name: mower.name || 'Unknown',
                address: mower.address || 'Unknown',
                status: 'New',
                error: ''
            };

            // Validate required fields
            if (!mower.name) result.error = 'Name missing';
            else if (!mower.address) result.error = 'Address missing';
            else {
                // Check for existing mower by ID or address
                const existing = existingMowers.find(m => 
                    (mower.id && m.id === mower.id) || 
                    m.address === mower.address
                );
                
                if (existing) {
                    result.status = 'Update';
                }

                // Validate address format
                if (!/^(\d{1,3}\.){3}\d{1,3}:\d+$/.test(mower.address)) {
                    result.error = 'Invalid address format';
                    result.status = 'Error';
                }
            }

            if (result.error && result.status !== 'Error') {
                result.status = 'Error';
            }

            results.push(result);
        }

        this.updateProgress('Validation complete', 100);
        this.showValidationResults(results);
    }

    showValidationResults(results) {
        const tableBody = document.getElementById('resultsTableBody');
        const startBtn = document.getElementById('startImportBtn');
        
        const newCount = results.filter(r => r.status === 'New').length;
        const updateCount = results.filter(r => r.status === 'Update').length;
        const errorCount = results.filter(r => r.status === 'Error').length;

        document.getElementById('progressSummary').textContent = 
            `${results.length} mowers found (${newCount} new, ${updateCount} updated, ${errorCount} error)`;

        const rowsHtml = results.map(result => `
            <tr class="${result.status === 'Error' ? 'bg-red-50' : ''}">
                <td class="px-4 py-2 text-sm text-gray-900">${result.name}</td>
                <td class="px-4 py-2 text-sm text-gray-900">${result.address}</td>
                <td class="px-4 py-2">
                    <span class="inline-flex px-2 py-1 text-xs rounded ${this.getStatusStyle(result.status)}">
                        ${result.status}
                    </span>
                </td>
                <td class="px-4 py-2 text-sm text-red-600">${result.error}</td>
            </tr>
        `).join('');

        tableBody.innerHTML = rowsHtml;
        document.getElementById('resultsContainer').classList.remove('hidden');
        
        startBtn.disabled = errorCount === results.length;
        this.importResults = results;
    }

    async executeImport() {
        if (!this.importResults) return;

        const startBtn = document.getElementById('startImportBtn');
        const btnText = document.getElementById('importBtnText');
        const btnSpinner = document.getElementById('importBtnSpinner');

        startBtn.disabled = true;
        btnText.classList.add('hidden');
        btnSpinner.classList.remove('hidden');

        try {
            const fileInput = document.getElementById('importFileInput');
            const content = await this.readFileContent(fileInput.files[0]);
            const data = JSON.parse(content);

            let imported = 0;
            const validMowers = data.mowers.filter((_, i) => 
                this.importResults[i].status !== 'Error'
            );

            for (let i = 0; i < validMowers.length; i++) {
                const mower = validMowers[i];
                const progress = (i / validMowers.length) * 100;
                this.updateProgress(`Importing ${i + 1}/${validMowers.length}...`, progress);

                try {
                    let savedMower;
                    
                    if (this.importResults.find(r => r.name === mower.name)?.status === 'Update') {
                        const existing = (await window.lawnmowerAPI.getLawnmowers())
                            .find(m => m.address === mower.address);
                        savedMower = await window.lawnmowerAPI.updateLawnmower(existing.id, {
                            name: mower.name,
                            address: mower.address
                        });
                    } else {
                        savedMower = await window.lawnmowerAPI.createLawnmower({
                            name: mower.name,
                            address: mower.address
                        });
                    }

                    // Import avatar if provided
                    if (mower.avatar?.dataUrl) {
                        await this.importAvatar(savedMower.id, mower.avatar.dataUrl);
                    }

                    // Import history if provided
                    if (mower.history) {
                        await this.importHistory(savedMower.id, mower.history);
                    }

                    imported++;
                } catch (error) {
                    console.error(`Failed to import ${mower.name}:`, error);
                }
            }

            this.updateProgress('Import complete', 100);
            this.app.showToast(`Successfully imported ${imported} mowers`, 'success');
            
            // Refresh mower list
            await this.app.loadLawnmowers();
            
            setTimeout(() => this.closeImportDialog(), 1000);

        } catch (error) {
            console.error('Import failed:', error);
            this.app.showToast('Import failed: ' + error.message, 'error');
        } finally {
            startBtn.disabled = false;
            btnText.classList.remove('hidden');
            btnSpinner.classList.add('hidden');
        }
    }

    async importAvatar(mowerId, dataUrl) {
        try {
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            const file = new File([blob], 'avatar.png', { type: blob.type });
            await window.lawnmowerAPI.uploadLawnmowerAvatar(mowerId, file);
        } catch (error) {
            console.error('Avatar import failed:', error);
        }
    }

    async importHistory(mowerId, history) {
        try {
            if (history.battery?.length) {
                const batteryData = history.battery.map(item => ({
                    timestamp: item.ts,
                    batteryLevel: item.percent
                }));
                await window.lawnmowerAPI.importBatteryMeasurements(mowerId, batteryData);
            }

            if (history.gps?.length) {
                const gpsData = history.gps.map(item => ({
                    timestamp: item.ts,
                    latitude: item.lat,
                    longitude: item.lon
                }));
                await window.lawnmowerAPI.importGpsMeasurements(mowerId, gpsData);
            }

            if (history.statuses?.length) {
                const stateData = history.statuses.map(item => ({
                    timestamp: item.ts,
                    state: this.parseStateValue(item.state)
                }));
                await window.lawnmowerAPI.importStateMeasurements(mowerId, stateData);
            }
        } catch (error) {
            console.error('History import failed:', error);
        }
    }

    // Export Dialog
    async showExportDialog() {
        if (!this.app.currentDevice) {
            this.app.showToast('Please select a device to export', 'warning');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">Export mower</h3>
                </div>
                
                <div class="px-6 py-4 space-y-4">
                    <!-- Device Info -->
                    <div class="flex items-center space-x-3 p-3 bg-gray-50 rounded">
                        <div class="w-12 h-12 bg-gray-200 rounded overflow-hidden flex items-center justify-center">
                            <span class="text-xs text-gray-500">Avatar</span>
                        </div>
                        <div>
                            <div class="font-medium">${this.app.currentDevice.name}</div>
                            <div class="text-sm text-gray-600">${this.app.currentDevice.address}</div>
                        </div>
                    </div>

                    <!-- Export Options -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-3">Export options:</label>
                        <div class="space-y-2">
                            <label class="flex items-center">
                                <input type="radio" name="exportType" value="current" class="mr-2" checked>
                                <span class="text-sm">Current data only</span>
                            </label>
                            <label class="flex items-center">
                                <input type="radio" name="exportType" value="full" class="mr-2">
                                <span class="text-sm">Full history</span>
                            </label>
                        </div>
                    </div>

                    <!-- Progress -->
                    <div id="exportProgress" class="hidden">
                        <div class="text-sm text-gray-600 mb-2">export running...</div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div id="exportProgressBar" class="bg-greenbot h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                        </div>
                    </div>

                    <!-- File Path -->
                    <div id="exportResult" class="hidden p-3 bg-green-50 border border-green-200 rounded">
                        <div class="text-sm text-green-800" id="exportPath"></div>
                    </div>
                </div>

                <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button type="button" id="cancelExportBtn" class="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancel / Close
                    </button>
                    <button type="button" id="startExportBtn" class="px-4 py-2 bg-forest text-white rounded hover:bg-greenbot transition-colors">
                        Start export
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentDialog = overlay;
        this.setupExportDialogEvents();
    }

    setupExportDialogEvents() {
        const startBtn = document.getElementById('startExportBtn');
        const cancelBtn = document.getElementById('cancelExportBtn');

        startBtn.addEventListener('click', () => this.executeExport());
        cancelBtn.addEventListener('click', () => this.closeExportDialog());

        // Close on overlay click
        this.currentDialog.addEventListener('click', (e) => {
            if (e.target === this.currentDialog) this.closeExportDialog();
        });
    }

    async executeExport() {
        const exportType = document.querySelector('input[name="exportType"]:checked').value;
        const progressDiv = document.getElementById('exportProgress');
        const resultDiv = document.getElementById('exportResult');
        
        progressDiv.classList.remove('hidden');
        
        try {
            const result = await window.electronAPI.showSaveDialog({
                defaultPath: `mower-${this.app.currentDevice.id}-${new Date().toISOString().split('T')[0]}.json`,
                filters: [
                    { name: 'JSON Files', extensions: ['json'] }
                ]
            });

            if (result.canceled) {
                progressDiv.classList.add('hidden');
                return;
            }

            this.updateExportProgress('Collecting device data...', 25);
            
            const exportData = await this.collectExportData(exportType === 'full');
            
            this.updateExportProgress('Generating file...', 75);
            
            const json = JSON.stringify(exportData, null, 2);
            await window.electronAPI.writeFile(result.filePath, json);
            
            this.updateExportProgress('Complete', 100);
            
            document.getElementById('exportPath').textContent = result.filePath;
            progressDiv.classList.add('hidden');
            resultDiv.classList.remove('hidden');
            
            this.app.showToast('Export completed successfully', 'success');

        } catch (error) {
            console.error('Export failed:', error);
            this.app.showToast('Export failed: ' + error.message, 'error');
            progressDiv.classList.add('hidden');
        }
    }

    async collectExportData(fullHistory) {
        const device = this.app.currentDevice;
        const exportData = {
            mowers: [{
                id: device.id,
                name: device.name,
                address: device.address,
                avatar: null,
                history: {
                    statuses: [],
                    battery: [],
                    gps: []
                }
            }]
        };

        const mower = exportData.mowers[0];

        // Get avatar
        try {
            const avatarResponse = await window.lawnmowerAPI.getLawnmowerAvatar(device.id);
            if (avatarResponse) {
                const blob = await avatarResponse.blob();
                const dataUrl = await this.blobToDataUrl(blob);
                mower.avatar = { dataUrl };
            }
        } catch (error) {
            console.log('No avatar available');
        }

        if (fullHistory) {
            // Get full history
            const now = new Date();
            const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

            try {
                const [battery, gps, states] = await Promise.all([
                    window.lawnmowerAPI.getBatteryHistory(device.id, oneYearAgo, now),
                    window.lawnmowerAPI.getGpsHistory(device.id, oneYearAgo, now),
                    window.lawnmowerAPI.getStateHistory(device.id, oneYearAgo, now)
                ]);

                mower.history.battery = battery.map(item => ({
                    ts: item.timestamp,
                    percent: item.batteryLevel
                }));

                mower.history.gps = gps.map(item => ({
                    ts: item.timestamp,
                    lat: item.latitude,
                    lon: item.longitude
                }));

                mower.history.statuses = states.map(item => ({
                    ts: item.timestamp,
                    state: this.getStateName(item.state)
                }));

            } catch (error) {
                console.error('Failed to load history:', error);
            }
        } else {
            // Get current data only
            try {
                const [battery, gps, state] = await Promise.allSettled([
                    window.lawnmowerAPI.getCurrentBattery(device.id),
                    window.lawnmowerAPI.getCurrentGps(device.id),
                    window.lawnmowerAPI.getCurrentState(device.id)
                ]);

                if (battery.status === 'fulfilled') {
                    mower.history.battery = [{
                        ts: battery.value.timestamp,
                        percent: battery.value.batteryLevel
                    }];
                }

                if (gps.status === 'fulfilled') {
                    mower.history.gps = [{
                        ts: gps.value.timestamp,
                        lat: gps.value.latitude,
                        lon: gps.value.longitude
                    }];
                }

                if (state.status === 'fulfilled') {
                    mower.history.statuses = [{
                        ts: state.value.timestamp,
                        state: this.getStateName(state.value.state)
                    }];
                }
            } catch (error) {
                console.error('Failed to load current data:', error);
            }
        }

        return exportData;
    }

    // Utility methods
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }

    blobToDataUrl(blob) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(blob);
        });
    }

    updateProgress(status, percent) {
        document.getElementById('progressStatus').textContent = status;
        document.getElementById('progressBar').style.width = percent + '%';
    }

    updateExportProgress(status, percent) {
        const statusEl = document.querySelector('#exportProgress .text-sm');
        if (statusEl) statusEl.textContent = status;
        document.getElementById('exportProgressBar').style.width = percent + '%';
    }

    getStatusStyle(status) {
        switch (status) {
            case 'New': return 'bg-green-100 text-green-800';
            case 'Update': return 'bg-blue-100 text-blue-800';
            case 'Error': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    parseStateValue(state) {
        const stateMap = {
            'StationCharging': 0,
            'StationChargingCompleted': 1,
            'Mowing': 2,
            'ReturningToStation': 3,
            'Paused': 4,
            'Error': 5
        };
        return stateMap[state] !== undefined ? stateMap[state] : parseInt(state);
    }

    getStateName(stateId) {
        return window.lawnmowerAPI.constructor.getStateName(stateId);
    }

    showImportError(message) {
        document.getElementById('progressSummary').textContent = message;
        document.getElementById('progressSummary').className = 'text-xs text-red-600 mt-2';
    }

    closeImportDialog() {
        if (this.currentDialog) {
            document.body.removeChild(this.currentDialog);
            this.currentDialog = null;
        }
    }

    closeExportDialog() {
        if (this.currentDialog) {
            document.body.removeChild(this.currentDialog);
            this.currentDialog = null;
        }
    }

    // Public interface
    showImportMowersDialog() {
        this.showImportDialog();
    }

    showExportMowerDialog() {
        this.showExportDialog();
    }
}

// Export for use in main.js
window.ImportExportManager = ImportExportManager;
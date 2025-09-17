/**
 * Map Manager Component
 * Handles GPS visualization and path tracking
 */

class MapManager {
    constructor(app) {
        this.app = app;
        this.map = null;
        this.currentDevice = null;
        this.deviceMarker = null;
        this.pathLayer = null;
        this.stuckMarkers = [];
        this.pathPoints = [];
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        // Show loading indicator (non-blocking)
        this.showMapLoading();

        try {
            // Initialize Leaflet map immediately without waiting for tiles
            this.map = L.map('mapContainer', {
                zoomControl: true,
                attributionControl: false
            }).setView([47.3769, 8.5417], 13); // Default to Zurich

            // Add OpenStreetMap tiles
            const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            });

            // Add tiles to map immediately
            tileLayer.addTo(this.map);

            // Initialize path layer group
            this.pathLayer = L.layerGroup().addTo(this.map);

            // Add custom controls
            this.addMapControls();

            this.isInitialized = true;
            this.hideMapLoading();
            console.log('Map initialized successfully');

            // Optional: Hide loading after tiles load (but don't block initialization)
            tileLayer.on('load', () => {
                this.hideMapLoading();
            });

        } catch (error) {
            console.error('Failed to initialize map:', error);
            this.hideMapLoading();
            this.showMapError('Failed to initialize map');
        }
    }

    addMapControls() {
        // Center on device button
        const centerControl = L.control({ position: 'topright' });
        centerControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            div.innerHTML = `
                <a href="#" title="Center on device" role="button" aria-label="Center on device">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                    </svg>
                </a>
            `;
            div.style.backgroundColor = 'white';
            div.style.width = '30px';
            div.style.height = '30px';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.style.cursor = 'pointer';

            div.onclick = (e) => {
                e.preventDefault();
                this.centerOnDevice();
            };

            return div;
        };
        centerControl.addTo(this.map);

        // Clear path button
        const clearControl = L.control({ position: 'topright' });
        clearControl.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
            div.innerHTML = `
                <a href="#" title="Clear path" role="button" aria-label="Clear path">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </a>
            `;
            div.style.backgroundColor = 'white';
            div.style.width = '30px';
            div.style.height = '30px';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';
            div.style.cursor = 'pointer';
            div.style.marginTop = '5px';

            div.onclick = (e) => {
                e.preventDefault();
                this.clearPath();
            };

            return div;
        };
        clearControl.addTo(this.map);
    }

    setDevice(device) {
        this.currentDevice = device;
        this.clearPath();
        this.clearStuckMarkers();

        if (device && this.isInitialized) {
            this.loadDeviceHistory();
        }
    }

    async loadDeviceHistory() {
        if (!this.currentDevice) return;

        try {
            // Show loading overlay (only if map is initialized)
            if (this.isInitialized) {
                this.showMapLoading();
            }

            // Load GPS history for the current time range
            const timeRange = this.getTimeRange();
            const history = await window.lawnmowerAPI.getGpsHistory(
                this.currentDevice.id,
                timeRange.from,
                timeRange.to
            );

            this.pathPoints = history.map(point => ({
                lat: point.latitude,
                lng: point.longitude,
                timestamp: new Date(point.timestamp)
            }));

            this.renderPath();

            // If no GPS history, try to get current position
            if (this.pathPoints.length === 0) {
                try {
                    const currentGps = await window.lawnmowerAPI.getCurrentGps(this.currentDevice.id);
                    if (currentGps) {
                        this.updatePosition(currentGps.latitude, currentGps.longitude, new Date(currentGps.timestamp));
                    } else {
                        // No GPS data available - show placeholder
                        this.showNoGpsData();
                    }
                } catch (error) {
                    console.log('No current GPS data available');
                    this.showNoGpsData();
                }
            } else {
                // Center map on latest position
                const latest = this.pathPoints[this.pathPoints.length - 1];
                this.updatePosition(latest.lat, latest.lng, latest.timestamp);
                this.map.setView([latest.lat, latest.lng], 16);
            }

        } catch (error) {
            console.error('Failed to load device GPS history:', error);
            this.showNoGpsData();
        } finally {
            // Always hide loading overlay
            if (this.isInitialized) {
                this.hideMapLoading();
            }
        }
    }

    showMapLoading() {
        const container = document.getElementById('mapContainer');
        
        // Create loading overlay that doesn't replace the map container content
        let loadingOverlay = container.querySelector('.loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                backdrop-filter: blur(2px);
            `;
            
            loadingOverlay.innerHTML = `
                <div class="flex items-center">
                    <div class="spinner" style="
                        width: 20px;
                        height: 20px;
                        border: 2px solid #e5e7eb;
                        border-top: 2px solid #059669;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-right: 8px;
                    "></div>
                    <span class="loading-text" style="color: #374151; font-size: 14px;">Loading map...</span>
                </div>
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            `;
            
            // Ensure container has relative positioning
            if (container.style.position !== 'relative' && container.style.position !== 'absolute') {
                container.style.position = 'relative';
            }
            
            container.appendChild(loadingOverlay);
        }
    }

    hideMapLoading() {
        const container = document.getElementById('mapContainer');
        const loadingOverlay = container.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    showNoGpsData() {
        if (!this.isInitialized) return;

        // Show message overlay on map
        const noDataOverlay = L.control({ position: 'topleft' });
        noDataOverlay.onAdd = () => {
            const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control no-gps-overlay');
            div.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-200 rounded p-3 m-2 max-w-xs">
                    <div class="flex items-center">
                        <svg class="w-5 h-5 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
                        </svg>
                        <div class="text-sm">
                            <p class="font-medium text-yellow-800">No GPS data available</p>
                            <p class="text-yellow-700">Device location will appear here when GPS data is received</p>
                        </div>
                    </div>
                </div>
            `;
            return div;
        };
        
        noDataOverlay.addTo(this.map);

        // Remove overlay after 5 seconds
        setTimeout(() => {
            try {
                this.map.removeControl(noDataOverlay);
            } catch (e) {
                // Control might have been removed already
            }
        }, 5000);
    }

    getTimeRange() {
        const cockpit = this.app.cockpitManager;
        const now = new Date();
        const config = cockpit.getConfig();
        
        if (cockpit.isInLiveMode()) {
            return {
                from: new Date(now.getTime() - config.liveRange * 1000),
                to: now
            };
        } else {
            return {
                from: new Date(now.getTime() - config.historyRange * 1000),
                to: now
            };
        }
    }

    updatePosition(latitude, longitude, timestamp) {
        if (!this.isInitialized) return;

        const position = [latitude, longitude];
        
        // Update or create device marker
        if (this.deviceMarker) {
            this.deviceMarker.setLatLng(position);
        } else {
            this.createDeviceMarker(latitude, longitude);
        }

        // Add to path if in live mode
        if (this.app.cockpitManager.isInLiveMode()) {
            this.pathPoints.push({
                lat: latitude,
                lng: longitude,
                timestamp: timestamp
            });

            // Limit path points to prevent performance issues
            if (this.pathPoints.length > 1000) {
                this.pathPoints = this.pathPoints.slice(-500);
            }

            this.renderPath();
        }

        // Auto-center on first position update
        if (this.pathPoints.length === 1) {
            this.map.setView(position, 16);
        }
    }

    createDeviceMarker(latitude, longitude) {
        const position = [latitude, longitude];
        
        // Create custom icon using device avatar or default
        let iconHtml = `
            <div class="device-marker">
                <div class="device-marker-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#228B22">
                        <path d="M12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5M12,2A7,7 0 0,1 19,9C19,14.25 12,22 12,22C12,22 5,14.25 5,9A7,7 0 0,1 12,2M12,4A5,5 0 0,0 7,9C7,13 12,19.16 12,19.16C12,19.16 17,13 17,9A5,5 0 0,0 12,4Z"/>
                    </svg>
                </div>
                <div class="device-marker-pulse"></div>
            </div>
        `;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-device-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        this.deviceMarker = L.marker(position, { icon: customIcon })
            .bindPopup(() => {
                return `
                    <div class="device-popup">
                        <h4 class="font-semibold">${this.currentDevice ? this.currentDevice.name : 'Device'}</h4>
                        <p class="text-sm text-gray-600">${this.currentDevice ? this.currentDevice.address : 'Unknown address'}</p>
                        <p class="text-xs text-gray-500 mt-2">
                            Current Position:<br>
                            ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
                        </p>
                    </div>
                `;
            })
            .addTo(this.map);

        console.log('Device marker created at:', latitude, longitude);
    }

    renderPath() {
        if (!this.isInitialized || this.pathPoints.length === 0) return;

        // Clear existing path
        this.pathLayer.clearLayers();

        // Create path points as individual markers
        this.pathPoints.forEach((point, index) => {
            const circle = L.circleMarker([point.lat, point.lng], {
                radius: 3,
                fillColor: index === this.pathPoints.length - 1 ? '#39FF14' : '#228B22',
                color: '#7F8F3D',
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6
            }).bindTooltip(`${point.timestamp.toLocaleTimeString()}`, {
                direction: 'top',
                offset: [0, -5]
            });

            this.pathLayer.addLayer(circle);
        });

        // Connect points with a polyline
        if (this.pathPoints.length > 1) {
            const pathCoords = this.pathPoints.map(p => [p.lat, p.lng]);
            const polyline = L.polyline(pathCoords, {
                color: '#228B22',
                weight: 2,
                opacity: 0.7
            });

            this.pathLayer.addLayer(polyline);
        }
    }

    markStuckLocation(latitude, longitude) {
        if (!this.isInitialized) return;

        const stuckIcon = L.divIcon({
            html: `
                <div class="stuck-marker">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#F43333">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </div>
            `,
            className: 'custom-stuck-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const stuckMarker = L.marker([latitude, longitude], { icon: stuckIcon })
            .bindPopup('Device was stuck at this location')
            .addTo(this.map);

        this.stuckMarkers.push(stuckMarker);
    }

    centerOnDevice() {
        if (this.deviceMarker) {
            this.map.setView(this.deviceMarker.getLatLng(), 16);
        } else if (this.pathPoints.length > 0) {
            const latest = this.pathPoints[this.pathPoints.length - 1];
            this.map.setView([latest.lat, latest.lng], 16);
        } else {
            this.app.showToast('No device position available', 'warning');
        }
    }

    clearPath() {
        if (this.pathLayer) {
            this.pathLayer.clearLayers();
        }
        this.pathPoints = [];
    }

    clearStuckMarkers() {
        this.stuckMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.stuckMarkers = [];
    }

    showMapError(message) {
        const container = document.getElementById('mapContainer');
        container.innerHTML = `
            <div class="flex items-center justify-center h-full bg-gray-100">
                <div class="text-center max-w-md p-6">
                    <svg class="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"></path>
                    </svg>
                    <p class="text-gray-600 mb-4">${message}</p>
                    <button onclick="window.lawnmowerApp.initializeMap()" class="px-4 py-2 bg-greenbot text-white rounded hover:bg-forest transition-colors">
                        Retry
                    </button>
                </div>
            </div>
        `;
    }

    // Resize map when container is resized
    resize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }

    // Cleanup
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.isInitialized = false;
    }
}

// Export for use in main.js
window.MapManager = MapManager;
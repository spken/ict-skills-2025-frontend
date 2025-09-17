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

        try {
            // Initialize Leaflet map
            this.map = L.map('mapContainer', {
                zoomControl: true,
                attributionControl: false
            }).setView([47.3769, 8.5417], 13); // Default to Zurich

            // Add OpenStreetMap tiles
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);

            // Initialize path layer group
            this.pathLayer = L.layerGroup().addTo(this.map);

            // Add custom controls
            this.addMapControls();

            this.isInitialized = true;
            console.log('Map initialized successfully');

        } catch (error) {
            console.error('Failed to initialize map:', error);
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

        if (device) {
            this.loadDeviceHistory();
        }
    }

    async loadDeviceHistory() {
        if (!this.currentDevice) return;

        try {
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

            // Center map on latest position if available
            if (this.pathPoints.length > 0) {
                const latest = this.pathPoints[this.pathPoints.length - 1];
                this.updatePosition(latest.lat, latest.lng, latest.timestamp);
            }

        } catch (error) {
            console.error('Failed to load device GPS history:', error);
        }
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
    }

    createDeviceMarker(latitude, longitude) {
        const position = [latitude, longitude];
        
        // Create custom icon using device avatar or default
        let iconHtml = `
            <div class="device-marker">
                <div class="device-marker-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#228B22">
                        <path d="M12 2L13.09 6.26L18 7L13.09 7.74L12 12L10.91 7.74L6 7L10.91 6.26L12 2M4 14H8V18H4V14M16 14H20V18H16V14Z"/>
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
                        <h4 class="font-semibold">${this.currentDevice.name}</h4>
                        <p class="text-sm text-gray-600">${this.currentDevice.address}</p>
                        <p class="text-xs text-gray-500 mt-2">
                            Current Position:<br>
                            ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
                        </p>
                    </div>
                `;
            })
            .addTo(this.map);
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
                <div class="text-center">
                    <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3"></path>
                    </svg>
                    <p class="text-gray-600">${message}</p>
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
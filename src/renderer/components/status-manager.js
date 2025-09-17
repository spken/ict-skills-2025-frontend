/**
 * Status Manager Component
 * Handles status distribution pie charts and timeline visualization
 */

class StatusManager {
    constructor(app) {
        this.app = app;
        this.statusChart = null;
        this.currentDevice = null;
        this.statusData = [];
        this.timeline = [];
    }

    async initialize() {
        // Status colors matching the design system
        this.statusColors = {
            0: '#39FF14', // Station Charging - Neon green
            1: '#228B22', // Station Charging Completed - Forest green
            2: '#7F8F3D', // Mowing - GreenBot green
            3: '#FF7979', // Returning to Station - Coral red
            4: '#F43333', // Paused - Signal red
            5: '#B22222'  // Error - Fire brick
        };

        this.statusNames = {
            0: 'Station Charging',
            1: 'Charging Completed',
            2: 'Mowing',
            3: 'Returning to Station',
            4: 'Paused',
            5: 'Error'
        };
    }

    setDevice(device) {
        this.currentDevice = device;
        this.statusData = [];
        this.timeline = [];
        
        if (this.statusChart) {
            this.statusChart.destroy();
            this.statusChart = null;
        }
    }

    async loadStatusVisualization(isLiveMode = true) {
        if (!this.currentDevice) return;

        try {
            // Show loading
            this.showStatusLoading();

            // Get time range
            const timeRange = this.getTimeRange(isLiveMode);
            
            // Load status history
            const history = await window.lawnmowerAPI.getStateHistory(
                this.currentDevice.id,
                timeRange.from,
                timeRange.to
            );

            if (history.length === 0) {
                this.showNoStatusData();
                return;
            }

            // Process status data
            this.processStatusData(history, timeRange);
            
            // Render visualizations
            await this.renderStatusChart();
            this.renderTimeline();

        } catch (error) {
            console.error('Failed to load status data:', error);
            this.showStatusError('Failed to load status data');
        } finally {
            this.hideStatusLoading();
        }
    }

    processStatusData(history, timeRange) {
        // Sort by timestamp
        const sortedHistory = history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Calculate duration for each state
        const stateDurations = {};
        const timeline = [];
        
        for (let i = 0; i < sortedHistory.length; i++) {
            const current = sortedHistory[i];
            const currentTime = new Date(current.timestamp);
            const stateId = current.state;
            
            // Determine end time for this state
            let endTime;
            if (i < sortedHistory.length - 1) {
                endTime = new Date(sortedHistory[i + 1].timestamp);
            } else {
                // Last state extends to the end of the time range
                endTime = timeRange.to;
            }
            
            // Calculate duration in seconds
            const duration = (endTime - currentTime) / 1000;
            
            // Add to durations
            if (!stateDurations[stateId]) {
                stateDurations[stateId] = 0;
            }
            stateDurations[stateId] += duration;
            
            // Add to timeline
            timeline.push({
                stateId: stateId,
                stateName: this.statusNames[stateId],
                startTime: currentTime,
                endTime: endTime,
                duration: duration
            });
        }

        // Convert to chart data
        this.statusData = Object.entries(stateDurations).map(([stateId, duration]) => ({
            stateId: parseInt(stateId),
            stateName: this.statusNames[stateId],
            duration: duration,
            percentage: (duration / Object.values(stateDurations).reduce((a, b) => a + b, 0)) * 100,
            color: this.statusColors[stateId]
        }));

        this.timeline = timeline;
    }

    async renderStatusChart() {
        const canvas = document.getElementById('statusChart');
        if (!canvas || this.statusData.length === 0) return;

        const ctx = canvas.getContext('2d');

        // Prepare chart data
        const labels = this.statusData.map(item => item.stateName);
        const data = this.statusData.map(item => item.percentage);
        const colors = this.statusData.map(item => item.color);

        this.statusChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            generateLabels: (chart) => {
                                const data = chart.data;
                                return data.labels.map((label, index) => {
                                    const percentage = data.datasets[0].data[index];
                                    const duration = this.statusData[index].duration;
                                    return {
                                        text: `${label}: ${percentage.toFixed(1)}% (${this.formatDuration(duration)})`,
                                        fillStyle: colors[index],
                                        hidden: false,
                                        index: index
                                    };
                                });
                            },
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 11
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const index = context.dataIndex;
                                const item = this.statusData[index];
                                const percentage = item.percentage.toFixed(1);
                                const duration = this.formatDuration(item.duration);
                                return `${item.stateName}: ${percentage}% (${duration})`;
                            }
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    duration: 1000,
                    easing: 'easeInOutQuart'
                },
                cutout: '50%'
            }
        });
    }

    renderTimeline() {
        const timelineContainer = document.getElementById('statusTimeline');
        if (!timelineContainer || this.timeline.length === 0) return;

        // Group consecutive same states
        const groupedTimeline = this.groupConsecutiveStates(this.timeline);

        const timelineHtml = groupedTimeline.map((item, index) => {
            const startTime = item.startTime.toLocaleTimeString();
            const endTime = item.endTime.toLocaleTimeString();
            const duration = this.formatDuration(item.duration);
            
            return `
                <div class="timeline-item flex items-center py-2 px-3 rounded hover:bg-gray-50 transition-colors">
                    <div class="timeline-marker w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                         style="background-color: ${this.statusColors[item.stateId]}"></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between">
                            <span class="font-medium text-sm text-gray-900 truncate">
                                ${item.stateName}
                            </span>
                            <span class="text-xs text-gray-500 ml-2">
                                ${duration}
                            </span>
                        </div>
                        <div class="text-xs text-gray-600 mt-1">
                            ${startTime} - ${endTime}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        timelineContainer.innerHTML = timelineHtml;
    }

    groupConsecutiveStates(timeline) {
        if (timeline.length === 0) return [];

        const grouped = [];
        let currentGroup = { ...timeline[0] };

        for (let i = 1; i < timeline.length; i++) {
            const current = timeline[i];
            
            if (current.stateId === currentGroup.stateId && 
                Math.abs(current.startTime - currentGroup.endTime) < 60000) { // Within 1 minute
                // Extend current group
                currentGroup.endTime = current.endTime;
                currentGroup.duration += current.duration;
            } else {
                // Start new group
                grouped.push(currentGroup);
                currentGroup = { ...current };
            }
        }
        
        grouped.push(currentGroup);
        return grouped;
    }

    formatDuration(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        }
    }

    getTimeRange(isLiveMode) {
        const cockpit = this.app.cockpitManager;
        const now = new Date();
        const config = cockpit.getConfig();
        
        if (isLiveMode) {
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

    showStatusLoading() {
        const chartContainer = document.getElementById('statusChart')?.parentElement;
        const timelineContainer = document.getElementById('statusTimeline');
        
        // Show loading in chart area
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="flex items-center justify-center h-48">
                    <div class="flex items-center">
                        <div class="spinner"></div>
                        <span class="loading-text">Loading status data...</span>
                    </div>
                </div>
            `;
        }

        // Show loading in timeline area
        if (timelineContainer) {
            timelineContainer.innerHTML = `
                <div class="flex items-center justify-center h-48">
                    <div class="flex items-center">
                        <div class="spinner"></div>
                        <span class="loading-text">Loading timeline...</span>
                    </div>
                </div>
            `;
        }
    }

    hideStatusLoading() {
        // Restore chart canvas
        const chartContainer = document.getElementById('statusChart')?.parentElement;
        if (chartContainer) {
            chartContainer.innerHTML = `
                <h3 class="text-lg font-semibold mb-4">Status Distribution</h3>
                <div class="h-48">
                    <canvas id="statusChart"></canvas>
                </div>
            `;
        }
    }

    showNoStatusData() {
        const chartContainer = document.getElementById('statusChart')?.parentElement;
        const timelineContainer = document.getElementById('statusTimeline');
        
        const noDataHtml = `
            <div class="flex items-center justify-center h-48 text-gray-500">
                <div class="text-center">
                    <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                    <p class="text-sm">No status data available</p>
                    <p class="text-xs text-gray-400 mt-1">Status information will appear here when available</p>
                </div>
            </div>
        `;

        if (chartContainer) {
            chartContainer.innerHTML = `
                <h3 class="text-lg font-semibold mb-4">Status Distribution</h3>
                ${noDataHtml}
            `;
        }

        if (timelineContainer) {
            timelineContainer.innerHTML = noDataHtml;
        }
    }

    showStatusError(message) {
        const chartContainer = document.getElementById('statusChart')?.parentElement;
        const timelineContainer = document.getElementById('statusTimeline');
        
        const errorHtml = `
            <div class="flex items-center justify-center h-48 text-gray-500">
                <div class="text-center">
                    <svg class="w-12 h-12 mx-auto mb-3 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-sm text-red-600">${message}</p>
                </div>
            </div>
        `;

        if (chartContainer) {
            chartContainer.innerHTML = `
                <h3 class="text-lg font-semibold mb-4">Status Distribution</h3>
                ${errorHtml}
            `;
        }

        if (timelineContainer) {
            timelineContainer.innerHTML = errorHtml;
        }
    }

    // Export status data
    exportStatusData() {
        if (!this.statusData.length && !this.timeline.length) {
            this.app.showToast('No status data to export', 'warning');
            return;
        }

        const exportData = {
            distribution: this.statusData.map(item => ({
                stateName: item.stateName,
                duration: item.duration,
                percentage: item.percentage
            })),
            timeline: this.timeline.map(item => ({
                stateName: item.stateName,
                startTime: item.startTime.toISOString(),
                endTime: item.endTime.toISOString(),
                duration: item.duration
            }))
        };

        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `status-data-${this.currentDevice.name}-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.app.showToast('Status data exported successfully', 'success');
    }

    // Cleanup
    destroy() {
        if (this.statusChart) {
            this.statusChart.destroy();
            this.statusChart = null;
        }
    }
}

// Export for use in main.js
window.StatusManager = StatusManager;
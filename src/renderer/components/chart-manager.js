/**
 * Chart Manager Component
 * Handles battery trend charts with predictions and real-time updates
 */

class ChartManager {
    constructor(app) {
        this.app = app;
        this.batteryChart = null;
        this.currentDevice = null;
        this.batteryData = [];
        this.isLiveMode = true;
    }

    async initialize() {
        // Wait for Chart.js to be available
        await this.waitForChart();
        
        // Chart.js configuration
        Chart.defaults.font.family = 'Tahoma, sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#374151';
    }

    async waitForChart() {
        return new Promise((resolve) => {
            if (typeof Chart !== 'undefined') {
                resolve();
                return;
            }
            
            const checkChart = () => {
                if (typeof Chart !== 'undefined') {
                    resolve();
                } else {
                    setTimeout(checkChart, 100);
                }
            };
            
            checkChart();
        });
    }

    setDevice(device) {
        this.currentDevice = device;
        this.batteryData = [];
        
        if (this.batteryChart) {
            this.batteryChart.destroy();
            this.batteryChart = null;
        }
    }

    async loadBatteryChart(isLiveMode = true) {
        if (!this.currentDevice) return;

        this.isLiveMode = isLiveMode;

        // Clean up existing chart to prevent canvas reuse errors
        if (this.batteryChart) {
            this.batteryChart.destroy();
            this.batteryChart = null;
        }

        try {
            // Show loading
            this.showChartLoading('batteryChart');

            // Get time range
            const timeRange = this.getTimeRange();
            
            // Load battery history
            const history = await window.lawnmowerAPI.getBatteryHistory(
                this.currentDevice.id,
                timeRange.from,
                timeRange.to
            );

            this.batteryData = history.map(item => ({
                timestamp: new Date(item.timestamp),
                level: item.batteryLevel
            })).sort((a, b) => a.timestamp - b.timestamp);

            await this.renderBatteryChart();

        } catch (error) {
            console.error('Failed to load battery chart:', error);
            this.showChartError('batteryChart', 'Failed to load battery data');
        } finally {
            this.hideChartLoading('batteryChart');
        }
    }

    async renderBatteryChart() {
        const canvas = document.getElementById('batteryChart');
        if (!canvas) return;

        // Destroy existing chart if it exists
        if (this.batteryChart) {
            this.batteryChart.destroy();
            this.batteryChart = null;
        }

        const ctx = canvas.getContext('2d');

        // Prepare data for time series chart
        const chartData = this.batteryData.map(item => ({
            x: item.timestamp,
            y: item.level
        }));

        // Calculate prediction if in live mode
        let predictionData = [];
        let predictionLabel = '';
        
        if (this.isLiveMode && this.batteryData.length > 1) {
            const prediction = this.calculateBatteryPrediction();
            if (prediction) {
                predictionData = prediction.data;
                predictionLabel = prediction.label;
            }
        }

        // Create chart
        this.batteryChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Battery Level',
                        data: chartData,
                        borderColor: '#228B22',
                        backgroundColor: 'rgba(34, 139, 34, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1,
                        pointBackgroundColor: '#228B22',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    ...(predictionData.length > 0 ? [{
                        label: predictionLabel,
                        data: predictionData,
                        borderColor: '#FF7979',
                        backgroundColor: 'rgba(255, 121, 121, 0.1)',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.1,
                        pointBackgroundColor: '#FF7979',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 2
                    }] : [])
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            title: (context) => {
                                const date = new Date(context[0].parsed.x);
                                return date.toLocaleString();
                            },
                            label: (context) => {
                                const value = Math.round(context.parsed.y * 10) / 10;
                                return `${context.dataset.label}: ${value}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                minute: 'HH:mm',
                                hour: 'HH:mm',
                                day: 'MM/dd HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Battery Level (%)'
                        },
                        ticks: {
                            callback: (value) => `${value}%`
                        }
                    }
                },
                animation: {
                    duration: 750,
                    easing: 'easeInOutQuart'
                }
            }
        });

        // Add chart click handler for data point details
        canvas.onclick = (evt) => {
            const points = this.batteryChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
            
            if (points.length) {
                const firstPoint = points[0];
                const dataPoint = this.batteryData[firstPoint.index];
                if (dataPoint) {
                    this.showDataPointDetails(dataPoint, evt);
                }
            }
        };
    }

    calculateBatteryPrediction() {
        if (this.batteryData.length < 2) return null;

        const currentState = this.getCurrentDeviceState();
        const recentData = this.batteryData.slice(-10); // Use last 10 data points
        
        if (recentData.length < 2) return null;

        // Calculate trend
        const timeSpan = recentData[recentData.length - 1].timestamp - recentData[0].timestamp;
        const levelChange = recentData[recentData.length - 1].level - recentData[0].level;
        const ratePerMs = levelChange / timeSpan;

        const currentLevel = recentData[recentData.length - 1].level;
        const currentTime = recentData[recentData.length - 1].timestamp;

        let predictionPoints = [];
        let label = '';

        if (currentState === 0) { // Station Charging
            if (ratePerMs > 0) {
                // Charging - predict time to full
                const timeToFull = (100 - currentLevel) / (ratePerMs * 60000); // minutes
                const fullTime = new Date(currentTime.getTime() + timeToFull * 60000);
                
                predictionPoints = [
                    { x: currentTime, y: currentLevel },
                    { x: fullTime, y: 100 }
                ];
                label = `Charging complete: ${Math.round(timeToFull)} min`;
            }
        } else if ([2, 3, 4, 5].includes(currentState)) { // Mowing, Returning, Paused, Error
            if (ratePerMs < 0) {
                // Discharging - predict time to empty
                const timeToEmpty = currentLevel / (-ratePerMs * 60000); // minutes
                const emptyTime = new Date(currentTime.getTime() + timeToEmpty * 60000);
                
                predictionPoints = [
                    { x: currentTime, y: currentLevel },
                    { x: emptyTime, y: 0 }
                ];
                label = `Battery empty: ${Math.round(timeToEmpty)} min`;
            }
        }

        return predictionPoints.length > 0 ? { data: predictionPoints, label } : null;
    }

    getCurrentDeviceState() {
        // Get current state from cockpit manager
        if (this.app.cockpitManager && this.app.cockpitManager.lastStates) {
            return this.app.cockpitManager.lastStates.get(this.currentDevice?.id);
        }
        return 0; // Default to charging
    }

    updateBatteryChart(level, timestamp) {
        if (!this.batteryChart || !this.isLiveMode) return;

        // Add new data point
        this.batteryData.push({
            timestamp: new Date(timestamp),
            level: level
        });

        // Keep only recent data for live mode
        const cutoff = new Date(Date.now() - this.app.cockpitManager.getConfig().liveRange * 1000);
        this.batteryData = this.batteryData.filter(item => item.timestamp >= cutoff);

        // Update chart data
        const chart = this.batteryChart;
        chart.data.labels = this.batteryData.map(item => item.timestamp);
        chart.data.datasets[0].data = this.batteryData.map(item => item.level);

        // Recalculate prediction
        const prediction = this.calculateBatteryPrediction();
        if (prediction && chart.data.datasets.length > 1) {
            chart.data.datasets[1].data = prediction.data;
            chart.data.datasets[1].label = prediction.label;
        }

        chart.update('none'); // Update without animation for real-time
    }

    showDataPointDetails(dataPoint, event) {
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.innerHTML = `
            <div class="bg-gray-800 text-white p-3 rounded shadow-lg text-sm">
                <div class="font-semibold">${dataPoint.timestamp.toLocaleString()}</div>
                <div>Battery: ${Math.round(dataPoint.level * 10) / 10}%</div>
            </div>
        `;

        tooltip.style.position = 'fixed';
        tooltip.style.left = event.pageX + 10 + 'px';
        tooltip.style.top = event.pageY - 10 + 'px';
        tooltip.style.zIndex = '1000';
        tooltip.style.pointerEvents = 'none';

        document.body.appendChild(tooltip);

        setTimeout(() => {
            document.body.removeChild(tooltip);
        }, 3000);
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

    showChartLoading(chartId) {
        const chartElement = document.getElementById(chartId);
        if (!chartElement) return;
        
        const container = chartElement.parentElement;
        if (!container) return;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chart-loading-overlay';
        loadingDiv.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="flex items-center">
                    <div class="spinner"></div>
                    <span class="loading-text">Loading chart data...</span>
                </div>
            </div>
        `;
        container.appendChild(loadingDiv);
    }

    hideChartLoading(chartId) {
        const chartElement = document.getElementById(chartId);
        if (!chartElement) return;
        
        const container = chartElement.parentElement;
        if (!container) return;
        
        const loading = container.querySelector('.chart-loading-overlay');
        if (loading) {
            container.removeChild(loading);
        }
    }

    showChartError(chartId, message) {
        const chartElement = document.getElementById(chartId);
        if (!chartElement) return;
        
        const container = chartElement.parentElement;
        if (!container) return;
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'chart-error-overlay';
        errorDiv.innerHTML = `
            <div class="flex items-center justify-center h-full">
                <div class="text-center text-gray-600">
                    <svg class="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p class="text-sm">${message}</p>
                </div>
            </div>
        `;
        container.appendChild(errorDiv);
    }

    // Export chart data
    exportBatteryData() {
        if (!this.batteryData.length) {
            this.app.showToast('No battery data to export', 'warning');
            return;
        }

        const csvData = this.batteryData.map(item => ({
            timestamp: item.timestamp.toISOString(),
            level: item.level
        }));

        const csv = this.convertToCSV(csvData);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `battery-data-${this.currentDevice.name}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.app.showToast('Battery data exported successfully', 'success');
    }

    convertToCSV(data) {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => JSON.stringify(row[header])).join(','))
        ].join('\n');
        
        return csvContent;
    }

    // Cleanup
    destroy() {
        if (this.batteryChart) {
            this.batteryChart.destroy();
            this.batteryChart = null;
        }
    }
}

// Export for use in main.js
window.ChartManager = ChartManager;
/**
 * Device Management Component
 * Handles Add, Edit, Delete operations for lawnmowers
 */

class DeviceManager {
    constructor(app) {
        this.app = app;
        this.currentDialog = null;
        this.currentAvatarFile = null;
        this.editingDevice = null;
    }

    // Add Mower Dialog
    showAddDialog() {
        this.editingDevice = null;
        this.currentAvatarFile = null;
        this.showMowerDialog('Add mower', {
            name: '',
            address: '',
            avatar: null
        });
    }

    // Edit Mower Dialog
    showEditDialog(device) {
        this.editingDevice = device;
        this.currentAvatarFile = null;
        this.showMowerDialog('Edit mower', {
            name: device.name,
            address: device.address,
            avatar: null
        });
    }

    // Generic Mower Dialog (Add/Edit)
    showMowerDialog(title, initialData) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="px-6 py-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">${title}</h3>
                </div>
                
                <form id="mowerForm" class="px-6 py-4 space-y-4">
                    <!-- Avatar Section -->
                    <div class="flex items-start space-x-4">
                        <div class="flex-shrink-0">
                            <div id="avatarPreview" class="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 cursor-pointer hover:border-greenbot transition-colors">
                                <div id="avatarPlaceholder" class="text-gray-400 text-xs text-center">
                                    Click to<br>upload<br>avatar
                                </div>
                                <img id="avatarImage" class="w-full h-full object-cover hidden" alt="Avatar preview">
                            </div>
                            <input type="file" id="avatarInput" class="hidden" accept=".png,.jpg,.jpeg,.bmp">
                        </div>
                        <div class="flex-1 text-sm text-gray-600">
                            <p class="mb-2">Upload an avatar image for this lawnmower.</p>
                            <p>Supported formats: PNG, JPEG, BMP</p>
                            <p>Image will be automatically resized to fit.</p>
                        </div>
                    </div>

                    <!-- Name Field -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input type="text" id="mowerName" required
                            class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-greenbot focus:border-greenbot"
                            placeholder="Enter mower name" value="${initialData.name}">
                        <div id="nameError" class="text-red-500 text-xs mt-1 hidden"></div>
                    </div>

                    <!-- Address Field -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                        <input type="text" id="mowerAddress" required
                            class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-greenbot focus:border-greenbot"
                            placeholder="192.168.1.42:5467" value="${initialData.address}"
                            ${this.editingDevice ? 'disabled' : ''}>
                        <div id="addressError" class="text-red-500 text-xs mt-1 hidden"></div>
                        ${this.editingDevice ? '<p class="text-xs text-gray-500 mt-1">Address cannot be changed when editing</p>' : ''}
                    </div>

                    <!-- Form Errors -->
                    <div id="formErrors" class="hidden bg-red-50 border border-red-200 rounded p-3">
                        <ul id="errorList" class="text-red-700 text-sm space-y-1"></ul>
                    </div>
                </form>

                <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button type="button" id="cancelBtn" class="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                    <button type="submit" id="saveBtn" form="mowerForm" class="px-4 py-2 bg-forest text-white rounded hover:bg-greenbot transition-colors">
                        <span id="saveBtnText">${this.editingDevice ? 'Update' : 'Create'}</span>
                        <div id="saveBtnSpinner" class="hidden inline-block ml-2 spinner"></div>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentDialog = overlay;

        // Set up event listeners
        this.setupMowerDialogEvents();

        // Load existing avatar if editing
        if (this.editingDevice) {
            this.loadExistingAvatar();
        }
    }

    setupMowerDialogEvents() {
        const form = document.getElementById('mowerForm');
        const cancelBtn = document.getElementById('cancelBtn');
        const avatarPreview = document.getElementById('avatarPreview');
        const avatarInput = document.getElementById('avatarInput');

        // Form submission
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleMowerSubmit();
        });

        // Cancel button
        cancelBtn.addEventListener('click', () => {
            this.closeMowerDialog();
        });

        // Avatar upload
        avatarPreview.addEventListener('click', () => {
            avatarInput.click();
        });

        avatarInput.addEventListener('change', (e) => {
            this.handleAvatarUpload(e.target.files[0]);
        });

        // Close on overlay click
        this.currentDialog.addEventListener('click', (e) => {
            if (e.target === this.currentDialog) {
                this.closeMowerDialog();
            }
        });
    }

    async loadExistingAvatar() {
        try {
            const avatarResponse = await window.lawnmowerAPI.getLawnmowerAvatar(this.editingDevice.id);
            if (avatarResponse) {
                const blob = await avatarResponse.blob();
                const url = URL.createObjectURL(blob);
                this.displayAvatarPreview(url);
            }
        } catch (error) {
            console.error('Failed to load existing avatar:', error);
        }
    }

    handleAvatarUpload(file) {
        if (!file) return;

        // Validate file type
        const validTypes = ['image/png', 'image/jpeg', 'image/bmp'];
        if (!validTypes.includes(file.type)) {
            this.app.showToast('Please select a PNG, JPEG, or BMP image', 'error');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            this.app.showToast('Image file must be smaller than 5MB', 'error');
            return;
        }

        this.currentAvatarFile = file;
        
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.displayAvatarPreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }

    displayAvatarPreview(src) {
        const placeholder = document.getElementById('avatarPlaceholder');
        const image = document.getElementById('avatarImage');
        
        image.src = src;
        image.classList.remove('hidden');
        placeholder.classList.add('hidden');
    }

    async handleMowerSubmit() {
        const saveBtn = document.getElementById('saveBtn');
        const saveBtnText = document.getElementById('saveBtnText');
        const saveBtnSpinner = document.getElementById('saveBtnSpinner');

        // Clear previous errors
        this.clearFormErrors();

        // Get form data
        const name = document.getElementById('mowerName').value.trim();
        const address = document.getElementById('mowerAddress').value.trim();

        // Validate form
        const errors = this.validateMowerForm(name, address);
        if (errors.length > 0) {
            this.showFormErrors(errors);
            return;
        }

        // Show loading state
        saveBtn.disabled = true;
        saveBtnText.classList.add('hidden');
        saveBtnSpinner.classList.remove('hidden');

        try {
            let mower;
            
            if (this.editingDevice) {
                // Update existing mower
                mower = await window.lawnmowerAPI.updateLawnmower(this.editingDevice.id, {
                    name,
                    address: this.editingDevice.address // Keep original address
                });
                this.app.showToast(`${name} updated successfully`, 'success');
            } else {
                // Create new mower
                mower = await window.lawnmowerAPI.createLawnmower({
                    name,
                    address
                });
                this.app.showToast(`${name} created successfully`, 'success');
            }

            // Upload avatar if provided
            if (this.currentAvatarFile) {
                try {
                    await window.lawnmowerAPI.uploadLawnmowerAvatar(mower.id, this.currentAvatarFile);
                } catch (avatarError) {
                    console.error('Avatar upload failed:', avatarError);
                    this.app.showToast('Mower saved, but avatar upload failed', 'warning');
                }
            }

            // Refresh the lawnmower list
            await this.app.loadLawnmowers();
            
            // Select the new/updated device
            document.getElementById('deviceSelector').value = mower.id;
            await this.app.selectDevice(mower.id);

            // Close dialog
            this.closeMowerDialog();

        } catch (error) {
            console.error('Failed to save mower:', error);
            
            // Parse backend error messages
            let errorMessage = 'Failed to save mower';
            if (error.message.includes('400')) {
                errorMessage = 'Invalid data provided. Please check name and address uniqueness.';
            } else if (error.message.includes('409')) {
                errorMessage = 'A mower with this name or address already exists.';
            }
            
            this.showFormErrors([errorMessage]);
        } finally {
            // Reset loading state
            saveBtn.disabled = false;
            saveBtnText.classList.remove('hidden');
            saveBtnSpinner.classList.add('hidden');
        }
    }

    validateMowerForm(name, address) {
        const errors = [];

        if (!name) {
            errors.push('Name is required');
        } else if (name.length > 50) {
            errors.push('Name must be 50 characters or less');
        }

        if (!this.editingDevice) { // Only validate address for new mowers
            if (!address) {
                errors.push('Address is required');
            } else {
                // Validate IP:Port format
                const addressPattern = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
                if (!addressPattern.test(address)) {
                    errors.push('Address must be in format IP:PORT (e.g., 192.168.1.42:5467)');
                } else {
                    // Validate IP ranges
                    const parts = address.split(':');
                    const ip = parts[0].split('.');
                    const port = parseInt(parts[1]);
                    
                    const invalidIP = ip.some(octet => {
                        const num = parseInt(octet);
                        return num < 0 || num > 255;
                    });
                    
                    if (invalidIP) {
                        errors.push('Invalid IP address format');
                    }
                    
                    if (port < 1 || port > 65535) {
                        errors.push('Port must be between 1 and 65535');
                    }
                }
            }
        }

        return errors;
    }

    clearFormErrors() {
        document.getElementById('formErrors').classList.add('hidden');
        document.getElementById('nameError').classList.add('hidden');
        document.getElementById('addressError').classList.add('hidden');
    }

    showFormErrors(errors) {
        const formErrors = document.getElementById('formErrors');
        const errorList = document.getElementById('errorList');
        
        errorList.innerHTML = errors.map(error => `<li>• ${error}</li>`).join('');
        formErrors.classList.remove('hidden');
    }

    closeMowerDialog() {
        if (this.currentDialog) {
            document.body.removeChild(this.currentDialog);
            this.currentDialog = null;
        }
        this.currentAvatarFile = null;
        this.editingDevice = null;
    }

    // Delete Mower Dialog
    showDeleteDialog(device) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="px-6 py-4">
                    <div class="flex items-center">
                        <div class="flex-shrink-0">
                            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                            </svg>
                        </div>
                        <div class="ml-3">
                            <h3 class="text-lg font-semibold text-gray-900">Delete "${device.name}"?</h3>
                            <p class="mt-2 text-sm text-gray-600">
                                This action cannot be undone. All historical data for this lawnmower will be permanently removed.
                            </p>
                            <div class="mt-3 p-3 bg-gray-50 rounded border-l-4 border-gray-400">
                                <p class="text-sm text-gray-700">
                                    <span class="font-medium">Name:</span> ${device.name}<br>
                                    <span class="font-medium">Address:</span> ${device.address}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button type="button" id="cancelDeleteBtn" class="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                    <button type="button" id="confirmDeleteBtn" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                        <span id="deleteBtnText">Delete Permanently</span>
                        <div id="deleteBtnSpinner" class="hidden inline-block ml-2 spinner"></div>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        this.currentDialog = overlay;

        // Set up event listeners
        document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
            this.closeDeleteDialog();
        });

        document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
            this.handleDeleteConfirm(device);
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeDeleteDialog();
            }
        });
    }

    async handleDeleteConfirm(device) {
        const confirmBtn = document.getElementById('confirmDeleteBtn');
        const deleteBtnText = document.getElementById('deleteBtnText');
        const deleteBtnSpinner = document.getElementById('deleteBtnSpinner');

        // Show loading state
        confirmBtn.disabled = true;
        deleteBtnText.classList.add('hidden');
        deleteBtnSpinner.classList.remove('hidden');

        try {
            await window.lawnmowerAPI.deleteLawnmower(device.id);
            this.app.showToast(`${device.name} deleted successfully`, 'success');

            // If this was the selected device, clear selection
            if (this.app.currentDevice && this.app.currentDevice.id === device.id) {
                this.app.currentDevice = null;
                document.getElementById('deviceSelector').value = '';
                this.app.showNoDeviceState();
                this.app.updateActionButtons();
            }

            // Refresh the lawnmower list
            await this.app.loadLawnmowers();

            // Close dialog
            this.closeDeleteDialog();

        } catch (error) {
            console.error('Failed to delete mower:', error);
            this.app.showToast('Failed to delete mower', 'error');
        } finally {
            // Reset loading state
            confirmBtn.disabled = false;
            deleteBtnText.classList.remove('hidden');
            deleteBtnSpinner.classList.add('hidden');
        }
    }

    closeDeleteDialog() {
        if (this.currentDialog) {
            document.body.removeChild(this.currentDialog);
            this.currentDialog = null;
        }
    }

    // Public interface methods
    showAddMowerDialog() {
        this.showAddDialog();
    }

    showEditMowerDialog() {
        if (this.app.currentDevice) {
            this.showEditDialog(this.app.currentDevice);
        } else {
            this.app.showToast('Please select a device to edit', 'warning');
        }
    }

    showDeleteMowerDialog() {
        if (this.app.currentDevice) {
            this.showDeleteDialog(this.app.currentDevice);
        } else {
            this.app.showToast('Please select a device to delete', 'warning');
        }
    }
}

// Export for use in main.js
window.DeviceManager = DeviceManager;
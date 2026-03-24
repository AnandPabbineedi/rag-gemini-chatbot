// Configuration
// Use relative path for production (Docker), or full URL for development
const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';
let selectedFiles = [];

// DOM Elements
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const uploadBtn = document.getElementById('uploadBtn');
const statusSection = document.getElementById('statusSection');
const statusContent = document.getElementById('statusContent');
const chatSection = document.getElementById('chatSection');
const chatBox = document.getElementById('chatBox');
const questionInput = document.getElementById('questionInput');
const askBtn = document.getElementById('askBtn');
const loadingSpinner = document.getElementById('loadingSpinner');

// Event Listeners
uploadBox.addEventListener('click', () => fileInput.click());
uploadBox.addEventListener('dragover', handleDragOver);
uploadBox.addEventListener('dragleave', handleDragLeave);
uploadBox.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);
uploadBtn.addEventListener('click', uploadFiles);
askBtn.addEventListener('click', askQuestion);
questionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') askQuestion();
});

// File Handling
function handleDragOver(e) {
    e.preventDefault();
    uploadBox.classList.add('dragover');
}

function handleDragLeave() {
    uploadBox.classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    uploadBox.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

function addFiles(files) {
    const validFiles = files.filter(file => {
        const isValid = file.type === 'application/pdf' || file.type === 'text/plain';
        if (!isValid) {
            showStatus(`File "${file.name}" is not supported. Only PDF and TXT files are allowed.`, 'error');
        }
        return isValid;
    });

    selectedFiles = [...selectedFiles, ...validFiles];
    renderFileList();
    uploadBtn.disabled = selectedFiles.length === 0;
}

function renderFileList() {
    fileList.innerHTML = selectedFiles
        .map((file, index) => `
            <div class="file-item">
                <span class="file-item-name">📄 ${file.name}</span>
                <span class="file-item-size">${formatFileSize(file.size)}</span>
                <button class="file-item-remove" onclick="removeFile(${index})">Remove</button>
            </div>
        `)
        .join('');
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
    uploadBtn.disabled = selectedFiles.length === 0;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Upload Handler
async function uploadFiles() {
    if (selectedFiles.length === 0) {
        showStatus('Please select at least one file.', 'error');
        return;
    }

    uploadBtn.disabled = true;
    showLoading(true);

    try {
        for (const file of selectedFiles) {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const data = await response.json();
            showStatus(`✅ "${data.fileName}" uploaded successfully! (${data.chunksCreated} chunks created)`, 'success');
        }

        // After successful upload, show chat section
        selectedFiles = [];
        renderFileList();
        fileInput.value = '';
        setTimeout(() => {
            statusSection.style.display = 'none';
            chatSection.style.display = 'block';
            questionInput.focus();
        }, 2000);
    } catch (error) {
        showStatus(`❌ Error uploading files: ${error.message}`, 'error');
    } finally {
        uploadBtn.disabled = false;
        showLoading(false);
    }
}

// Chat Handler
async function askQuestion() {
    const question = questionInput.value.trim();
    if (!question) return;

    // Add user message to chat
    addMessageToChat(question, 'user');
    questionInput.value = '';

    showLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ question })
        });

        if (!response.ok) {
            throw new Error(`Request failed: ${response.statusText}`);
        }

        const data = await response.json();
        addMessageToChat(data.answer, 'bot');
    } catch (error) {
        addMessageToChat(`❌ Error: ${error.message}`, 'bot');
    } finally {
        showLoading(false);
    }
}

function addMessageToChat(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.innerHTML = `<p>${escapeHtml(message)}</p>`;
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// UI Helpers
function showStatus(message, type) {
    statusSection.style.display = 'block';
    const statusElement = document.createElement('div');
    statusElement.className = `status-message status-${type}`;
    statusElement.textContent = message;
    statusContent.appendChild(statusElement);

    // Auto-remove success messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusElement.remove();
            if (statusContent.children.length === 0) {
                statusSection.style.display = 'none';
            }
        }, 3000);
    }
}

function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('RAG Chatbot Frontend Loaded');
    uploadBox.focus();
});

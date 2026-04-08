document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const connectionStatus = document.getElementById('connection-status');
  const statusText = document.getElementById('status-text');
  const sharedText = document.getElementById('shared-text');
  const copyBtn = document.getElementById('copy-text-btn');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadTrigger = document.getElementById('upload-trigger');
  const fileList = document.getElementById('file-list');
  const progressContainer = document.getElementById('upload-progress-container');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressFilename = document.getElementById('progress-filename');
  const progressPercentage = document.getElementById('progress-percentage');

  // Socket.IO Setup
  // Automatically connects to the host that serves the page
  const socket = io();

  socket.on('connect', () => {
    connectionStatus.classList.remove('disconnected');
    connectionStatus.classList.add('connected');
    statusText.textContent = 'Connected (Live)';
  });

  socket.on('disconnect', () => {
    connectionStatus.classList.remove('connected');
    connectionStatus.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
  });

  // ========== TEXT SYNC ==========
  socket.on('text-sync', (text) => {
    // Check to prevent cursor jumping when we are the one typing
    if (sharedText.value !== text) {
      sharedText.value = text;
    }
  });

  sharedText.addEventListener('input', () => {
    socket.emit('text-update', sharedText.value);
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(sharedText.value).then(() => {
      // Visual feedback
      const icon = copyBtn.querySelector('i');
      icon.className = 'ph ph-check';
      copyBtn.style.color = 'var(--success)';
      setTimeout(() => {
        icon.className = 'ph ph-copy';
        copyBtn.style.color = '';
      }, 2000);
    });
  });

  // ========== FILE SHARING ==========
  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const files = await res.json();
      renderFiles(files);
    } catch (e) {
      console.error('Error fetching files:', e);
    }
  };

  const renderFiles = (files) => {
    if (!files || files.length === 0) {
      fileList.innerHTML = '<li class="empty-state">No files shared yet. Be the first!</li>';
      return;
    }

    fileList.innerHTML = files.map(file => {
      // Format file size
      let sizeStr = '';
      if (file.size < 1024) sizeStr = file.size + ' B';
      else if (file.size < 1048576) sizeStr = (file.size / 1024).toFixed(1) + ' KB';
      else sizeStr = (file.size / 1048576).toFixed(1) + ' MB';

      // Format date
      const d = new Date(file.createdAt);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      return `
        <li class="file-item">
          <div class="file-info">
            <i class="ph ph-file-text file-icon"></i>
            <div class="file-details">
              <span class="file-name" title="${file.originalName}">${file.originalName}</span>
              <span class="file-meta">${sizeStr} &bull; Shared at ${timeStr}</span>
            </div>
          </div>
          <a href="${file.url}" class="download-btn" download="${file.originalName}" title="Download File">
            <i class="ph ph-download-simple"></i>
          </a>
        </li>
      `;
    }).join('');
  };

  // Listen for socket events when OTHERS upload files
  socket.on('files-updated', () => {
    fetchFiles();
  });

  // Initial fetch on page load
  fetchFiles();

  // Upload Handlers
  uploadTrigger.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
      uploadFiles(e.target.files);
      fileInput.value = ''; // Reset
    }
  });

  // Drag & Drop Handlers
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  const uploadFiles = (files) => {
    progressContainer.classList.remove('hidden');
    
    const formData = new FormData();
    const fileNameDisplay = files.length === 1 ? files[0].name : `${files.length} files`;
    progressFilename.textContent = `Uploading: ${fileNameDisplay}`;
    
    // Add all dragged/selected files
    for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
    }

    // Using XMLHttpRequest instead of fetch to get upload progress
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressBarFill.style.width = percentComplete + '%';
        progressPercentage.textContent = percentComplete + '%';
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        progressFilename.textContent = "Upload Complete!";
        progressBarFill.style.background = 'var(--success)';
        
        setTimeout(() => {
          progressContainer.classList.add('hidden');
          progressBarFill.style.width = '0%';
          progressBarFill.style.background = 'var(--primary-color)';
          progressPercentage.textContent = '0%';
        }, 2000);
        
        // Re-fetch files for ourselves
        fetchFiles();
      } else {
        alert('Error uploading files. Server returned ' + xhr.status);
        progressContainer.classList.add('hidden');
      }
    };

    xhr.onerror = () => {
      alert('Network error occurred while uploading. Is the server running?');
      progressContainer.classList.add('hidden');
    };

    xhr.send(formData);
  };
});

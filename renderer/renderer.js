/**
 * Renderer process script handling UI interactions and audio file management.
 * Licensed under MIT License.
 */

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const selectButton = document.getElementById('selectButton');
    const fileName = document.getElementById('fileName');
    const progressArea = document.querySelector('.progress-area');
    const transcriptionArea = document.querySelector('.transcription-area');
    const progress = document.getElementById('progress');
    const status = document.getElementById('status');
    const transcriptionText = document.getElementById('transcriptionText');
    const copyButton = document.getElementById('copyButton');
    const downloadButton = document.getElementById('downloadButton');
    const newFileButton = document.getElementById('newFileButton');

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        if (file && ['audio/mpeg', 'audio/wav', 'audio/mp4'].includes(file.type)) {
            handleFile(file.path);
        } else {
            alert('Please drop a valid audio file (MP3, WAV, or M4A)');
        }
    });

    // Select file button handler
    selectButton.addEventListener('click', async () => {
        const filePath = await window.electronAPI.selectFile();
        if (filePath) {
            handleFile(filePath);
        }
    });

    // Copy button handler
    copyButton.addEventListener('click', () => {
        navigator.clipboard.writeText(transcriptionText.value);
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = originalText;
        }, 2000);
    });

    // Track current audio filename
    let currentAudioFile = '';

    // Download button handler
    downloadButton.addEventListener('click', () => {
        const blob = new Blob([transcriptionText.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Use audio filename without extension, then add .txt
        const baseFileName = currentAudioFile.replace(/\.[^/.]+$/, '');
        a.download = `${baseFileName}_transcription.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // New file button handler
    newFileButton.addEventListener('click', () => {
        reset();
    });

    // Set up progress listener
    window.electronAPI.onTranscriptionProgress(({ progress: progressValue, status: statusText }) => {
        progress.style.width = `${progressValue}%`;
        status.textContent = statusText;
    });

    async function handleFile(filePath) {
        currentAudioFile = filePath.split('/').pop();
        fileName.textContent = currentAudioFile;
        progressArea.style.display = 'block';
        transcriptionArea.style.display = 'none'; // Hide previous transcription
        status.textContent = 'Analyzing audio file...';
        progress.style.width = '0%';

        // Set up a timeout warning for long transcriptions
        const timeoutWarning = setTimeout(() => {
            status.textContent = 'Still processing... This may take a few minutes for long files';
        }, 10000); // Show warning after 10 seconds

        try {
            console.log('Starting audio processing:', filePath);
            const transcriptionResult = await window.electronAPI.processAudio(filePath);
            console.log('Received transcription result:', transcriptionResult);
            clearTimeout(timeoutWarning);
            
            if (transcriptionResult) {
                transcriptionText.value = transcriptionResult;
                transcriptionArea.style.display = 'block';
            } else {
                throw new Error('No transcription result received');
            }
            
            progress.style.width = '100%';
            status.textContent = 'Transcription complete!';
            console.log('Transcription complete, displayed in UI');
        } catch (error) {
            console.error('Transcription error:', error);
            status.textContent = `Error: ${error}`;
            progress.style.width = '0%';
        }
    }

    function reset() {
        fileName.textContent = '';
        progressArea.style.display = 'none';
        transcriptionArea.style.display = 'none';
        progress.style.width = '0%';
        transcriptionText.value = '';
    }
});

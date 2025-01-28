/**
 * Main process file handling audio processing and transcription using OpenAI's Whisper API.
 * Licensed under MIT License.
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { OpenAI } = require('openai');
const fs = require('fs');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('renderer/index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle file selection
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'm4a', 'wav'] }
    ]
  });
  return result.filePaths[0];
});

// Function to get file duration using ffmpeg
async function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
}

// Function to split audio file into chunks
async function splitAudioFile(filePath, duration, chunkDuration = 300) {
  const chunks = [];
  const tempDir = path.join(app.getPath('temp'), 'audio-chunks');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const numChunks = Math.ceil(duration / chunkDuration);
  
  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkDuration;
    const outputPath = path.join(tempDir, `chunk-${i}.wav`);
    
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .toFormat('wav')
        .audioChannels(1)        // Convert to mono
        .audioFrequency(16000)   // 16kHz sample rate
        .audioBitrate('32k')     // Lower bitrate
        .audioFilters(['volume=1.5']) // Normalize volume
        .setStartTime(start)
        .setDuration(Math.min(chunkDuration, duration - start))
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputPath);
    });
    
    chunks.push(outputPath);
  }
  
  return chunks;
}

// Function to transcribe a single chunk
async function transcribeChunk(chunkPath) {
  console.log('Transcribing chunk:', chunkPath);
  console.log('File size:', fs.statSync(chunkPath).size / (1024 * 1024), 'MB');
  
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(chunkPath),
    model: 'whisper-1',
    language: 'en',
    response_format: 'text'
  });
  
  console.log('Transcription received:', transcription.slice(0, 100) + '...');
  return transcription;
}

// Handle audio conversion and transcription
ipcMain.handle('process-audio', async (event, filePath) => {
  try {
    console.log('Processing audio file:', filePath);
    // Get audio duration
    const duration = await getAudioDuration(filePath);
    console.log('Audio duration:', duration, 'seconds');
    let transcription = '';

    // If file is large, process in chunks
    if (duration > 300) { // 5 minutes chunks
      const chunks = await splitAudioFile(filePath, duration);
      let processedChunks = 0;
      
      // Process each chunk
      for (const chunk of chunks) {
        const chunkTranscription = await transcribeChunk(chunk);
        transcription += chunkTranscription + ' ';
        processedChunks++;
        
        // Clean up chunk file
        fs.unlinkSync(chunk);
        
        // Send progress update with estimated time
        const minutesPerChunk = 5; // Each chunk is about 5 minutes
        const remainingChunks = chunks.length - processedChunks;
        const estimatedMinutes = remainingChunks * minutesPerChunk;
        
        event.sender.send('transcription-progress', {
          progress: (processedChunks / chunks.length) * 100,
          status: `Transcribing chunk ${processedChunks} of ${chunks.length} (about ${estimatedMinutes} minutes remaining)`
        });
      }
      
      // Clean up chunks directory
      fs.rmdirSync(path.join(app.getPath('temp'), 'audio-chunks'));
    } else {
      // Process with compression
      const outputPath = path.join(app.getPath('temp'), 'converted-audio.wav');
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .toFormat('wav')
          .audioChannels(1)        // Convert to mono
          .audioFrequency(16000)   // 16kHz sample rate
          .audioBitrate('32k')     // Lower bitrate
          .audioFilters(['volume=1.5']) // Normalize volume
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .save(outputPath);
      });

      // Verify file size before sending
      const fileSize = fs.statSync(outputPath).size;
      if (fileSize > 25 * 1024 * 1024) {
        throw new Error('File still too large after compression. Please try a shorter audio file.');
      }

      transcription = await transcribeChunk(outputPath);
      fs.unlinkSync(outputPath);
    }

    return transcription.trim();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
});

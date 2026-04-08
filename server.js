const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for local network sharing
    methods: ['GET', 'POST']
  }
});

app.use(cors());
// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Setup uploads directory
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Preserve original name but add timestamp to avoid overwrites
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// API Endpoints for Files
app.post('/api/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  const uploadedFiles = req.files.map(file => ({
    name: file.originalname, // Original name
    filename: file.filename, // Saved name with timestamp
    size: file.size,
    mimetype: file.mimetype,
    url: `/api/download/${encodeURIComponent(file.filename)}`
  }));
  
  // Notify all clients that files have been updated
  io.emit('files-updated');

  res.json({ success: true, files: uploadedFiles });
});

app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read directory' });
    }
    
    const fileDetails = files.map(filename => {
      const filePath = path.join(UPLOAD_DIR, filename);
      const stats = fs.statSync(filePath);
      
      // Attempt to extract original name by removing the timestamp pattern `-1234567890.ext`
      let originalName = filename;
      const match = filename.match(/-(?:\d+)(\.[^.]+)?$/);
      if (match) {
          originalName = filename.substring(0, match.index) + (match[1] || '');
      }

      return {
        filename,
        originalName,
        size: stats.size,
        createdAt: stats.mtime,
        url: `/api/download/${encodeURIComponent(filename)}`
      };
    });
    
    // Sort files by creation date (newest first)
    fileDetails.sort((a, b) => b.createdAt - a.createdAt);
    
    res.json(fileDetails);
  });
});

app.get('/api/download/:filename', (req, res) => {
  const filepath = path.join(UPLOAD_DIR, req.params.filename);
  if (fs.existsSync(filepath)) {
    // Provide file for download
    res.download(filepath);
  } else {
    res.status(404).send('File not found');
  }
});

// Socket.IO for text syncing
let currentText = "Welcome to your local network clipboard!\nType here to instantly share text with other connected devices.";

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Send current text to the newly connected user
  socket.emit('text-sync', currentText);
  
  // Listen for text updates from a client
  socket.on('text-update', (text) => {
    currentText = text;
    // Broadcast text to all *other* clients
    socket.broadcast.emit('text-sync', currentText);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
// Note: '0.0.0.0' binds to all network interfaces, allowing local network access
server.listen(PORT, '0.0.0.0', () => {
  console.log(`--------------------------------------------------`);
  console.log(`✅ AirForShare Clone Backend running on port ${PORT}`);
  console.log(`🌍 Accessible on your local network.`);
  console.log(`--------------------------------------------------`);
});

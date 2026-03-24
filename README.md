# RAG Gemini Chatbot

A full-stack Retrieval Augmented Generation (RAG) chatbot powered by Google's Gemini AI. Upload documents and get intelligent answers based on their content.

## Project Structure

```
rag-gemini-chatbot/
├── backend/              # Express.js API server
│   ├── src/
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic (embeddings, LLM, vector store)
│   │   ├── utils/       # Utilities (chunking, similarity)
│   │   └── server.js    # Express app entry point
│   ├── Dockerfile
│   ├── package.json
│   └── uploads/         # Document storage
├── frontend/            # Vanilla JS frontend
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── README.md
└── .gitignore
```

## Features

- 📄 **Document Upload**: Support for PDF and TXT files
- 🔍 **Smart Chunking**: Automatic text splitting for optimal processing
- 🧠 **Embeddings**: Generate semantic embeddings using Google's models
- 🤖 **AI Responses**: Get answers using Google's Gemini model
- 💬 **Interactive Chat**: Real-time Q&A interface
- 🐳 **Docker Support**: Easy containerization for both frontend and backend

## Prerequisites

- **Docker & Docker Compose** (for containerized deployment)
- **Node.js 20+** (for local development)
- **Google API Key** (for Gemini and embedding models)

## Setup

### 1. Environment Variables

Create a `.env` file in the `backend/` directory:

```env
GOOGLE_API_KEY=your_google_api_key_here
```

### 2. Installation (Local Development)

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend (if using a framework)
cd ../frontend
npm install  # (if applicable)
```

## Running the Application

### Option 1: Docker Compose (Recommended)

```bash
# Build and start both services
docker compose up --build

# Services will be available at:
# - Frontend: http://localhost:80
# - Backend API: http://localhost:3000/api
```

### Option 2: Local Development

```bash
# Terminal 1: Start the backend
cd backend
npm install
node src/server.js

# Terminal 2: Serve the frontend
cd frontend
# Use any static server (e.g., Python's http.server)
python -m http.server 8000
# Or use `http-server` npm package: npx http-server
```

Access the application at:
- Frontend: `http://localhost:8000`
- Backend API: `http://localhost:3000/api`

## API Endpoints

### Upload Document

**POST** `/api/upload`

Upload a PDF or TXT file for processing.

```bash
curl -X POST -F "file=@document.pdf" http://localhost:3000/api/upload
```

Response:
```json
{
  "message": "Document processed successfully",
  "fileName": "document.pdf",
  "chunksCreated": 25
}
```

### Ask Question

**POST** `/api/ask`

Ask a question based on uploaded documents.

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic?"}' \
  http://localhost:3000/api/ask
```

Response:
```json
{
  "answer": "Based on the documents, the main topic is..."
}
```

## Technologies

- **Backend**: Node.js, Express.js, Multer
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **AI**: Google Gemini API, Google embeddings
- **Storage**: In-memory vector store (can be extended to use pinecone, weaviate, etc.)
- **Deployment**: Docker, Docker Compose
- **Web Server**: Nginx (frontend), Express (backend)

## Architecture

```
┌─────────────┐
│  Frontend   │ (Nginx)
│ (port 80)   │
└──────┬──────┘
       │ /api/*
       ▼
┌─────────────────┐
│    Backend      │ (Express.js)
│  (port 3000)    │
└────────┬────────┘
         │
    ┌────┴────┬─────────┬──────────┐
    ▼         ▼         ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│ Google │ │ Google │ │ Vector │ │ Document │
│Gemini  │ │Embed   │ │ Store  │ │  Store   │
└────────┘ └────────┘ └────────┘ └──────────┘
```

## How It Works

1. **Upload**: User uploads a document (PDF/TXT)
2. **Process**: Backend extracts text and chunks it
3. **Embed**: Generate semantic embeddings for each chunk
4. **Index**: Store embeddings in vector store
5. **Query**: User asks a question
6. **Retrieve**: Find most relevant document chunks using similarity search
7. **Generate**: Ask Gemini to answer based on retrieved context
8. **Respond**: Return answer to user via frontend

## Development

### Backend Development

```bash
cd backend
npm install
node src/server.js
```

### Frontend Development

The frontend is currently vanilla JavaScript. To modify:
1. Edit `frontend/index.html` for structure
2. Edit `frontend/styles.css` for styling
3. Edit `frontend/script.js` for functionality

### Adding Features

- **New API endpoints**: Add routes in `backend/src/routes/ragRoutes.js`
- **Custom services**: Create files in `backend/src/services/`
- **UI improvements**: Modify frontend HTML/CSS/JS files

## Troubleshooting

### Port Already in Use

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill <PID>
```

### Docker Build Fails

```bash
# Clean build
docker compose down -v
docker compose build --no-cache
docker compose up
```

### API Connection Errors

Ensure:
- Backend is running on port 3000
- Frontend is correctly configured with `API_BASE_URL`
- CORS is enabled on backend

## Next Steps

- [ ] Add vector database integration (Pinecone, Weaviate, Milvus)
- [ ] Implement user authentication
- [ ] Add conversation history
- [ ] Support more file formats
- [ ] Implement caching strategies
- [ ] Add rate limiting
- [ ] Deploy to cloud (AWS, GCP, Azure)

## License

ISC

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review API response errors
3. Check backend logs: `docker compose logs rag-app`
4. Check frontend console: Browser DevTools > Console

### Upload Document

**Endpoint**: `POST /api/upload`

Upload a PDF or TXT file to process and store embeddings.

**Request**:

- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: Form data with file field

**Response**:

```json
{
  "message": "Document processed successfully",
  "fileName": "document.pdf",
  "chunksCreated": 5
}
```

### Ask Question

**Endpoint**: `POST /api/ask`

Ask a question about the uploaded documents.

**Request**:

```json
{
  "question": "What is the main topic of the document?"
}
```

**Response**:

```json
{
  "answer": "The document discusses..."
}
```

## Usage Examples

### Using cURL

Upload a file:

```bash
curl -F "file=@document.pdf" http://localhost:5000/api/upload
```

Ask a question:

```bash
curl -X POST http://localhost:5000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the main topic?"}'
```

### Using JavaScript/fetch

See `examples/client.js` for a complete example.

## Supported File Types

- **PDF** (.pdf) - Documents are parsed and text is extracted
- **Plain Text** (.txt) - Text files are read directly

## Architecture

- **server.js**: Express server setup with CORS
- **ragRoutes.js**: API route handlers with file upload and query processing
- **embeddingService.js**: Generates vector embeddings using Google's API
- **llmService.js**: Generates answers using Google Gemini API
- **vectorStore.js**: In-memory storage for documents and embeddings
- **chunker.js**: Splits text into overlapping chunks
- **cosineSimilarity.js**: Calculates similarity between embeddings

## Notes

- Uploaded files are automatically deleted after processing
- Documents are stored in-memory, so they will be lost if the server restarts
- Maximum file size depends on multer configuration
- Default chunk size is 800 characters with 100 character overlap

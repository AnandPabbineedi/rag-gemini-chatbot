# RAG Gemini Chatbot

A Retrieval-Augmented Generation (RAG) chatbot powered by Google's Gemini API that allows you to upload documents (PDF or TXT) and ask questions about their content.

## Features

- **File Upload**: Upload PDF or plain text files
- **Document Chunking**: Automatically chunks documents into manageable pieces
- **Vector Embeddings**: Generates embeddings using Google's embedding API
- **Semantic Search**: Retrieves the most relevant document chunks based on similarity
- **LLM Integration**: Uses Google Gemini API to generate contextual answers

## Setup

### Prerequisites

- Node.js (v18+)
- Google API Key (for Gemini and Embedding models)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd rag-gemini-chatbot
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory:

```env
GEMINI_API_KEY=your_google_api_key_here
```

4. Start the server:

```bash
node src/server.js
```

The server will run on `http://localhost:5000`

## API Endpoints

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

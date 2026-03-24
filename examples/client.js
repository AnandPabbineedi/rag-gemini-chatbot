// Example: Upload a file and ask questions
// This example shows how to use the RAG Gemini Chatbot API

const API_BASE_URL = "http://localhost:5000/api";

/**
 * Upload a file to the chatbot
 * @param {File} file - The file to upload (PDF or TXT)
 */
async function uploadFile(file) {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Upload successful:", result);
    return result;
  } catch (error) {
    console.error("Upload error:", error);
    throw error;
  }
}

/**
 * Ask a question about the uploaded documents
 * @param {string} question - The question to ask
 */
async function askQuestion(question) {
  try {
    const response = await fetch(`${API_BASE_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      throw new Error(`Query failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log("Answer:", result.answer);
    return result;
  } catch (error) {
    console.error("Query error:", error);
    throw error;
  }
}

// Example usage (if running in browser)
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // Setup file upload handler
    const fileInput = document.getElementById("fileInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const questionInput = document.getElementById("questionInput");
    const askBtn = document.getElementById("askBtn");
    const resultsDiv = document.getElementById("results");

    uploadBtn?.addEventListener("click", async () => {
      const file = fileInput.files[0];
      if (!file) {
        alert("Please select a file");
        return;
      }

      uploadBtn.disabled = true;
      uploadBtn.textContent = "Uploading...";

      try {
        const result = await uploadFile(file);
        resultsDiv.innerHTML = `<p class="success">✓ ${result.fileName} uploaded successfully (${result.chunksCreated} chunks created)</p>`;
      } catch (error) {
        resultsDiv.innerHTML = `<p class="error">✗ Error: ${error.message}</p>`;
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Upload";
        fileInput.value = "";
      }
    });

    askBtn?.addEventListener("click", async () => {
      const question = questionInput.value.trim();
      if (!question) {
        alert("Please enter a question");
        return;
      }

      askBtn.disabled = true;
      askBtn.textContent = "Loading...";

      try {
        const result = await askQuestion(question);
        resultsDiv.innerHTML = `<p class="answer"><strong>Q:</strong> ${question}<br><strong>A:</strong> ${result.answer}</p>`;
      } catch (error) {
        resultsDiv.innerHTML = `<p class="error">✗ Error: ${error.message}</p>`;
      } finally {
        askBtn.disabled = false;
        askBtn.textContent = "Ask";
      }
    });
  });
}

// For Node.js/testing environment
if (typeof module !== "undefined" && module.exports) {
  module.exports = { uploadFile, askQuestion };
}

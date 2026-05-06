import fitz
import chromadb
import requests
import json
import os
import time
import threading
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from sentence_transformers import SentenceTransformer
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).resolve().parent
OBSERVED_FOLDER = BASE_DIR / "uploads"
VAULT_PATH = BASE_DIR / "turqore_vault"

if not OBSERVED_FOLDER.exists(): 
    os.makedirs(OBSERVED_FOLDER)

MODEL_MAP = {
    "fast": "llama3.1:latest",
    "balanced": "gemma2:9b",
    "genius": "gemma2:27b"
}

print("--- 🧠 Turqore.ai Engine is Firing Up... ---")
embedder = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2', device='cpu')

client = chromadb.PersistentClient(path=str(VAULT_PATH))
collection = client.get_or_create_collection(name="office_archive", metadata={"hnsw:space": "cosine"})

def chunk_text(text, chunk_size=600, overlap=100):
    chunks = []
    for i in range(0, len(text), chunk_size - overlap):
        chunks.append(text[i:i + chunk_size])
    return chunks

def process_document(file_path):
    try:
        with fitz.open(file_path) as doc:
            raw_text = "".join([page.get_text() for page in doc])
        if not raw_text.strip(): return False
        
        chunks = chunk_text(raw_text)
        embeddings = embedder.encode(chunks).tolist()
        ids = [f"{os.path.basename(file_path)}_{i}_{time.time()}" for i in range(len(chunks))]
        collection.add(embeddings=embeddings, documents=chunks, ids=ids, metadatas=[{"source": str(file_path)} for _ in chunks])
        print(f"✅ {os.path.basename(file_path)} sealed.")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

class DocumentWatcher(FileSystemEventHandler):
    def on_created(self, event):
        if not event.is_directory and event.src_path.lower().endswith('.pdf'):
            process_document(event.src_path)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file found"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        filename = secure_filename(file.filename)
        filepath = OBSERVED_FOLDER / filename
        file.save(filepath)
        
        success = process_document(filepath)
        if success:
            return jsonify({"message": f"{filename} successfully added to memory."})
        else:
            return jsonify({"error": "An error occurred while reading the file."}), 500
            
    return jsonify({"error": "Only PDF format is supported."}), 400

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    history = data.get('history', []) 
    requested_model_key = data.get('model', 'genius') 
    
    selected_ollama_model = MODEL_MAP.get(requested_model_key, "gemma2:27b")

    print(f"📡 Request Received | Model: {selected_ollama_model} | Message: {user_message[:30]}...")

    query_vector = embedder.encode(user_message).tolist()
    results = collection.query(query_embeddings=[query_vector], n_results=3)
    
    context = "" 
    if results['distances'] and results['distances'][0] and results['distances'][0][0] < 0.75:
        context = " ".join(results['documents'][0])

    url = "http://localhost:11434/api/chat"
    
    system_prompt = "You are a professional, intelligent, and Turkish-speaking AI assistant named Turqore.ai."
    if context:
        system_prompt += f"\nWhen answering the user's question, use the following archive information:\n\n{context}\n\nIf there is not enough information in the context, use your own logic and general knowledge."

    messages = [{"role": "system", "content": system_prompt}]
    
    for msg in history:
        if msg.get("sender") == "System":
            continue
        role = "assistant" if msg.get("sender") == "Turqore" else "user"
        messages.append({"role": role, "content": msg.get("text", "")})
        
    messages.append({"role": "user", "content": user_message})
    
    try:
        response = requests.post(url, json={
            "model": selected_ollama_model, 
            "messages": messages, 
            "stream": False
        }, timeout=180)
        
        response.raise_for_status()
        
        bot_reply = response.json().get('message', {}).get('content', '')
        return jsonify({"reply": bot_reply})
    except requests.exceptions.RequestException as e:
        print(f"❌ Ollama Error: {e}")
        return jsonify({"error": f"Could not reach Ollama model: {selected_ollama_model}"}), 500

if __name__ == "__main__":
    observer = Observer()
    observer.schedule(DocumentWatcher(), str(OBSERVED_FOLDER), recursive=False)
    threading.Thread(target=observer.start, daemon=True).start()

    print(f"🚀 Turqore.ai API Active | Port: 5000")
    app.run(port=5000, debug=False, use_reloader=False)

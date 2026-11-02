"""Loopback-only Meta RoBERTa feature embeddings; no hosted inference or remote code.

This is an evaluated baseline, not a retrieval-tuned model. Corpus/query vectors
must share the exact revision, pooling and normalization below.
"""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse, hashlib, json, os, secrets, threading

ROOT = Path(__file__).resolve().parents[2]
MODEL = "FacebookAI/roberta-base"
REVISION = "e2da8e2f811d1448a5b465c236feacd80ffbac7b"
REFERENCE_HASH = "ec1cadc28166e6bdc48d5248743ddc8c9cea8147f788e82fb02229a1d27588af"
SPACE = REVISION + ":mean-mask-l2-refmean-l2-v2:" + REFERENCE_HASH
MODEL_DIR = ROOT / ".local/models/roberta-base"
TOKEN_FILE = ROOT / ".local/embedding-token"

def download():
    from huggingface_hub import snapshot_download
    snapshot_download(MODEL, revision=REVISION, local_dir=MODEL_DIR,
                      allow_patterns=["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt", "README.md"])
    print(json.dumps({"downloaded": MODEL, "revision": REVISION, "path": str(MODEL_DIR)}))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--port", type=int, default=8767)
    args = parser.parse_args()
    if args.download: return download()
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import torch
    from transformers import AutoModel, AutoTokenizer
    torch.set_num_threads(2)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR, local_files_only=True, trust_remote_code=False)
    model = AutoModel.from_pretrained(MODEL_DIR, local_files_only=True, trust_remote_code=False, use_safetensors=True, add_pooling_layer=False)
    model.eval()
    reference_bytes = Path(__file__).with_name("reference-mean.json").read_bytes()
    if hashlib.sha256(reference_bytes).hexdigest() != REFERENCE_HASH:
        raise ValueError("Embedding reference does not match the pinned space")
    reference = json.loads(reference_bytes)
    if reference.get("baseModel") != MODEL or reference.get("baseRevision") != REVISION or len(reference.get("mean", [])) != 768:
        raise ValueError("Embedding reference model mismatch")
    reference_mean = torch.tensor(reference["mean"], dtype=torch.float32)
    lock = threading.Lock()
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(TOKEN_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w") as f: f.write(secrets.token_urlsafe(36))
    except FileExistsError: pass
    token = TOKEN_FILE.read_text().strip()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass
        def send_json(self, status, value):
            data = json.dumps(value).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers(); self.wfile.write(data)
        def do_GET(self):
            if self.path != "/health": return self.send_json(404, {"error":"Not found"})
            return self.send_json(200, {"status":"ready","model":MODEL,"revision":SPACE,"dimensions":768,"mode":"local-meta","retrievalTuned":False,"postprocessing":"fixed-reference-mean-centering","referenceHash":REFERENCE_HASH})
        def do_POST(self):
            if self.path != "/embed": return self.send_json(404, {"error":"Not found"})
            if self.headers.get("Origin") or not secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
                return self.send_json(403, {"error":"Server-to-server authorization required"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 128_000: return self.send_json(413, {"error":"Request too large"})
                data = json.loads(self.rfile.read(length))
                texts = data.get("texts")
                if not isinstance(texts,list) or not 1 <= len(texts) <= 16 or any(not isinstance(t,str) or not t.strip() or len(t)>8000 for t in texts):
                    return self.send_json(400, {"error":"Supply 1–16 nonempty texts of at most 8000 characters"})
                with lock, torch.inference_mode():
                    inputs = tokenizer(texts, padding=True, truncation=True, max_length=512, return_tensors="pt")
                    hidden = model(**inputs).last_hidden_state
                    mask = inputs["attention_mask"].unsqueeze(-1)
                    pooled = (hidden * mask).sum(1) / mask.sum(1).clamp(min=1)
                    normalized = torch.nn.functional.normalize(pooled, p=2, dim=1)
                    centered = normalized - reference_mean
                    if (torch.linalg.vector_norm(centered, dim=1) < 1e-12).any():
                        raise ValueError("Embedding has no remaining signal after centering")
                    vectors = torch.nn.functional.normalize(centered, p=2, dim=1).tolist()
                return self.send_json(200, {"vectors":vectors,"model":MODEL,"revision":SPACE,"dimensions":768,"mode":"local-meta","contentHashes":[hashlib.sha256(t.encode()).hexdigest() for t in texts],"maxTokens":512})
            except (ValueError,TypeError,json.JSONDecodeError):
                return self.send_json(400,{"error":"Invalid embedding request"})
            except Exception:
                return self.send_json(500,{"error":"Local embedding operation failed"})

    print(json.dumps({"listening":f"http://127.0.0.1:{args.port}","model":MODEL,"revision":SPACE}),flush=True)
    ThreadingHTTPServer(("127.0.0.1", args.port),Handler).serve_forever()

if __name__ == "__main__": main()

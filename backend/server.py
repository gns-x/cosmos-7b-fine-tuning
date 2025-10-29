import os
import warnings
from typing import Optional

warnings.simplefilter("ignore")

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

import torch
from transformers import pipeline, BitsAndBytesConfig

# Strictly replicate test configuration
# Model path fixed to train/cosmos-model (root of repo), even when server runs from backend/
MODEL_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cosmos-model"))
# Temp folder for uploaded videos
TEMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "temp"))
os.makedirs(TEMP_DIR, exist_ok=True)

app = FastAPI()

# Allow vite dev server default origin and any localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    nim_ready: bool
    model: str


class AnalyzeResponse(BaseModel):
    reasoning: list[str]
    answer: str
    confidence: float
    timestamp: str
    actor: str
    events: Optional[list[dict]] = None
    summary: Optional[dict] = None


_pipe = None


def get_pipe():
    global _pipe
    if _pipe is not None:
        return _pipe
    quant_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.bfloat16,
        bnb_4bit_quant_type="nf4",
    )
    _pipe = pipeline(
        "image-text-to-text",
        model=MODEL_PATH,
        device_map="auto",
        dtype=torch.bfloat16,  # match test
        quantization_config=quant_config,
        trust_remote_code=True,
    )
    return _pipe


@app.get("/health", response_model=HealthResponse)
def health():
    try:
        p = get_pipe()
        ready = p is not None
        return HealthResponse(status="healthy" if ready else "loading", nim_ready=ready, model=os.path.basename(MODEL_PATH))
    except Exception:
        return HealthResponse(status="offline", nim_ready=False, model=os.path.basename(MODEL_PATH))


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    prompt: str = Form(...),
    system_prompt: Optional[str] = Form(None),
    file: UploadFile = File(...),
):
    # Save uploaded file to temp
    dst_path = os.path.join(TEMP_DIR, file.filename)
    with open(dst_path, "wb") as f:
        f.write(await file.read())

    # Compose chat messages (replicate test format; include system prompt if provided as first text block)
    content = []
    if system_prompt:
        content.append({"type": "text", "text": system_prompt})
    content.append({"type": "text", "text": prompt})
    content.append({"type": "video", "video": dst_path})
    messages = [{"role": "user", "content": content}]

    p = get_pipe()
    output = p(messages, max_new_tokens=512)
    text = ""
    try:
        text = output[0]["generated_text"][-1]["content"]
    except Exception:
        text = str(output)

    # Minimal response; events parsing is model/output dependent
    return AnalyzeResponse(
        reasoning=[],
        answer=text,
        confidence=0.0,
        timestamp="",
        actor=os.path.basename(MODEL_PATH),
        events=[],
        summary={},
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))



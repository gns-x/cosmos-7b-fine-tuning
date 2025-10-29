SHELL := /bin/bash

.PHONY: help install backend-install frontend-install start start-backend start-frontend stop stop-backend stop-frontend

help:
	@echo "Available targets:"
	@echo "  make install        - Install backend and frontend dependencies"
	@echo "  make start          - Start backend and frontend (background)"
	@echo "  make stop           - Stop backend and frontend"

install: backend-install frontend-install

backend-install:
	@echo "[backend] Creating venv and installing requirements..."
	python3 -m venv backend/.venv
	. backend/.venv/bin/activate && pip install --upgrade pip
	. backend/.venv/bin/activate && pip install -r backend/requirements_backend.txt

frontend-install:
	@echo "[frontend] Installing npm dependencies..."
	cd frontend && npm ci

start: start-backend start-frontend

start-backend:
	@echo "[backend] Starting FastAPI server..."
	mkdir -p .pids
	bash -lc 'PORT=$$(grep -E "^PORT=" backend/.env 2>/dev/null | cut -d"=" -f2); \\
		[ -z "$$PORT" ] && PORT=8000; \\
		. backend/.venv/bin/activate && python backend/server.py >/dev/null 2>&1 & echo $$! > .pids/backend.pid; \\
		echo "[backend] PID=$$(cat .pids/backend.pid), PORT=$$PORT"'

start-frontend:
	@echo "[frontend] Starting Vite dev server..."
	mkdir -p .pids
	bash -lc 'cd frontend && (npm run dev >/dev/null 2>&1 & echo $$! > ../.pids/frontend.pid); echo "[frontend] PID=$$(cat ../.pids/frontend.pid)"'

stop: stop-frontend stop-backend

stop-backend:
	@if [ -f .pids/backend.pid ]; then \
		PID=$$(cat .pids/backend.pid); \
		if kill -0 $$PID 2>/dev/null; then echo "[backend] Stopping $$PID" && kill $$PID; else echo "[backend] Not running"; fi; \
		rm -f .pids/backend.pid; \
	else \
		echo "[backend] No PID file"; \
	fi

stop-frontend:
	@if [ -f .pids/frontend.pid ]; then \
		PID=$$(cat .pids/frontend.pid); \
		if kill -0 $$PID 2>/dev/null; then echo "[frontend] Stopping $$PID" && kill $$PID; else echo "[frontend] Not running"; fi; \
		rm -f .pids/frontend.pid; \
	else \
		echo "[frontend] No PID file"; \
	fi

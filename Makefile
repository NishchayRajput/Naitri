# Naitri developer tasks. Run `make help` for the list.
#
# Node is loaded through nvm when present (non-interactive shells do not get
# it on PATH); the version comes from frontend/.nvmrc.

SHELL := /bin/bash
NVM := if [ -s "$$HOME/.nvm/nvm.sh" ]; then source "$$HOME/.nvm/nvm.sh" >/dev/null && nvm use >/dev/null; fi
MONGO_TEST_URI ?= mongodb://127.0.0.1:27017

.PHONY: help setup mongo dev backend frontend test test-backend test-integration test-frontend build

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

setup: ## Install deps and create local env files (safe to re-run)
	@test -f backend/.env || { cp backend/.env.example backend/.env; \
		sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$$(openssl rand -base64 48)|" backend/.env; \
		echo "created backend/.env"; }
	@test -f frontend/.env.local || { echo "NEXT_PUBLIC_API_URL=http://localhost:5000" > frontend/.env.local; \
		echo "created frontend/.env.local"; }
	cd backend && go mod download
	cd frontend && $(NVM) && npm ci --no-audit --no-fund

mongo: ## Start MongoDB in Docker (skip if you already run mongod locally)
	@if (echo > /dev/tcp/127.0.0.1/27017) 2>/dev/null; then \
		echo "something is already listening on 27017; using it"; \
	else docker compose up -d mongo; fi

backend: ## Run the Go API + SFU on :5000
	cd backend && go run ./cmd/server

frontend: ## Run the Next.js dev server on :3000
	cd frontend && $(NVM) && npm run dev

dev: mongo ## Run backend and frontend together (Ctrl+C stops both)
	@trap 'kill 0' EXIT; \
	( cd backend && go run ./cmd/server ) & \
	( cd frontend && $(NVM) && npm run dev ) & \
	wait

test: test-backend test-integration test-frontend ## Run every test and check

test-backend: ## Go unit tests with the race detector
	cd backend && go vet ./... && go test -race ./...

test-integration: ## Go tests that need MongoDB (refresh rotation, bans)
	cd backend && MONGO_TEST_URI=$(MONGO_TEST_URI) go test -count=1 -run 'Refresh|Logout|Banned' -v ./internal/service/

test-frontend: ## Typecheck and lint the frontend
	cd frontend && $(NVM) && npx tsc --noEmit && npm run lint

build: ## Production builds of both halves
	cd backend && go build -trimpath -ldflags="-s -w" -o bin/naitri ./cmd/server
	cd frontend && $(NVM) && npm run build

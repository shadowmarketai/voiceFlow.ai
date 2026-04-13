#!/bin/bash
# ============================================
# VoiceFlow AI SaaS - Run Script
# ============================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║     🎙️  VoiceFlow AI SaaS                 ║"
echo "║     Voice AI + White-Label Platform       ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

MODE=${1:-"dev"}

case $MODE in
    "dev")
        echo -e "${GREEN}Starting in DEVELOPMENT mode...${NC}"
        if [ ! -d "venv" ]; then
            echo -e "${YELLOW}Creating virtual environment...${NC}"
            python3 -m venv venv
        fi
        source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
        echo -e "${YELLOW}Installing dependencies...${NC}"
        pip install -r requirements.txt -q
        export APP_ENV=development
        export DEBUG=True
        if [ ! -f ".env" ]; then
            echo -e "${YELLOW}Using default .env${NC}"
        fi
        if [ -f ".env" ]; then
            export $(grep -v '^#' .env | grep -v '^$' | xargs)
        fi
        echo -e "${GREEN}Starting VoiceFlow AI API server...${NC}"
        echo -e "${BLUE}Dashboard: http://localhost:8001${NC}"
        echo -e "${BLUE}API Docs:  http://localhost:8001/docs${NC}"
        uvicorn src.api.server:app --reload --host 0.0.0.0 --port 8001
        ;;
    "test")
        echo -e "${GREEN}Running tests...${NC}"
        source venv/bin/activate 2>/dev/null || source venv/Scripts/activate 2>/dev/null
        pytest tests/ -v --cov=src --cov-report=term-missing
        ;;
    *)
        echo -e "${RED}Unknown mode: $MODE${NC}"
        echo "Usage: ./run.sh [dev|test]"
        exit 1
        ;;
esac

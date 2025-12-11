#!/bin/bash

# BearAI Backend Starter
cd "$(dirname "$0")"

echo "🐻 Starting BearAI Backend..."

# Activate venv
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Creating..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

# Check if test.mp3 exists
if [ ! -f "test.mp3" ]; then
    echo "⚠️  WARNING: test.mp3 not found!"
    echo "   Please add a test.mp3 file to the backend directory."
fi

# Start server
echo "🚀 Starting server on port 8005..."
python main.py

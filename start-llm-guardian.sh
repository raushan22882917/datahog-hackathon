#!/bin/bash

# LLM Guardian Startup Script
# This script starts both the backend API and frontend dashboard

echo "🚀 Starting LLM Guardian..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo "⚠️  Port $1 is already in use"
        return 1
    else
        return 0
    fi
}

# Check if required ports are available
echo "🔍 Checking ports..."
if ! check_port 3000; then
    echo "   Backend port 3000 is busy. Stop the existing process or use a different port."
fi

if ! check_port 5173; then
    echo "   Frontend port 5173 is busy. Stop the existing process or use a different port."
fi

echo ""

# Install dependencies if needed
echo "📦 Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo "   Installing backend dependencies..."
    npm install
fi

if [ ! -d "llm-guardian/node_modules" ]; then
    echo "   Installing frontend dependencies..."
    cd llm-guardian && npm install && cd ..
fi

echo ""

# Start the backend API server
echo "🔧 Starting Backend API Server..."
echo "   URL: http://localhost:3000"
echo "   API: http://localhost:3000/api/dashboard"
echo ""

# Start backend in background
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Test backend connection
echo "🔍 Testing backend connection..."
if curl -s http://localhost:3000/health > /dev/null; then
    echo "✅ Backend API is running"
else
    echo "❌ Backend API failed to start"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

echo ""

# Start the frontend dashboard
echo "🎨 Starting Frontend Dashboard..."
echo "   URL: http://localhost:5173"
echo ""

cd llm-guardian
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait a moment for frontend to start
sleep 5

echo ""
echo "🎉 LLM Guardian is now running!"
echo ""
echo "📊 Dashboard: http://localhost:5173"
echo "🔧 API Server: http://localhost:3000"
echo "🏥 Health Check: http://localhost:3000/health"
echo ""
echo "💡 To see data:"
echo "   1. Make LLM API calls from your applications"
echo "   2. Data will appear in the dashboard automatically"
echo "   3. Check README.md for detailed information"
echo ""
echo "⏹️  To stop: Press Ctrl+C"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down LLM Guardian..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "👋 Goodbye!"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Keep script running
wait
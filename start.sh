#!/bin/bash

echo "🚀 Starting Nefos Project Management System..."
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Build and start all services
echo "📦 Building and starting all services..."
docker-compose up -d --build

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if all services are running
echo ""
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "✅ Nefos is ready!"
echo ""
echo "🌐 Access the application at: http://localhost"
echo ""
echo "🔑 Default Admin Credentials:"
echo "   Email: admin@nefos.com"
echo "   Password: admin123"
echo ""
echo "⚠️  IMPORTANT: Change the admin password immediately!"
echo ""
echo "📝 Useful commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart: docker-compose restart"
echo ""

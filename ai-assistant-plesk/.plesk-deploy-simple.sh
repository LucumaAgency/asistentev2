#!/bin/bash

# Script simplificado de despliegue para Plesk
# Versión simple sin instalación automática de dependencias

echo "==================================="
echo "🚀 Despliegue simple en Plesk"
echo "==================================="

# Cambiar al directorio de la aplicación
cd "$(dirname "$0")" || exit 1

echo "📁 Directorio: $(pwd)"
echo ""

# Verificar archivos críticos
echo "🔍 Verificando archivos..."

if [ -f "server.js" ]; then
    echo "✅ server.js"
else
    echo "❌ server.js no encontrado"
    exit 1
fi

if [ -f "package.json" ]; then
    echo "✅ package.json"
else
    echo "❌ package.json no encontrado"
    exit 1
fi

if [ -d "frontend/dist" ]; then
    echo "✅ frontend/dist (compilado)"
else
    echo "⚠️  frontend/dist no encontrado"
fi

if [ -d "node_modules" ]; then
    echo "✅ node_modules (dependencias instaladas)"
else
    echo "⚠️  node_modules no encontrado - Ejecuta 'NPM install' desde Plesk"
fi

# Crear .env si no existe
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    cp .env.example .env
    echo "✅ .env creado desde .env.example"
fi

echo ""
echo "==================================="
echo "✅ Verificación completada"
echo "==================================="
echo ""
echo "⚠️  IMPORTANTE:"
echo "1. Ejecuta 'NPM install' desde el panel de Plesk"
echo "2. Configura las variables de entorno"
echo "3. Reinicia la aplicación Node.js"
echo ""

exit 0
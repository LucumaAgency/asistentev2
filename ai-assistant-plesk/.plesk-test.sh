#!/bin/bash

# Script de diagnóstico para el entorno Plesk
# Ayuda a identificar problemas de configuración

echo "==================================="
echo "🔍 Diagnóstico del entorno Plesk"
echo "==================================="
echo ""

# Información del sistema
echo "📊 Sistema:"
echo "- Usuario: $(whoami)"
echo "- Directorio: $(pwd)"
echo "- Sistema: $(uname -a)"
echo ""

# Buscar Node.js
echo "🟢 Node.js:"
for dir in /opt/plesk/node/*; do
    if [ -d "$dir" ] && [ -x "$dir/bin/node" ]; then
        echo "- Versión disponible: $dir"
    fi
done

if command -v node &> /dev/null; then
    echo "- Node en PATH: $(which node)"
    echo "- Versión: $(node --version)"
else
    echo "- Node NO está en PATH"
fi
echo ""

# Buscar NPM
echo "📦 NPM:"
for dir in /opt/plesk/node/*; do
    if [ -d "$dir" ] && [ -x "$dir/bin/npm" ]; then
        echo "- NPM disponible: $dir/bin/npm"
    fi
done

if command -v npm &> /dev/null; then
    echo "- NPM en PATH: $(which npm)"
    echo "- Versión: $(npm --version)"
else
    echo "- NPM NO está en PATH"
fi
echo ""

# Verificar estructura del proyecto
echo "📁 Estructura del proyecto:"
echo "- server.js: $([ -f "server.js" ] && echo "✅ Existe" || echo "❌ No existe")"
echo "- package.json: $([ -f "package.json" ] && echo "✅ Existe" || echo "❌ No existe")"
echo "- node_modules: $([ -d "node_modules" ] && echo "✅ Existe" || echo "❌ No existe")"
echo "- frontend/dist: $([ -d "frontend/dist" ] && echo "✅ Existe" || echo "❌ No existe")"
echo "- .env: $([ -f ".env" ] && echo "✅ Existe" || echo "⚠️ No existe")"
echo ""

# Variables de entorno relevantes
echo "🔧 Variables de entorno:"
echo "- NODE_ENV: ${NODE_ENV:-no definida}"
echo "- PORT: ${PORT:-no definida}"
echo "- PATH: $PATH"
echo ""

# Permisos
echo "🔐 Permisos:"
ls -la server.js 2>/dev/null || echo "server.js no encontrado"
echo ""

# Procesos Node.js activos
echo "⚙️ Procesos Node.js activos:"
ps aux | grep node | grep -v grep || echo "No hay procesos Node.js activos"
echo ""

# Puertos en uso
echo "🌐 Puertos en escucha:"
netstat -tuln 2>/dev/null | grep LISTEN | grep -E ':(3000|3001|8080)' || echo "No se detectaron puertos típicos de Node.js"
echo ""

echo "==================================="
echo "✅ Diagnóstico completado"
echo "==================================="
echo ""
echo "💡 Sugerencias:"
echo "1. Si npm no está disponible, usa el panel de Plesk"
echo "2. Verifica que server.js esté en la raíz del proyecto"
echo "3. Las dependencias deben instalarse con 'NPM install' en Plesk"
echo "4. Configura las variables de entorno en el panel de Plesk"
echo ""

exit 0
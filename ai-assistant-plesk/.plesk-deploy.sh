#!/bin/bash

# Script de despliegue para Plesk con detección automática de npm
# Este script busca npm en las ubicaciones comunes de Plesk

echo "==================================="
echo "🚀 Iniciando despliegue en Plesk"
echo "==================================="

# Función para encontrar npm
find_npm() {
    # Ubicaciones comunes de npm en Plesk
    local npm_paths=(
        "/opt/plesk/node/20/bin/npm"
        "/opt/plesk/node/18/bin/npm"
        "/opt/plesk/node/16/bin/npm"
        "/opt/plesk/node/14/bin/npm"
        "/usr/bin/npm"
        "$(which npm 2>/dev/null)"
    )
    
    for npm_path in "${npm_paths[@]}"; do
        if [ -x "$npm_path" ]; then
            echo "✅ NPM encontrado en: $npm_path"
            echo "$npm_path"
            return 0
        fi
    done
    
    echo "❌ NPM no encontrado en las rutas conocidas"
    return 1
}

# Buscar npm
NPM_PATH=$(find_npm)
if [ $? -ne 0 ]; then
    echo "⚠️  No se pudo encontrar npm. Por favor, instala las dependencias manualmente desde el panel de Plesk."
    exit 1
fi

# Cambiar al directorio de la aplicación
cd "$(dirname "$0")" || exit 1

echo "📁 Directorio actual: $(pwd)"

# Instalar dependencias del backend
echo ""
echo "📦 Instalando dependencias del backend..."
$NPM_PATH install --production

if [ $? -eq 0 ]; then
    echo "✅ Dependencias del backend instaladas"
else
    echo "❌ Error instalando dependencias del backend"
    exit 1
fi

# Verificar si existe el directorio frontend
if [ -d "frontend" ]; then
    echo ""
    echo "📦 Instalando dependencias del frontend..."
    cd frontend
    $NPM_PATH install --production
    
    if [ $? -eq 0 ]; then
        echo "✅ Dependencias del frontend instaladas"
    else
        echo "❌ Error instalando dependencias del frontend"
        exit 1
    fi
    
    cd ..
fi

# Verificar archivos importantes
echo ""
echo "🔍 Verificando archivos..."

if [ -f "server.js" ]; then
    echo "✅ server.js encontrado"
else
    echo "❌ server.js no encontrado"
    exit 1
fi

if [ -d "frontend/dist" ]; then
    echo "✅ frontend/dist encontrado"
else
    echo "⚠️  frontend/dist no encontrado - El frontend no está compilado"
fi

# Crear archivo .env si no existe
if [ ! -f ".env" ]; then
    echo ""
    echo "📝 Creando archivo .env desde .env.example..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Archivo .env creado"
        echo "⚠️  IMPORTANTE: Edita el archivo .env con tus credenciales"
    else
        echo "⚠️  No se encontró .env.example"
    fi
fi

echo ""
echo "==================================="
echo "✅ Despliegue completado"
echo "==================================="
echo ""
echo "📝 Próximos pasos:"
echo "1. Configura las variables de entorno en Plesk o edita .env"
echo "2. Reinicia la aplicación Node.js desde el panel de Plesk"
echo "3. Verifica que la aplicación esté funcionando"
echo ""

exit 0
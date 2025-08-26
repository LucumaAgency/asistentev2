#!/bin/bash

echo "=========================================="
echo "  Configuración de OpenAI API Key"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Archivo .env no encontrado"
    echo "Creando archivo .env desde .env.example..."
    cp .env.example .env
    echo "✅ Archivo .env creado"
    echo ""
fi

# Check current OpenAI API key
current_key=$(grep "OPENAI_API_KEY=" .env | cut -d'=' -f2)

if [ -z "$current_key" ] || [ "$current_key" = "sk-test-key" ] || [ "$current_key" = "" ]; then
    echo "⚠️  ADVERTENCIA: OpenAI API Key no está configurada correctamente"
    echo ""
    echo "Para configurar tu API key de OpenAI:"
    echo ""
    echo "1. Ve a https://platform.openai.com/api-keys"
    echo "2. Crea o copia tu API key (empieza con 'sk-')"
    echo "3. Edita el archivo .env:"
    echo ""
    echo "   nano .env"
    echo ""
    echo "4. Busca la línea OPENAI_API_KEY y reemplaza el valor:"
    echo ""
    echo "   OPENAI_API_KEY=sk-tu-api-key-real-aqui"
    echo ""
    echo "5. Guarda el archivo (Ctrl+X, luego Y, luego Enter)"
    echo "6. Reinicia el servidor:"
    echo ""
    echo "   npm restart"
    echo ""
else
    # Check if it looks like a valid key
    if [[ $current_key == sk-* ]] && [ ${#current_key} -gt 20 ]; then
        echo "✅ OpenAI API Key parece estar configurada"
        echo "   Key actual: ${current_key:0:10}..."
        echo ""
        echo "Si el chat aún no funciona, verifica que:"
        echo "1. La API key es válida y activa"
        echo "2. Tienes créditos disponibles en OpenAI"
        echo "3. La API key tiene los permisos necesarios"
    else
        echo "⚠️  La API key actual no parece válida: $current_key"
        echo "Las API keys de OpenAI deben empezar con 'sk-'"
    fi
fi

echo ""
echo "=========================================="
echo "  Estado del servidor"
echo "=========================================="
echo ""

# Check if server is running
if pgrep -f "node.*server" > /dev/null; then
    echo "✅ El servidor está en ejecución"
    
    # Test the chat endpoint
    echo ""
    echo "Probando endpoint de chat..."
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/chat \
        -H "Content-Type: application/json" \
        -d '{"message":"test","session_id":"test-session"}' 2>/dev/null)
    
    if [ "$response" = "503" ]; then
        echo "⚠️  El endpoint devuelve 503 - API key no configurada"
    elif [ "$response" = "500" ] || [ "$response" = "502" ]; then
        echo "⚠️  El endpoint devuelve error $response - Revisa los logs del servidor"
    elif [ "$response" = "200" ]; then
        echo "✅ El endpoint de chat responde correctamente"
    else
        echo "❓ Respuesta del endpoint: $response"
    fi
else
    echo "❌ El servidor no está en ejecución"
    echo "Inicia el servidor con: npm start"
fi

echo ""
echo "Para ver los logs del servidor en tiempo real:"
echo "  tail -f server.log"
echo ""
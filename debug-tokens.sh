#!/bin/bash

echo "=== Verificando guardado de tokens OAuth ==="
echo ""

# 1. Verificar qué servidor está corriendo
echo "1. Verificando proceso del servidor:"
curl -s https://asistentev2.pruebalucuma.site/api/health | python3 -m json.tool || echo "Error al conectar"
echo ""

# 2. Verificar estructura de la tabla
echo "2. Verificando tabla user_tokens en BD remota:"
echo "   (Necesitarías acceso SSH para esto)"
echo ""

# 3. Verificar si hay usuarios registrados
echo "3. Intentando endpoint de prueba:"
curl -s https://asistentev2.pruebalucuma.site/api/db-test | python3 -m json.tool || echo "No hay endpoint db-test"
echo ""

# 4. Verificar logs del servidor (si están disponibles)
echo "4. Últimos logs del servidor:"
curl -s --max-time 5 https://asistentev2.pruebalucuma.site/api/logs/calendar | tail -20 || echo "Timeout o no disponible"
echo ""

echo "=== Diagnóstico ==="
echo "El problema parece ser que:"
echo "1. El OAuth funciona (hasCalendarAccess: true)"
echo "2. Pero los tokens NO se guardan en user_tokens"
echo "3. Posible causa: La query INSERT está fallando silenciosamente"
echo ""
echo "Solución propuesta:"
echo "- Agregar más logs en el catch del INSERT"
echo "- Verificar que el server.cjs tenga el fix de la v3.13"
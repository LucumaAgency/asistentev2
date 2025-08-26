#!/usr/bin/env node

/**
 * Script de verificación de variables de entorno en Plesk
 * Ejecutar este script en Plesk para diagnosticar problemas con las variables
 */

console.log('========================================');
console.log('  Verificación de Variables en Plesk');
console.log('========================================\n');

// Verificar si estamos en Plesk
const inPlesk = !!process.env.PLESK_VHOST_ID || !!process.env.PLESK_DOMAIN;
console.log(`🔍 Entorno detectado: ${inPlesk ? 'PLESK' : 'NO PLESK (desarrollo local)'}`);
if (process.env.PLESK_DOMAIN) {
  console.log(`   Dominio Plesk: ${process.env.PLESK_DOMAIN}`);
}

console.log('\n--- Variables Críticas ---\n');

// 1. OpenAI API Key
const openaiKey = process.env.OPENAI_API_KEY;
if (!openaiKey) {
  console.log('❌ OPENAI_API_KEY: NO CONFIGURADA');
  console.log('   ⚠️  El chat con IA no funcionará sin esta variable');
  console.log('   📝 Configúrala en: Plesk > Node.js > Environment variables');
} else if (openaiKey === 'sk-test-key') {
  console.log('⚠️  OPENAI_API_KEY: Configurada con valor de prueba');
  console.log('   📝 Reemplaza con tu API key real de OpenAI');
} else if (openaiKey.startsWith('sk-') && openaiKey.length > 20) {
  console.log(`✅ OPENAI_API_KEY: Configurada correctamente (${openaiKey.substring(0, 10)}...)`);
} else {
  console.log('⚠️  OPENAI_API_KEY: Formato inválido');
  console.log('   📝 Las API keys de OpenAI deben empezar con "sk-"');
}

// 2. Base de datos
console.log('\n--- Configuración de Base de Datos ---\n');
const dbHost = process.env.DB_HOST;
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASSWORD;

if (dbHost && dbName && dbUser) {
  console.log('✅ Base de datos configurada:');
  console.log(`   Host: ${dbHost}`);
  console.log(`   Database: ${dbName}`);
  console.log(`   User: ${dbUser}`);
  console.log(`   Password: ${dbPass ? '***configurada***' : '⚠️ NO configurada'}`);
} else {
  console.log('⚠️  Base de datos NO configurada completamente');
  console.log(`   DB_HOST: ${dbHost || '❌ NO configurada'}`);
  console.log(`   DB_NAME: ${dbName || '❌ NO configurada'}`);
  console.log(`   DB_USER: ${dbUser || '❌ NO configurada'}`);
  console.log(`   DB_PASSWORD: ${dbPass ? '✅ configurada' : '❌ NO configurada'}`);
}

// 3. Google OAuth
console.log('\n--- Google OAuth (Calendar) ---\n');
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;

if (googleClientId && googleClientSecret) {
  console.log('✅ Google OAuth configurado:');
  console.log(`   Client ID: ${googleClientId.substring(0, 20)}...`);
  console.log(`   Client Secret: ***configurado***`);
  console.log(`   Redirect URI: ${googleRedirectUri || '⚠️ NO configurada'}`);
} else {
  console.log('ℹ️  Google OAuth no configurado (opcional)');
}

// 4. Otras variables importantes
console.log('\n--- Otras Variables ---\n');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development (por defecto)'}`);
console.log(`   PORT: ${process.env.PORT || '3001 (por defecto)'}`);
console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ configurado' : '⚠️ NO configurado'}`);

// Test de conexión a OpenAI
console.log('\n--- Test de OpenAI API ---\n');
if (openaiKey && openaiKey !== 'sk-test-key' && openaiKey.startsWith('sk-')) {
  const { OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey: openaiKey });
  
  console.log('🔄 Probando conexión con OpenAI...');
  
  openai.models.list()
    .then(models => {
      console.log('✅ Conexión exitosa con OpenAI');
      console.log(`   Modelos disponibles: ${models.data.length}`);
    })
    .catch(error => {
      console.log('❌ Error conectando con OpenAI:');
      if (error.status === 401) {
        console.log('   API key inválida o expirada');
      } else if (error.status === 429) {
        console.log('   Límite de rate excedido');
      } else {
        console.log(`   ${error.message}`);
      }
    });
} else {
  console.log('⏭️  Saltando test de OpenAI (API key no configurada)');
}

// Recomendaciones finales
console.log('\n========================================');
console.log('  Recomendaciones');
console.log('========================================\n');

if (!openaiKey || openaiKey === 'sk-test-key') {
  console.log('1. Configura OPENAI_API_KEY en Plesk:');
  console.log('   - Ve a Node.js Settings > Environment variables');
  console.log('   - Agrega: OPENAI_API_KEY = tu-api-key-de-openai');
  console.log('   - Reinicia la aplicación\n');
}

if (!dbHost) {
  console.log('2. Configura las variables de base de datos si necesitas persistencia\n');
}

if (!process.env.JWT_SECRET) {
  console.log('3. Configura JWT_SECRET para mayor seguridad en las sesiones\n');
}

console.log('\n✨ Para aplicar cambios en las variables:');
console.log('   1. Guarda los cambios en Plesk');
console.log('   2. Reinicia la aplicación Node.js');
console.log('   3. Verifica en: https://tu-dominio.com/api/diagnostics\n');
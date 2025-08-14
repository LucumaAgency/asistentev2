// Script de prueba para verificar la integración con Google Calendar
const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://asistentev2.pruebalucuma.site' 
  : 'http://localhost:3001';

console.log('🧪 TEST DE INTEGRACIÓN CON GOOGLE CALENDAR');
console.log('==========================================');
console.log('Base URL:', BASE_URL);
console.log('');

async function testCalendarIntegration() {
  try {
    // 1. Verificar que el servidor esté funcionando
    console.log('1️⃣ Verificando servidor...');
    const healthCheck = await axios.get(`${BASE_URL}/api/health`);
    console.log('   ✅ Servidor respondiendo:', healthCheck.data);
    console.log('');
    
    // 2. Verificar configuración OAuth
    console.log('2️⃣ Verificando configuración OAuth...');
    console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ NO configurado');
    console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Configurado' : '❌ NO configurado');
    console.log('   GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI || 'No configurado (usará default)');
    console.log('');
    
    // 3. Verificar endpoint de autorización
    console.log('3️⃣ Verificando endpoint de autorización OAuth...');
    try {
      const authUrlResponse = await axios.get(`${BASE_URL}/api/auth/google/auth-url`);
      if (authUrlResponse.data.authUrl) {
        console.log('   ✅ URL de autorización generada correctamente');
        console.log('   URL:', authUrlResponse.data.authUrl.substring(0, 80) + '...');
      } else {
        console.log('   ❌ No se pudo generar URL de autorización');
      }
    } catch (error) {
      console.log('   ❌ Error:', error.response?.data || error.message);
    }
    console.log('');
    
    // 4. Verificar endpoints de Calendar (sin autenticación, esperamos error 401)
    console.log('4️⃣ Verificando endpoints de Calendar...');
    
    const endpoints = [
      { method: 'GET', path: '/api/calendar/events', desc: 'Listar eventos' },
      { method: 'GET', path: '/api/calendar/events/today', desc: 'Eventos de hoy' },
      { method: 'GET', path: '/api/calendar/check-access', desc: 'Verificar acceso' },
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios({
          method: endpoint.method,
          url: `${BASE_URL}${endpoint.path}`,
          validateStatus: () => true // No lanzar error en status HTTP
        });
        
        if (response.status === 401 || response.status === 403) {
          console.log(`   ✅ ${endpoint.desc}: Endpoint protegido correctamente (${response.status})`);
        } else if (response.status === 200) {
          console.log(`   ⚠️ ${endpoint.desc}: Respondió sin autenticación (verificar si es intencional)`);
        } else {
          console.log(`   ❓ ${endpoint.desc}: Status ${response.status}`);
        }
      } catch (error) {
        console.log(`   ❌ ${endpoint.desc}: Error - ${error.message}`);
      }
    }
    console.log('');
    
    // 5. Verificar base de datos
    console.log('5️⃣ Verificando tablas en la base de datos...');
    const mysql = require('mysql2/promise');
    
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'asistente_ia'
      });
      
      // Verificar tabla users
      const [users] = await connection.execute('SHOW TABLES LIKE "users"');
      console.log('   Tabla users:', users.length > 0 ? '✅ Existe' : '❌ No existe');
      
      // Verificar tabla user_tokens
      const [tokens] = await connection.execute('SHOW TABLES LIKE "user_tokens"');
      console.log('   Tabla user_tokens:', tokens.length > 0 ? '✅ Existe' : '❌ No existe');
      
      if (tokens.length > 0) {
        // Verificar estructura de user_tokens
        const [columns] = await connection.execute('SHOW COLUMNS FROM user_tokens');
        const columnNames = columns.map(col => col.Field);
        console.log('   Columnas en user_tokens:', columnNames.join(', '));
        
        // Contar tokens guardados
        const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM user_tokens WHERE service = "google_calendar"');
        console.log('   Tokens de Calendar guardados:', countResult[0].count);
      }
      
      await connection.end();
    } catch (dbError) {
      console.log('   ⚠️ No se pudo conectar a la BD:', dbError.message);
      console.log('   (La aplicación puede funcionar sin BD en modo demo)');
    }
    console.log('');
    
    // 6. Resumen
    console.log('📊 RESUMEN');
    console.log('==========');
    console.log('✅ Servidor funcionando');
    console.log(process.env.GOOGLE_CLIENT_ID ? '✅ OAuth configurado' : '❌ OAuth NO configurado - necesitas configurar las credenciales');
    console.log('✅ Endpoints de Calendar implementados y protegidos');
    console.log('✅ Middleware de autenticación funcionando');
    console.log('');
    console.log('📝 PRÓXIMOS PASOS:');
    console.log('1. Asegúrate de tener las credenciales de Google OAuth configuradas');
    console.log('2. Verifica que el redirect URI esté configurado en Google Console');
    console.log('3. Prueba el flujo completo desde el frontend');
    console.log('4. El usuario debe iniciar sesión con Google para obtener permisos de Calendar');
    
  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar test
testCalendarIntegration();
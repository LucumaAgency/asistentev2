// Script completo de debugging para Calendar
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secret-key-super-segura-cambiar-en-produccion';

console.log('🔍 DEBUG COMPLETO DE GOOGLE CALENDAR');
console.log('=====================================\n');

async function debugCalendar() {
  let connection;
  
  try {
    // 1. Verificar configuración
    console.log('1️⃣ CONFIGURACIÓN DE VARIABLES DE ENTORNO:');
    console.log('   DB_HOST:', process.env.DB_HOST || 'NO CONFIGURADO');
    console.log('   DB_NAME:', process.env.DB_NAME || 'NO CONFIGURADO');
    console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ NO CONFIGURADO');
    console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Configurado' : '❌ NO CONFIGURADO');
    console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Configurado' : '❌ NO CONFIGURADO');
    console.log('');
    
    // 2. Conectar a la BD
    console.log('2️⃣ CONECTANDO A LA BASE DE DATOS...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'asistente_ia'
    });
    console.log('   ✅ Conectado a la BD');
    console.log('');
    
    // 3. Verificar tabla users
    console.log('3️⃣ VERIFICANDO TABLA USERS:');
    const [users] = await connection.execute('SELECT id, email, google_id, name, created_at FROM users ORDER BY id DESC LIMIT 5');
    
    if (users.length === 0) {
      console.log('   ❌ No hay usuarios registrados');
    } else {
      console.log(`   ✅ ${users.length} usuarios encontrados:`);
      users.forEach(user => {
        console.log(`      ID: ${user.id} | Email: ${user.email} | Google ID: ${user.google_id ? user.google_id.substring(0, 10) + '...' : 'NULL'}`);
      });
    }
    console.log('');
    
    // 4. Verificar tabla user_tokens
    console.log('4️⃣ VERIFICANDO TABLA USER_TOKENS:');
    const [tokensCheck] = await connection.execute('SHOW TABLES LIKE "user_tokens"');
    
    if (tokensCheck.length === 0) {
      console.log('   ❌ LA TABLA user_tokens NO EXISTE!');
      console.log('   Ejecuta: mysql -u root -p < update_tables_for_oauth.sql');
    } else {
      // Verificar estructura
      const [columns] = await connection.execute('DESCRIBE user_tokens');
      console.log('   ✅ Tabla user_tokens existe con columnas:');
      columns.forEach(col => {
        console.log(`      - ${col.Field} (${col.Type})`);
      });
      console.log('');
      
      // Verificar tokens guardados
      const [tokens] = await connection.execute(`
        SELECT 
          ut.id,
          ut.user_id,
          ut.service,
          ut.created_at,
          ut.expires_at,
          u.email,
          LENGTH(ut.access_token) as token_length,
          LENGTH(ut.refresh_token) as refresh_length
        FROM user_tokens ut
        LEFT JOIN users u ON ut.user_id = u.id
        WHERE ut.service = 'google_calendar'
        ORDER BY ut.created_at DESC
        LIMIT 5
      `);
      
      if (tokens.length === 0) {
        console.log('   ⚠️ NO HAY TOKENS DE CALENDAR GUARDADOS');
        console.log('   Los usuarios necesitan volver a autorizar con Google');
      } else {
        console.log(`   ✅ ${tokens.length} tokens de Calendar encontrados:`);
        tokens.forEach(token => {
          const expiresAt = new Date(token.expires_at);
          const isExpired = expiresAt < new Date();
          console.log(`      User ID: ${token.user_id} | Email: ${token.email}`);
          console.log(`         Access Token: ${token.token_length} chars | Refresh: ${token.refresh_length} chars`);
          console.log(`         Expira: ${expiresAt.toLocaleString()} ${isExpired ? '❌ EXPIRADO' : '✅ VÁLIDO'}`);
        });
      }
    }
    console.log('');
    
    // 5. Verificar un token JWT de ejemplo
    console.log('5️⃣ VERIFICACIÓN DE JWT:');
    console.log('   Para probar tu token actual, copia el token del localStorage y pégalo aquí:');
    console.log('   En el navegador, ejecuta: localStorage.getItem("authToken")');
    console.log('');
    
    // 6. Simular decodificación de JWT
    if (process.argv[2]) {
      const testToken = process.argv[2];
      console.log('   📝 Analizando token proporcionado...');
      try {
        const decoded = jwt.verify(testToken, JWT_SECRET);
        console.log('   ✅ Token JWT válido:');
        console.log('      ID en token:', decoded.id, '(tipo:', typeof decoded.id, ')');
        console.log('      Email:', decoded.email);
        console.log('      Name:', decoded.name);
        
        // Verificar si este usuario tiene tokens de Calendar
        if (decoded.id) {
          const userId = typeof decoded.id === 'string' ? parseInt(decoded.id, 10) : decoded.id;
          
          if (!isNaN(userId)) {
            const [userTokens] = await connection.execute(
              'SELECT * FROM user_tokens WHERE user_id = ? AND service = "google_calendar"',
              [userId]
            );
            
            if (userTokens.length > 0) {
              console.log('   ✅ Este usuario TIENE tokens de Calendar guardados');
            } else {
              console.log('   ❌ Este usuario NO tiene tokens de Calendar');
            }
          }
        }
      } catch (err) {
        console.log('   ❌ Token inválido:', err.message);
      }
    } else {
      console.log('   💡 TIP: Ejecuta este script con tu token como parámetro:');
      console.log('      node debug-calendar-full.cjs "tu-token-aqui"');
    }
    console.log('');
    
    // 7. Queries de verificación SQL
    console.log('6️⃣ QUERIES ÚTILES PARA VERIFICAR:');
    console.log('   -- Ver todos los usuarios y sus tokens:');
    console.log('   SELECT u.id, u.email, ut.service, ut.created_at');
    console.log('   FROM users u');
    console.log('   LEFT JOIN user_tokens ut ON u.id = ut.user_id;');
    console.log('');
    console.log('   -- Ver tokens de un usuario específico:');
    console.log('   SELECT * FROM user_tokens WHERE user_id = ?;');
    console.log('');
    
    // 8. Resumen final
    console.log('📊 RESUMEN DIAGNÓSTICO:');
    
    const problems = [];
    const solutions = [];
    
    if (!process.env.GOOGLE_CLIENT_ID) {
      problems.push('❌ Falta GOOGLE_CLIENT_ID');
      solutions.push('Configura GOOGLE_CLIENT_ID en .env o Plesk');
    }
    
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      problems.push('❌ Falta GOOGLE_CLIENT_SECRET');
      solutions.push('Configura GOOGLE_CLIENT_SECRET en .env o Plesk');
    }
    
    if (tokensCheck.length === 0) {
      problems.push('❌ Tabla user_tokens no existe');
      solutions.push('Ejecuta: mysql -u root -p < update_tables_for_oauth.sql');
    } else if (tokens.length === 0) {
      problems.push('⚠️ No hay tokens de Calendar guardados');
      solutions.push('Los usuarios deben volver a autorizar con Google');
    }
    
    if (problems.length === 0) {
      console.log('   ✅ TODO PARECE ESTAR CONFIGURADO CORRECTAMENTE');
      console.log('');
      console.log('   Si aún no funciona:');
      console.log('   1. Verifica los logs del servidor cuando intentes agendar');
      console.log('   2. Busca mensajes que digan "MODO CALENDAR ACTIVADO"');
      console.log('   3. Revisa si dice "USANDO GOOGLE CALENDAR REAL" o "MODO SIMULACIÓN"');
    } else {
      console.log('   PROBLEMAS ENCONTRADOS:');
      problems.forEach(p => console.log('   ' + p));
      console.log('');
      console.log('   SOLUCIONES:');
      solutions.forEach(s => console.log('   ' + s));
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('');
    console.error('Posibles causas:');
    console.error('1. Base de datos no disponible');
    console.error('2. Credenciales incorrectas');
    console.error('3. Tabla no existe');
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Ejecutar
debugCalendar();
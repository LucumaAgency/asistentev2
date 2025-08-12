import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function verifyDatabase() {
  console.log('🔍 Verificando estructura de base de datos...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'ai_assistant_user',
      password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : 'secure_password_2024',
      database: process.env.DB_NAME || 'ai_assistant_db'
    });

    // 1. Verificar estructura de tabla users
    console.log('📋 Estructura de tabla users:');
    const [userCols] = await connection.execute(`
      SHOW COLUMNS FROM users
    `);
    console.table(userCols.map(col => ({
      Field: col.Field,
      Type: col.Type,
      Key: col.Key
    })));

    // 2. Verificar estructura de tabla user_tokens
    console.log('\n📋 Estructura de tabla user_tokens:');
    const [tokenCols] = await connection.execute(`
      SHOW COLUMNS FROM user_tokens
    `);
    console.table(tokenCols.map(col => ({
      Field: col.Field,
      Type: col.Type,
      Key: col.Key
    })));

    // 3. Verificar usuarios existentes
    console.log('\n👥 Usuarios en la BD:');
    const [users] = await connection.execute(`
      SELECT id, google_id, email, name, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    if (users.length > 0) {
      console.table(users.map(u => ({
        id: u.id,
        id_type: typeof u.id,
        google_id: u.google_id?.substring(0, 10) + '...',
        email: u.email,
        name: u.name
      })));
    } else {
      console.log('   No hay usuarios en la BD');
    }

    // 4. Verificar tokens guardados
    console.log('\n🔑 Tokens guardados:');
    const [tokens] = await connection.execute(`
      SELECT ut.*, u.email, u.google_id 
      FROM user_tokens ut
      LEFT JOIN users u ON u.id = ut.user_id
      ORDER BY ut.created_at DESC 
      LIMIT 5
    `);
    if (tokens.length > 0) {
      console.table(tokens.map(t => ({
        user_id: t.user_id,
        user_id_type: typeof t.user_id,
        email: t.email,
        google_id: t.google_id?.substring(0, 10) + '...',
        service: t.service,
        has_access: !!t.access_token,
        has_refresh: !!t.refresh_token,
        expires_at: t.expires_at
      })));
    } else {
      console.log('   No hay tokens guardados');
    }

    // 5. Verificar si la tabla user_tokens existe correctamente
    console.log('\n🏗️ Creando tabla user_tokens si no existe (con estructura correcta):');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        service VARCHAR(50) NOT NULL DEFAULT 'google_calendar',
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_service (user_id, service),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✅ Tabla user_tokens verificada/creada');

    await connection.end();
    
    console.log('\n✅ Verificación completada');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('   Código:', error.code);
    }
    if (error.sqlMessage) {
      console.error('   SQL:', error.sqlMessage);
    }
    process.exit(1);
  }
}

verifyDatabase();
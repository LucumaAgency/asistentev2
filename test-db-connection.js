#!/usr/bin/env node

import mysql from 'mysql2/promise';

async function testDatabase() {
  console.log('🔍 Probando conexión a la base de datos...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'asistente_test'
    });
    
    console.log('✅ Conectado a la base de datos\n');
    
    // Verificar tablas
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📋 Tablas encontradas:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log('   - ' + tableName);
    });
    
    // Verificar usuarios
    console.log('\n👥 Usuarios registrados:');
    const [users] = await connection.execute('SELECT id, email, name FROM users');
    if (users.length === 0) {
      console.log('   (No hay usuarios registrados aún)');
    } else {
      users.forEach(user => {
        console.log(`   - [${user.id}] ${user.email} (${user.name})`);
      });
    }
    
    // Verificar tokens
    console.log('\n🔑 Tokens de Calendar guardados:');
    const [tokens] = await connection.execute(
      'SELECT ut.*, u.email FROM user_tokens ut JOIN users u ON ut.user_id = u.id WHERE ut.service = "google_calendar"'
    );
    if (tokens.length === 0) {
      console.log('   (No hay tokens guardados aún)');
    } else {
      tokens.forEach(token => {
        console.log(`   - Usuario: ${token.email}`);
        console.log(`     Access Token: ${token.access_token ? '✅' : '❌'}`);
        console.log(`     Refresh Token: ${token.refresh_token ? '✅' : '❌'}`);
        console.log(`     Expira: ${token.expires_at}`);
      });
    }
    
    await connection.end();
    console.log('\n✅ Prueba completada');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testDatabase();
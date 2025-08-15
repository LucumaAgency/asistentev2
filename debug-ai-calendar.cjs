#!/usr/bin/env node

const mysql = require('mysql2/promise');
require('dotenv').config();

async function debugAICalendar() {
  console.log('🔍 Debug IA Calendar Integration\n');
  console.log('='.repeat(50));
  
  let db;
  
  try {
    // 1. Conectar a BD
    console.log('1. Conectando a base de datos...');
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'ai_assistant_db'
    });
    console.log('   ✅ BD conectada\n');
    
    // 2. Buscar usuarios con tokens
    console.log('2. Buscando usuarios con tokens de Calendar...');
    const [users] = await db.execute(`
      SELECT 
        u.id, 
        u.email, 
        u.google_id,
        ut.access_token,
        ut.refresh_token,
        ut.expires_at,
        ut.created_at as token_created,
        ut.updated_at as token_updated
      FROM users u
      LEFT JOIN user_tokens ut ON u.id = ut.user_id AND ut.service = 'google_calendar'
      WHERE ut.access_token IS NOT NULL
    `);
    
    console.log(`   Encontrados ${users.length} usuarios con tokens\n`);
    
    if (users.length > 0) {
      users.forEach((user, idx) => {
        console.log(`   Usuario ${idx + 1}:`);
        console.log(`   - ID: ${user.id}`);
        console.log(`   - Email: ${user.email}`);
        console.log(`   - Google ID: ${user.google_id}`);
        console.log(`   - Token Access: ${user.access_token ? user.access_token.substring(0, 30) + '...' : 'NO'}`);
        console.log(`   - Token Refresh: ${user.refresh_token ? 'SÍ' : 'NO'}`);
        console.log(`   - Token creado: ${user.token_created}`);
        console.log(`   - Token actualizado: ${user.token_updated}`);
        console.log(`   - Token expira: ${user.expires_at}`);
        console.log('');
      });
    }
    
    // 3. Verificar sesiones de chat en modo calendar
    console.log('3. Buscando sesiones de chat en modo Calendar...');
    const [sessions] = await db.execute(`
      SELECT 
        cs.chat_id,
        cs.mode_id,
        cs.title,
        cs.created_at,
        COUNT(DISTINCT c.id) as conversation_count
      FROM chat_sessions cs
      LEFT JOIN conversations c ON JSON_EXTRACT(c.metadata, '$.chat_id') = cs.chat_id
      WHERE cs.mode_id = 'calendar'
      GROUP BY cs.chat_id
      ORDER BY cs.created_at DESC
      LIMIT 5
    `);
    
    console.log(`   Encontradas ${sessions.length} sesiones en modo Calendar\n`);
    
    if (sessions.length > 0) {
      sessions.forEach((session, idx) => {
        console.log(`   Sesión ${idx + 1}:`);
        console.log(`   - Chat ID: ${session.chat_id}`);
        console.log(`   - Título: ${session.title || 'Sin título'}`);
        console.log(`   - Creada: ${session.created_at}`);
        console.log(`   - Conversaciones: ${session.conversation_count}`);
        console.log('');
      });
    }
    
    // 4. Verificar la configuración del modo Calendar
    console.log('4. Verificando configuración del modo Calendar...');
    const [modes] = await db.execute(`
      SELECT * FROM assistant_modes WHERE id = 'calendar'
    `);
    
    if (modes.length > 0) {
      const mode = modes[0];
      console.log('   Modo Calendar encontrado:');
      console.log(`   - Nombre: ${mode.name}`);
      console.log(`   - Descripción: ${mode.description}`);
      console.log(`   - Prompt (primeros 200 chars): ${mode.prompt ? mode.prompt.substring(0, 200) + '...' : 'Sin prompt'}`);
      console.log(`   - Context: ${mode.context ? mode.context.substring(0, 200) + '...' : 'Sin context'}`);
    } else {
      console.log('   ⚠️  Modo Calendar NO encontrado en BD');
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 RESUMEN:\n');
    
    // 5. Resumen y recomendaciones
    if (users.length === 0) {
      console.log('❌ No hay usuarios con tokens de Calendar guardados');
      console.log('   → El usuario necesita autorizar Calendar primero');
    } else {
      console.log('✅ Hay usuarios con tokens de Calendar');
    }
    
    if (sessions.length === 0) {
      console.log('⚠️  No hay sesiones de chat en modo Calendar');
      console.log('   → Asegúrate de seleccionar el modo Calendar en el chat');
    } else {
      console.log('✅ Hay sesiones de chat en modo Calendar');
    }
    
    if (modes.length === 0) {
      console.log('❌ El modo Calendar no está configurado en BD');
      console.log('   → Necesitas configurar el modo en assistant_modes');
    } else {
      console.log('✅ Modo Calendar está configurado');
    }
    
    // 6. Test de función schedule_meeting
    console.log('\n' + '='.repeat(50));
    console.log('🧪 TEST DE FUNCIÓN schedule_meeting:\n');
    
    if (users.length > 0) {
      const testUser = users[0];
      console.log(`Simulando llamada con tokens del usuario ${testUser.email}:`);
      
      const testParams = {
        title: "Reunión de prueba",
        date: new Date().toISOString().split('T')[0],
        time: "15:00",
        duration: 30
      };
      
      console.log('Parámetros de prueba:', testParams);
      console.log('Tokens disponibles:', {
        hasAccessToken: !!testUser.access_token,
        hasRefreshToken: !!testUser.refresh_token
      });
      
      // Aquí podrías hacer una llamada real a la función si quisieras
      console.log('\n💡 Para probar la IA:');
      console.log('1. Inicia sesión con el usuario que tiene tokens');
      console.log('2. Selecciona el modo "Calendar" en el chat');
      console.log('3. Pide: "Crea una reunión llamada Test para mañana a las 3 PM"');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (db) await db.end();
  }
}

debugAICalendar();
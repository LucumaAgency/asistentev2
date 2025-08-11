#!/usr/bin/env node

/**
 * Script de prueba para verificar el flujo OAuth localmente
 * 
 * NOTA: Este script simula el flujo OAuth pero necesitarás un código real
 * Para obtener un código real:
 * 1. Visita la URL que se muestra
 * 2. Autoriza la aplicación
 * 3. Copia el código de la URL de callback
 * 4. Pégalo cuando se te solicite
 */

import readline from 'readline';
import fetch from 'node-fetch';
import mysql from 'mysql2/promise';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

async function testOAuthFlow() {
  console.log('🧪 Iniciando prueba del flujo OAuth local');
  console.log('========================================\n');

  try {
    // 1. Obtener URL de autorización
    console.log('1️⃣ Obteniendo URL de autorización...');
    const authUrlResponse = await fetch('http://localhost:3001/api/auth/google/auth-url');
    const { authUrl } = await authUrlResponse.json();
    
    console.log('\n✅ URL de autorización obtenida:');
    console.log('----------------------------------------');
    console.log(authUrl);
    console.log('----------------------------------------\n');
    
    console.log('📝 Instrucciones:');
    console.log('1. Abre la URL anterior en tu navegador');
    console.log('2. Autoriza la aplicación con tu cuenta de Google');
    console.log('3. Serás redirigido a una página con un código en la URL');
    console.log('4. Copia el valor del parámetro "code" de la URL\n');
    
    const code = await question('Pega el código aquí: ');
    
    if (!code) {
      console.log('❌ No se proporcionó código');
      return;
    }
    
    // 2. Procesar el código
    console.log('\n2️⃣ Procesando código OAuth...');
    const tokenResponse = await fetch('http://localhost:3001/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.success) {
      console.log('✅ Autenticación exitosa!');
      console.log('Usuario:', tokenData.user.email);
      console.log('Tiene acceso a Calendar:', tokenData.hasCalendarAccess);
      
      // 3. Verificar en la base de datos
      console.log('\n3️⃣ Verificando tokens en la base de datos...');
      
      const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'asistente_test'
      });
      
      // Buscar usuario
      const [users] = await connection.execute(
        'SELECT id, email FROM users WHERE email = ?',
        [tokenData.user.email]
      );
      
      if (users.length > 0) {
        console.log('✅ Usuario encontrado en BD:', users[0].email);
        
        // Verificar tokens de Calendar
        const [tokens] = await connection.execute(
          'SELECT * FROM user_tokens WHERE user_id = ? AND service = "google_calendar"',
          [users[0].id]
        );
        
        if (tokens.length > 0) {
          console.log('✅ Tokens de Calendar guardados en BD');
          console.log('   - Access token:', tokens[0].access_token ? '✅ Presente' : '❌ Falta');
          console.log('   - Refresh token:', tokens[0].refresh_token ? '✅ Presente' : '❌ Falta');
          console.log('   - Expira en:', tokens[0].expires_at);
        } else {
          console.log('❌ No se encontraron tokens de Calendar en BD');
        }
      } else {
        console.log('❌ Usuario no encontrado en BD');
      }
      
      await connection.end();
      
    } else {
      console.log('❌ Error en autenticación:', tokenData.error);
      if (tokenData.details) {
        console.log('Detalles:', tokenData.details);
      }
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  } finally {
    rl.close();
  }
}

// Ejecutar prueba
testOAuthFlow();
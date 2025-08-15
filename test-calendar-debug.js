// Script para ejecutar en la consola del navegador
// Copia y pega esto en la consola de Chrome/Firefox cuando estés en tu sitio

async function testCalendarDebug() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.error('❌ No hay token en localStorage. Por favor inicia sesión primero.');
    return;
  }
  
  console.log('🔍 Token encontrado, haciendo petición...');
  
  try {
    const response = await fetch('/api/calendar/debug-status', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    console.log('📊 Resultado del debug de Calendar:');
    console.log(JSON.stringify(data, null, 2));
    
    // Análisis del resultado
    console.log('\n📋 ANÁLISIS:');
    console.log('✅ JWT válido:', data.auth?.hasValidJWT ? 'SÍ' : 'NO');
    console.log('✅ User ID:', data.auth?.userId || 'No identificado');
    console.log('✅ BD conectada:', data.database?.isConnected ? 'SÍ' : 'NO');
    console.log('✅ Tokens encontrados:', data.tokens?.found ? 'SÍ' : 'NO');
    
    if (data.tokens?.found) {
      console.log('   - Tokens expirados:', data.tokens.isExpired ? 'SÍ ⚠️' : 'NO ✅');
      console.log('   - Expira:', data.tokens.expiresAt);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Ejecutar el test
testCalendarDebug();
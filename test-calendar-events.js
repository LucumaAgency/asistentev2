// Script para probar los endpoints de Calendar directamente
// Ejecutar en la consola del navegador

async function testCalendarEvents() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.error('❌ No hay token. Inicia sesión primero.');
    return;
  }
  
  console.log('🔍 Probando endpoint de eventos de hoy...');
  
  try {
    const response = await fetch('/api/calendar/events/today', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Status:', response.status);
    
    const data = await response.json();
    console.log('📅 Respuesta:', data);
    
    if (response.ok) {
      console.log('✅ Eventos obtenidos exitosamente');
      if (data.events && data.events.length > 0) {
        console.log(`📌 Tienes ${data.events.length} eventos hoy`);
      } else {
        console.log('📌 No tienes eventos para hoy');
      }
    } else {
      console.error('❌ Error:', data.error || data.message);
      console.log('Detalles completos:', data);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error de red:', error);
  }
}

// Función para probar creación de evento
async function testCreateEvent() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    console.error('❌ No hay token. Inicia sesión primero.');
    return;
  }
  
  console.log('🔍 Probando crear evento de prueba...');
  
  const testEvent = {
    summary: 'Evento de prueba - Calendar API',
    description: 'Este es un evento de prueba para verificar que Calendar funciona',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Mañana
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(), // Mañana + 1 hora
    attendees: []
  };
  
  try {
    const response = await fetch('/api/calendar/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testEvent)
    });
    
    console.log('📊 Status:', response.status);
    
    const data = await response.json();
    console.log('📅 Respuesta:', data);
    
    if (response.ok) {
      console.log('✅ Evento creado exitosamente');
      console.log('🔗 Link del evento:', data.event?.htmlLink);
    } else {
      console.error('❌ Error:', data.error || data.message);
      console.log('Detalles completos:', data);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error de red:', error);
  }
}

// Ejecutar prueba de lectura
console.log('=== PRUEBA 1: Obtener eventos de hoy ===');
testCalendarEvents();

// Para probar creación, descomenta esta línea:
// console.log('\n=== PRUEBA 2: Crear evento de prueba ===');
// testCreateEvent();
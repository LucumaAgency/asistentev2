# Fix IA Calendar - Instrucciones

## Problema Identificado
La IA no puede agendar reuniones porque:
1. Los tokens de Calendar no están guardados en la BD
2. El modo Calendar existe pero necesita estar correctamente configurado

## Solución - Pasos a Seguir

### 1. Verificar Estado Actual
Abre la consola del navegador y ejecuta:
```javascript
fetch('/api/test/ai-calendar-status', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
}).then(r => r.json()).then(console.log)
```

### 2. Re-autorizar Calendar
**IMPORTANTE: Debes hacer esto para que se guarden los tokens**

1. Cierra sesión (si estás logueado)
2. Vuelve a iniciar sesión con Google
3. **ASEGÚRATE de autorizar los permisos de Calendar cuando Google te lo pida**
4. Verifica que en la consola aparezca:
   - `✅ TOKENS GUARDADOS`
   - `DB existe: true`

### 3. Verificar Tokens Guardados
Después de autorizar, ejecuta en la consola:
```javascript
fetch('/api/test/ai-calendar-status', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
}).then(r => r.json()).then(data => {
  console.log('Tokens guardados:', data.checks.tokens);
  console.log('Tu usuario:', data.currentUser);
})
```

### 4. Probar IA con Calendar

1. **Selecciona el modo Calendar**:
   - En el chat, busca el selector de modo
   - Selecciona "📅 Calendario" o "Calendar"

2. **Prueba estos comandos**:
   ```
   "Crea una reunión llamada 'Test IA' para mañana a las 3 PM por 30 minutos"
   
   "Lista mis eventos de hoy"
   
   "¿Tengo disponible mañana a las 10 AM?"
   ```

## Debug Adicional

### Ver logs en tiempo real:
```javascript
// En la consola del navegador
console.log('Token actual:', localStorage.getItem('token'));
console.log('Usuario:', JSON.parse(localStorage.getItem('user')));
```

### Verificar en la BD (servidor):
```sql
-- Ver tokens guardados
SELECT u.email, ut.* 
FROM users u 
JOIN user_tokens ut ON u.id = ut.user_id 
WHERE ut.service = 'google_calendar';

-- Ver modo Calendar
SELECT * FROM modes WHERE mode_id = 'calendar' OR name LIKE '%Calend%';

-- Ver sesiones en modo Calendar
SELECT * FROM chat_sessions WHERE mode_id = 'calendar' OR mode_id = '2';
```

## Resumen del Fix v3.28

✅ **Corregido**:
- Formato de eventos para UI
- Manejo de arrays vacíos
- Modo Calendar configurado en BD

⚠️ **Necesitas hacer**:
1. Re-autorizar Calendar para guardar tokens
2. Seleccionar modo Calendar en el chat
3. Probar comandos de calendario

## Endpoint de Test
```
GET /api/test/ai-calendar-status
```
Este endpoint te dirá exactamente qué está fallando.
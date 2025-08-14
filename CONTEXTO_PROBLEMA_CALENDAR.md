# Contexto del Problema con Google Calendar

## Pregunta del Usuario:
"como se puede debugear más? sigue sin poderse agendar un meet, me sale esto:Solicitando URL de autorización con Calendar...
VM125:68 Respuesta del servidor: {authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?acces…el23s9l4eaum6ivculok1s.apps.googleusercontent.com'}
VM125:68 Redirigiendo a Google OAuth con permisos de Calendar...
[... logs del navegador mostrando el flujo OAuth completo ...]
oauth-callback.html:91 Datos de respuesta: {success: true, token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', hasCalendarAccess: true, user: {…}}
oauth-callback.html:105 Usuario guardado: carlosmurilloortecho@gmail.com
[...]
veo que hay un problema con el token, no se guarda en la DB"

## Respuesta y Solución:

### 🎯 RESUMEN DEL PROBLEMA Y SOLUCIÓN:

El problema es que **la tabla `user_tokens` no existe en la base de datos de Plesk** o los tokens no se están guardando correctamente después del OAuth.

### Diagnóstico:
- El flujo OAuth funciona correctamente (el usuario autoriza y recibe tokens)
- El frontend dice `hasCalendarAccess: true`
- PERO los tokens no se guardan en la base de datos
- Por eso cuando intenta agendar, el servidor no encuentra los tokens y usa modo simulación

### Pasos para solucionarlo:

1. **En phpMyAdmin de Plesk**, ejecuta el script SQL del archivo `create_user_tokens_table.sql` para crear la tabla que almacena los tokens de Google Calendar:

```sql
CREATE TABLE IF NOT EXISTS user_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service VARCHAR(50) NOT NULL DEFAULT 'google_calendar',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(50) DEFAULT 'Bearer',
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_tokens (user_id),
  INDEX idx_service (service),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

2. **Cierra sesión y vuelve a iniciar sesión** con Google para que se guarden los tokens nuevos en la tabla recién creada

3. **Verifica en phpMyAdmin** que se guardaron los tokens:
   ```sql
   SELECT * FROM user_tokens WHERE user_id = 1;
   -- O busca por email:
   SELECT ut.*, u.email 
   FROM user_tokens ut 
   JOIN users u ON ut.user_id = u.id 
   WHERE u.email = 'carlosmurilloortecho@gmail.com';
   ```

4. **Intenta agendar** una reunión en el modo Calendario

### Archivos de ayuda creados:
- `INSTALAR_CALENDAR_EN_PLESK.md` - Guía completa paso a paso
- `create_user_tokens_table.sql` - Script SQL para crear la tabla
- `debug-calendar-full.cjs` - Script de debugging para verificar la configuración

### Qué buscar en los logs de Plesk cuando funcione:
```
📅 ==========MODO CALENDAR ACTIVADO==========
🔎 Buscando tokens en BD para user_id: 1
✅ Tokens de Calendar obtenidos de la BD
🔐 USANDO GOOGLE CALENDAR REAL - CREANDO EVENTO
✅ EVENTO CREADO EN GOOGLE CALENDAR
```

### Si ves "MODO SIMULACIÓN":
Significa que no encontró los tokens en la BD. Verifica:
1. Que la tabla `user_tokens` existe
2. Que hay registros para tu usuario
3. Que el `user_id` en el JWT coincide con el de la BD

El archivo `INSTALAR_CALENDAR_EN_PLESK.md` tiene todos los pasos detallados con queries SQL para verificar y debuggear.

## Nota importante:
Una vez que ejecutes el script SQL en Plesk y vuelvas a autorizar, debería funcionar perfectamente el agendamiento de reuniones en Google Calendar real, no en modo simulación.
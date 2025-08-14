# 🚨 INSTRUCCIONES PARA HACER FUNCIONAR GOOGLE CALENDAR EN PLESK

## EL PROBLEMA
Los tokens de Google Calendar no se están guardando en la base de datos de producción.

## LA SOLUCIÓN - Ejecuta estos pasos EN PLESK:

### 1. 📊 Crear la tabla user_tokens en phpMyAdmin de Plesk

1. Ve a Plesk → Bases de datos → phpMyAdmin
2. Selecciona tu base de datos
3. Ve a la pestaña "SQL"
4. Ejecuta este script:

```sql
-- IMPORTANTE: Ejecutar en la BD de producción en Plesk
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

### 2. 🔍 Verificar tu usuario actual

En phpMyAdmin, ejecuta:

```sql
-- Ver tu usuario (deberías ver tu email)
SELECT id, email, google_id, name FROM users WHERE email = 'carlosmurilloortecho@gmail.com';
```

Anota el **ID numérico** de tu usuario (probablemente 1 o 2).

### 3. 🔍 Verificar si ya tienes tokens guardados

```sql
-- Ver si hay tokens para tu usuario
SELECT * FROM user_tokens WHERE user_id = [TU_ID_AQUI];
```

Si no hay resultados, significa que necesitas volver a autorizar.

### 4. 🔄 Forzar nueva autorización

1. **Cierra sesión** en la aplicación
2. **Vuelve a iniciar sesión** con Google
3. **IMPORTANTE**: Asegúrate de que aparezca la pantalla de permisos de Google
4. Si no aparece la pantalla de permisos, ve a:
   - https://myaccount.google.com/permissions
   - Busca "AI Assistant v2"
   - Elimina el acceso
   - Vuelve a iniciar sesión

### 5. ✅ Verificar que funcionó

Después de volver a autorizar, en phpMyAdmin ejecuta:

```sql
-- Deberías ver tokens guardados
SELECT 
  ut.id,
  ut.user_id,
  u.email,
  LENGTH(ut.access_token) as token_size,
  LENGTH(ut.refresh_token) as refresh_size,
  ut.expires_at
FROM user_tokens ut
JOIN users u ON ut.user_id = u.id;
```

### 6. 🎯 Probar agendamiento

1. Ve al modo "📅 Calendario"
2. Escribe: "Agenda una reunión mañana a las 10am"
3. Revisa los logs en Plesk → Node.js → Logs

Deberías ver:
```
📅 ==========MODO CALENDAR ACTIVADO==========
🔐 USANDO GOOGLE CALENDAR REAL - CREANDO EVENTO
✅ EVENTO CREADO EN GOOGLE CALENDAR
```

## 🔍 DEBUGGING ADICIONAL

Si aún no funciona, en los logs de Plesk busca estos mensajes:

1. **"MODO CALENDAR ACTIVADO"** - Confirma que el modo calendario está activo
2. **"Buscando tokens en BD para user_id: X"** - Verifica que busca con el ID correcto
3. **"Tokens de Calendar obtenidos de la BD"** - Confirma que encontró los tokens
4. **"USANDO GOOGLE CALENDAR REAL"** vs **"MODO SIMULACIÓN"** - Te dice si tiene tokens o no

## 🆘 Si sigue sin funcionar:

1. Verifica que el `user_id` en el JWT sea numérico:
   - En el navegador: `localStorage.getItem('authToken')`
   - Decodifica en https://jwt.io
   - El campo `id` debe ser un número, no un string largo

2. Verifica las variables de entorno en Plesk:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `JWT_SECRET`

3. Revisa que el redirect URI en Google Console incluya:
   - `https://asistentev2.pruebalucuma.site/oauth-callback.html`

## 📝 Script SQL de emergencia

Si necesitas insertar tokens manualmente (NO recomendado, pero útil para testing):

```sql
-- SOLO para testing - reemplaza los valores
INSERT INTO user_tokens (user_id, service, access_token, refresh_token, expires_at)
VALUES (
  1, -- Tu user_id
  'google_calendar',
  'token_de_prueba', -- Aquí iría el token real
  'refresh_de_prueba', -- Aquí iría el refresh token
  DATE_ADD(NOW(), INTERVAL 1 HOUR)
);
```

---

**IMPORTANTE**: El problema principal es que la tabla `user_tokens` no existe en producción o los tokens no se están guardando correctamente. Siguiendo estos pasos debería funcionar.
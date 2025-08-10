# 🔐 Configuración de Google OAuth para AI Assistant v2

## 📋 Pasos para configurar Google OAuth

### 1. Configurar Google Cloud Console

1. **Ir a Google Cloud Console**
   - Visita: https://console.cloud.google.com/

2. **Crear un nuevo proyecto o seleccionar uno existente**
   - Click en el selector de proyectos (arriba)
   - "Nuevo Proyecto"
   - Nombre: "AI Assistant v2"

3. **Habilitar Google+ API**
   - En el menú lateral: "APIs y servicios" → "Biblioteca"
   - Buscar: "Google+ API" o "Google Identity"
   - Click en "Habilitar"

4. **Configurar pantalla de consentimiento OAuth**
   - Menú lateral: "APIs y servicios" → "Pantalla de consentimiento OAuth"
   - Tipo de usuario: "Externos" (para permitir cualquier cuenta de Google)
   - Completar información requerida:
     - Nombre de la aplicación: "AI Assistant v2"
     - Email de soporte
     - Dominios autorizados: tu-dominio.com
     - Email del desarrollador

5. **Crear credenciales OAuth 2.0**
   - Menú lateral: "APIs y servicios" → "Credenciales"
   - Click en "Crear credenciales" → "ID de cliente OAuth"
   - Tipo de aplicación: "Aplicación web"
   - Nombre: "AI Assistant Web Client"
   - Orígenes de JavaScript autorizados:
     ```
     http://localhost:3001
     http://localhost:5173
     https://tu-dominio.com
     ```
   - URIs de redirección autorizados:
     ```
     http://localhost:3001/api/auth/google/callback
     https://tu-dominio.com/api/auth/google/callback
     ```
   - Click en "Crear"

6. **Guardar las credenciales**
   - Copiar el `Client ID` y `Client Secret`
   - Guardarlos de forma segura

### 2. Configurar variables de entorno

1. **En desarrollo (local)**
   - Copiar `.env.example` a `.env`
   - Completar con tus credenciales:
   ```env
   GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=tu-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/auth/google/callback
   JWT_SECRET=genera-una-clave-segura-aqui
   ```

2. **En producción (Plesk)**
   - Ir a Node.js → Variables de entorno
   - Agregar las mismas variables con valores de producción:
   ```env
   GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=tu-client-secret
   GOOGLE_REDIRECT_URI=https://tu-dominio.com/api/auth/google/callback
   JWT_SECRET=clave-super-segura-para-produccion
   ```

### 3. Ejecutar el script SQL para crear tablas de usuarios

1. **Acceder a phpMyAdmin desde Plesk**
2. **Ejecutar el script `create_users_table.sql`**
   - Este script crea:
     - Tabla `users` para almacenar información de usuarios
     - Tabla `user_sessions` para gestionar sesiones
     - Actualiza tablas existentes para asociarlas con usuarios

### 4. Actualizar el frontend con el Client ID

1. **Crear archivo de configuración en frontend**
   ```javascript
   // frontend/src/config/google.js
   export const GOOGLE_CLIENT_ID = 'tu-client-id.apps.googleusercontent.com';
   ```

2. **O usar variable de entorno**
   ```javascript
   // En .env del frontend
   VITE_GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com
   ```

## 🔒 Seguridad

### Importantes consideraciones de seguridad:

1. **NUNCA subas credenciales a Git**
   - Asegúrate de que `.env` está en `.gitignore`
   - No hardcodees credenciales en el código

2. **Genera un JWT_SECRET fuerte**
   ```bash
   # Generar secret aleatorio
   openssl rand -base64 32
   ```

3. **En producción:**
   - Usa HTTPS siempre
   - Configura CORS correctamente
   - Limita los dominios autorizados en Google Console

4. **Rotación de credenciales**
   - Cambia el JWT_SECRET periódicamente
   - Regenera Client Secret si se compromete

## 🧪 Testing

### Para probar la autenticación:

1. **Verificar que el servidor tiene las variables:**
   ```bash
   # En el servidor
   console.log(process.env.GOOGLE_CLIENT_ID ? '✅ Google Client ID configurado' : '❌ Falta Google Client ID');
   ```

2. **Verificar endpoints:**
   ```bash
   # Health check
   curl http://localhost:3001/api/health

   # Después de implementar login, verificar:
   curl http://localhost:3001/api/auth/profile
   ```

## 📝 Flujo de autenticación

1. Usuario hace click en "Iniciar sesión con Google"
2. Google muestra pantalla de consentimiento
3. Usuario autoriza la aplicación
4. Google devuelve un token ID
5. Frontend envía token a `/api/auth/google`
6. Backend verifica token con Google
7. Backend crea/actualiza usuario en BD
8. Backend genera JWT y refresh token
9. Frontend guarda tokens y redirige a la app

## 🚨 Troubleshooting

### Error: "Token de Google inválido"
- Verificar que el Client ID es correcto
- Verificar que el dominio está autorizado en Google Console

### Error: "No se puede conectar a Google"
- Verificar que Google+ API está habilitada
- Verificar configuración de CORS

### Error: "JWT inválido"
- Verificar que JWT_SECRET es el mismo en todas las instancias
- Verificar que el token no ha expirado

### Error: "Usuario no encontrado"
- Verificar que las tablas de BD se crearon correctamente
- Verificar conexión a la base de datos

## 📚 Referencias

- [Google Identity Documentation](https://developers.google.com/identity/gsi/web)
- [OAuth 2.0 para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [JWT Documentation](https://jwt.io/introduction)

---
*Recuerda: La seguridad es primordial. Siempre usa HTTPS en producción y mantén tus credenciales seguras.*
# 📚 Flujo de Deploy con GitHub Actions

## 🎯 Resumen del Proceso
Este proyecto usa GitHub Actions para automatizar el deploy a Plesk. Cuando haces push a `main`, se activa un workflow que:
1. Compila el frontend
2. Crea/actualiza la rama `production` con los archivos compilados
3. Plesk detecta los cambios y despliega automáticamente

## 📝 Paso a Paso para Hacer Deploy

### 1. **Hacer los cambios necesarios**
```bash
# Editar los archivos que necesites
# Por ejemplo: routes/auth.cjs, frontend/src/App.jsx, etc.
```

### 2. **Actualizar la versión** (IMPORTANTE)
Actualiza la versión en 4 archivos para asegurar que el deploy se ejecute:

```bash
# package.json principal
"version": "3.22.0"  # Incrementar versión

# frontend/package.json
"version": "3.22.0"  # Misma versión

# FORCE_REBUILD.txt
Force rebuild for v3.22
Date: 2025-01-15 00:00
Changes: Descripción de los cambios

# frontend/src/components/LoginWithCalendar.jsx (opcional pero recomendado)
<h1>Asistente IA v3.22</h1>
```

### 3. **Compilar el frontend** (si hiciste cambios en React)
```bash
npm run build
```

### 4. **Verificar los cambios**
```bash
git status
git diff  # Para ver los cambios en detalle
```

### 5. **Agregar archivos al staging**
```bash
# Opción 1: Agregar todo
git add -A

# Opción 2: Agregar archivos específicos
git add routes/auth.cjs
git add frontend/src/components/LoginWithCalendar.jsx
git add package.json frontend/package.json FORCE_REBUILD.txt
```

### 6. **Hacer el commit**
Usa mensajes descriptivos siguiendo el formato conventional commits:

```bash
git commit -m "fix(v3.22): Descripción corta del cambio

- Detalle 1 del cambio
- Detalle 2 del cambio
- Detalle 3 del cambio

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Tipos de commit comunes:**
- `feat`: Nueva funcionalidad
- `fix`: Corrección de bug
- `chore`: Cambios de mantenimiento (actualizar versión, etc.)
- `docs`: Cambios en documentación
- `refactor`: Refactorización de código

### 7. **Push a GitHub**
```bash
git push origin main
```

### 8. **Verificar el workflow**
- Ve a GitHub → Actions
- Verifica que el workflow "Deploy to Production" esté corriendo
- Espera a que termine (usualmente 2-3 minutos)

## 🔄 Comando Todo-en-Uno

Para hacer todo el proceso de una vez (después de hacer los cambios):

```bash
# Actualizar versión, compilar, commit y push
npm run build && \
git add -A && \
git commit -m "chore(v3.22): Actualizar versión y descripción

- Cambio 1
- Cambio 2

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" && \
git push origin main
```

## 🌳 Estructura de Ramas

- **`main`**: Rama de desarrollo (NO incluye `frontend/dist`)
- **`production`**: Rama de producción (incluye `frontend/dist` compilado)
  - Esta rama es creada/actualizada automáticamente por GitHub Actions
  - Plesk está configurado para hacer pull desde esta rama

## ⚠️ Notas Importantes

1. **SIEMPRE actualiza la versión** - Esto asegura que Plesk detecte los cambios
2. **NO hagas push de `frontend/dist` a main** - Está en `.gitignore`
3. **El archivo `oauth-callback.html`** debe copiarse manualmente a `frontend/public` si se modifica
4. **Los logs en producción** se pueden ver en:
   - Panel de Plesk → Node.js → Logs
   - Archivo `oauth-debug.log` en el servidor
   - Archivo `calendar-operations.log` para operaciones de Calendar

## 🐛 Debugging

Si el deploy no funciona:

1. **Verifica GitHub Actions**
   ```bash
   # Ve a github.com/TuUsuario/TuRepo/actions
   # Revisa si hay errores en el workflow
   ```

2. **Verifica la versión**
   ```bash
   # Asegúrate de que incrementaste la versión en todos los archivos
   grep version package.json
   grep version frontend/package.json
   head -1 FORCE_REBUILD.txt
   ```

3. **Verifica Plesk**
   - Panel de Plesk → Git
   - Click en "Pull" manualmente si es necesario
   - Revisa los logs de Node.js

## 📊 Verificar el Deploy

Para confirmar que el deploy funcionó:

1. **Revisa la versión en producción**
   - Abre tu sitio
   - Deberías ver "Asistente IA vX.XX" en el login

2. **Revisa el endpoint de health**
   ```bash
   curl https://tu-dominio.com/api/health
   ```

3. **Revisa los logs**
   - En Plesk → Node.js → Logs
   - O busca `oauth-debug.log` en el servidor

## 🔒 Variables de Entorno

Asegúrate de que estas variables estén configuradas en Plesk:

```env
DB_HOST=localhost
DB_USER=tu_usuario
DB_NAME=tu_base_datos
DB_PASSWORD=tu_password
OPENAI_API_KEY=sk-...
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_REDIRECT_URI=https://tu-dominio.com/oauth-callback.html
JWT_SECRET=tu-secret-key
NODE_ENV=production
PORT=3001
```

## 📝 Ejemplo Completo

```bash
# 1. Hacer cambios
vi routes/auth.cjs

# 2. Actualizar versión a 3.23
vi package.json
vi frontend/package.json
vi FORCE_REBUILD.txt
vi frontend/src/components/LoginWithCalendar.jsx

# 3. Compilar
npm run build

# 4. Commit y push
git add -A
git commit -m "fix(v3.23): Corregir guardado de tokens OAuth

- Implementar módulo compartido para BD
- Asegurar que auth.cjs tenga acceso a la conexión
- Agregar logs detallados para debugging

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

git push origin main

# 5. Esperar 2-3 minutos y verificar en producción
```

---

*Última actualización: 15 de Enero 2025 - v3.21*
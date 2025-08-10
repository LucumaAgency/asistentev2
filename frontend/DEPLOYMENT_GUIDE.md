# 📚 Guía de Deployment - AI Assistant v2

## 🔄 Flujo de Trabajo Git + GitHub Actions + Plesk

### Arquitectura del Flujo
```
[Desarrollo Local] → [main] → [GitHub Actions] → [production] → [Plesk]
```

## ✅ Proceso Correcto de Commits

### 1. **Desarrollo en rama `main`**
```bash
# Siempre trabajar en main
git checkout main

# Hacer cambios y commit
git add .
git commit -m "feat: Descripción del cambio"
git push origin main
```

### 2. **GitHub Actions se encarga automáticamente de:**
- Detectar el push a `main`
- Construir el frontend (`npm run build`)
- Crear un commit con los archivos compilados
- Pushear a la rama `production`

### 3. **Plesk jala automáticamente de `production`**

## ⚠️ IMPORTANTE: Lo que NO debes hacer

### ❌ **NUNCA hacer push directo a `production`**
```bash
# MALO - No hagas esto
git checkout production
git push origin production
```
**Por qué:** Rompe el flujo automático y puede causar conflictos

### ❌ **NUNCA crear Pull Request de `production` a `main`**
- GitHub puede sugerir esto cuando ve diferencias
- Es normal que `production` tenga commits adicionales (los builds)
- Simplemente ignora estas sugerencias

### ❌ **NUNCA hacer merge de `production` hacia `main`**
```bash
# MALO - No hagas esto
git checkout main
git merge production
```
**Por qué:** `production` contiene archivos compilados que no deben estar en `main`

## 🔧 Solución de Problemas Comunes

### Problema 1: "Changes not appearing in production"
**Síntomas:** Los cambios están en GitHub pero no en el sitio web

**Solución:**
1. Verificar que GitHub Actions completó exitosamente
2. En Plesk, hacer pull manual o reiniciar la aplicación
3. Verificar que el servidor está sirviendo desde `/frontend/dist`

### Problema 2: "MIME type error"
**Síntomas:** 
```
Failed to load module script: Expected a JavaScript module script 
but the server responded with a MIME type of "text/html"
```

**Solución:**
1. Asegurar que existe el catch-all route en el servidor:
```javascript
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});
```
2. Verificar CSP headers incluyan Google Fonts si usas Montserrat

### Problema 3: "Database tables not created"
**Síntomas:** Las tablas `modes` y `chat_sessions` no existen

**Solución:**
1. Verificar variables de entorno en Plesk:
   - `DB_HOST`
   - `DB_USER`
   - `DB_NAME`
   - `DB_PASSWORD`
2. Reiniciar la aplicación Node.js en Plesk
3. Si falla, ejecutar manualmente `create_tables.sql` en phpMyAdmin

### Problema 4: "GitHub Actions failing"
**Síntomas:** El workflow falla con errores de git

**Causas y soluciones:**
- **"Your local changes would be overwritten"**: El workflow necesita `git checkout -f`
- **"Merge conflicts"**: Usar `--strategy=ours` en el merge
- **"pathspec did not match"**: Usar formato correcto para commit messages

## 📝 Formato de Commits Recomendado

```bash
# Funcionalidad nueva
git commit -m "feat: Descripción de la funcionalidad"

# Corrección de bugs
git commit -m "fix: Descripción del problema resuelto"

# Cambios en documentación
git commit -m "docs: Descripción del cambio"

# Refactorización
git commit -m "refactor: Descripción del cambio"

# Cambios de estilo (CSS, formato)
git commit -m "style: Descripción del cambio"
```

## 🚀 Checklist de Deployment

### Antes de hacer push a `main`:
- [ ] Ejecutar `npm run build` localmente para verificar que compila
- [ ] Probar la funcionalidad localmente
- [ ] Verificar que no hay `console.log` de debug
- [ ] Asegurar que las variables de entorno necesarias están documentadas

### Después de hacer push a `main`:
- [ ] Verificar que GitHub Actions se ejecutó exitosamente
- [ ] Esperar 1-2 minutos para que Plesk haga pull
- [ ] Verificar en producción que los cambios están visibles
- [ ] Si usa BD, verificar que las migraciones se ejecutaron

## 🗂️ Estructura del Proyecto

```
asistentev2/
├── frontend/
│   ├── src/           # Código fuente React
│   ├── dist/          # Build de producción (NO commitear manualmente)
│   └── package.json
├── server.js          # Servidor Express (ES6 modules)
├── server.cjs         # Servidor Express (CommonJS para Plesk)
├── .github/
│   └── workflows/
│       └── deploy.yml # GitHub Actions workflow
└── create_tables.sql  # Script de respaldo para crear tablas
```

## 🔐 Variables de Entorno Necesarias

### En Plesk (Variables de entorno de Node.js):
```
DB_HOST=localhost
DB_USER=tu_usuario
DB_NAME=tu_base_de_datos
DB_PASSWORD=tu_password
OPENAI_API_KEY=sk-...
PORT=3001
NODE_ENV=production
```

## 📊 Base de Datos

### Tablas principales:
- `conversations`: Almacena las sesiones de conversación
- `messages`: Almacena los mensajes de cada conversación
- `modes`: Almacena los modos personalizados con sus prompts
- `chat_sessions`: Organiza los chats por modo

### Si las tablas no se crean automáticamente:
1. Acceder a phpMyAdmin desde Plesk
2. Ejecutar el script `create_tables.sql`
3. Reiniciar la aplicación Node.js

## 🆘 Comandos Útiles de Emergencia

### Revisar el estado de las ramas:
```bash
git fetch --all
git log --oneline --graph --all -10
```

### Ver qué rama está desplegada en producción:
```bash
git log origin/production --oneline -5
```

### Forzar rebuild en GitHub Actions:
```bash
# Hacer un commit simbólico
git commit --allow-empty -m "chore: Trigger rebuild"
git push origin main
```

## 📞 Soporte

Si encuentras problemas no documentados aquí:
1. Revisar los logs de GitHub Actions
2. Revisar los logs de Node.js en Plesk
3. Verificar la consola del navegador para errores de JavaScript
4. Verificar que todas las variables de entorno están configuradas

---
*Última actualización: Después de resolver problemas de deployment y integración con BD*